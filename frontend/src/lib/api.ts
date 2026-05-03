// Thin API wrapper that talks to the existing Express backend.
// Falls back to local mock data so the visual preview is always populated.
import { MOCK_MENU, MOCK_KITCHEN_ORDERS, type MenuItem, type Order } from "./menu-data";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

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

type PaymentMethod = { id: number; name: string };
export type PaymentOrder = Order & {
  table_id: number;
  vat_rate: number;
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
  delete: (path: string) => safeFetch(path, { method: "DELETE" })
};
