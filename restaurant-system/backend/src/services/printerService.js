/*
 * printerService.js — Renders plain receipt text through the installed printer queue.
 * The printer driver controls paper size; the app only applies text alignment.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const db = require("../database/db");
const { withCircuitBreaker } = require("./circuitBreaker");
const { submitWindowsPrintJob } = require("./windowsPrintJob");
const { normalizeReceiptCopyCounts } = require("./receiptCopies");

const DEFAULT_PRINTER_COLUMNS = 44;
const TICKET_RULE = "-".repeat(DEFAULT_PRINTER_COLUMNS);
const TICKET_TOTAL_RULE = "=".repeat(DEFAULT_PRINTER_COLUMNS);
const DEFAULT_TEST_TICKET = [
  "BP DRAGONFLY GARDEN",
  "PRINTER TEST",
  "--------------------------------",
  "This is a printer test ticket.",
  "Thank you!"
].join("\n");

const centerText = (text, width = DEFAULT_PRINTER_COLUMNS) => {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
};

/**
 * Read and validate receipt copy counts from persisted printer preferences.
 */
const getReceiptCopyCounts = () => {
  return new Promise((resolve, reject) => {
    db.get("SELECT value FROM restaurant_settings WHERE key = 'printer_preferences'", (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        resolve(normalizeReceiptCopyCounts({}));
        return;
      }
      
      try {
        const prefs = JSON.parse(row.value);
        resolve(normalizeReceiptCopyCounts(prefs));
      } catch (error) {
        reject(new Error(`Could not read receipt copy counts: ${error.message}`));
      }
    });
  });
};

/**
 * Get the currently selected printer from database settings
 * Falls back to default printer if selected is not available
 */
const getSelectedPrinter = () => {
  return new Promise((resolve, reject) => {
    db.get("SELECT value FROM restaurant_settings WHERE key = 'selected_printer'", (err, row) => {
      if (err) {
        reject(err);
      } else {
        const selectedPrinter = row && typeof row.value === "string" ? row.value.trim() : "";
        
        if (!selectedPrinter) {
          db.get("SELECT value FROM restaurant_settings WHERE key = 'default_printer'", (err, row) => {
            if (err) {
              reject(err);
            } else {
              const defaultPrinter = row && typeof row.value === "string" ? row.value.trim() : "";
              resolve(defaultPrinter || null);
            }
          });
        } else {
          resolve(selectedPrinter);
        }
      }
    });
  });
};

