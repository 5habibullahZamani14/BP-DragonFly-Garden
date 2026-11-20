@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Create-App-Shortcuts.ps1"
if errorlevel 1 (
  echo.
  echo Shortcut setup failed.
  pause
  exit /b 1
)

exit /b 0
