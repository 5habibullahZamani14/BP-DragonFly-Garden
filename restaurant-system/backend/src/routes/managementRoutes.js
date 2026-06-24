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
 * which returns a JWT. All management routes except the open auth/reset/passcode
 * helpers require that manager JWT bearer token in the Authorization header.
 */

const express = require("express");
const managementController = require("../controllers/managementController");
const menuController = require("../controllers/menuController");
const { createCategory, updateCategory, deleteCategory, reorderCategories } = menuController;
const {
  getAllModifierGroups, getItemModifiers, getItemOptions,
  createModifierGroup, updateModifierGroup, deleteModifierGroup,
  createModifierOption, updateModifierOption, deleteModifierOption,
  assignModifierGroup, unassignModifierGroup, setDefaultOption,
  createOptionGroup, updateOptionGroup, deleteOptionGroup,
  createOption, updateOption, deleteOption,
} = menuController;


const feedbackController = require("../controllers/feedbackController");
const { requireManagerToken } = require("../middleware/jwt-auth");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../../../../frontend/public/menu-images"));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'menu-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: "Too many login attempts from this IP, please try again after 5 minutes"
});

const verifyToken = (req, res, next) => {
  // Allow open routes that are needed before a manager login session exists.
  const openRoutes = new Set([
    '/auth',
    '/employees/verify',
    '/send-reset-email',
    '/manager-profile/reset',
    '/settings/public',
  ]);

  if (openRoutes.has(req.path)) {
    return next();
  }

  return requireManagerToken(req, res, next);
};

router.use(verifyToken);

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
router.post("/auth", authLimiter, managementController.managerAuth);

/*
 * POST /management/employees/verify
 * Validates an employee's credentials. Publicly accessible so cashiers can log in
 * without a manager session. Rate-limited to prevent brute-force.
 */
router.post("/employees/verify", authLimiter, managementController.verifyEmployee);

/*
 * POST /management/send-reset-email
 * Sends a password reset email to the manager's registered email address.
 * Requires the Resend API key to be configured in the backend .env file.
 */
router.post("/send-reset-email", managementController.sendResetEmail);
router.post("/manager-profile/reset", managementController.managerResetPassword);

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

// ── Activity log ──────────────────────────────────────────────────────────────

/*
 * GET /management/logs
 * Returns entries from the grand_archive_logs table. An optional ?category=
 * query parameter filters by log category (e.g. EMPLOYEE, INVENTORY, SYSTEM).
 */
router.get("/logs", managementController.getLogs);

// ── Menu Management ──────────────────────────────────────────────────────────

router.post("/menu", menuController.createMenuItem);
router.put("/menu/:id", menuController.updateMenuItem);
router.delete("/menu/:id", menuController.deleteMenuItem);
router.post("/menu/:id/image", upload.single("image"), menuController.uploadMenuItemImage);
router.post("/menu/:id/pattern", upload.single("image"), menuController.uploadMenuItemPatternImage);
router.put("/menu/:id/pattern", menuController.updateMenuItemPattern);
router.post("/menu/apply-default-card-size", menuController.applyDefaultCardSize);

// ── Pattern Assets Management ───────────────────────────────────────────────
router.get("/patterns", menuController.getPatterns);
router.post("/patterns", upload.single("image"), menuController.createPattern);
router.put("/patterns/:id", menuController.updatePattern);
router.delete("/patterns/:id", menuController.deletePattern);

// ── Category (Section) Management ────────────────────────────────────────────

router.post("/categories", createCategory);
router.put("/categories/reorder", reorderCategories);   // must be before /:id
router.put("/categories/:id", updateCategory);
router.delete("/categories/:id", deleteCategory);

// ── Item Modifications / Variations ──────────────────────────────────────────
// Routes ordered carefully: specific paths before parameterised ones.

router.get("/menu/:id/options", getItemOptions);
router.post("/menu/:id/option-groups", createOptionGroup);
router.put("/menu/option-groups/:groupId", updateOptionGroup);
router.delete("/menu/option-groups/:groupId", deleteOptionGroup);
router.post("/menu/option-groups/:groupId/options", createOption);
router.put("/menu/options/:optionId", updateOption);
router.delete("/menu/options/:optionId", deleteOption);