const formatDateTime = (date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const formatTableNumber = (tableNumber) => {
  if (!tableNumber) return "";
  const trimmed = tableNumber.trim();
  if (/^table\b/i.test(trimmed)) {
    return trimmed;
  }
  if (/(takeaway|delivery|pickup)/i.test(trimmed)) {
    return trimmed;
  }
  return `Table: ${trimmed}`;
};

/* CUPS accepts plain text; translate alignment markers without wrapping or styling. */
const stripGdiTags = (ticket, width = DEFAULT_PRINTER_COLUMNS) => {
  return ticket
    .split('\n')
    .map(line => {
      let alignment = "left";
      let isSquare = false;
      let cleanLine = line;

      while (cleanLine.startsWith("[")) {
        if (cleanLine.startsWith("[H1]")) {
          cleanLine = cleanLine.substring(4).replace(/^\s+/, "");
        } else if (cleanLine.startsWith("[BOLD]")) {
          cleanLine = cleanLine.substring(6).replace(/^\s+/, "");
        } else if (cleanLine.startsWith("[CENTER]")) {
          alignment = "center";
          cleanLine = cleanLine.substring(8).replace(/^\s+/, "");
        } else if (cleanLine.startsWith("[RIGHT]")) {
          alignment = "right";
          cleanLine = cleanLine.substring(7).replace(/^\s+/, "");
        } else if (cleanLine.startsWith("[LEFT]")) {
          alignment = "left";
          cleanLine = cleanLine.substring(6).replace(/^\s+/, "");
        } else if (cleanLine.startsWith("[SQUARE]")) {
          isSquare = true;
          cleanLine = cleanLine.substring(8).replace(/^\s+/, "");
        } else {
          break;
        }
      }

      if (isSquare) {
        cleanLine = "[ ] " + cleanLine;
      }

      if (cleanLine.length > width) return cleanLine;
      if (alignment === "center") return centerText(cleanLine, width);
      if (alignment === "right") return cleanLine.padStart(width, ' ');
      return cleanLine;
    })
    .join('\n');
};

const submitPrintJob = async (ticket, printerName, filename, options = {}) => {
  if (!printerName || !String(printerName).trim()) {
    throw new Error("No printer is selected. Choose the active printer in Manager Settings.");
  }
  const selectedPrinterName = String(printerName).trim();
  let result;
  if (process.platform === 'win32') {
    result = await submitWindowsPrintJob(ticket, selectedPrinterName, filename, options);
  } else {
    const os = require("os");
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dragonfly-print-"));
    try {
      const filepath = path.join(tempDirectory, path.basename(filename));
      fs.writeFileSync(filepath, ticket, 'utf8');
      result = await new Promise((resolve, reject) => {
        const proc = spawn('lp', ['-d', selectedPrinterName, filepath], { shell: false });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve(value);
        };
        const timeout = setTimeout(() => {
          proc.kill();
          finish(new Error("Timed out while submitting the print job to CUPS."));
        }, 30000);

        proc.stdout.on('data', data => { stdout += data; });
        proc.stderr.on('data', data => { stderr += data; });
        proc.once('close', code => {
          if (code === 0) {
            finish(null, {
              success: true,
              message: `Print job submitted to ${selectedPrinterName}`,
              filename,
              method: 'lp'
            });
          } else {
            finish(new Error(stderr.trim() || stdout.trim() || `lp command failed (exit code ${code})`));
          }
        });
        proc.once('error', error => finish(new Error(`Could not start lp: ${error.message}`)));
      });
    } finally {
      try {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
      } catch (error) {
        console.warn("Could not remove temporary print files:", error.message);
      }
    }
  }

  return result;
};

const createPrinterJob = (printerName, metadata) => new Promise((resolve, reject) => {
  db.run(
    `INSERT INTO printer_jobs (order_id, job_type, printer_name, status)
     VALUES (?, ?, ?, 'submitting')`,
    [metadata.orderId ?? null, metadata.jobType || "receipt", printerName],
    function (error) {
      if (error) reject(error);
      else resolve(this.lastID);
    }
  );
});

const updatePrinterJob = (jobId, status, errorMessage = null) => new Promise((resolve, reject) => {
  db.run(
    `UPDATE printer_jobs
     SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP,
         reviewed_at = CASE WHEN ? = 'reviewed' THEN CURRENT_TIMESTAMP ELSE reviewed_at END
     WHERE id = ?`,
    [status, errorMessage, status, jobId],
    function (error) {
      if (error) reject(error);
      else resolve(this.changes);
    }
  );
});

