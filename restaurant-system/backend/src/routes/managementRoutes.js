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
  getPromotionTemplates, createPromotionTemplate, deletePromotionTemplate, applyPromotionToAll,
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

// ── Repository sections and reusable images ───────────────────────────────────
router.get("/repo-sections", menuController.getRepoSections);
router.post("/repo-sections", menuController.createRepoSection);
router.put("/repo-sections/:id", menuController.updateRepoSection);
router.delete("/repo-sections/:id", menuController.deleteRepoSection);
router.post("/repo-sections/:id/images", upload.single("image"), menuController.uploadRepoImage);
router.delete("/repo-images/:id", menuController.deleteRepoImage);
router.put("/menu/:id/repo-image", menuController.assignMenuItemRepoImage);

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
 * Returns a list of all available local database backups.
 */
router.get("/backups", managementController.getBackups);

/*
 * GET /management/backups/cloud
 * Returns a list of all cloud-hosted database backups.
 */
router.get("/backups/cloud", managementController.getCloudBackups);

/*
 * GET /management/backups/download
 * Downloads a local backup file.
 */
router.get("/backups/download", managementController.downloadBackup);

/*
 * POST /management/backups
 * Creates a new backup of the database. Body can contain { filename, overwrite }.
 */
router.post("/backups", managementController.createBackup);

/*
 * POST /management/backups/restore
 * Restores the system from a specified local backup file. Body must contain { filename }.
 */
router.post("/backups/restore", managementController.restoreBackup);

/*
 * POST /management/backups/restore/cloud
 * Restores the system from a specified cloud backup. Body must contain { filename }.
 */
router.post("/backups/restore/cloud", managementController.restoreCloudBackup);

/*
 * POST /management/backups/restore/upload
 * Restores the system from an uploaded backup file.
 */
router.post("/backups/restore/upload", upload.single("file"), managementController.restoreUploadedBackup);

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
router.get("/feedback/ai-chat/client-context", feedbackController.getClientContext);
router.post("/feedback/ai-chat/track", feedbackController.trackChatUsage);

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

// ── System Updates ────────────────────────────────────────────────────────────

/*
 * POST /management/system/check-version
 * Checks if a newer version of the app is available from GitHub.
 * Returns: { current_version, latest_version, is_up_to_date, needs_update }
 */
router.post("/system/check-version", managementController.checkSystemVersion);

/*
 * POST /management/system/update
 * Performs a system update by pulling from GitHub, reinstalling dependencies,
 * rebuilding frontend, and restarting the service.
 * Returns: { success, message, logs? }
 */
router.post("/system/update", managementController.performSystemUpdate);

// ── Promotion Templates ───────────────────────────────────────────────────────

/* GET  /management/promotions                  — get all templates */
router.get("/promotions", getPromotionTemplates);

/* POST /management/promotions                  — create a template */
router.post("/promotions", createPromotionTemplate);

/* DELETE /management/promotions/:id             — delete a template */
router.delete("/promotions/:id", deletePromotionTemplate);

/* POST /management/promotions/apply-all        — apply template to all menu items */
router.post("/promotions/apply-all", applyPromotionToAll);

// ── Printer Management ───────────────────────────────────────────────────────

const printerDiscoveryService = require("../services/printerDiscoveryService");

/*
 * GET /management/printers/discover
 * Discovers all available printers on the system
 * Returns: { printers: [{ name, driver, port, status, connectionType, platform }] }
 */
