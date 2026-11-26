@echo off
setlocal enabledelayedexpansion
echo ========================================
echo DragonFly Garden - Backend Only
echo Development Mode - PC
echo ========================================
echo.

cd /d "c:\Anything Important\BP-DragonFly-Garden"

echo Checking if backend is already running...
netstat -ano | findstr ":5000" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting backend server...
    start "DragonFly Backend" cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\restaurant-system\backend && npm run dev"
    echo Backend started successfully!
    set BACKEND_STARTED=1
    echo Waiting for backend to initialize...
    timeout /t 5 /nobreak >nul
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
echo If the backend does not respond, stop its own DragonFly terminal process.
echo Do not terminate unrelated Node.js processes.
echo.
echo DO NOT simply close this window or the backend window directly!
echo Doing so may leave processes running in the background.
echo.
echo ========================================
echo Backend startup complete!
echo ========================================
echo.

:MONITOR_LOOP
echo Checking if backend is still running...
netstat -ano | findstr ":5000" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Backend is not running. Safe to close this window.
    goto :SAFE_TO_CLOSE
) else (
    echo Backend is still running on port 5000.
    echo.
    echo Options:
    echo [1] Keep monitoring (check again in 10 seconds)
    echo [2] Close this monitor (the backend will continue running)
    echo.
    choice /C 12 /N /M "Select option (1-2): "
    if errorlevel 2 goto :CLOSE_MONITOR
    if errorlevel 1 goto :WAIT_AND_CHECK
)

:WAIT_AND_CHECK
timeout /t 10 /nobreak >nul
goto :MONITOR_LOOP

:CLOSE_MONITOR
echo.
echo Monitor closed. The backend remains in its own terminal window.
exit

:SAFE_TO_CLOSE
echo.
echo All processes have been stopped. Safe to close.
echo Press any key to close this window...
pause >nul