const executeTicketPrint = async (
  ticket,
  filenamePrefix,
  printerName,
  metadata = {},
  preserveTicketText = false
) => {
  const filename = `${filenamePrefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  const finalTicket = preserveTicketText || process.platform === "win32" ? ticket : stripGdiTags(ticket);
  console.log(`Submitting ${filenamePrefix} print job to ${printerName}`);
  const jobId = await createPrinterJob(printerName, metadata);
  let result;
  try {
    result = await submitPrintJob(finalTicket, printerName, filename, {
      interpretAlignmentTags: !preserveTicketText,
      columns: DEFAULT_PRINTER_COLUMNS
    });
  } catch (error) {
    const submissionError = error instanceof Error ? error : new Error(String(error));
    submissionError.printerSubmissionStarted = true;
    try {
      await updatePrinterJob(jobId, "uncertain", submissionError.message);
    } catch (trackingError) {
      console.error(`Could not record uncertain printer job ${jobId}:`, trackingError.message);
    }
    throw submissionError;
  }
  try {
    await updatePrinterJob(jobId, "submitted");
  } catch (error) {
    console.error(`Print job ${jobId} was submitted, but its status could not be recorded:`, error.message);
  }
  return result;
};

const _executePrintWithPrinter = async (ticket, filenamePrefix, printerName, metadata) => {
  if (!printerName || !String(printerName).trim()) {
    throw new Error('A printer must be selected before printing');
  }
  return executeTicketPrint(ticket, filenamePrefix, printerName, metadata, filenamePrefix === 'printer_test');
};

const _executePrint = async (ticket, filenamePrefix, metadata) => {
  const printerName = await getSelectedPrinter();
  if (!printerName || !String(printerName).trim()) {
    throw new Error('No default printer is selected');
  }
  return executeTicketPrint(ticket, filenamePrefix, printerName, metadata, filenamePrefix === 'printer_test');
};
const executePrintWithPrinter = async (ticket, filenamePrefix, printerName, metadata = {}) => {
  const breaker = withCircuitBreaker('printer', _executePrintWithPrinter, {
    failureThreshold: 3,
    timeoutMs: 60000,
    successThreshold: 2
  });
  return breaker(ticket, filenamePrefix, printerName, metadata);
};

/**
 * executePrint - Wrapped with circuit breaker for resilience.
 */
const executePrint = async (ticket, filenamePrefix, metadata = {}) => {
  const breaker = withCircuitBreaker('printer', _executePrint, {
    failureThreshold: 3,
    timeoutMs: 60000,
    successThreshold: 2
  });
  return breaker(ticket, filenamePrefix, metadata);
};

const parseItemOptions = (item) => {
  if (!item.options_json) return [];
  let options;
  try {
    options = JSON.parse(item.options_json);
  } catch (error) {
    throw new Error(`Could not read options for "${item.item_name}": ${error.message}`);
  }
  if (!Array.isArray(options)) {
    throw new Error(`Options for "${item.item_name}" must be a list.`);
  }
  return options;
};

const formatDailySalesReport = (todayOrders, now = new Date()) => {
  const timestamp = formatDateTime(now);
  const todayDateStr = now.toLocaleDateString('en-GB');

  let ticket = "";
  ticket += "[CENTER]BP DRAGONFLY GARDEN\n";
  ticket += "[CENTER]DAILY SALES REPORT\n";
  ticket += "[CENTER]END-OF-DAY SUMMARY\n";
  ticket += `${TICKET_RULE}\n`;
  ticket += `DATE: ${todayDateStr}\n`;
  ticket += `PRINTED: ${timestamp}\n`;
  ticket += `${TICKET_RULE}\n`;
  ticket += "SALES BY ORDER\n";

  let totalSales = 0;
  if (todayOrders.length === 0) {
    ticket += "No orders were recorded today.\n";
  }
  todayOrders.forEach((order, index) => {
    const orderNum = order.daily_ticket_number || order.id;
    const price = Number(order.total_price || 0);
    totalSales += price;

    if (index > 0) ticket += "\n";
    ticket += `ORDER #${orderNum}\n`;
    ticket += `[RIGHT]SALES: RM ${price.toFixed(2)}\n`;
  });

  ticket += `${TICKET_RULE}\n`;
  ticket += `ORDERS RECORDED: ${todayOrders.length}\n`;
  ticket += `${TICKET_TOTAL_RULE}\n`;
  ticket += `[RIGHT]TOTAL SALES: RM ${totalSales.toFixed(2)}\n`;
  ticket += `${TICKET_TOTAL_RULE}\n`;
  return ticket;
};

const SAMPLE_ORDER_ITEMS = [
  {
    quantity: 1,
    item_name: "Jacket Potato",
    price_at_order_time: 7,
    options_json: JSON.stringify([{ option: "Large", delta: 0 }]),
    notes: "No sour cream"
  },
  {
    quantity: 2,
    item_name: "Lemon Tea",
    price_at_order_time: 5.5,
    options_json: JSON.stringify([{ option: "Less sugar", delta: 0 }]),
    notes: "Less ice"
  },
  {
    quantity: 1,
    item_name: "Kampung Eggs",
    price_at_order_time: 11.5,
    options_json: JSON.stringify([{ option: "Extra cheese", delta: 2.5 }]),
    notes: "Cut in half"
  }
];

