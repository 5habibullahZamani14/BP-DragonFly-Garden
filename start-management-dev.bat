@echo off
title DragonFly Garden - Management View (Development Mode)
cd /d "c:\Anything Important\BP-DragonFly-Garden"

echo ========================================
echo DragonFly Garden - Management View
echo Development Mode
echo ========================================
echo.

REM Check if backend is already running
echo Checking if backend is running...
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Backend is already running.
    echo WARNING: Will not kill existing backend on exit.
    set BACKEND_EXISTS=1
) else (
    echo Starting backend server...
    start "DragonFly Backend" cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\restaurant-system\backend && npm run dev"
    echo Waiting for backend to start...
    timeout /t 5 /nobreak >nul
    echo Backend started.
    set BACKEND_EXISTS=0
)

echo.
echo Starting frontend development server...
start "DragonFly Frontend" cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\frontend && npm run dev"

echo.
echo Waiting for frontend to start...
timeout /t 8 /nobreak >nul

echo.
echo Opening browser to Management View...
start http://localhost:5173/?qr=manager-1

echo.
echo ========================================
echo Management View launched successfully!
echo ========================================
echo.
echo Press any key to close this window and stop all servers...
echo (Servers started by this script will be stopped)
pause >nul

echo.
echo Stopping servers...

REM Stop frontend (always started by this script)
echo Stopping frontend...
taskkill /FI "WINDOWTITLE eq DragonFly Frontend*" /F >nul 2>&1

REM Stop backend only if we started it
if "%BACKEND_EXISTS%"=="0" (
    echo Stopping backend...
    taskkill /FI "WINDOWTITLE eq DragonFly Backend*" /F >nul 2>&1
) else (
    echo Skipping backend shutdown (was already running)
)

echo.
echo All servers stopped. Goodbye!
timeout /t 2 /nobreak >nul
