@echo off
setlocal enabledelayedexpansion
echo Starting DragonFly Garden...
cd /d "c:\Anything Important\BP-DragonFly-Garden"
echo Changed directory to: %CD%
echo.
echo Checking backend...
netstat -ano | findstr ":5000"
if errorlevel 1 (
    echo Starting backend...
    start "DragonFly Backend" cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\restaurant-system\backend && npm run dev"
) else (
    echo Backend already running
)
echo.
echo Starting frontend...
start "DragonFly Frontend" cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\frontend && npm run dev"
echo.
echo Waiting 10 seconds...
timeout /t 10
echo.
echo Opening browser...
start http://localhost:3000/?qr=table-1
echo.
echo ========================================
echo IMPORTANT: HOW TO STOP THE SERVERS
echo ========================================
echo.
echo To gracefully stop the servers:
echo 1. Go to the backend window and press Ctrl+C
echo 2. Go to the frontend window and press Ctrl+C
echo 3. Both windows will close automatically
echo.
echo If servers do not respond to Ctrl+C:
echo 1. Press Ctrl+Shift+Esc to open Task Manager
echo 2. Find and end "node.exe" processes
echo 3. Or run: taskkill /F /IM node.exe
echo.
echo DO NOT simply close this window or the server windows directly!
echo Doing so may leave processes running in the background.
echo.
echo ========================================
echo Done.
echo ========================================
echo.

:MONITOR_LOOP
echo Checking server status...
netstat -ano | findstr ":5000" | findstr "LISTENING" >nul
set BACKEND_RUNNING=!errorlevel!
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
set FRONTEND_RUNNING=!errorlevel!

if !BACKEND_RUNNING! neq 0 (
    if !FRONTEND_RUNNING! neq 0 (
        echo Both servers are not running. Safe to close this window.
        goto :SAFE_TO_CLOSE
    )
)

echo.
if !BACKEND_RUNNING! equ 0 (
    echo [RUNNING] Backend server on port 5000
) else (
    echo [STOPPED] Backend server
)

if !FRONTEND_RUNNING! equ 0 (
    echo [RUNNING] Frontend server on port 3000
) else (
    echo [STOPPED] Frontend server
)

echo.
echo Options:
echo [1] Keep monitoring (check again in 10 seconds)
echo [2] Force kill all node processes
echo [3] Close this window anyway (NOT RECOMMENDED)
echo.
choice /C 123 /N /M "Select option (1-3): "
if errorlevel 3 goto :FORCE_CLOSE
if errorlevel 2 goto :KILL_ALL
if errorlevel 1 goto :WAIT_AND_CHECK

:WAIT_AND_CHECK
timeout /t 10 /nobreak >nul
goto :MONITOR_LOOP

:KILL_ALL
echo.
echo Attempting to kill all node processes...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
    echo No node processes found or already killed.
) else (
    echo All node processes killed successfully.
)
timeout /t 2 /nobreak >nul
goto :MONITOR_LOOP

:FORCE_CLOSE
echo.
echo WARNING: You are closing this window while servers may still be running!
echo This may leave processes running in the background.
echo.
timeout /t 3 /nobreak >nul
exit

:SAFE_TO_CLOSE
echo.
echo All processes have been stopped. Safe to close.
echo Press any key to close this window...
pause >nul
