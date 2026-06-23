# Comprehensive Security, Performance, and Reliability Plan

## Overview
This plan is tailored for the BP-DragonFly-Garden repository and focuses on hardening security, improving performance, and raising application reliability. It includes concrete remediation actions for both backend and frontend code, as well as an optional automatic image compression feature for uploads.

## What is broken today
- Backend authentication is insecure: role access is derived from easily spoofed QR query parameters and public JWT middleware fallback secrets.
- Management credentials are stored or handled in plaintext and reset flows expose secret values.
- CORS and WebSocket access are overly permissive, enabling misuse from arbitrary origins.
- The frontend allows role switching via URL query strings, which bypasses proper authorization.
- Static asset delivery is not optimized and image upload handling is not compressed or resized.
- The deployment is expected to run on a Raspberry Pi hotspot, so network reliability and Wi-Fi stability are critical.
- Backend architecture has process-local scheduling and SQLite usage that may not scale or recover cleanly.

## Why this matters
- Unauthorized access can expose kitchen and payment workflows, order controls, and sensitive management operations.
- Weak secrets and plaintext credentials make the service vulnerable to simple attacks and credential leaks.
- Poor asset delivery and uncompressed uploads slow page load times and waste network bandwidth on low-power terminals.
- Unstable hotspot connections or noisy Wi-Fi can cause client disconnects, page reloads, and poor user experience.
- Stale service worker or caching logic can make the app appear broken on repeated reconnects.
- Unsafe WebSocket connections and open CORS widen the attack surface for spoofed clients and cross-origin abuse.
- In-system scheduling and database locking issues create reliability and recovery risk on a single host.

## High-level objectives
1. Eliminate query-parameter-based authorization and enforce authenticated sessions.
2. Secure JWT handling and management credentials using environment-based secrets and proper password hashing.
3. Harden network access via strict CORS, CSP, security headers, and authenticated WS broadcast channels.
4. Improve frontend route handling so view access is driven by server-issued role tokens, not `?view=` or `?qr=`.
5. Add image compression/resize on upload and remove originals after processing.
6. Improve static performance with build-time asset optimization, cache headers, and bundle analysis.
7. Make backend operations more robust and production-ready.

## Detailed remediation plan

### 1. Backend authentication and authorization
- Replace `qr_code` query-based role derivation with strong session or token authentication.
  - Keep QR codes for initial device pairing if needed, but exchange them for a signed session token immediately.
  - Do not trust `req.query.qr` for each request.
- Implement proper auth flow for kitchen, payment counter, and manager roles.
  - Use email/password or strong OTP for manager login.
  - For staff roles, issue signed JWTs after verifying device registration or a one-time QR-based handshake.
- Remove any fallback JWT secret such as `JWT_SECRET || "fallback_secret"`.
  - Require `process.env.JWT_SECRET` and fail startup if missing.
- Use secure password hashing for manager passwords.
  - Introduce `bcrypt` or `argon2` and store only hashes.
- Harden management authentication routes in `backend/src/routes/managementRoutes.js` and `backend/src/controllers/managementController.js`.
  - Avoid sending the manager `username` and `password` in reset emails.
  - Use a one-time reset token with expiry instead of returning credentials in plaintext.
- Add `requireRole` middleware that checks decoded JWT role claims and permissions.
  - Protect routes like `/orders/:orderId/kitchen`, `/orders/:orderId/payment`, management CRUD, backups, and restore actions.

### 2. Secure request handling and network hardening
- Replace `app.use(cors())` with a stricter CORS policy.
  - Allow only known frontend origins or configure it from `process.env.ALLOWED_ORIGINS`.
  - Restrict `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and disallow credentials if not required.
- Introduce security headers via middleware:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer-when-downgrade`
  - `Strict-Transport-Security` when HTTPS is present.
- Secure WebSocket connections in `backend/src/server.js`:
  - Authenticate clients before subscribing them to order update broadcasts.
  - Reject connections without a valid token.
  - Do not broadcast internal changes to unauthenticated sockets.
