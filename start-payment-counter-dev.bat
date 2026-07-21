@echo off
setlocal enabledelayedexpansion
echo ========================================
echo DragonFly Garden - Payment Counter View
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
echo Opening browser to Payment Counter View...
start http://%SERVER_IP%:3000/?qr=payment-counter-1

echo.
echo ========================================
echo Payment Counter View launched successfully!
echo ========================================
echo.
echo This window will close automatically in 5 seconds...
timeout /t 5 /nobreak >nul
