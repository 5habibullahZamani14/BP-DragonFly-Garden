import fs from "fs";

const files = [
  "src/components/garden/CustomerView.tsx",
  "src/components/garden/PaymentCounterView.tsx",
  "src/components/garden/PosOrderModal.tsx",
  "src/components/garden/ManagementView.tsx",
  "src/components/garden/management/SettingsTab.tsx",
  "src/components/garden/management/EmployeesTab.tsx",
  "src/components/garden/management/InventoryTab.tsx",
  "src/components/garden/management/TablesTab.tsx",
  "src/components/garden/management/LogsTab.tsx",
  "src/components/garden/management/FinanceTab.tsx",
];

for (const f of files) {
  const c = fs.readFileSync(f, "utf8");
  const hits = new Set();
  const r = /(?:>\s*)([A-Za-z][^<{}]{2,100}?)(?:\s*<)/g;
  let m;
  while ((m = r.exec(c))) {
    const s = m[1].trim();
    if (s && !s.includes("t(") && !s.startsWith("class") && s.length > 2 && !/^[A-Z_]+$/.test(s)) hits.add(s);
  }
  console.log(`\n${f}: ${hits.size}`);
  [...hits].slice(0, 50).forEach((h) => console.log(" -", h));
}
