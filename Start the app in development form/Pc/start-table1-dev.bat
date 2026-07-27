@echo off
setlocal enabledelayedexpansion
echo ========================================
echo DragonFly Garden - Table 1 Customer View
echo Development Mode
echo ========================================
echo.

cd /d "c:\Anything Important\BP-DragonFly-Garden"

echo Checking if backend is running...
netstat -ano | findstr ":5000" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting backend server...
    start "DragonFly Backend" cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\restaurant-system\backend && npm run dev"
    set BACKEND_STARTED=1
    echo Waiting for backend to start...
    timeout /t 5 /nobreak >nul
) else (
    echo Backend is already running.
    set BACKEND_STARTED=0
)

echo.
echo Checking if frontend is running...
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting frontend development server...
    start "DragonFly Frontend" cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\frontend && npm run dev"
    set FRONTEND_STARTED=1
    echo Waiting for frontend to start...
    timeout /t 8 /nobreak >nul
) else (
    echo Frontend is already running.
    set FRONTEND_STARTED=0
)

echo.
echo Detecting local IP address...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    for /f "tokens=*" %%b in ("%%a") do (
        set SERVER_IP=%%b
        set SERVER_IP=!SERVER_IP: =!
    )
)
if "%SERVER_IP%"=="" (
    echo Could not detect IP address, using localhost...
    set SERVER_IP=localhost
)
echo Using server IP: %SERVER_IP%
echo.
echo Opening browser to Table 1 Customer View...
start http://%SERVER_IP%:3000/?qr=table-1

echo.
echo ========================================
echo IMPORTANT: HOW TO STOP THE SERVERS
echo ========================================
echo.
echo To gracefully stop the servers:
echo 1. Go to the "DragonFly Backend" window and press Ctrl+C
echo 2. Go to the "DragonFly Frontend" window and press Ctrl+C
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
echo Table 1 Customer View launched successfully!
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
