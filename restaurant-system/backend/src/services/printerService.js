/*
 * printerService.js — Thermal printer integration for order tickets.
 * Rewritten to support Advanced C# GDI Printing with Rich Text tags
 * on Windows, and clean plain-text fallback on Linux (Raspberry Pi).
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const db = require("../database/db");

const centerText = (text, width = 80) => {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
};

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
      width: 80,
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
        // No printer preferences at all, use defaults
        resolve(defaultSettings);
        return;
      }
      
      try {
        const prefs = JSON.parse(row.value);
        const printerProfiles = prefs.printer_profiles || {};
        const printerProfile = printerProfiles[printerName];
        
        if (printerProfile) {
          // Use printer-specific settings
          resolve({
            width: printerProfile.width || 80,
            delaySeconds: printerProfile.print_delay_seconds || 0,
            emptyLinesBefore: printerProfile.empty_lines_before || 2,
            emptyLinesAfter: printerProfile.empty_lines_after || 3,
            hasAutoCutter: printerProfile.has_auto_cutter || false
          });
        } else {
          // No printer-specific settings, use global defaults
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
        
        // If no selected printer, try default printer
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
const stripGdiTags = (ticket, width = 80) => {
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

/**
 * Format ticket with dynamic width based on printer settings
 */
const formatTicketWithWidth = (ticket, width) => {
  // This function is a placeholder for dynamic width formatting
  // The actual formatting is done in the ticket generation functions
  // which now use the width parameter directly
  return ticket;
};

