# Install RunCanon CLI from your hosted instance (Windows PowerShell).
# Verifies SHA256 from the release manifest before installing.
#
# Usage:
#   irm http://127.0.0.1:3000/api/releases/install.ps1 | iex
param(
  [string]$Server = "{{SERVER_URL}}",
  [string]$Version = "",
  [string]$InstallDir = "$env:USERPROFILE\.local"
)

$ErrorActionPreference = "Stop"
$Server = $Server.TrimEnd("/")

$manifestUrl = "$Server/api/releases/latest?platform=win-x64"
if ($Version) { $manifestUrl += "&version=$Version" }

Write-Host "-> Fetching release manifest from $manifestUrl"
$meta = Invoke-RestMethod -Uri $manifestUrl
$artifact = $meta.recommended
$cliVersion = $meta.manifest.version

$tmp = Join-Path $env:TEMP ("runcanon-install-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
  $sumsUrl = "$Server$($meta.manifest.checksumsFile)"
  $sumsPath = Join-Path $tmp "SHA256SUMS"
  Invoke-WebRequest -Uri $sumsUrl -OutFile $sumsPath

  $archiveUrl = "$Server/downloads/v$cliVersion/$($artifact.file)"
  $archivePath = Join-Path $tmp $artifact.file
  Write-Host "-> Downloading $($artifact.file)"
  Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath

  Write-Host "-> Verifying SHA256"
  $hash = (Get-FileHash -Path $archivePath -Algorithm SHA256).Hash.ToLower()
  if ($hash -ne $artifact.sha256.ToLower()) {
    throw "Checksum mismatch: expected $($artifact.sha256) got $hash"
  }

  $target = Join-Path $InstallDir "runcanon\$cliVersion"
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Expand-Archive -Path $archivePath -DestinationPath $target -Force

  $binDir = Join-Path $InstallDir "bin"
  New-Item -ItemType Directory -Path $binDir -Force | Out-Null
  $cmdSrc = Join-Path $target "bin\runcanon.cmd"
  $cmdDst = Join-Path $binDir "runcanon.cmd"
  Copy-Item -Force $cmdSrc $cmdDst

  Write-Host ""
  Write-Host "RunCanon CLI v$cliVersion installed."
  Write-Host "  runcanon login --server $Server --email you@company.com"
  Write-Host ""
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -notlike "*$binDir*") {
    Write-Host "Add to PATH: $binDir"
  }
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
