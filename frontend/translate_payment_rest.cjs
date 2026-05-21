const fs = require('fs');

const enKeys = {
  "payment.enterShiftCash": "Enter Shift Cash",
  "payment.finalCash": "Final cash in drawer for",
  "payment.cashAmount": "Cash Amount (RM)",
  "payment.confirmEndShift": "Confirm End Shift"
};
const zhKeys = {
  "payment.enterShiftCash": "输入交班现金",
  "payment.finalCash": "收银台最终现金",
  "payment.cashAmount": "现金金额 (RM)",
  "payment.confirmEndShift": "确认结束班次"
};
const msKeys = {
  "payment.enterShiftCash": "Masukkan Tunai Syif",
  "payment.finalCash": "Tunai akhir dalam laci untuk",
  "payment.cashAmount": "Jumlah Tunai (RM)",
  "payment.confirmEndShift": "Sahkan Tamat Syif"
};
const arKeys = {
  "payment.enterShiftCash": "إدخال نقدية المناوبة",
  "payment.finalCash": "النقد النهائي في الدرج لـ",
  "payment.cashAmount": "المبلغ النقدي (RM)",
  "payment.confirmEndShift": "تأكيد إنهاء المناوبة"
};
const faKeys = {
  "payment.enterShiftCash": "وارد کردن پول نقد شیفت",
  "payment.finalCash": "پول نقد نهایی در کشو برای",
  "payment.cashAmount": "مبلغ نقدی (RM)",
  "payment.confirmEndShift": "تایید پایان شیفت"
};
const hiKeys = {
  "payment.enterShiftCash": "शिफ्ट कैश दर्ज करें",
  "payment.finalCash": "दराज में अंतिम नकद",
  "payment.cashAmount": "नकद राशि (RM)",
  "payment.confirmEndShift": "शिफ्ट समाप्त होने की पुष्टि करें"
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

// Replace in PaymentCounterView
const path = 'src/components/garden/PaymentCounterView.tsx';
let code = fs.readFileSync(path, 'utf8');

const replacements = {
  ">Payment Counter Login<": ">{t(\"payment.loginTitle\")}<",
  ">Enter your employee credentials to start your shift.<": ">{t(\"payment.loginSub\")}<",
  ">Employee ID<": ">{t(\"payment.empId\")}<",
  ">Employee Name<": ">{t(\"payment.empName\")}<",
  ">Login<": ">{t(\"payment.loginBtn\")}<",
  ">Payment Method<": ">{t(\"payment.method\")}<",
  ">Split Bill Calculator<": ">{t(\"payment.splitBill\")}<",
  ">Select items to pay for separately:<": ">{t(\"payment.selectItemsToPay\")}<",
  ">Tendered Amount (RM)<": ">{t(\"payment.tendered\")}<",
  "Add Item\n": "{t(\"payment.addItem\")}\n",
  ">Add Item<": ">{t(\"payment.addItem\")}<",
  ">Add Last-Minute Item<": ">{t(\"payment.addLastMinute\")}<",
  ">Append an item to the order before final payment.<": ">{t(\"payment.appendItem\")}<",
  ">Menu Item<": ">{t(\"payment.menuItem\")}<",
  ">Quantity<": ">{t(\"payment.quantity\")}<",
  ">Add to Order<": ">{t(\"payment.addToOrderBtn\")}<",
  ">Enter Shift Cash<": ">{t(\"payment.enterShiftCash\")}<",
  ">Final cash in drawer for<": ">{t(\"payment.finalCash\")}<",
  ">Cash Amount (RM)<": ">{t(\"payment.cashAmount\")}<",
  ">Confirm End Shift<": ">{t(\"payment.confirmEndShift\")}<"
};

for (const [search, replace] of Object.entries(replacements)) {
  code = code.split(search).join(replace);
}

fs.writeFileSync(path, code);
console.log("PaymentCounterView partially replaced!");
