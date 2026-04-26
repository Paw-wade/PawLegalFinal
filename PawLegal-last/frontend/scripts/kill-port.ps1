param(
    [Parameter(Mandatory=$true)]
    [int]$Port
)

Write-Host "Recherche des processus utilisant le port $Port..." -ForegroundColor Yellow

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
    
    Write-Host "Port $Port libéré avec succès!" -ForegroundColor Green
} else {
    Write-Host "Aucun processus n'utilise le port $Port" -ForegroundColor Green
}
