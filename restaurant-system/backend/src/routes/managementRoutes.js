/*
 * managementRoutes.js — HTTP routes for the manager dashboard.
 *
 * These routes cover everything the restaurant manager needs to operate and
 * configure the system: authentication, their own profile, system settings,
 * employee records, inventory, recipes, and the activity log.
 *
 * This is a plain Express router. Its broadcast callback is installed by the
 * server so manager-side mutations can notify connected views.
 *
 * The manager authenticates via POST /management/auth. The backend stores the
 * JWT in an HttpOnly cookie; all management routes require a valid session.
 */

const express = require("express");
const managementController = require("../controllers/managementController");
const dataCleanupController = require("../controllers/dataCleanupController");
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
const { requireManagerToken, requirePaymentToken, verifyJwtToken } = require("../middleware/jwt-auth");
const { ROLES } = require("../middleware/role-based-access");
const { clearAuthCookie } = require("../middleware/authCookies");
const { revokeStoredSession } = require("../services/sessionRevocation");
const { RECEIPT_LAYOUT } = require("../services/receiptLayout");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("node:crypto");
const { createHttpError } = require("../middleware/validation");
const {
  InvalidUploadedImageError,
  sanitizeUploadedImage,
} = require("../utils/imageSanitizer");

const uploadTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dragonfly-manager-upload-"));
const menuImagesDir = path.join(__dirname, "../../../../frontend/public/menu-images");
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadTempDir),
  filename: (_req, _file, cb) => cb(null, randomUUID()),
});
const imageUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(createHttpError(400, "Only JPEG, PNG, WebP, or GIF images are allowed."));
  },
});
const backupUpload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024, files: 1 },
});

const removeUploadedFiles = async (filePaths) => {
  await Promise.all(filePaths.map(async (filePath) => {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Could not remove a temporary management upload:", error.message);
      }
    }
  }));
};

const sanitizeMenuImageUpload = async (req, res, next) => {
  if (!req.file) return next();
  const temporaryPath = req.file.path;
  const sanitizedPaths = [];
  res.on("finish", () => {
    const cleanupPaths = [temporaryPath];
    if (res.statusCode >= 400) cleanupPaths.push(...sanitizedPaths);
    void removeUploadedFiles(cleanupPaths);
  });

  try {
    const sanitized = await sanitizeUploadedImage(temporaryPath, menuImagesDir);
    sanitizedPaths.push(sanitized.path);
    req.file.filename = sanitized.filename;
    req.file.path = sanitized.path;
    req.file.destination = menuImagesDir;
    req.file.mimetype = "image/webp";
    req.file.size = (await fs.promises.stat(sanitized.path)).size;
    await fs.promises.unlink(temporaryPath);
  } catch (error) {
    await removeUploadedFiles([temporaryPath, ...sanitizedPaths]);
    if (error instanceof InvalidUploadedImageError) {
      return next(createHttpError(400, "The uploaded file must be a valid JPEG, PNG, WebP, or GIF image."));
    }
    return next(error);
  }

  return next();
};

const cleanupBackupUpload = (req, res, next) => {
  if (req.file?.path) {
    res.on("finish", () => void removeUploadedFiles([req.file.path]));
  }
  next();
};

const router = express.Router();
let managementBroadcast = null;
let shutdownHandler = null;

const setupShutdownHandler = (handler) => {
  shutdownHandler = handler;
};

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: "Too many authentication or password reset attempts from this IP. Please try again after 5 minutes."
});