const SAMPLE_ORDER = {
  id: 1042,
  daily_ticket_number: 42,
  order_type: "DINE_IN",
  table_id: 3,
  table_number: "3",
  customer_name: "Sample Guest",
  customer_phone: "012-345 6789",
  collection_time: null,
  delivery_address: null,
  total_price: 29.5,
  service_charge_rate: 0.1,
  vat_rate: 0.06,
  items: SAMPLE_ORDER_ITEMS
};

const printerService = {
  formatChecklistTicket: (order, itemsToPrint, isAddOn, copyTitle) => {
    const timestamp = formatDateTime(new Date());
    let ticket = "";

    let orderTypeStr = isAddOn ? "ADD-ON" : "NEW ORDER";
    if (order.order_type === 'PICKUP') orderTypeStr = isAddOn ? "ADD-ON ORDER (PICKUP)" : "PICKUP ORDER";
    else if (order.order_type === 'DELIVERY') orderTypeStr = isAddOn ? "ADD-ON ORDER (DELIVERY)" : "DELIVERY ORDER";
    else if (order.order_type === 'TAKEAWAY') orderTypeStr = isAddOn ? "ADD-ON ORDER (TAKEAWAY)" : "TAKEAWAY ORDER";
    else if (order.order_type === 'COUNTER') orderTypeStr = isAddOn ? "ADD-ON ORDER (COUNTER)" : "COUNTER ORDER";
    else if (isAddOn) orderTypeStr = "ADD-ON ORDER";

    ticket += "[CENTER]BP DRAGONFLY GARDEN\n";
    ticket += `[CENTER]${orderTypeStr}\n`;
    if (copyTitle) ticket += `[CENTER]${copyTitle}\n`;
    ticket += `${TICKET_RULE}\n`;
    ticket += "ORDER DETAILS\n";
    ticket += `ORDER: #${order.daily_ticket_number || order.id}\n`;
    ticket += `TIME: ${timestamp}\n`;
    ticket += "PLACED BY: Cashier\n";

    if (!order.order_type || order.order_type === 'DINE_IN') {
      const table = formatTableNumber(order.table_number);
      if (table) ticket += `${table.toUpperCase()}\n`;
    } else {
      if (order.order_type === 'COUNTER' && order.table_id !== 999 && order.table_number && order.table_number !== 'Counter Order') {
        ticket += `${formatTableNumber(order.table_number).toUpperCase()}\n`;
      }
      if (order.customer_name) ticket += `CUSTOMER: ${order.customer_name}\n`;
      if (order.customer_phone) ticket += `PHONE: ${order.customer_phone}\n`;
      if (order.order_type === 'PICKUP' && order.collection_time) ticket += `PICKUP TIME: ${order.collection_time}\n`;
      if (order.order_type === 'DELIVERY' && order.delivery_address) ticket += `DELIVER TO: ${order.delivery_address}\n`;
    }

    ticket += `${TICKET_RULE}\n`;
    ticket += isAddOn ? "ADDED ITEMS\n" : "ITEMS TO PREPARE\n";
    itemsToPrint.forEach(item => {
      ticket += `${item.quantity} x ${item.item_name || ""}\n`;
      if (item.notes) ticket += `  Note: ${item.notes}\n`;
      for (const option of parseItemOptions(item)) {
        const suffix = option.delta > 0 ? ` (+RM ${parseFloat(option.delta).toFixed(2)})` : '';
        ticket += `  Option: ${option.option}${suffix}\n`;
      }
      ticket += "\n";
    });

    ticket += `${TICKET_RULE}\n`;
    ticket += copyTitle === "KITCHEN COPY"
      ? isAddOn ? "Please add these items to the existing\norder.\n" : "Please prepare the items listed above.\n"
      : isAddOn ? "These items have been added to your order.\n" : "Thank you! Your order is being prepared.\n";
    return ticket;
  },

  formatFinalReceipt: (order, cashierName) => {
    const timestamp = formatDateTime(new Date());
    let ticket = "";

    ticket += `[CENTER]BP DRAGONFLY GARDEN\n`;
    ticket += `[CENTER]Solok Pondok Upih, Taman Kristal\n`;
    ticket += `[CENTER]11020 Balik Pulau, Pulau Pinang\n`;
    ticket += `[CENTER]FINAL RECEIPT\n`;
    ticket += `${TICKET_RULE}\n`;

    ticket += "ORDER DETAILS\n";
    ticket += `RECEIPT: ${order.id}\n`;
    ticket += `ORDER: #${order.daily_ticket_number || order.id}\n`;
    ticket += `DATE: ${timestamp}\n`;
    ticket += `CASHIER: ${cashierName}\n`;
    if (!order.order_type || order.order_type === 'DINE_IN') {
      ticket += `${formatTableNumber(order.table_number).toUpperCase()}\n`;
    } else {
      ticket += `ORDER TYPE: ${order.order_type.replace(/_/g, " ")}\n`;
      if (order.order_type === 'COUNTER' && order.table_id !== 999 && order.table_number && order.table_number !== 'Counter Order') {
        ticket += `${formatTableNumber(order.table_number).toUpperCase()}\n`;
      }
      if (order.customer_name) ticket += `CUSTOMER: ${order.customer_name}\n`;
      if (order.order_type === 'DELIVERY' && order.delivery_address) ticket += `DELIVER TO: ${order.delivery_address}\n`;
      if (order.order_type === 'PICKUP' && order.collection_time) ticket += `PICKUP TIME: ${order.collection_time}\n`;
    }

    ticket += `${TICKET_RULE}\n`;
    ticket += "ITEMS\n";
    let totalQty = 0;

    order.items.forEach(item => {
      totalQty += item.quantity;
      ticket += `${item.quantity} x ${item.item_name || ""}\n`;
      for (const option of parseItemOptions(item)) {
        const suffix = option.delta > 0 ? ` (+RM ${parseFloat(option.delta).toFixed(2)})` : '';
        ticket += `  OPTION: ${option.option}${suffix}\n`;
      }
      if (item.notes) ticket += `  NOTE: ${item.notes}\n`;
      ticket += `[RIGHT]RM ${(item.quantity * item.price_at_order_time).toFixed(2)}\n`;
      ticket += "\n";
    });

    ticket += `${TICKET_RULE}\n`;
    ticket += `ITEMS: ${totalQty}\n`;

    const subtotal = Number(order.total_price || 0);
    const serviceChargeRate = order.service_charge_rate || 0;
    const vatRate = order.vat_rate || 0;
    const serviceCharge = subtotal * serviceChargeRate;
    const sst = (subtotal + serviceCharge) * vatRate;
    const rawTotal = subtotal + sst + serviceCharge;
    const roundedTotal = Math.round(rawTotal * 20) / 20;
    const rounding = roundedTotal - rawTotal;

    ticket += `[RIGHT]SUBTOTAL: RM ${subtotal.toFixed(2)}\n`;
    if (serviceChargeRate > 0) {
      ticket += `[RIGHT]SERVICE CHARGE: RM ${serviceCharge.toFixed(2)}\n`;
    }
    if (vatRate > 0) {
      ticket += `[RIGHT]SST: RM ${sst.toFixed(2)}\n`;
    }
    ticket += `[RIGHT]ROUNDING: RM ${rounding.toFixed(2)}\n`;
    ticket += `${TICKET_TOTAL_RULE}\n`;
    ticket += `[RIGHT]TOTAL DUE: RM ${roundedTotal.toFixed(2)}\n`;
    ticket += `${TICKET_TOTAL_RULE}\n`;
    ticket += "[CENTER]THANK YOU FOR DINING WITH US\n";
    ticket += "[CENTER]We hope to see you again!\n";

    return ticket;
  },

  printChecklistTicket: async (order, itemsToPrint, isAddOn, copyNum) => {
    const copyTitle = copyNum === 1 ? "CUSTOMER COPY" : "KITCHEN COPY";
    const printerName = await getSelectedPrinter();
    if (!printerName) throw new Error("No printer is selected. Choose the active printer in Manager Settings.");
    const ticket = printerService.formatChecklistTicket(order, itemsToPrint, isAddOn, copyTitle);
    const copyType = copyNum === 1 ? "customer" : "kitchen";
    const jobType = `${isAddOn ? "addon" : "order"}_${copyType}`;
    return await executePrintWithPrinter(ticket, `order_${order.id}_checklist`, printerName, {
      orderId: order.id,
      jobType
    });
  },

  printFinalReceipt: async (order, cashierName) => {
    const printerName = await getSelectedPrinter();
    if (!printerName) throw new Error("No printer is selected. Choose the active printer in Manager Settings.");
    const ticket = printerService.formatFinalReceipt(order, cashierName);
    return await executePrintWithPrinter(ticket, `order_${order.id}_final`, printerName, {
      orderId: order.id,
      jobType: "final_receipt"
    });
  },

  printDailySalesReport: async (todayOrders) => {
    const printerName = await getSelectedPrinter();
    if (!printerName) throw new Error("No printer is selected. Choose the active printer in Manager Settings.");
    const ticket = formatDailySalesReport(todayOrders);

    return await executePrintWithPrinter(ticket, `daily_sales_report`, printerName, {
      jobType: "daily_sales_report"
    });
  },

  printSampleTicket: async (type) => {
    const ticket = formatSampleTicket(type);
    const printerName = await getSelectedPrinter();
    if (!printerName) throw new Error("No printer is selected. Choose the active printer in Manager Settings.");
    return executePrintWithPrinter(ticket, "sample_ticket", printerName, {
      jobType: `sample_${type}`
    });
  },

  printTestTicket: async (printerName) => {
    if (!printerName || !String(printerName).trim()) {
      throw new Error("Choose an installed printer queue before testing it.");
    }
    const ticket = await new Promise((resolve, reject) => {
      db.get("SELECT value FROM restaurant_settings WHERE key = 'printer_preferences'", (error, row) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          const preferences = row ? JSON.parse(row.value) : {};
          const savedTicket = preferences && preferences.test_ticket;
          resolve(typeof savedTicket === "string" ? savedTicket : DEFAULT_TEST_TICKET);
        } catch (error) {
          reject(new Error(`Could not read the saved test ticket: ${error.message}`));
        }
      });
    });
    if (!ticket.trim()) {
      throw new Error("The saved test ticket is empty. Edit and save the preview before printing.");
    }
    return executeTicketPrint(ticket, "printer_test", printerName, {
      jobType: "test"
    }, true);
  }
};

