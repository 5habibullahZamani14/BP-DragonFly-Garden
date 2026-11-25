const db = require("../database/db");
const printerService = require("./printerService");
const { printCopies } = require("./receiptCopies");

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || []));
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (error) {
    if (error) reject(error);
    else resolve({ changes: this.changes, lastID: this.lastID });
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null));
});

const pad = (value) => String(value).padStart(2, "0");

const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const dateFromKey = (key) => {
  const [year, month, day] = String(key).split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const parseStoredSchedule = (row) => {
  if (!row) return { start: "09:00", end: "22:00", open_days: [0, 1, 2, 3, 4, 5, 6], first_day_of_week: "monday" };
  let schedule = row;
  if (typeof row === "string") {
    try {
      schedule = JSON.parse(row);
    } catch {
      const match = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(row);
      if (match) return { start: match[1], end: match[2], open_days: [0, 1, 2, 3, 4, 5, 6], first_day_of_week: "monday" };
      return { start: "09:00", end: "22:00", open_days: [0, 1, 2, 3, 4, 5, 6], first_day_of_week: "monday" };
    }
  }
  const openDays = Array.isArray(schedule.open_days)
    ? schedule.open_days.map(Number).filter(Number.isInteger)
    : [0, 1, 2, 3, 4, 5, 6];
  return {
    start: typeof schedule.start === "string" ? schedule.start : "09:00",
    end: typeof schedule.end === "string" ? schedule.end : "22:00",
    open_days: openDays.length ? openDays : [0, 1, 2, 3, 4, 5, 6],
    first_day_of_week: typeof schedule.first_day_of_week === "string" ? schedule.first_day_of_week : "monday",
  };
};

const getSchedule = async () => {
  const row = await get("SELECT value FROM restaurant_settings WHERE key = 'work_hours'");
  return parseStoredSchedule(row?.value);
};

const getScheduledMinutes = (closingTime) => {
  const parts = String(closingTime).split(":");
  if (parts.length !== 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute - 5;
};

const getOrdersForDate = async (salesDate) => {
  const liveRows = await all(
    `SELECT id, daily_ticket_number, total_price, created_at
     FROM orders
     WHERE date(created_at, 'localtime') = date(?)
       AND (payment_status = 'paid' OR status = 'archived')
     ORDER BY created_at ASC`,
    [salesDate]
  );

  const archivedRows = await all(
    `SELECT original_order_id, daily_ticket_number, total_price, created_at, order_data
     FROM archived_orders
     WHERE date(created_at, 'localtime') = date(?)
     ORDER BY created_at ASC`,
    [salesDate]
  );

  const combined = new Map();
  liveRows.forEach((row) => combined.set(`live-${row.id}`, {
    id: row.id,
    daily_ticket_number: row.daily_ticket_number,
    total_price: row.total_price,
  }));
  archivedRows.forEach((row) => {
    let snapshot = null;
    try { snapshot = JSON.parse(row.order_data); } catch {}
    combined.set(`archived-${row.original_order_id}`, {
      id: snapshot?.id || row.original_order_id,
      daily_ticket_number: snapshot?.daily_ticket_number ?? row.daily_ticket_number,
      total_price: snapshot?.total_price ?? row.total_price,
    });
  });
  return [...combined.values()].sort((a, b) => (a.daily_ticket_number || a.id) - (b.daily_ticket_number || b.id));
};

const upsertStatus = async (salesDate, status, fields = {}) => {
  await run(
    `INSERT INTO daily_sales_receipt_logs
       (sales_date, status, printed_at, missed_at, ignored_at, ignored_by, copy_count, order_count, total_sales, printer_job_ids, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sales_date) DO UPDATE SET
       status = excluded.status,
       printed_at = excluded.printed_at,
       missed_at = excluded.missed_at,
       ignored_at = excluded.ignored_at,
       ignored_by = excluded.ignored_by,
       copy_count = excluded.copy_count,
       order_count = excluded.order_count,
       total_sales = excluded.total_sales,
       printer_job_ids = excluded.printer_job_ids,
       error_message = excluded.error_message`,
    [
      salesDate,
      status,
      fields.printedAt || null,
      fields.missedAt || null,
      fields.ignoredAt || null,
      fields.ignoredBy || null,
      fields.copyCount ?? null,
      fields.orderCount ?? null,
      fields.totalSales ?? null,
      fields.printerJobIds ? JSON.stringify(fields.printerJobIds) : null,
      fields.errorMessage || null,
    ]
  );
};

const printDailySalesReportForDate = async (salesDate, ignoredBy = null) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(salesDate))) {
    throw new Error("Invalid sales date.");
  }
  const dateObj = dateFromKey(salesDate);
  if (Number.isNaN(dateObj.getTime())) throw new Error("Invalid sales date.");
  if (toDateKey(dateObj) !== salesDate) throw new Error("Invalid sales date.");
  if (dateObj.getTime() > new Date().setHours(23, 59, 59, 999)) {
    throw new Error("A future sales date cannot be printed.");
  }

  const existing = await get("SELECT status FROM daily_sales_receipt_logs WHERE sales_date = ?", [salesDate]);
  if (existing?.status === "printed") {
    return { success: false, alreadyPrinted: true, message: `The daily sales receipt for ${salesDate} has already been printed.` };
  }
  if (existing?.status === "ignored") {
    await run("UPDATE daily_sales_receipt_logs SET ignored_at = NULL, ignored_by = NULL WHERE sales_date = ?", [salesDate]);
  }

  const copyCounts = await printerService.getReceiptCopyCounts();
  const copyCount = copyCounts.daily_sales_report;
  if (copyCount === 0) {
    await upsertStatus(salesDate, "ignored", {
      ignoredAt: new Date().toISOString(),
      ignoredBy: "Receipt copies configured to zero",
      copyCount: 0,
    });
    return {
      success: true,
      skipped: true,
      message: `Daily sales receipt printing is disabled (copy count is 0) for ${salesDate}.`,
    };
  }

  const orders = await getOrdersForDate(salesDate);
  const totalSales = orders.reduce((sum, order) => sum + Number(order.total_price || 0), 0);
  const results = await printCopies(copyCount, () => printerService.printDailySalesReport(orders, dateObj));

  const failed = results.find((result) => !result || result.success !== true);
  if (failed) {
    await upsertStatus(salesDate, "missed", {
      missedAt: new Date().toISOString(),
      copyCount,
      orderCount: orders.length,
      totalSales,
      errorMessage: failed.message || "Printer did not confirm the print job.",
    });
    throw new Error(failed.message || "Printer did not confirm the print job.");
  }

  await upsertStatus(salesDate, "printed", {
    printedAt: new Date().toISOString(),
    copyCount,
    orderCount: orders.length,
    totalSales,
  });
  return {
    success: true,
    message: `Daily sales receipt printed successfully for ${salesDate}.`,
    salesDate,
    orderCount: orders.length,
    totalSales,
  };
};

