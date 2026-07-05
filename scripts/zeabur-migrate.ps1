# 首次部署到 Zeabur 後，在本機執行 migration（需先從 Zeabur MySQL 服務複製 DATABASE_URL）
# 用法：
#   $env:DATABASE_URL="mysql://user:pass@host:3306/db"
#   .\scripts\zeabur-migrate.ps1

param(
    [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not $DatabaseUrl) {
    Write-Error "請設定 DATABASE_URL 環境變數，或從 Zeabur MySQL 服務複製連線字串。"
}

$env:DATABASE_URL = $DatabaseUrl
$env:DB_CONNECTION = "mysql"

Write-Host "執行 migration..." -ForegroundColor Cyan
php artisan migrate --force

Write-Host "建立 storage 公開連結..." -ForegroundColor Cyan
php artisan storage:link --force

Write-Host "是否寫入測試資料？(y/N)" -ForegroundColor Yellow
$seed = Read-Host
if ($seed -eq "y" -or $seed -eq "Y") {
    php artisan db:seed --force
    Write-Host "Seeder 完成。" -ForegroundColor Green
}

Write-Host "Migration 與 storage:link 完成。" -ForegroundColor Green
