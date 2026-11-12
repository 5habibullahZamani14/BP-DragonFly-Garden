# BP Dragonfly Garden Cafe Ordering and Management System

This is the ordering and management system built for BP Dragonfly Garden Cafe Ordering and Management System, a small farm-to-table
cafe. The system lets customers browse the menu and place orders from their table by scanning a
customer table QR code, gives staff a live operational view after secure login, and provides a
payment counter and manager dashboard that require username/password authentication and
server-issued JWT sessions.

The entire system runs on the local Wi-Fi network inside the cafe. No internet connection is
required once the server is running. The initial deployment hardware was a Raspberry Pi 5.
The backend can also run on Windows laptops/desktops and Linux PCs with Node.js installed.

---

## How the system works

When a customer sits down, they scan the QR code printed on their table. The QR code connects
their phone to the cafe's local network and opens the web application in their browser. From
there they can browse the menu, add items to a cart, and place an order. The order is visible to
staff handling order fulfillment, and they can update its status as it moves from queued to
preparing to ready.

Payment counter staff sign in with their employee credentials and receive a server-issued JWT
session before they can view unpaid orders and process payments. The restaurant manager signs in
with their username and password and receives a dedicated manager JWT session to manage
employees, inventory, system settings, and logs.

---

## Project structure

```
BP-DragonFly-Garden/
  frontend/                  React 18 + Vite + TypeScript frontend application
    src/
      components/garden/     All main view components (customer, payment, management)
      lib/                   API client, WebSocket hook, accessibility context, shared types
      pages/                 Top-level route pages
  restaurant-system/
    backend/                 Node.js + Express backend API server
      src/
        controllers/         Business logic for each feature area
        routes/              HTTP route definitions
        middleware/          Request validation and role-based access control
        database/            SQLite schema, seed data, and database connection
        services/            Thermal printer integration
        utils/               Shared helper utilities
        constants/           Shared constants (order statuses, etc.)
```

---

## Technology stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Shadcn UI components, TanStack Query,
React Router, WebSocket (native browser API).

**Backend:** Node.js, Express 5, SQLite (sqlite3), WebSocket (ws), QRCode generation, Resend
(email service for password reset), dotenv.

---

## Running locally for development

You need Node.js 18 or newer. Open two terminal windows.

**Terminal 1 — Backend:**
```
cd restaurant-system/backend
npm install
npm run dev
```
The backend starts on port 5000 by default. It creates and seeds the database automatically
on first run.

**Terminal 2 — Frontend:**
```
cd frontend
npm install
npm run dev
```
The frontend dev server starts on port 5173. It proxies API requests to the backend at
port 5000, so both must be running at the same time during development.

Open http://localhost:5173 in your browser. Customer ordering is triggered by a table QR code
like `?qr=table-1`. Staff and manager access is opened through the dedicated login screens and
requires a valid username/password login plus the server-issued JWT session.

---

## Environment variables

The backend reads from `restaurant-system/backend/.env`. Copy `.env.example` to `.env` and
fill in the values before starting the server. The only required variable for basic operation
is `PORT` (defaults to 5000 if not set). The `RESEND_API_KEY` is needed only for the password
reset email feature.

Security-sensitive variables (required)

- `JWT_SECRET`: a long random secret used to sign manager JWTs and reset tokens. The backend
  will refuse to start if this is not set. Generate one with e.g. `openssl rand -hex 32`.
- `RESET_BASE_URL` (optional): URL prefix used in password-reset emails (e.g. `https://admin.example.com`).

Notes:
- Manager passwords are stored hashed with `bcrypt`. On first login, any legacy plaintext
  password will be migrated automatically to a secure bcrypt hash.

Security recommendations:
- Replace any placeholder API keys in `restaurant-system/backend/.env` (e.g. `RESEND_API_KEY`, `GROQ_API_KEY`) before deploying.

The frontend reads from `frontend/.env`. `VITE_API_BASE` is optional: local
development uses the Vite proxy, while production always uses the same origin
as the backend. Set `VITE_API_BASE` only when development needs a separate,
non-loopback backend.

