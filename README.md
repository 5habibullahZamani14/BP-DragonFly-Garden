# BP DragonFly Garden — Cafe Ordering System

This is the ordering and management system built for BP DragonFly Garden, a small farm-to-table
cafe. The system lets customers browse the menu and place orders from their table by scanning a
QR code, gives the kitchen crew a live view of incoming orders, and provides a payment counter
and a manager dashboard for day-to-day operations.

The entire system runs on the local Wi-Fi network inside the cafe. No internet connection is
required once the server is running. The intended deployment hardware is a Raspberry Pi 4,
though it runs equally well on any machine with Node.js installed.

---

## How the system works

When a customer sits down, they scan the QR code printed on their table. The QR code connects
their phone to the cafe's local network and opens the web application in their browser. From
there they can browse the menu, add items to a cart, and place an order. The order goes to the
kitchen instantly, where the kitchen crew can see it and update its status as it moves from
queued to preparing to ready.

A separate QR code is used by the payment counter staff to view all unpaid orders and process
payments. Another QR code gives the restaurant manager access to a dashboard where they can
manage employees, inventory, system settings, and view logs.

---

## Project structure

```
BP-DragonFly-Garden/
  frontend/                  React 18 + Vite + TypeScript frontend application
    src/
      components/garden/     All main view components (customer, kitchen, payment, management)
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

Open http://localhost:5173 in your browser. To simulate a specific role, append the QR
parameter to the URL: `?qr=table-1` for the customer view, `?qr=kitchen-crew-main` for the
kitchen view, `?qr=payment-counter-main` for the payment counter, or `?qr=manager-main`
for the manager dashboard.

---

## Environment variables

The backend reads from `restaurant-system/backend/.env`. Copy `.env.example` to `.env` and
fill in the values before starting the server. The only required variable for basic operation
is `PORT` (defaults to 5000 if not set). The `RESEND_API_KEY` is needed only for the password
reset email feature.

The frontend reads from `frontend/.env`. The only variable is `VITE_API_BASE`, which should
point to the backend server address. During local development this is handled automatically
by the Vite proxy, so no `.env` change is needed for dev.

---

## Deployment on Raspberry Pi

Build the frontend first, then start the backend. The Express server detects the built
frontend and serves it as static files alongside the API.

```
cd frontend && npm install && npm run build
cd ../restaurant-system/backend && node src/server.js
```

Access the application from any device connected to the cafe's Wi-Fi by navigating to the
Raspberry Pi's local IP address on port 5000.
