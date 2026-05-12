/*
 * seed.js — Default data for a fresh installation.
 *
 * This file inserts the starting data the application needs to be usable
 * right away: the actual BP DragonFly Garden menu items, five restaurant
 * tables, and the accepted payment methods. Every insert is idempotent —
 * I check whether the record already exists before inserting, so running
 * the seeder multiple times (which happens on every server restart) does
 * not create duplicates. It will, however, update prices and descriptions
 * to match whatever is defined here, which is intentional — this file is
 * the single source of truth for the menu data.
 */

const db = require("./db");

/*
 * Promise wrappers for the three SQLite operations used in this file.
 * run is for INSERT/UPDATE, get returns a single row, all returns many rows.
 */
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

/*
 * Menu categories in the order they should appear on the menu.
 * display_order controls the sort order shown to customers.
 */
const CATEGORIES = [
  { name: "Mains", display_order: 1 },
  { name: "Beverages", display_order: 2 },
  { name: "Herbal Tea", display_order: 3 },
  { name: "Enzyme Drinks", display_order: 4 },
  { name: "Pre-Order Specials", display_order: 5 }
];

/*
 * IMG builds the path to a menu item's photo. All photos are stored under
 * frontend/public/menu-images/ as JPEG files named by slug.
 * Items without a photo pass null, which causes the frontend to show a
 * generic leaf-on-cream placeholder instead.
 */
const IMG = (slug) => `/menu-images/${slug}.jpg`;

/*
 * MENU_ITEMS contains every item on the BP DragonFly Garden menu.
 * Each entry is a tuple in this order:
 *   [name, description, price, category, isAvailable, imageUrl, isPopular, isPromo, promoLabel]
 *
 * These are the actual dishes and drinks served at the restaurant,
 * including their real prices (in MYR) and descriptions.
 */
