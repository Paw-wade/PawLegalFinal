@echo off
REM Script batch pour démarrer le backend et le frontend
REM Usage: start.bat

echo.
echo ========================================
echo   Cabinet Juridique - Demarrage
echo ========================================
echo.

REM Vérifier Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Node.js n'est pas installe.
    echo Veuillez installer Node.js depuis https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js detecte
echo.

REM Vérifier les dépendances backend
if not exist "node_modules" (
    echo [INFO] Installation des dependances backend...
    call npm install
)

REM Vérifier les dépendances frontend
if not exist "frontend\node_modules" (
    echo [INFO] Installation des dependances frontend...
    cd frontend
    call npm install
    cd ..
)

echo.
echo [INFO] Liberation du port 3005 si necessaire...
node scripts/kill-port.js 3005 >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo [INFO] Demarrage du backend sur le port 3005...
start "Backend - Port 3005" cmd /k "npm start"

timeout /t 3 /nobreak >nul

echo [INFO] Demarrage du frontend sur le port 3000...
start "Frontend - Port 3000" cmd /k "cd frontend && npm run dev"

timeout /t 5 /nobreak >nul

echo.
echo [INFO] Ouverture du navigateur...
start http://localhost:3000

echo.
echo ========================================
echo   Serveurs demarres avec succes !
echo ========================================
echo.
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:3005
echo.
echo Pour arreter les serveurs, fermez les fenetres de commande
echo.
pause


