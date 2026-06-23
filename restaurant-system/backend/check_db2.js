const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src/database/database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all(`
  SELECT id, total_price, payment_status, created_at 
  FROM orders 
  ORDER BY id DESC 
  LIMIT 5
`, [], (err, orders) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log("=== LATEST ORDERS ===");
  console.log(JSON.stringify(orders, null, 2));

  db.all(`
    SELECT id, order_id, menu_item_id, quantity, price_at_order_time, notes, options_json 
    FROM order_items 
    ORDER BY id DESC 
    LIMIT 10
  `, [], (err, items) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("=== LATEST ORDER ITEMS ===");
    console.log(JSON.stringify(items, null, 2));
    db.close();
  });
});
