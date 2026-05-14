/*
 * api.ts — Centralised HTTP client for all backend requests.
 *
 * Every API call in the application goes through this file. I wrote it this
 * way for two reasons:
 *   1. It keeps the base URL in one place. Changing VITE_API_BASE in the
 *      environment is enough to point the whole app at a different server.
 *   2. All role-authenticated requests need the qr_code query parameter
 *      appended. The apiUrl helper handles this so individual call sites
 *      do not have to remember to add it.
 *
 * The safeFetch function throws on any non-2xx HTTP status so callers can
 * use try/catch or let errors propagate to the component's error boundary.
 *
 * The generic api object at the bottom (api.get, api.post, etc.) is a
 * convenience wrapper for the management dashboard which makes many one-off
 * requests that do not need the role QR code appended.
 */

import type { MenuItem, Order } from "./menu-data";

/*
 * API_BASE is the root URL of the backend server. During development this
 * defaults to http://localhost:5000, matching the Express dev server port.
 * In production on the Raspberry Pi it is set to the device's LAN address.
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

/*
 * apiUrl builds the full request URL. When a qrCode is provided it appends
 * ?qr_code=... so the backend's role detection middleware can identify the
 * caller's role. It handles both URLs that already have query parameters
 * (uses & separator) and clean URLs (uses ? separator).
 */
const apiUrl = (path: string, qrCode?: string) => {
  const base = `${API_BASE}${path}`;
  if (!qrCode) return base;
  const sep = path.includes("?") ? "&" : "?";
  return `${base}${sep}qr_code=${encodeURIComponent(qrCode)}`;
};

/*
 * safeFetch wraps the native fetch API with error handling and JSON parsing.
 * Any non-2xx response throws an Error with the HTTP status code and text,
 * so calling code can display or log the failure without inspecting the raw
 * Response object.
 */
const safeFetch = async <T>(path: string, init?: RequestInit, qr?: string): Promise<T> => {
  const url = apiUrl(path, qr);
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
};

// ── Type definitions ──────────────────────────────────────────────────────────

type PaymentMethod = { id: number; name: string };

/*
 * PaymentOrder extends the base Order type with payment-specific fields:
 * VAT rate, service charge, payment status, totals, and the payments array.
 */
export type PaymentOrder = Order & {
  table_id: number;
  vat_rate: number;
  service_charge_rate: number;
  payment_status: "unpaid" | "partially_paid" | "paid";
  total_with_vat: number;
  total_paid: number;
  remaining: number;
  created_at: string;
  payments?: Array<{
    id: number;
    amount_paid: number;
    payment_date: string;
    employee_id?: string;
    employee_name?: string;
    payment_method: string;
  }>;
};

type PaymentPayload = {
  payment_method_id: number;
  amount_paid: number;
  employee_id?: string;
  employee_name?: string;
};

type VatPayload = {
  vat_rate: number;
  employee_id: string;
  employee_name: string;
};

type AddOrderItemPayload = {
  menu_item_id: number;
  quantity: number;
  employee_id?: string;
  employee_name?: string;
};

type ApiBody = Record<string, unknown> | unknown[] | null;

export type ManagementSettings = {
  work_hours?: {
    start: string;
    end: string;
  };
  [key: string]: unknown;
};

export type EmployeeRecord = {
  id: number;
  employee_id: string;
  name: string;
  department?: string;
  salary?: number;
  bonuses?: number;
  shift_start?: string;
  shift_end?: string;
  employment_type?: string;
  contact_info?: string;
  hire_date?: string;
  is_archived?: number;
};

export type EmployeePayload = {
  name?: string;
  department?: string;
  salary?: number;
  bonuses?: number;
  shift_start?: string;
  shift_end?: string;
  employment_type?: string;
  contact_info?: string;
  is_archived?: number;
};

export type InventoryItem = {
  id: number;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  max_stock: number;
  low_stock_threshold_percent: number;
};

export type InventoryPayload = {
  name?: string;
  category?: string;
  unit?: string;
  current_stock?: number;
  max_stock?: number;
  low_stock_threshold_percent?: number;
};

export type RecipeIngredient = {
  inventory_item_id: number | string;
  quantity_required: number | string;
};

export type Recipe = {
  id: number;
  ingredients?: RecipeIngredient[];
};

