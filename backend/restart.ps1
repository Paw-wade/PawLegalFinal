# Tue tout ce qui utilise le port 3005
$pid = (netstat -ano | findstr :3005 | Select-String "LISTENING" | ForEach-Object { $_.ToString().Trim().Split()[-1] } | Select-Object -First 1)

if ($pid) {
    Write-Host "Arrêt du processus $pid sur le port 3005..."
    taskkill /PID $pid /F
    Start-Sleep -Seconds 1
}

Write-Host "Démarrage du serveur..."
npm start