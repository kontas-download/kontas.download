# kontas.download atnaujinimas viena komanda (Windows).
#
#   powershell -ExecutionPolicy Bypass -File .\update.ps1           # atnaujina, jei paskelbta naujesne versija
#   powershell -ExecutionPolicy Bypass -File .\update.ps1 -Check    # tik parodo, ar yra nauja versija
#   powershell -ExecutionPolicy Bypass -File .\update.ps1 -Force    # idiegia paskelbta versija net jei ji ne naujesne
#
# Eiga ir saugomi failai tokie patys kaip update.sh: duomenu bazes kopija i backups\database\,
# seni programos failai i backups\previous-<versija>-<laikas>\, nepavykus viskas grazinama.
# Nekeiciama: web\prisma\ (duomenu baze), .env, docker-compose.override.yml, backups\.
param([switch]$Check, [switch]$Force)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Feed = if ($env:UPDATE_FEED_URL) { $env:UPDATE_FEED_URL } else { 'https://kontas.download/latest.json' }
$HealthUrl = if ($env:KONTAS_HEALTH_URL) { $env:KONTAS_HEALTH_URL } else { 'http://127.0.0.1:3200/login' }
$Root = $PSScriptRoot
Set-Location $Root

function Log($m) { Write-Host "[update] $m" }
function Fail($m) { Write-Host "[update] KLAIDA: $m" -ForegroundColor Red; exit 1 }
function Compose([string[]]$a) {
  if ($env:KONTAS_COMPOSE) { & $env:KONTAS_COMPOSE @a | Out-Host } else { & docker compose @a | Out-Host }
  return ($LASTEXITCODE -eq 0)
}
function Ver($v) { [version]$v }

if (Test-Path (Join-Path $Root '.git')) { Fail 'sis aplankas yra git kopija. Atnaujinkite: git pull; docker compose up -d --build' }

$current = $null
if (Test-Path VERSION) { $current = (Get-Content VERSION -TotalCount 1).Trim() }
if (-not $current) { $current = (Get-Content web\package.json -Raw | ConvertFrom-Json).version }
if (-not $current) { Fail 'nerasta dabartine versija (VERSION, web\package.json)' }

try { $info = Invoke-RestMethod -Uri $Feed -TimeoutSec 20 -UseBasicParsing } catch { Fail "nepavyko gauti $Feed" }
$latest = [string]$info.version
if ($latest -notmatch '^\d+\.\d+\.\d+$') { Fail 'netinkamas atnaujinimu failas' }
if ([string]$info.sha256 -notmatch '^[0-9a-f]{64}$') { Fail 'atnaujinimu faile nera SHA-256' }
$url = [string](New-Object System.Uri((New-Object System.Uri($Feed)), [string]$info.url))

Log "idiegta: $current, paskelbta: $latest"
$isNewer = (Ver $latest) -gt (Ver $current)
if ($Check) { if ($isNewer) { Log "yra nauja versija $latest" } else { Log 'naudojate naujausia versija' }; exit 0 }
if (-not $isNewer -and -not $Force) { Log 'atnaujinti nereikia'; exit 0 }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force backups\database | Out-Null
$work = Join-Path $Root "backups\.update-$stamp"
New-Item -ItemType Directory -Force $work | Out-Null
$keepRoot = @('.env', 'docker-compose.override.yml', 'backups', 'web')
$prev = "backups\previous-$current-$stamp"
$dbCopy = $null

function Rollback {
  Log "atnaujinimas nepavyko, grazinama versija $current"
  Compose @('stop') | Out-Null
  Get-ChildItem -Force $Root | Where-Object { $keepRoot -notcontains $_.Name } | Remove-Item -Recurse -Force
  Get-ChildItem -Force web | Where-Object { $_.Name -ne 'prisma' } | Remove-Item -Recurse -Force
  Get-ChildItem -Force "$prev\web" | Move-Item -Destination web
  Remove-Item "$prev\web"
  Get-ChildItem -Force $prev | Move-Item -Destination $Root
  Remove-Item $prev
  if ($dbCopy) {
    Remove-Item -Force -ErrorAction SilentlyContinue web\prisma\dev.db-wal, web\prisma\dev.db-shm
    Copy-Item $dbCopy web\prisma\dev.db -Force
    foreach ($ext in '-wal', '-shm') { if (Test-Path "$dbCopy$ext") { Copy-Item "$dbCopy$ext" "web\prisma\dev.db$ext" -Force } }
  }
  Compose @('up', '-d', '--build') | Out-Null
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  Fail "grazinta versija $current; duomenu bazes kopija: $(if ($dbCopy) { $dbCopy } else { 'nera' })"
}

try {
  Log "atsisiunciamas $url"
  $zip = Join-Path $work 'release.zip'
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 600
  if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $info.sha256) { throw 'archyvo SHA-256 nesutampa, atnaujinimas nutrauktas' }
  Expand-Archive $zip -DestinationPath (Join-Path $work 'new')
  $src = Join-Path $work "new\kontas-download-$latest"
  if (-not (Test-Path "$src\docker-compose.yml") -or -not (Test-Path "$src\web")) { throw 'archyvo turinys netiketas' }
} catch {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  Fail $_.Exception.Message
}

Log 'stabdoma programa'
Compose @('stop') | Out-Null
if (Test-Path web\prisma\dev.db) {
  $dbCopy = "backups\database\$stamp-before-update-$latest.db"
  Copy-Item web\prisma\dev.db $dbCopy
  foreach ($ext in '-wal', '-shm') { if (Test-Path "web\prisma\dev.db$ext") { Copy-Item "web\prisma\dev.db$ext" "$dbCopy$ext" } }
  Log "duomenu bazes kopija: $dbCopy"
}

New-Item -ItemType Directory -Force "$prev\web" | Out-Null
Get-ChildItem -Force $Root | Where-Object { $keepRoot -notcontains $_.Name } | Move-Item -Destination $prev
Get-ChildItem -Force web | Where-Object { $_.Name -ne 'prisma' } | Move-Item -Destination "$prev\web"

try {
  Log "diegiama versija $latest"
  Remove-Item -Force -ErrorAction SilentlyContinue "$src\web\prisma\.gitkeep"
  Get-ChildItem -Force $src | Where-Object { $_.Name -ne 'web' } | Copy-Item -Destination $Root -Recurse -Force
  Get-ChildItem -Force "$src\web" | Where-Object { $_.Name -ne 'prisma' } | Copy-Item -Destination web -Recurse -Force
  if (-not (Compose @('up', '-d', '--build'))) { throw 'docker compose up nepavyko' }
} catch { Rollback }

Log "laukiama, kol programa atsakys ($HealthUrl)"
for ($i = 0; $i -lt 90; $i++) {
  try {
    Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 5 | Out-Null
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
    Log "atnaujinta iki $latest. Senoji versija: $prev"
    exit 0
  } catch { Start-Sleep -Seconds 2 }
}
Rollback
