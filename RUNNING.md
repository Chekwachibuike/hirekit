# Running HireKit

Everything you need to start, rebuild, auto-start and troubleshoot the app.

---

## 1. Quick start

**Double-click `HireKit.exe`** in this folder.

It opens a native window, starts a hidden Node server on a private port
(`39847`), and shuts the server down when you close the window.

To watch the server logs live while it runs:

```
HireKit.exe --console
```

### What must already be on the machine

| Requirement | Check | Notes |
|---|---|---|
| **Node.js** | `node --version` | Must be on `PATH`. The exe runs `node server.js`; without it you get "Is Node.js installed?" |
| **WebView2 Runtime** | — | Preinstalled on Windows 11. Only needed on older Windows. |
| **`.env.local`** | present in this folder | Holds Supabase/Groq keys. `build.ps1` copies it into the server folder. |

---

## 2. Start it automatically at login

**Option A — Startup folder (simplest)**

1. Press `Win + R`, type `shell:startup`, press Enter
2. Right-click `HireKit.exe` → **Copy**
3. In the Startup folder: right-click → **Paste shortcut**

It now launches every time you sign in. Delete the shortcut to stop.

**Option B — Task Scheduler (if you want a delay)**

Useful because launching at the exact moment of login competes with everything
else Windows is starting, and the server takes a few seconds to come up.

