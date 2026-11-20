/*
 * printerService.js — Thermal printer integration for order tickets.
 * Sends Windows jobs through the installed printer driver and uses CUPS on Linux.
 * 
 * Updated with circuit breaker pattern for resilience.
 * 
 * Width handling:
 * - 80mm paper = ~48 characters per line
 * - 50mm paper = ~32 characters per line  
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

// Load thermalPrinterService with explicit error logging
let thermalPrinterService;
try {
  thermalPrinterService = require("./thermalPrinterService");
  console.log("[thermal] thermalPrinterService loaded successfully");
} catch (err) {
  console.error("[thermal] FAILED to load thermalPrinterService:", err.message);
  // Create a stub so the rest of the code doesn't crash
  thermalPrinterService = {
    convertTicketToEscPos: () => Buffer.from(""),
    addEmptyLines: (buf) => buf,
    sendRawToPrinter: () => Promise.reject(new Error("thermalPrinterService not loaded")),
    ensurePrinterShared: () => Promise.resolve(false),
    getPrinterShareName: () => Promise.resolve(""),
    getPrinterConnectionType: () => Promise.resolve("unknown"),
    shouldUseRawMode: () => false
  };
}

// Default width for 50mm thermal paper (32 chars). Can be overridden per printer.
const DEFAULT_PRINTER_WIDTH = 32;

const centerText = (text, width = DEFAULT_PRINTER_WIDTH) => {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
};

/**
 * Draw a separator line using the configured width
 */
const separator = (width = DEFAULT_PRINTER_WIDTH) => '='.repeat(Math.max(10, width));

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
          order_customer: globalCopies.order_customer || 1,
          order_kitchen: globalCopies.order_kitchen || 1,
          addon_customer: globalCopies.addon_customer || 1,
          addon_kitchen: globalCopies.addon_kitchen || 1,
          final_receipt: globalCopies.final_receipt || 1,
          daily_sales_report: globalCopies.daily_sales_report || 1
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
      width: DEFAULT_PRINTER_WIDTH,
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
        const printerProfiles = prefs.printer_profiles || {};
        const printerProfile = printerProfiles[printerName];
        
        if (printerProfile) {
          resolve({
            width: printerProfile.width || DEFAULT_PRINTER_WIDTH,
            marginLeft: printerProfile.margin_left || 0,
            marginRight: printerProfile.margin_right || 0,
            marginTop: printerProfile.margin_top || 0,
            marginBottom: printerProfile.margin_bottom || 0,
            delaySeconds: printerProfile.print_delay_seconds || 0,
            emptyLinesBefore: printerProfile.empty_lines_before || 2,
            emptyLinesAfter: printerProfile.empty_lines_after || 3,
            hasAutoCutter: printerProfile.has_auto_cutter || false
          });
        } else {
          resolve(defaultSettings);
        }
      } catch (e) {
        console.error("Error parsing printer preferences:", e);
        resolve(defaultSettings);
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
        const selectedPrinter = row ? row.value : null;
        
        if (!selectedPrinter) {
          db.get("SELECT value FROM restaurant_settings WHERE key = 'default_printer'", (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row ? row.value : "BP_DragonFly_Garden_Confirmed");
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

/* Strips GDI tags and applies alignment manually for non-Windows (Linux/Raspberry Pi) raw print fallback. */
const stripGdiTags = (ticket, width = DEFAULT_PRINTER_WIDTH) => {
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

      if (isCenter) {
        cleanLine = centerText(cleanLine, width);
      } else if (isRight) {
        cleanLine = cleanLine.padStart(width, ' ');
      }
      return cleanLine;
    })
    .join('\n');
};

// ── Dynamic width helper ─────────────────────────────────────────────
// All ticket formatters now accept an optional 'width' parameter.
// The print functions resolve the printer's configured width and pass it
// to the formatters, so separators, padding, and text wrapping all fit
// the actual paper size (50mm = 32 chars, 80mm = 48 chars).

/**
 * Format a ticket line with proper padding for a given width.
 * Wraps long text to fit within the available space.
 */
const wrapText = (text, maxWidth) => {
  if (!text || text.length <= maxWidth) return [text || ''];
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > maxWidth) {
      if (cur) lines.push(cur.trim());
      cur = word.length > maxWidth ? word.substring(0, maxWidth) : word;
    } else {
      cur = cur ? cur + ' ' + word : word;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
};

const formatTicketForPrinter = (ticket, settings, skipMargins = false) => {
  if (skipMargins) return ticket;

  const leftMargin = ' '.repeat(settings.marginLeft);
  const topMargin = '\n'.repeat(settings.marginTop);
  const bottomMargin = '\n'.repeat(settings.marginBottom);
  const effectiveWidth = settings.width - settings.marginLeft - settings.marginRight;
  const cleanTicket = stripGdiTags(ticket, effectiveWidth > 0 ? effectiveWidth : settings.width);
  const ticketWithMargins = cleanTicket.split('\n').map(line => leftMargin + line).join('\n');
  const beforeLines = topMargin + '\n'.repeat(settings.emptyLinesBefore);
  const afterLines = '\n'.repeat(settings.emptyLinesAfter) + bottomMargin;
  return beforeLines + ticketWithMargins + afterLines;
};

const submitPrintJob = async (ticket, printerName, filename, settings) => {
  let result;
  if (process.platform === 'win32') {
    result = await submitWindowsPrintJob(ticket, printerName, filename);
  } else {
    const logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const filepath = path.join(logsDir, filename);
    fs.writeFileSync(filepath, ticket, 'utf8');

    result = await new Promise((resolve, reject) => {
      const proc = spawn('lp', ['-d', printerName, filepath], { shell: false });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', data => { stdout += data; });
      proc.stderr.on('data', data => { stderr += data; });
      proc.once('close', code => {
        if (code === 0) {
          resolve({
            success: true,
            message: `Print job submitted to ${printerName}`,
            filename,
            method: 'lp'
          });
        } else {
          reject(new Error(stderr.trim() || stdout.trim() || `lp command failed (exit code ${code})`));
        }
      });
      proc.once('error', error => reject(new Error(`Could not start lp: ${error.message}`)));
    });
  }

  if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
    await new Promise(resolve => setTimeout(resolve, settings.delaySeconds * 1000));
  }
  return result;
};