const MENU_ITEMS = [
  // ── Mains ──────────────────────────────────────────────────────────────────
  ["Kocha Char Koay Teow", "Stir-fried flat rice noodles with a smoky wok-charred flavour.", 6.0, "Mains", 1, IMG("kocha-char-koay-teow"), 0, 0, null],
  ["Spaghetti Stir Fried", "Asian-style stir-fried spaghetti with seasonal vegetables.", 7.0, "Mains", 1, IMG("spaghetti-stir-fried"), 0, 0, null],
  ["Kampung Eggs (2pcs)", "Two soft-boiled village (kampung) eggs served warm.", 4.0, "Mains", 1, IMG("kampung-eggs"), 0, 0, null],
  /* Farm Herbal Soup is marked as popular (isPopular = 1) because it is the signature dish. */
  ["Farm Herbal Soup with Healthy Rice", "Slow-simmered herbal soup paired with our signature healthy multigrain rice.", 10.0, "Mains", 1, IMG("farm-herbal-soup"), 1, 0, null],
  ["Meesua Herbal Soup", "Fine meesua noodles in a comforting herbal broth.", 9.0, "Mains", 1, IMG("meesua-herbal-soup"), 0, 0, null],
  ["Small Bites - Hummus Sesame", "Crispy crackers served with creamy sesame hummus dip.", 4.0, "Mains", 1, IMG("small-bites-hummus"), 0, 0, null],
  ["Small Bites - Hummus Milky", "Crispy crackers served with our creamy milky hummus dip.", 4.0, "Mains", 1, IMG("small-bites-hummus"), 0, 0, null],
  ["Papa Sandwich (Egg + Cheese)", "Toasted sandwich filled with fluffy egg and melted cheese.", 6.0, "Mains", 1, IMG("papa-sandwich"), 0, 0, null],
  ["Papa Sandwich (Egg Only)", "Toasted sandwich with our farm-fresh egg.", 5.0, "Mains", 1, IMG("papa-sandwich"), 0, 0, null],
  ["Mushroom Soup", "Creamy mushroom soup served with a slice of bread.", 6.0, "Mains", 1, IMG("mushroom-soup"), 0, 0, null],
  ["Jacket Potato", "Baked potato loaded with savoury filling and fresh garnish.", 7.0, "Mains", 1, IMG("jacket-potato"), 0, 0, null],
  ["Mummy Farm Salad", "Garden-fresh salad with crisp lettuce, tomato and house dressing.", 8.0, "Mains", 1, IMG("mummy-farm-salad"), 0, 0, null],
  ["Farm Herbal Fried Rice", "Wok-fried rice infused with our farm herbal blend, served with egg and sides.", 8.0, "Mains", 1, IMG("farm-herbal-fried-rice"), 0, 0, null],
  ["Ah Ma Curry with Healthy Rice", "Grandma's secret-recipe curry served with our healthy multigrain rice.", 8.0, "Mains", 1, IMG("ah-ma-curry"), 0, 0, null],
  ["Spaghetti Carbonara", "Creamy spaghetti carbonara with cheese, egg and a hint of pepper.", 9.0, "Mains", 1, IMG("spaghetti-carbonara"), 0, 0, null],

  // ── Beverages ──────────────────────────────────────────────────────────────
  ["Kopi O (南洋咖啡乌)", "Traditional black coffee, brewed Nanyang-style.", 3.0, "Beverages", 1, null, 0, 0, null],
  ["Kopi with Milk (南洋咖啡奶)", "Traditional Nanyang coffee with a swirl of milk.", 3.5, "Beverages", 1, null, 0, 0, null],
  ["Milo O (美禄乌)", "Hot Milo without milk, classic and chocolatey.", 3.0, "Beverages", 1, null, 0, 0, null],
  ["Milo with Milk (美禄奶)", "Hot Milo with creamy milk.", 3.5, "Beverages", 1, null, 0, 0, null],
  ["Honey Lemon (蜂蜜柑橘柠檬)", "Refreshing honey, citrus and lemon drink.", 4.0, "Beverages", 1, null, 0, 0, null],

  // ── Herbal Tea ─────────────────────────────────────────────────────────────
  ["Mugwort Herbal Tea (艾草)", "Supports menstrual health, aids relaxation, improves sleep, relieves pain and boosts immunity.", 4.0, "Herbal Tea", 1, null, 0, 0, null],

  // ── Enzyme Drinks ──────────────────────────────────────────────────────────
  /* Each enzyme drink is offered in two sizes: a glass served at the table and a bottle to take home. */
  ["D Passion - Glass (百香果酵素)", "Passionfruit enzyme. Relieves insomnia, keeps skin hydrated and glowing.", 5.0, "Enzyme Drinks", 1, IMG("d-passion"), 0, 0, null],
  ["D Passion - Bottle (百香果酵素)", "Passionfruit enzyme bottle to take home. Relieves insomnia, keeps skin glowing.", 12.0, "Enzyme Drinks", 1, IMG("d-passion"), 0, 0, null],
  ["Le Mulberry - Glass (桑葚酵素)", "Mulberry enzyme. Improves eyesight, reduces age spots and acts as an antioxidant.", 7.0, "Enzyme Drinks", 1, IMG("le-mulberry"), 0, 0, null],
  ["Le Mulberry - Bottle (桑葚酵素)", "Mulberry enzyme bottle to take home.", 18.0, "Enzyme Drinks", 1, IMG("le-mulberry"), 0, 0, null],
  ["Nutmeg Fantasy - Glass (豆蔻酵素)", "Nutmeg enzyme. Soothes anxiety, depression and rheumatic pain.", 5.0, "Enzyme Drinks", 1, IMG("nutmeg-fantasy"), 0, 0, null],
  ["Nutmeg Fantasy - Bottle (豆蔻酵素)", "Nutmeg enzyme bottle to take home.", 12.0, "Enzyme Drinks", 1, IMG("nutmeg-fantasy"), 0, 0, null],
  ["Tropicana - Glass (黄梨酵素)", "Pineapple enzyme. Anti-inflammatory and helps reduce obesity.", 5.0, "Enzyme Drinks", 1, IMG("tropicana"), 0, 0, null],
  ["Tropicana - Bottle (黄梨酵素)", "Pineapple enzyme bottle to take home.", 12.0, "Enzyme Drinks", 1, IMG("tropicana"), 0, 0, null],
  ["Rising Sun - Glass (老姜酵素)", "Old ginger enzyme. Improves immunity and promotes blood circulation.", 5.0, "Enzyme Drinks", 1, IMG("rising-sun"), 0, 0, null],
  ["Rising Sun - Bottle (老姜酵素)", "Old ginger enzyme bottle to take home.", 12.0, "Enzyme Drinks", 1, IMG("rising-sun"), 0, 0, null],
  ["Colour of Night - Glass (香茅酵素)", "Lemongrass enzyme. Boosts memory and helps with digestion and nutrient absorption.", 5.0, "Enzyme Drinks", 1, IMG("colour-of-night"), 0, 0, null],
  ["Colour of Night - Bottle (香茅酵素)", "Lemongrass enzyme bottle to take home.", 12.0, "Enzyme Drinks", 1, IMG("colour-of-night"), 0, 0, null],

  // ── Pre-Order Specials ─────────────────────────────────────────────────────
  /* The steamboat requires advance notice so the kitchen can prepare the herbal broth base. */
  ["Vegetarian Herbal Steamboat", "Wholesome herbal steamboat. RM28 per person, minimum 4 people. Pre-order 3 days ahead.", 28.0, "Pre-Order Specials", 1, IMG("vegetarian-herbal-steamboat"), 0, 1, "PRE-ORDER 3 DAYS"]
];