const reconcileDailySalesReceipts = async () => {
  const schedule = await getSchedule();
  const now = new Date();
  const today = toDateKey(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const scheduledMinutes = getScheduledMinutes(schedule.end);
  if (scheduledMinutes === null) return;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  // Past open days are deliberately marked missed; no historical data is reprinted automatically.
  const firstPast = new Date(now);
  firstPast.setDate(firstPast.getDate() - 365);
  for (let cursor = new Date(firstPast); cursor <= yesterday; cursor.setDate(cursor.getDate() + 1)) {
    if (!schedule.open_days.includes(cursor.getDay())) continue;
    const salesDate = toDateKey(cursor);
    const existing = await get("SELECT status FROM daily_sales_receipt_logs WHERE sales_date = ?", [salesDate]);
    if (!existing) {
      await upsertStatus(salesDate, "missed", {
        missedAt: new Date().toISOString(),
        errorMessage: "The system could not confirm a scheduled daily sales receipt print.",
      });
    }
  }

  if (!schedule.open_days.includes(now.getDay())) return;
  if (currentMinutes < scheduledMinutes) return;

  const existing = await get("SELECT status FROM daily_sales_receipt_logs WHERE sales_date = ?", [today]);
  if (existing?.status === "printed" || existing?.status === "ignored") return;

  try {
    await printDailySalesReportForDate(today);
  } catch (error) {
    await upsertStatus(today, "missed", {
      missedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

const getDailySalesReceiptStatus = async () => {
  const rows = await all(
    `SELECT sales_date, status, printed_at, missed_at, ignored_at, ignored_by,
            copy_count, order_count, total_sales, printer_job_ids, error_message
     FROM daily_sales_receipt_logs
     ORDER BY sales_date DESC
     LIMIT 366`
  );
  return rows.map((row) => ({
    ...row,
    printerJobIds: (() => {
      try { return JSON.parse(row.printer_job_ids || "[]"); } catch { return []; }
    })(),
  }));
};

const ignoreMissedReceipt = async (salesDate, ignoredBy) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(salesDate))) throw new Error("Invalid sales date.");
  const existing = await get("SELECT status FROM daily_sales_receipt_logs WHERE sales_date = ?", [salesDate]);
  if (!existing) throw new Error("This missed report could not be found.");
  if (existing.status === "printed") throw new Error("This report was already printed.");
  await upsertStatus(salesDate, "ignored", {
    ignoredAt: new Date().toISOString(),
    ignoredBy: ignoredBy || "Manager",
  });
  return { success: true, message: `The missed daily sales receipt for ${salesDate} was dismissed.` };
};

module.exports = {
  reconcileDailySalesReceipts,
  printDailySalesReportForDate,
  getDailySalesReceiptStatus,
  ignoreMissedReceipt,
  getOrdersForDate,
  getSchedule,
};
