// Thin API wrapper that talks to the existing Express backend.
// Falls back to local mock data so the visual preview is always populated.
import { MOCK_MENU, MOCK_KITCHEN_ORDERS, type MenuItem, type Order } from "./menu-data";

const API_BASE = ((import.meta as any).env?.VITE_API_BASE || "").replace(/\/$/, "");

const apiUrl = (path: string, qrCode?: string) => {
  const base = `${API_BASE}${path}`;
  if (!qrCode) return base;
  const sep = path.includes("?") ? "&" : "?";
  return `${base}${sep}qr_code=${encodeURIComponent(qrCode)}`;
};

const safeFetch = async <T>(path: string, init?: RequestInit, qr?: string): Promise<T | null> => {
  try {
    const res = await fetch(apiUrl(path, qr), init);
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
