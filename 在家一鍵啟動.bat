@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo.
echo ========================================
echo   東東冷氣 - 在家一鍵啟動
echo ========================================
echo.

where php >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 找不到 PHP，請先安裝 PHP 並加入 PATH。
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0server.php" (
    echo [錯誤] 找不到 server.php，專案可能不完整。
    pause
    exit /b 1
)

if not exist "%~dp0public\spa\index.html" (
    echo [警告] 前端尚未建置，正在 build...
    cd /d "%~dp0web-app"
    if not exist node_modules call npm install
    call npm run build
    cd /d "%~dp0"
    if not exist "%~dp0public\spa\index.html" (
        echo [錯誤] 前端建置失敗，請確認已安裝 Node.js。
        pause
        exit /b 1
    )
)

echo 停止舊的 8000 連接埠...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo 更新資料庫與測試帳號...
php artisan migrate --force
php artisan dev:ensure-accounts

echo.
echo 啟動伺服器中...
echo.
echo   請用瀏覽器開啟：
echo   http://127.0.0.1:8000/spa/login
echo.
echo   測試帳號：admin1 / admin1
echo   員工帳號：shifu1 / shifu1
echo.
echo   請保持此視窗開啟，關閉即無法連線。
echo   按 Ctrl+C 可停止伺服器。
echo.

php -S 127.0.0.1:8000 "%~dp0server.php"

pause