- Validate all input payloads and reject invalid requests at the route boundary.
  - Keep `backend/src/middleware/validation.js` but ensure it is applied consistently.
  - Add explicit validation for order state changes and payment operations.

### 3. Frontend authorization and UX fixes
- Remove role override logic from `frontend/src/pages/Index.tsx`.
  - Do not use `?view=` to present manager or payment views.
  - Use a real authentication state from the backend to decide which interface to render.
- Stop appending `qr_code` to every request in `frontend/src/lib/api.ts`.
  - Only send a token from browser storage (cookie/localStorage) when authenticated.
  - Use standard Authorization header `Bearer <token>`.
- Fix the root app routing so unauthorized views cannot be loaded simply by changing the URL.
  - Use guarded routes based on authenticated user role and backend authorization.
- Keep public customer-facing APIs public, but make staff-only routes private.

### 4. Static asset and performance improvements
- Audit frontend asset sizes and apply build optimization.
  - Ensure `vite build` outputs minified JS/CSS and uses computed code splitting.
  - Inspect the `frontend/public/feedback-images/` and `menu-images/` directories for oversized content.
- Add cache-control headers for static assets served from Express.
  - Use long-lived caching for hashed assets.
  - Use `service-worker` or asset manifest if offline support is intended.
- Introduce image compression on upload and delete originals.
  - Implement upload middleware in `backend/src/routes/orderRoutes.js` or wherever files are accepted.
  - Use libraries like `sharp` or `imagemin` to resize and compress images after upload.
  - If original images are uploaded, process them and remove the raw original file before returning success.
  - Provide secure, size-limited upload validation to prevent DoS from oversized images.
- Optionally add an upload flow that resizes to defined widths for menu/feedback display.
  - Example: max width 1200px for menu images, max width 800px for feedback images.

### 4.5. Hotspot and real-time stability improvements
- Avoid service worker or stale-cache behavior on Raspberry Pi hotspot deployments.
  - The current `frontend/public/registerSW.js` forces a service worker unregister and then reloads the page. This can create extra instability on poor mobile connections.
  - Remove or simplify service worker registration in the Pi deployment unless offline caching is explicitly required.
- Improve WebSocket stability in `frontend/src/lib/useWebSocket.ts`.
  - Keep reconnect behavior gentle with exponential backoff and a long maximum backoff interval.
  - Detect repeated failures and surface a user-friendly reconnect state instead of repeatedly reconnecting while the device is on a flaky hotspot.
  - Ensure the backend accepts reconnections gracefully and does not log repeated failures as crashes.
- Minimize frontend loading work on first visit.
  - Render a lightweight landing/loading page quickly while the app fetches menu and role state.
  - Avoid eager image downloads or large background animations until the user is authenticated and the connection is stable.
- Serve all assets from the Pi-local network address and avoid cross-host redirects.
  - Use `VITE_API_BASE` and matching `WS_HOST`/`WS_BASE` so clients connect directly to the local hotspot host.
  - Do not rely on external CDN requests when the Pi is operating as the only local network node.
- Keep mobile payloads small.
  - Prefer compressed SVG/WEBP for UI icons and menu images.
  - Use lazy loading and small thumbnails in the customer-facing menu display.

### 5. Reliability, connectivity, and backend architecture
- Avoid in-process cron scheduling for critical tasks in `backend/src/server.js`.
  - Move nightly cleanup and backup triggers to an external scheduler or robust job runner.
  - If the internal scheduler remains, ensure it is resilient and logs failures clearly.
- Harden SQLite usage.
  - Confirm that database connections are serialized or that `sqlite3` is opened in serialized mode.
  - Add retry logic around transient database locks.
  - Add startup checks to validate schema and database file availability.
- Add health-check endpoints.
  - Expose `/health` and `/ready` endpoints for deployment readiness checks.
  - Validate DB connectivity and backup store reachability.
