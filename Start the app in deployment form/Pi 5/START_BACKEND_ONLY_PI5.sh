#!/bin/bash
echo "========================================"
echo "DragonFly Garden - Backend Only"
echo "Deployment Mode - Raspberry Pi 5"
echo "========================================"
echo ""

cd "/home/pi/BP-DragonFly-Garden"

echo "Checking if backend is already running..."
if netstat -tuln | grep -q ":5000"; then
    echo "Backend is already running on port 5000."
else
    echo "Starting backend server..."
    gnome-terminal -- bash -c "cd /home/pi/BP-DragonFly-Garden/restaurant-system/backend && npm start; exec bash"
    echo "Backend started successfully!"
    echo "Waiting for backend to initialize..."
    sleep 10
fi

echo ""
echo "========================================"
echo "IMPORTANT: HOW TO STOP THE BACKEND"
echo "========================================"
echo ""
echo "To gracefully stop the backend server:"
echo "1. Go to the terminal window that opened"
echo "2. Press Ctrl+C to stop the backend server"
echo "3. The terminal window will close automatically"
echo ""
echo "If the backend does not respond, stop its own DragonFly terminal process."
echo "Do not terminate unrelated Node.js processes."
echo ""
echo "DO NOT simply close the terminal window directly!"
echo "Doing so may leave processes running in the background."
echo ""
echo "========================================"
echo "Backend startup complete!"
echo "========================================"
echo ""

while true; do
    echo "Checking if backend is still running..."
    if netstat -tuln | grep -q ":5000"; then
        echo "Backend is still running on port 5000."
        echo ""
        echo "Options:"
        echo "[1] Keep monitoring (check again in 10 seconds)"
        echo "[2] Close this monitor (the backend will continue running)"
        echo ""
        read -p "Select option (1-2): " choice
        case $choice in
            1)
                sleep 10
                ;;
            2)
                exit 0
                ;;
            *)
                echo "Invalid option. Please select 1 or 2."
                ;;
        esac
    else
        echo "Backend is not running. Safe to close this window."
        echo ""
        echo "All processes have been stopped. Safe to close."
        echo "Press Enter to close this window..."
        read
        exit 0
    fi
done
