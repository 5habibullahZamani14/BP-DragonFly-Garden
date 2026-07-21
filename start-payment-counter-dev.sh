#!/bin/bash
# DragonFly Garden - Payment Counter View (Development Mode)

cd "$(dirname "$0")"

echo "========================================"
echo "DragonFly Garden - Payment Counter View"
echo "Development Mode"
echo "========================================"
echo ""

# Check if backend is already running
echo "Checking if backend is running..."
if pgrep -f "node.*server.js" > /dev/null; then
    echo "Backend is already running."
    echo "WARNING: Will not kill existing backend on exit."
    BACKEND_EXISTS=1
else
    echo "Starting backend server..."
    cd restaurant-system/backend && npm run dev &
    BACKEND_PID=$!
    cd ../..
    echo "Waiting for backend to start..."
    sleep 5
    echo "Backend started."
    BACKEND_EXISTS=0
fi

echo ""
echo "Starting frontend development server..."
cd frontend && npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "Waiting for frontend to start..."
sleep 8

echo ""
echo "Detecting local IP address..."
SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    echo "Could not detect IP address, using localhost..."
    SERVER_IP=localhost
else
    echo "Using server IP: $SERVER_IP"
fi
echo ""
echo "Opening browser to Payment Counter View..."
if command -v xdg-open > /dev/null; then
    xdg-open http://$SERVER_IP:3000/?qr=payment-counter-1
elif command -v open > /dev/null; then
    open http://$SERVER_IP:3000/?qr=payment-counter-1
else
    echo "Please open http://$SERVER_IP:3000/?qr=payment-counter-1 in your browser"
fi

echo ""
echo "========================================"
echo "Payment Counter View launched successfully!"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop all servers..."

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping servers..."
    
    # Stop frontend (always started by this script)
    echo "Stopping frontend..."
    kill $FRONTEND_PID 2>/dev/null
    
    # Stop backend only if we started it
    if [ "$BACKEND_EXISTS" -eq 0 ]; then
        echo "Stopping backend..."
        kill $BACKEND_PID 2>/dev/null
    else
        echo "Skipping backend shutdown (was already running)"
    fi
    
    echo ""
    echo "All servers stopped. Goodbye!"
    exit 0
}

# Set trap for cleanup on Ctrl+C
trap cleanup SIGINT SIGTERM

# Keep script running
wait
