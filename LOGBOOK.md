# Project Logbook — BP DragonFly Garden Ordering System

**Author:** HZ  
**Internship period:** 9 March 2026 – 23 August 2026  
**Current status (as of 12 May 2026):** ~30% complete — core ordering system functional, documentation phase in progress  
**Repository:** `BP-DragonFly-Garden`  

---

## Overview

This logbook documents the development of a QR-code-based table ordering and management system for BP DragonFly Garden, a farm-to-table cafe. The project is a bachelor's degree internship assignment. Entries cover meetings with the company supervisor, development milestones, decisions made, and problems encountered and resolved.

---

## Week 1 — 9 March 2026

### Day 1 — 9 March 2026 (Monday)

- Started the internship at BP DragonFly Garden.
- Met the company contact and received an orientation about the cafe's operations, its farm-to-table concept, and the goals of the internship placement.
- Was informed that the main deliverable would be a software system to improve or replace the current manual ordering process.
- Assigned desk space and introduced to the team.

### 9–14 March 2026 — Week 1 Summary

- Spent the week observing cafe operations: how customers are seated, how orders are taken (currently by hand on paper slips), how the kitchen receives and processes them, and how payment is handled at the counter.
- Took notes on pain points: lost slips, miscommunication between floor and kitchen, no visibility of order status for customers, no inventory tracking.
- Began compiling a research plan for the survey that was requested during the orientation.

---

## Week 2 — 16 March 2026

### Meeting 1 — 17 March 2026 (Tuesday)

**Attendees:** HZ (intern), Company Supervisor  
**Location:** BP DragonFly Garden office  
**Duration:** ~45 minutes  

**Agenda:**
The supervisor explained in detail what the survey needed to cover. The goal was to understand the current ordering and payment workflows used by the cafe and by comparable establishments in the area.

**Topics discussed:**
- Survey scope: what methods do restaurants use for customer ordering (paper, tablet, app, QR code)?
- How are kitchen orders communicated (verbal relay, printed slip, digital screen)?
- How is payment handled at end of meal?
- What problems exist in the current process?

**Action items:**
- Design and distribute a survey to at least five establishments.
- Complete the survey report and submit before the next meeting (2 April 2026).

---

## Weeks 3–4 — 18 March – 1 April 2026

### Survey Research Phase

- Designed a structured questionnaire covering: ordering method, communication channel between floor and kitchen, payment process, and known issues.
- Conducted the survey at five establishments in the area (including BP DragonFly Garden itself as a baseline).
- Compiled results into a formal survey report.

**Key survey findings:**
- Most small cafes still use handwritten paper slips passed to the kitchen manually.
- None of the surveyed establishments used a digital ordering system.
- Staff reported that lost or illegible slips were a recurring source of kitchen errors.
- Customers expressed a preference for visibility into their order status.
- Payment reconciliation at end of day was universally described as time-consuming.

---

## Week 5 — 30 March – 5 April 2026

### Meeting 2 — 2 April 2026 (Thursday)

**Attendees:** HZ, Company Supervisor  
**Location:** BP DragonFly Garden office  
**Duration:** ~30 minutes  

**Agenda:** Survey report submission and review.

**Topics discussed:**
- Presented the survey report and findings.
- Supervisor reviewed and accepted the report.
- Discussion about what direction to take the project based on the findings.
- Agreed that the system should address: customer self-ordering, kitchen visibility, payment tracking, and basic inventory management.

**Action items:**
- Draft an initial system proposal for the next meeting.
- Decide on the technology stack.

---

## Weeks 6–7 — 6–17 April 2026

### Technical Proposal Preparation

- Researched different approaches to building the system:
  - Native mobile app vs. web application
  - Cloud-hosted vs. local network
  - Database options: MySQL, PostgreSQL, SQLite
- Decided on a web application approach because it requires no app installation on the customer's phone — they just scan a QR code and the page opens in their browser.
- Chose SQLite for the database because the system runs entirely on the local network on a Raspberry Pi. SQLite has zero configuration overhead and runs from a single file, which makes backups and recovery straightforward.
- Chose Node.js + Express for the backend and React + Vite for the frontend because of familiarity with JavaScript across the full stack.

### Meeting 3 — 16 April 2026 (Thursday)

**Attendees:** HZ, Company Supervisor  
**Location:** BP DragonFly Garden office  
**Duration:** ~1 hour  

**Agenda:** System proposal review and specification approval.

**Topics discussed:**
- Presented the proposed system: a QR-code-based ordering web app with a customer menu view, kitchen crew board, payment counter, and manager dashboard.
- Supervisor asked how QR codes would be used — explained the role-detection approach where each QR encodes the user's role in the URL (table-1 for customers, kitchen-crew for staff).
- Supervisor confirmed approval of the concept.
- Agreed that the system should run entirely offline on a local Raspberry Pi so there is no dependency on internet connectivity.
- Confirmed menu items to include — the full BP DragonFly Garden menu.

**Decisions made:**
- All four views (Customer, Kitchen, Payment, Manager) are part of the MVP scope.
- No cloud dependency. Everything runs locally.
- QR stickers will be printed for each table and for staff devices.

**Action items:**
- Begin development. First milestone: a working customer menu and order placement flow.
- Have a basic demo ready for the next check-in.

---

## Weeks 8–9 — 17 April – 2 May 2026

### Development Phase 1 — Core Setup

- Initialised the project repository. Set up the monorepo structure:
  - `frontend/` — Vite + React + TypeScript
  - `restaurant-system/backend/` — Node.js + Express
