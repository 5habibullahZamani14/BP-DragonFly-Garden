const fs = require('fs');

const dictionaries = {
  'en': {
    'dragonflyGarden': 'Dragonfly Garden',
    'fontPreviewText': 'The quick brown fox jumps over the lazy dog. Fresh from the farm, served with love.'
  },
  'zh': {
    'dragonflyGarden': '蜻蜓花园',
    'fontPreviewText': '敏捷的棕色狐狸跳过懒惰的狗。农场新鲜直达，倾心呈献。'
  },
  'ms': {
    'dragonflyGarden': 'Taman Pepatung',
    'fontPreviewText': 'Musang coklat pantas melompat ke atas anjing malas. Segar dari ladang, dihidangkan dengan penuh kasih sayang.'
  },
  'ar': {
    'dragonflyGarden': 'حديقة اليعسوب',
    'fontPreviewText': 'قفز الثعلب البني السريع فوق الكلب الكسول. طازج من المزرعة، ومقدم بحب.'
  },
  'fa': {
    'dragonflyGarden': 'باغ سنجاقک',
    'fontPreviewText': 'روباه قهوه‌ای چابک از روی سگ تنبل پرید. تازه از مزرعه، با عشق سرو می‌شود.'
  },
  'hi': {
    'dragonflyGarden': 'ड्रैगनफ्लाई गार्डन',
    'fontPreviewText': 'तेज भूरी लोमड़ी आलसी कुत्ते के ऊपर से कूद गई। खेत से ताज़ा, प्यार के साथ परोसा गया।'
  }
};

const locales = Object.keys(dictionaries);

for (const lang of locales) {
  const file = 'src/locales/' + lang + '.ts';
  let content = fs.readFileSync(file, 'utf8');
  
  for (const [key, val] of Object.entries(dictionaries[lang])) {
    if (!content.includes('"settings.' + key + '":')) {
      content = content.replace('translation: {', 'translation: {\n    "settings.' + key + '": "' + val + '",');
    }
  }
  
  fs.writeFileSync(file, content);
}

// Now patch SettingsModal.tsx
let sm = fs.readFileSync('src/components/garden/SettingsModal.tsx', 'utf8');

sm = sm.replace('Dragonfly Garden\n                </span>', '{t("settings.dragonflyGarden")}\n                </span>');
sm = sm.replace('The quick brown fox jumps over the lazy dog. Fresh from the farm, served with love.', '{t("settings.fontPreviewText")}');

fs.writeFileSync('src/components/garden/SettingsModal.tsx', sm);
console.log('SettingsModal and Locales patched successfully!');