export type LogEntry = {
  id: number;
  timestamp: string;
  category: string;
  action: string;
  actor_name?: string;
  target_name?: string;
  target_id?: number | string;
  details?: string;
};

export type TableRecord = {
  id: number;
  table_number: string;
  qr_code: string;
};

export type TablePayload = {
  table_number: string;
  qr_code: string;
};

export type ManagerProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

// ── Menu ─────────────────────────────────────────────────────────────────────

/* fetchMenu returns all available menu items. No role required. */
export const fetchMenu = async (): Promise<MenuItem[]> => {
  return await safeFetch<MenuItem[]>("/menu");
};

/*
 * fetchTable looks up a table by QR code. If the server returns nothing
 * (unlikely in normal operation), it falls back to parsing the table number
 * from the QR code string directly so the UI always has a table reference.
 */
export const fetchTable = async (qr: string) => {
  const data = await safeFetch<{ id: number; table_number: string }>(`/tables/qr/${encodeURIComponent(qr)}`);
  if (data) return data;
  const m = qr.match(/table-(\d+)/i);
  return { id: m ? Number(m[1]) : 1, table_number: m ? `Table ${m[1]}` : "Table 1" };
};

// ── Kitchen ───────────────────────────────────────────────────────────────────

/* fetchKitchenOrders returns all active orders for the kitchen board. */
export const fetchKitchenOrders = async (qr: string): Promise<Order[]> => {
  return await safeFetch<Order[]>("/orders/kitchen", undefined, qr);
};

// ── Payment counter ───────────────────────────────────────────────────────────

export const fetchUnpaidOrders = async (qr: string): Promise<PaymentOrder[]> => {
  const data = await safeFetch<PaymentOrder[]>("/payments/unpaid", undefined, qr);
  return data || [];
};

export const fetchPaidOrders = async (qr: string): Promise<PaymentOrder[]> => {
  const data = await safeFetch<PaymentOrder[]>("/payments/paid", undefined, qr);
  return data || [];
};

export const fetchPaymentMethods = async (qr: string): Promise<PaymentMethod[]> => {
  const data = await safeFetch<PaymentMethod[]>("/payments/methods", undefined, qr);
  return data || [];
};

export const processPayment = async (qr: string, orderId: number, paymentData: PaymentPayload): Promise<PaymentOrder | null> => {
  return await safeFetch("/payments/" + orderId + "/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paymentData),
  }, qr);
};

export const updateVAT = async (qr: string, orderId: number, vatData: VatPayload): Promise<PaymentOrder | null> => {
  return await safeFetch("/payments/" + orderId + "/vat", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vatData),
  }, qr);
};

export const archivePaidOrders = async (qr: string): Promise<{ archived_count: number } | null> => {
  return await safeFetch("/payments/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }, qr);
};

export const printFinalBill = async (qr: string, orderId: number, cashierName: string): Promise<PaymentOrder | null> => {
  return await safeFetch(`/orders/${orderId}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cashierName }),
  }, qr);
};

// ── Customer orders ───────────────────────────────────────────────────────────

export const placeOrder = async (
  qr: string,
  body: { table_id: number; items: { menu_item_id: number; quantity: number; notes?: string }[] }
): Promise<Order> => {
  return await safeFetch<Order>("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, qr);
};

export const refreshOrder = async (qr: string, id: number) =>
  safeFetch<Order>(`/orders/${id}`, undefined, qr);

export const fetchActiveOrdersForTable = async (tableId: number, qr: string): Promise<Order[]> =>
  safeFetch<Order[]>(`/orders/by-table/${tableId}`, undefined, qr);

export const updateItemStatus = async (qr: string, orderId: number, itemId: number, status: string): Promise<Order> =>
  safeFetch<Order>(`/orders/${orderId}/items/${itemId}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
  }, qr);

export const customerArchiveOrder = async (qr: string, orderId: number): Promise<Order> =>
  safeFetch<Order>(`/orders/${orderId}/customer-archive`, { method: "PATCH" }, qr);

export const fetchCustomerArchivedOrders = async (tableId: number, qr: string): Promise<Order[]> =>
  safeFetch<Order[]>(`/orders/customer-archived/${tableId}`, undefined, qr);

export const kitchenArchiveOrder = async (qr: string, orderId: number): Promise<Order> =>
  safeFetch<Order>(`/orders/${orderId}/kitchen-archive`, { method: "PATCH" }, qr);

export const fetchKitchenArchivedOrders = async (qr: string): Promise<Order[]> =>
  safeFetch<Order[]>(`/orders/kitchen-archived`, undefined, qr);

export const updateOrderStatus = async (qr: string, id: number, status: string) => {
  const data = await safeFetch<Order>(`/orders/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }, qr);
  return data && "id" in data ? data : null;
};

export const fetchMenuItems = async (qr: string): Promise<MenuItem[]> => {
  const data = await safeFetch<MenuItem[]>("/menu", undefined, qr);
  return data || [];
};

export const addOrderItem = async (
  qr: string,
  orderId: number,
  body: AddOrderItemPayload
): Promise<PaymentOrder | null> => {
  return await safeFetch(`/payments/${orderId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, qr);
};

// ── Generic API wrapper (used by the management dashboard) ────────────────────

/*
 * The api object provides a clean interface for the management dashboard's
 * many one-off fetch calls that do not need the role QR code appended.
 */
export const api = {
  get: (path: string) => safeFetch(path),
  post: (path: string, body?: ApiBody) => safeFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }),
  patch: (path: string, body?: ApiBody) => safeFetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }),
  put: (path: string, body?: ApiBody) => safeFetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }),
  delete: (path: string) => safeFetch(path, { method: "DELETE" })
};

