const fs = require('fs');

const dictionaries = {
  'en': {
    'soldOut': 'Sold Out',
    'goodnessOf': 'Goodness of',
    'servedFresh': 'served fresh'
  },
  'zh': {
    'soldOut': '售罄',
    'goodnessOf': '自然的美好，',
    'servedFresh': '新鲜送达'
  },
  'ms': {
    'soldOut': 'Habis Dijual',
    'goodnessOf': 'Kebaikan',
    'servedFresh': 'dihidangkan segar'
  },
  'ar': {
    'soldOut': 'مباع',
    'goodnessOf': 'خيرات',
    'servedFresh': 'تقدم طازجة'
  },
  'fa': {
    'soldOut': 'تمام شد',
    'goodnessOf': 'خوبی‌های',
    'servedFresh': 'تازه سرو می‌شود'
  },
  'hi': {
    'soldOut': 'बिक गया',
    'goodnessOf': 'की अच्छाई',
    'servedFresh': 'ताजा परोसा गया'
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

// Patch 1: Goodness of
cv = cv.replace('Goodness of<br />', '{t("customer.goodnessOf")}<br />');

// Patch 2: served fresh.
cv = cv.replace('}}>{t("customer.nature")}</span>, served fresh.', '}}>{t("customer.nature")}</span>, {t("customer.servedFresh")}.');

// Patch 3: Nav items
cv = cv.replace('{ id: "home", label: "Home", icon: Home }', '{ id: "home", label: t("customer.home"), icon: Home }');
cv = cv.replace('{ id: "menu", label: "Menu", icon: UtensilsCrossed }', '{ id: "menu", label: t("customer.menu"), icon: UtensilsCrossed }');
cv = cv.replace('{ id: "orders", label: "Orders", icon: Receipt }', '{ id: "orders", label: t("customer.orders"), icon: Receipt }');

// Patch 4: Sold Out & Add in Recommended cards (Line 751-758)
cv = cv.replace('item.is_sold_out ? "Sold Out" : <><Plus className="h-3.5 w-3.5" /> Add</>', 'item.is_sold_out ? t("customer.soldOut") : <><Plus className="h-3.5 w-3.5" /> {t("customer.add")}</>');

// Patch 5: category name in Recommended cards (Line 761)
const catT = '{item.category_name === "Mains" ? t("customer.catMains") : item.category_name === "Small Bites" ? t("customer.catSmallBites") : item.category_name === "Enzyme Drinks" ? t("customer.catEnzymeDrinks") : item.category_name === "Beverages" ? t("customer.catBeverages") : item.category_name}';
cv = cv.replace('<p className="mt-0.5 text-[0.65rem] text-foreground/50 line-clamp-1">{item.category_name}</p>', '<p className="mt-0.5 text-[0.65rem] text-foreground/50 line-clamp-1">' + catT + '</p>');

// Patch 6: category name in Menu cards (Line 861)
cv = cv.replace('<p className="text-[0.58rem] font-medium uppercase tracking-widest text-foreground/40">{item.category_name}</p>', '<p className="text-[0.58rem] font-medium uppercase tracking-widest text-foreground/40">' + catT + '</p>');

// Patch 7: Sold Out & Add in Menu cards (Line 869)
cv = cv.replace('item.is_sold_out ? "Sold Out" : <><Plus className="h-3.5 w-3.5" /> Add</>', 'item.is_sold_out ? t("customer.soldOut") : <><Plus className="h-3.5 w-3.5" /> {t("customer.add")}</>');

fs.writeFileSync('src/components/garden/CustomerView.tsx', cv);
console.log('CustomerView and Locales patched successfully!');
