@echo off
setlocal enabledelayedexpansion
echo ========================================
echo DragonFly Garden - Backend Only
echo Deployment Mode - PC
echo ========================================
echo.

cd /d "c:\Anything Important\BP-DragonFly-Garden"

echo Checking if backend is already running...
netstat -ano | findstr ":5000" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting backend server...
    start "DragonFly Backend" cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\restaurant-system\backend && npm start"
    echo Backend started successfully!
    set BACKEND_STARTED=1
) else (
    echo Backend is already running on port 5000.
    set BACKEND_STARTED=0
)

echo.
echo ========================================
echo IMPORTANT: HOW TO STOP THE BACKEND
echo ========================================
echo.
echo To gracefully stop the backend server:
echo 1. Go to the "DragonFly Backend" window that opened
echo 2. Press Ctrl+C to stop the backend server
echo 3. The backend window will close automatically
echo.
echo DO NOT simply close this window or the backend window directly!
echo Doing so may leave processes running in the background.
echo.
echo ========================================
echo Backend startup complete!
echo ========================================
echo.
echo Press any key to close this window (after stopping backend if needed)...
pause >nul
