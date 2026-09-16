/*
 * HireKit payload updater. See update.h for the model.
 *
 * Trust anchor: HTTPS to the manifest host. The manifest carries a SHA-256
 * of the payload, verified while streaming to disk, so a corrupted or
 * truncated download can never be staged. Whoever controls the release URL
 * controls what code this machine runs -- the same trust model as any
 * auto-updater, and the reason the manifest is fetched over TLS only.
 *
 * Extraction uses the bsdtar shipped in System32 (Windows 10 1803+), which
 * reads zip and rejects "../" traversal, so no zip library is vendored.
 */

#include <winsock2.h>
#include <windows.h>
#include <winhttp.h>
#include <bcrypt.h>
#include <shellapi.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <stdlib.h>

#include "update.h"

/* -- Config ------------------------------------------------------ */
#define MANIFEST_URL \
  "https://github.com/Chekwachibuike/hirekit/releases/latest/download/latest.json"

#define VERSION_FILE  ".hirekit-version"   /* inside the payload folder */
#define MAX_MANIFEST  8192
#define MAX_PAYLOAD   (512u * 1024u * 1024u)
#define CHUNK         65536

/* State that lives INSIDE the payload folder but must survive a swap:
   secrets written by build.ps1, and the WhatsApp session (whatsapp-web.js
   LocalAuth has no dataPath, so it lands in the server's cwd). */
static const char *PRESERVE[] = { ".env.local", ".wwebjs_auth", ".wwebjs_cache" };
#define PRESERVE_N (sizeof(PRESERVE) / sizeof(PRESERVE[0]))

/* -- Paths ------------------------------------------------------- */
static void ulog(const char *fmt, ...);   /* defined below */

static char P_CUR[MAX_PATH], P_NEW[MAX_PATH], P_TMP[MAX_PATH], P_OLD[MAX_PATH];
static char P_ZIP[MAX_PATH], P_PART[MAX_PATH], P_LOG[MAX_PATH];
static int  G_PATHS_OK = 0;

/* Join, with an explicit truncation check. Truncation is not cosmetic here:
   a silently shortened path ends up in rm_rf, which deletes whole trees. If
   anything does not fit, updating is disabled for the rest of the run. */
static int jpath(char *dst, const char *dir, const char *leaf) {
  int n = snprintf(dst, MAX_PATH, "%s\\%s", dir, leaf);
  return n > 0 && n < MAX_PATH;
}

static int paths_init(const char *exe_dir) {
  /* Log path first, so a failure below can still be recorded. */
  if (!jpath(P_LOG, exe_dir, "hirekit-update.log")) { G_PATHS_OK = 0; return 0; }

  G_PATHS_OK =
    jpath(P_CUR,  exe_dir, ".next\\standalone")          &&
    jpath(P_NEW,  exe_dir, ".next\\standalone.new")      &&
    jpath(P_TMP,  exe_dir, ".next\\standalone.tmp")      &&
    jpath(P_OLD,  exe_dir, ".next\\standalone.old")      &&
    jpath(P_ZIP,  exe_dir, ".next\\hirekit-update.zip")  &&
    jpath(P_PART, exe_dir, ".next\\hirekit-update.part");

  if (!G_PATHS_OK) ulog("update: install path too long, updater disabled");
  return G_PATHS_OK;
}

/* -- Logging ----------------------------------------------------- */
/* Updates run with no UI, so leave a breadcrumb trail instead. */
static void ulog(const char *fmt, ...) {
  FILE *f = fopen(P_LOG, "a");
  if (!f) return;

  SYSTEMTIME st;
  GetLocalTime(&st);
  fprintf(f, "[%04d-%02d-%02d %02d:%02d:%02d] ",
          st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);

  va_list ap;
  va_start(ap, fmt);
  vfprintf(f, fmt, ap);
  va_end(ap);

  fputc('\n', f);
  fclose(f);
}

/* -- Small filesystem helpers ------------------------------------ */
static int path_exists(const char *p) {
  return GetFileAttributesA(p) != INVALID_FILE_ATTRIBUTES;
}

static int is_dir(const char *p) {
  DWORD a = GetFileAttributesA(p);
  return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}

/* SHFileOperation needs double-NUL-terminated path lists. */
static int shell_op(UINT func, const char *from, const char *to) {
  char f[MAX_PATH + 2], t[MAX_PATH + 2];
  ZeroMemory(f, sizeof(f));
  ZeroMemory(t, sizeof(t));
  lstrcpynA(f, from, MAX_PATH);
  if (to) lstrcpynA(t, to, MAX_PATH);

  SHFILEOPSTRUCTA op;
  ZeroMemory(&op, sizeof(op));
  op.wFunc  = func;
  op.pFrom  = f;
  op.pTo    = to ? t : NULL;
  op.fFlags = FOF_NO_UI | FOF_NOCONFIRMMKDIR;
  return SHFileOperationA(&op) == 0;
}

