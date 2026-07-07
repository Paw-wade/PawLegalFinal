# Copie les uploads depuis le VPS Coolify vers backend/uploads/documents/
# Prerequis : OpenSSH (Windows 10+) ou scp installe
#
# Usage (PowerShell, depuis backend/) :
#   $env:VPS_SSH_USER="root"
#   $env:VPS_SSH_HOST="51.75.203.65"
#   .\scripts\fetch-vps-uploads.ps1

param(
  [string]$SshUser = $(if ($env:VPS_SSH_USER) { $env:VPS_SSH_USER } else { "root" }),
  [string]$SshHost = $(if ($env:VPS_SSH_HOST) { $env:VPS_SSH_HOST } else { "51.75.203.65" }),
  [string]$RemotePath = $(if ($env:VPS_UPLOADS_PATH) { $env:VPS_UPLOADS_PATH } else { "/app/uploads/documents" }),
  [string]$LocalDir = "$PSScriptRoot\..\uploads\documents"
)

New-Item -ItemType Directory -Force -Path $LocalDir | Out-Null
$remote = "${SshUser}@${SshHost}:${RemotePath}/"
Write-Host "Copie $remote -> $LocalDir"
scp -r -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new $remote $LocalDir
if ($LASTEXITCODE -ne 0) {
  Write-Host "scp a echoue. Verifiez SSH, le chemin distant et que le VPS est en ligne."
  exit $LASTEXITCODE
}
Write-Host "Copie terminee. Executez: node scripts/recover-documents.js --apply --skip-remote"
exit 0
