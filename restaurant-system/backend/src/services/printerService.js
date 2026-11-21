/*
 * printerService.js — Thermal printer integration for order tickets.
 * Sends Windows jobs through the installed printer driver and uses CUPS on Linux.
 * 
 * Updated with circuit breaker pattern for resilience.
 * 
 * Width handling:
 * - 80mm paper = ~48 characters per line
 * - 58mm / 50mm paper = ~32 characters per line
 * - Width is set per-printer in the printer profile (stored in DB)
 * - The ticket formatters dynamically use the configured width
 * - Hardcoded fallback: 48 chars (80mm paper)
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const db = require("../database/db");
const { withCircuitBreaker } = require("./circuitBreaker");
const { submitWindowsPrintJob } = require("./windowsPrintJob");
const { getPrintableCharacterColumns, wrapReceiptText } = require("./printerFormatting");

const DEFAULT_PAPER_WIDTH_MM = 80;
const DEFAULT_PRINTER_COLUMNS = 48;

const centerText = (text, width = DEFAULT_PRINTER_COLUMNS) => {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
};

/**
 * Draw a separator line using the configured width
 */
const separator = (width = DEFAULT_PRINTER_COLUMNS) => '='.repeat(Math.max(10, width));

/**
 * Get receipt copy counts from printer preferences
 */
const getReceiptCopyCounts = () => {
  return new Promise((resolve, reject) => {
    const defaultCopies = {
      order_customer: 1,
      order_kitchen: 1,
      addon_customer: 1,
      addon_kitchen: 1,
      final_receipt: 1,
      daily_sales_report: 1
    };
    
    db.get("SELECT value FROM restaurant_settings WHERE key = 'printer_preferences'", (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        resolve(defaultCopies);
        return;
      }
      
      try {
        const prefs = JSON.parse(row.value);
        const receiptCopies = prefs.receipt_copies || {};
        const globalCopies = receiptCopies.global || {};
        
        resolve({
          order_customer: globalCopies.order_customer ?? 1,
          order_kitchen: globalCopies.order_kitchen ?? 1,
          addon_customer: globalCopies.addon_customer ?? 1,
          addon_kitchen: globalCopies.addon_kitchen ?? 1,
          final_receipt: globalCopies.final_receipt ?? 1,
          daily_sales_report: globalCopies.daily_sales_report ?? 1
        });
      } catch (e) {
        console.error("Error parsing receipt copy counts:", e);
        resolve(defaultCopies);
      }
    });
  });
};

/**
 * Get printer-specific settings from printer profiles
 * Falls back to global settings if printer-specific settings not found
 */
