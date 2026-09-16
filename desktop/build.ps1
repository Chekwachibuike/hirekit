# ─────────────────────────────────────────────────────────────────
# HireKit desktop build — produces HireKit.exe in the project root.
#
#   powershell -ExecutionPolicy Bypass -File desktop\build.ps1
#   powershell -ExecutionPolicy Bypass -File desktop\build.ps1 -SkipNext
#
# -SkipNext reuses the existing .next\standalone build (fast C-only rebuild).
#
# Steps:
#   1. Fetch the webview library (header-only C/C++) and WebView2 SDK headers
#   2. Build Next.js in standalone mode (self-contained server, pruned deps)
#   3. Copy static assets + env into the standalone folder
#   4. Compile hirekit.c + webview with MinGW g++ into a single static exe
# ─────────────────────────────────────────────────────────────────
param([switch]$SkipNext)

$ErrorActionPreference = "Stop"
$desktop = $PSScriptRoot
$root    = Split-Path $desktop -Parent
$vendor  = Join-Path $desktop "vendor"

# ── 1. Dependencies (fetched once, cached in desktop/vendor) ─────
New-Item -ItemType Directory -Force $vendor | Out-Null

$webviewDir = Join-Path $vendor "webview"
if (-not (Test-Path (Join-Path $webviewDir "core"))) {
  Write-Host "[1/4] Fetching webview library..." -ForegroundColor Cyan
  git clone --depth 1 https://github.com/webview/webview $webviewDir
} else {
  Write-Host "[1/4] webview library cached" -ForegroundColor DarkGray
}

$sdkDir = Join-Path $vendor "webview2sdk"
if (-not (Test-Path (Join-Path $sdkDir "build\native\include"))) {
  Write-Host "[1/4] Fetching WebView2 SDK headers (nuget)..." -ForegroundColor Cyan
  $nupkg = Join-Path $vendor "webview2.zip"
  Invoke-WebRequest -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.2478.35" -OutFile $nupkg
  Expand-Archive -Path $nupkg -DestinationPath $sdkDir -Force
  Remove-Item $nupkg
} else {
  Write-Host "[1/4] WebView2 SDK cached" -ForegroundColor DarkGray
}

# ── 2. Next.js standalone build ──────────────────────────────────
if (-not $SkipNext) {
  # Type-check in its own process. next.config.js turns off the build's own
  # type-checking because sharing a heap with the compilation graph ran the
  # build out of memory; doing it here keeps type errors blocking without
  # that cost. Its memory is released before the build starts.
  Write-Host "[2/4] Type-checking..." -ForegroundColor Cyan
  Push-Location $root
  npx tsc --noEmit
  $typesOk = $?
  Pop-Location
  if (-not $typesOk) { throw "type-check failed - fix the errors above, or run 'npx tsc --noEmit' to see them" }

  Write-Host "[2/4] Building Next.js (standalone)..." -ForegroundColor Cyan
  Push-Location $root
  $env:DESKTOP_BUILD = "1"
  npx next build
  $buildOk = $?
  Remove-Item Env:\DESKTOP_BUILD -ErrorAction SilentlyContinue
  Pop-Location
  if (-not $buildOk) { throw "next build failed" }
} else {
  Write-Host "[2/4] Skipping Next build (-SkipNext)" -ForegroundColor DarkGray
}

# ── 3. Assemble the standalone server folder ─────────────────────
Write-Host "[3/4] Assembling standalone server..." -ForegroundColor Cyan
$standalone = Join-Path $root ".next\standalone"
if (-not (Test-Path (Join-Path $standalone "server.js"))) {
  throw "No standalone build at $standalone - run without -SkipNext first."
}
# Static assets and public files are not traced automatically
New-Item -ItemType Directory -Force (Join-Path $standalone ".next") | Out-Null
Copy-Item -Recurse -Force (Join-Path $root ".next\static") (Join-Path $standalone ".next\static")
if (Test-Path (Join-Path $root "public")) {
  Copy-Item -Recurse -Force (Join-Path $root "public") (Join-Path $standalone "public")
}
# Server-side secrets (standalone reads .env from its own cwd)
if (Test-Path (Join-Path $root ".env.local")) {
  Copy-Item -Force (Join-Path $root ".env.local") (Join-Path $standalone ".env.local")
}
# WhatsApp needs its browser config next to the server cwd
if (Test-Path (Join-Path $root ".puppeteerrc.cjs")) {
  Copy-Item -Force (Join-Path $root ".puppeteerrc.cjs") (Join-Path $standalone ".puppeteerrc.cjs")
}
# Stamp the payload version so the updater can tell what this build is.
# Without it the payload reads as v0 and every check looks like an update.
$versionFile = Join-Path $desktop "VERSION"
if (Test-Path $versionFile) {
  $v = (Get-Content $versionFile -Raw).Trim()
  Set-Content -Path (Join-Path $standalone ".hirekit-version") -Value $v -Encoding ascii -NoNewline
  Write-Host "      payload version: v$v" -ForegroundColor DarkGray
}

# ── 4. Compile the C shell ───────────────────────────────────────
Write-Host "[4/4] Compiling HireKit.exe (MinGW g++)..." -ForegroundColor Cyan
# gcc's cc1 crashes with STATUS_ENTRYPOINT_NOT_FOUND if another toolchain's
# DLLs (e.g. Git's MinGW) shadow it on PATH — put the real MinGW first.
$gccPath = (Get-Command gcc -ErrorAction Stop).Source
$env:PATH = (Split-Path $gccPath) + ";" + $env:PATH
$inc1 = Join-Path $webviewDir "core\include"
$inc2 = Join-Path $sdkDir "build\native\include"
$out  = Join-Path $root "HireKit.exe"

Push-Location $desktop
gcc -c hirekit.c -o hirekit.o -O2 "-I$inc1" "-I$inc2"
if (-not $?) { Pop-Location; throw "hirekit.c failed to compile" }
gcc -c update.c -o update.o -O2 "-I$inc1" "-I$inc2"
if (-not $?) { Pop-Location; throw "update.c failed to compile" }
g++ -c webview_impl.cc -o webview_impl.o -O2 -std=c++14 "-I$inc1" "-I$inc2"
if (-not $?) { Pop-Location; throw "webview_impl.cc failed to compile" }
g++ hirekit.o webview_impl.o update.o -o $out -O2 -static -mwindows `
  -ladvapi32 -lole32 -lshell32 -lshlwapi -luser32 -lversion -lws2_32 -lwinhttp -lbcrypt
if (-not $?) { Pop-Location; throw "link failed" }
Remove-Item hirekit.o, webview_impl.o, update.o -ErrorAction SilentlyContinue
Pop-Location

$size = [math]::Round((Get-Item $out).Length / 1MB, 2)
Write-Host ""
Write-Host "Done -> $out ($size MB)" -ForegroundColor Green
Write-Host "Double-click HireKit.exe to launch. The Node server starts hidden and dies with the window." -ForegroundColor Green
