# Script pour arrêter les processus sur les ports 3000 et 3001
# Usage: .\stop-port.ps1

Write-Host "🛑 Arrêt des processus sur les ports 3000 et 3001..." -ForegroundColor Cyan
Write-Host ""

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
                    Write-Host "   ✅ $Name arrêté" -ForegroundColor Green
                }
            } catch {
                # Ignorer les erreurs
            }
        }
    } else {
        Write-Host "   ℹ️  $Name n'est pas en cours d'exécution" -ForegroundColor Gray
    }
}

# Arrêter le frontend (port 3000)
Write-Host "🎨 Arrêt du frontend (port 3000)..." -ForegroundColor Cyan
Stop-Port -Port 3000 -Name "Frontend"

# Arrêter le port alternatif (port 3001)
Write-Host "🎨 Arrêt du port alternatif (port 3001)..." -ForegroundColor Cyan
Stop-Port -Port 3001 -Name "Port alternatif"

Write-Host ""
Write-Host "✅ Tous les processus ont été arrêtés" -ForegroundColor Green
Write-Host ""



