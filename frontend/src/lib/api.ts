import type { MenuItem, Order } from "./menu-data";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

const apiUrl = (path: string, qrCode?: string) => {
  const base = `${API_BASE}${path}`;
  if (!qrCode) return base;
  const sep = path.includes("?") ? "&" : "?";
  return `${base}${sep}qr_code=${encodeURIComponent(qrCode)}`;
};

const safeFetch = async <T>(path: string, init?: RequestInit, qr?: string): Promise<T> => {
  const url = apiUrl(path, qr);
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
};

type PaymentMethod = { id: number; name: string };
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

export const fetchMenu = async (): Promise<MenuItem[]> => {
  return await safeFetch<MenuItem[]>("/menu");
};

export const fetchTable = async (qr: string) => {
  const data = await safeFetch<{ id: number; table_number: string }>(`/tables/qr/${encodeURIComponent(qr)}`);
  if (data) return data;
  const m = qr.match(/table-(\d+)/i);
  return { id: m ? Number(m[1]) : 1, table_number: m ? `Table ${m[1]}` : "Table 1" };
};

export const fetchKitchenOrders = async (qr: string): Promise<Order[]> => {
  return await safeFetch<Order[]>("/orders/kitchen", undefined, qr);
};

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

export const updateOrderStatus = async (qr: string, id: number, status: string) => {
  const data = await safeFetch<Order>(`/orders/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }, qr);
  return data && 'id' in data ? data : null;
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

// Simple API wrapper for general use
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

// =====================================
// MANAGEMENT API
// =====================================
export const fetchSettings = async () => safeFetch<any>("/management/settings");
export const updateSetting = async (key: string, value: any) => 
  safeFetch<any>(`/management/settings/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value })
  });

export const fetchEmployees = async (includeArchived = false) => 
  safeFetch<any[]>(`/management/employees?include_archived=${includeArchived}`);
export const createEmployee = async (data: any) =>
  safeFetch<any>("/management/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
export const updateEmployee = async (id: number, data: any) =>
  safeFetch<any>(`/management/employees/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

export const fetchInventory = async () => safeFetch<any[]>("/management/inventory");
export const createInventoryItem = async (data: any) =>
  safeFetch<any>("/management/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
export const updateInventoryStock = async (id: number, data: any) =>
  safeFetch<any>(`/management/inventory/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

export const fetchRecipes = async () => safeFetch<any[]>("/management/recipes");
export const updateRecipe = async (menuItemId: number, ingredients: any[]) =>
  safeFetch<any>(`/management/recipes/${menuItemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients })
  });

export const fetchLogs = async (category?: string) => {
  const query = category ? `?category=${category}` : "";
  return safeFetch<any[]>(`/management/logs${query}`);
};
export const fetchTables = async () => safeFetch<any[]>("/tables");
export const createTable = async (data: any) => 
  safeFetch<any>("/tables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
export const updateTable = async (id: number, data: any) =>
  safeFetch<any>(`/tables/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
export const deleteTable = async (id: number) =>
  safeFetch<any>(`/tables/${id}`, {
    method: "DELETE"
  });

// =====================================
// MANAGER AUTH & PROFILE
// =====================================
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
}): Promise<{ success: boolean; profile: any }> =>
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