router.get("/printers/discover", requireManagerToken, async (req, res) => {
  try {
    const printers = await printerDiscoveryService.discoverPrinters();
    const platformInfo = printerDiscoveryService.getPlatformInfo();
    res.json({ success: true, printers, platform: platformInfo });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/*
 * POST /management/printers/test
 * Tests printing to a specific printer
 * Body: { printerName: string }
 * Returns: { success: true, message: string }
 */
router.post("/printers/test", requireManagerToken, async (req, res) => {
  try {
    const { printerName } = req.body;
    if (!printerName) {
      return res.status(400).json({ success: false, message: "Printer name is required" });
    }
    const result = await printerDiscoveryService.testPrint(printerName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/*
 * GET /management/printers/settings
 * Gets current printer settings from database
 * Returns: { selectedPrinter, defaultPrinter, printerPreferences }
 */
router.get("/printers/settings", requireManagerToken, async (req, res) => {
  try {
    const db = require("../database/db");
    const getSetting = (key) =>
      new Promise((resolve, reject) => {
        db.get("SELECT value FROM restaurant_settings WHERE key = ?", [key], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.value : null);
        });
      });

    const selectedPrinter = await getSetting("selected_printer");
    const defaultPrinter = await getSetting("default_printer");
    const printerPreferences = await getSetting("printer_preferences");
    const printDelaySeconds = await getSetting("print_delay_seconds");
    const emptyLinesBefore = await getSetting("empty_lines_before_receipt");
    const emptyLinesAfter = await getSetting("empty_lines_after_receipt");

    let parsedPrefs = {};
    try {
      parsedPrefs = printerPreferences ? JSON.parse(printerPreferences) : {};
    } catch (e) {
      console.error("Error parsing printer preferences:", e);
    }

    res.json({
      success: true,
      selectedPrinter,
      defaultPrinter,
      printerPreferences: parsedPrefs,
      printerProfiles: parsedPrefs.printer_profiles || {},
      printDelaySeconds: printDelaySeconds ? parseInt(printDelaySeconds) : 0,
      emptyLinesBefore: emptyLinesBefore ? parseInt(emptyLinesBefore) : 2,
      emptyLinesAfter: emptyLinesAfter ? parseInt(emptyLinesAfter) : 3
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/*
 * PUT /management/printers/settings
 * Updates printer settings
 * Body: { selectedPrinter?, defaultPrinter?, printerPreferences?, printerProfiles?, printDelaySeconds?, emptyLinesBefore?, emptyLinesAfter? }
 * Returns: { success: true, message: string }
 */
router.put("/printers/settings", requireManagerToken, async (req, res) => {
  try {
    const db = require("../database/db");
    const { selectedPrinter, defaultPrinter, printerPreferences, printerProfiles } = req.body;

    console.log("Received printer settings update:", JSON.stringify({ selectedPrinter, defaultPrinter, printerProfiles }, null, 2));

    const run = (sql, params = []) =>
      new Promise((resolve, reject) => {
        db.run(sql, params, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

    if (selectedPrinter !== undefined) {
      await run("UPDATE restaurant_settings SET value = ? WHERE key = 'selected_printer'", [selectedPrinter]);
    }
    if (defaultPrinter !== undefined) {
      await run("UPDATE restaurant_settings SET value = ? WHERE key = 'default_printer'", [defaultPrinter]);
    }
    
    // Handle printer profiles - if printerProfiles is provided, update the entire structure
    if (printerProfiles !== undefined) {
      const currentPrefs = await new Promise((resolve, reject) => {
        db.get("SELECT value FROM restaurant_settings WHERE key = 'printer_preferences'", (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.value : null);
        });
      });
      
      let parsedPrefs = {};
      try {
        parsedPrefs = currentPrefs ? JSON.parse(currentPrefs) : {};
      } catch (e) {
        console.error("Error parsing current printer preferences:", e);
      }
      
      parsedPrefs.printer_profiles = printerProfiles;
      parsedPrefs.receipt_copies = printerPreferences.receipt_copies || parsedPrefs.receipt_copies;
      
      console.log("Saving updated printer preferences:", JSON.stringify(parsedPrefs, null, 2));
      
      await run("UPDATE restaurant_settings SET value = ? WHERE key = 'printer_preferences'", [JSON.stringify(parsedPrefs)]);
      
      // Verify the save
      const savedPrefs = await new Promise((resolve, reject) => {
        db.get("SELECT value FROM restaurant_settings WHERE key = 'printer_preferences'", (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.value : null);
        });
      });
      console.log("Verified saved preferences:", savedPrefs);
    }
    
    // Legacy support - if printerPreferences is provided (old format)
    if (printerPreferences !== undefined && printerProfiles === undefined) {
      await run("UPDATE restaurant_settings SET value = ? WHERE key = 'printer_preferences'", [JSON.stringify(printerPreferences)]);
    }

    res.json({ success: true, message: "Printer settings updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/*
 * POST /management/printers/daily-sales-report
 * Prints on-demand daily sales report for current day
 * Returns: { success: true, message: string }
 */
router.post("/printers/daily-sales-report", requireManagerToken, async (req, res) => {
  try {
    const db = require("../database/db");
    const printerService = require("../services/printerService");
    
    // Get today's orders
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
    
    const orders = await new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM orders WHERE created_at >= ? AND created_at < ? ORDER BY created_at ASC",
        [todayStart, todayEnd],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    // Load items for each order
    for (const order of orders) {
      order.items = await new Promise((resolve, reject) => {
        db.all(
          "SELECT * FROM order_items WHERE order_id = ?",
          [order.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
    }
    
    // Print the report
    await printerService.printDailySalesReport(orders);
    
    res.json({ success: true, message: "Daily sales report printed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/*
 * POST /management/printers/test
 * Prints a minimal test ticket to verify printer settings
 * Returns: { success: true, message: string }
 */
router.post("/printers/test", requireManagerToken, async (req, res) => {
  try {
    const printerService = require("../services/printerService");
    const { printerName } = req.body;
    
    if (!printerName) {
      return res.status(400).json({ success: false, message: "Printer name is required" });
    }
    
    // Temporarily set the selected printer for this test
    const db = require("../database/db");
    const currentSelected = await new Promise((resolve, reject) => {
      db.get("SELECT value FROM restaurant_settings WHERE key = 'selected_printer'", (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.value : null);
      });
    });
    
    // Set the test printer as selected temporarily
    await new Promise((resolve, reject) => {
      db.run("UPDATE restaurant_settings SET value = ? WHERE key = 'selected_printer'", [printerName], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    await printerService.printTestTicket();
    
    // Restore original selected printer if it existed
    if (currentSelected) {
      await new Promise((resolve, reject) => {
        db.run("UPDATE restaurant_settings SET value = ? WHERE key = 'selected_printer'", [currentSelected], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    res.json({ success: true, message: "Test ticket printed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

module.exports.setupFeedbackBroadcast = setupFeedbackBroadcast;
module.exports.setupMenuBroadcast = setupMenuBroadcast;
module.exports.setupManagementBroadcast = setupManagementBroadcast;
