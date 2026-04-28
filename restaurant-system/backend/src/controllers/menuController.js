/*
 * Import the database connection object
 * This will be used to execute SQL queries for menu operations
 */
const db = require("../database/db");

/*
 * Define the getMenu function
 * This is an API endpoint handler that receives HTTP requests to retrieve menu data
 * req: The incoming HTTP request from the client
 * res: The HTTP response object used to send menu data back to the client
 */
const getMenu = (req, res) => {
  /*
   * Create a SQL query that retrieves all available menu items with their category information
   * SELECT: Choose specific columns to retrieve
   *   - menu_items.id: The menu item's unique ID
   *   - menu_items.name: The name of the food or drink
   *   - menu_items.description: Description of the item
   *   - menu_items.price: The cost of the item
   *   - menu_items.is_available: Whether the item is available for ordering
   *   - menu_items.image_url: URL to the item's image
   *   - categories.id as category_id: The category's unique ID
   *   - categories.name as category: The category name
   * WHERE menu_items.is_available = 1: Only fetch available items
   * INNER JOIN: Only include items that have a valid category
   */
  const query = `
    SELECT 
      menu_items.id, 
      menu_items.name, 
      menu_items.description,
      menu_items.price, 
      menu_items.is_available,
      menu_items.image_url,
      categories.id as category_id,
      categories.name as category,
      categories.name as category_name
    FROM menu_items
    INNER JOIN categories ON menu_items.category_id = categories.id
    WHERE menu_items.is_available = 1
    ORDER BY categories.display_order ASC, menu_items.name ASC
  `;

  /*
   * Execute the query and retrieve all rows from the database
   * db.all() runs the query and returns ALL matching rows
   * The empty array [] contains query parameters (none needed here)
   * The callback function runs when the query completes (err, rows)
   */
  db.all(query, [], (err, rows) => {
    /*
     * Check if an error occurred while executing the query
     * If so, send back an error response with status 500 (Internal Server Error)
     * Include the error message in the response
     */
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    /*
     * If the query was successful, send the rows back to the client as JSON
     * The rows contain all available menu items with their full details and categories
     */
    res.json(rows);
  });
};

/*
 * Define the getCategories function
 * This is an API endpoint handler that retrieves all menu categories
 * Categories are used to organize menu items on the frontend (e.g., Drinks, Food, Desserts)
 * req: The incoming HTTP request from the client
 * res: The HTTP response object used to send category data back to the client
 */
const getCategories = (req, res) => {
  /*
   * Create a SQL query that retrieves all categories sorted by display order
   * SELECT: Get the id and name of each category
   * ORDER BY display_order: Sort categories by their display_order field
   *   This ensures categories appear in the correct order on the frontend UI
   */
  const query = `
    SELECT id, name, display_order
    FROM categories
    ORDER BY display_order ASC
  `;

  /*
   * Execute the query and retrieve all category rows from the database
   * db.all() runs the query and returns ALL categories
   * The empty array [] contains query parameters (none needed here)
   * The callback function runs when the query completes (err, rows)
   */
  db.all(query, [], (err, rows) => {
    /*
     * Check if an error occurred while executing the query
     * If so, send back an error response with status 500 (Internal Server Error)
     */
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    /*
     * If the query was successful, send the categories back to the client as JSON
     * The rows contain all categories in the correct display order
     */
    res.json(rows);
  });
};

/*
 * Export the controller functions
 * This makes both getMenu and getCategories available to other files that import this module
 */
module.exports = { getMenu, getCategories };
