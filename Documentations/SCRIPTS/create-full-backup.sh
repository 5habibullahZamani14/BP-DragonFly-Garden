#!/bin/bash
# Create Full Backup Script for Raspberry Pi
# This creates a tar.gz file with all important data

echo "========================================"
echo "DragonFly Garden - Create Full Backup"
echo "========================================"
echo

# Set the project folder
PROJECT_FOLDER="/home/pi/BP-DragonFly-Garden"

# Create backup folder
BACKUP_FOLDER="$PROJECT_FOLDER/backup"
mkdir -p "$BACKUP_FOLDER"

echo "Creating backup..."
echo

# Copy .env file
if [ -f "$PROJECT_FOLDER/restaurant-system/backend/.env" ]; then
    cp "$PROJECT_FOLDER/restaurant-system/backend/.env" "$BACKUP_FOLDER/"
    echo "Copied .env file"
else
    echo "WARNING: .env file not found"
fi

# Copy database
if [ -f "$PROJECT_FOLDER/restaurant-system/backend/src/database/database.sqlite" ]; then
    cp "$PROJECT_FOLDER/restaurant-system/backend/src/database/database.sqlite" "$BACKUP_FOLDER/"
    echo "Copied database.sqlite"
else
    echo "WARNING: database.sqlite not found"
fi

# Copy menu images
if [ -d "$PROJECT_FOLDER/frontend/public/menu-images" ]; then
    cp -r "$PROJECT_FOLDER/frontend/public/menu-images" "$BACKUP_FOLDER/"
    echo "Copied menu-images"
else
    echo "WARNING: menu-images folder not found"
fi

# Copy feedback images
if [ -d "$PROJECT_FOLDER/frontend/public/feedback-images" ]; then
    cp -r "$PROJECT_FOLDER/frontend/public/feedback-images" "$BACKUP_FOLDER/"
    echo "Copied feedback-images"
else
    echo "WARNING: feedback-images folder not found"
fi

echo
echo "Creating tar.gz file..."

# Get current date
DATE_STR=$(date +%Y%m%d)

# Create tar.gz
cd "$BACKUP_FOLDER"
tar -czf "$PROJECT_FOLDER/dragonfly-backup-$DATE_STR.tar.gz" .

echo
echo "Backup created: $PROJECT_FOLDER/dragonfly-backup-$DATE_STR.tar.gz"
echo

# Clean up
rm -rf "$BACKUP_FOLDER"

echo "Done!"