@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo.
echo ========================================
echo   東東冷氣 - 公司一鍵啟動
echo ========================================
echo.

where php >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 找不到 PHP，請先安裝 PHP 並加入 PATH。
    echo        若公司有 XAMPP，可先執行「設定XAMPP.bat」。
    echo.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\start-office.ps1"
pause
