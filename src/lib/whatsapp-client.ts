// Singleton WhatsApp client — persists across hot-reloads in dev via globalThis.
// Only runs server-side (API routes). Never import in Client Components.

export interface WaMessage {
  id: string
  from: string
  body: string
  timestamp: number
  chatName: string
}

declare global {
  // eslint-disable-next-line no-var
  var _waClient: import('whatsapp-web.js').Client | undefined
  // eslint-disable-next-line no-var
  var _waQr: string | undefined
  // eslint-disable-next-line no-var
  var _waReady: boolean
  // eslint-disable-next-line no-var
  var _waMessages: WaMessage[]
  // eslint-disable-next-line no-var
  var _waError: string | undefined
  // eslint-disable-next-line no-var
  var _waHooked: boolean | undefined
}

// LocalAuth stores its Chromium profile at <cwd>/.wwebjs_auth/session-<clientId>.
// Derived from cwd rather than hardcoded because cwd differs between `next dev`
// (project root) and the desktop build (.next/standalone).
// Session lives in LOCALAPPDATA, not under the app directory, so builds and
// updates cannot wipe it. path.join because the reaper matches this against
// the browser's command line (native backslashes).
const WA_CLIENT_ID = 'hirekit'

async function dataRoot() {
  const path = await import('path')
  const os = await import('os')
  return path.join(process.env.LOCALAPPDATA || os.homedir(), 'HireKit', 'wwebjs')
}

async function sessionDir() {
  const path = await import('path')
  return path.join(await dataRoot(), `session-${WA_CLIENT_ID}`)
}

// ── Stale-session reaper ──────────────────────────────────────────
// A crashed or force-killed run leaves Chromium holding the profile, and every
// later Connect then fails. initWaClient() returns early when a client exists,
// so anything holding OUR profile path here is stale by definition. Matching on
// that path keeps this off the user's real browser windows.
const REAP_SCRIPT = `
$p = $env:HK_WA_PROFILE
$all = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe' }
$seed = $all | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($p) }
if (-not $seed) { exit 0 }
$ids = @{}
function Walk($i) {
  if ($ids.ContainsKey($i)) { return }
  $ids[$i] = $true
  $all | Where-Object { $_.ParentProcessId -eq $i } | ForEach-Object { Walk $_.ProcessId }
}
foreach ($s in $seed) { Walk $s.ProcessId }
foreach ($i in $ids.Keys) { Stop-Process -Id $i -Force -ErrorAction SilentlyContinue }
Write-Output $ids.Count
`

async function reapStaleSession(): Promise<void> {
  const dir = await sessionDir()

  if (process.platform === 'win32') {
    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const run = promisify(execFile)
      // -EncodedCommand: -Command re-parses and mangles the script's quoting.
      const encoded = Buffer.from(REAP_SCRIPT, 'utf16le').toString('base64')
      const { stdout } = await run(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        { env: { ...process.env, HK_WA_PROFILE: dir }, timeout: 20000 },
      )
      const n = parseInt(stdout.trim(), 10)
      if (n > 0) console.log(`[whatsapp] reaped ${n} leftover browser process(es)`)
    } catch (err) {
      // Best effort — if the reaper fails we still try to launch, and the
      // user just gets the old error instead of a silent hang.
      console.error('[whatsapp] stale-session reap failed', err)
    }
  }

  // Stale locks from an abrupt exit; nothing holds the dir now.
  try {
    const { rm } = await import('fs/promises')
    const path = await import('path')
    // 'lockfile' is the one Edge leaves on Windows; Singleton* are POSIX.
    for (const f of ['DevToolsActivePort', 'lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      await rm(path.join(dir, f), { force: true })
    }
  } catch { /* profile may not exist yet on first connect */ }
}

// Tidiness only — 'exit' cannot await and a force-kill runs no handler.
// reapStaleSession() is the actual guarantee.
function registerShutdownHooks() {
  if (globalThis._waHooked) return
  globalThis._waHooked = true

  const bye = async () => {
    try { await globalThis._waClient?.destroy() } catch { /* already gone */ }
  }
  process.once('SIGINT', async () => { await bye(); process.exit(0) })
  process.once('SIGTERM', async () => { await bye(); process.exit(0) })
  process.once('beforeExit', bye)
}

export function getWaStatus() {
  return {
    ready: globalThis._waReady ?? false,
    qr: globalThis._waQr ?? null,
    messageCount: (globalThis._waMessages ?? []).length,
    error: globalThis._waError ?? null,
  }
}

export function getWaMessages(): WaMessage[] {
  return globalThis._waMessages ?? []
}

// puppeteer (a transitive dep of whatsapp-web.js) skips its own ~300MB
// Chromium download (see .puppeteerrc.cjs) — reuse a browser already on the
// machine instead. Add more candidate paths here if you're not on Windows.
const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

async function findSystemBrowser(): Promise<string | undefined> {
  const { existsSync } = await import('fs')
  return BROWSER_CANDIDATES.find(existsSync)
}

export async function initWaClient() {
  if (globalThis._waClient) return

  // Dynamic imports so Next.js doesn't bundle these at build time
  const { Client, LocalAuth } = await import('whatsapp-web.js')
  const executablePath = await findSystemBrowser()
  if (!executablePath) {
    globalThis._waError =
      'No system browser found for WhatsApp automation. Install Microsoft Edge or Google Chrome, ' +
      'or set skipDownload to false in .puppeteerrc.cjs and run npm install to fetch a private Chromium.'
    throw new Error(globalThis._waError)
  }

  globalThis._waReady = false
  globalThis._waQr = undefined
  globalThis._waMessages = []
  globalThis._waError = undefined

  // Clear anything still holding our profile from a previous run BEFORE we try
  // to open it, so a crashed session can never block the next Connect.
  await reapStaleSession()
  registerShutdownHooks()
  startClient(Client, LocalAuth, executablePath, await dataRoot(), 1)
}

