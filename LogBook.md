# Project Logbook — BP DragonFly Garden Ordering System

**Author:** HZ  
**Internship period:** 9 March 2026 – 23 August 2026  
**Host organisation:** BP DragonFly Garden  
**Degree programme:** Bachelor's in Computer Science / Software Engineering  
**Project:** QR-code-based table ordering and restaurant management system  
**Current progress (as of 14 May 2026):** ~40% complete — core ordering system functional and hardware printer integration established

Legend: 📅 = Supervisor meeting | 🛠️ = Development work | 🔬 = Research/Survey | 📝 = Planning/Documentation

## March 2026

| **Date** | **Day** | **Phase** | **Log Entry** |
| --- | --- | --- | --- |
| 09 Mar 2026 | Monday | Orientation | 📅 First day of internship. Met the company contact and received a full orientation about BP DragonFly Garden, its farm-to-table concept, and the goals of the internship placement. Was informed that the main deliverable is a software system to improve or replace the current manual ordering process. Assigned a desk and introduced to the team. |
| 10 Mar 2026 | Tuesday | Observation | 🔬 Spent the day observing the cafe floor during service hours. Noted how customers are currently seated, how orders are taken by hand on paper slips, and how slips are passed to the kitchen. Identified the first pain point: no standardised slip format leads to illegible orders. |
| 11 Mar 2026 | Wednesday | Observation | 🔬 Continued observing operations, this time focusing on the kitchen. Watched how slips arrive, how the team prioritises them, and how completed dishes are dispatched. Found that there is no tracking mechanism once a slip reaches the kitchen — if it is misplaced, the order is simply lost. |
| 12 Mar 2026 | Thursday | Observation | 🔬 Observed the payment counter at end of lunch service. The cashier manually reconciles handwritten slips with a calculator. The process is slow and prone to arithmetic errors. Took detailed notes on all three stages (floor → kitchen → payment). |
| 13 Mar 2026 | Friday | Documentation | 📝 Compiled all observation notes into a structured document. Outlined the main pain points: lost slips, miscommunication between floor and kitchen, no customer visibility of order status, no inventory tracking, slow payment reconciliation. Began drafting the scope of the survey requested during orientation. |
| 16 Mar 2026 | Monday | Survey design | 🔬 Started designing the survey questionnaire. Drafted questions covering: customer ordering method, kitchen communication channel, payment process, and known operational problems. Aimed for five questions per section so the survey can be completed in under ten minutes. |
| 17 Mar 2026 | Tuesday | **Meeting 1** | 📅 First formal meeting with the company supervisor. The supervisor explained in detail what the survey needed to cover: how do restaurants in the area handle customer ordering, kitchen communication, and payment? Confirmed the survey should cover at least five establishments. Deadline for survey report is 2 April 2026. |
| 18 Mar 2026 | Wednesday | Survey design | 🔬 Incorporated supervisor's feedback into the questionnaire. Added a question specifically about digital adoption ("Do you currently use any software or app for ordering?"). Finalised the questionnaire format — a single A4 sheet with checkboxes and short-answer fields. |
| 19 Mar 2026 | Thursday | Survey design | 🔬 Identified the five establishments to survey: BP DragonFly Garden (as baseline) and four other cafes/restaurants in the area. Contacted them by phone or in person to arrange visit times. |
| 20 Mar 2026 | Friday | Survey design | 📝 Printed final survey forms. Prepared a brief verbal introduction to use when approaching each establishment so the purpose of the survey is clearly communicated without biasing responses. |
| 23 Mar 2026 | Monday | Survey fieldwork | 🔬 Visited Establishment 1 (a small family-run cafe). Conducted the survey with the owner. Key finding: all ordering is done verbally and by hand, no digital tools used. Owner expressed interest in a simpler, cheaper solution than a full POS system. |
| 24 Mar 2026 | Tuesday | Survey fieldwork | 🔬 Visited Establishment 2 (a slightly larger cafe with table service). Conducted survey with the manager. Finding: they use a basic printed receipt book, kitchen communication is by shouting across the pass. Recurring problem: peak-hour orders getting mixed up. |
| 25 Mar 2026 | Wednesday | Survey fieldwork | 🔬 Visited Establishment 3 (a fast-casual counter service restaurant). Finding: no table ordering — customers order at the counter and wait. Not directly comparable but useful for understanding the range of approaches. Also revisited BP DragonFly Garden to document its own process formally. |
| 26 Mar 2026 | Thursday | Survey fieldwork | 🔬 Visited Establishment 4 (a mid-range restaurant). This establishment had the most structured process: pre-printed numbered slips, a small bell on the kitchen pass, and a manual tally sheet for payment. Still entirely paper-based. Finding: structured paper systems reduce errors but are still slow. |
| 27 Mar 2026 | Friday | Survey analysis | 🔬 Completed all five establishment surveys. Began compiling and analysing responses. Started identifying common themes: paper-based ordering is universal, no digital tools are in use, miscommunication between floor and kitchen is the most cited problem. |
| 30 Mar 2026 | Monday | Report writing | 📝 Drafted the survey analysis section of the report. Included a comparative table of the five establishments across all survey dimensions. Wrote the findings narrative. |
| 31 Mar 2026 | Tuesday | Report writing | 📝 Completed the survey report. Sections: Introduction, Methodology, Findings (per establishment + cross-comparison), Conclusions, Recommendations. Formatted the document and prepared it for submission. |

