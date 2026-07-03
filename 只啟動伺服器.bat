@echo off
chcp 65001 >nul
cd /d "%~dp0"

where php >nul 2>&1
if errorlevel 1 (
    echo 找不到 PHP，請改用「在家一鍵啟動.bat」或安裝 PHP。
    pause
    exit /b 1
)

if not exist "%~dp0server.php" (
    echo 找不到 server.php
    pause
    exit /b 1
)

echo 停止舊的 8000 連接埠...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1

php artisan dev:ensure-accounts >nul 2>&1

echo.
echo 啟動伺服器...
echo 請開啟: http://127.0.0.1:8000/spa/login
echo 測試帳號: admin1 / admin1
echo 按 Ctrl+C 可停止
echo.

php -S 127.0.0.1:8000 "%~dp0server.php"

pause