const formatSampleTicket = (type) => {
  switch (type) {
    case "order_customer":
      return printerService.formatChecklistTicket(SAMPLE_ORDER, SAMPLE_ORDER_ITEMS, false, "CUSTOMER COPY");
    case "order_kitchen":
      return printerService.formatChecklistTicket(SAMPLE_ORDER, SAMPLE_ORDER_ITEMS, false, "KITCHEN COPY");
    case "addon_customer":
      return printerService.formatChecklistTicket(SAMPLE_ORDER, SAMPLE_ORDER_ITEMS, true, "CUSTOMER COPY");
    case "addon_kitchen":
      return printerService.formatChecklistTicket(SAMPLE_ORDER, SAMPLE_ORDER_ITEMS, true, "KITCHEN COPY");
    case "final_receipt":
      return printerService.formatFinalReceipt(SAMPLE_ORDER, "Sample Cashier");
    case "daily_sales_report":
      return formatDailySalesReport([
        { daily_ticket_number: 40, total_price: 23.5 },
        { daily_ticket_number: 41, total_price: 18 },
        { daily_ticket_number: 42, total_price: 29.5 }
      ]);
    default: {
      const error = new Error("Unsupported sample ticket type.");
      error.code = "INVALID_SAMPLE_TICKET_TYPE";
      throw error;
    }
  }
};

module.exports = { ...printerService, formatSampleTicket, getReceiptCopyCounts };