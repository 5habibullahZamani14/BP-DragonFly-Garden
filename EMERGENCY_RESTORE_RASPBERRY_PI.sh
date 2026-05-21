#!/bin/bash
echo "======================================================="
echo "   DRAGONFLY GARDEN - EMERGENCY RESTORE TOOL"
echo "======================================================="
echo ""
echo "WARNING: This will overwrite your current database with the latest cloud backup."
echo "Please ensure the restaurant server is CLOSED before continuing."
echo ""
read -p "Press Enter to continue..."
echo ""
echo "Starting restore process..."
cd restaurant-system/backend
node src/restoreBackup.js
echo ""
read -p "Press Enter to exit..."
