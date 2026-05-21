const fs = require('fs');

const enKeys = {
  "payment.invalidLogin": "Invalid Employee ID or Name",
  "payment.failedVerify": "Failed to verify employee",
  "payment.systemLocked": "System locked. Current time is outside working hours.",
  "payment.failedLoad": "Failed to load payment data",
  "payment.tableHelp": "Table requested assistance!",
  "payment.fillDetails": "Please fill all payment details",
  "payment.paymentSuccess": "Payment successful! Final receipt printing.",
  "payment.printerFailed": "Payment successful but printer failed!",
  "payment.partialPayment": "Partial payment recorded.",
  "payment.failedProcess": "Failed to process payment",
  "payment.selectItem": "Please select an item and quantity",
  "payment.failedAddItem": "Failed to add item",
  "customer.failedLoadMenu": "Failed to load menu. Please refresh.",
  "customer.failedSendOrder": "Network issue — order failed to send.",
  "customer.staffNotified": "Staff has been notified. We will be with you shortly.",
  "customer.failedNotifyStaff": "Failed to notify staff. Please try again."
};

const zhKeys = {
  "payment.invalidLogin": "员工 ID 或姓名无效",
  "payment.failedVerify": "验证员工失败",
  "payment.systemLocked": "系统锁定。当前时间不在工作时间内。",
  "payment.failedLoad": "加载支付数据失败",
  "payment.tableHelp": "桌子请求协助！",
  "payment.fillDetails": "请填写所有支付详情",
  "payment.paymentSuccess": "支付成功！正在打印最终收据。",
  "payment.printerFailed": "支付成功但打印机故障！",
  "payment.partialPayment": "部分支付已记录。",
  "payment.failedProcess": "处理支付失败",
  "payment.selectItem": "请选择商品和数量",
  "payment.failedAddItem": "添加商品失败",
  "customer.failedLoadMenu": "加载菜单失败。请刷新。",
  "customer.failedSendOrder": "网络问题 — 订单发送失败。",
  "customer.staffNotified": "已通知工作人员。我们将尽快为您服务。",
  "customer.failedNotifyStaff": "通知工作人员失败。请重试。"
};

const msKeys = {
  "payment.invalidLogin": "ID Pekerja atau Nama tidak sah",
  "payment.failedVerify": "Gagal mengesahkan pekerja",
  "payment.systemLocked": "Sistem dikunci. Masa kini berada di luar waktu bekerja.",
  "payment.failedLoad": "Gagal memuatkan data pembayaran",
  "payment.tableHelp": "Meja meminta bantuan!",
  "payment.fillDetails": "Sila isikan semua butiran pembayaran",
  "payment.paymentSuccess": "Pembayaran berjaya! Pencetakan resit akhir.",
  "payment.printerFailed": "Pembayaran berjaya tetapi pencetak gagal!",
  "payment.partialPayment": "Pembayaran sebahagian direkodkan.",
  "payment.failedProcess": "Gagal memproses pembayaran",
  "payment.selectItem": "Sila pilih item dan kuantiti",
  "payment.failedAddItem": "Gagal menambah item",
  "customer.failedLoadMenu": "Gagal memuatkan menu. Sila muat semula.",
  "customer.failedSendOrder": "Isu rangkaian — pesanan gagal dihantar.",
  "customer.staffNotified": "Kakitangan telah dimaklumkan. Kami akan segera datang kepada anda.",
  "customer.failedNotifyStaff": "Gagal memaklumkan kakitangan. Sila cuba lagi."
};