const verifyToken = (req, res, next) => {
  // Allow open routes that are needed before a manager login session exists.
  const openRoutes = new Set([
    '/auth',
    '/auth/session',
    '/employees/session',
    '/employees/verify',
    '/employees/logout',
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
  req.user = { ...req.user, id: req.user?.id || "admin", name: req.user?.name || "manager" };
  next();
});

// ── Authentication ────────────────────────────────────────────────────────────

/*
 * POST /management/auth
 * Validates manager credentials and issues an HttpOnly session cookie.
 */
router.post("/auth", authLimiter, managementController.managerAuth);
router.get("/auth/session", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const user = await verifyJwtToken(req, [ROLES.MANAGER]);
    return res.json({ success: true, id: user.id, name: user.name || "manager" });
  } catch (error) {
    if (error.statusCode === 401) return res.json({ success: false });
    return next(error);
  }
});
router.post("/auth/logout", requireManagerToken, async (req, res) => {
  const db = require("../database/db");
  const revoked = await revokeStoredSession(db, "manager_session", req.user.sessionId);
  if (revoked) clearAuthCookie(res, req, "manager");
  res.json({ success: true });
});

/*
 * POST /management/employees/verify
 * Validates an employee's credentials. Publicly accessible so cashiers can log in
 * without a manager session. Rate-limited to prevent brute-force.
 */
router.post("/employees/verify", authLimiter, managementController.verifyEmployee);
router.get("/employees/session", requirePaymentToken, (req, res) => {
  res.json({
    success: true,
    employee: {
      id: req.user.id,
      name: req.user.name,
      department: req.user.department,
      role: req.user.role
    }
  });
});
router.post("/employees/logout", requirePaymentToken, async (req, res) => {
  const db = require("../database/db");
  const revoked = await revokeStoredSession(db, "payment_counter_session", req.user.sessionId);
  if (revoked) clearAuthCookie(res, req, "payment_counter");
  res.json({ success: true });
});

/*
 * POST /management/send-reset-email
 * Sends a password reset email to the manager's registered email address.
 * Requires the Resend API key to be configured in the backend .env file.
 */
router.post("/send-reset-email", authLimiter, managementController.sendResetEmail);
router.post("/manager-profile/reset", authLimiter, managementController.managerResetPassword);

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
router.post("/menu/:id/image", imageUpload.single("image"), sanitizeMenuImageUpload, menuController.uploadMenuItemImage);
router.post("/menu/:id/pattern", imageUpload.single("image"), sanitizeMenuImageUpload, menuController.uploadMenuItemPatternImage);
router.put("/menu/:id/pattern", menuController.updateMenuItemPattern);
router.post("/menu/apply-default-card-size", menuController.applyDefaultCardSize);

// ── Pattern Assets Management ───────────────────────────────────────────────
router.get("/patterns", menuController.getPatterns);
router.post("/patterns", imageUpload.single("image"), sanitizeMenuImageUpload, menuController.createPattern);
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
router.post("/repo-sections/:id/images", imageUpload.single("image"), sanitizeMenuImageUpload, menuController.uploadRepoImage);
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

