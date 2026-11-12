@echo off
setlocal

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
set "BACKEND=%ROOT%\restaurant-system\backend"
set "FRONTEND=%ROOT%\frontend"

echo ========================================
echo DragonFly Garden - PC/Laptop Server
echo ========================================
echo.

if not exist "%BACKEND%\src\server.js" (
  echo ERROR: Could not find the backend under "%BACKEND%".
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js 20 LTS or newer is required. Install Node.js, then try again.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 (
  echo ERROR: Node.js 20 LTS or newer is required.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm was not found. Reinstall Node.js with npm included.
  pause
  exit /b 1
)

if not exist "%BACKEND%\.env" (
  echo ERROR: Backend configuration is missing:
  echo   "%BACKEND%\.env"
  echo Copy .env.example to .env and set a strong, private JWT_SECRET first.
  pause
  exit /b 1
)

if not exist "%BACKEND%\node_modules" (
  echo Installing backend dependencies...
  pushd "%BACKEND%"
  call npm ci
  if errorlevel 1 (
    popd
    echo ERROR: Backend dependency installation failed.
    pause
    exit /b 1
  )
  popd
)

if not exist "%FRONTEND%\node_modules" (
  echo Installing frontend dependencies...
  pushd "%FRONTEND%"
  call npm ci
  if errorlevel 1 (
    popd
    echo ERROR: Frontend dependency installation failed.
    pause
    exit /b 1
  )
  popd
)

echo Building the production frontend...
pushd "%FRONTEND%"
call npm run build
if errorlevel 1 (
  popd
  echo ERROR: Frontend build failed.
  pause
  exit /b 1
)
popd

echo Starting the backend server...
start "DragonFly Garden Backend" /D "%BACKEND%" cmd /k "npm start"

echo Waiting for the application to become ready...
for /L %%I in (1,1,30) do (
  powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5000/health' -TimeoutSec 2).StatusCode -eq 200 } catch { $false }" | findstr /i "True" >nul
  if not errorlevel 1 goto :READY
  timeout /t 1 /nobreak >nul
)

echo ERROR: The server did not become ready. Check the DragonFly Garden Backend window.
pause
exit /b 1

:READY
echo.
echo Application is ready at http://localhost:5000
echo LAN addresses (allow TCP port 5000 through Windows Firewall for other devices):
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { !$_.SkipAsSource -and !$_.IPAddress.StartsWith('169.254.') -and $_.IPAddress -ne '127.0.0.1' } | Select-Object -ExpandProperty IPAddress"
echo.
echo Wi-Fi hotspot startup is not automatic. Configure the OS hotspot or use a router.
echo Printer discovery refreshes every 60 seconds while Printer Management is open.
start "" "http://localhost:5000"
echo.
pause