static void rm_rf(const char *p) {
  if (path_exists(p)) shell_op(FO_DELETE, p, NULL);
}

static int read_int_file(const char *path, int *out) {
  FILE *f = fopen(path, "rb");
  if (!f) return 0;

  char buf[32];
  size_t n = fread(buf, 1, sizeof(buf) - 1, f);
  fclose(f);
  if (n == 0) return 0;

  buf[n] = '\0';
  *out = atoi(buf);
  return 1;
}

static int payload_version(const char *payload_dir) {
  char vf[MAX_PATH];
  int v = 0;
  if (!jpath(vf, payload_dir, VERSION_FILE)) return 0;
  if (!read_int_file(vf, &v)) return 0;   /* unversioned build == 0 */
  return v;
}

/* -- JSON micro-reader ------------------------------------------- */
/* The manifest has exactly three flat keys; a real parser would be more
   code than the thing it parses. Anything unexpected -> fail closed. */
static const char *json_find(const char *json, const char *key) {
  char pat[64];
  snprintf(pat, sizeof(pat), "\"%s\"", key);

  const char *p = strstr(json, pat);
  if (!p) return NULL;
  p += strlen(pat);

  while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
  if (*p != ':') return NULL;
  p++;
  while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
  return p;
}

static int json_str(const char *json, const char *key, char *out, size_t outsz) {
  const char *p = json_find(json, key);
  if (!p || *p != '"') return 0;
  p++;

  size_t i = 0;
  while (*p && *p != '"' && i + 1 < outsz) out[i++] = *p++;
  out[i] = '\0';
  return *p == '"' && i > 0;
}

static int json_int(const char *json, const char *key, int *out) {
  const char *p = json_find(json, key);
  if (!p || *p < '0' || *p > '9') return 0;
  *out = atoi(p);
  return 1;
}

/* -- HTTPS ------------------------------------------------------- */
typedef struct { HINTERNET ses, con, req; } http_t;

static void http_close(http_t *h) {
  if (h->req) WinHttpCloseHandle(h->req);
  if (h->con) WinHttpCloseHandle(h->con);
  if (h->ses) WinHttpCloseHandle(h->ses);
  ZeroMemory(h, sizeof(*h));
}

/* Opens url and sends the request. TLS only -- a plain-http manifest would
   let anyone on the network path choose what we install. */
static int http_begin(const char *url, http_t *h) {
  ZeroMemory(h, sizeof(*h));

  wchar_t wurl[2048];
  if (MultiByteToWideChar(CP_UTF8, 0, url, -1, wurl, 2048) == 0) return 0;

  wchar_t host[256], path[1536], extra[512];
  URL_COMPONENTS uc;
  ZeroMemory(&uc, sizeof(uc));
  uc.dwStructSize  = sizeof(uc);
  uc.lpszHostName  = host;  uc.dwHostNameLength  = 256;
  uc.lpszUrlPath   = path;  uc.dwUrlPathLength   = 1536;
  uc.lpszExtraInfo = extra; uc.dwExtraInfoLength = 512;

  if (!WinHttpCrackUrl(wurl, 0, 0, &uc)) return 0;
  if (uc.nScheme != INTERNET_SCHEME_HTTPS) return 0;

  wchar_t full[2048];
  _snwprintf(full, 2048, L"%s%s", path, extra);
  full[2047] = L'\0';

  h->ses = WinHttpOpen(L"HireKit-Updater/1.0",
                       WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                       WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!h->ses) return 0;

  /* resolve, connect, send, receive */
  WinHttpSetTimeouts(h->ses, 8000, 8000, 20000, 60000);

  h->con = WinHttpConnect(h->ses, host, uc.nPort, 0);
  if (!h->con) { http_close(h); return 0; }

  h->req = WinHttpOpenRequest(h->con, L"GET", full, NULL,
                              WINHTTP_NO_REFERER,
                              WINHTTP_DEFAULT_ACCEPT_TYPES,
                              WINHTTP_FLAG_SECURE);
  if (!h->req) { http_close(h); return 0; }

  if (!WinHttpSendRequest(h->req, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                          WINHTTP_NO_REQUEST_DATA, 0, 0, 0) ||
      !WinHttpReceiveResponse(h->req, NULL)) {
    http_close(h);
    return 0;
  }

  DWORD status = 0, len = sizeof(status);
  if (!WinHttpQueryHeaders(h->req,
                           WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                           WINHTTP_HEADER_NAME_BY_INDEX, &status, &len,
                           WINHTTP_NO_HEADER_INDEX) || status != 200) {
    ulog("http: status %lu", (unsigned long)status);
    http_close(h);
    return 0;
  }
  return 1;
}