const getPrinterSettings = (printerName) => {
  return new Promise((resolve, reject) => {
    const defaultSettings = {
      width: DEFAULT_PAPER_WIDTH_MM,
      marginLeft: 0,
      marginRight: 0,
      marginTop: 0,
      marginBottom: 0,
      delaySeconds: 0,
      emptyLinesBefore: 2,
      emptyLinesAfter: 3,
      hasAutoCutter: false
    };
    
    db.get("SELECT value FROM restaurant_settings WHERE key = 'printer_preferences'", (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        resolve(defaultSettings);
        return;
      }
      
      try {
        const prefs = JSON.parse(row.value);
        const printerProfiles = prefs && typeof prefs.printer_profiles === "object" && prefs.printer_profiles
          ? prefs.printer_profiles
          : {};
        const printerProfile = printerProfiles[printerName];
        
        if (printerProfile) {
          resolve({
            width: printerProfile.width ?? DEFAULT_PAPER_WIDTH_MM,
            marginLeft: printerProfile.margin_left ?? 0,
            marginRight: printerProfile.margin_right ?? 0,
            marginTop: printerProfile.margin_top ?? 0,
            marginBottom: printerProfile.margin_bottom ?? 0,
            delaySeconds: printerProfile.print_delay_seconds ?? 0,
            emptyLinesBefore: printerProfile.empty_lines_before ?? 0,
            emptyLinesAfter: printerProfile.empty_lines_after ?? 0,
            hasAutoCutter: printerProfile.has_auto_cutter === true
          });
        } else {
          resolve(defaultSettings);
        }
      } catch (e) {
        reject(new Error(`Could not read printer settings: ${e.message}`));
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

/* Strips ticket markup and applies alignment for the Windows and CUPS text paths. */
const stripGdiTags = (ticket, width = DEFAULT_PRINTER_COLUMNS) => {
  return ticket
    .split('\n')
    .map(line => {
      let isCenter = false;
      let isRight = false;
      let isSquare = false;
      let cleanLine = line.trimEnd();

      while (cleanLine.startsWith("[")) {
        if (cleanLine.startsWith("[H1]")) {
          cleanLine = cleanLine.substring(4).trim();
        } else if (cleanLine.startsWith("[BOLD]")) {
          cleanLine = cleanLine.substring(6).trim();
        } else if (cleanLine.startsWith("[CENTER]")) {
          isCenter = true;
          cleanLine = cleanLine.substring(8).trim();
        } else if (cleanLine.startsWith("[RIGHT]")) {
          isRight = true;
          cleanLine = cleanLine.substring(7).trim();
        } else if (cleanLine.startsWith("[SQUARE]")) {
          isSquare = true;
          cleanLine = cleanLine.substring(8).trim();
        } else {
          break;
        }
      }

      if (isSquare) {
        cleanLine = "[ ] " + cleanLine;
      }

      const wrappedLines = wrapReceiptText(cleanLine, width);
      if (isCenter) {
        return wrappedLines.map(wrappedLine => centerText(wrappedLine, width)).join('\n');
      }
      if (isRight) {
        return wrappedLines.map(wrappedLine => wrappedLine.padStart(width, ' ')).join('\n');
      }
      if (cleanLine.length <= width) return cleanLine;
      const indent = cleanLine.match(/^\s*/)[0];
      return wrapReceiptText(cleanLine.trimStart(), Math.max(1, width - indent.length))
        .map(wrappedLine => indent + wrappedLine)
        .join('\n');
    })
    .join('\n');
};

// ── Dynamic width helper ─────────────────────────────────────────────
// Formatter widths are character columns; stored profile widths are millimeters.

const formatTicketForPrinter = (ticket, settings, skipMargins = false) => {
  const width = getPrintableCharacterColumns(settings.width, settings.marginLeft, settings.marginRight);
  for (const { name, value, max, unit } of [
    { name: "Top margin", value: settings.marginTop, max: 20, unit: "lines" },
    { name: "Bottom margin", value: settings.marginBottom, max: 20, unit: "lines" },
    { name: "Empty lines before", value: settings.emptyLinesBefore, max: 20, unit: "lines" },
    { name: "Empty lines after", value: settings.emptyLinesAfter, max: 20, unit: "lines" },
    { name: "Print delay", value: settings.delaySeconds, max: 60, unit: "seconds" }
  ]) {
    if (!Number.isInteger(value) || value < 0 || value > max) {
      throw new Error(`${name} must be a whole number between 0 and ${max} ${unit}.`);
    }
  }
  if (skipMargins) return stripGdiTags(ticket, width);

  const leftMargin = ' '.repeat(settings.marginLeft);
  const topMargin = '\n'.repeat(settings.marginTop);
  const bottomMargin = '\n'.repeat(settings.marginBottom);
  const cleanTicket = stripGdiTags(ticket, width);
  const ticketWithMargins = cleanTicket.split('\n').map(line => leftMargin + line).join('\n');
  const beforeLines = topMargin + '\n'.repeat(settings.emptyLinesBefore);
  const afterLines = '\n'.repeat(settings.emptyLinesAfter) + bottomMargin;
  return beforeLines + ticketWithMargins + afterLines;
};

const submitPrintJob = async (ticket, printerName, filename, settings) => {
  if (!printerName || !String(printerName).trim()) {
    throw new Error("No printer is selected. Choose the active printer in Manager Settings.");
  }
  const selectedPrinterName = String(printerName).trim();
  let result;
  if (process.platform === 'win32') {
    result = await submitWindowsPrintJob(ticket, selectedPrinterName, filename);
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

const executeTicketPrint = async (ticket, filenamePrefix, printerName, isTestPrint = false, metadata = {}) => {
  const settings = await getPrinterSettings(printerName);
  const filename = `${filenamePrefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  const finalTicket = formatTicketForPrinter(ticket, settings, isTestPrint);
  console.log(`Submitting ${filenamePrefix} print job to ${printerName}`);
  const jobId = await createPrinterJob(printerName, metadata);
  let result;
  try {
    result = await submitPrintJob(finalTicket, printerName, filename, settings);
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
  if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
    await new Promise(resolve => setTimeout(resolve, settings.delaySeconds * 1000));
  }
  return result;
};

const _executePrintWithPrinter = async (ticket, filenamePrefix, printerName, metadata) => {
  if (!printerName || !String(printerName).trim()) {
    throw new Error('A printer must be selected before printing');
  }
  return executeTicketPrint(ticket, filenamePrefix, printerName, filenamePrefix === 'printer_test', metadata);
};

const _executePrint = async (ticket, filenamePrefix, metadata) => {
  const printerName = await getSelectedPrinter();
  if (!printerName || !String(printerName).trim()) {
    throw new Error('No default printer is selected');
  }
  return executeTicketPrint(ticket, filenamePrefix, printerName, filenamePrefix === 'printer_test', metadata);
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

// ── Ticket Formatting Functions ──────────────────────────────────────────
// Formatter widths are character columns; stored profile widths are millimeters.
// The separator lines, text wrapping, padding, and alignment all use this width.

const printerService = {
  formatChecklistTicket: (order, itemsToPrint, isAddOn, copyTitle, width = DEFAULT_PRINTER_COLUMNS) => {
    const sep = separator(width);
    const timestamp = formatDateTime(new Date());
    let ticket = "\n";
    
    let orderTypeStr = isAddOn ? "ADD-ON" : "NEW ORDER";
    if (order.order_type === 'PICKUP') orderTypeStr = isAddOn ? "ADD-ON (PICKUP)" : "PICKUP";
    else if (order.order_type === 'DELIVERY') orderTypeStr = isAddOn ? "ADD-ON (DELIVERY)" : "DELIVERY";
    else if (order.order_type === 'TAKEAWAY') orderTypeStr = isAddOn ? "ADD-ON (TAKEAWAY)" : "TAKEAWAY";
    else if (order.order_type === 'COUNTER') orderTypeStr = isAddOn ? "ADD-ON (COUNTER)" : "COUNTER ORDER";

    if (copyTitle) {
      ticket += `[CENTER][H1] ${copyTitle}\n`;
      ticket += `[CENTER][BOLD](${orderTypeStr})\n`;
    } else {
      ticket += `[CENTER][H1] ${orderTypeStr}\n`;
    }
    
    // Header row: timestamp left, ticket number right, within width
    const leftHeader = `${timestamp}`;
    const rightHeader = `#${order.daily_ticket_number || order.id}`;
    const headerPad = Math.max(0, width - leftHeader.length - rightHeader.length);
    ticket += `${leftHeader}${' '.repeat(headerPad)}${rightHeader}\n`;
    ticket += `Send by: Cashier\n`;
    
    if (!order.order_type || order.order_type === 'DINE_IN') {
      ticket += `${formatTableNumber(order.table_number)}\n`;
    } else {
      if (order.order_type === 'COUNTER' && order.table_id !== 999 && order.table_number && order.table_number !== 'Counter Order') {
        ticket += `${formatTableNumber(order.table_number)}\n`;
      }
      if (order.customer_name) ticket += `Name: ${order.customer_name}\n`;
      if (order.customer_phone) ticket += `Phone: ${order.customer_phone}\n`;
      if (order.order_type === 'PICKUP' && order.collection_time) ticket += `Pickup At: ${order.collection_time}\n`;
      if (order.order_type === 'DELIVERY' && order.delivery_address) ticket += `Address: ${order.delivery_address}\n`;
    }
    ticket += `${sep}\n`;
    
    itemsToPrint.forEach(item => {
      // Wrap item name to fit width (leave room for "2x " prefix = 4 chars)
      const nameMax = width - 4;
      const nameLines = wrapReceiptText(item.item_name, nameMax);
      const qtyStr = `${item.quantity}x`.padEnd(4, ' ');
      
      nameLines.forEach((line, idx) => {
        if (idx === 0) {
          ticket += `${qtyStr} ${line}\n`;
        } else {
          ticket += `     ${line}\n`;
        }
      });

      if (item.notes) {
        const noteLines = wrapReceiptText(`Note: ${item.notes}`, width - 5);
        noteLines.forEach(line => ticket += `     ${line}\n`);
      }

      if (item.options_json) {
        try {
          const opts = JSON.parse(item.options_json);
          opts.forEach(opt => {
            const suffix = opt.delta > 0 ? ` (+${parseFloat(opt.delta).toFixed(2)})` : '';
            const optText = `> ${opt.option}${suffix}`;
            const optLines = wrapReceiptText(optText, width - 5);
            optLines.forEach(line => ticket += `     ${line}\n`);
          });
        } catch { /* ignore malformed JSON */ }
      }

      ticket += "[RIGHT][SQUARE]\n";
      ticket += `${sep}\n`;
    });
    
    ticket += "\n\n";
    return ticket;
  },

  formatFinalReceipt: (order, cashierName, width = DEFAULT_PRINTER_COLUMNS) => {
    const sep = separator(width);
    const timestamp = formatDateTime(new Date());
    let ticket = "\n";
    
    ticket += `[CENTER][H1] BP DRAGONFLY\n`;
    ticket += `[CENTER]GARDEN\n`;
    ticket += `[CENTER]Solok Pondok Upih\n`;
    ticket += `[CENTER]Taman Kristal\n`;
    ticket += `[CENTER]11020 Balik Pulau\n`;
    ticket += `[CENTER]Pulau Pinang\n`;
    ticket += `${sep}\n`;
    
    ticket += `Invoice: ${order.id}\n`;
    ticket += `Date: ${timestamp}\n`;
    ticket += `Cashier: ${cashierName}\n`;
    if (!order.order_type || order.order_type === 'DINE_IN') {
      ticket += `${formatTableNumber(order.table_number)}\n`;
    } else {
      ticket += `Type: ${order.order_type}\n`;
      if (order.order_type === 'COUNTER' && order.table_id !== 999 && order.table_number && order.table_number !== 'Counter Order') {
        ticket += `${formatTableNumber(order.table_number)}\n`;
      }
      if (order.customer_name) ticket += `Cust: ${order.customer_name}\n`;
      if (order.order_type === 'DELIVERY' && order.delivery_address) ticket += `Addr: ${order.delivery_address}\n`;
      if (order.order_type === 'PICKUP' && order.collection_time) ticket += `Pickup: ${order.collection_time}\n`;
    }
    ticket += "\n";
    ticket += `[H1] ORDER #${order.daily_ticket_number || order.id}\n`;
    ticket += `${sep}\n`;
    ticket += `Qty Item${' '.repeat(Math.max(1, width - 15))}Total\n`;
    ticket += `${sep}\n`;
    
    let totalQty = 0;
    
    order.items.forEach(item => {
      totalQty += item.quantity;
      const qtyStr = item.quantity.toString().padEnd(3, ' ');
      const lineTotal = (item.quantity * item.price_at_order_time).toFixed(2);
      
      // Keep the full item name while reserving space for the amount on the first line.
      const nameMax = width - 15; // room for "3 xxx...xxx  RM12.50"
      const nameLines = wrapReceiptText(item.item_name, nameMax);
      const nameStr = nameLines[0].padEnd(nameMax, ' ');
      const priceStr = lineTotal.padStart(8, ' ');
      
      ticket += `${qtyStr} ${nameStr}${priceStr}\n`;
      nameLines.slice(1).forEach(line => {
        ticket += `    ${line}\n`;
      });
      
      let deltasSum = 0;
      let hasPriceDelta = false;
      if (item.options_json) {
        try {
          const opts = JSON.parse(item.options_json);
          opts.forEach(opt => {
            if (opt.delta) { deltasSum += parseFloat(opt.delta); hasPriceDelta = true; }
          });
        } catch {}
      }
      
      if (hasPriceDelta) {
        ticket += `    (RM ${item.price_at_order_time.toFixed(2)}/ea)\n`;
      } else if (item.price_at_order_time > 0) {
        ticket += `    (RM ${item.price_at_order_time.toFixed(2)}/ea)\n`;
      }
      
      if (item.options_json) {
        try {
          const opts = JSON.parse(item.options_json);
          opts.forEach(opt => {
            const suffix = opt.delta > 0 ? `+RM ${parseFloat(opt.delta).toFixed(2)}` : '';
            const optionLines = wrapReceiptText(`> ${opt.option}${suffix}`, width - 4);
            optionLines.forEach(line => {
              ticket += `    ${line}\n`;
            });
          });
        } catch { /* ignore */ }
      }

      if (item.notes) {
        const noteText = `Note: ${item.notes}`;
        const noteLines = wrapReceiptText(noteText, width - 4);
        noteLines.forEach(line => ticket += `    ${line}\n`);
      }
    });
    
    ticket += `${sep}\n`;
    ticket += `Qty: ${totalQty}\n`;
    
    const subtotal = Number(order.total_price || 0);
    const serviceChargeRate = order.service_charge_rate || 0;
    const vatRate = order.vat_rate || 0;
    const serviceCharge = subtotal * serviceChargeRate;
    const sst = (subtotal + serviceCharge) * vatRate;
    const rawTotal = subtotal + sst + serviceCharge;
    const roundedTotal = Math.round(rawTotal * 20) / 20;
    const rounding = roundedTotal - rawTotal;
    
    const fmtMoney = (v) => v.toFixed(2).padStart(10, ' ');
    
    ticket += `Subtotal${' '.repeat(Math.max(0, width - 20))}${fmtMoney(subtotal)}\n`;
    if (serviceChargeRate > 0) {
      ticket += `Svc Chg${' '.repeat(Math.max(0, width - 23))}${fmtMoney(serviceCharge)}\n`;
    }
    if (vatRate > 0) {
      ticket += `SST${' '.repeat(Math.max(0, width - 20))}${fmtMoney(sst)}\n`;
    }
    ticket += `Rounding${' '.repeat(Math.max(0, width - 20))}${fmtMoney(rounding)}\n`;
    ticket += `${sep}\n`;
    
    ticket += `[BOLD]TOTAL (MYR)${' '.repeat(Math.max(0, width - 21))}${fmtMoney(roundedTotal)}\n`;
    ticket += `${sep}\n`;
    
    ticket += "\n";
    ticket += "[CENTER]~ Official Receipt ~\n";
    ticket += "[CENTER]Thank you!\n";
    ticket += "[CENTER]Visit us again\n";
    ticket += "\n\n";
    
    return ticket;
  },

  printChecklistTicket: async (order, itemsToPrint, isAddOn, copyNum) => {
    const copyTitle = copyNum === 1 ? "CUSTOMER COPY" : "KITCHEN COPY";
    const printerName = await getSelectedPrinter();
    if (!printerName) throw new Error("No printer is selected. Choose the active printer in Manager Settings.");
    const settings = await getPrinterSettings(printerName);
    const w = getPrintableCharacterColumns(settings.width, settings.marginLeft, settings.marginRight);
    const ticket = printerService.formatChecklistTicket(order, itemsToPrint, isAddOn, copyTitle, w);
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
    const settings = await getPrinterSettings(printerName);
    const w = getPrintableCharacterColumns(settings.width, settings.marginLeft, settings.marginRight);
    const ticket = printerService.formatFinalReceipt(order, cashierName, w);
    return await executePrintWithPrinter(ticket, `order_${order.id}_final`, printerName, {
      orderId: order.id,
      jobType: "final_receipt"
    });
  },

  printDailySalesReport: async (todayOrders) => {
    const printerName = await getSelectedPrinter();
    if (!printerName) throw new Error("No printer is selected. Choose the active printer in Manager Settings.");
    const settings = await getPrinterSettings(printerName);
    const w = getPrintableCharacterColumns(settings.width, settings.marginLeft, settings.marginRight);
    const sep = separator(w);
    const timestamp = formatDateTime(new Date());
    const todayDateStr = new Date().toLocaleDateString('en-GB');
    
    let ticket = "\n";
    ticket += "[CENTER][H1] DAILY SALES\n";
    ticket += "[CENTER]BP DRAGONFLY\n";
    ticket += `${sep}\n`;
    ticket += `Date: ${todayDateStr}\n`;
    ticket += `At: ${timestamp}\n`;
    ticket += `${sep}\n`;
    
    let totalSales = 0;
    todayOrders.forEach((order, index) => {
      const orderNum = order.daily_ticket_number || order.id;
      const price = Number(order.total_price || 0);
      totalSales += price;
      
      const label = `${index + 1}. #${orderNum}`;
      const priceStr = price.toFixed(2).padStart(10, ' ');
      ticket += `${label}${' '.repeat(Math.max(0, w - label.length - 10))}${priceStr}\n`;
    });
    
    ticket += `${sep}\n`;
    const totalLabel = "Total:";
    const totalValStr = totalSales.toFixed(2).padStart(10, ' ');
    ticket += `[BOLD]${totalLabel}${' '.repeat(Math.max(0, w - totalLabel.length - 10))}${totalValStr}\n`;
    ticket += `${sep}\n`;
    ticket += "\n\n";
    
    return await executePrintWithPrinter(ticket, `daily_sales_report`, printerName, {
      jobType: "daily_sales_report"
    });
  },

  printTestTicket: async (printerName) => {
    if (!printerName || !String(printerName).trim()) {
      throw new Error("Choose an installed printer queue before testing it.");
    }
    const settings = await getPrinterSettings(printerName);
    const columns = getPrintableCharacterColumns(settings.width, settings.marginLeft, settings.marginRight);
    const ticket = `TEST PRINT OK\nBP Dragonfly Garden\nPaper: ${settings.width} mm\nColumns: ${columns}\n`;
    return executeTicketPrint(ticket, "printer_test", printerName, false, {
      jobType: "test"
    });
  }
};

module.exports = { ...printerService, getReceiptCopyCounts, getPrinterSettings };