const printerService = {
  formatChecklistTicket: (order, itemsToPrint, isAddOn, copyTitle) => {
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
    
    const leftHeader = `${timestamp}`;
    const rightHeader = `#${order.daily_ticket_number || order.id}`;
    ticket += `${leftHeader}${rightHeader.padStart(80 - leftHeader.length, ' ')}\n`;
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
    ticket += "================================================================================\n";
    
    itemsToPrint.forEach(item => {
      // Pro Way: Clean and robust word wrapping
      const nameLines = [];
      const words = item.item_name.split(/\s+/);
      let curLine = "";
      
      for (const word of words) {
        if ((curLine + word).length > 70) {
          if (curLine) nameLines.push(curLine.trim());
          if (word.length > 70) {
            const chunks = word.match(/.{1,70}/g) || [];
            nameLines.push(...chunks.slice(0, -1));
            curLine = chunks[chunks.length - 1] + " ";
          } else {
            curLine = word + " ";
          }
        } else {
          curLine += word + " ";
        }
      }
      if (curLine.trim()) nameLines.push(curLine.trim());

      const qtyStr = `${item.quantity}x`.padEnd(4, ' ');
      
      nameLines.forEach((line, idx) => {
        if (idx === 0) {
          ticket += `${qtyStr} ${line}\n`;
        } else {
          ticket += `     ${line}\n`;
        }
      });

      if (item.notes) {
        const noteWords = item.notes.split(' ');
        let curNote = "     Note: ";
        for (let nw of noteWords) {
          if ((curNote + nw).length > 80) {
            ticket += `${curNote.trimEnd()}\n`;
            curNote = "     " + nw + " ";
          } else {
            curNote += nw + " ";
          }
        }
        if (curNote.trim()) ticket += `${curNote.trimEnd()}\n`;
      }

      // Print selected options (modifiers/variations)
      if (item.options_json) {
        try {
          const opts = JSON.parse(item.options_json);
          opts.forEach(opt => {
            const suffix = opt.delta > 0 ? ` (+${parseFloat(opt.delta).toFixed(2)})` : '';
            ticket += `     > ${opt.option}${suffix}\n`;
          });
        } catch { /* ignore malformed JSON */ }
      }

      ticket += "[RIGHT][SQUARE]\n"; // Checkbox on the right
      ticket += "================================================================================\n";
    });
    
    ticket += "\n\n";
    return ticket;
  },

  formatFinalReceipt: (order, cashierName) => {
    const timestamp = formatDateTime(new Date());
    let ticket = "\n";
    
    ticket += "[CENTER][H1] BP DRAGONFLY GARDEN\n";
    ticket += "[CENTER]Solok Pondok Upih\n";
    ticket += "[CENTER]Taman Kristal, 11020 Balik Pulau\n";
    ticket += "[CENTER]Pulau Pinang\n";
    ticket += "================================================================================\n";
    
    ticket += `Invoice no: ${order.id}\n`;
    ticket += `Date & Time: ${timestamp}\n`;
    ticket += `Cashier: ${cashierName}\n`;
    if (!order.order_type || order.order_type === 'DINE_IN') {
      ticket += `${formatTableNumber(order.table_number)}\n`;
    } else {
      ticket += `Order Type: ${order.order_type}\n`;
      if (order.order_type === 'COUNTER' && order.table_id !== 999 && order.table_number && order.table_number !== 'Counter Order') {
        ticket += `${formatTableNumber(order.table_number)}\n`;
      }
      if (order.customer_name) ticket += `Customer: ${order.customer_name}\n`;
      if (order.order_type === 'DELIVERY' && order.delivery_address) {
        ticket += `Address: ${order.delivery_address}\n`;
      }
      if (order.order_type === 'PICKUP' && order.collection_time) {
        ticket += `Pickup Time: ${order.collection_time}\n`;
      }
    }
    ticket += "\n";
    ticket += `[H1] ORDER #${order.daily_ticket_number || order.id}\n`;
    ticket += "================================================================================\n";
    ticket += "Qty Item                            Price(MYR)\n";
    ticket += "================================================================================\n";
    
    let totalQty = 0;
    
    order.items.forEach(item => {
      totalQty += item.quantity;
      const qtyStr = item.quantity.toString().padEnd(3, ' ');
      const nameStr = item.item_name.substring(0, 40).padEnd(40, ' ');
      const lineTotal = (item.quantity * item.price_at_order_time).toFixed(2);
      const priceStr = lineTotal.padStart(15, ' ');
      
      ticket += `${qtyStr} ${nameStr}${priceStr}\n`;
      
      // Calculate price before and after variations
      let deltasSum = 0;
      let hasPriceDelta = false;
      if (item.options_json) {
        try {
          const opts = JSON.parse(item.options_json);
          opts.forEach(opt => {
            if (opt.delta) {
              deltasSum += parseFloat(opt.delta);
              hasPriceDelta = true;
            }
          });
        } catch {}
      }
      const basePrice = item.price_at_order_time - deltasSum;
      
      if (hasPriceDelta) {
        ticket += `    Price Before Var: RM ${basePrice.toFixed(2)}\n`;
        ticket += `    Price After Var:  RM ${item.price_at_order_time.toFixed(2)}\n`;
      } else {
        ticket += `    (Unit: RM ${item.price_at_order_time.toFixed(2)})\n`;
      }
      
      // Print selected options (modifiers/variations)
      if (item.options_json) {
        try {
          const opts = JSON.parse(item.options_json);
          opts.forEach(opt => {
            const suffix = opt.delta > 0 ? ` +RM ${parseFloat(opt.delta).toFixed(2)}` : '';
            const optLine = `    > ${opt.option}${suffix}`.substring(0, 80);
            ticket += `${optLine}\n`;
          });
        } catch { /* ignore */ }
      }

      // Print item notes if present
      if (item.notes) {
        const noteWords = item.notes.split(' ');
        let curNote = "    Note: ";
        for (let nw of noteWords) {
          if ((curNote + nw).length > 80) {
            ticket += `${curNote.trimEnd()}\n`;
            curNote = "    " + nw + " ";
          } else {
            curNote += nw + " ";
          }
        }
        if (curNote.trim()) ticket += `${curNote.trimEnd()}\n`;
      }
    });
    
    ticket += "================================================================================\n";
    ticket += `Qty ${totalQty}\n`;
    
    const subtotal = Number(order.total_price || 0);
    const serviceChargeRate = order.service_charge_rate || 0;
    const vatRate = order.vat_rate || 0;
    const serviceCharge = subtotal * serviceChargeRate;
    const sst = (subtotal + serviceCharge) * vatRate;
    const rawTotal = subtotal + sst + serviceCharge;
    
    const roundedTotal = Math.round(rawTotal * 20) / 20;
    const rounding = roundedTotal - rawTotal;
    
    ticket += `Subtotal                            ${subtotal.toFixed(2).padStart(15, ' ')}\n`;
    if (serviceChargeRate > 0) {
      const scLabel = `SERVICE CHARGE (${Math.round(serviceChargeRate * 100)}%)`;
      ticket += `${scLabel.padEnd(40, ' ')}${serviceCharge.toFixed(2).padStart(15, ' ')}\n`;
    }
    if (vatRate > 0) {
      const sstLabel = `SST (${Math.round(vatRate * 100)}%)`;
      ticket += `${sstLabel.padEnd(40, ' ')}${sst.toFixed(2).padStart(15, ' ')}\n`;
    }
    ticket += `Bill rounding                       ${rounding.toFixed(2).padStart(15, ' ')}\n`;
    ticket += "================================================================================\n";
    
    ticket += `[BOLD]Total (MYR)                       ${roundedTotal.toFixed(2).padStart(15, ' ')}\n`;
    ticket += "================================================================================\n";
    
    ticket += "\n";
    ticket += "[CENTER]This is an official receipt\n";
    ticket += "[CENTER]Thank you for visiting us\n";
    ticket += "[CENTER]We hope to see you again!\n";
    ticket += "\n\n";
    
    return ticket;
  },

  printChecklistTicket: async (order, itemsToPrint, isAddOn, copyNum) => {
    const copyTitle = copyNum === 1 ? "CUSTOMER COPY" : "KITCHEN COPY";
    const ticket = printerService.formatChecklistTicket(order, itemsToPrint, isAddOn, copyTitle);
    return await printerService.executePrint(ticket, `order_${order.id}_checklist`);
  },

  printFinalReceipt: async (order, cashierName) => {
    const ticket = printerService.formatFinalReceipt(order, cashierName);
    return await printerService.executePrint(ticket, `order_${order.id}_final`);
  },

  printDailySalesReport: async (todayOrders) => {
    const timestamp = formatDateTime(new Date());
    const todayDateStr = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
    
    let ticket = "\n";
    ticket += "[CENTER][H1] DAILY SALES REPORT\n";
    ticket += "[CENTER]BP DRAGONFLY GARDEN\n";
    ticket += "================================================================================\n";
    ticket += `Date: ${todayDateStr}\n`;
    ticket += `Printed At: ${timestamp}\n`;
    ticket += "================================================================================\n";
    
    let totalSales = 0;
    todayOrders.forEach((order, index) => {
      const orderNum = order.daily_ticket_number || order.id;
      const price = Number(order.total_price || 0);
      totalSales += price;
      
      const label = `${index + 1}. Order #${orderNum}`;
      const priceStr = `RM ${price.toFixed(2)}`;
      ticket += `${label.padEnd(40, ' ')}${priceStr.padStart(20, ' ')}\n`;
    });
    
    ticket += "================================================================================\n";
    const totalLabel = "Total Sales:";
    const totalValStr = `RM ${totalSales.toFixed(2)}`;
    ticket += `[BOLD]${totalLabel.padEnd(40, ' ')}${totalValStr.padStart(20, ' ')}\n`;
    ticket += "================================================================================\n";
    ticket += "\n\n";
    
    return await printerService.executePrint(ticket, `daily_sales_report`);
  },

  printTestTicket: async () => {
    let ticket = "\n";
    ticket += "[CENTER][H1] PRINTER TEST\n";
    ticket += "[CENTER]Width Test: 12345678901234567890123456789012345678901234567890123456789012345678901234567890\n";
    ticket += "================================================================================\n";
    ticket += "This is a test to verify printer width and spacing.\n";
    ticket += "================================================================================\n";
    ticket += "If you see large margins on left/right, check Windows printer settings.\n";
    ticket += "Set paper size to 80mm and minimize margins in printer properties.\n";
    ticket += "================================================================================\n";
    ticket += "\n\n";
    
    return await printerService.executePrint(ticket, `printer_test`);
  },

  executePrint: (ticket, filenamePrefix) =>
    new Promise((resolve, reject) => {
      try {
        console.log(`\n========== PRINTING ${filenamePrefix} ==========`);
        console.log(ticket);
        console.log("=====================================\n");

        const logsDir = path.join(__dirname, "../../logs");
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${filenamePrefix}_${timestamp}.txt`;
        const filepath = path.join(logsDir, filename);

        // Get the selected printer and its specific settings
        getSelectedPrinter()
          .then(printerName => {
            console.log(`Using printer: ${printerName}`);
            
            return getPrinterSettings(printerName).then(settings => ({ printerName, settings }));
          })
          .then(({ printerName, settings }) => {
            console.log(`Printer settings: width=${settings.width}, delay=${settings.delaySeconds}s, before=${settings.emptyLinesBefore} lines, after=${settings.emptyLinesAfter} lines, autoCutter=${settings.hasAutoCutter}`);
            
            // Format ticket with printer-specific width
            const cleanTicket = stripGdiTags(ticket, settings.width);
            
            // Add configurable empty lines before and after receipt
            const beforeLines = '\n'.repeat(settings.emptyLinesBefore);
            const afterLines = '\n'.repeat(settings.emptyLinesAfter);
            const finalTicket = beforeLines + cleanTicket + afterLines;
            
            console.log(`Ticket length: ${finalTicket.length} chars, before lines: ${settings.emptyLinesBefore}, after lines: ${settings.emptyLinesAfter}`);

            if (process.platform === "win32") {
              const formattedTicketCRLF = finalTicket.replace(/(?<!\r)\n/g, "\r\n");
              fs.writeFileSync(filepath, formattedTicketCRLF);

              const psCommand = `Get-Content -Path '${filepath}' -Raw | Out-Printer -Name '${printerName}'`;

              const proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { shell: false });
              let stdout = "";
              let stderr = "";
              proc.stdout.on("data", (data) => stdout += data);
              proc.stderr.on("data", (data) => stderr += data);
              
              proc.on("close", (code) => {
                if (code === 0) {
                  // Apply delay if configured and printer doesn't have auto-cutter
                  if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
                    setTimeout(() => {
                      resolve({ success: true, message: `Ticket printed on ${printerName} with ${settings.delaySeconds}s delay`, filename });
                    }, settings.delaySeconds * 1000);
                  } else {
                    resolve({ success: true, message: `Ticket printed on ${printerName}`, filename });
                  }
                } else {
                  reject({ success: false, message: "Windows native print failed", error: stderr || stdout });
                }
              });
              proc.on("error", (err) => reject({ success: false, message: "Windows native print execution failed", error: err.message }));
            } else {
              fs.writeFileSync(filepath, finalTicket);

              const proc = spawn("lp", ["-d", printerName, filepath], { shell: false });
              let stdout = "";
              let stderr = "";
              proc.stdout.on("data", (data) => stdout += data);
              proc.stderr.on("data", (data) => stderr += data);
              
              proc.on("close", (code) => {
                if (code === 0) {
                  // Apply delay if configured and printer doesn't have auto-cutter
                  if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
                    setTimeout(() => {
                      resolve({ success: true, message: `Ticket printed on ${printerName} with ${settings.delaySeconds}s delay`, filename });
                    }, settings.delaySeconds * 1000);
                  } else {
                    resolve({ success: true, message: `Ticket printed on ${printerName}`, filename });
                  }
                } else {
                  reject({ success: false, message: "Linux native print failed", error: stderr || stdout });
                }
              });
              proc.on("error", (err) => reject({ success: false, message: "Linux native print command failed", error: err.message }));
            }
          })
          .catch(err => {
            // Fallback to default printer if selected fails
            console.error("Error getting printer settings, using default:", err);
            const defaultPrinter = "BP_DragonFly_Garden_Confirmed";
            
            getPrinterSettings(defaultPrinter)
              .then(settings => {
                console.log(`Using default printer: ${defaultPrinter} with settings:`, settings);
                
                const cleanTicket = stripGdiTags(ticket, settings.width);
                const beforeLines = '\n'.repeat(settings.emptyLinesBefore);
                const afterLines = '\n'.repeat(settings.emptyLinesAfter);
                const finalTicket = beforeLines + cleanTicket + afterLines;
                
                console.log(`Fallback ticket length: ${finalTicket.length} chars, before lines: ${settings.emptyLinesBefore}, after lines: ${settings.emptyLinesAfter}`);

                if (process.platform === "win32") {
                  const formattedTicketCRLF = finalTicket.replace(/(?<!\r)\n/g, "\r\n");
                  fs.writeFileSync(filepath, formattedTicketCRLF);

                  const psCommand = `Get-Content -Path '${filepath}' -Raw | Out-Printer -Name '${defaultPrinter}'`;

                  const proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { shell: false });
                  let stdout = "";
                  let stderr = "";
                  proc.stdout.on("data", (data) => stdout += data);
                  proc.stderr.on("data", (data) => stderr += data);
                  
                  proc.on("close", (code) => {
                    if (code === 0) {
                      if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
                        setTimeout(() => {
                          resolve({ success: true, message: `Ticket printed on ${defaultPrinter} (fallback) with ${settings.delaySeconds}s delay`, filename });
                        }, settings.delaySeconds * 1000);
                      } else {
                        resolve({ success: true, message: `Ticket printed on ${defaultPrinter} (fallback)`, filename });
                      }
                    } else {
                      reject({ success: false, message: "Windows native print failed", error: stderr || stdout });
                    }
                  });
                  proc.on("error", (err) => reject({ success: false, message: "Windows native print execution failed", error: err.message }));
                } else {
                  fs.writeFileSync(filepath, finalTicket);

                  const proc = spawn("lp", ["-d", defaultPrinter, filepath], { shell: false });
                  let stdout = "";
                  let stderr = "";
                  proc.stdout.on("data", (data) => stdout += data);
                  proc.stderr.on("data", (data) => stderr += data);
                  
                  proc.on("close", (code) => {
                    if (code === 0) {
                      if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
                        setTimeout(() => {
                          resolve({ success: true, message: `Ticket printed on ${defaultPrinter} (fallback) with ${settings.delaySeconds}s delay`, filename });
                        }, settings.delaySeconds * 1000);
                      } else {
                        resolve({ success: true, message: `Ticket printed on ${defaultPrinter} (fallback)`, filename });
                      }
                    } else {
                      reject({ success: false, message: "Linux native print failed", error: stderr || stdout });
                    }
                  });
                  proc.on("error", (err) => reject({ success: false, message: "Linux native print command failed", error: err.message }));
                }
              })
              .catch(err => {
                reject({ success: false, message: "Error getting default printer settings", error: err.message });
              });
          });
      } catch (error) {
        reject({ success: false, message: "Error printing ticket", error: error.message });
      }
    })
};

module.exports = printerService;
module.exports.getReceiptCopyCounts = getReceiptCopyCounts;
