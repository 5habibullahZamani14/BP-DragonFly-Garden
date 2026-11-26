#!/bin/bash
echo "========================================"
echo "DragonFly Garden - Payment Counter View"
echo "Development Mode - Raspberry Pi 5"
echo "========================================"
echo ""

cd "/home/pi/BP-DragonFly-Garden"

echo "Checking if backend is running..."
if netstat -tuln | grep -q ":5000"; then
    echo "Backend is already running."
else
    echo "Starting backend server..."
    gnome-terminal -- bash -c "cd /home/pi/BP-DragonFly-Garden/restaurant-system/backend && npm run dev; exec bash"
    echo "Backend started successfully!"
    echo "Waiting for backend to start..."
    sleep 10
fi

echo ""
echo "Checking if frontend is running..."
if netstat -tuln | grep -q ":3000"; then
    echo "Frontend is already running."
else
    echo "Starting frontend development server..."
    gnome-terminal -- bash -c "cd /home/pi/BP-DragonFly-Garden/frontend && npm run dev; exec bash"
    echo "Frontend started successfully!"
    echo "Waiting for frontend to start..."
    sleep 8
fi

echo ""
echo "Detecting local IP address..."
SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    echo "Could not detect IP address, using localhost..."
    SERVER_IP=localhost
fi
echo "Using server IP: $SERVER_IP"
echo ""
echo "Opening browser to Payment Counter View..."
xdg-open "http://$SERVER_IP:3000/?view=payment"

echo ""
echo "========================================"
echo "IMPORTANT: HOW TO STOP THE SERVERS"
echo "========================================"
echo ""
echo "To gracefully stop the servers:"
echo "1. Go to the backend terminal window and press Ctrl+C"
echo "2. Go to the frontend terminal window and press Ctrl+C"
echo "3. Both terminal windows will close automatically"
echo ""
echo "If a server does not respond, stop its own terminal process."
echo "Do not terminate unrelated Node.js processes."
echo ""
echo "DO NOT simply close the terminal windows directly!"
echo "Doing so may leave processes running in the background."
echo ""
echo "========================================"
echo "Payment Counter View launched successfully!"
echo "========================================"
echo ""

while true; do
    echo "Checking server status..."
    BACKEND_RUNNING=0
    FRONTEND_RUNNING=0
    
    if netstat -tuln | grep -q ":5000"; then
        BACKEND_RUNNING=1
    fi
    
    if netstat -tuln | grep -q ":3000"; then
        FRONTEND_RUNNING=1
    fi
    
    if [ $BACKEND_RUNNING -eq 0 ] && [ $FRONTEND_RUNNING -eq 0 ]; then
        echo "Both servers are not running. Safe to close this window."
        echo ""
        echo "All processes have been stopped. Safe to close."
        echo "Press Enter to close this window..."
        read
        exit 0
    fi
    
    echo ""
    if [ $BACKEND_RUNNING -eq 1 ]; then
        echo "[RUNNING] Backend server on port 5000"
    else
        echo "[STOPPED] Backend server"
    fi
    
    if [ $FRONTEND_RUNNING -eq 1 ]; then
        echo "[RUNNING] Frontend server on port 3000"
    else
        echo "[STOPPED] Frontend server"
    fi
    
    echo ""
    echo "Options:"
    echo "[1] Keep monitoring (check again in 10 seconds)"
    echo "[2] Close this monitor (servers will continue running)"
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
done
