// Mock menu data — only used when the live API isn't reachable (e.g. preview).
// Mirrors the real backend shape so production calls behave identically.

export type MenuItem = {
  id: number;
  name: string;
  description: string;
  price: number;
  category_name: string;
  image_url?: string;
  is_popular?: boolean;
  is_promo?: boolean;
  promo_label?: string;
};

const IMG = (slug: string) => `/menu-images/${slug}.jpg`;

export const MOCK_MENU: MenuItem[] = [
  // Mains
  { id: 1, name: "Ah Ma's Curry", description: "Grandma's slow-simmered herbal curry with farm vegetables.", price: 18.9, category_name: "Mains", image_url: IMG("ah-ma-curry"), is_popular: true },
  { id: 2, name: "Farm Herbal Fried Rice", description: "Wok-tossed jasmine rice with mugwort, kampung egg & garden herbs.", price: 16.9, category_name: "Mains", image_url: IMG("farm-herbal-fried-rice") },
  { id: 3, name: "Farm Herbal Soup", description: "12-hour double-boiled tonic soup with mountain herbs.", price: 19.9, category_name: "Mains", image_url: IMG("farm-herbal-soup") },
  { id: 4, name: "Kocha Char Koay Teow", description: "Charcoal-fired flat noodles, prawns & cockles, smoky wok hei.", price: 17.9, category_name: "Mains", image_url: IMG("kocha-char-koay-teow"), is_promo: true, promo_label: "CHEF'S PICK" },
  { id: 5, name: "Meesua Herbal Soup", description: "Silky meesua noodles in a clear ginger-herbal broth.", price: 16.5, category_name: "Mains", image_url: IMG("meesua-herbal-soup") },
  { id: 6, name: "Spaghetti Carbonara", description: "Cured pork, free-range yolk, aged parmesan, cracked pepper.", price: 22.0, category_name: "Mains", image_url: IMG("spaghetti-carbonara") },
  { id: 7, name: "Spaghetti Stir-Fried", description: "Asian-style spaghetti with garlic, chilli & garden basil.", price: 19.5, category_name: "Mains", image_url: IMG("spaghetti-stir-fried") },
  { id: 8, name: "Vegetarian Herbal Steamboat", description: "Bubbling pot of seasonal greens, tofu & medicinal roots.", price: 38.0, category_name: "Mains", image_url: IMG("vegetarian-herbal-steamboat"), is_promo: true, promo_label: "FOR 2" },

  // Small Bites
  { id: 9, name: "Mummy Farm Salad", description: "Crisp leaves, edible flowers, citrus-honey vinaigrette.", price: 14.9, category_name: "Small Bites", image_url: IMG("mummy-farm-salad") },
  { id: 10, name: "Jacket Potato", description: "Oven-baked, cheddar gratin, sour cream, chives.", price: 12.9, category_name: "Small Bites", image_url: IMG("jacket-potato") },
  { id: 11, name: "Kampung Eggs", description: "Soft-set village eggs on toasted sourdough.", price: 11.5, category_name: "Small Bites", image_url: IMG("kampung-eggs") },
  { id: 12, name: "Mushroom Soup", description: "Wild forest mushrooms, fresh cream, truffle oil drizzle.", price: 13.5, category_name: "Small Bites", image_url: IMG("mushroom-soup") },
  { id: 13, name: "Papa Sandwich", description: "Slow-roasted chicken, garden lettuce, herb mayo.", price: 15.5, category_name: "Small Bites", image_url: IMG("papa-sandwich") },
  { id: 14, name: "Hummus Plate", description: "Whipped chickpea, olive oil, sumac, warm flatbread.", price: 12.0, category_name: "Small Bites", image_url: IMG("small-bites-hummus") },

  // Enzyme Drinks
  { id: 15, name: "Colour of Night", description: "Butterfly pea & mulberry — deep indigo, lightly tart.", price: 12.0, category_name: "Enzyme Drinks", image_url: IMG("colour-of-night"), is_promo: true, promo_label: "NEW" },
  { id: 16, name: "D'Passion", description: "Passionfruit enzyme — bright, tropical, gently sparkling.", price: 12.0, category_name: "Enzyme Drinks", image_url: IMG("d-passion") },
  { id: 17, name: "Le Mulberry", description: "Hand-picked mulberry, fermented to silken sweetness.", price: 12.0, category_name: "Enzyme Drinks", image_url: IMG("le-mulberry") },
  { id: 18, name: "Nutmeg Fantasy", description: "Heritage nutmeg with hints of clove & honey.", price: 12.0, category_name: "Enzyme Drinks", image_url: IMG("nutmeg-fantasy") },
  { id: 19, name: "Rising Sun", description: "Kumquat, ginger & turmeric — warm, golden, bright.", price: 12.0, category_name: "Enzyme Drinks", image_url: IMG("rising-sun") },
  { id: 20, name: "Tropicana", description: "Pineapple, calamansi & mint — pure island summer.", price: 12.0, category_name: "Enzyme Drinks", image_url: IMG("tropicana") },

  // Beverages (no photo on purpose — placeholder leaf shows)
  { id: 21, name: "Kopi O", description: "Traditional black coffee, slow-roasted local beans.", price: 4.5, category_name: "Beverages" },
  { id: 22, name: "Honey Lemon", description: "Warm honey & freshly squeezed lemon.", price: 6.0, category_name: "Beverages" },
  { id: 23, name: "Mugwort Tea", description: "Hand-dried mugwort leaves, gently grassy & soothing.", price: 5.5, category_name: "Beverages" },
];

export type Order = {
  id: number;
  status: "queue" | "preparing" | "ready";
  table_number: string;
  total_price: number;
  created_at?: string;
  customer_archived_at?: string | null;
  items: {
    id: number;
    quantity: number;
    item_name: string;
    notes?: string;
    price_at_order_time?: number;
    item_status?: "queue" | "preparing" | "ready";
  }[];
};

export const MOCK_KITCHEN_ORDERS: Order[] = [
  { id: 1042, status: "queue", table_number: "Table 4", total_price: 36.8,
    items: [{ id: 1, quantity: 1, item_name: "Ah Ma's Curry", notes: "Less spicy" }, { id: 2, quantity: 1, item_name: "Colour of Night" }] },
  { id: 1043, status: "preparing", table_number: "Table 7", total_price: 51.4,
    items: [{ id: 3, quantity: 2, item_name: "Spaghetti Carbonara" }, { id: 4, quantity: 1, item_name: "Mushroom Soup", notes: "Extra truffle oil" }] },
  { id: 1044, status: "ready", table_number: "Table 2", total_price: 28.4,
    items: [{ id: 5, quantity: 1, item_name: "Papa Sandwich" }, { id: 6, quantity: 1, item_name: "Tropicana" }] },
];
