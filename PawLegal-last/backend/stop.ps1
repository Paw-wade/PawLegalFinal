# Script PowerShell pour arrêter le backend et le frontend
# Usage: .\stop.ps1

Write-Host "🛑 Arrêt des serveurs..." -ForegroundColor Cyan
Write-Host ""

# Fonction pour arrêter les processus sur un port
function Stop-Port {
    param([int]$Port, [string]$Name)
    
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connections) {
        $processes = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($process in $processes) {
            try {
                $proc = Get-Process -Id $process -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "   Arrêt de $Name (PID: $process)..." -ForegroundColor Yellow
                    Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
                }
            } catch {
                # Ignorer les erreurs
            }
        }
        Write-Host "   ✅ $Name arrêté" -ForegroundColor Green
    } else {
        Write-Host "   ℹ️  $Name n'est pas en cours d'exécution" -ForegroundColor Gray
    }
}

# Arrêter le backend (port 3005)
Write-Host "🔧 Arrêt du backend (port 3005)..." -ForegroundColor Cyan
node scripts/kill-port.js 3005

# Arrêter le frontend (port 3000)
Write-Host "🎨 Arrêt du frontend (port 3000)..." -ForegroundColor Cyan
Stop-Port -Port 3000 -Name "Frontend"

# Arrêter le port alternatif (port 3001)
Write-Host "🎨 Arrêt du port alternatif (port 3001)..." -ForegroundColor Cyan
Stop-Port -Port 3001 -Name "Port alternatif"

Write-Host ""
Write-Host "✅ Tous les serveurs ont été arrêtés" -ForegroundColor Green
Write-Host ""

