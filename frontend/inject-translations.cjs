const fs = require('fs');

const code = fs.readFileSync('src/components/garden/CustomerView.tsx', 'utf8');
const regex = /t\(([\"'])(customer\.[a-zA-Z0-9_]+)\1\)/g;
const keys = new Set();
let m;
while ((m = regex.exec(code)) !== null) {
  keys.add(m[2]);
}

const allKeys = Array.from(keys);
console.log('Found ' + allKeys.length + ' keys in CustomerView');

const englishDefaults = {
  'customer.searchMenu': 'Search the menu...',
  'customer.farmToTable': 'FARM TO TABLE',
  'customer.nature': 'nature',
  'customer.browseSub': 'Slow-simmered herbal soup paired with our signature healthy multigrain rice',
  'customer.exploreMenu': 'Explore the Menu',
  'customer.thisWeek': 'THIS WEEK',
  'customer.chefsFav': "Chef's Favorites",
  'customer.popular': 'POPULAR',
  'customer.add': 'Add',
  'customer.callStaff': 'Call Staff',
  'customer.orders': 'Orders',
  'customer.menu': 'Menu',
  'customer.home': 'Home'
};

const locales = ['en.ts', 'zh.ts', 'ms.ts', 'ar.ts', 'fa.ts', 'hi.ts'];

for (const loc of locales) {
  const file = 'src/locales/' + loc;
  let locCode = fs.readFileSync(file, 'utf8');
  
  const toInject = [];
  for (const k of allKeys) {
    if (!locCode.includes('"' + k + '":')) {
      // Find the english text, or use the key name
      const val = englishDefaults[k] || k.replace('customer.', '');
      toInject.push('    "' + k + '": "' + val + '"');
    }
  }
  
  if (toInject.length > 0) {
    locCode = locCode.replace('translation: {', 'translation: {\n' + toInject.join(',\n') + ',');
    fs.writeFileSync(file, locCode);
    console.log('Injected ' + toInject.length + ' keys into ' + loc);
  }
}
