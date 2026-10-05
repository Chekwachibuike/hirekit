/*
 * HireKit desktop shell — pure C, ~1MB, Electron-free.
 *
 * This is a real standalone app, NOT a "port viewer". It owns a private,
 * uncommon port (39847) that ordinary dev servers never touch, and it only
 * ever displays a server it has verified is HireKit itself — never whatever
 * else might happen to be listening.
 *
 * Architecture (the Tauri "sidecar" pattern, hand-rolled):
 *   1. If our private port is free, spawn `node server.js` (the Next.js
 *      standalone build) as a hidden child, forcing it onto OUR port via the
 *      PORT env var and binding to loopback (HOSTNAME=127.0.0.1, so Windows
 *      never shows a firewall prompt).
 *   2. If the port is already open, probe /api/health: only reuse it when it
 *      answers with the HireKit marker (a previous HireKit instance). Anything
 *      else on the port is treated as a conflict, not silently rendered.
 *   3. The spawned child is placed in a Win32 Job Object with
 *      JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE — if this shell exits or crashes for
 *      ANY reason, the OS kills the whole server process tree. No orphans.
 *   4. Poll until the server answers (or time out with a readable error).
 *   5. Open a native window backed by the SYSTEM WebView2 runtime (already on
 *      Windows 11 — we ship no browser).
 *   6. When the window closes, the Job Object handle closes → server dies.
 *
 * Rendering is done by webview/webview (github.com/webview/webview),
 * which has a built-in WebView2 loader, so no WebView2Loader.dll is
 * shipped either. Build with desktop/build.ps1.
 */

#include <winsock2.h>   /* must precede windows.h */
#include <windows.h>
#include <stdio.h>
#include <string.h>

#define WEBVIEW_STATIC  /* link against webview_impl.cc, not header-only */
#include "webview/webview.h"
#include "update.h"

/* ── Config ─────────────────────────────────────────────────────── */
#define APP_TITLE     "HireKit"
/* A private, uncommon port — deliberately NOT 3000 so the desktop app never
   collides with (or mirrors) `npm run dev`; both can run at the same time. */
#define SERVER_PORT   39847
#define SERVER_PORTS  "39847"                    /* string form for the env var */
#define APP_URL       "http://127.0.0.1:39847"
#define HEALTH_PATH   "/api/health"              /* public identity endpoint    */
#define HEALTH_MARKER "hirekit-desktop"          /* grepped from the response   */
/* Relative to the directory containing HireKit.exe (the project root): */
#define SERVER_DIR    ".next\\standalone"
#define SERVER_CMD    "node server.js"
#define WAIT_MS       60000   /* how long to wait for the server to come up */
#define WIN_W         1280
#define WIN_H         820

/* ── Port probe ─────────────────────────────────────────────────── */
static int port_is_open(unsigned short port) {
  SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (s == INVALID_SOCKET) return 0;

  struct sockaddr_in addr;
  ZeroMemory(&addr, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_port = htons(port);
  addr.sin_addr.s_addr = inet_addr("127.0.0.1");

  /* Short timeout so the startup poll stays responsive */
  DWORD tv = 500;
  setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char *)&tv, sizeof(tv));
  setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char *)&tv, sizeof(tv));

  int ok = connect(s, (struct sockaddr *)&addr, sizeof(addr)) == 0;
  closesocket(s);
  return ok;
}

/* ── Identity probe ─────────────────────────────────────────────── */
/* Confirms the server on `port` is actually HireKit by GETting the public
   /api/health endpoint and looking for HEALTH_MARKER in the response. This is
   what stops the shell from ever displaying a foreign app that merely happens
   to be listening. Returns 1 only for a verified HireKit server. */
static int server_is_hirekit(unsigned short port) {
  SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (s == INVALID_SOCKET) return 0;

  struct sockaddr_in addr;
  ZeroMemory(&addr, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_port = htons(port);
  addr.sin_addr.s_addr = inet_addr("127.0.0.1");

  DWORD tv = 2000;
  setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char *)&tv, sizeof(tv));
  setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char *)&tv, sizeof(tv));

  if (connect(s, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
    closesocket(s);
    return 0;
  }

  const char *req =
    "GET " HEALTH_PATH " HTTP/1.0\r\n"
    "Host: 127.0.0.1\r\n"
    "Connection: close\r\n"
    "\r\n";
  send(s, req, (int)strlen(req), 0);

  char buf[4096];
  int total = 0, n;
  while (total < (int)sizeof(buf) - 1 &&
         (n = recv(s, buf + total, (int)sizeof(buf) - 1 - total, 0)) > 0) {
    total += n;
  }
  closesocket(s);
  buf[total > 0 ? total : 0] = '\0';

  return total > 0 && strstr(buf, HEALTH_MARKER) != NULL;
}

