const fs = require('fs');

const dictionaries = {
  'en': {
    'liveTracking': 'Live tracking',
    'yourOrders': 'Your Orders',
    'followPlates': 'Follow each plate from the kitchen all the way to your table.',
    'onceYouSend': "Once you send something to the kitchen, you'll see it growing here in real time.",
    'browseMenu': 'Browse the menu'
  },
  'zh': {
    'liveTracking': '实时追踪',
    'yourOrders': '您的订单',
    'followPlates': '从厨房到餐桌，全程追踪您的菜品。',
    'onceYouSend': '当您向厨房发送订单后，可以在这里实时查看进度。',
    'browseMenu': '浏览菜单'
  },
  'ms': {
    'liveTracking': 'Penjejakan Langsung',
    'yourOrders': 'Pesanan Anda',
    'followPlates': 'Jejaki setiap hidangan dari dapur terus ke meja anda.',
    'onceYouSend': 'Setelah anda membuat pesanan, anda boleh melihat perkembangannya di sini secara langsung.',
    'browseMenu': 'Lihat menu'
  },
  'ar': {
    'liveTracking': 'تتبع مباشر',
    'yourOrders': 'طلباتك',
    'followPlates': 'تتبع كل طبق من المطبخ حتى يصل إلى طاولتك.',
    'onceYouSend': 'بمجرد إرسال طلبك إلى المطبخ، ستراه يتقدم هنا في الوقت الفعلي.',
    'browseMenu': 'تصفح القائمة'
  },
  'fa': {
    'liveTracking': 'پیگیری زنده',
    'yourOrders': 'سفارشات شما',
    'followPlates': 'هر بشقاب را از آشپزخانه تا میز خود دنبال کنید.',
    'onceYouSend': 'پس از ارسال سفارش به آشپزخانه، پیشرفت آن را در اینجا به صورت زنده مشاهده خواهید کرد.',
    'browseMenu': 'مرور منو'
  },
  'hi': {
    'liveTracking': 'लाइव ट्रैकिंग',
    'yourOrders': 'आपके ऑर्डर',
    'followPlates': 'रसोई से लेकर आपकी टेबल तक प्रत्येक प्लेट को ट्रैक करें।',
    'onceYouSend': 'रसोई में अपना ऑर्डर भेजने के बाद, आप यहां इसे लाइव देख सकते हैं।',
    'browseMenu': 'मेनू ब्राउज़ करें'
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

// Patch 1: Live tracking
cv = cv.replace('Live tracking', '{t("customer.liveTracking")}');

// Patch 2: Your Orders heading
cv = cv.replace('Your <span className="italic text-accent">{t("customer.orders")}</span>', '<span className="italic text-accent">{t("customer.yourOrders")}</span>');

// Patch 3: Follow each plate
cv = cv.replace('Follow each plate from the kitchen all the way to your table.', '{t("customer.followPlates")}');

// Patch 4: Once you send
cv = cv.replace("Once you send something to the kitchen, you'll see it growing here in real time.", '{t("customer.onceYouSend")}');

// Patch 5: Browse the menu
cv = cv.replace('Browse the menu <ArrowRight className="h-4 w-4" />', '{t("customer.browseMenu")} <ArrowRight className="h-4 w-4" />');

fs.writeFileSync('src/components/garden/CustomerView.tsx', cv);
console.log('CustomerView and Locales patched for Orders tab successfully!');
