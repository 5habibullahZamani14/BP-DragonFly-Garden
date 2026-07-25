@echo off
REM Create Full Backup Script for Windows Laptop
REM This creates a ZIP file with all important data

echo ========================================
echo DragonFly Garden - Create Full Backup
echo ========================================
echo.

REM Set the project folder
set PROJECT_FOLDER=C:\BP-DragonFly-Garden

REM Create backup folder
set BACKUP_FOLDER=%PROJECT_FOLDER%\backup
if not exist "%BACKUP_FOLDER%" mkdir "%BACKUP_FOLDER%"

echo Creating backup...
echo.

REM Copy .env file
if exist "%PROJECT_FOLDER%\restaurant-system\backend\.env" (
    copy "%PROJECT_FOLDER%\restaurant-system\backend\.env" "%BACKUP_FOLDER%\"
    echo Copied .env file
) else (
    echo WARNING: .env file not found
)

REM Copy database
if exist "%PROJECT_FOLDER%\restaurant-system\backend\src\database\database.sqlite" (
    copy "%PROJECT_FOLDER%\restaurant-system\backend\src\database\database.sqlite" "%BACKUP_FOLDER%\"
    echo Copied database.sqlite
) else (
    echo WARNING: database.sqlite not found
)

REM Copy menu images
if exist "%PROJECT_FOLDER%\frontend\public\menu-images" (
    xcopy /E /I /Y "%PROJECT_FOLDER%\frontend\public\menu-images" "%BACKUP_FOLDER%\menu-images\"
    echo Copied menu-images
) else (
    echo WARNING: menu-images folder not found
)

REM Copy feedback images
if exist "%PROJECT_FOLDER%\frontend\public\feedback-images" (
    xcopy /E /I /Y "%PROJECT_FOLDER%\frontend\public\feedback-images" "%BACKUP_FOLDER%\feedback-images\"
    echo Copied feedback-images
) else (
    echo WARNING: feedback-images folder not found
)

echo.
echo Creating ZIP file...

REM Get current date
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set YYYY=%dt:~0,4%
set MM=%dt:~4,2%
set DD=%dt:~6,2%
set DATE_STR=%YYYY%%MM%%DD%

REM Create ZIP using PowerShell
powershell -command "Compress-Archive -Path '%BACKUP_FOLDER%\*' -DestinationPath '%PROJECT_FOLDER%\dragonfly-backup-%DATE_STR%.zip' -Force"

echo.
echo Backup created: %PROJECT_FOLDER%\dragonfly-backup-%DATE_STR%.zip
echo.

REM Clean up
rmdir /S /Q "%BACKUP_FOLDER%"

echo Done!
pause