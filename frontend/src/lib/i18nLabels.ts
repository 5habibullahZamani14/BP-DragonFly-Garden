import type { TFunction } from "i18next";

export const DEPT_LABEL_KEYS: Record<string, string> = {
  Waiter: "m.deptWaiter",
  Chef: "m.deptChef",
  "Chef Assistant": "m.deptChefAssistant",
  Cashier: "m.deptCashier",
  Manager: "m.deptManager",
  Other: "m.deptOther",
};

export const EMP_TYPE_LABEL_KEYS: Record<string, string> = {
  "Full-Time": "m.empTypeFullTime",
  "Part-Time": "m.empTypePartTime",
  Contract: "m.empTypeContract",
};

export const INV_CATEGORY_LABEL_KEYS: Record<string, string> = {
  Vegetables: "m.catVegetables",
  Meat: "m.catMeat",
  Dairy: "m.catDairy",
  "Dry Goods": "m.catDryGoods",
  Packaging: "m.catPackaging",
};

export function labelForStoredValue(t: TFunction, map: Record<string, string>, value: string) {
  const key = map[value];
  return key ? t(key) : value;
}