/*
 * GET /management/finance
 * Returns financial data (revenue, costs, items sold) for the Finance Tab.
 */
router.get("/finance", managementController.getFinanceData);

// ── System settings ───────────────────────────────────────────────────────────

/*
 * GET /management/settings/public
 * Returns only the public subset of settings required by customer and payment
 * counter flows: work_hours, SST/service charge toggles, and their rates.
 */
router.get("/settings/public", managementController.getPublicSettings);

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

/*
 * GET /management/backups
 * Returns a list of all available database backups.
 */
router.get("/backups", managementController.getBackups);

/*
 * POST /management/backups
 * Creates a new backup of the database. Body can contain { filename, overwrite }.
 */
router.post("/backups", managementController.createBackup);

/*
 * POST /management/backups/restore
 * Restores the system from a specified backup file. Body must contain { filename }.
 */
router.post("/backups/restore", managementController.restoreBackup);

// ── Customer feedback (manager only) ─────────────────────────────────────────

router.get("/feedback", feedbackController.listFeedbackForManager);
router.get("/feedback/analysis/latest", feedbackController.getLatestAnalysis);
router.post("/feedback/analyze", feedbackController.runAnalysis);
router.get("/feedback/:id", feedbackController.getFeedbackDetailForManager);
router.patch("/feedback/:id/respond", feedbackController.respondToFeedback);
router.patch("/feedback/:id/archive", feedbackController.archiveFeedback);
router.delete("/feedback/:id", feedbackController.deleteFeedback);
router.patch("/feedback/analysis/findings/:id", feedbackController.updateFindingStatus);
router.delete("/feedback/analysis/findings/:id", feedbackController.deleteFinding);

router.post("/feedback/ai-chat", feedbackController.aiChat);
router.get("/feedback/ai-chat/usage", feedbackController.getChatUsage);

// Set up broadcast function for feedback controller
const setupFeedbackBroadcast = (broadcastFn) => {
  feedbackController.setBroadcast(broadcastFn);
};

// Set up broadcast function for menu controller
const setupMenuBroadcast = (broadcastFn) => {
  menuController.setBroadcast(broadcastFn);
};

// Set up broadcast function for management controller
const setupManagementBroadcast = (broadcastFn) => {
  managementController.setBroadcast(broadcastFn);
};


// ── Global Modifier Library ───────────────────────────────────────────────────

/* GET  /management/modifier-groups            — all global groups + options + assignments */
router.get("/modifier-groups", getAllModifierGroups);

/* POST /management/modifier-groups            — create a new global group */
router.post("/modifier-groups", createModifierGroup);

/* PUT  /management/modifier-groups/:groupId   — rename / toggle flags */
router.put("/modifier-groups/:groupId", updateModifierGroup);

/* DELETE /management/modifier-groups/:groupId — delete globally (cascades) */
router.delete("/modifier-groups/:groupId", deleteModifierGroup);

/* POST /management/modifier-groups/:groupId/options — add an option */
router.post("/modifier-groups/:groupId/options", createModifierOption);

/* PUT  /management/modifier-options/:optionId  — edit an option */
router.put("/modifier-options/:optionId", updateModifierOption);

/* DELETE /management/modifier-options/:optionId — delete an option */
router.delete("/modifier-options/:optionId", deleteModifierOption);

/* GET  /management/menu-items/:itemId/modifiers  — get assigned modifiers for one item */
router.get("/menu-items/:itemId/modifiers", getItemModifiers);

/* POST /management/menu-items/:itemId/modifiers  — assign a group to an item */
router.post("/menu-items/:itemId/modifiers", assignModifierGroup);

/* DELETE /management/menu-items/:itemId/modifiers/:groupId — unassign (keeps global group) */
router.delete("/menu-items/:itemId/modifiers/:groupId", unassignModifierGroup);

/* PUT  /management/menu-items/:itemId/modifiers/:groupId/default — set default option */
router.put("/menu-items/:itemId/modifiers/:groupId/default", setDefaultOption);

module.exports = router;

module.exports.setupFeedbackBroadcast = setupFeedbackBroadcast;
module.exports.setupMenuBroadcast = setupMenuBroadcast;
module.exports.setupManagementBroadcast = setupManagementBroadcast;