1. Open **Task Scheduler** → **Create Task**
2. **General:** name it `HireKit`, tick *Run only when user is logged on*
3. **Triggers:** New → *At log on* → tick **Delay task for: 30 seconds**
4. **Actions:** New → *Start a program* → browse to `HireKit.exe`
5. **Conditions:** untick *Start the task only if the computer is on AC power*
   (otherwise it won't start on battery)

**Note:** only one copy runs at a time. If HireKit is already running, a second
launch detects the healthy server on port 39847 and opens another window onto
it rather than starting a competing server.

---

## 3. The two ways to run

| | Command | Use when |
|---|---|---|
| **Desktop app** | double-click `HireKit.exe` | Normal daily use |
| **Browser (dev)** | `npm run dev` → http://localhost:3000 | Editing code, hot reload |

> [!WARNING]
> **`npm run dev` and `npm run build` delete the desktop build.**
>
> `next.config.js` only emits the standalone server when `DESKTOP_BUILD=1` is
> set, which only `build.ps1` does. Any ordinary Next build rewrites `.next/`
> *without* `standalone`, and the next launch of `HireKit.exe` fails with
> **"Server build not found."**
>
> Fix: run `desktop\build.ps1` again (section 4).
>
> To stop this happening at all, make standalone output unconditional in
> `next.config.js` — replace:
> ```js
> ...(process.env.DESKTOP_BUILD ? { output: 'standalone' } : {}),
> ```
> with:
> ```js
> output: 'standalone',
> ```

---

## 4. Rebuilding

After changing any code, rebuild before the desktop app reflects it:

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build.ps1
```

Takes a couple of minutes. **Close HireKit first** — a running server holds
files the build needs to overwrite.

Faster variant, when you only changed the C shell (`desktop\*.c`) and not the
web app:

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build.ps1 -SkipNext
```

The build needs `gcc` (MinGW) on `PATH`. If `gcc` fails with no output at all,
another toolchain's DLLs are shadowing it — `build.ps1` already puts the real
MinGW first, so run it via PowerShell rather than Git Bash.

---

## 5. Publishing an update

Only needed if you want other installs to update themselves.

```powershell
# 1. bump desktop\VERSION   (e.g. 1 -> 2)
# 2. build + package
powershell -ExecutionPolicy Bypass -File desktop\package.ps1
# 3. publish (package.ps1 prints the exact command)
gh release create v2 desktop\release\hirekit-payload-v2.zip `
                    desktop\release\latest.json --title v2 --notes "Payload update"
```

Clients apply it over two launches: the first downloads and stages it, the
second runs it.

**Currently inactive:** the repo is private, so the updater's request for
`releases/latest/download/latest.json` returns 404. It fails silently and the
app is unaffected. To switch it on, make the release artifacts publicly
reachable and point `MANIFEST_URL` in `desktop\update.c` at them.

---

## 6. Where things live

| Thing | Path |
|---|---|
| Server log | `hirekit-server.log` (next to the exe, fresh each launch) |
| Updater log | `hirekit-update.log` (next to the exe, appended) |
| Server + app build | `.next\standalone\` |
| Secrets | `.env.local` (root) — copied into `.next\standalone\` by the build |
| WhatsApp session | `%LOCALAPPDATA%\HireKit\wwebjs\` |
| Payload version | `.next\standalone\.hirekit-version` |

The WhatsApp session deliberately sits outside the project folder so rebuilds
and updates can't wipe it. Earlier it lived inside `.next\standalone`, which
meant every rebuild forced a fresh QR scan.

---

## 7. Connecting Google Calendar (one-time setup)

Google only redirects back to URIs you have registered in advance, so the app
cannot do this part for you.

1. Open **https://console.cloud.google.com/apis/credentials**
2. Check the project selector at the top — pick the project whose number is
   **`542046335843`** (that's the prefix of your `GOOGLE_CLIENT_ID`)
3. Under **OAuth 2.0 Client IDs**, click the client starting with
   `542046335843-`
4. Find **Authorized redirect URIs** → click **+ ADD URI** and paste these,
   one per entry:

   ```
   http://127.0.0.1:39847/api/calendar/google/callback
   http://localhost:3000/api/calendar/google/callback
   ```

5. Click **SAVE**, then wait a few minutes — Google takes a little while to
   propagate the change

Both URIs are needed because Google compares them as plain strings:
`localhost` and `127.0.0.1` are different values, and the port must match
exactly. The first is the desktop app, the second is `npm run dev`.

### Two gotchas on the consent screen

Open **APIs & Services → OAuth consent screen**:

- **If Publishing status is "Testing"**, your own Google account must be listed
  under **Test users**, or consent fails with `access_denied`.
- **Testing mode also expires refresh tokens after 7 days**, so the calendar
  silently disconnects roughly weekly. If you want it to stay connected, set
  Publishing status to **In production**. Since `calendar.events` is a
  sensitive scope you'll see an "unverified app" warning on the consent screen
  — click *Advanced → Go to HireKit* to continue. Verification is only required
  to serve other people at scale, not for your own account.

### Checking it worked

Click **Connect** on the Calendar page. You should land back on the calendar
with `?google_connected=1` in the URL. If you get `redirect_uri_mismatch`,
Google will name the URI it received — compare it character by character with
what you registered.

---

## 8. Troubleshooting

**"Server build not found"**
The standalone build is missing — almost always because a plain `npm run dev`
or `npm run build` wiped it. Re-run `desktop\build.ps1` (section 4).

**"Port 39847 is already in use by another application"**
Something that isn't HireKit holds the port. The app refuses to display a
server it can't verify, rather than showing you a stranger's page. Find it:

```powershell
Get-NetTCPConnection -LocalPort 39847 -State Listen |
  ForEach-Object { Get-Process -Id $_.OwningProcess }
```

**Window opens blank / "server did not come up"**
Check `hirekit-server.log`. Usually memory pressure — WhatsApp Web is heavy.
Close some tabs and relaunch.

**WhatsApp won't connect**
It now clears leftover browsers automatically before connecting, so just click
**Connect** again. If it still fails, check for stray browsers holding the
profile:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -match 'HireKit' } |
  Select-Object ProcessId, CreationDate
```

Kill only those — your normal Edge windows are unrelated.

**Data is empty after signing in**
The Supabase migrations may not be applied. Run `supabase\migrations\001`
through `006` in the Supabase SQL editor.

**Checking it's alive**

```powershell
Invoke-WebRequest http://127.0.0.1:39847/api/health -UseBasicParsing
# {"app":"hirekit-desktop","ok":true,"version":1}
```