const executeTicketPrint = async (ticket, filenamePrefix, printerName, isTestPrint) => {
  const settings = await getPrinterSettings(printerName);
  const filename = `${filenamePrefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  const finalTicket = formatTicketForPrinter(ticket, settings, isTestPrint);
  console.log(`Submitting ${filenamePrefix} print job to ${printerName}`);
  return submitPrintJob(finalTicket, printerName, filename, settings);
};

const _executePrintWithPrinter = async (ticket, filenamePrefix, printerName) => {
  if (!printerName || !String(printerName).trim()) {
    throw new Error('A printer must be selected before printing');
  }
  return executeTicketPrint(ticket, filenamePrefix, printerName, filenamePrefix === 'printer_test');
};

const _executePrint = async (ticket, filenamePrefix) => {
  const printerName = await getSelectedPrinter();
  if (!printerName || !String(printerName).trim()) {
    throw new Error('No default printer is selected');
  }
  return executeTicketPrint(ticket, filenamePrefix, printerName, filenamePrefix === 'printer_test');
};
const executePrintWithPrinter = async (ticket, filenamePrefix, printerName) => {
  const breaker = withCircuitBreaker('printer', _executePrintWithPrinter, {
    failureThreshold: 3,
    timeoutMs: 60000,
    successThreshold: 2
  });
  return breaker(ticket, filenamePrefix, printerName);
};

/**
 * executePrint - Wrapped with circuit breaker for resilience.
 */
const executePrint = async (ticket, filenamePrefix) => {
  const breaker = withCircuitBreaker('printer', _executePrint, {
    failureThreshold: 3,
    timeoutMs: 60000,
    successThreshold: 2
  });
  return breaker(ticket, filenamePrefix);
};

// ── Ticket Formatting Functions ──────────────────────────────────────────
// ALL formatters accept a 'width' parameter (defaults to DEFAULT_PRINTER_WIDTH = 32 for 50mm).
// The separator lines, text wrapping, padding, and alignment all use this width.

const printerService = {
  formatChecklistTicket: (order, itemsToPrint, isAddOn, copyTitle, width = DEFAULT_PRINTER_WIDTH) => {
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
      const nameLines = wrapText(item.item_name, nameMax);
      const qtyStr = `${item.quantity}x`.padEnd(4, ' ');
      
      nameLines.forEach((line, idx) => {
        if (idx === 0) {
          ticket += `${qtyStr} ${line}\n`;
        } else {
          ticket += `     ${line}\n`;
        }
      });

      if (item.notes) {
        const noteLines = wrapText(`Note: ${item.notes}`, width - 5);
        noteLines.forEach(line => ticket += `     ${line}\n`);
      }

      if (item.options_json) {
        try {
          const opts = JSON.parse(item.options_json);
          opts.forEach(opt => {
            const suffix = opt.delta > 0 ? ` (+${parseFloat(opt.delta).toFixed(2)})` : '';
            const optText = `> ${opt.option}${suffix}`;
            const optLines = wrapText(optText, width - 5);
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

  formatFinalReceipt: (order, cashierName, width = DEFAULT_PRINTER_WIDTH) => {
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
      
      // Item name truncated to fit
      const nameMax = width - 15; // room for "3 xxx...xxx  RM12.50"
      const nameStr = item.item_name.substring(0, nameMax).padEnd(nameMax, ' ');
      const priceStr = lineTotal.padStart(8, ' ');
      
      ticket += `${qtyStr} ${nameStr}${priceStr}\n`;
      
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
            ticket += `    > ${opt.option}${suffix}\n`.substring(0, width);
            ticket += '\n';
          });
        } catch { /* ignore */ }
      }

      if (item.notes) {
        const noteText = `Note: ${item.notes}`;
        const noteLines = wrapText(noteText, width - 4);
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
    const settings = await getPrinterSettings(printerName);
    const effectiveWidth = settings.width - settings.marginLeft - settings.marginRight;
    const w = effectiveWidth > 0 ? effectiveWidth : settings.width;
    const ticket = printerService.formatChecklistTicket(order, itemsToPrint, isAddOn, copyTitle, w);
    return await executePrint(ticket, `order_${order.id}_checklist`);
  },

  printFinalReceipt: async (order, cashierName) => {
    const printerName = await getSelectedPrinter();
    const settings = await getPrinterSettings(printerName);
    const effectiveWidth = settings.width - settings.marginLeft - settings.marginRight;
    const w = effectiveWidth > 0 ? effectiveWidth : settings.width;
    const ticket = printerService.formatFinalReceipt(order, cashierName, w);
    return await executePrint(ticket, `order_${order.id}_final`);
  },

  printDailySalesReport: async (todayOrders) => {
    const printerName = await getSelectedPrinter();
    const settings = await getPrinterSettings(printerName);
    const width = settings.width - settings.marginLeft - settings.marginRight;
    const w = width > 0 ? width : DEFAULT_PRINTER_WIDTH;
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
    
    return await executePrint(ticket, `daily_sales_report`);
  },

  printTestTicket: async (printerName) => {
    const ticket = `TEST PRINT OK\nBP Dragonfly Garden\nWidth: ${DEFAULT_PRINTER_WIDTH}\n`;
    if (printerName) {
      return await executePrintWithPrinter(ticket, `printer_test`, printerName);
    }
    return await executePrint(ticket, `printer_test`);
  }
};

module.exports = { ...printerService, getReceiptCopyCounts, getPrinterSettings };