/*
 * Five tables to match the physical layout of the restaurant.
 * Each table's qr_code must match the code printed on the QR sticker placed
 * on that table. The format "table-N" is what the role detection middleware
 * expects to see in the URL query string.
 */
const TABLES = Array.from({ length: 5 }, (_, index) => ({
  table_number: `Table ${index + 1}`,
  qr_code: `table-${index + 1}`
}));

/*
 * seedDatabase runs through all seed data and either inserts or updates each
 * record. The logic for each entity type is the same: check if it exists,
 * update if it does, insert if it does not. This means the database always
 * reflects what is defined above after every server start.
 */
const seedDatabase = async () => {
  /* Seed categories — update display_order if the category already exists. */
  for (const category of CATEGORIES) {
    const existing = await get(`SELECT id FROM categories WHERE name = ?`, [category.name]);

    if (existing) {
      await run(
        `UPDATE categories SET display_order = ? WHERE id = ?`,
        [category.display_order, existing.id]
      );
      continue;
    }

    await run(
      `INSERT INTO categories (name, display_order) VALUES (?, ?)`,
      [category.name, category.display_order]
    );
  }

  /*
   * Seed menu items. For each item, I look up its category first, then check
   * if an item with that name already exists. If it does, I update all its
   * fields to match the definition above. If it does not, I insert it fresh.
   * The canonicalId logic handles the rare case where duplicate rows exist
   * from an earlier development phase — it keeps the first row and disables
   * any others.
   */
  for (const [
    name,
    description,
    price,
    categoryName,
    isAvailable,
    imageUrl,
    isPopular,
    isPromo,
    promoLabel
  ] of MENU_ITEMS) {
    const category = await get(`SELECT id FROM categories WHERE name = ?`, [categoryName]);
    const existingRows = await all(`SELECT id FROM menu_items WHERE name = ? ORDER BY id ASC`, [name]);

    if (existingRows.length === 0 && category) {
      await run(
        `
          INSERT INTO menu_items (name, description, price, category_id, is_available, image_url, is_popular, is_promo, promo_label)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [name, description, price, category.id, isAvailable, imageUrl, isPopular, isPromo, promoLabel]
      );
      continue;
    }

    if (existingRows.length > 0 && category) {
      const canonicalId = existingRows[0].id;

      await run(
        `
          UPDATE menu_items
          SET description = ?, price = ?, category_id = ?, image_url = ?, is_popular = ?, is_promo = ?, promo_label = ?, is_available = CASE WHEN id = ? THEN ? ELSE 0 END
          WHERE name = ?
        `,
        [description, price, category.id, imageUrl, isPopular, isPromo, promoLabel, canonicalId, isAvailable, name]
      );
    }
  }

  /*
   * Disable any menu items that are no longer in the MENU_ITEMS list above.
   * This ensures that items removed from the menu here do not keep showing up
   * in the customer-facing app after a server restart.
   */
  const allowedNames = MENU_ITEMS.map(([name]) => name);
  const placeholders = allowedNames.map(() => "?").join(", ");
  await run(
    `
      UPDATE menu_items
      SET is_available = 0, is_popular = 0, is_promo = 0, promo_label = NULL
      WHERE name NOT IN (${placeholders})
    `,
    allowedNames
  );

  /* Seed tables using the same insert-or-update pattern. */
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

  /* Seed payment methods — only insert if the method does not exist yet. */
  const PAYMENT_METHODS = ["Cash", "Visa Card", "Mastercard", "eWallet", "Other"];

  for (const method of PAYMENT_METHODS) {
    const existing = await get(`SELECT id FROM payment_methods WHERE name = ?`, [method]);

    if (!existing) {
      await run(`INSERT INTO payment_methods (name) VALUES (?)`, [method]);
    }
  }

  console.log("Seed data ready");
};

module.exports = seedDatabase;
