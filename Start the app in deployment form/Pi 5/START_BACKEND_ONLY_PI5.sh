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
echo "If the backend does not respond to Ctrl+C:"
echo "1. Press Ctrl+Alt+Delete to open System Monitor"
echo "2. Find and end the 'node' process"
echo "3. Or run: pkill -9 node"
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
        echo "[2] Force kill all node processes"
        echo "[3] Close this window anyway (NOT RECOMMENDED)"
        echo ""
        read -p "Select option (1-3): " choice
        case $choice in
            1)
                sleep 10
                ;;
            2)
                echo ""
                echo "Attempting to kill all node processes..."
                pkill -9 node
                if [ $? -eq 0 ]; then
                    echo "All node processes killed successfully."
                else
                    echo "No node processes found or already killed."
                fi
                sleep 2
                ;;
            3)
                echo ""
                echo "WARNING: You are closing this window while backend may still be running!"
                echo "This may leave processes running in the background."
                echo ""
                sleep 3
                exit 0
                ;;
            *)
                echo "Invalid option. Please select 1, 2, or 3."
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
