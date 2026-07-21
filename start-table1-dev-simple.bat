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
echo Done. This window will close automatically in 5 seconds...
timeout /t 5 /nobreak >nul
