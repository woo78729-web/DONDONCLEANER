@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo.
echo ========================================
echo   東東冷氣 - 一鍵上傳到雲端
echo ========================================
echo.
echo  步驟說明：
echo    1. 請先在 Cursor 按 Ctrl+S 存檔
echo    2. 底下會請你輸入這次修改的說明
echo    3. 完成後到 Zeabur 看是否 Running
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 找不到 Git，請先安裝 Git 並加入 PATH。
    echo.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\push-zeabur.ps1"
echo.
pause