const arKeys = {
  "payment.invalidLogin": "رقم الموظف أو الاسم غير صالح",
  "payment.failedVerify": "فشل التحقق من الموظف",
  "payment.systemLocked": "النظام مقفل. الوقت الحالي خارج ساعات العمل.",
  "payment.failedLoad": "فشل تحميل بيانات الدفع",
  "payment.tableHelp": "طاولة تطلب المساعدة!",
  "payment.fillDetails": "الرجاء ملء جميع تفاصيل الدفع",
  "payment.paymentSuccess": "تم الدفع بنجاح! جاري طباعة الإيصال النهائي.",
  "payment.printerFailed": "تم الدفع بنجاح ولكن الطابعة تعطلت!",
  "payment.partialPayment": "تم تسجيل دفعة جزئية.",
  "payment.failedProcess": "فشل معالجة الدفع",
  "payment.selectItem": "الرجاء تحديد عنصر وكمية",
  "payment.failedAddItem": "فشل إضافة العنصر",
  "customer.failedLoadMenu": "فشل تحميل القائمة. الرجاء التحديث.",
  "customer.failedSendOrder": "مشكلة في الشبكة — فشل إرسال الطلب.",
  "customer.staffNotified": "تم إخطار الموظفين. سنكون معك قريباً.",
  "customer.failedNotifyStaff": "فشل إخطار الموظفين. يرجى المحاولة مرة أخرى."
};

const faKeys = {
  "payment.invalidLogin": "شناسه یا نام کارمند نامعتبر است",
  "payment.failedVerify": "تأیید کارمند انجام نشد",
  "payment.systemLocked": "سیستم قفل شده است. زمان فعلی خارج از ساعات کاری است.",
  "payment.failedLoad": "بارگیری داده‌های پرداخت انجام نشد",
  "payment.tableHelp": "میز درخواست کمک کرد!",
  "payment.fillDetails": "لطفاً تمام جزئیات پرداخت را پر کنید",
  "payment.paymentSuccess": "پرداخت با موفقیت انجام شد! چاپ رسید نهایی.",
  "payment.printerFailed": "پرداخت موفقیت آمیز بود اما چاپگر خراب شد!",
  "payment.partialPayment": "پرداخت جزئی ثبت شد.",
  "payment.failedProcess": "پردازش پرداخت انجام نشد",
  "payment.selectItem": "لطفاً یک مورد و تعداد آن را انتخاب کنید",
  "payment.failedAddItem": "افزودن مورد انجام نشد",
  "customer.failedLoadMenu": "بارگیری منو انجام نشد. لطفاً صفحه را تازه‌سازی کنید.",
  "customer.failedSendOrder": "مشکل شبکه — ارسال سفارش انجام نشد.",
  "customer.staffNotified": "به پرسنل اطلاع داده شد. به زودی به شما مراجعه می‌کنیم.",
  "customer.failedNotifyStaff": "اطلاع به پرسنل انجام نشد. لطفاً دوباره امتحان کنید."
};

const hiKeys = {
  "payment.invalidLogin": "अमान्य कर्मचारी आईडी या नाम",
  "payment.failedVerify": "कर्मचारी को सत्यापित करने में विफल",
  "payment.systemLocked": "सिस्टम लॉक है। वर्तमान समय काम के घंटों के बाहर है।",
  "payment.failedLoad": "भुगतान डेटा लोड करने में विफल",
  "payment.tableHelp": "टेबल ने सहायता का अनुरोध किया!",
  "payment.fillDetails": "कृपया सभी भुगतान विवरण भरें",
  "payment.paymentSuccess": "भुगतान सफल! अंतिम रसीद छपाई।",
  "payment.printerFailed": "भुगतान सफल लेकिन प्रिंटर विफल रहा!",
  "payment.partialPayment": "आंशिक भुगतान दर्ज किया गया।",
  "payment.failedProcess": "भुगतान संसाधित करने में विफल",
  "payment.selectItem": "कृपया एक आइटम और मात्रा चुनें",
  "payment.failedAddItem": "आइटम जोड़ने में विफल",
  "customer.failedLoadMenu": "मेनू लोड करने में विफल। कृपया रीफ्रेश करें।",
  "customer.failedSendOrder": "नेटवर्क समस्या - आदेश भेजने में विफल रहा।",
  "customer.staffNotified": "कर्मचारियों को सूचित कर दिया गया है। हम जल्द ही आपके साथ होंगे।",
  "customer.failedNotifyStaff": "कर्मचारियों को सूचित करने में विफल। कृपया पुनः प्रयास करें।"
};