// ── Management API ────────────────────────────────────────────────────────────

export const fetchSettings = async () => safeFetch<ManagementSettings>("/management/settings");
export const updateSetting = async (key: string, value: unknown) =>
  safeFetch<ManagementSettings>(`/management/settings/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value })
  });

export const fetchEmployees = async (includeArchived = false) =>
  safeFetch<EmployeeRecord[]>(`/management/employees?include_archived=${includeArchived}`);
export const createEmployee = async (data: EmployeePayload) =>
  safeFetch<EmployeeRecord>("/management/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
export const updateEmployee = async (id: number, data: EmployeePayload) =>
  safeFetch<EmployeeRecord>(`/management/employees/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

export const fetchInventory = async () => safeFetch<InventoryItem[]>("/management/inventory");
export const createInventoryItem = async (data: InventoryPayload) =>
  safeFetch<InventoryItem>("/management/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
export const updateInventoryStock = async (id: number, data: InventoryPayload) =>
  safeFetch<InventoryItem>(`/management/inventory/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

export const fetchRecipes = async () => safeFetch<Recipe[]>("/management/recipes");
export const updateRecipe = async (menuItemId: number, ingredients: RecipeIngredient[]) =>
  safeFetch<Recipe>(`/management/recipes/${menuItemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients })
  });

export const fetchLogs = async (category?: string) => {
  const query = category ? `?category=${category}` : "";
  return safeFetch<LogEntry[]>(`/management/logs${query}`);
};

export const fetchTables = async () => safeFetch<TableRecord[]>("/tables");
export const createTable = async (data: TablePayload) =>
  safeFetch<TableRecord>("/tables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
export const updateTable = async (id: number, data: TablePayload) =>
  safeFetch<TableRecord>(`/tables/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
export const deleteTable = async (id: number) =>
  safeFetch<{ success?: boolean }>(`/tables/${id}`, { method: "DELETE" });

// ── Manager auth & profile ────────────────────────────────────────────────────

export const managerAuth = async (id: string, password: string): Promise<{ success: boolean; name?: string; message?: string }> => {
  const res = await fetch(`${API_BASE}/management/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, password }),
  });
  return res.json();
};

export const fetchManagerProfile = async (): Promise<{ id: string; name: string; email: string; phone: string }> =>
  safeFetch("/management/manager-profile");

export const updateManagerProfile = async (data: {
  name?: string; id?: string; password?: string; email?: string; phone?: string;
}): Promise<{ success: boolean; profile: ManagerProfile }> =>
  safeFetch("/management/manager-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const sendPasswordResetEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(`${API_BASE}/management/send-reset-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return res.json();
};

export const fetchKitchenPasscode = async (): Promise<string> => {
  const data = await safeFetch<{ passcode: string }>("/management/kitchen-passcode");
  return data.passcode;
};
