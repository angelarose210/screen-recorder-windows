# Publishes a new version: bumps the version, builds the installer, uploads it to GitHub Releases.
# Installed copies pick it up automatically within a few hours (or via tray > Check for updates).
# Usage: powershell -ExecutionPolicy Bypass -File scripts\release.ps1 [patch|minor|major]
param([ValidateSet('patch', 'minor', 'major')][string]$Bump = 'patch')
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Test-Path 'resources\ffmpeg\ffmpeg.exe')) { & powershell -ExecutionPolicy Bypass -File scripts\download-ffmpeg.ps1 }
if (-not (Test-Path 'native\build\screen_recorder_native.node')) { cmd /c scripts\build-native.bat; if ($LASTEXITCODE) { throw 'native build failed' } }

$env:GH_TOKEN = (gh auth token)
if (-not $env:GH_TOKEN) { throw 'Run "gh auth login" first' }

npm version $Bump --no-git-tag-version | Out-Null
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
npm run build
if ($LASTEXITCODE) { throw 'build failed' }
npx electron-builder --win --publish always
if ($LASTEXITCODE) { throw 'electron-builder failed' }

git add package.json package-lock.json
git commit -m "Release v$version"
git tag "v$version"
git push origin HEAD --tags
Write-Host "Released v$version"
