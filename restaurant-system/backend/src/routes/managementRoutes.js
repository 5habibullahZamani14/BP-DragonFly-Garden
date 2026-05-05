const express = require("express");
const managementController = require("../controllers/managementController");

// Note: In a real production system, add authentication middleware here
// e.g. const { requireManager } = require("../middleware/role-based-access");
// const router = express.Router().use(requireManager);
const router = express.Router();

// Middleware to attach fake manager user for logs for now
router.use((req, res, next) => {
  req.user = { id: 'admin', name: 'manager' };
  next();
});

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
