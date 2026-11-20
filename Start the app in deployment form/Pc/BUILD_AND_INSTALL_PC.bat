@echo off
setlocal enabledelayedexpansion
for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
echo ========================================
echo DragonFly Garden - Build & Install
echo Deployment Mode - PC
echo ========================================
echo.

echo Step 1: Installing backend dependencies...
cd /d "%ROOT%\restaurant-system\backend"
call npm install
if errorlevel 1 (
    echo ERROR: Backend dependency installation failed!
    pause
    exit /b 1
)
echo Backend dependencies installed successfully!
echo.

echo Step 2: Building frontend for production...
cd /d "%ROOT%\frontend"
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
echo Frontend built successfully for production!
echo.

echo Build and dependency setup complete.
echo.
echo To start the application, create or use the Manager desktop shortcut.
echo The shortcut starts the backend in the background and opens the manager browser.
echo Stop the backend from Manager Settings - Server control.
echo.
pause
