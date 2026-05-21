const fs = require('fs');
const path = 'src/components/garden/ManagementView.tsx';
let code = fs.readFileSync(path, 'utf8');

const replacements = {
  ">Manager Access<": ">{t(\"manager.loginTitle\")}<",
  ">Authorized personnel only.<": ">{t(\"manager.authOnly\")}<",
  ">Manager ID<": ">{t(\"manager.id\")}<",
  ">Password<": ">{t(\"manager.password\")}<",
  ">Forgot your password?<": ">{t(\"manager.forgot\")}<",
  ">Enter your registered email and we will send your credentials.<": ">{t(\"manager.enterEmail\")}<",
  "placeholder=\"Your registered email...\"": "placeholder={t(\"manager.enterEmail\")}",
  ">← Back to login<": ">{t(\"manager.backToLogin\")}<",
  ">Verifying...<": ">{t(\"manager.verifying\")}<",
  ">Access Dashboard<": ">{t(\"manager.accessDash\")}<",
  ": \"Access Dashboard\"}": ": t(\"manager.accessDash\")}",
  ">Management Dashboard<": ">{t(\"manager.title\")}<",
  ">Dragonfly Garden Restaurant Administration<": ">{t(\"manager.subtitle\")}<",
  ">User:<": ">{t(\"manager.user\")}<",
  ">Notifications<": ">{t(\"manager.notifications\")}<",
  ">You're all caught up!<": ">{t(\"manager.caughtUp\")}<",
  ">Logout<": ">{t(\"manager.logout\")}<",
  " Logout\n": " {t(\"manager.logout\")}\n",
  ">Settings<": ">{t(\"manager.settings\")}<",
  ">Working hours and system configuration<": ">{t(\"manager.settingsDesc\")}<",
  ">Employees<": ">{t(\"manager.employees\")}<",
  ">Staff directory, shifts, and salaries<": ">{t(\"manager.employeesDesc\")}<",
  ">Inventory<": ">{t(\"manager.inventory\")}<",
  ">Raw materials, stock levels, and recipes<": ">{t(\"manager.inventoryDesc\")}<",
  ">Tables<": ">{t(\"manager.tables\")}<",
  ">Manage table numbers and QR codes<": ">{t(\"manager.tablesDesc\")}<",
  ">Grand Archive<": ">{t(\"manager.logs\")}<",
  ">Audit logs, activity history, and reports<": ">{t(\"manager.logsDesc\")}<",
  ">Menu<": ">{t(\"manager.menu\")}<",
  ">Dishes, prices, and manual promotions<": ">{t(\"manager.menuDesc\")}<",
  ">Finance<": ">{t(\"manager.finance\")}<",
  ">Profit & Loss analysis and performance metrics<": ">{t(\"manager.financeDesc\")}<"
};

for (const [search, replace] of Object.entries(replacements)) {
  code = code.split(search).join(replace);
}

if (!code.includes('useTranslation')) {
  code = code.replace('import { useState, useEffect } from "react";', 'import { useState, useEffect } from "react";\nimport { useTranslation } from "react-i18next";');
  code = code.replace('export const ManagementView = ({ notify }: Props) => {', 'export const ManagementView = ({ notify }: Props) => {\n  const { t } = useTranslation();');
}

fs.writeFileSync(path, code);
console.log("ManagementView replaced!");
