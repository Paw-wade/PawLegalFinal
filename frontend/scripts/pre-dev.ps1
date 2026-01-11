param(
    [int]$Port = 3004
)

Write-Host "Libération du port $Port..." -ForegroundColor Yellow

$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue

if ($connections) {
    $processes = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    
    foreach ($processId in $processes) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Arrêt du processus: $($process.ProcessName) (PID: $processId)" -ForegroundColor Red
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
    
    Start-Sleep -Seconds 2
    
    # Vérifier que le port est bien libéré
    $remainingConnections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($remainingConnections) {
        Write-Host "Attention: Le port $Port pourrait encore être utilisé" -ForegroundColor Yellow
    } else {
        Write-Host "Port $Port libéré!" -ForegroundColor Green
    }
} else {
    Write-Host "Port $Port disponible" -ForegroundColor Green
}