/* ── Server child process ───────────────────────────────────────── */
static HANDLE g_job = NULL;

/* show_console: launch node with its own console window (live logs).
   Otherwise stdout+stderr are redirected to hirekit-server.log next to
   the exe — open it any time, or tail it live:
     Get-Content hirekit-server.log -Wait                              */
static int spawn_server(const char *exe_dir, int show_console) {
  char server_dir[MAX_PATH];
  snprintf(server_dir, sizeof(server_dir), "%s\\%s", exe_dir, SERVER_DIR);

  DWORD attrs = GetFileAttributesA(server_dir);
  if (attrs == INVALID_FILE_ATTRIBUTES || !(attrs & FILE_ATTRIBUTE_DIRECTORY)) {
    char msg[512];
    snprintf(msg, sizeof(msg),
             "Server build not found:\n%s\n\nRun desktop\\build.ps1 first.", server_dir);
    MessageBoxA(NULL, msg, APP_TITLE " — missing build", MB_ICONERROR | MB_OK);
    return 0;
  }

  /* Job object: child (and its children) die when the last handle to
     the job closes — i.e. when this process exits, however it exits. */
  g_job = CreateJobObjectA(NULL, NULL);
  if (g_job) {
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION jeli;
    ZeroMemory(&jeli, sizeof(jeli));
    jeli.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    SetInformationJobObject(g_job, JobObjectExtendedLimitInformation,
                            &jeli, sizeof(jeli));
  }

  STARTUPINFOA si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  ZeroMemory(&pi, sizeof(pi));
  si.cb = sizeof(si);

  HANDLE log = INVALID_HANDLE_VALUE;
  DWORD flags = CREATE_SUSPENDED;

  if (show_console) {
    /* Node gets its own console window — logs stream live. */
    flags |= CREATE_NEW_CONSOLE;
  } else {
    /* Hidden server: capture stdout+stderr into a log file. The handle
       must be inheritable for the child to write into it. */
    flags |= CREATE_NO_WINDOW;

    char log_path[MAX_PATH];
    snprintf(log_path, sizeof(log_path), "%s\\hirekit-server.log", exe_dir);

    SECURITY_ATTRIBUTES sa;
    ZeroMemory(&sa, sizeof(sa));
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    log = CreateFileA(log_path, GENERIC_WRITE,
                      FILE_SHARE_READ,          /* readable while running */
                      &sa, CREATE_ALWAYS,       /* fresh log each launch  */
                      FILE_ATTRIBUTE_NORMAL, NULL);
    if (log != INVALID_HANDLE_VALUE) {
      si.dwFlags = STARTF_USESTDHANDLES;
      si.hStdOutput = log;
      si.hStdError  = log;
      si.hStdInput  = NULL;
    }
  }

  char cmd[MAX_PATH]; /* CreateProcess may modify the buffer */
  snprintf(cmd, sizeof(cmd), "%s", SERVER_CMD);

  /* Force the Next.js standalone server onto OUR private port and bind it to
     loopback only. Set on this process's environment (child inherits it,
     since lpEnvironment below is NULL). Binding 127.0.0.1 instead of the
     standalone default 0.0.0.0 also avoids the Windows Firewall prompt. */
  SetEnvironmentVariableA("PORT", SERVER_PORTS);
  SetEnvironmentVariableA("HOSTNAME", "127.0.0.1");

  /* Tells the app it is running on a machine it owns, so features needing a
     persistent local process (WhatsApp) are offered. A hosted deployment has
     no such marker and hides them. */
  SetEnvironmentVariableA("HIREKIT_DESKTOP", "1");

  /* CREATE_SUSPENDED so we can attach the job BEFORE any code runs —
     otherwise a fast-forking child could escape the job. */
  BOOL ok = CreateProcessA(NULL, cmd, NULL, NULL,
                           log != INVALID_HANDLE_VALUE /* inherit handles */,
                           flags, NULL, server_dir, &si, &pi);
  if (log != INVALID_HANDLE_VALUE) CloseHandle(log); /* child holds its copy */

  if (!ok) {
    MessageBoxA(NULL,
                "Could not start the server.\n\nIs Node.js installed and on your PATH?",
                APP_TITLE " — node not found", MB_ICONERROR | MB_OK);
    return 0;
  }

  if (g_job) AssignProcessToJobObject(g_job, pi.hProcess);
  ResumeThread(pi.hThread);
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess); /* the job handle keeps control of its lifetime */
  return 1;
}

