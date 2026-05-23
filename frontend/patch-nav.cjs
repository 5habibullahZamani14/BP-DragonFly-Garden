const fs = require('fs');

const dictionaries = {
  'en': {
    'home': 'Home',
    'menu': 'Menu'
  },
  'zh': {
    'home': '主页',
    'menu': '菜单'
  },
  'ms': {
    'home': 'Laman Utama',
    'menu': 'Menu'
  },
  'ar': {
    'home': 'الرئيسية',
    'menu': 'القائمة'
  },
  'fa': {
    'home': 'خانه',
    'menu': 'منو'
  },
  'hi': {
    'home': 'होम',
    'menu': 'मेनू'
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

console.log('Nav keys patched successfully!');
