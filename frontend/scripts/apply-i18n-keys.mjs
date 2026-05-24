/**
 * Merges translation keys into all locale .ts files.
 * Run from frontend/: node scripts/apply-i18n-keys.mjs
 */
import fs from "fs";
import path from "path";

const KEYS = {
  "customer.promoFallback": { en: "Promo", ar: "عرض", zh: "促销", ms: "Promo", fa: "پیشنهاد", hi: "प्रोमो" },
  "customer.descriptionFallback": { en: "Fresh from the farm.", ar: "طازج من المزرعة.", zh: "农场新鲜出品。", ms: "Segar dari ladang.", fa: "تازه از مزرعه.", hi: "खेत से ताज़ा।" },
  "customer.ordersActiveCount": { en: "{{count}} active", ar: "{{count}} نشط", zh: "{{count}} 进行中", ms: "{{count}} aktif", fa: "{{count}} فعال", hi: "{{count}} सक्रिय" },
  "customer.archivedHide": { en: "hide ▲", ar: "إخفاء ▲", zh: "隐藏 ▲", ms: "sembunyi ▲", fa: "پنهان ▲", hi: "छिपाएँ ▲" },
  "customer.archivedShow": { en: "show ▼", ar: "عرض ▼", zh: "显示 ▼", ms: "tunjuk ▼", fa: "نمایش ▼", hi: "दिखाएँ ▼" },
  "customer.ticketLabel": { en: "Ticket #{{number}}", ar: "تذكرة #{{number}}", zh: "单号 #{{number}}", ms: "Tiket #{{number}}", fa: "بلیت #{{number}}", hi: "टिकट #{{number}}" },
  "customer.historyItemCount_one": { en: "{{count}} item", ar: "{{count}} عنصر", zh: "{{count}} 项", ms: "{{count}} item", fa: "{{count}} مورد", hi: "{{count}} आइटम" },
  "customer.historyItemCount_other": { en: "{{count}} items", ar: "{{count}} عناصر", zh: "{{count}} 项", ms: "{{count}} item", fa: "{{count}} مورد", hi: "{{count}} आइटम" },
  "customer.priceEach": { en: "each", ar: "لكل", zh: "每项", ms: "setiap", fa: "هر عدد", hi: "प्रति" },
  "customer.oftenBoughtTogether": { en: "Often bought together", ar: "يُشترى معاً غالباً", zh: "经常一起购买", ms: "Selalunya dibeli bersama", fa: "اغلباً با هم خریده می‌شود", hi: "अक्सर साथ खरीदे जाते हैं" },
  "customer.orderSent": { en: "Order sent ✓", ar: "تم إرسال الطلب ✓", zh: "订单已发送 ✓", ms: "Pesanan dihantar ✓", fa: "سفارش ارسال شد ✓", hi: "ऑर्डर भेजा गया ✓" },
  "customer.sending": { en: "Sending...", ar: "جاري الإرسال...", zh: "发送中...", ms: "Menghantar...", fa: "در حال ارسال...", hi: "भेजा जा रहा है..." },
  "customer.sendOrder": { en: "Send order →", ar: "إرسال الطلب →", zh: "发送订单 →", ms: "Hantar pesanan →", fa: "ارسال سفارش →", hi: "ऑर्डर भेजें →" },
  "payment.systemLockedHours": { en: "System locked. Current time is outside working hours ({{start}} - {{end}}).", ar: "النظام مقفل. الوقت الحالي خارج ساعات العمل ({{start}} - {{end}}).", zh: "系统已锁定。当前时间在工作时间之外（{{start}} - {{end}}）。", ms: "Sistem dikunci. Masa semasa di luar waktu operasi ({{start}} - {{end}}).", fa: "سیستم قفل است. زمان فعلی خارج از ساعات کاری است ({{start}} - {{end}}).", hi: "सिस्टम लॉक। वर्तमान समय कार्य समय से बाहर है ({{start}} - {{end}})।" },
  "payment.failedAcknowledge": { en: "Failed to acknowledge assistance request.", ar: "فشل تأكيد طلب المساعدة.", zh: "确认协助请求失败。", ms: "Gagal mengesahkan permintaan bantuan.", fa: "تأیید درخواست کمک ناموفق بود.", hi: "सहायता अनुरोध स्वीकार करने में विफल।" },
  "payment.assistanceRequested": { en: "{{table}} requested assistance", ar: "{{table}} طلب المساعدة", zh: "{{table}} 请求协助", ms: "{{table}} meminta bantuan", fa: "{{table}} درخواست کمک کرد", hi: "{{table}} ने सहायता मांगी" },
  "payment.ariaAcknowledge": { en: "Acknowledge assistance request", ar: "تأكيد طلب المساعدة", zh: "确认协助请求", ms: "Sahkan permintaan bantuan", fa: "تأیید درخواست کمک", hi: "सहायता अनुरोध स्वीकार करें" },
  "payment.staffAssistance": { en: "Staff Assistance", ar: "مساعدة الموظفين", zh: "员工协助", ms: "Bantuan Kakitangan", fa: "کمک پرسنل", hi: "स्टाफ सहायता" },
  "payment.noAssistanceToday": { en: "No assistance requests today.", ar: "لا توجد طلبات مساعدة اليوم.", zh: "今天没有协助请求。", ms: "Tiada permintaan bantuan hari ini.", fa: "امروز درخواست کمکی نیست.", hi: "आज कोई सहायता अनुरोध नहीं।" },
  "payment.acknowledgedAt": { en: "Acknowledged {{time}}", ar: "تم التأكيد {{time}}", zh: "已确认 {{time}}", ms: "Disahkan {{time}}", fa: "تأیید شد {{time}}", hi: "स्वीकृत {{time}}" },
  "payment.selectMethodPlaceholder": { en: "Select method", ar: "اختر الطريقة", zh: "选择方式", ms: "Pilih kaedah", fa: "انتخاب روش", hi: "विधि चुनें" },
  "payment.disableSplit": { en: "Disable Split", ar: "تعطيل التقسيم", zh: "关闭分账", ms: "Lumpuhkan Pecahan", fa: "غیرفعال کردن تقسیم", hi: "विभाजन बंद करें" },
  "payment.enableSplit": { en: "Enable Split", ar: "تفعيل التقسيم", zh: "启用分账", ms: "Dayakan Pecahan", fa: "فعال کردن تقسیم", hi: "विभाजन चालू करें" },
  "payment.changeDue": { en: "Change due: {{amount}}", ar: "الباقي: {{amount}}", zh: "找零：{{amount}}", ms: "Baki: {{amount}}", fa: "باقی‌مانده: {{amount}}", hi: "बाकी: {{amount}}" },
  "payment.processing": { en: "Processing...", ar: "جاري المعالجة...", zh: "处理中...", ms: "Memproses...", fa: "در حال پردازش...", hi: "प्रसंस्करण..." },
  "payment.processPaymentBtn": { en: "Process Payment", ar: "معالجة الدفع", zh: "处理付款", ms: "Proses Bayaran", fa: "پردازش پرداخت", hi: "भुगतान प्रक्रिया" },
  "payment.tenderedPlaceholder": { en: "e.g. 50.00", ar: "مثال 50.00", zh: "例如 50.00", ms: "cth. 50.00", fa: "مثلاً 50.00", hi: "उदा. 50.00" },
  "payment.loginPlaceholderId": { en: "e.g. 111", ar: "مثال 111", zh: "例如 111", ms: "cth. 111", fa: "مثلاً 111", hi: "उदा. 111" },
  "payment.loginPlaceholderName": { en: "e.g. epm1", ar: "مثال epm1", zh: "例如 epm1", ms: "cth. epm1", fa: "مثلاً epm1", hi: "उदा. epm1" },
  "pos.cartEmpty": { en: "Cart is empty!", ar: "السلة فارغة!", zh: "购物车是空的！", ms: "Troli kosong!", fa: "سبد خالی است!", hi: "कार्ट खाली है!" },
  "pos.pickupRequired": { en: "Name, Phone, and Collection Time are required for Pickup", ar: "الاسم والهاتف ووقت الاستلام مطلوبة للاستلام", zh: "自取需要姓名、电话和取餐时间", ms: "Nama, Telefon dan Masa Ambil diperlukan", fa: "نام، تلفن و زمان تحویل برای تحویل حضوری الزامی است", hi: "पिकअप के लिए नाम, फोन और समय आवश्यक हैं" },
  "pos.deliveryRequired": { en: "Name, Phone, and Address are required for Delivery", ar: "الاسم والهاتف والعنوان مطلوبة للتوصيل", zh: "外送需要姓名、电话和地址", ms: "Nama, Telefon dan Alamat diperlukan", fa: "نام، تلفن و آدرس برای تحویل الزامی است", hi: "डिलीवरी के लिए नाम, फोन और पता आवश्यक हैं" },
  "pos.orderCreatedSuccess": { en: "{{orderType}} order created successfully!", ar: "تم إنشاء طلب {{orderType}} بنجاح!", zh: "{{orderType}} 订单创建成功！", ms: "Pesanan {{orderType}} berjaya dicipta!", fa: "سفارش {{orderType}} با موفقیت ایجاد شد!", hi: "{{orderType}} ऑर्डर सफलतापूर्वक बनाया गया!" },
  "pos.orderCreateFailed": { en: "Failed to create order", ar: "فشل إنشاء الطلب", zh: "创建订单失败", ms: "Gagal mencipta pesanan", fa: "ایجاد سفارش ناموفق", hi: "ऑर्डर बनाने में विफल" },
  "pos.newOrderTitle": { en: "New {{orderType}} Order", ar: "طلب {{orderType}} جديد", zh: "新{{orderType}}订单", ms: "Pesanan {{orderType}} Baharu", fa: "سفارش {{orderType}} جدید", hi: "नया {{orderType}} ऑर्डर" },
  "pos.cartItemCount": { en: "{{count}} items", ar: "{{count}} عناصر", zh: "{{count}} 项", ms: "{{count}} item", fa: "{{count}} مورد", hi: "{{count}} आइटम" },
  "pos.checkoutOrder": { en: "Checkout Order", ar: "إتمام الطلب", zh: "结账", ms: "Bayar Pesanan", fa: "تسویه سفارش", hi: "ऑर्डर चेकआउट" },
  "manager.loginPlaceholderId": { en: "e.g. admin", ar: "مثال admin", zh: "例如 admin", ms: "cth. admin", fa: "مثلاً admin", hi: "उदा. admin" },
  "manager.loginPlaceholderPassword": { en: "Enter password...", ar: "أدخل كلمة المرور...", zh: "输入密码...", ms: "Masukkan kata laluan...", fa: "رمز عبور را وارد کنید...", hi: "पासवर्ड दर्ज करें..." },
  "manager.loginErrorBoth": { en: "Please enter both Manager ID and Password.", ar: "يرجى إدخال معرف المدير وكلمة المرور.", zh: "请输入管理员 ID 和密码。", ms: "Sila masukkan ID dan kata laluan Pengurus.", fa: "شناسه مدیر و رمز عبور را وارد کنید.", hi: "कृपया मैनेजर ID और पासवर्ड दर्ज करें।" },
  "manager.loginErrorInvalid": { en: "Invalid Manager ID or Password. Please try again.", ar: "معرف المدير أو كلمة المرور غير صحيحة.", zh: "管理员 ID 或密码无效。", ms: "ID atau kata laluan tidak sah.", fa: "شناسه یا رمز عبور نامعتبر است.", hi: "अमान्य ID या पासवर्ड।" },
  "manager.loginErrorConnection": { en: "Could not connect to the server. Please check your connection.", ar: "تعذر الاتصال بالخادم.", zh: "无法连接服务器。", ms: "Tidak dapat menyambung ke pelayan.", fa: "اتصال به سرور برقرار نشد.", hi: "सर्वर से कनेक्ट नहीं हो सका।" },
  "manager.dashboardTitle": { en: "Management Dashboard", ar: "لوحة إدارة", zh: "管理仪表板", ms: "Papan Pemuka Pengurusan", fa: "داشبورد مدیریت", hi: "प्रबंधन डैशबोर्ड" },
  "manager.userAdmin": { en: "Admin", ar: "مسؤول", zh: "管理员", ms: "Admin", fa: "مدیر", hi: "एडमिन" },
  "manager.lowStockTitle": { en: "Low Stock Alert", ar: "تنبيه مخزون منخفض", zh: "库存不足提醒", ms: "Amaran Stok Rendah", fa: "هشدار موجودی کم", hi: "कम स्टॉक चेतावनी" },
  "manager.lowStockMessage": { en: "{{name}} is running low ({{stock}} {{unit}} remaining).", ar: "{{name}} منخفض ({{stock}} {{unit}} متبقي).", zh: "{{name}} 库存不足（剩余 {{stock}} {{unit}}）。", ms: "{{name}} semakin rendah ({{stock}} {{unit}} lagi).", fa: "{{name}} رو به اتمام است ({{stock}} {{unit}} باقی).", hi: "{{name}} कम है ({{stock}} {{unit}} बचे)।" },
  "manager.emailFailed": { en: "Could not send email. Check the backend email configuration.", ar: "تعذر إرسال البريد. تحقق من إعدادات البريد.", zh: "无法发送邮件。", ms: "E-mel gagal dihantar.", fa: "ایمیل ارسال نشد.", hi: "ईमेल नहीं भेजा जा सका।" },
  "common.processing": { en: "Processing...", ar: "جاري المعالجة...", zh: "处理中...", ms: "Memproses...", fa: "در حال پردازش...", hi: "प्रसंस्करण..." },
  "common.cancel": { en: "Cancel", ar: "إلغاء", zh: "取消", ms: "Batal", fa: "لغو", hi: "रद्द करें" },
  "m.loadingEmployees": { en: "Loading employees...", ar: "جاري تحميل الموظفين...", zh: "正在加载员工...", ms: "Memuatkan pekerja...", fa: "در حال بارگذاری کارکنان...", hi: "कर्मचारी लोड हो रहे हैं..." },
  "m.editEmployee": { en: "Edit Employee", ar: "تعديل موظف", zh: "编辑员工", ms: "Edit Pekerja", fa: "ویرایش کارمند", hi: "कर्मचारी संपादित करें" },
  "m.newEmployee": { en: "New Employee", ar: "موظف جديد", zh: "新员工", ms: "Pekerja Baharu", fa: "کارمند جدید", hi: "नया कर्मचारी" },
  "m.newEmployeeDesc": { en: "Fill in the details below. A unique 4-digit ID will be generated automatically upon saving.", ar: "املأ التفاصيل أدناه. سيتم إنشاء رقم تعريف مكون من 4 أرقام تلقائياً.", zh: "填写以下信息。保存后将自动生成4位ID。", ms: "Isi butiran di bawah. ID 4 digit akan dijana secara automatik.", fa: "جزئیات را پر کنید. شناسه ۴ رقمی خودکار ایجاد می‌شود.", hi: "नीचे विवरण भरें। सहेजने पर 4-अंकीय ID बनेगी।" },
  "m.deptWaiter": { en: "Waiter", ar: "نادل", zh: "服务员", ms: "Pelayan", fa: "گارسون", hi: "वेटर" },
  "m.deptChef": { en: "Chef", ar: "طاهٍ", zh: "厨师", ms: "Chef", fa: "آشپز", hi: "शेफ" },
  "m.deptChefAssistant": { en: "Chef Assistant", ar: "مساعد طاهٍ", zh: "厨师助理", ms: "Pembantu Chef", fa: "کمک آشپز", hi: "शेफ सहायक" },
  "m.deptCashier": { en: "Cashier", ar: "أمين صندوق", zh: "收银员", ms: "Juruwang", fa: "صندوقدار", hi: "कैशियर" },
  "m.deptManager": { en: "Manager", ar: "مدير", zh: "经理", ms: "Pengurus", fa: "مدیر", hi: "प्रबंधक" },
  "m.empTypeFullTime": { en: "Full-Time", ar: "دوام كامل", zh: "全职", ms: "Sepenuh Masa", fa: "تمام‌وقت", hi: "पूर्णकालिक" },
  "m.empTypePartTime": { en: "Part-Time", ar: "دوام جزئي", zh: "兼职", ms: "Separuh Masa", fa: "پاره‌وقت", hi: "अंशकालिक" },
  "m.empTypeContract": { en: "Contract", ar: "عقد", zh: "合同", ms: "Kontrak", fa: "قراردادی", hi: "अनुबंध" },
  "m.contactInfo": { en: "Contact Info (Phone/Email)", ar: "معلومات الاتصال", zh: "联系方式", ms: "Maklumat Hubungan", fa: "اطلاعات تماس", hi: "संपर्क जानकारी" },
  "m.bonuses": { en: "Bonuses (RM)", ar: "مكافآت (RM)", zh: "奖金 (RM)", ms: "Bonus (RM)", fa: "پاداش (RM)", hi: "बोनस (RM)" },
  "m.shiftStart": { en: "Shift Start Time", ar: "بداية الوردية", zh: "班次开始", ms: "Mula Syif", fa: "شروع شیفت", hi: "शिफ्ट शुरू" },
  "m.shiftEnd": { en: "Shift End Time", ar: "نهاية الوردية", zh: "班次结束", ms: "Tamat Syif", fa: "پایان شیفت", hi: "शिफ्ट समाप्त" },
  "m.staffDistDesc": { en: "Number of employees per department", ar: "عدد الموظفين لكل قسم", zh: "各部门员工人数", ms: "Bilangan pekerja setiap jabatan", fa: "تعداد کارکنان هر بخش", hi: "प्रति विभाग कर्मचारी" },
  "m.chartEmployees": { en: "Employees", ar: "الموظفون", zh: "员工", ms: "Pekerja", fa: "کارکنان", hi: "कर्मचारी" },
  "m.payrollDesc": { en: "Total base salary (RM) per department", ar: "إجمالي الراتب الأساسي لكل قسم", zh: "各部门基本工资总额", ms: "Jumlah gaji asas setiap jabatan", fa: "مجموع حقوق پایه هر بخش", hi: "प्रति विभाग कुल वेतन" },
  "m.chartTotalSalary": { en: "Total Salary", ar: "إجمالي الراتب", zh: "工资总额", ms: "Jumlah Gaji", fa: "مجموع حقوق", hi: "कुल वेतन" },
  "m.noEmployees": { en: "No active employees found.", ar: "لا يوجد موظفون نشطون.", zh: "没有在职员工。", ms: "Tiada pekerja aktif.", fa: "کارمند فعالی نیست.", hi: "कोई सक्रिय कर्मचारी नहीं।" },
  "m.departmentHeader": { en: "{{dept}} Department", ar: "قسم {{dept}}", zh: "{{dept}} 部门", ms: "Jabatan {{dept}}", fa: "بخش {{dept}}", hi: "{{dept}} विभाग" },
  "m.membersCount": { en: "{{count}} Members", ar: "{{count}} أعضاء", zh: "{{count}} 人", ms: "{{count}} Ahli", fa: "{{count}} عضو", hi: "{{count}} सदस्य" },
  "m.idLabel": { en: "ID", ar: "المعرف", zh: "ID", ms: "ID", fa: "شناسه", hi: "ID" },
  "m.noContact": { en: "No contact info", ar: "لا توجد معلومات اتصال", zh: "无联系方式", ms: "Tiada maklumat hubungan", fa: "بدون اطلاعات تماس", hi: "कोई संपर्क नहीं" },
  "m.joined": { en: "Joined: {{date}}", ar: "انضم: {{date}}", zh: "加入：{{date}}", ms: "Sertai: {{date}}", fa: "پیوست: {{date}}", hi: "शामिल: {{date}}" },
  "m.confirmArchive": { en: "Are you sure you want to archive this employee?", ar: "هل تريد أرشفة هذا الموظف؟", zh: "确定归档此员工？", ms: "Arkibkan pekerja ini?", fa: "این کارمند بایگانی شود؟", hi: "इस कर्मचारी को संग्रहित करें?" },
  "m.loadingSettings": { en: "Loading settings...", ar: "جاري تحميل الإعدادات...", zh: "正在加载设置...", ms: "Memuatkan tetapan...", fa: "در حال بارگذاری تنظیمات...", hi: "सेटिंग्स लोड हो रही हैं..." },
  "m.loadingTables": { en: "Loading tables...", ar: "جاري تحميل الطاولات...", zh: "正在加载餐桌...", ms: "Memuatkan meja...", fa: "در حال بارگذاری میزها...", hi: "टेबल लोड हो रहे हैं..." },
  "m.loadingInventory": { en: "Loading inventory...", ar: "جاري تحميل المخزون...", zh: "正在加载库存...", ms: "Memuatkan inventori...", fa: "در حال بارگذاری موجودی...", hi: "इन्वेंटरी लोड हो रही है..." },
  "m.calculatingFinance": { en: "Calculating Financial Models...", ar: "جاري حساب النماذج المالية...", zh: "正在计算财务模型...", ms: "Mengira model kewangan...", fa: "در حال محاسبه مدل‌های مالی...", hi: "वित्तीय मॉडल की गणना..." },
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
