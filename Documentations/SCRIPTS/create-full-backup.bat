@echo off
setlocal
echo Dragonfly Garden - manual data backup
echo Stop the restaurant application before continuing.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-full-backup.ps1"
if errorlevel 1 (
  echo Backup failed. See the error above.
  pause
  exit /b 1
)
pause
