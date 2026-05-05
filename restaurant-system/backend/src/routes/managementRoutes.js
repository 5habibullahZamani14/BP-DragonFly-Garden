const express = require("express");
const managementController = require("../controllers/managementController");

const router = express.Router();

// Middleware to attach manager user for logs
router.use((req, res, next) => {
  req.user = { id: 'admin', name: 'manager' };
  next();
});

// Auth
router.post("/auth", managementController.managerAuth);
router.post("/send-reset-email", managementController.sendResetEmail);

// Manager profile
router.get("/manager-profile", managementController.getManagerProfileRoute);
router.put("/manager-profile", managementController.updateManagerProfile);

// Kitchen passcode (public read — kitchen login needs it before auth)
router.get("/kitchen-passcode", managementController.getKitchenPasscode);

// Logs
router.get("/logs", managementController.getLogs);

// Settings
router.get("/settings", managementController.getSettings);
router.put("/settings/:key", managementController.updateSetting);

// Employees
router.get("/employees", managementController.getEmployees);
router.post("/employees", managementController.createEmployee);
router.put("/employees/:id", managementController.updateEmployee);

// Inventory
router.get("/inventory", managementController.getInventory);
router.post("/inventory", managementController.createInventoryItem);
router.put("/inventory/:id", managementController.updateInventoryStock);

// Recipes
router.get("/recipes", managementController.getRecipes);
router.put("/recipes/:menu_item_id", managementController.updateRecipe);

module.exports = router;
