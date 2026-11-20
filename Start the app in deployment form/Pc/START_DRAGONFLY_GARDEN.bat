@echo off
setlocal
set "ROLE=%~1"
if not defined ROLE set "ROLE=manager"
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Start-DragonFlyGarden.ps1" -Role "%ROLE%"
exit /b 0