- Add connection stability improvements for hotspot deployments.
  - Ensure the backend accepts requests from the Pi hotspot and serves static assets from a stable local address.
  - Avoid aggressive client-side reconnect loops and provide exponential backoff for WebSocket reconnection.
  - Keep requests small and use compressed assets so mobile clients do not stall on slow Wi-Fi.
- Centralize configuration via environment variables.
  - Example variables: `NODE_ENV`, `JWT_SECRET`, `ALLOWED_ORIGINS`, `DB_PATH`, `UPLOAD_DIR`, `BACKUP_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BACKUP_SCHEDULE_CRON`, `API_HOST`, `WS_HOST`.

### 6. Monitoring, logging, and operations
- Standardize request logging with status, path, duration, and user identity.
  - Log management actions and protected route access attempts.
- Add error handling and user-friendly responses.
  - Do not expose stack traces in production.
  - Return consistent JSON error objects for API clients.
- Add backup/restore authorization and audit logging.
  - Protect endpoints that perform backups, restores, and database exports.
  - Write audit records for restore operations.

## Priority implementation roadmap
1. Immediate security hardening
   - Require `JWT_SECRET`
   - Lock down CORS
   - Secure WebSocket auth
   - Replace URL role overrides
   - Protect management and staff-only routes
2. Credentials and auth flow improvements
   - Use password hashing and secure reset tokens
   - Remove plaintext credentials and fallback secrets
3. Image compression and upload safety
   - Add upload-size limits and image processing
   - Delete raw originals after successful processing
4. Static asset performance
   - Add cache-control headers and inspect build artifacts
   - Optimize images in `frontend/public` and build output
5. Reliability and ops
   - Add health checks
   - Harden SQLite and scheduler behavior
   - Improve logging and crash recovery

## Suggested implementation tasks
- [ ] Add a secure auth token exchange for QR-based devices.
- [ ] Stop using query parameters to derive roles in every request.
- [ ] Require and validate `JWT_SECRET` in startup.
- [ ] Enable strict `cors` configuration with trusted origins.
- [ ] Protect WebSocket connections with JWT authentication.
- [ ] Use hashed passwords for manager credentials and reset flows.
- [ ] Add static asset cache headers in Express static serving.
- [ ] Implement upload compression and original-file cleanup.
- [ ] Add `/health` and `/ready` endpoints.
- [ ] Replace `?view=` and `?qr=` frontend routing logic with server-backed auth state.
- [ ] Audit and optimize built assets from the Vite frontend.

## Immediate action items for the repo
- `backend/src/server.js`: enforce strict CORS, security headers, WebSocket auth, health endpoints, and env validation.
- `backend/src/middleware/role-based-access.js`: remove query-string trust, add role token validation.
- `backend/src/routes/managementRoutes.js`: secure login and reset paths, remove plaintext credentials.
- `backend/src/controllers/managementController.js`: switch to hashed passwords and reset-token flows.
- `backend/src/routes/orderRoutes.js`: harden feedback image upload path and add compression.
- `frontend/src/pages/Index.tsx`: remove role override logic and render based on authenticated role.
- `frontend/src/lib/api.ts`: stop appending `qr_code` globally; use bearer tokens.

## Image compression feature idea
Automatic image compression and resizing should be implemented where uploads occur.
- When a user uploads a photo, accept the file, validate type and size, then process it server-side.
- Resize to target dimensions and compress to a web-friendly format.
- Delete the uncompressed original immediately once a compressed copy is stored.
- Store only the optimized asset for delivery.

### Why this feature helps
- Reduces page load time and network usage.
- Improves mobile and low-bandwidth experience.
- Eliminates storage of large raw uploads.
- Makes feedback and menu image delivery more consistent.

## Final recommendation
This repository needs a fast security-first patch release before any production use. After the initial hardening, follow up with a performance sprint to optimize frontend asset delivery and server upload handling. The completed plan should be tracked in the root file `ComprehensivePlan.md` and then implemented incrementally with tests around auth, file uploads, and role-based access.
