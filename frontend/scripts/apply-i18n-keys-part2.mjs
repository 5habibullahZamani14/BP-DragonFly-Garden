import fs from "fs";
import path from "path";

const KEYS = {
  "m.hoursDesc": { en: "These hours determine when employees are automatically logged out. The manager account is exempt from this restriction.", ar: "تحدد هذه الساعات متى يتم تسجيل خروج الموظفين تلقائياً. حساب المدير معفى.", zh: "这些时间决定员工自动登出时间。管理员账户除外。", ms: "Waktu ini menentukan log keluar automatik pekerja. Akaun pengurus dikecualikan.", fa: "این ساعات زمان خروج خودکار کارکنان را تعیین می‌کند. حساب مدیر معاف است.", hi: "ये समय तय करते हैं कि कर्मचारी कब स्वचालित लॉग आउट हों।" },
  "m.saved": { en: "Saved!", ar: "تم الحفظ!", zh: "已保存！", ms: "Disimpan!", fa: "ذخیره شد!", hi: "सहेजा गया!" },
  "m.kitchenPassDesc": { en: "This is the passcode your kitchen crew enters to access the Kitchen Board. Share it with your staff.", ar: "رمز مرور طاقم المطبخ للوصول إلى لوحة المطبخ.", zh: "厨房人员用于访问厨房看板的密码。", ms: "Kod laluan krew dapur untuk Papan Dapur.", fa: "رمز عبور آشپزخانه برای تابلوی آشپزخانه.", hi: "रसोई कर्मचारियों के लिए पासकोड।" },
  "m.passcodeLabel": { en: "Passcode", ar: "رمز المرور", zh: "密码", ms: "Kod Laluan", fa: "رمز عبور", hi: "पासकोड" },
  "m.updatePasscode": { en: "Update Passcode", ar: "تحديث الرمز", zh: "更新密码", ms: "Kemas Kini Kod", fa: "به‌روزرسانی رمز", hi: "पासकोड अपडेट" },
  "m.profileDesc": { en: "Your personal details and login credentials. Your email is used for password recovery.", ar: "بياناتك الشخصية وبيانات الدخول. يُستخدم بريدك لاستعادة كلمة المرور.", zh: "您的个人信息和登录凭据。邮箱用于密码恢复。", ms: "Butiran peribadi dan log masuk. E-mel untuk pemulihan kata laluan.", fa: "اطلاعات شخصی و ورود. ایمیل برای بازیابی رمز.", hi: "व्यक्तिगत विवरण और लॉगिन। ईमेल पुनर्प्राप्ति के लिए।" },
  "m.managerIdHint": { en: "(used to log in)", ar: "(لتسجيل الدخول)", zh: "（用于登录）", ms: "(untuk log masuk)", fa: "(برای ورود)", hi: "(लॉगिन के लिए)" },
  "m.emailLabel": { en: "Email Address", ar: "البريد الإلكتروني", zh: "电子邮箱", ms: "Alamat E-mel", fa: "ایمیل", hi: "ईमेल पता" },
  "m.emailHint": { en: "(for password recovery)", ar: "(لاستعادة كلمة المرور)", zh: "（用于密码恢复）", ms: "(untuk pemulihan kata laluan)", fa: "(برای بازیابی رمز)", hi: "(पासवर्ड पुनर्प्राप्ति)" },
  "m.phoneLabel": { en: "Phone / WhatsApp", ar: "الهاتف / واتساب", zh: "电话 / WhatsApp", ms: "Telefon / WhatsApp", fa: "تلفن / واتساپ", hi: "फोन / WhatsApp" },
  "m.changePasswordHint": { en: "(leave blank to keep current)", ar: "(اتركه فارغاً للإبقاء على الحالي)", zh: "（留空则保持不变）", ms: "(kosongkan untuk kekalkan semasa)", fa: "(خالی بگذارید تا فعلی بماند)", hi: "(वर्तमान रखने के लिए खाली छोड़ें)" },
  "m.newPassword": { en: "New Password", ar: "كلمة مرور جديدة", zh: "新密码", ms: "Kata Laluan Baharu", fa: "رمز عبور جدید", hi: "नया पासवर्ड" },
  "m.confirmPassword": { en: "Confirm Password", ar: "تأكيد كلمة المرور", zh: "确认密码", ms: "Sahkan Kata Laluan", fa: "تأیید رمز عبور", hi: "पासवर्ड की पुष्टि" },
  "m.saving": { en: "Saving...", ar: "جاري الحفظ...", zh: "保存中...", ms: "Menyimpan...", fa: "در حال ذخیره...", hi: "सहेजा जा रहा है..." },
  "m.passwordRecovery": { en: "Password Recovery", ar: "استعادة كلمة المرور", zh: "密码恢复", ms: "Pemulihan Kata Laluan", fa: "بازیابی رمز عبور", hi: "पासवर्ड पुनर्प्राप्ति" },
  "m.send": { en: "Send", ar: "إرسال", zh: "发送", ms: "Hantar", fa: "ارسال", hi: "भेजें" },
  "m.createNewBackup": { en: "Create New Backup", ar: "إنشاء نسخة احتياطية", zh: "创建新备份", ms: "Cipta Sandaran Baharu", fa: "ایجاد پشتیبان جدید", hi: "नया बैकअप बनाएं" },
  "m.availableBackups": { en: "Available Backups", ar: "النسخ الاحتياطية المتاحة", zh: "可用备份", ms: "Sandaran Tersedia", fa: "پشتیبان‌های موجود", hi: "उपलब्ध बैकअप" },
  "m.noBackups": { en: "No backups found on the server.", ar: "لا توجد نسخ احتياطية.", zh: "服务器上无备份。", ms: "Tiada sandaran di pelayan.", fa: "پشتیبانی یافت نشد.", hi: "सर्वर पर कोई बैकअप नहीं।" },
  "m.restoring": { en: "Restoring...", ar: "جاري الاستعادة...", zh: "恢复中...", ms: "Memulihkan...", fa: "در حال بازیابی...", hi: "पुनर्स्थापित..." },
  "m.yes": { en: "Yes", ar: "نعم", zh: "是", ms: "Ya", fa: "بله", hi: "हाँ" },
  "m.no": { en: "No", ar: "لا", zh: "否", ms: "Tidak", fa: "خیر", hi: "नहीं" },
  "m.inventoryTitle": { en: "Inventory & Performance", ar: "المخزون والأداء", zh: "库存与绩效", ms: "Inventori & Prestasi", fa: "موجودی و عملکرد", hi: "इन्वेंटरी और प्रदर्शन" },
  "m.tabOverview": { en: "Overview Analytics", ar: "تحليلات عامة", zh: "概览分析", ms: "Analitik Gambaran", fa: "تحلیل کلی", hi: "अवलोकन विश्लेषण" },
  "m.tabStock": { en: "Raw Stock Levels", ar: "مستويات المخزون الخام", zh: "原材料库存", ms: "Tahap Stok Mentah", fa: "سطح موجودی خام", hi: "कच्चा स्टॉक" },
  "m.tabRecipes": { en: "Menu Recipes Builder", ar: "منشئ وصفات القائمة", zh: "菜单配方", ms: "Pembina Resipi Menu", fa: "سازنده دستور غذا", hi: "मेनू रेसिपी" },
  "m.needHelp": { en: "Need help?", ar: "تحتاج مساعدة؟", zh: "需要帮助？", ms: "Perlukan bantuan?", fa: "کمک می‌خواهید؟", hi: "मदद चाहिए?" },
  "m.helpClickHere": { en: "click here", ar: "انقر هنا", zh: "点击这里", ms: "klik di sini", fa: "اینجا کلیک کنید", hi: "यहाँ क्लिक करें" },
  "m.restaurantTables": { en: "Restaurant Tables", ar: "طاولات المطعم", zh: "餐厅餐桌", ms: "Meja Restoran", fa: "میزهای رستوران", hi: "रेस्तरां टेबल" },
  "m.newTable": { en: "New Table", ar: "طاولة جديدة", zh: "新餐桌", ms: "Meja Baharu", fa: "میز جدید", hi: "नई टेबल" },
  "m.editTable": { en: "Edit Table", ar: "تعديل الطاولة", zh: "编辑餐桌", ms: "Edit Meja", fa: "ویرایش میز", hi: "टेबल संपादित" },
  "m.updateTable": { en: "Update Table", ar: "تحديث الطاولة", zh: "更新餐桌", ms: "Kemas Kini Meja", fa: "به‌روزرسانی میز", hi: "टेबल अपडेट" },
  "m.confirmDeleteTable": { en: "Are you sure you want to delete this table?", ar: "هل تريد حذف هذه الطاولة؟", zh: "确定删除此餐桌？", ms: "Padam meja ini?", fa: "این میز حذف شود؟", hi: "इस टेबल को हटाएं?" },
  "m.grandArchive": { en: "Grand Archive", ar: "الأرشيف الكبير", zh: "总档案", ms: "Arkib Utama", fa: "آرشیو بزرگ", hi: "महा संग्रह" },
  "m.grandArchiveDesc": { en: "The immutable history of DragonFly Garden.", ar: "السجل الثابت لحديقة اليعسوب.", zh: "蜻蜓花园的不可变历史记录。", ms: "Sejarah tetap DragonFly Garden.", fa: "تاریخ تغییرناپذیر باغ سنجاق.", hi: "ड्रैगनफ्लाई गार्डन का इतिहास।" },
  "m.exportExcel": { en: "Export to Excel", ar: "تصدير إلى Excel", zh: "导出到 Excel", ms: "Eksport ke Excel", fa: "خروجی به Excel", hi: "Excel में निर्यात" },
  "m.unearthingArchives": { en: "Unearthing the archives...", ar: "جاري استخراج الأرشيف...", zh: "正在加载档案...", ms: "Memuatkan arkib...", fa: "در حال بارگذاری آرشیو...", hi: "संग्रह लोड हो रहा है..." },
  "m.last7Days": { en: "Last 7 Days", ar: "آخر 7 أيام", zh: "最近7天", ms: "7 Hari Lepas", fa: "۷ روز گذشته", hi: "पिछले 7 दिन" },
  "m.last30Days": { en: "Last 30 Days", ar: "آخر 30 يوماً", zh: "最近30天", ms: "30 Hari Lepas", fa: "۳۰ روز گذشته", hi: "पिछले 30 दिन" },
  "m.allCategories": { en: "All Categories", ar: "جميع الفئات", zh: "所有类别", ms: "Semua Kategori", fa: "همه دسته‌ها", hi: "सभी श्रेणियाँ" },
  "m.financeDesc": { en: "Comprehensive profit & loss visualization engine.", ar: "محرك تصور الأرباح والخسائر.", zh: "全面的损益可视化引擎。", ms: "Enjin visualisasi untung rugi.", fa: "موتور تجسم سود و زیان.", hi: "लाभ-हानि विज़ुअलाइज़ेशन।" },
  "m.grossIncome": { en: "Gross Income", ar: "إجمالي الدخل", zh: "总收入", ms: "Pendapatan Kasar", fa: "درآمد ناخالص", hi: "सकल आय" },
  "m.cogs": { en: "Cost of Goods (COGS)", ar: "تكلفة البضائع", zh: "销售成本", ms: "Kos Barangan", fa: "بهای تمام‌شده", hi: "माल की लागत" },
  "m.averageMargin": { en: "Average Margin", ar: "متوسط الهامش", zh: "平均利润率", ms: "Margin Purata", fa: "حاشیه میانگین", hi: "औसत मार्जिन" },
  "m.revenueTimeline": { en: "Revenue Timeline", ar: "جدول الإيرادات", zh: "收入时间线", ms: "Garis Masa Hasil", fa: "خط زمانی درآمد", hi: "राजस्व समयरेखा" },
  "m.topProfitDrivers": { en: "Top Profit Drivers", ar: "أعلى مصادر الربح", zh: "利润最高项", ms: "Pemandu Keuntungan Teratas", fa: "برترین سودآورها", hi: "शीर्ष लाभ चालक" },
  "m.showTop": { en: "Show Top", ar: "عرض الأعلى", zh: "显示前", ms: "Tunjuk Teratas", fa: "نمایش برتر", hi: "शीर्ष दिखाएं" },
  "m.all": { en: "All", ar: "الكل", zh: "全部", ms: "Semua", fa: "همه", hi: "सभी" },
  "common.yes": { en: "Yes", ar: "نعم", zh: "是", ms: "Ya", fa: "بله", hi: "हाँ" },
  "common.no": { en: "No", ar: "لا", zh: "否", ms: "Tidak", fa: "خیر", hi: "नहीं" },
};

const localeMap = { en: "en.ts", ar: "ar.ts", zh: "zh.ts", ms: "ms.ts", fa: "fa.ts", hi: "hi.ts" };
const localesDir = path.join(process.cwd(), "src/locales");

for (const [lang, file] of Object.entries(localeMap)) {
  const filePath = path.join(localesDir, file);
  let content = fs.readFileSync(filePath, "utf8");
  let added = 0;
  for (const [key, translations] of Object.entries(KEYS)) {
    if (content.includes(`"${key}":`)) continue;
    const val = translations[lang].replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    content = content.replace(/\n  \}\n\};\s*$/, `\n    "${key}": "${val}",\n  }\n};\n`);
    added++;
  }
  fs.writeFileSync(filePath, content);
  console.log(`${file}: added ${added} keys`);
}