static int http_get_mem(const char *url, char *out, DWORD outsz) {
  http_t h;
  if (!http_begin(url, &h)) return 0;

  DWORD total = 0, got = 0;
  while (total + 1 < outsz &&
         WinHttpReadData(h.req, out + total, outsz - total - 1, &got) && got > 0) {
    total += got;
  }
  out[total] = '\0';
  http_close(&h);
  return total > 0;
}

/* Streams url to dest while hashing, then compares against want_sha (hex).
   The hash covers exactly the bytes written, so a truncated transfer fails
   verification instead of staging half a payload. */
static int http_get_file_verified(const char *url, const char *dest,
                                  const char *want_sha) {
  http_t h;
  BCRYPT_ALG_HANDLE alg = NULL;
  BCRYPT_HASH_HANDLE hash = NULL;
  unsigned char *obj = NULL;
  unsigned char *buf = NULL;
  unsigned char digest[32];
  char hex[65];
  FILE *f = NULL;
  DWORD objlen = 0, cb = 0, got = 0;
  unsigned total = 0;
  int io_ok = 1;
  int ok = 0;
  int i;

  if (!http_begin(url, &h)) return 0;

  if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, NULL, 0) != 0)
    goto done;
  if (BCryptGetProperty(alg, BCRYPT_OBJECT_LENGTH, (PUCHAR)&objlen,
                        sizeof(objlen), &cb, 0) != 0)
    goto done;

  obj = (unsigned char *)malloc(objlen);
  if (!obj) goto done;
  if (BCryptCreateHash(alg, &hash, obj, objlen, NULL, 0, 0) != 0) goto done;

  buf = (unsigned char *)malloc(CHUNK);
  if (!buf) goto done;

  f = fopen(dest, "wb");
  if (!f) goto done;

  while (WinHttpReadData(h.req, buf, CHUNK, &got) && got > 0) {
    total += got;
    if (total > MAX_PAYLOAD) { io_ok = 0; ulog("update: payload too large"); break; }
    if (fwrite(buf, 1, got, f) != got) { io_ok = 0; break; }
    if (BCryptHashData(hash, buf, got, 0) != 0) { io_ok = 0; break; }
  }

  fclose(f);
  f = NULL;
  if (!io_ok || total == 0) goto done;

  if (BCryptFinishHash(hash, digest, sizeof(digest), 0) != 0) goto done;
  for (i = 0; i < 32; i++) snprintf(hex + i * 2, 3, "%02x", digest[i]);
  hex[64] = '\0';

  if (_stricmp(hex, want_sha) != 0) {
    ulog("update: sha256 mismatch (got %s)", hex);
    goto done;
  }
  ok = 1;

done:
  if (f) fclose(f);
  free(buf);
  if (hash) BCryptDestroyHash(hash);
  if (alg)  BCryptCloseAlgorithmProvider(alg, 0);
  free(obj);
  http_close(&h);
  if (!ok) DeleteFileA(dest);
  return ok;
}

/* -- Extraction -------------------------------------------------- */
/* System32\tar.exe (bsdtar) reads zip and refuses traversal paths. */
static int extract_zip(const char *zip, const char *dest_dir) {
  char sys[MAX_PATH], tar[MAX_PATH], cmd[MAX_PATH * 3];
  STARTUPINFOA si;
  PROCESS_INFORMATION pi;
  DWORD code = 1;

  if (!GetSystemDirectoryA(sys, MAX_PATH)) return 0;
  if (!jpath(tar, sys, "tar.exe")) return 0;
  if (!path_exists(tar)) { ulog("update: tar.exe not found"); return 0; }

  if (!CreateDirectoryA(dest_dir, NULL) &&
      GetLastError() != ERROR_ALREADY_EXISTS) return 0;

  if (snprintf(cmd, sizeof(cmd), "\"%s\" -xf \"%s\" -C \"%s\"",
               tar, zip, dest_dir) >= (int)sizeof(cmd)) return 0;

  ZeroMemory(&si, sizeof(si));
  ZeroMemory(&pi, sizeof(pi));
  si.cb = sizeof(si);

  if (!CreateProcessA(NULL, cmd, NULL, NULL, FALSE,
                      CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
    ulog("update: could not run tar");
    return 0;
  }

  WaitForSingleObject(pi.hProcess, 300000);
  GetExitCodeProcess(pi.hProcess, &code);
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);

  if (code != 0) ulog("update: tar exited %lu", (unsigned long)code);
  return code == 0;
}

