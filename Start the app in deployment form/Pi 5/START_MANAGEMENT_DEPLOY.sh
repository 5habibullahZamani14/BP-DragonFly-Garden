#!/bin/bash
APP_ROOT="/home/pi/BP-DragonFly-Garden"

echo "DragonFly Garden - Management View (Raspberry Pi deployment)"
cd "$APP_ROOT" || { echo "ERROR: Project folder not found: $APP_ROOT"; exit 1; }

if [ ! -f "$APP_ROOT/frontend/dist/index.html" ]; then
    echo "Building the production frontend..."
    (cd "$APP_ROOT/frontend" && npm run build) || exit 1
fi

if ! curl -fsS http://127.0.0.1:5000/ready >/dev/null 2>&1; then
    if ! netstat -tuln | grep -q ":5000"; then
        echo "Starting the production backend..."
        gnome-terminal -- bash -c "cd '$APP_ROOT/restaurant-system/backend' && npm start; exec bash"
    else
        echo "Backend is running; waiting for readiness..."
    fi

    READY=0
    for attempt in $(seq 1 60); do
        if curl -fsS http://127.0.0.1:5000/ready >/dev/null 2>&1; then
            READY=1
            break
        fi
        sleep 1
    done
    if [ "$READY" -ne 1 ]; then
        echo "ERROR: Backend did not become ready within 60 seconds."
        exit 1
    fi
fi

SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP=localhost
fi
xdg-open "http://$SERVER_IP:5000/?view=manager"

echo "Management view opened. The backend serves the production frontend on port 5000."
echo "Stop the server with Ctrl+C in its terminal or use the manager's STOP control."
echo "Choose 1 to keep checking backend health, or 2 to close this monitor."

while true; do
    if curl -fsS http://127.0.0.1:5000/health >/dev/null 2>&1; then
        echo "[RUNNING] DragonFly Garden backend"
    else
        echo "[STOPPED] DragonFly Garden backend"
        exit 0
    fi

    read -r -p "[1] Check again in 10 seconds  [2] Close monitor: " choice
    case "$choice" in
        1) sleep 10 ;;
        2) exit 0 ;;
        *) echo "Choose 1 or 2." ;;
    esac
done
