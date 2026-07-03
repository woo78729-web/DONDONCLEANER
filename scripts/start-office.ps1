$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "=== 東東冷氣系統 - 公司本機啟動 ===" -ForegroundColor Cyan

Write-Host "停止舊的 8000 連接埠程序..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }

Write-Host "1/3 檢查資料庫..." -ForegroundColor Yellow
php artisan migrate --force

Write-Host "2/3 確保測試帳號..." -ForegroundColor Yellow
php artisan dev:ensure-accounts

if (-not (Test-Path (Join-Path $projectRoot "public\spa\index.html"))) {
    Write-Host "3/3 建置前端..." -ForegroundColor Yellow
    Set-Location (Join-Path $projectRoot "web-app")
    if (-not (Test-Path "node_modules")) {
        npm install
    }
    npm run build
    Set-Location $projectRoot
} else {
    Write-Host "3/3 前端已建置，略過 build" -ForegroundColor DarkGray
}

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

Write-Host ""
Write-Host "請用瀏覽器開啟（本機）：" -ForegroundColor Green
Write-Host "  http://127.0.0.1:8000/spa/login" -ForegroundColor Green
if ($lanIp) {
    Write-Host ""
    Write-Host "同公司 Wi‑Fi 其他電腦也可用：" -ForegroundColor Green
    Write-Host "  http://${lanIp}:8000/spa/login" -ForegroundColor Green
}
Write-Host ""
Write-Host "測試帳號：admin1 / admin1  或  shifu1 / shifu1" -ForegroundColor Cyan
Write-Host "按 Ctrl+C 可停止" -ForegroundColor DarkGray
Write-Host ""

$serverScript = Join-Path $projectRoot "server.php"

if (-not (Test-Path $serverScript)) {
    Write-Error "找不到 $serverScript，請確認專案完整。"
}

php -S 0.0.0.0:8000 $serverScript
