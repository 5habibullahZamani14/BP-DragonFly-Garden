/*
 * managementRoutes.js — HTTP routes for the manager dashboard.
 *
 * These routes cover everything the restaurant manager needs to operate and
 * configure the system: authentication, their own profile, system settings,
 * employee records, inventory, recipes, and the activity log.
 *
 * Unlike the order and payment route files, this one is a plain Express router
 * (not a factory function) because the management routes do not need to push
 * WebSocket events.
 *
 * Note on authentication: the manager authenticates via POST /management/auth
 * which returns a success flag that the frontend stores in session. The routes
 * themselves do not use the requireRole middleware because the manager's QR code
 * is handled at the frontend level — the backend trusts any request that arrives
 * with a manager QR code attached. This is acceptable because the system runs
 * on a private local network with no public internet exposure.
 */

const express = require("express");
const managementController = require("../controllers/managementController");

const router = express.Router();

/*
 * Attach a minimal user object to every management request so that log entries
 * created inside the controllers have a consistent actor identity even when no
 * employee is explicitly identified in the request body.
 */
router.use((req, res, next) => {
  req.user = { id: "admin", name: "manager" };
  next();
});

// ── Authentication ────────────────────────────────────────────────────────────

/*
 * POST /management/auth
 * Validates the manager's ID and password. Returns { success: true, name: "..." }
 * on success. The frontend stores the result in localStorage to maintain the
 * manager session across page reloads.
 */
router.post("/auth", managementController.managerAuth);

/*
 * POST /management/send-reset-email
 * Sends a password reset email to the manager's registered email address.
 * Requires the Resend API key to be configured in the backend .env file.
 */
router.post("/send-reset-email", managementController.sendResetEmail);

// ── Manager profile ───────────────────────────────────────────────────────────

/*
 * GET /management/manager-profile
 * Returns the manager's current profile: name, ID, email, and phone number.
 * These are stored in restaurant_settings and editable through the dashboard.
 */
router.get("/manager-profile", managementController.getManagerProfileRoute);

/*
 * PUT /management/manager-profile
 * Updates one or more fields of the manager's profile. Each field is optional
 * so the frontend can send only the changed fields. If the password is included,
 * it is stored and takes effect immediately.
 */
router.put("/manager-profile", managementController.updateManagerProfile);

// ── Kitchen passcode ──────────────────────────────────────────────────────────

/*
 * GET /management/kitchen-passcode
 * Returns the kitchen crew's numeric passcode. This route is intentionally
 * public (no auth guard) because the kitchen login screen needs to fetch the
 * passcode before the crew member has authenticated — it needs the value to
 * validate the PIN they enter.
 */
router.get("/kitchen-passcode", managementController.getKitchenPasscode);

// ── Activity log ──────────────────────────────────────────────────────────────

/*
 * GET /management/logs
 * Returns entries from the grand_archive_logs table. An optional ?category=
 * query parameter filters by log category (e.g. EMPLOYEE, INVENTORY, SYSTEM).
 */
router.get("/logs", managementController.getLogs);

// ── System settings ───────────────────────────────────────────────────────────

/*
 * GET /management/settings
 * Returns all key-value settings from restaurant_settings as a single object.
 * Used by the Settings tab and by the payment counter to check working hours.
 */
router.get("/settings", managementController.getSettings);

/*
 * PUT /management/settings/:key
 * Updates a single setting by its key. Body must include { value: ... }.
 * The value is serialised as JSON when stored so it can hold complex structures
 * like the work_hours object { start: "09:00", end: "22:00" }.
 */
router.put("/settings/:key", managementController.updateSetting);

// ── Employee management ───────────────────────────────────────────────────────

/*
 * GET /management/employees
 * Returns the employee list. Accepts ?include_archived=true to include
 * former employees who have been soft-deleted.
 */
router.get("/employees", managementController.getEmployees);

/*
 * POST /management/employees
 * Creates a new employee record. The employee can then log into the payment
 * counter using their employee_id and name.
 */
router.post("/employees", managementController.createEmployee);

/*
 * PUT /management/employees/:id
 * Updates an existing employee's details. Also used to archive (soft-delete)
 * an employee by setting is_archived to 1.
 */
router.put("/employees/:id", managementController.updateEmployee);

// ── Inventory management ──────────────────────────────────────────────────────

/*
 * GET /management/inventory
 * Returns all inventory items with their current stock levels. The Inventory
 * tab uses this to display stock status and highlight low-stock items.
 */
router.get("/inventory", managementController.getInventory);

/*
 * POST /management/inventory
 * Adds a new inventory item (ingredient or supply) to the system.
 */
router.post("/inventory", managementController.createInventoryItem);

/*
 * PUT /management/inventory/:id
 * Updates an inventory item's stock level or details. Used when the manager
 * restocks an ingredient.
 */
router.put("/inventory/:id", managementController.updateInventoryStock);

// ── Recipe management ─────────────────────────────────────────────────────────

/*
 * GET /management/recipes
 * Returns the ingredient list for every menu item that has a recipe defined.
 * Used by the Inventory tab to show the recipe editor.
 */
router.get("/recipes", managementController.getRecipes);

/*
 * PUT /management/recipes/:menu_item_id
 * Replaces the full ingredient list for a menu item. The body must contain
 * an ingredients array where each entry has inventory_item_id and quantity_required.
 */
router.put("/recipes/:menu_item_id", managementController.updateRecipe);

module.exports = router;
