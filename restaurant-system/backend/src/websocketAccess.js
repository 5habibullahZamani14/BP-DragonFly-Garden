const PUBLIC_SETTING_KEYS = new Set([
  "work_hours",
  "sst_enabled",
  "sst_rate",
  "service_charge_enabled",
  "service_charge_rate",
]);
const PUBLIC_DATA_EVENTS = new Set(["MENU_UPDATE"]);
const PAYMENT_COUNTER_EVENTS = new Set([
  "NEW_ORDER",
  "NEW_PAYMENT",
  "ORDER_STATUS_CHANGED",
  "ORDER_STATUS_UPDATE",
  "CALL_WAITER",
  "CALL_WAITER_ACK",
  "TABLE_UPDATE",
  ...PUBLIC_DATA_EVENTS,
]);

const isPublicSettingsUpdate = (data) =>
  data?.type === "SETTINGS_UPDATE" && PUBLIC_SETTING_KEYS.has(data.payload?.key);

const clientShouldReceive = (client, data) => {
  if (client.readyState !== 1) return false;
  const type = data && data.type;

  if (client._auth?.role === "manager" || client._role === "manager") return true;

  if (client._role === "customer_waiter") {
    if (type === "DATA_REFRESH") return true;
    if (PUBLIC_DATA_EVENTS.has(type) || isPublicSettingsUpdate(data)) return true;

    const tableId = client._tableNumber ?? client._tableId ?? null;
    const payload = data && data.payload;
    const eventTableId =
      payload?.table_id ??
      payload?.order?.table_id ??
      (type === "TABLE_UPDATE" ? payload?.id : null);

    if (eventTableId != null && tableId != null && Number(eventTableId) === Number(tableId)) {
      return true;
    }

    if (type === "CALL_WAITER" || type === "CALL_WAITER_ACK") {
      return payload && Number(payload.table_id) === Number(tableId);
    }
    return false;
  }

  if (client._role === "payment_counter") {
    if (type === "DATA_REFRESH") return true;
    return PAYMENT_COUNTER_EVENTS.has(type) || isPublicSettingsUpdate(data);
  }

  if (client._auth?.role) return false;
  return false;
};

module.exports = { clientShouldReceive };
