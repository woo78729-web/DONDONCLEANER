# 執行方式（請用「以系統管理員身分執行」開 PowerShell）：
#   cd C:\Users\ATai\Documents\東東
#   .\scripts\setup-xampp.ps1
#
# 完成後在 XAMPP 控制台 Stop → Start Apache
# 瀏覽器開啟：http://127.0.0.1/spa/

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$publicPath = Join-Path $projectRoot "public"
$publicPathApache = ($publicPath -replace '\\', '/')

$xamppRoot = "C:\xampp"
$httpdConf = Join-Path $xamppRoot "apache\conf\httpd.conf"

if (-not (Test-Path $httpdConf)) {
    Write-Error "找不到 XAMPP，請確認已安裝在 C:\xampp"
}

if (-not (Test-Path (Join-Path $publicPath "spa\index.html"))) {
    Write-Host "前端尚未建置，正在 build..." -ForegroundColor Yellow
    Set-Location (Join-Path $projectRoot "web-app")
    if (-not (Test-Path "node_modules")) {
        npm install
    }
    npm run build
    Set-Location $projectRoot
}

$backup = "$httpdConf.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $httpdConf $backup
Write-Host "已備份 httpd.conf -> $backup" -ForegroundColor DarkGray

$content = Get-Content $httpdConf -Raw -Encoding UTF8

$content = $content -replace 'DocumentRoot "C:/xampp/htdocs"', "DocumentRoot `"$publicPathApache`""
$content = $content -replace '<Directory "C:/xampp/htdocs">', "<Directory `"$publicPathApache`">"

if ($content -match '#LoadModule rewrite_module') {
    $content = $content -replace '#LoadModule rewrite_module modules/mod_rewrite.so', 'LoadModule rewrite_module modules/mod_rewrite.so'
}

Set-Content -Path $httpdConf -Value $content -Encoding UTF8

Write-Host "建立 storage 連結..." -ForegroundColor Yellow
Set-Location $projectRoot
$storageLink = Join-Path $projectRoot "public\storage"
$storageTarget = Join-Path $projectRoot "storage\app\public"
$linkOk = $false
if (Test-Path $storageLink) {
    $item = Get-Item -LiteralPath $storageLink -Force -ErrorAction SilentlyContinue
    if ($item -and ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink')) {
        $target = $item.Target
        if ($target -is [System.Array]) { $target = $target[0] }
        $linkOk = ([System.IO.Path]::GetFullPath($target) -eq [System.IO.Path]::GetFullPath($storageTarget))
    }
}
if ($linkOk) {
    Write-Host "  storage 連結已正確" -ForegroundColor DarkGray
} else {
    if (Test-Path $storageLink) {
        Remove-Item -LiteralPath $storageLink -Force -Recurse -ErrorAction SilentlyContinue
    }
    & php artisan storage:link 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  storage 連結已建立" -ForegroundColor DarkGray
    } else {
        Write-Host "  [警告] storage 連結建立失敗" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "XAMPP 已指向專案 public 資料夾。" -ForegroundColor Green
Write-Host "請到 XAMPP 控制台：Stop Apache → Start Apache" -ForegroundColor Yellow
Write-Host ""
Write-Host "然後開啟：http://127.0.0.1/spa/" -ForegroundColor Cyan
Write-Host "測試帳號：admin1 / admin1  或  shifu1 / shifu1" -ForegroundColor Cyan
Write-Host ""