/* -- Staged-payload swap ----------------------------------------- */
int update_apply_staged(const char *exe_dir) {
  char probe[MAX_PATH];
  size_t i;

  if (!paths_init(exe_dir)) return 0;

  /* Recover from a crash between the two renames below. */
  if (!path_exists(P_CUR) && is_dir(P_OLD)) {
    ulog("update: recovering payload from .old");
    MoveFileA(P_OLD, P_CUR);
  }
  rm_rf(P_OLD);
  rm_rf(P_TMP);

  if (!is_dir(P_NEW)) return 0;

  /* A staged payload with no server.js is junk -- discard it. */
  if (!jpath(probe, P_NEW, "server.js")) return 0;
  if (!path_exists(probe)) {
    ulog("update: staged payload incomplete, discarding");
    rm_rf(P_NEW);
    return 0;
  }

  /* Carry local state across. .env.local is deliberately NOT in the payload
     (it holds secrets and must never be published), so losing it here would
     leave the new server with no credentials at all. */
  for (i = 0; i < PRESERVE_N; i++) {
    char src[MAX_PATH], dst[MAX_PATH];
    if (!jpath(src, P_CUR, PRESERVE[i]) || !jpath(dst, P_NEW, PRESERVE[i])) continue;
    if (!path_exists(src) || path_exists(dst)) continue;
    if (!shell_op(FO_COPY, src, dst))
      ulog("update: WARNING could not preserve %s", PRESERVE[i]);
  }

  if (is_dir(P_CUR) && !MoveFileA(P_CUR, P_OLD)) {
    ulog("update: could not move current payload aside (%lu)",
         (unsigned long)GetLastError());
    return 0;
  }
  if (!MoveFileA(P_NEW, P_CUR)) {
    ulog("update: promote failed, rolling back");
    MoveFileA(P_OLD, P_CUR);          /* put the working version back */
    return 0;
  }
  rm_rf(P_OLD);

  ulog("update: applied payload v%d", payload_version(P_CUR));
  return 1;
}

/* -- Background check / download / stage -------------------------- */
static DWORD WINAPI update_worker(LPVOID param) {
  char manifest[MAX_MANIFEST];
  char url[1024], sha[128], probe[MAX_PATH];
  int remote = 0, local = 0;

  (void)param;

  if (!G_PATHS_OK) return 0;
  if (is_dir(P_NEW)) return 0;        /* already staged; applies next launch */

  if (!http_get_mem(MANIFEST_URL, manifest, sizeof(manifest))) return 0;

  if (!json_int(manifest, "version", &remote) ||
      !json_str(manifest, "url", url, sizeof(url)) ||
      !json_str(manifest, "sha256", sha, sizeof(sha))) {
    ulog("update: malformed manifest");
    return 0;
  }
  if (strlen(sha) != 64) {
    ulog("update: bad sha length");
    return 0;
  }
  if (strncmp(url, "https://", 8) != 0) {
    ulog("update: refusing non-https payload url");
    return 0;
  }

  local = payload_version(P_CUR);
  if (remote <= local) return 0;

  ulog("update: v%d available (have v%d), downloading", remote, local);

  DeleteFileA(P_PART);
  if (!http_get_file_verified(url, P_PART, sha)) return 0;

  DeleteFileA(P_ZIP);
  if (!MoveFileA(P_PART, P_ZIP)) return 0;

  rm_rf(P_TMP);
  if (!extract_zip(P_ZIP, P_TMP)) { rm_rf(P_TMP); DeleteFileA(P_ZIP); return 0; }
  DeleteFileA(P_ZIP);

  /* Only promote to .new once the tree looks complete -- update_apply_staged
     trusts whatever is sitting at that path. */
  if (!jpath(probe, P_TMP, "server.js")) { rm_rf(P_TMP); return 0; }
  if (!path_exists(probe)) {
    ulog("update: extracted tree has no server.js at top level");
    rm_rf(P_TMP);
    return 0;
  }
  if (!MoveFileA(P_TMP, P_NEW)) { rm_rf(P_TMP); return 0; }

  ulog("update: v%d staged, will apply on next launch", remote);
  return 0;
}

void update_start_background(const char *exe_dir) {
  HANDLE t;
  if (!paths_init(exe_dir)) return;
  t = CreateThread(NULL, 0, update_worker, NULL, 0, NULL);
  if (t) CloseHandle(t);
}
