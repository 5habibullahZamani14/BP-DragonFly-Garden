const fs = require('fs');

const dictionaries = {
  'en': {
    'items': 'items',
    'live': 'live',
    'catPreOrderSpecials': 'Pre-Order Specials',
    'catHerbalTea': 'Herbal Tea',
    'preOrder3Days': 'PRE-ORDER 3 DAYS'
  },
  'zh': {
    'items': '项',
    'live': '进行中',
    'catPreOrderSpecials': '预订特选',
    'catHerbalTea': '花草茶',
    'preOrder3Days': '提前3天预订'
  },
  'ms': {
    'items': 'item',
    'live': 'siaran langsung',
    'catPreOrderSpecials': 'Istimewa Pra-Pesanan',
    'catHerbalTea': 'Teh Herba',
    'preOrder3Days': 'PRA-PESAN 3 HARI'
  },
  'ar': {
    'items': 'عناصر',
    'live': 'مباشر',
    'catPreOrderSpecials': 'عروض الطلب المسبق',
    'catHerbalTea': 'شاي أعشاب',
    'preOrder3Days': 'طلب مسبق قبل 3 أيام'
  },
  'fa': {
    'items': 'مورد',
    'live': 'فعال',
    'catPreOrderSpecials': 'پیش‌سفارش ویژه',
    'catHerbalTea': 'چای گیاهی',
    'preOrder3Days': 'پیش‌سفارش ۳ روزه'
  },
  'hi': {
    'items': 'आइटम',
    'live': 'लाइव',
    'catPreOrderSpecials': 'प्री-ऑर्डर विशेष',
    'catHerbalTea': 'हर्बल चाय',
    'preOrder3Days': 'प्री-ऑर्डर 3 दिन'
  }
};

const locales = Object.keys(dictionaries);

for (const lang of locales) {
  const file = 'src/locales/' + lang + '.ts';
  let content = fs.readFileSync(file, 'utf8');
  
  for (const [key, val] of Object.entries(dictionaries[lang])) {
    if (!content.includes('"customer.' + key + '":')) {
      content = content.replace('translation: {', 'translation: {\n    "customer.' + key + '": "' + val + '",');
    }
  }
  
  fs.writeFileSync(file, content);
}

// Now patch CustomerView.tsx
let cv = fs.readFileSync('src/components/garden/CustomerView.tsx', 'utf8');

// Patch "items"
cv = cv.replace('{filtered.length} items</span>', '{filtered.length} {t("customer.items")}</span>');

// Patch "live"
cv = cv.replace('{promos.length} live</span>', '{promos.length} {t("customer.live")}</span>');

// Patch category translation logic
const oldCatLogic = 'item.category_name === "Mains" ? t("customer.catMains") : item.category_name === "Small Bites" ? t("customer.catSmallBites") : item.category_name === "Enzyme Drinks" ? t("customer.catEnzymeDrinks") : item.category_name === "Beverages" ? t("customer.catBeverages") : item.category_name';
const newCatLogic = 'item.category_name === "Mains" ? t("customer.catMains") : item.category_name === "Small Bites" ? t("customer.catSmallBites") : item.category_name === "Enzyme Drinks" ? t("customer.catEnzymeDrinks") : item.category_name === "Beverages" ? t("customer.catBeverages") : item.category_name === "Pre-Order Specials" ? t("customer.catPreOrderSpecials") : item.category_name === "Herbal Tea" ? t("customer.catHerbalTea") : item.category_name';

// Need to replace it globally or everywhere it appears (2 places for item.category_name)
cv = cv.split(oldCatLogic).join(newCatLogic);

// For the category bar (which uses `c === "Mains"` etc)
const oldBarLogic = 'c === "Mains" ? t("customer.catMains") :\n                     c === "Small Bites" ? t("customer.catSmallBites") :\n                     c === "Enzyme Drinks" ? t("customer.catEnzymeDrinks") :\n                     c === "Beverages" ? t("customer.catBeverages") : c';
const newBarLogic = 'c === "Mains" ? t("customer.catMains") :\n                     c === "Small Bites" ? t("customer.catSmallBites") :\n                     c === "Enzyme Drinks" ? t("customer.catEnzymeDrinks") :\n                     c === "Beverages" ? t("customer.catBeverages") :\n                     c === "Pre-Order Specials" ? t("customer.catPreOrderSpecials") :\n                     c === "Herbal Tea" ? t("customer.catHerbalTea") : c';
cv = cv.split(oldBarLogic).join(newBarLogic);

// Promo label patch
cv = cv.replace('{p.promo_label || "Promo"}', '{p.promo_label === "PRE-ORDER 3 DAYS" ? t("customer.preOrder3Days") : p.promo_label || "Promo"}');

fs.writeFileSync('src/components/garden/CustomerView.tsx', cv);
console.log('CustomerView and Locales patched for final bits successfully!');
