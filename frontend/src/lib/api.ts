// Thin API wrapper that talks to the existing Express backend.
// Falls back to local mock data so the visual preview is always populated.
import { MOCK_MENU, MOCK_KITCHEN_ORDERS, type MenuItem, type Order } from "./menu-data";

const API_BASE = "http://localhost:3000";

const apiUrl = (path: string, qrCode?: string) => {
  const base = `${API_BASE}${path}`;
  if (!qrCode) return base;
  const sep = path.includes("?") ? "&" : "?";
  return `${base}${sep}qr_code=${encodeURIComponent(qrCode)}`;
};

const safeFetch = async <T>(path: string, init?: RequestInit, qr?: string): Promise<T | null> => {
  const url = apiUrl(path, qr);
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

export const fetchMenu = async (): Promise<MenuItem[]> => {
  const data = await safeFetch<MenuItem[]>("/menu");
  return data && data.length ? data : MOCK_MENU;
};

export const fetchTable = async (qr: string) => {
  const data = await safeFetch<{ id: number; table_number: string }>(`/tables/qr/${encodeURIComponent(qr)}`);
  if (data) return data;
  const m = qr.match(/table-(\d+)/i);
  return { id: m ? Number(m[1]) : 1, table_number: m ? `Table ${m[1]}` : "Table 1" };
};

export const fetchKitchenOrders = async (qr: string): Promise<Order[]> => {
  const data = await safeFetch<Order[]>("/orders/kitchen", undefined, qr);
  return data && data.length ? data : MOCK_KITCHEN_ORDERS;
};

export const fetchUnpaidOrders = async (qr: string): Promise<Order[]> => {
  const data = await safeFetch<Order[]>("/payments/unpaid", undefined, qr);
  return data || [];
};

export const fetchPaidOrders = async (qr: string): Promise<Order[]> => {
  const data = await safeFetch<Order[]>("/payments/paid", undefined, qr);
  return data || [];
};

export const fetchPaymentMethods = async (qr: string): Promise<{id: number, name: string}[]> => {
  const data = await safeFetch<{id: number, name: string}[]>("/payments/methods", undefined, qr);
  return data || [];
};

export const processPayment = async (qr: string, orderId: number, paymentData: {method_id: number, amount: number, employee_id?: string, employee_name?: string}): Promise<any> => {
  return await safeFetch("/payments/" + orderId + "/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paymentData),
  }, qr);
};

export const updateVAT = async (qr: string, orderId: number, vatData: {vat_rate: number, employee_id: string, employee_name: string}): Promise<any> => {
  return await safeFetch("/payments/" + orderId + "/vat", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vatData),
  }, qr);
};

export const archivePaidOrders = async (qr: string): Promise<any> => {
  return await safeFetch("/payments/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }, qr);
};

export const placeOrder = async (
  qr: string,
  body: { table_id: number; items: { menu_item_id: number; quantity: number; notes?: string }[] },
  fallbackTotal: number,
  fallbackTable: string
): Promise<Order> => {
  const data = await safeFetch<{ order: Order }>("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, qr);
  if (data?.order) return data.order;
  // Mock fallback
  return {
    id: Math.floor(1000 + Math.random() * 9000),
    status: "queue",
    table_number: fallbackTable,
    total_price: fallbackTotal,
    items: body.items.map((i, idx) => ({ id: idx, quantity: i.quantity, item_name: `Item ${i.menu_item_id}`, notes: i.notes })),
  };
};

export const refreshOrder = async (qr: string, id: number) =>
  safeFetch<Order>(`/orders/${id}`, undefined, qr);

export const updateOrderStatus = async (qr: string, id: number, status: string) => {
  const data = await safeFetch<{ order: Order }>(`/orders/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }, qr);
  return data?.order ?? null;
};

// Simple API wrapper for general use
export const api = {
  get: (path: string) => safeFetch(path),
  post: (path: string, body?: any) => safeFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }),
  patch: (path: string, body?: any) => safeFetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }),
  delete: (path: string) => safeFetch(path, { method: "DELETE" })
};