## April 2026

| **Date** | **Day** | **Phase** | **Log Entry** |
| --- | --- | --- | --- |
| 01 Apr 2026 | Wednesday | Report review | 📝 Final read-through and proofread of the survey report. Made minor edits to the conclusions section to ensure the recommendations are clearly connected to the findings. Prepared the printed copy for the next day's meeting. |
| 02 Apr 2026 | Thursday | **Meeting 2** | 📅 Second meeting with the supervisor. Submitted and presented the survey report. The supervisor reviewed the findings and accepted the report. Discussion about next steps: based on the survey results, the system should address customer self-ordering, kitchen order visibility, payment tracking, and basic inventory management. Action: draft a system proposal for the next meeting. |
| 03 Apr 2026 | Friday | Post-meeting | 📝 Wrote up notes from Meeting 2. Listed all features discussed and marked them as Must-Have vs. Nice-to-Have. Began researching what technology would be suitable for the system. |
| 06 Apr 2026 | Monday | Research | 🔬 Researched the difference between a native mobile app and a web application. Conclusion: a web app is better for this use case because it requires no installation — the customer just scans a QR code and their browser opens the page directly. Noted this as a key selling point for the supervisor meeting. |
| 07 Apr 2026 | Tuesday | Research | 🔬 Researched database options. Compared MySQL, PostgreSQL, and SQLite. Since the system will run on a local Raspberry Pi with no internet, SQLite was identified as the best fit: zero configuration, single file, easy backup, sufficient for the expected load. |
| 08 Apr 2026 | Wednesday | Research | 🔬 Decided on the technology stack: Node.js + Express for the backend API, React + Vite + TypeScript for the frontend. Both use JavaScript/TypeScript, which reduces context-switching and makes the project maintainable as a one-person team. |
| 09 Apr 2026 | Thursday | Proposal writing | 📝 Began writing the system proposal document. Outlined the proposed architecture: a single-page React application served by an Express backend, with a SQLite database, all running on a Raspberry Pi 4 on the cafe's local Wi-Fi network. |
| 10 Apr 2026 | Friday | Proposal writing | 📝 Continued writing the proposal. Drafted the section on role-based access: how different QR codes will map different users to different views (customer, kitchen crew, payment counter, manager). This approach avoids the complexity of a login system for customers. |
| 13 Apr 2026 | Monday | Proposal writing | 📝 Completed the system proposal. Sections: Executive Summary, Problem Statement, Proposed Solution, System Architecture, Feature List, Technology Stack, Deployment Plan, Timeline. Printed and prepared for review. |
| 14 Apr 2026 | Tuesday | Proposal review | 📝 Re-read the proposal and prepared talking points for the meeting. Anticipated questions from the supervisor about offline operation, data backup, and how the QR codes would work physically (printed stickers on tables). |
| 15 Apr 2026 | Wednesday | Meeting prep | 📝 Final preparations. Sketched a rough wireframe of the four main views (Customer Menu, Kitchen Board, Payment Counter, Manager Dashboard) to show during the meeting as a visual aid. |
| 16 Apr 2026 | Thursday | **Meeting 3** | 📅 Third meeting with the supervisor — the most significant meeting so far. Presented the system proposal and wireframes. The supervisor approved the concept. Confirmed requirements: all four views in scope, no internet dependency, QR stickers on each table, system must run offline on the Raspberry Pi. The supervisor also confirmed the full menu to include. Approved to begin development. |
| 17 Apr 2026 | Friday | Project setup | 🛠️ Immediately began setting up the project after the meeting approval. Initialised the Git repository. Created the monorepo structure: frontend/ (Vite + React) and restaurant-system/backend/ (Node.js + Express). Configured ESLint, TypeScript, and .gitignore. |
| 20 Apr 2026 | Monday | Development | 🛠️ Implemented the full database schema (database/init.js). Created all required tables: categories, menu_items, tables, orders, order_items, order_status_history, payment_methods, payments, payment_logs, archived_orders, restaurant_settings, employees, inventory_items, menu_item_ingredients, grand_archive_logs. Added the ensureColumn migration helper for future schema changes. |
| 21 Apr 2026 | Tuesday | Development | 🛠️ Wrote the seed data file (database/seed.js) with the complete BP DragonFly Garden menu: 15 mains, 5 beverages, 1 herbal tea, 12 enzyme drinks, 1 pre-order special. The seeder is idempotent — safe to run on every server start. Also seeded the five restaurant tables and the five payment methods. |
| 22 Apr 2026 | Wednesday | Development | 🛠️ Built the main Express server (server.js). Set up middleware stack: CORS, JSON body parsing, role detection. Registered the menu and table route groups. Tested the /menu endpoint with Postman — returns all menu items correctly. |
| 23 Apr 2026 | Thursday | Development | 🛠️ Implemented the role-based access middleware (middleware/role-based-access.js). The middleware reads the ?qr_code= parameter from every request and matches it against four regex patterns to determine the caller's role. Attached role and QR code to the request object for downstream use. |
| 24 Apr 2026 | Friday | Development | 🛠️ Built the initial Customer View in React. Implemented: menu fetching via the API, category filter tabs, item cards with name/description/price/image, and an Add to Cart button. The cart state is managed locally with useState. |
| 27 Apr 2026 | Monday | Development | 🛠️ Implemented the full cart panel in the Customer View: quantity controls, item removal, order notes per item, cart total calculation, and the Place Order button. Added client-side validation so the cart cannot be submitted empty. |
| 28 Apr 2026 | Tuesday | Development | 🛠️ Implemented order creation on the backend (controllers/orderController.js — createOrder). Used a SQLite transaction to atomically insert the order row and all item rows. Added inventory deduction: when an order is placed, the system deducts required ingredient quantities from stock based on configured recipes. |
| 29 Apr 2026 | Wednesday | Development | 🛠️ Implemented the order tracking section of the Customer View. After placing an order, the customer sees a live status tracker showing Queue / Preparing / Ready. Added fetchActiveOrdersForTable so previously placed orders are restored when the page is refreshed. |
| 30 Apr 2026 | Thursday | Development | 🛠️ Built the Kitchen View. Initial implementation: a tab-based layout with one tab per status (Queue, Preparing, Ready). Each tab shows order cards with the table number, creation time, and item list. Implemented the "Advance" button for kitchen crew to move orders through the lifecycle. |

