# BP Dragonfly Garden Cafe Ordering and Management System

This is the ordering and management system built for BP Dragonfly Garden Cafe Ordering and Management System, a small farm-to-table
cafe. The system lets customers browse the menu and place orders from their table by scanning a
customer table QR code, gives staff a live operational view after secure login, and provides a
payment counter and manager dashboard that require username/password authentication and
server-issued JWT sessions held in HttpOnly cookies.

Core ordering and management run on the local Wi-Fi network inside the cafe. Optional email
and cloud-backup integrations, and downloading code updates, require internet access. The
initial deployment hardware was a Raspberry Pi 5.
The backend can also run on Windows laptops/desktops and Linux PCs with Node.js installed.

---

## How the system works

When a customer sits down, they connect their phone to the cafe's local network and scan the
QR code printed on their table. The QR code opens the web application in their browser; it
does not itself connect the phone to Wi-Fi. From there they can browse the menu, add items
to a cart, and place an order. The order is visible to
staff handling order fulfillment, and they can update its status as it moves from queued to
preparing to ready.

Payment counter staff sign in with their employee credentials and receive a server-issued session
cookie before they can view unpaid orders and process payments. The restaurant manager signs in
with their username and password and receives a separate manager session cookie to manage
employees, inventory, system settings, and logs.

## Product scope decision

The manager chatbot (DragonBot) was an optional bonus feature and has been removed from the
current application at the restaurant owner's request. The owner felt it added unnecessary
weight and slowed the system. The separate customer-feedback analysis feature remains available.

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
        services/            Printer, backup, and other integrations
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

Use Node.js 20 or newer. Open two terminal windows.

**Terminal 1 — Backend:**
```
cd restaurant-system/backend
npm ci
npm run dev
```
The backend starts on port 5000 by default. It creates and seeds the database automatically
on first run.

**Terminal 2 — Frontend:**
```
cd frontend
npm ci
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
fill in the values before starting the server. `JWT_SECRET` is required for secure
authentication; `PORT` defaults to 5000. `RESEND_API_KEY` is needed only for the password
reset email feature.

Security-sensitive variables (required)

- `JWT_SECRET`: a long random secret used to sign manager JWTs and reset tokens. The backend
  will refuse to start if this is not set. Generate one with e.g. `openssl rand -hex 32`.
- `RESET_BASE_URL` (optional): URL prefix used in password-reset emails (e.g. `https://admin.example.com`).

Notes:
- Manager passwords are stored hashed with `bcrypt`. On first login, any legacy plaintext
  password will be migrated automatically to a secure bcrypt hash.

Security recommendations:
- Replace placeholder service keys in `restaurant-system/backend/.env` before deploying. `RESEND_API_KEY` enables password-reset email; optional `GROQ_API_KEY` enables AI-generated feedback insights. Feedback analysis remains available without the Groq key.

Manager and payment-counter JWTs are sent only as role-specific `HttpOnly`,
`SameSite=Strict` cookies; they are not returned in login JSON, saved in browser
storage, or placed in WebSocket URLs. Customer feedback access uses a separate
`HttpOnly` cookie and server-side session mapping; feedback access tokens are
not returned to page scripts or stored in browser storage. Existing feedback
references are migrated on their next successful refresh. The frontend build
also scans its public output for common credential formats. These protections
prevent page scripts from reading session cookies, but the person controlling
the browser can still inspect their own network traffic and cookies in developer
tools. Use HTTPS on untrusted networks because cookies sent over plain HTTP can
be intercepted.
When the frontend is hosted on a different origin, configure
`CORS_ALLOWED_ORIGINS` with its exact origin. The current strict-cookie setup
supports same-site deployments; a frontend hosted on a different site requires
an explicit HTTPS and CSRF design change rather than simply enabling CORS.

The frontend reads from `frontend/.env`. `VITE_API_BASE` is optional: local
development uses the Vite proxy, while production always uses the same origin
as the backend. Set `VITE_API_BASE` only when development needs a separate,
non-loopback backend.

---

## Deployment on a Windows PC or laptop

Install Node.js 20 or newer and create a machine-specific backend `.env` file. Use
the Manager, Employee, or Customer desktop shortcut for a no-console launch; the
manager batch launcher is also available at
[`START_DRAGONFLY_GARDEN.bat`](./Start%20the%20app%20in%20deployment%20form/Pc/START_DRAGONFLY_GARDEN.bat).
The desktop shortcuts start the backend without a visible command window and open
the selected role in a browser. Each launcher checks the readiness endpoint and
reuses a healthy server. If
the server is not running, it installs missing dependencies, builds the frontend,
starts the backend in the background, and waits for `/ready` before opening the
browser. In production the backend serves the frontend on port 5000; there is no
separate frontend server on port 3000. The launchers work from the repository's
current folder and do not depend on a fixed `C:\` path.

To create Manager, Employee, and Customer desktop icons, double-click
[`CREATE_APP_SHORTCUTS.bat`](./CREATE_APP_SHORTCUTS.bat) in the repository root.
It runs `Create-App-Shortcuts.ps1`, uses the icons in `ICONS\ICO`, and creates
shortcuts that launch the hidden PowerShell startup script directly. After cloning
the repository on another PC,
double-click the batch file there to create shortcuts with paths and icons for
that PC.

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

Closing a browser only closes that browser window; the backend continues running
for other staff and customer devices. To stop the backend for everyone, sign in
as manager and use **Settings → Server control → Stop backend for everyone**.
The server rejects new requests, stops scheduled jobs, closes WebSocket sessions,
waits for active background jobs and in-flight HTTP requests, closes SQLite, and
then exits. To use the app again, open any role shortcut; it starts a new backend
if one is not already healthy. Startup and server output are saved under
`restaurant-system\backend\logs`.

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

On macOS or Linux, install Node.js 20 or newer, configure
`restaurant-system/backend/.env`, then run `npm ci` and `npm run build` in
`frontend/`; run `npm ci` and `npm start` in `restaurant-system/backend/`.
The backend serves the built frontend on port 5000.

## Deployment on Raspberry Pi

Build the frontend first, then start the backend. The Express server detects the built
frontend and serves it as static files alongside the API.

```
cd frontend && npm ci && npm run build
cd ../restaurant-system/backend && npm ci && npm run start
```

On the Pi, make sure backend config allows the local hotspot origin:

- `HOST=0.0.0.0`
- `PORT=5000`
- `CORS_ALLOWED_ORIGINS=http://10.42.0.1:5000`
- `CAPTIVE_PORTAL_TARGET=http://10.42.0.1:5000/`

If `CAPTIVE_PORTAL_TARGET` is set in the backend environment, it will take precedence over the runtime value stored in `restaurant_settings`.

If you want development access from the Vite dev server as well, you can include:

- `http://localhost:5173`

For systemd setup, use [02.4-SYSTEMD_SERVICES.md](./Documentations/02.4-SYSTEMD_SERVICES.md);
the service account, project path, and Node executable must match the target Pi. See
[02.2-NETWORK_HOTSPOT.md](./Documentations/02.2-NETWORK_HOTSPOT.md) before assuming the
Pi address is `10.42.0.1`.
