# DragonFly Garden — Cafe Restaurant Ordering System

## Overview
A QR-table ordering system for a cafe/restaurant. Customers can browse the menu and place orders that flow into a kitchen view; staff update order status as items move through preparation, ready, and served stages.

## Project Structure
- `frontend/` — React 19 + Vite SPA (customer + kitchen views in `src/App.jsx`).
- `restaurant-system/backend/` — Express 5 API server with a local SQLite database, role-based middleware, and printer service stubs.
- `restaurant-system/backend/src/database/` — SQLite schema initialization, seeders, and the `database.sqlite` file.

## Tech Stack
- **Frontend**: React 19, Vite 8, React Compiler (Babel preset).
- **Backend**: Node.js 20, Express 5, sqlite3, qrcode, cors.

## Replit Environment Setup
- **Frontend workflow** (`Frontend`): runs `npm --prefix frontend run dev` on port `5000`, host `0.0.0.0`, with all hosts allowed (Replit proxies the preview through an iframe).
- **Backend workflow** (`Backend`): runs `node restaurant-system/backend/src/server.js` on port `3000`, host `localhost`.
- Vite dev server proxies `/menu`, `/orders`, `/tables` to the backend on `localhost:3000`, so the frontend uses relative URLs and there is no CORS or port-mismatch issue in dev.
- Seed data and tables are created automatically on first backend boot.

## Deployment
Configured as a `vm` deployment (SQLite needs persistent local state):
- **Build**: `cd frontend && npm install && npm run build`
- **Run**: `PORT=5000 node restaurant-system/backend/src/server.js`
- The Express server detects `frontend/dist` and serves the built SPA alongside the API.

## API Routes
- `GET /menu` — Menu items.
- `GET /tables`, `GET /tables/qr/:code` — Tables and QR lookups.
- `GET /orders/kitchen`, `POST /orders`, `GET /orders/:id`, `PATCH /orders/:id/status` — Order operations.

## Roles & Views (driven by QR code)
The app has no manual role switcher — the user's view is decided entirely by the QR code embedded in the URL. The frontend forwards the QR code on every API call as `?qr_code=...` so the backend role middleware can authorize the request.

- **Table QR (`?qr=table-N`)** → Customer/waiter ordering view, locked to that table. Used by both the customer (scanning their own table) and the waiter (scanning on behalf of a customer who rang the bell).
- **Kitchen QR (`?qr=kitchen-crew-...`)** → Kitchen monitoring board. Shows queue/preparing/ready columns with per-order status update buttons. No menu, no QR-printing panel, no link out.
- **No QR / unknown QR** → Friendly landing screen asking the visitor to scan the QR code on their table.

## Order Status Lifecycle
`queue` → `preparing` → `ready`. Set by the kitchen crew from the kitchen view. Customers see the same stages on their order tracker.