## May 2026

| **Date** | **Day** | **Phase** | **Log Entry** |
| --- | --- | --- | --- |
| 01 May 2026 | Friday | Development | 🛠️ Ran a full end-to-end test of the customer ordering flow: placed orders from three different browser tabs simulating three tables, verified all orders appeared on the Kitchen View, advanced them through Queue → Preparing → Ready, and verified the status updated in the Customer View. Everything worked. |
| 04 May 2026 | Monday | Development | 🛠️ Refactored the Kitchen View from a tab-based layout to a three-column board (Queue / Preparing / Ready visible simultaneously). This was a significant UX improvement — the kitchen crew can see all stages at once without switching tabs. Also implemented per-item status updates so individual dishes can be marked ready independently of the overall order. |
| 05 May 2026 | Tuesday | Development | 🛠️ Implemented deriveOrderStatus: a function that automatically computes the order's overall status from its individual item statuses. If all items are Ready, the order moves to Ready automatically. If any is Preparing, the order is Preparing. This removed the need for manual order-level status buttons on the kitchen board. |
| 06 May 2026 | Wednesday | Development | 🛠️ Built the Payment Counter View. Implemented: list of unpaid orders (fetched via /payments/unpaid), order detail expansion showing itemised breakdown, payment method selection, and the processPayment flow. The counter can handle partial payments and accumulates them until the remaining balance reaches zero. |
| 07 May 2026 | Thursday | Development | 🛠️ Built the Manager Dashboard initial structure: tab-based navigation with Overview, Employees, Inventory, Settings, and Logs tabs. Implemented the Employees tab — add, edit, soft-archive employees. Each employee gets a unique 4-character alphanumeric ID generated automatically. |
| 08 May 2026 | Friday | Development | 🛠️ Implemented the Inventory tab in the Management Dashboard. The manager can add raw ingredients with stock levels, set the maximum stock and low-stock threshold percentage, and link ingredients to menu items via the recipe editor. When the threshold is breached, the item is highlighted in the UI. |
| 11 May 2026 | Monday | Development | 🛠️ **Major milestone**: replaced HTTP polling with WebSockets. Previously, the Kitchen View polled /orders/kitchen every few seconds. Replaced with a WebSocket server attached to the same HTTP server. The backend now broadcasts NEW_ORDER, ORDER_STATUS_UPDATE, ITEM_STATUS_UPDATE, and NEW_PAYMENT events to all connected clients in real time. Implemented the useWebSocket hook on the frontend with automatic reconnection. |
| 12 May 2026 | Tuesday | Documentation | 📝 Began the documentation and cleanup phase in preparation for **Meeting 4** (tomorrow, 13 May). Removed all AI/scaffolding artifacts from the repository: deleted fix.js, update-payment.cjs, .replit, replit.md, and raw AI session text files. Rewrote README.md with a professional project overview. Added comprehensive inline code comments to all backend source files (server, database, middleware, controllers, routes, services). Started the LOGBOOK.md. |
| 14 May 2026 | Thursday | Development | 🛠️ Finalized POS receipt and kitchen checklist printing integration using a custom C# GDI engine (`print_gdi.exe`) specifically adapted for 58mm thermal printers. Handled character cutoff by strictly enforcing a 28-character line limit. Implemented custom rich-text tags (`[H1]`, `[BOLD]`, `[CENTER]`, `[SQUARE]`, `[RIGHT]`), word-wrapping for long items, and massive right-aligned Unicode `□` checkboxes for the kitchen. Completely automated the order lifecycle: payments now trigger immediate receipt printing, database archiving, and a `NEW_PAYMENT` WebSocket broadcast that instantly dismisses paid tickets from the live Customer UI. Also compiled the GDI engine using Courier New (size 7) with anti-aliasing disabled to achieve perfectly dark, crisp thermal prints, and ran a secure database script to purge test orders and restore inventory stock. |

