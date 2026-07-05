# Sync dongdong project to wanto backup folder for production deploy.
# Usage: .\scripts\sync-to-wanto.ps1

$ErrorActionPreference = "Stop"

$source = Split-Path -Parent $PSScriptRoot
$documents = [Environment]::GetFolderPath("MyDocuments")

$target = Get-ChildItem -Path $documents -Directory |
    Where-Object { $_.FullName -ne $source -and (Test-Path (Join-Path $_.FullName "composer.json")) } |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $target) {
    $target = Join-Path $documents ([string][char]0x842C + [char]0x5154)
    if (-not (Test-Path $target)) {
        New-Item -ItemType Directory -Path $target | Out-Null
    }
}

Write-Host "Source: $source"
Write-Host "Target: $target"

$excludeDirs = @(
    "node_modules",
    "vendor",
    ".git",
    "bootstrap\cache",
    "storage\logs",
    "storage\framework\cache",
    "storage\framework\sessions",
    "storage\framework\views"
)

$excludeFiles = @(
    ".env",
    "database\database.sqlite"
)

robocopy $source $target /MIR /XD $excludeDirs /XF $excludeFiles /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed with exit code $LASTEXITCODE"
}

Write-Host "Sync complete."