// ── Data reset / app cleanup ──────────────────────────────────────────────────
router.get("/data-reset/options", managementController.getDataResetOptions);
router.get("/data-cleanup/datasets", dataCleanupController.listDatasets);
router.get("/data-cleanup/:dataset/records", dataCleanupController.listRecords);
router.post("/data-cleanup/delete", dataCleanupController.deleteRecords);
router.post("/data-reset", managementController.performDataReset);

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
router.post(
  "/backups/restore/upload",
  backupUpload.single("file"),
  cleanupBackupUpload,
  managementController.restoreUploadedBackup
);

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
  managementBroadcast = broadcastFn;
  managementController.setBroadcast(broadcastFn);
};
const setupDataCleanupBroadcast = (broadcastFn) => {
  dataCleanupController.setBroadcast(broadcastFn);
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
 * Checks the configured Git remote branch and reports update eligibility.
 */
router.post("/system/check-version", managementController.checkSystemVersion);

/*
 * POST /management/system/update
 * Applies the exact reviewed fast-forward after staged tests and a frontend build.
 * The backend process must be restarted separately after a successful update.
 */
router.post("/system/update", managementController.performSystemUpdate);

/*
 * POST /management/system/shutdown
 * Acknowledge the manager request before beginning graceful shutdown.
 */
router.post("/system/shutdown", (req, res) => {
  if (!shutdownHandler) {
    return res.status(503).json({ success: false, message: "Server shutdown is unavailable." });
  }

  res.once("finish", () => {
    setTimeout(() => shutdownHandler(), 500);
  });
  return res.status(202).json({ success: true, message: "Server shutdown has been requested." });
});

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
const {
  getStoredPrinterPreferences,
  updateStoredPrinterPreferences
} = require("../services/printerPreferences");
const {
  DEFAULT_RECEIPT_COPY_COUNTS,
  MIN_RECEIPT_COPIES,
  MAX_RECEIPT_COPIES
} = require("../services/receiptCopies");

/*
 * GET /management/printers/discover
 * Discovers all available printers on the system
 * Returns: { printers: [{ name, driver, port, status, connectionType, platform }] }
 */
router.get("/printers/discover", requireManagerToken, async (req, res) => {
  console.log("[discovery] Route handler called, request received");
  try {
    if (req.query.refresh === "true" && printerDiscoveryService.clearCache) {
      printerDiscoveryService.clearCache();
    }
    console.log("[discovery] Starting printer discovery...");
    const printers = await printerDiscoveryService.discoverPrinters();
    console.log(`[discovery] discoverPrinters returned ${printers.length} printers`);
    
    console.log("[discovery] Getting platform info...");
    const platformInfo = printerDiscoveryService.getPlatformInfo();
    console.log(`[discovery] Platform info:`, platformInfo);
    
    console.log(`[discovery] Discovery successful. Found ${printers.length} printers.`);
    console.log("[discovery] Individual printer details:");
    printers.forEach((p, i) => {
      console.log(`  [${i+1}] ${p.name} (${p.connectionType}) via ${p.discoveredBy}`);
    });
    
    console.log("[discovery] Building response object...");
    const responseData = { success: true, printers, platform: platformInfo };
    console.log("[discovery] Response object built, serializing...");
    const jsonStr = JSON.stringify(responseData);
    console.log("[discovery] Response serialized, length:", jsonStr.length);
    console.log("[discovery] Response data preview:", jsonStr.substring(0, 200));
    
    console.log("[discovery] Calling res.json()...");
    res.json(responseData);
    console.log("[discovery] Response sent successfully");
  } catch (error) {
    console.error("[discovery] Printer discovery failed:", error);
    res.status(500).json({ success: false, message: error.message || "Unknown error" });
  }
});

/*
 * POST /management/printers/discover/clear-cache
 * Clears the printer discovery cache to force a refresh
 * Returns: { success: true, message: string }
 */
router.post("/printers/discover/clear-cache", requireManagerToken, async (req, res) => {
  try {
    printerDiscoveryService.clearCache();
    res.json({ success: true, message: "Printer discovery cache cleared" });
  } catch (error) {
    console.error("[discovery] Failed to clear cache:", error);
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
    const printerPreferences = await getStoredPrinterPreferences(db);

    res.json({
      success: true,
      selectedPrinter,
      defaultPrinter,
      printerPreferences,
      receiptLayout: RECEIPT_LAYOUT
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/*
 * PUT /management/printers/settings
 * Updates printer settings
 * Body: { selectedPrinter?, defaultPrinter?, printerPreferences?, testTicket? }
 * Returns: { success: true, message: string }
 */
router.put("/printers/settings", requireManagerToken, async (req, res) => {
  try {
    const db = require("../database/db");
    const { selectedPrinter, defaultPrinter, printerPreferences, testTicket } = req.body;

    if (printerPreferences !== undefined && (!printerPreferences || typeof printerPreferences !== "object" || Array.isArray(printerPreferences))) {
      return res.status(400).json({ success: false, message: "Printer preferences must be an object." });
    }
    if (Object.prototype.hasOwnProperty.call(printerPreferences || {}, "receipt_copies")) {
      const receiptCopies = printerPreferences.receipt_copies;
      if (!receiptCopies || typeof receiptCopies !== "object" || Array.isArray(receiptCopies)) {
        return res.status(400).json({ success: false, message: "Receipt copy settings must be an object." });
      }
      const globalCopies = receiptCopies.global;
      if (!globalCopies || typeof globalCopies !== "object" || Array.isArray(globalCopies)) {
        return res.status(400).json({ success: false, message: "Receipt copy counts must be provided as an object." });
      }
      for (const [type, rawCount] of Object.entries(globalCopies)) {
        const count = typeof rawCount === "number"
          ? rawCount
          : typeof rawCount === "string" && rawCount.trim()
            ? Number(rawCount)
            : NaN;
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_RECEIPT_COPY_COUNTS, type) ||
            !Number.isInteger(count) || count < MIN_RECEIPT_COPIES || count > MAX_RECEIPT_COPIES) {
          return res.status(400).json({
            success: false,
            message: `Each receipt copy count must be a whole number between ${MIN_RECEIPT_COPIES} and ${MAX_RECEIPT_COPIES}.`
          });
        }
      }
    }
    if (testTicket !== undefined && (
      typeof testTicket !== "string" ||
      !testTicket.trim() ||
      testTicket.length > 4000 ||
      testTicket.includes("\0")
    )) {
      return res.status(400).json({ success: false, message: "Test ticket must contain 1–4,000 printable characters." });
    }

    console.log("Received printer settings update:", JSON.stringify({ selectedPrinter, defaultPrinter }, null, 2));

    const run = (sql, params = []) =>
      new Promise((resolve, reject) => {
        db.run(sql, params, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

    if (selectedPrinter !== undefined) {
      await run(
        "INSERT INTO restaurant_settings (key, value) VALUES ('selected_printer', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [selectedPrinter]
      );
    }
    if (defaultPrinter !== undefined) {
      await run(
        "INSERT INTO restaurant_settings (key, value) VALUES ('default_printer', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [defaultPrinter]
      );
    }

    const preferencesUpdated = printerPreferences !== undefined || testTicket !== undefined;
    const savedPreferences = preferencesUpdated
      ? await updateStoredPrinterPreferences(db, { printerPreferences, testTicket })
      : await getStoredPrinterPreferences(db);

    if (managementBroadcast) {
      managementBroadcast({ type: "PRINTER_SETTINGS_UPDATE" });
    }
    res.json({
      success: true,
      message: "Printer settings updated successfully",
      printerPreferences: savedPreferences
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/printers/sample-ticket", requireManagerToken, (req, res) => {
  const { type } = req.query;
  if (typeof type !== "string") {
    return res.status(400).json({ success: false, message: "A sample ticket type is required." });
  }

  try {
    const printerService = require("../services/printerService");
    const ticket = printerService.formatSampleTicket(type);
    res.json({ success: true, ticket, receiptLayout: RECEIPT_LAYOUT });
  } catch (error) {
    if (error.code === "INVALID_SAMPLE_TICKET_TYPE") {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Could not format sample ticket:", error);
    res.status(500).json({ success: false, message: "Could not load the sample ticket." });
  }
});

router.post("/printers/sample-ticket/print", requireManagerToken, async (req, res) => {
  const type = req.body && req.body.type;
  if (typeof type !== "string") {
    return res.status(400).json({ success: false, message: "A sample ticket type is required." });
  }

  try {
    const printerService = require("../services/printerService");
    const result = await printerService.printSampleTicket(type);
    if (!result || result.success !== true) {
      return res.status(503).json({
        success: false,
        message: result && result.message ? result.message : "The printer did not accept the sample ticket."
      });
    }

    return res.json({
      success: true,
      message: `Sample ${type.replace(/_/g, " ")} submitted to the selected printer.`
    });
  } catch (error) {
    if (error.code === "INVALID_SAMPLE_TICKET_TYPE") {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Could not print sample ticket:", error);
    return res.status(503).json({
      success: false,
      message: error.message || "Could not submit the sample ticket to the printer."
    });
  }
});

/*
 * POST /management/printers/daily-sales-report
 * Prints on-demand daily sales report for current day
 * Returns: { success: true, message: string }
 */
router.post("/printers/daily-sales-report", requireManagerToken, async (req, res) => {
  try {
    const dailySales = require("../services/dailySalesReceiptService");
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const salesDate = typeof req.body?.salesDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.salesDate)
      ? req.body.salesDate
      : today;
    const result = await dailySales.printDailySalesReportForDate(salesDate);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/printers/daily-sales-report/status", requireManagerToken, async (req, res) => {
  try {
    const dailySales = require("../services/dailySalesReceiptService");
    await dailySales.reconcileDailySalesReceipts();
    const reports = await dailySales.getDailySalesReceiptStatus();
    res.json({ success: true, reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/printers/daily-sales-report/:salesDate/print", requireManagerToken, async (req, res) => {
  try {
    const dailySales = require("../services/dailySalesReceiptService");
    const result = await dailySales.printDailySalesReportForDate(req.params.salesDate);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/printers/daily-sales-report/:salesDate/ignore", requireManagerToken, async (req, res) => {
  try {
    const dailySales = require("../services/dailySalesReceiptService");
    const ignoredBy = req.user?.name || req.user?.id || "Manager";
    const result = await dailySales.ignoreMissedReceipt(req.params.salesDate, String(ignoredBy));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/*
 * POST /management/printers/test
 * Submits the saved test ticket text to the selected printer queue
 * Returns: { success: true, message: string }
 */
router.post("/printers/test", requireManagerToken, async (req, res) => {
  console.log(`[thermal] ROUTE B (printerService) hit for: ${req.body.printerName}`);
  try {
    const printerService = require("../services/printerService");
    const { printerName } = req.body;
    
    if (!printerName) {
      console.log(`[thermal] ROUTE B rejected: no printer name`);
      return res.status(400).json({ success: false, message: "Printer name is required" });
    }
    
    const result = await printerService.printTestTicket(printerName);
    if (!result || result.success !== true) {
      return res.status(503).json({
        success: false,
        message: result?.message || "The printer did not accept the test print job"
      });
    }

    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error(`[thermal] ROUTE B error:`, error);
    res.status(503).json({ success: false, message: error.message });
  }
});

router.get("/printers/jobs/review", requireManagerToken, async (_req, res) => {
  try {
    const db = require("../database/db");
    const jobs = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, order_id AS orderId, job_type AS jobType, printer_name AS printerName,
                status, error_message AS errorMessage, created_at AS createdAt
         FROM printer_jobs
         WHERE status IN ('submitting', 'uncertain')
         ORDER BY id DESC
         LIMIT 50`,
        (error, rows) => error ? reject(error) : resolve(rows)
      );
    });
    res.json({ success: true, jobs });
  } catch (error) {
    console.error("Could not load printer jobs needing review:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/printers/jobs/:id/acknowledge", requireManagerToken, async (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isSafeInteger(jobId) || jobId < 1) {
    return res.status(400).json({ success: false, message: "Invalid printer job ID." });
  }

  try {
    const db = require("../database/db");
    const changes = await new Promise((resolve, reject) => {
      db.run(
        `UPDATE printer_jobs
         SET status = 'reviewed', updated_at = CURRENT_TIMESTAMP, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('submitting', 'uncertain')`,
        [jobId],
        function (error) {
          if (error) reject(error);
          else resolve(this.changes);
        }
      );
    });
    if (!changes) {
      return res.status(404).json({ success: false, message: "Printer job was not found or was already reviewed." });
    }
    if (managementBroadcast) {
      managementBroadcast({ type: "PRINT_JOB_REVIEW_UPDATED", payload: { id: jobId } });
    }
    res.json({ success: true, message: "Printer job marked as reviewed. No print retry was made." });
  } catch (error) {
    console.error(`Could not acknowledge printer job ${jobId}:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

module.exports.setupFeedbackBroadcast = setupFeedbackBroadcast;
module.exports.setupMenuBroadcast = setupMenuBroadcast;
module.exports.setupManagementBroadcast = setupManagementBroadcast;
module.exports.setupDataCleanupBroadcast = setupDataCleanupBroadcast;
module.exports.setupShutdownHandler = setupShutdownHandler;
