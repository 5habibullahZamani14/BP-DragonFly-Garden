@echo off
echo Starting DragonFly Garden...
cd /d "c:\Anything Important\BP-DragonFly-Garden"
echo Changed directory to: %CD%
echo.
echo Checking backend...
netstat -ano | findstr ":5000"
if errorlevel 1 (
    echo Starting backend...
    start cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\restaurant-system\backend && npm run dev"
) else (
    echo Backend already running
)
echo.
echo Starting frontend...
start cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\frontend && npm run dev"
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
echo DO NOT simply close this window or the server windows directly!
echo Doing so may leave processes running in the background.
echo.
echo ========================================
echo Done.
echo ========================================
echo.
echo Press any key to close this window (after stopping servers if needed)...
pause >nul
