@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
set "BACKEND=%ROOT%\restaurant-system\backend"
set "FRONTEND=%ROOT%\frontend"
set "ROLE=%~1"
set "PAGE="
if not defined ROLE set "ROLE=manager"

if /I "%ROLE%"=="manager" set "PAGE=/?view=manager"
if /I "%ROLE%"=="customer" set "PAGE=/?qr=table-1"
if /I "%ROLE%"=="payment" set "PAGE=/?view=payment"
if /I "%ROLE%"=="home" set "PAGE=/"
if not defined PAGE (
  echo Usage: START_DRAGONFLY_GARDEN.bat [manager^|customer^|payment^|home]
  pause
  exit /b 2
)

if not exist "%BACKEND%\src\server.js" (
  echo ERROR: Could not find the backend under "%BACKEND%".
  pause
  exit /b 1
)

echo ========================================
echo DragonFly Garden - PC/Laptop Server
echo ========================================
echo.

set "APP_ALREADY_RUNNING=0"
call :CHECK_HEALTH
if not errorlevel 1 (
  set "APP_ALREADY_RUNNING=1"
  goto :OPEN_APP
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo Port 5000 is already listening, but the DragonFly Garden health check failed.
  echo The launcher will not start a duplicate server. Check the process using port 5000.
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
set "APP_READY=0"
for /L %%I in (1,1,30) do (
  call :CHECK_HEALTH
  if not errorlevel 1 set "APP_READY=1"
  if "!APP_READY!"=="1" goto :OPEN_APP
  timeout /t 1 /nobreak >nul
)

echo ERROR: The server did not become ready. Check the DragonFly Garden Backend window.
pause
exit /b 1

:OPEN_APP
set "SERVER_IP="
for /f "delims=" %%A in ('powershell -NoProfile -Command "$configs=Get-NetIPConfiguration; foreach ($config in $configs) { if ($config.NetAdapter.Status -eq 'Up' -and $config.IPv4DefaultGateway) { $ip=$config.IPv4Address[0].IPAddress; if ($ip -and $ip -notlike '169.254.*') { $ip; break } } }; if (-not $ip) { foreach ($address in (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue)) { if ($address.IPAddress -ne '127.0.0.1' -and $address.IPAddress -notlike '169.254.*') { $address.IPAddress; break } } }"') do if not defined SERVER_IP set "SERVER_IP=%%A"
if not defined SERVER_IP set "SERVER_IP=localhost"
set "APP_URL=http://%SERVER_IP%:5000%PAGE%"

echo.
if "%APP_ALREADY_RUNNING%"=="1" (
  echo DragonFly Garden is already running. No duplicate server was started.
) else (
  echo DragonFly Garden is running.
)
echo Opening %ROLE% view: %APP_URL%
echo Customer devices on the same network can use http://%SERVER_IP%:5000
echo.
echo The frontend is served by the backend on port 5000; there is no separate production frontend process.
echo To stop a server started by this launcher, press Ctrl+C in the DragonFly Garden Backend window.
echo The backend will close WebSocket clients, the HTTP server, and the database gracefully.
echo Closing this launcher window does not stop the server.
echo.
start "" "%APP_URL%"
pause
exit /b 0

:CHECK_HEALTH
powershell -NoProfile -Command "try { if ((Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5000/health' -TimeoutSec 2).StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%