- Implemented the SQLite database schema (`init.js`) covering all required tables.
- Wrote the seed data file (`seed.js`) with the full BP DragonFly Garden menu.
- Built the backend API server (`server.js`) with Express and connected the menu and table routes.
- Built the initial Customer View: browsing the menu by category, adding items to a cart, and placing an order.
- Implemented the QR-code role detection system on both frontend (`pages/Index.tsx`) and backend (`middleware/role-based-access.js`).

**Technical problems encountered:**
- SQLite column type issues with boolean fields — resolved by storing integers (0/1) and normalising to JavaScript booleans in the controller.
- QR code SVG generation was slow on every request — resolved by implementing an in-memory cache keyed by ordering URL.

---

## Weeks 9–10 — 2–9 May 2026

### Development Phase 2 — Staff Views and Real-time Updates

- Built the Kitchen View: a three-column board (Queue, Preparing, Ready) showing live orders. Kitchen crew can advance individual item statuses and the overall order status updates automatically.
- Built the Payment Counter View: lists unpaid orders, processes payments, adjusts VAT, handles adding items post-order.
- Built the Manager Dashboard: employee management, inventory tracking, recipe linking, system settings, activity logs, and manager profile management.
- **Major milestone: replaced HTTP polling with WebSockets** for real-time order updates. Before this change, the kitchen view polled the API every few seconds. After the change, order updates are pushed from the server to all connected clients instantly when the customer places an order or the kitchen updates a status.
- Implemented inventory deduction at order creation time — when a customer places an order, the system deducts the required ingredient quantities from stock based on the configured recipes.
- Added the accessibility engine: font theme, UI scale, and font scale controls persisted in localStorage and applied via CSS custom properties.

**Technical problems encountered:**
- WebSocket reconnection caused duplicate event handlers — resolved by nullifying the `onclose` handler before closing the socket on component unmount.
- Concurrent SQLite writes during order creation caused occasional constraint errors — resolved by wrapping the order insert and inventory deduction in a single `BEGIN TRANSACTION / COMMIT` block.

---

## Week 11 — 11–12 May 2026

### Meeting 4 — 13 May 2026 (Wednesday)

**Attendees:** HZ, Company Supervisor  
**Location:** BP DragonFly Garden office  
**Duration:** ~1 hour  

**Agenda:** Mid-point progress review.

**Topics discussed:**
- Demonstrated the working system: customer menu, order placement, kitchen board, payment counter, manager dashboard.
- Supervisor tested all four views by scanning QR codes on a phone connected to the local Wi-Fi.
- Supervisor was satisfied with the core functionality.
- Discussion about remaining work: thermal printer integration, Raspberry Pi finalisation, full end-to-end testing.
- Supervisor requested that documentation and code organisation be completed before the next milestone.

**Feedback received:**
- The kitchen view's three-column layout was well-received — easy to see all orders at a glance.
- Accessibility controls (font size slider) were praised as a practical feature for kitchen crew who use the system on a wall-mounted tablet.

**Action items:**
- Complete code documentation (this logbook + inline code comments).
- Begin thermal printer setup on Raspberry Pi.
- Next meeting TBD — approximately one to two weeks.

### 12 May 2026 — Documentation Phase

- Removed AI-scaffolding artifacts from the repository: deleted `fix.js`, `update-payment.cjs`, `.replit`, `replit.md`, and raw AI session text files from `attached_assets/`.
- Cleaned `frontend/package.json`: renamed the project from the scaffold default, bumped version, removed `lovable-tagger` devDependency.
- Rewrote `README.md` with a full human-authored project overview.
- Began systematic code commenting across all backend modules:
  - `server.js`, `database/db.js`, `database/init.js`, `database/seed.js`
  - All five middleware files, all route files, all controllers, the printer service, and the status history utility
- Documented all key frontend modules: `App.tsx`, `pages/Index.tsx`, `lib/api.ts`, `lib/useWebSocket.ts`, `lib/useAccessibility.tsx`, and the shared design-system components.

---

## Upcoming — Week 12 onwards (13 May 2026 –)

### Planned tasks:

- **Thermal printer integration:** Configure ESC/POS commands for the printer connected to the Raspberry Pi. Update `printerService.js` to use the real CUPS printer command via the `PRINTER_COMMAND` environment variable.
- **Raspberry Pi deployment:** Final setup of the Pi as the dedicated server. Configure auto-start on boot using systemd. Test performance under realistic load (multiple tables ordering simultaneously).
- **QR sticker printing:** Generate the final QR codes for each table and the staff QR codes. Print and laminate the stickers.
- **End-to-end testing:** Full workflow test with the supervisor and cafe staff.
- **Remaining meetings:** At least three to four more meetings with the supervisor are expected before the August deadline for final review, refinement, and handover documentation.

---

## Technical Reference

### Order lifecycle

```
Customer places order
        ↓
  Status: queue
        ↓  (kitchen advances)
  Status: preparing
        ↓  (all items ready)
  Status: ready
        ↓  (kitchen archives)
  kitchen_archived_at set
        ↓  (payment counter closes)
  payment_status: paid
        ↓  (end of shift archive)
  Moved to archived_orders
```

### Role access via QR code

| QR code format        | Role assigned      | Access                          |
|-----------------------|--------------------|---------------------------------|
| `table-N`             | Customer / Waiter  | Menu, cart, order tracking      |
| `kitchen-crew-*`      | Kitchen crew       | Kitchen board, status updates   |
| `payment-counter-*`   | Payment counter    | Unpaid orders, payment, archive |
| `manager-*`           | Manager            | Full dashboard access           |

### System ports

| Service      | Port |
|--------------|------|
| Backend API  | 5000 |
| Frontend dev | 5173 |
| WebSocket    | 5000 (same server as API) |

---

*Logbook maintained by HZ. Last updated: 12 May 2026.*
