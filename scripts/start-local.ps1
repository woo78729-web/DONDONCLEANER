$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "=== 東東冷氣系統 - 本機啟動 ===" -ForegroundColor Cyan

Write-Host "停止舊的 8000 連接埠程序..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }

Write-Host "1/4 檢查資料庫..." -ForegroundColor Yellow
php artisan migrate --force

Write-Host "2/4 確保測試帳號..." -ForegroundColor Yellow
php artisan dev:ensure-accounts

Write-Host "3/4 建置前端..." -ForegroundColor Yellow
Set-Location (Join-Path $projectRoot "web-app")
if (-not (Test-Path "node_modules")) {
    npm install
}
npm run build
Set-Location $projectRoot

Write-Host "4/4 啟動伺服器..." -ForegroundColor Yellow
Write-Host ""
Write-Host "請用瀏覽器開啟：" -ForegroundColor Green
Write-Host "  http://127.0.0.1:8000/spa/" -ForegroundColor Green
Write-Host "  （XAMPP 設定好後也可用 http://127.0.0.1/spa/ ）" -ForegroundColor Green
Write-Host ""
Write-Host "測試帳號：admin1 / admin1  或  shifu1 / shifu1" -ForegroundColor Cyan
Write-Host "按 Ctrl+C 可停止" -ForegroundColor DarkGray
Write-Host ""

$serverScript = Join-Path $projectRoot "server.php"

if (-not (Test-Path $serverScript)) {
    Write-Error "找不到 $serverScript，請確認專案完整。"
}

php -S 127.0.0.1:8000 $serverScript