## Upcoming — 13 May 2026 onwards

| **Planned date** | **Event / Task** |
| --- | --- |
| 13 May 2026 | **Meeting 4** — Mid-point progress review with supervisor |
| Week of 18 May | Thermal printer integration (ESC/POS via CUPS on Raspberry Pi) |
| Week of 25 May | Raspberry Pi deployment, systemd service, auto-start on boot |
| Week of 1 Jun | QR sticker generation and printing; final table/staff QR codes |
| Week of 8 Jun | Full end-to-end test with cafe staff |
| TBD | Meeting 5 — Hardware and deployment review |
| TBD | Meeting 6 — Final user acceptance testing |
| TBD | Meeting 7 — Handover and sign-off |
| 23 Aug 2026 | End of internship |

## Quick Reference — System Overview

### Order lifecycle

| **Step** | **Status** | **Who acts** |
| --- | --- | --- |
| Customer places order | queue | Customer / Waiter |
| Kitchen starts preparing | preparing | Kitchen crew |
| All items finished | ready | Kitchen crew (auto-derived) |
| Order cleared from board | kitchen_archived_at set | Kitchen crew |
| Payment collected | payment_status: paid | Payment counter |
| End-of-shift archive | Moved to archived_orders | System / Payment counter |

### Role access via QR code

| **QR code format** | **Role** | **Access** |
| --- | --- | --- |
| table-N | Customer / Waiter | Menu browsing, cart, order placement, order tracking |
| kitchen-crew-\* | Kitchen crew | Kitchen board, item and order status updates |
| payment-counter-\* | Payment counter | Unpaid orders, payment processing, VAT, archive |
| manager-\* | Manager | Full dashboard (employees, inventory, settings, logs) |

### Deployment

| **Service** | **Port** | **Notes** |
| --- | --- | --- |
| Backend API + WebSocket | 5000 | Also serves compiled frontend in production |
| Frontend (dev only) | 5173 | Vite dev server, proxies API to port 5000 |

_Logbook maintained by HZ. Last updated: 14 May 2026._