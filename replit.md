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

## Highlights: Popular item + Promotions
Menu items carry three extra flags: `is_popular`, `is_promo`, and `promo_label`. The customer view uses them to make featured items pop:

- **Spotlight card** at the top of the menu showcases the popular item with an animated gradient background, shimmer sweep, sparkles, and a dark CTA.
- **Promo strip** lists every promo item as a horizontally scrollable green pill with its label (e.g. `NEW`, `20% OFF`).
- **Menu card badges**: a pulsing orange "★ Popular" badge and/or a green promo badge sit on individual cards, which also get a colored gradient border.

### Auto-pick the popular item ("the AI")
`POST /menu/popular/recompute` runs a SQL aggregate over the last N days of orders, picks the top-N most-ordered items, clears `is_popular` on everything else, and sets it on the winner(s). Body params (all optional): `lookback_days` (default 7, 1–90) and `top` (default 1, 1–5). Returns the winner names and units sold. Hit this endpoint on a weekly schedule (cron / Task Scheduler / a setInterval in the backend) to keep the spotlight fresh automatically.