function injectKeys(filePath, keys) {
  let content = fs.readFileSync(filePath, 'utf8');
  let newKeysStr = Object.entries(keys).map(([k, v]) => `    "${k}": "${v}"`).join(',\n');
  content = content.replace(/  \}\n\};\n?$/, `,\n${newKeysStr}\n  }\n};\n`);
  fs.writeFileSync(filePath, content);
}

injectKeys('src/locales/en.ts', enKeys);
injectKeys('src/locales/zh.ts', zhKeys);
injectKeys('src/locales/ms.ts', msKeys);
injectKeys('src/locales/ar.ts', arKeys);
injectKeys('src/locales/fa.ts', faKeys);
injectKeys('src/locales/hi.ts', hiKeys);

// Replace in files
let pv = fs.readFileSync('src/components/garden/PaymentCounterView.tsx', 'utf8');
pv = pv.replace(/notify\("error", "Invalid Employee ID or Name"\)/g, 'notify("error", t("payment.invalidLogin"))');
pv = pv.replace(/notify\("error", "Failed to verify employee"\)/g, 'notify("error", t("payment.failedVerify"))');
pv = pv.replace(/notify\("error", `System locked. Current time is outside working hours \(\$\{start\} - \$\{end\}\)`\)/g, 'notify("error", `${t("payment.systemLocked")} (${start} - ${end})`)');
pv = pv.replace(/notify\("error", "Failed to load payment data"\)/g, 'notify("error", t("payment.failedLoad"))');
pv = pv.replace(/notify\("success", `Table \$\{event\.payload\?\.table_id \|\| 'unknown'\} requested assistance!`\)/g, 'notify("success", `Table ${event.payload?.table_id || "unknown"} - ${t("payment.tableHelp")}`)');
pv = pv.replace(/notify\("error", "Please fill all payment details"\)/g, 'notify("error", t("payment.fillDetails"))');
pv = pv.replace(/notify\("success", "Payment successful! Final receipt printing."\)/g, 'notify("success", t("payment.paymentSuccess"))');
pv = pv.replace(/notify\("error", "Payment successful but printer failed!"\)/g, 'notify("error", t("payment.printerFailed"))');
pv = pv.replace(/notify\("success", "Partial payment recorded."\)/g, 'notify("success", t("payment.partialPayment"))');
pv = pv.replace(/notify\("error", getErrorMessage\(error, "Failed to process payment"\)\)/g, 'notify("error", getErrorMessage(error, t("payment.failedProcess")))');
pv = pv.replace(/notify\("error", "Please select an item and quantity"\)/g, 'notify("error", t("payment.selectItem"))');
pv = pv.replace(/notify\("error", getErrorMessage\(error, "Failed to add item"\)\)/g, 'notify("error", getErrorMessage(error, t("payment.failedAddItem")))');
fs.writeFileSync('src/components/garden/PaymentCounterView.tsx', pv);

let cv = fs.readFileSync('src/components/garden/CustomerView.tsx', 'utf8');
cv = cv.replace(/notify\("error", "Failed to load menu. Please refresh."\)/g, 'notify("error", t("customer.failedLoadMenu"))');
cv = cv.replace(/notify\("error", "Network issue — order failed to send."\)/g, 'notify("error", t("customer.failedSendOrder"))');
cv = cv.replace(/notify\('success', 'Staff has been notified. We will be with you shortly.'\)/g, 'notify("success", t("customer.staffNotified"))');
cv = cv.replace(/notify\('error', 'Failed to notify staff. Please try again.'\)/g, 'notify("error", t("customer.failedNotifyStaff"))');
fs.writeFileSync('src/components/garden/CustomerView.tsx', cv);

console.log("Toasts translated!");
