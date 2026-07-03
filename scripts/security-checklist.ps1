# 部署前資安檢查清單（Production）
# 1. 確認 .env / Zeabur 環境變數未提交到 Git
# 2. 設定 APP_ENV=production、APP_DEBUG=false、LOG_LEVEL=warning
# 3. 設定 CORS_ALLOWED_ORIGINS 為前端實際網域（不可 *）
# 4. 設定 SANCTUM_EXPIRATION（建議 480 分鐘以內）
# 5. 勿在 production 執行 db:seed
# 6. 建議移除或禁止對外開放 public/demo 測試頁
# 7. Postman 測試帳密請放在本機 environment，勿提交 repo

Write-Host "請依上方清單逐項確認後再部署。" -ForegroundColor Yellow
