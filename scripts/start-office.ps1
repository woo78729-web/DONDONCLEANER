$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "=== Dong Dong AC - Office Server ===" -ForegroundColor Cyan

Write-Host "Stopping process on port 8000..." -ForegroundColor Yellow
try {
    Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
} catch {
    Write-Host "  (skip port cleanup: $($_.Exception.Message))" -ForegroundColor DarkGray
}

Write-Host "1/3 Database migrate..." -ForegroundColor Yellow
$dbOk = $true
try {
    & php artisan migrate --force
    if ($LASTEXITCODE -ne 0) {
        $dbOk = $false
        Write-Host "  [warn] migrate failed, exit code $LASTEXITCODE" -ForegroundColor Yellow
    }
} catch {
    $dbOk = $false
    Write-Host "  [warn] migrate failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "Ensuring storage link..." -ForegroundColor Yellow
function Test-ProjectStorageLink {
    param(
        [string]$LinkPath,
        [string]$ExpectedTarget
    )

    if (-not (Test-Path $LinkPath)) {
        return $false
    }

    $item = Get-Item -LiteralPath $LinkPath -Force -ErrorAction SilentlyContinue
    if (-not $item -or ($item.LinkType -ne 'Junction' -and $item.LinkType -ne 'SymbolicLink')) {
        return $false
    }

    $target = $item.Target
    if ($target -is [System.Array]) {
        $target = $target[0]
    }

    return ([System.IO.Path]::GetFullPath($target) -eq [System.IO.Path]::GetFullPath($ExpectedTarget))
}

$storageLink = Join-Path $projectRoot "public\storage"
$storageTarget = Join-Path $projectRoot "storage\app\public"

if (Test-ProjectStorageLink -LinkPath $storageLink -ExpectedTarget $storageTarget) {
    Write-Host "  storage link OK" -ForegroundColor DarkGray
} else {
    if (Test-Path $storageLink) {
        Remove-Item -LiteralPath $storageLink -Force -Recurse -ErrorAction SilentlyContinue
    }

    $linkOutput = & php artisan storage:link 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  storage link created" -ForegroundColor DarkGray
    } else {
        Write-Host "  [warn] storage link failed" -ForegroundColor Yellow
        Write-Host "  $linkOutput" -ForegroundColor DarkGray
    }
}

Write-Host "2/3 Ensure dev accounts..." -ForegroundColor Yellow
try {
    & php artisan dev:ensure-accounts
} catch {
    Write-Host "  [warn] dev accounts skipped" -ForegroundColor Yellow
}

if (-not (Test-Path (Join-Path $projectRoot "public\spa\index.html"))) {
    Write-Host "3/3 Build frontend..." -ForegroundColor Yellow
    Set-Location (Join-Path $projectRoot "web-app")
    if (-not (Test-Path "node_modules")) {
        npm install
    }
    npm run build
    Set-Location $projectRoot
    if (-not (Test-Path (Join-Path $projectRoot "public\spa\index.html"))) {
        Write-Error "Frontend build failed. Install Node.js and run npm run build in web-app."
    }
} else {
    Write-Host "3/3 Frontend OK, skip build" -ForegroundColor DarkGray
}

$lanIp = $null
try {
    $lanIp = (
        Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown'
        } |
        Sort-Object InterfaceMetric |
        Select-Object -First 1 -ExpandProperty IPAddress
    )
} catch {
    Write-Host "  (LAN IP unavailable)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Open in browser (this PC):" -ForegroundColor Green
Write-Host "  http://127.0.0.1:8000/spa/login" -ForegroundColor Green
if ($lanIp) {
    Write-Host ""
    Write-Host "Same Wi-Fi (other PCs):" -ForegroundColor Green
    Write-Host "  http://${lanIp}:8000/spa/login" -ForegroundColor Green
}
Write-Host ""
Write-Host "Test login: admin1 / admin1  or  shifu1 / shifu1" -ForegroundColor Cyan
Write-Host "Keep this window open. Close it to stop the server." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

$serverScript = Join-Path $projectRoot "server.php"
if (-not (Test-Path $serverScript)) {
    Write-Error "Missing $serverScript"
}

if (-not $dbOk) {
    Write-Host "Tip: if login fails, close this window and run the startup bat again." -ForegroundColor Yellow
    Write-Host ""
}

php -S 0.0.0.0:8000 $serverScript
