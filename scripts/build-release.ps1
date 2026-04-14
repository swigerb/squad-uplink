# build-release.ps1 — Squad Uplink Release Build Script
#
# Prerequisites:
#   1. Install Velopack CLI: dotnet tool install -g vpk
#   2. .NET 10 SDK (or matching TFM)
#   3. Windows 10 SDK 10.0.22621
#
# Usage:
#   .\scripts\build-release.ps1 [-Version "2.0.0"]
#
# Release process:
#   1. Update version in SquadUplink.csproj if needed
#   2. Run this script to produce a Velopack package
#   3. Output lands in ./releases/ — upload to GitHub Releases
#   4. Velopack auto-updater in the app checks GitHub Releases for new versions
#
# The packaged app is self-contained (no .NET runtime needed on target machine).

param(
    [string]$Version = "3.0.0",
    [string]$Configuration = "Release",
    [string]$Platform = "x64"
)

$ErrorActionPreference = "Stop"

$publishDir = Join-Path $PSScriptRoot "..\publish_output"
$releasesDir = Join-Path $PSScriptRoot "..\releases"

# Clean previous output
if (Test-Path $publishDir) { Remove-Item $publishDir -Recurse -Force }
if (Test-Path $releasesDir) { Remove-Item $releasesDir -Recurse -Force }

Write-Host "=== Building Squad Uplink v$Version ($Configuration|$Platform) ===" -ForegroundColor Cyan

# Step 1: Publish self-contained
dotnet publish "$PSScriptRoot\..\src\SquadUplink" `
    -c $Configuration `
    -p:Platform=$Platform `
    --self-contained `
    -o $publishDir

if ($LASTEXITCODE -ne 0) {
    Write-Error "dotnet publish failed"
    exit 1
}

Write-Host "=== Published to $publishDir ===" -ForegroundColor Green

# Step 2: Pack with Velopack
vpk pack `
    --packId SquadUplink `
    --packVersion $Version `
    --packDir $publishDir `
    --mainExe SquadUplink.exe `
    --outputDir $releasesDir

if ($LASTEXITCODE -ne 0) {
    Write-Error "vpk pack failed"
    exit 1
}

Write-Host "=== Velopack package created in $releasesDir ===" -ForegroundColor Green
Write-Host "Upload the contents of $releasesDir to GitHub Releases." -ForegroundColor Yellow
