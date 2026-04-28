const db = require("./db");

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

const MENU_ITEMS = [
  ["Coke", "Refreshing cola drink, chilled and served with ice", 3.5, "Drinks", 1, null],
  ["Water", "Fresh filtered water, still or sparkling", 1.5, "Drinks", 1, null],
  ["Cappuccino", "Rich espresso with steamed milk and foam", 4.5, "Drinks", 1, null],
  ["Iced Coffee", "Cold brew coffee served over ice with cream", 4.0, "Drinks", 1, null],
  ["Burger", "Juicy beef patty with lettuce, tomato, cheese, and sauce", 8.0, "Food", 1, null],
  ["Caesar Salad", "Fresh romaine lettuce with parmesan and house-made dressing", 7.5, "Food", 1, null],
  ["Chicken Sandwich", "Grilled chicken breast with avocado and fresh vegetables", 8.5, "Food", 1, null],
  ["French Fries", "Crispy golden fries with salt and your choice of dip", 3.5, "Food", 1, null],
  ["Chocolate Cake", "Rich, moist chocolate cake with creamy frosting", 5.5, "Desserts", 1, null],
  ["Cheesecake", "Classic New York style cheesecake with berry topping", 6.0, "Desserts", 1, null],
  ["Ice Cream", "Creamy ice cream, choose from vanilla, chocolate, or strawberry", 3.5, "Desserts", 1, null]
];

const TABLES = Array.from({ length: 5 }, (_, index) => ({
  table_number: `Table ${index + 1}`,
  qr_code: `table-${index + 1}`
}));

const seedDatabase = async () => {
  const categoryCount = await get("SELECT COUNT(*) AS count FROM categories");

  if (!categoryCount || categoryCount.count === 0) {
    await run(`INSERT INTO categories (name, display_order) VALUES ('Drinks', 1)`);
    await run(`INSERT INTO categories (name, display_order) VALUES ('Food', 2)`);
    await run(`INSERT INTO categories (name, display_order) VALUES ('Desserts', 3)`);
  }

  for (const [name, description, price, categoryName, isAvailable, imageUrl] of MENU_ITEMS) {
    const category = await get(`SELECT id FROM categories WHERE name = ?`, [categoryName]);
    const existingRows = await all(`SELECT id FROM menu_items WHERE name = ? ORDER BY id ASC`, [name]);

    if (existingRows.length === 0 && category) {
      await run(
        `
          INSERT INTO menu_items (name, description, price, category_id, is_available, image_url)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [name, description, price, category.id, isAvailable, imageUrl]
      );
      continue;
    }

    if (existingRows.length > 0 && category) {
      const canonicalId = existingRows[0].id;

      await run(
        `
          UPDATE menu_items
          SET description = ?, price = ?, category_id = ?, image_url = ?, is_available = CASE WHEN id = ? THEN ? ELSE 0 END
          WHERE name = ?
        `,
        [description, price, category.id, imageUrl, canonicalId, isAvailable, name]
      );
    }
  }

  for (const table of TABLES) {
    const existingTable = await get(
      `
        SELECT id
        FROM tables
        WHERE qr_code = ?
      `,
      [table.qr_code]
    );

    if (existingTable) {
      await run(
        `
          UPDATE tables
          SET table_number = ?
          WHERE id = ?
        `,
        [table.table_number, existingTable.id]
      );
      continue;
    }

    await run(
      `
        INSERT INTO tables (table_number, qr_code)
        VALUES (?, ?)
      `,
      [table.table_number, table.qr_code]
    );
  }

  console.log("Seed data ready");
};

module.exports = seedDatabase;
