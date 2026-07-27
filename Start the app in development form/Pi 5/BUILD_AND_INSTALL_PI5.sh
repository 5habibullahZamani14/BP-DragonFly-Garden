#!/bin/bash
echo "========================================"
echo "DragonFly Garden - Build & Install"
echo "Development Mode - Raspberry Pi 5"
echo "========================================"
echo ""

cd "/home/pi/BP-DragonFly-Garden"

echo "Step 1: Installing backend dependencies..."
cd restaurant-system/backend
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Backend dependency installation failed!"
    exit 1
fi
echo "Backend dependencies installed successfully!"
echo ""

cd "/home/pi/BP-DragonFly-Garden"

echo "Step 2: Building frontend..."
cd frontend
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Frontend dependency installation failed!"
    exit 1
fi
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Frontend build failed!"
    exit 1
fi
echo "Frontend built successfully!"
echo ""

cd "/home/pi/BP-DragonFly-Garden"

echo "Step 3: Starting backend server..."
echo "Checking if backend is already running..."
if netstat -tuln | grep -q ":5000"; then
    echo "Backend is already running on port 5000."
else
    echo "Starting backend server..."
    gnome-terminal -- bash -c "cd /home/pi/BP-DragonFly-Garden/restaurant-system/backend && npm run dev; exec bash"
    echo "Backend started successfully!"
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
echo "DO NOT simply close the terminal window directly!"
echo "Doing so may leave processes running in the background."
echo ""
echo "========================================"
echo "Build, install, and backend startup complete!"
echo "========================================"
echo ""
echo "Press Enter to close this window (after stopping backend if needed)..."
read
