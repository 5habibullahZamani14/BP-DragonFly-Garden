@echo off
setlocal
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Start-DragonFlyGarden.ps1" -Role none
exit /b 0
