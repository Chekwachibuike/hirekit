# ─────────────────────────────────────────────────────────────────
# HireKit release packager — builds an update payload + manifest.
#
#   powershell -ExecutionPolicy Bypass -File desktop\package.ps1
#   powershell -ExecutionPolicy Bypass -File desktop\package.ps1 -SkipBuild
#
# Produces desktop\release\:
#   hirekit-payload-v<N>.zip   the server payload clients download
#   latest.json                the manifest clients poll
#
# Upload BOTH as assets on a GitHub release tagged v<N>. The updater reads
#   /releases/latest/download/latest.json
# so whichever release GitHub calls "latest" is what clients will install.
#
# The version is a single integer in desktop\VERSION. Bump it, then run this.
# ─────────────────────────────────────────────────────────────────
param(
  [switch]$SkipBuild,
  [int]$Version = 0
)

$ErrorActionPreference = "Stop"
$desktop = $PSScriptRoot
$root    = Split-Path $desktop -Parent

# ── Version ──────────────────────────────────────────────────────
$versionFile = Join-Path $desktop "VERSION"
if ($Version -le 0) {
  if (-not (Test-Path $versionFile)) { throw "No desktop\VERSION file and no -Version given." }
  $Version = [int]((Get-Content $versionFile -Raw).Trim())
}
if ($Version -le 0) { throw "Version must be a positive integer (got $Version)." }
Write-Host "Packaging HireKit payload v$Version" -ForegroundColor Cyan

# ── 1. Build ─────────────────────────────────────────────────────
if (-not $SkipBuild) {
  Write-Host "[1/5] Building desktop payload..." -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File (Join-Path $desktop "build.ps1")
  if ($LASTEXITCODE -ne 0) { throw "build.ps1 failed" }
} else {
  Write-Host "[1/5] Reusing existing build (-SkipBuild)" -ForegroundColor DarkGray
}

$standalone = Join-Path $root ".next\standalone"
if (-not (Test-Path (Join-Path $standalone "server.js"))) {
  throw "No standalone build at $standalone - run without -SkipBuild."
}

# ── 2. Stage, minus anything machine-local ───────────────────────
# build.ps1 copies .env.local INTO the standalone folder so the server can
# read it. It must never reach a published artifact. .wwebjs_* is the user's
# WhatsApp session — equally not ours to ship.
Write-Host "[2/5] Staging payload (excluding secrets + local state)..." -ForegroundColor Cyan
$release = Join-Path $desktop "release"
$stage   = Join-Path $desktop "stage"
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $stage   | Out-Null
New-Item -ItemType Directory -Force $release | Out-Null

# robocopy, not Copy-Item: node_modules nests past MAX_PATH.
$rc = Start-Process robocopy -Wait -NoNewWindow -PassThru -ArgumentList @(
  "`"$standalone`"", "`"$stage`"", "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP",
  "/XF", ".env.local", "/XD", ".wwebjs_auth", ".wwebjs_cache", "private"
)
if ($rc.ExitCode -ge 8) { throw "robocopy failed with exit code $($rc.ExitCode)" }

# Hard assert — a leaked service-role key is not a recoverable mistake.
$leaked = Get-ChildItem -Path $stage -Recurse -Force -Include ".env.local", ".env" -ErrorAction SilentlyContinue
if ($leaked) {
  Remove-Item -Recurse -Force $stage
  throw "ABORT: secret file(s) found in staged payload: $($leaked.FullName -join ', ')"
}

# private/ holds adapters kept out of the published repo. A release payload is
# a public download, so shipping them would undo that in a less obvious way.
$privateLeak = Get-ChildItem -Path $stage -Recurse -Force -Directory -Filter "private" -ErrorAction SilentlyContinue
if ($privateLeak) {
  Remove-Item -Recurse -Force $stage
  throw "ABORT: private/ found in staged payload: $($privateLeak.FullName -join ', ')"
}

Set-Content -Path (Join-Path $stage ".hirekit-version") -Value "$Version" -Encoding ascii -NoNewline

# ── 3. Zip ───────────────────────────────────────────────────────
# bsdtar, matching what the updater extracts with. server.js must sit at the
# archive root: update.c probes <extracted>\server.js before promoting.
Write-Host "[3/5] Creating archive..." -ForegroundColor Cyan
$zipName = "hirekit-payload-v$Version.zip"
$zip     = Join-Path $release $zipName
Remove-Item -Force $zip -ErrorAction SilentlyContinue

$tar = Join-Path $env:SystemRoot "System32\tar.exe"
if (-not (Test-Path $tar)) { throw "tar.exe not found - Windows 10 1803+ required." }
& $tar -c -f $zip --format=zip -C $stage .
if ($LASTEXITCODE -ne 0) { throw "tar failed to create $zip" }

$listing = & $tar -tf $zip
if (-not ($listing | Where-Object { $_ -match '^(\./)?server\.js$' })) {
  throw "ABORT: server.js is not at the archive root - the updater would reject this payload."
}

# ── 4. Manifest ──────────────────────────────────────────────────
Write-Host "[4/5] Writing manifest..." -ForegroundColor Cyan
$sha = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
$url = "https://github.com/Chekwachibuike/hirekit/releases/download/v$Version/$zipName"

$manifest = [ordered]@{ version = $Version; url = $url; sha256 = $sha }
$manifestPath = Join-Path $release "latest.json"
$manifest | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding ascii

Remove-Item -Recurse -Force $stage

# ── 5. Report ────────────────────────────────────────────────────
$sizeMB = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ""
Write-Host "[5/5] Ready — v$Version ($sizeMB MB)" -ForegroundColor Green
Write-Host "  $zip"
Write-Host "  $manifestPath"
Write-Host ""
Write-Host "Publish with:" -ForegroundColor Cyan
Write-Host "  gh release create v$Version `"$zip`" `"$manifestPath`" --title `"v$Version`" --notes `"Payload update`""
Write-Host ""
Write-Host "Clients pick it up on their next-but-one launch:" -ForegroundColor DarkGray
Write-Host "  launch 1 downloads and stages it, launch 2 runs it." -ForegroundColor DarkGray
