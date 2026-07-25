#!/bin/bash
# Restore from Backup Script for Raspberry Pi
# This restores all important data from a tar.gz file

echo "========================================"
echo "DragonFly Garden - Restore from Backup"
echo "========================================"
echo

# Set the project folder
PROJECT_FOLDER="/home/pi/BP-DragonFly-Garden"

# Ask for backup file
read -p "Enter the path to the backup tar.gz file: " BACKUP_FILE

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found!"
    exit 1
fi

echo
echo "Extracting backup..."

# Create temp folder
TEMP_FOLDER="$PROJECT_FOLDER/restore-temp"
mkdir -p "$TEMP_FOLDER"

# Extract tar.gz
tar -xzf "$BACKUP_FILE" -C "$TEMP_FOLDER"

echo
echo "Restoring files..."

# Stop the system if running
echo "Stopping system if running..."
sudo systemctl stop dragonfly-garden 2>/dev/null

# Restore .env file
if [ -f "$TEMP_FOLDER/.env" ]; then
    sudo cp "$TEMP_FOLDER/.env" "$PROJECT_FOLDER/restaurant-system/backend/"
    echo "Restored .env file"
else
    echo "WARNING: .env file not in backup"
fi

# Restore database
if [ -f "$TEMP_FOLDER/database.sqlite" ]; then
    sudo cp "$TEMP_FOLDER/database.sqlite" "$PROJECT_FOLDER/restaurant-system/backend/src/database/"
    echo "Restored database.sqlite"
else
    echo "WARNING: database.sqlite not in backup"
fi

# Restore menu images
if [ -d "$TEMP_FOLDER/menu-images" ]; then
    sudo cp -r "$TEMP_FOLDER/menu-images" "$PROJECT_FOLDER/frontend/public/"
    echo "Restored menu-images"
else
    echo "WARNING: menu-images folder not in backup"
fi

# Restore feedback images
if [ -d "$TEMP_FOLDER/feedback-images" ]; then
    sudo cp -r "$TEMP_FOLDER/feedback-images" "$PROJECT_FOLDER/frontend/public/"
    echo "Restored feedback-images"
else
    echo "WARNING: feedback-images folder not in backup"
fi

echo
echo "Cleaning up..."

# Clean up temp folder
rm -rf "$TEMP_FOLDER"

echo
echo "Restore complete!"
echo
echo "To start the system:"
echo "  sudo systemctl start dragonfly-garden"
echo