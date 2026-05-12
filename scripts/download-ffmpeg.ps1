# Download FFmpeg static build for Windows
$ErrorActionPreference = "Stop"

$ffmpegDir = Join-Path $PSScriptRoot "..\resources\ffmpeg"
$ffmpegExe = Join-Path $ffmpegDir "ffmpeg.exe"

if (Test-Path $ffmpegExe) {
    Write-Host "FFmpeg already exists at $ffmpegExe"
    exit 0
}

$url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
$zipPath = Join-Path $env:TEMP "ffmpeg-download.zip"
$extractPath = Join-Path $env:TEMP "ffmpeg-extract"

Write-Host "Downloading FFmpeg from $url..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

Write-Host "Extracting..."
if (Test-Path $extractPath) { Remove-Item -Recurse -Force $extractPath }
Expand-Archive -Path $zipPath -DestinationPath $extractPath

# Find ffmpeg.exe in extracted folder
$found = Get-ChildItem -Path $extractPath -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if (-not $found) {
    Write-Error "ffmpeg.exe not found in archive"
    exit 1
}

$binDir = $found.DirectoryName

if (-not (Test-Path $ffmpegDir)) {
    New-Item -ItemType Directory -Force -Path $ffmpegDir | Out-Null
}

Copy-Item (Join-Path $binDir "ffmpeg.exe") $ffmpegDir
Copy-Item (Join-Path $binDir "ffprobe.exe") $ffmpegDir -ErrorAction SilentlyContinue

# Cleanup
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "FFmpeg installed to $ffmpegDir"
