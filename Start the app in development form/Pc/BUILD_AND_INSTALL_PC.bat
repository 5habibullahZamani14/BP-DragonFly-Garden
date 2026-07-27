@echo off
setlocal enabledelayedexpansion
echo ========================================
echo DragonFly Garden - Build & Install
echo Development Mode - PC
echo ========================================
echo.

cd /d "c:\Anything Important\BP-DragonFly-Garden"

echo Step 1: Installing backend dependencies...
cd restaurant-system\backend
call npm install
if errorlevel 1 (
    echo ERROR: Backend dependency installation failed!
    pause
    exit /b 1
)
echo Backend dependencies installed successfully!
echo.

cd /d "c:\Anything Important\BP-DragonFly-Garden"

echo Step 2: Building frontend...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: Frontend dependency installation failed!
    pause
    exit /b 1
)
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed!
    pause
    exit /b 1
)
echo Frontend built successfully!
echo.

cd /d "c:\Anything Important\BP-DragonFly-Garden"

echo Step 3: Starting backend server...
echo Checking if backend is already running...
netstat -ano | findstr ":5000" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting backend server...
    start "DragonFly Backend" cmd /k "cd /d c:\Anything Important\BP-DragonFly-Garden\restaurant-system\backend && npm run dev"
    echo Backend started successfully!
    set BACKEND_STARTED=1
    echo Waiting for backend to initialize...
    timeout /t 10 /nobreak >nul
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
echo If the backend does not respond to Ctrl+C:
echo 1. Press Ctrl+Shift+Esc to open Task Manager
echo 2. Find and end the "node.exe" process
echo 3. Or run: taskkill /F /IM node.exe
echo.
echo DO NOT simply close this window or the backend window directly!
echo Doing so may leave processes running in the background.
echo.
echo ========================================
echo Build, install, and backend startup complete!
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
    echo [2] Force kill backend process
    echo [3] Close this window anyway (NOT RECOMMENDED)
    echo.
    choice /C 123 /N /M "Select option (1-3): "
    if errorlevel 3 goto :FORCE_CLOSE
    if errorlevel 2 goto :KILL_BACKEND
    if errorlevel 1 goto :WAIT_AND_CHECK
)

:WAIT_AND_CHECK
timeout /t 10 /nobreak >nul
goto :MONITOR_LOOP

:KILL_BACKEND
echo.
echo Attempting to kill backend process...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
    echo No node processes found or already killed.
) else (
    echo Backend process killed successfully.
)
timeout /t 2 /nobreak >nul
goto :MONITOR_LOOP

:FORCE_CLOSE
echo.
echo WARNING: You are closing this window while backend may still be running!
echo This may leave processes running in the background.
echo.
timeout /t 3 /nobreak >nul
exit

:SAFE_TO_CLOSE
echo.
echo All processes have been stopped. Safe to close.
echo Press any key to close this window...
pause >nul
