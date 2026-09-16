# ─────────────────────────────────────────────────────────────────
# Refresh the server that HireKit.exe launches — WITHOUT recompiling
# the C exe. Run this after changing app code so the desktop app shows
# your latest changes.
#
#   powershell -ExecutionPolicy Bypass -File desktop\refresh-server.ps1
#
# This is build.ps1 steps 2–3 only (Next.js standalone build + asset
# copy). The existing HireKit.exe already knows how to auto-start the
# resulting .next\standalone\server.js, so no gcc / MinGW is needed.
#
# For live-reload development, keep using `npm run dev` instead.
# ─────────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

# ── 1. Next.js standalone build ──────────────────────────────────
Write-Host "[1/2] Building Next.js (standalone)..." -ForegroundColor Cyan
Push-Location $root
$env:DESKTOP_BUILD = "1"
npx next build
$buildOk = $?
Remove-Item Env:\DESKTOP_BUILD -ErrorAction SilentlyContinue
Pop-Location
if (-not $buildOk) { throw "next build failed" }

# ── 2. Assemble the standalone server folder ─────────────────────
Write-Host "[2/2] Assembling standalone server..." -ForegroundColor Cyan
$standalone = Join-Path $root ".next\standalone"
if (-not (Test-Path (Join-Path $standalone "server.js"))) {
  throw "No standalone build at $standalone"
}
# Static assets and public files are not traced automatically.
New-Item -ItemType Directory -Force (Join-Path $standalone ".next") | Out-Null
Copy-Item -Recurse -Force (Join-Path $root ".next\static") (Join-Path $standalone ".next\static")
if (Test-Path (Join-Path $root "public")) {
  Copy-Item -Recurse -Force (Join-Path $root "public") (Join-Path $standalone "public")
}
# Server-side secrets (standalone reads .env from its own cwd).
if (Test-Path (Join-Path $root ".env.local")) {
  Copy-Item -Force (Join-Path $root ".env.local") (Join-Path $standalone ".env.local")
}
# WhatsApp needs its browser config next to the server cwd.
if (Test-Path (Join-Path $root ".puppeteerrc.cjs")) {
  Copy-Item -Force (Join-Path $root ".puppeteerrc.cjs") (Join-Path $standalone ".puppeteerrc.cjs")
}

Write-Host ""
Write-Host "Done. Double-click HireKit.exe - the server now starts automatically." -ForegroundColor Green