/* ── Entry ──────────────────────────────────────────────────────── */
int WINAPI WinMain(HINSTANCE hInst, HINSTANCE hPrev, LPSTR lpCmd, int nShow) {
  (void)hInst; (void)hPrev; (void)nShow;

  /* HireKit.exe --console  →  server logs stream in a console window.
     Default                →  logs written to hirekit-server.log.      */
  int show_console = lpCmd && strstr(lpCmd, "--console") != NULL;

  WSADATA wsa;
  WSAStartup(MAKEWORD(2, 2), &wsa);

  /* Resolve the directory this exe lives in (= project root) */
  char exe_dir[MAX_PATH];
  GetModuleFileNameA(NULL, exe_dir, MAX_PATH);
  char *slash = strrchr(exe_dir, '\\');
  if (slash) *slash = '\0';

  /* Swap in any payload staged by the previous run. Local and offline --
     safe at this point because the server has not been spawned yet, so
     nothing inside the folder is running or locked. */
  update_apply_staged(exe_dir);

  /* Decide how to get a HireKit server on our private port. */
  int spawned = 0;
  if (port_is_open(SERVER_PORT)) {
    /* Something already holds our port. Reuse it ONLY if it's a verified
       HireKit instance (e.g. the app is already running) — never render a
       stranger's server. Give a freshly-started sibling a moment to answer. */
    int hwaited = 0;
    while (!server_is_hirekit(SERVER_PORT) && hwaited < 4000) { Sleep(250); hwaited += 250; }

    if (!server_is_hirekit(SERVER_PORT)) {
      MessageBoxA(NULL,
                  "Port " SERVER_PORTS " is already in use by another application, "
                  "so HireKit cannot start its own server.\n\n"
                  "Close whatever is using that port and launch HireKit again.",
                  APP_TITLE " — port in use", MB_ICONERROR | MB_OK);
      WSACleanup();
      return 1;
    }
    /* Verified HireKit already running — reuse it, don't own its lifetime. */
  } else {
    if (!spawn_server(exe_dir, show_console)) { WSACleanup(); return 1; }
    spawned = 1;

    /* Wait for the port to accept connections… */
    int waited = 0;
    while (!port_is_open(SERVER_PORT) && waited < WAIT_MS) {
      Sleep(250);
      waited += 250;
    }
    if (waited >= WAIT_MS) {
      MessageBoxA(NULL,
                  "The server did not come up within 60 seconds.\n"
                  "Your machine may be low on memory — close some apps and try again.",
                  APP_TITLE " — startup timeout", MB_ICONERROR | MB_OK);
      if (g_job) CloseHandle(g_job); /* kills the stuck child */
      WSACleanup();
      return 1;
    }
    /* …then wait until it actually answers as HireKit (routes compiled/ready),
       so the window never opens on a half-initialised server. */
    int hwaited = 0;
    while (!server_is_hirekit(SERVER_PORT) && hwaited < 15000) { Sleep(250); hwaited += 250; }
  }

  /* Native window on the system WebView2 — no bundled browser. */
  webview_t w = webview_create(0 /* no devtools */, NULL);
  if (!w) {
    MessageBoxA(NULL,
                "Could not create a WebView2 window.\n"
                "Install the 'WebView2 Runtime' from Microsoft (preinstalled on Windows 11).",
                APP_TITLE " — WebView2 missing", MB_ICONERROR | MB_OK);
    if (spawned && g_job) CloseHandle(g_job);
    WSACleanup();
    return 1;
  }

  webview_set_title(w, APP_TITLE);
  webview_set_size(w, WIN_W, WIN_H, WEBVIEW_HINT_NONE);
  webview_navigate(w, APP_URL);

  /* Window is up; now look for the next update. Runs on its own thread so a
     slow or unreachable network never delays startup. Whatever it finds is
     staged for the next launch, never applied under a running server. */
  update_start_background(exe_dir);
  webview_run(w);      /* blocks until the window is closed */
  webview_destroy(w);

  /* Closing the job handle triggers KILL_ON_JOB_CLOSE → server tree dies. */
  if (spawned && g_job) CloseHandle(g_job);
  WSACleanup();
  return 0;
}