---

## Deployment on a Windows PC or laptop

Install Node.js 20 LTS or newer, ensure the backend `.env` file and restaurant
database are present, then double-click
[`START_DRAGONFLY_GARDEN.bat`](./Start%20the%20app%20in%20deployment%20form/Pc/START_DRAGONFLY_GARDEN.bat).
The launcher installs missing dependencies, builds the frontend, starts the
backend (which serves the production frontend), and opens the app. It works
from the repository's current folder; it does not depend on a fixed `C:\` path.

The server listens on all network interfaces. For other devices to connect,
allow inbound TCP port 5000 through Windows Firewall and use the PC's LAN
address. The production frontend and its API/WebSocket connections use the
same host, so clients do not accidentally connect to their own `localhost`.
For a restaurant, a dedicated Wi-Fi router/access point is the most reliable
way to provide customer coverage.
For a manually configured hotspot, set `CAPTIVE_PORTAL_TARGET` in the backend
`.env` to that adapter's address (for example `http://192.168.137.1:5000/`);
leave it unset to use the detected LAN address. Open the manager UI through
that same address when generating customer QR codes.

The app cannot reliably enable a Wi-Fi hotspot automatically on every laptop:
hotspot support, Wi-Fi adapter capabilities, OS permissions, and upstream
network-sharing rules vary by device and operating system. Configure Windows
Mobile Hotspot, macOS Internet Sharing, or Linux NetworkManager/hostapd
manually, or use a router. A captive-portal prompt is also controlled by each
customer device and is not guaranteed; table QR codes should point directly to
the server's LAN address.

Printer discovery runs when the manager opens Printer Management and refreshes
every 60 seconds while that section remains open. Selecting a default printer
also makes it the active printer for new print jobs. The printer must still be
installed or paired by the operating system and supported by its driver/print
queue. Bluetooth discovery can find printer devices exposed by the OS (usually
paired devices); the app cannot silently pair every nearby Bluetooth printer.
USB access and raw thermal printing likewise depend on OS drivers, permissions,
and printer support.

The production frontend build targets current Chrome/Edge (105+), Firefox
(121+), and Safari (15.4+). Browser vendors, OS versions, and device-specific
features can still affect rendering; this does not guarantee support for every
historical browser version.

On macOS or Linux, install Node.js 20 LTS or newer, configure
`restaurant-system/backend/.env`, then run `npm ci` and `npm run build` in
`frontend/`; run `npm ci` and `npm start` in `restaurant-system/backend/`.
The backend serves the built frontend on port 5000.

## Deployment on Raspberry Pi

Build the frontend first, then start the backend. The Express server detects the built
frontend and serves it as static files alongside the API.

```
cd frontend && npm install && npm run build
cd ../restaurant-system/backend && npm install && npm run start
```

On the Pi, make sure backend config allows the local hotspot origin:

- `HOST=0.0.0.0`
- `PORT=5000`
- `CORS_ALLOWED_ORIGINS=http://10.42.0.1:5000`
- `CAPTIVE_PORTAL_TARGET=http://10.42.0.1:5000/`

If `CAPTIVE_PORTAL_TARGET` is set in the backend environment, it will take precedence over the runtime value stored in `restaurant_settings`.

If you want development access from the Vite dev server as well, you can include:

- `http://localhost:5173`

### systemd service example

Create `/etc/systemd/system/dragonfly-garden.service` on the Raspberry Pi with:

```ini
[Unit]
Description=Dragonfly Garden Backend
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/BP-DragonFly-Garden/restaurant-system/backend
EnvironmentFile=/home/pi/BP-DragonFly-Garden/restaurant-system/backend/.env
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5s
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

Then enable and start it:

```
sudo systemctl daemon-reload
sudo systemctl enable --now dragonfly-garden.service
sudo systemctl status dragonfly-garden.service
```

Access the app from any device on the Pi network at `http://10.42.0.1:5000`.
