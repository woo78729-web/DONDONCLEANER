# 將此 repo 推送到 GitHub
# 用法：.\scripts\push-github.ps1 -RepoName "ac-cleaning"

param(
    [Parameter(Mandatory = $true)]
    [string]$RepoName,

    [string]$GitHubUser = "",
    [switch]$Private
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git 尚未安裝，請先執行：winget install Git.Git"
}

if (-not (git config user.name)) {
    Write-Host "請先設定 Git 身份：" -ForegroundColor Yellow
    Write-Host '  git config --global user.name "你的名字"'
    Write-Host '  git config --global user.email "你的Email"'
    exit 1
}

if (-not $GitHubUser) {
    $GitHubUser = Read-Host "請輸入 GitHub 使用者名稱"
}

$visibility = if ($Private) { "--private" } else { "--public" }
$remoteUrl = "https://github.com/$GitHubUser/$RepoName.git"

if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh auth status 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "請先登入 GitHub CLI：gh auth login" -ForegroundColor Yellow
        exit 1
    }

    gh repo create $RepoName $visibility --source=. --remote=origin --push
    Write-Host "完成！Repo: https://github.com/$GitHubUser/$RepoName" -ForegroundColor Green
    exit 0
}

if (git remote | Select-String -Pattern "^origin$") {
    git remote set-url origin $remoteUrl
} else {
    git remote add origin $remoteUrl
}

git branch -M main
git push -u origin main

Write-Host "完成！Repo: https://github.com/$GitHubUser/$RepoName" -ForegroundColor Green
Write-Host "若 push 失敗，請先在 GitHub 網站建立空白 repo：$RepoName" -ForegroundColor Yellow
