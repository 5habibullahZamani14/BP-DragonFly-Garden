const fs = require('fs');
const path = 'src/components/garden/PosOrderModal.tsx';
let code = fs.readFileSync(path, 'utf8');

const replacements = {
  ">Customer Details<": ">{t(\"pos.customerDetails\")}<",
  ">Name *<": ">{t(\"pos.name\")}<",
  "placeholder=\"e.g. John Doe\"": "placeholder={t(\"pos.name\")}",
  ">Phone *<": ">{t(\"pos.phone\")}<",
  "placeholder=\"e.g. 012-3456789\"": "placeholder={t(\"pos.phone\")}",
  ">Collection Time *<": ">{t(\"pos.collectionTime\")}<",
  ">Delivery Address *<": ">{t(\"pos.deliveryAddress\")}<",
  "placeholder=\"Full address...\"": "placeholder={t(\"pos.deliveryAddress\")}",
  ">Menu<": ">{t(\"pos.menu\")}<",
  ">Current Order<": ">{t(\"pos.currentOrder\")}<",
  ">Your cart is empty<": ">{t(\"pos.emptyCart\")}<",
  ">Subtotal<": ">{t(\"customer.subtotal\")}<",
  ">Payable Total<": ">{t(\"pos.payableTotal\")}<",
  ">(est. w/ tax)<": ">{t(\"pos.estTax\")}<"
};

for (const [search, replace] of Object.entries(replacements)) {
  code = code.split(search).join(replace);
}

if (!code.includes('useTranslation')) {
  code = code.replace('import { useState, useMemo, useEffect } from "react";', 'import { useState, useMemo, useEffect } from "react";\nimport { useTranslation } from "react-i18next";');
  code = code.replace('export function PosOrderModal({ isOpen, onClose, initialType = "TAKEAWAY" }: Props) {', 'export function PosOrderModal({ isOpen, onClose, initialType = "TAKEAWAY" }: Props) {\n  const { t } = useTranslation();');
}

fs.writeFileSync(path, code);
console.log("PosOrderModal replaced!");