// Edge exits with code 0 and no stderr ("Failed to launch the browser process:
// Code: 0") when it hands the launch off instead of starting: mid self-update
// (two versions side by side under Application\), or a profile lock the first
// reap missed. Both clear within seconds, so retry before surfacing an error.
const MAX_LAUNCH_ATTEMPTS = 3

function startClient(
  Client: typeof import('whatsapp-web.js').Client,
  LocalAuth: typeof import('whatsapp-web.js').LocalAuth,
  executablePath: string,
  dataPath: string,
  attempt: number,
) {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: WA_CLIENT_ID, dataPath }),
    puppeteer: {
      headless: true,
      executablePath,
      // WhatsApp Web is heavy; on a memory-pressured machine it can exceed
      // puppeteer's default 180s protocol timeout ("Runtime.callFunctionOn
      // timed out"). Give it 5 minutes and trim browser overhead.
      protocolTimeout: 300000,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--disable-extensions', '--mute-audio',
        // Memory diet: don't render images at all (we only read message
        // text), and cap the JS heap so WA Web's memory leaks can't grow
        // unbounded. Together these cut the browser's footprint noticeably.
        '--blink-settings=imagesEnabled=false',
        '--js-flags=--max-old-space-size=256',
      ],
    },
  })

  // Block heavyweight network resources inside the WhatsApp browser.
  // Message events arrive over the WebSocket, so aborting images, media,
  // and fonts loses nothing we use — profile pictures and voice notes just
  // never download. Standard practice for headless-browser automation.
  let resourceBlockingAttached = false
  async function attachResourceBlocking() {
    if (resourceBlockingAttached) return
    const page = client.pupPage
    if (!page) return
    resourceBlockingAttached = true
    try {
      await page.setRequestInterception(true)
      page.on('request', req => {
        const type = req.resourceType()
        if (type === 'image' || type === 'media' || type === 'font') {
          req.abort().catch(() => {})
        } else {
          req.continue().catch(() => {})
        }
      })
    } catch (err) {
      console.error('[whatsapp] resource blocking unavailable', err)
    }
  }

  client.on('qr', (qr: string) => {
    globalThis._waQr = qr
    globalThis._waReady = false
    globalThis._waError = undefined
    attachResourceBlocking()
  })

  client.on('ready', () => {
    globalThis._waReady = true
    globalThis._waQr = undefined
    console.log('[whatsapp] Client ready')
    attachResourceBlocking()
  })

  client.on('message', async (msg: import('whatsapp-web.js').Message) => {
    const chat = await msg.getChat()
    const entry: WaMessage = {
      id: msg.id._serialized,
      from: msg.from,
      body: msg.body,
      timestamp: msg.timestamp,
      chatName: chat.name || msg.from,
    }
    globalThis._waMessages = [entry, ...(globalThis._waMessages ?? [])].slice(0, 100)
  })

  client.on('disconnected', () => {
    globalThis._waReady = false
    globalThis._waClient = undefined
    console.log('[whatsapp] Disconnected')
  })

  // Not awaited by design — initialize() resolves only once the QR is
  // scanned and the session is ready, which would block the API route that
  // calls initWaClient(). Must still catch rejections (e.g. Puppeteer/Chromium
  // failing to launch) or they become an unhandled rejection that can crash
  // the whole Next.js server process, not just this feature.
  client.initialize().catch(async (err: unknown) => {
    console.error('[whatsapp] initialize failed', err)
    const msg = err instanceof Error ? err.message : String(err)
    const launchFailed = msg.includes('Failed to launch the browser process') || msg.includes('already running')
    if (launchFailed && attempt < MAX_LAUNCH_ATTEMPTS) {
      // Keep _waClient set while retrying so a Connect click in the meantime
      // doesn't start a second browser on the same profile.
      try { await client.destroy() } catch { /* never started */ }
      await new Promise(r => setTimeout(r, 2000 * attempt))
      await reapStaleSession()
      console.log(`[whatsapp] retrying launch (attempt ${attempt + 1}/${MAX_LAUNCH_ATTEMPTS})`)
      startClient(Client, LocalAuth, executablePath, dataPath, attempt + 1)
      return
    }
    // Translate the common failure modes into something actionable
    globalThis._waError = msg.includes('Failed to launch the browser process')
      ? 'Microsoft Edge refused to start for WhatsApp after several tries. This usually ' +
        'means Edge is installing an update — open Edge once (or restart the PC) to let ' +
        'it finish, then click Connect again.'
      : msg.includes('already running')
      ? 'A leftover browser session is holding the WhatsApp profile and could not be ' +
        'cleared automatically. Click Connect once more — if it still fails, the profile ' +
        'may be owned by another user account on this PC.'
      : msg.includes('timed out')
      ? 'WhatsApp Web took too long to load (your machine may be low on memory). ' +
        'Close some other apps or browser tabs and click Connect again.'
      : `WhatsApp failed to start: ${msg}`
    globalThis._waReady = false
    globalThis._waClient = undefined
    // Kill the half-started browser, or it keeps the session locked and the
    // NEXT connect attempt fails with "browser is already running".
    try { await client.destroy() } catch { /* browser may never have started */ }
    // destroy() cannot clean up a browser it never attached to, so reap again:
    // otherwise one failed launch poisons every attempt after it.
    await reapStaleSession()
  })
  globalThis._waClient = client
}

export async function disconnectWaClient() {
  if (globalThis._waClient) {
    await globalThis._waClient.destroy()
    globalThis._waClient = undefined
    globalThis._waReady = false
    globalThis._waQr = undefined
  }
}
