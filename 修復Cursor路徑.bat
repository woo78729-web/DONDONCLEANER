@echo off
chcp 65001 >nul
setlocal

set "OLD=C:\Users\ATai\Documents\冷氣"
set "NEW=C:\Users\ATai\Documents\東東"

echo.
echo ========================================
echo   修復 Cursor 舊路徑 (冷氣 -^> 東東)
echo ========================================
echo.

if not exist "%NEW%" (
    echo [錯誤] 找不到新資料夾: %NEW%
    pause
    exit /b 1
)

if exist "%OLD%" (
    echo [提示] 已存在: %OLD%
    dir "%OLD%" | findstr /i "<JUNCTION> <SYMLINKD>" >nul
    if errorlevel 1 (
        echo        這是資料夾本身，不是連結。請手動用 Cursor 開啟「東東」資料夾。
        pause
        exit /b 1
    )
    echo        連結已建立，可直接回到 Cursor 儲存。
    pause
    exit /b 0
)

echo 建立連結...
echo   %OLD%
echo   -^> %NEW%
echo.

mklink /J "%OLD%" "%NEW%"
if errorlevel 1 (
    echo [錯誤] 建立連結失敗。請在檔案總管對此 bat 右鍵「以系統管理員身分執行」再試。
    pause
    exit /b 1
)

echo.
echo [完成] 已修復。請回到 Cursor：
echo   1. 再按一次 Ctrl+S 儲存
echo   2. 終端機也應可正常使用
echo.
echo 之後建議：關閉 Cursor，用「東東冷氣.code-workspace」重新開啟專案，
echo 修復完成後可刪除此連結資料夾「冷氣」（不會刪到東東的檔案）。
echo.
pause
