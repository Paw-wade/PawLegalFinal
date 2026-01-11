# Script PowerShell pour démarrer le backend et le frontend
# Usage: .\start.ps1

Write-Host "🚀 Démarrage du Cabinet Juridique..." -ForegroundColor Cyan
Write-Host ""

# Vérifier que Node.js est installé
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js détecté: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js n'est pas installé. Veuillez l'installer depuis https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Vérifier que npm est installé
try {
    $npmVersion = npm --version
    Write-Host "✅ npm détecté: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm n'est pas installé." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📦 Vérification des dépendances..." -ForegroundColor Cyan

# Vérifier les dépendances du backend
if (-not (Test-Path "node_modules")) {
    Write-Host "⚠️  Installation des dépendances backend..." -ForegroundColor Yellow
    npm install
}

# Vérifier les dépendances du frontend
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "⚠️  Installation des dépendances frontend..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

Write-Host "✅ Dépendances vérifiées" -ForegroundColor Green
Write-Host ""

# Vérifier le fichier .env
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  Le fichier .env n'existe pas. Création..." -ForegroundColor Yellow
    @"
MONGODB_URI=mongodb+srv://paw:BVFy4FC8Of5hBIn@pawlegalnew.zeenzkp.mongodb.net/
PORT=3005
JWT_SECRET=your-secret-key-change-this-in-production
"@ | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "✅ Fichier .env créé" -ForegroundColor Green
}

Write-Host ""
Write-Host "🔧 Démarrage des serveurs..." -ForegroundColor Cyan
Write-Host ""

# Fonction pour vérifier si un port est utilisé
function Test-Port {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

# Vérifier le port 3005 (backend)
if (Test-Port -Port 3005) {
    Write-Host "⚠️  Le port 3005 est déjà utilisé. Libération du port..." -ForegroundColor Yellow
    node scripts/kill-port.js 3005
    Start-Sleep -Seconds 2
}

# Vérifier le port 3000 (frontend)
if (Test-Port -Port 3000) {
    Write-Host "⚠️  Le port 3000 est déjà utilisé. Libération du port..." -ForegroundColor Yellow
    # Pour le frontend, on utilise netstat car kill-port.js est pour le backend
    $process = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($process) {
        Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

Write-Host ""
Write-Host "🌐 Démarrage du backend sur le port 3005..." -ForegroundColor Cyan

# Démarrer le backend dans une nouvelle fenêtre
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host '🔧 Backend - Port 3005' -ForegroundColor Cyan; Write-Host ''; npm start" -WindowStyle Normal

# Attendre un peu pour que le backend démarre
Start-Sleep -Seconds 3

Write-Host "✅ Backend démarré" -ForegroundColor Green
Write-Host ""

Write-Host "🎨 Démarrage du frontend sur le port 3000..." -ForegroundColor Cyan

# Démarrer le frontend dans une nouvelle fenêtre
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; Write-Host '🎨 Frontend - Port 3000' -ForegroundColor Cyan; Write-Host ''; npm run dev" -WindowStyle Normal

Write-Host "✅ Frontend démarré" -ForegroundColor Green
Write-Host ""

# Attendre un peu pour que les serveurs démarrent
Start-Sleep -Seconds 5

Write-Host "🌐 Ouverture du navigateur..." -ForegroundColor Cyan

# Ouvrir le navigateur
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "✨ Tout est prêt !" -ForegroundColor Green
Write-Host ""
Write-Host "📍 URLs:" -ForegroundColor Cyan
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "   Backend API: http://localhost:3005" -ForegroundColor White
Write-Host ""
Write-Host "💡 Pour arrêter les serveurs, fermez les fenêtres PowerShell ou appuyez sur Ctrl+C" -ForegroundColor Yellow
Write-Host ""


