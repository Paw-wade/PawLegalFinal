@echo off
echo Liberation du port 3004...
powershell -ExecutionPolicy Bypass -File scripts\pre-dev.ps1 -Port 3004
if errorlevel 1 (
    echo Tentative alternative avec kill-port.js...
    node scripts\kill-port.js 3004
)
timeout /t 2 /nobreak >nul

