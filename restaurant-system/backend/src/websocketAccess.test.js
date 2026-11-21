const assert = require("node:assert/strict");
const test = require("node:test");
const { clientShouldReceive, sanitizeCustomerRealtimeEvent } = require("./websocketAccess");

const customer = (tableId = 7) => ({
  readyState: 1,
  _role: "customer_waiter",
  _tableNumber: tableId,
});

test("customers receive public data changes and only their own table events", () => {
  const client = customer();

  assert.equal(clientShouldReceive(client, { type: "MENU_UPDATE", payload: { id: 12 } }), true);
  assert.equal(clientShouldReceive(client, { type: "SETTINGS_UPDATE", payload: { key: "sst_rate" } }), true);
  assert.equal(clientShouldReceive(client, { type: "SETTINGS_UPDATE", payload: { key: "printer_password" } }), false);
  assert.equal(clientShouldReceive(client, { type: "TABLE_UPDATE", payload: { id: 7 } }), true);
  assert.equal(clientShouldReceive(client, { type: "NEW_ORDER", payload: { table_id: 7 } }), true);
  assert.equal(clientShouldReceive(client, { type: "NEW_ORDER", payload: { table_id: 8 } }), false);
  assert.equal(clientShouldReceive(client, { type: "ORDER_STATUS_UPDATE", payload: { table_id: 7 } }), true);
  assert.equal(clientShouldReceive(client, { type: "FEEDBACK_RESPONSE", payload: { table_id: 7 } }), true);
  assert.equal(clientShouldReceive(client, { type: "FEEDBACK_RESPONSE", payload: { table_id: 8 } }), false);
  assert.equal(clientShouldReceive(client, { type: "NEW_PAYMENT", payload: { table_id: 7, payments: [{ amount_paid: 20 }] } }), false);
  assert.equal(clientShouldReceive(client, { type: "MANAGER_SECRET_EVENT", payload: { table_id: 7 } }), false);
});

test("customer realtime order payloads exclude private fields and feedback details", () => {
  const orderEvent = sanitizeCustomerRealtimeEvent({
    type: "NEW_ORDER",
    payload: {
      id: 12,
      table_id: 7,
      customer_name: "Guest",
      customer_phone: "555-0100",
      qr_code: "table-secret",
      items: [{ item_name: "Tea", notes: "private note" }],
    },
  });
  assert.deepEqual(orderEvent.payload, {
    id: 12,
    table_id: 7,
    items: [{ item_name: "Tea" }],
  });

  const feedbackEvent = sanitizeCustomerRealtimeEvent({
    type: "FEEDBACK_RESPONSE",
    payload: { table_id: 7, sender_name: "Guest", comment: "private feedback" },
  });
  assert.deepEqual(feedbackEvent.payload, { table_id: 7 });
});

test("payment counters receive workflow and public data updates, not manager-only events", () => {
  const client = { readyState: 1, _role: "payment_counter" };

  assert.equal(clientShouldReceive(client, { type: "NEW_ORDER" }), true);
  assert.equal(clientShouldReceive(client, { type: "MENU_UPDATE" }), true);
  assert.equal(clientShouldReceive(client, { type: "SETTINGS_UPDATE", payload: { key: "work_hours" } }), true);
  assert.equal(clientShouldReceive(client, { type: "SETTINGS_UPDATE", payload: { key: "printer_password" } }), false);
  assert.equal(clientShouldReceive(client, { type: "TABLE_UPDATE", payload: { id: 7 } }), true);
  assert.equal(clientShouldReceive(client, { type: "DATA_REFRESH" }), true);
  assert.equal(clientShouldReceive(client, { type: "INVENTORY_UPDATE" }), false);
  assert.equal(clientShouldReceive(client, { type: "LOG_UPDATE" }), false);
  assert.equal(clientShouldReceive(client, { type: "FEEDBACK_UPDATE" }), false);
  assert.equal(clientShouldReceive(client, { type: "MENU_ADMIN_UPDATE" }), false);
  assert.equal(clientShouldReceive(client, { type: "PRINTER_SETTINGS_UPDATE" }), false);
  assert.equal(clientShouldReceive(client, { type: "EMPLOYEE_UPDATE" }), false);
});

test("data refresh events reach customer clients without exposing manager-only events", () => {
  const client = customer();

  assert.equal(clientShouldReceive(client, { type: "DATA_REFRESH" }), true);
  assert.equal(clientShouldReceive(client, { type: "LOG_UPDATE" }), false);
  assert.equal(clientShouldReceive(client, { type: "BACKUP_UPDATE" }), false);
  assert.equal(clientShouldReceive(client, { type: "MENU_ADMIN_UPDATE" }), false);
  assert.equal(clientShouldReceive(client, { type: "PRINTER_SETTINGS_UPDATE" }), false);
});

test("manager sockets receive all events while closed sockets receive none", () => {
  const manager = { readyState: 1, _auth: { role: "manager" } };
  const closedManager = { readyState: 3, _auth: { role: "manager" } };

  assert.equal(clientShouldReceive(manager, { type: "EMPLOYEE_UPDATE" }), true);
  assert.equal(clientShouldReceive(manager, { type: "LOG_UPDATE" }), true);
  assert.equal(clientShouldReceive(manager, { type: "BACKUP_UPDATE" }), true);
  assert.equal(clientShouldReceive(manager, { type: "FEEDBACK_UPDATE" }), true);
  assert.equal(clientShouldReceive(manager, { type: "MENU_ADMIN_UPDATE" }), true);
  assert.equal(clientShouldReceive(manager, { type: "PRINTER_SETTINGS_UPDATE" }), true);
  assert.equal(clientShouldReceive(closedManager, { type: "EMPLOYEE_UPDATE" }), false);
});
