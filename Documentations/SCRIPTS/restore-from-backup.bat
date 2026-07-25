@echo off
REM Restore from Backup Script for Windows Laptop
REM This restores all important data from a ZIP file

echo ========================================
echo DragonFly Garden - Restore from Backup
echo ========================================
echo.

REM Set the project folder
set PROJECT_FOLDER=C:\BP-DragonFly-Garden

REM Ask for backup file
set /p BACKUP_FILE="Enter the path to the backup ZIP file: "

if not exist "%BACKUP_FILE%" (
    echo ERROR: Backup file not found!
    pause
    exit /b 1
)

echo.
echo Extracting backup...

REM Create temp folder
set TEMP_FOLDER=%PROJECT_FOLDER%\restore-temp
if not exist "%TEMP_FOLDER%" mkdir "%TEMP_FOLDER%"

REM Extract ZIP
powershell -command "Expand-Archive -Path '%BACKUP_FILE%' -DestinationPath '%TEMP_FOLDER%' -Force"

echo.
echo Restoring files...

REM Stop the system if running
echo Stopping system if running...
taskkill /F /IM node.exe 2>nul

REM Restore .env file
if exist "%TEMP_FOLDER%\.env" (
    copy "%TEMP_FOLDER%\.env" "%PROJECT_FOLDER%\restaurant-system\backend\"
    echo Restored .env file
) else (
    echo WARNING: .env file not in backup
)

REM Restore database
if exist "%TEMP_FOLDER%\database.sqlite" (
    copy "%TEMP_FOLDER%\database.sqlite" "%PROJECT_FOLDER%\restaurant-system\backend\src\database\"
    echo Restored database.sqlite
) else (
    echo WARNING: database.sqlite not in backup
)

REM Restore menu images
if exist "%TEMP_FOLDER%\menu-images" (
    xcopy /E /I /Y "%TEMP_FOLDER%\menu-images" "%PROJECT_FOLDER%\frontend\public\menu-images\"
    echo Restored menu-images
) else (
    echo WARNING: menu-images folder not in backup
)

REM Restore feedback images
if exist "%TEMP_FOLDER%\feedback-images" (
    xcopy /E /I /Y "%TEMP_FOLDER%\feedback-images" "%PROJECT_FOLDER%\frontend\public\feedback-images\"
    echo Restored feedback-images
) else (
    echo WARNING: feedback-images folder not in backup
)

echo.
echo Cleaning up...

REM Clean up temp folder
rmdir /S /Q "%TEMP_FOLDER%"

echo.
echo Restore complete!
echo.
echo To start the system:
echo   cd %PROJECT_FOLDER%\restaurant-system\backend
echo   npm run start
echo.

pause