# Push local changes to GitHub (Zeabur auto-deploys from main).
# Usage:
#   .\scripts\push-zeabur.ps1
#   .\scripts\push-zeabur.ps1 -Message "fix travel fee field"

param(
    [string]$Message = ""
)

$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git not found. Install: winget install Git.Git"
    exit 1
}

if (-not (git config user.name)) {
    Write-Host "Set Git identity first:" -ForegroundColor Yellow
    Write-Host '  git config --global user.name "Your Name"'
    Write-Host '  git config --global user.email "your@email.com"'
    exit 1
}

if (-not $Message) {
    $Message = Read-Host "Commit message (describe your changes)"
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    Write-Error "Commit message is required."
    exit 1
}

Write-Host ""
Write-Host "1/3 Adding files..." -ForegroundColor Yellow
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Error "git add failed."
    exit 1
}

$status = git status --porcelain
if (-not $status) {
    Write-Host ""
    Write-Host "No changes to upload. Save files in Cursor (Ctrl+S) first." -ForegroundColor Green
    exit 0
}

Write-Host "2/3 Committing..." -ForegroundColor Yellow
git commit -m "$Message"
if ($LASTEXITCODE -ne 0) {
    Write-Error "git commit failed."
    exit 1
}

Write-Host "3/3 Pushing to GitHub (origin main)..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Push failed. Check network or GitHub login, then try again." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Upload complete!" -ForegroundColor Green
Write-Host "Zeabur should auto-deploy in about 2-5 minutes." -ForegroundColor Cyan
Write-Host "Check Zeabur dashboard for green Running status." -ForegroundColor Cyan
Write-Host "After deploy, hard refresh browser: Ctrl+F5" -ForegroundColor DarkGray
Write-Host ""
