/*
 * printerService.js — Thermal printer integration for order tickets.
 * Rewritten to support Advanced C# GDI Printing with Rich Text tags
 * on Windows, and clean plain-text fallback on Linux (Raspberry Pi).
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const centerText = (text) => {
  const pad = Math.max(0, Math.floor((28 - text.length) / 2));
  return ' '.repeat(pad) + text;
};

/* Strips GDI tags and applies alignment manually for non-Windows (Linux/Raspberry Pi) raw print fallback. */
const stripGdiTags = (ticket) => {
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
        cleanLine = centerText(cleanLine);
      } else if (isRight) {
        cleanLine = cleanLine.padStart(28, ' ');
      }
      return cleanLine;
    })
    .join('\n');
};

const printerService = {
  formatChecklistTicket: (order, itemsToPrint, isAddOn) => {
    const timestamp = new Date().toLocaleString('en-GB');
    let ticket = "\n";
    
    let orderTypeStr = isAddOn ? "ADD-ON" : "NEW ORDER";
    if (order.order_type === 'PICKUP') orderTypeStr = isAddOn ? "ADD-ON (PICKUP)" : "PICKUP";
    else if (order.order_type === 'DELIVERY') orderTypeStr = isAddOn ? "ADD-ON (DELIVERY)" : "DELIVERY";
    else if (order.order_type === 'TAKEAWAY') orderTypeStr = isAddOn ? "ADD-ON (TAKEAWAY)" : "TAKEAWAY";

    ticket += `[CENTER][H1] ${orderTypeStr}\n`;
    
    const leftHeader = `${timestamp.substring(0, 16)}`;
    const rightHeader = `#${order.daily_ticket_number || order.id}`;
    ticket += `${leftHeader}${rightHeader.padStart(28 - leftHeader.length, ' ')}\n`;
    ticket += `Send by: Cashier\n`;
    
    if (!order.order_type || order.order_type === 'DINE_IN') {
      ticket += `Table: ${order.table_number}\n`;
    } else {
      if (order.customer_name) ticket += `Name: ${order.customer_name}\n`;
      if (order.customer_phone) ticket += `Phone: ${order.customer_phone}\n`;
      if (order.order_type === 'PICKUP' && order.collection_time) ticket += `Pickup At: ${order.collection_time}\n`;
      if (order.order_type === 'DELIVERY' && order.delivery_address) ticket += `Address: ${order.delivery_address}\n`;
    }
    ticket += "----------------------------\n";
    
    itemsToPrint.forEach(item => {
      // Pro Way: Clean and robust word wrapping
      const nameLines = [];
      const words = item.item_name.split(/\s+/);
      let curLine = "";
      
      for (const word of words) {
        if ((curLine + word).length > 22) {
          if (curLine) nameLines.push(curLine.trim());
          if (word.length > 22) {
            const chunks = word.match(/.{1,22}/g) || [];
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
          if ((curNote + nw).length > 28) {
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
      ticket += "----------------------------\n";
    });
    
    ticket += "\n\n";
    return ticket;
  },

  formatFinalReceipt: (order, cashierName) => {
    const timestamp = new Date().toLocaleString('en-GB');
    let ticket = "\n";
    
    ticket += "[CENTER][H1] BP DragonFly\n";
    ticket += "[CENTER]FORMOSA ETEN SDN. BHD.\n";
    ticket += "[CENTER]REG NO: 201601030589\n";
    ticket += "[CENTER]SST NO: P11-1809-32000074\n";
    ticket += "[CENTER]NO. 6H-1-19, PENANG\n";
    ticket += "----------------------------\n";
    
    ticket += `Invoice no: ${order.id}\n`;
    ticket += `Date: ${timestamp.substring(0, 16)}\n`;
    ticket += `Cashier: ${cashierName}\n`;
    if (!order.order_type || order.order_type === 'DINE_IN') {
      ticket += `Table: ${order.table_number}\n`;
    } else {
      ticket += `Order Type: ${order.order_type}\n`;
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
    ticket += "----------------------------\n";
    ticket += "Qty Item          Price(MYR)\n";
    ticket += "----------------------------\n";
    
    let totalQty = 0;
    
    order.items.forEach(item => {
      totalQty += item.quantity;
      const qtyStr = item.quantity.toString().padEnd(3, ' ');
      const nameStr = item.item_name.substring(0, 16).padEnd(16, ' ');
      const lineTotal = (item.quantity * item.price_at_order_time).toFixed(2);
      const priceStr = lineTotal.padStart(8, ' ');
      
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
            const optLine = `    > ${opt.option}${suffix}`.substring(0, 28);
            ticket += `${optLine}\n`;
          });
        } catch { /* ignore */ }
      }

      // Print item notes if present
      if (item.notes) {
        const noteWords = item.notes.split(' ');
        let curNote = "    Note: ";
        for (let nw of noteWords) {
          if ((curNote + nw).length > 28) {
            ticket += `${curNote.trimEnd()}\n`;
            curNote = "    " + nw + " ";
          } else {
            curNote += nw + " ";
          }
        }
        if (curNote.trim()) ticket += `${curNote.trimEnd()}\n`;
      }
    });
    
    ticket += "----------------------------\n";
    ticket += `Qty ${totalQty}\n`;
    
    const subtotal = Number(order.total_price || 0);
    const serviceChargeRate = order.service_charge_rate || 0;
    const vatRate = order.vat_rate || 0;
    const serviceCharge = subtotal * serviceChargeRate;
    const sst = (subtotal + serviceCharge) * vatRate;
    const rawTotal = subtotal + sst + serviceCharge;
    
    const roundedTotal = Math.round(rawTotal * 20) / 20;
    const rounding = roundedTotal - rawTotal;
    
    ticket += `Subtotal            ${subtotal.toFixed(2).padStart(8, ' ')}\n`;
    if (serviceChargeRate > 0) {
      const scLabel = `SERVICE CHARGE (${Math.round(serviceChargeRate * 100)}%)`;
      ticket += `${scLabel.padEnd(20, ' ')}${serviceCharge.toFixed(2).padStart(8, ' ')}\n`;
    }
    if (vatRate > 0) {
      const sstLabel = `SST (${Math.round(vatRate * 100)}%)`;
      ticket += `${sstLabel.padEnd(20, ' ')}${sst.toFixed(2).padStart(8, ' ')}\n`;
    }
    ticket += `Bill rounding       ${rounding.toFixed(2).padStart(8, ' ')}\n`;
    ticket += "----------------------------\n";
    
    ticket += `[BOLD]Total (MYR)         ${roundedTotal.toFixed(2).padStart(8, ' ')}\n`;
    ticket += "----------------------------\n";
    
    ticket += "\n";
    ticket += "[CENTER]This is an official receipt\n";
    ticket += "[CENTER]Thank you for visiting us\n";
    ticket += "[CENTER]We hope to see you again!\n";
    ticket += "\n\n";
    
    return ticket;
  },

  printChecklistTicket: async (order, itemsToPrint, isAddOn, copyNum) => {
    let ticket = printerService.formatChecklistTicket(order, itemsToPrint, isAddOn);
    if (copyNum === 1) {
      ticket = `[CENTER][BOLD]*** CUSTOMER COPY ***\n` + ticket;
    } else if (copyNum === 2) {
      ticket = `[CENTER][BOLD]*** KITCHEN COPY ***\n` + ticket;
    }
    return await printerService.executePrint(ticket, `order_${order.id}_checklist`);
  },

  printFinalReceipt: async (order, cashierName) => {
    const ticket = printerService.formatFinalReceipt(order, cashierName);
    return await printerService.executePrint(ticket, `order_${order.id}_final`);
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

        const cleanTicket = stripGdiTags(ticket);

        if (process.platform === "win32") {
          const formattedTicket = cleanTicket.replace(/(?<!\r)\n/g, "\r\n");
          fs.writeFileSync(filepath, formattedTicket);

          const printerName = "BP_DragonFly_Garden_Confirmed";
          const psCommand = `Get-Content -Path '${filepath}' -Raw | Out-Printer -Name '${printerName}'`;

          const proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { shell: false });
          let stdout = "";
          let stderr = "";
          proc.stdout.on("data", (data) => stdout += data);
          proc.stderr.on("data", (data) => stderr += data);
          
          proc.on("close", (code) => {
            if (code === 0) {
              resolve({ success: true, message: `Ticket printed natively on Windows`, filename });
            } else {
              reject({ success: false, message: "Windows native print failed", error: stderr || stdout });
            }
          });
          proc.on("error", (err) => reject({ success: false, message: "Windows native print execution failed", error: err.message }));
        } else {
          fs.writeFileSync(filepath, cleanTicket);

          const proc = spawn("lp", ["-d", "BP_DragonFly_Garden_Confirmed", filepath], { shell: false });
          let stdout = "";
          let stderr = "";
          proc.stdout.on("data", (data) => stdout += data);
          proc.stderr.on("data", (data) => stderr += data);
          
          proc.on("close", (code) => {
            if (code === 0) {
              resolve({ success: true, message: `Ticket printed natively on Linux`, filename });
            } else {
              reject({ success: false, message: "Linux native print failed", error: stderr || stdout });
            }
          });
          proc.on("error", (err) => reject({ success: false, message: "Linux native print command failed", error: err.message }));
        }
      } catch (error) {
        reject({ success: false, message: "Error printing ticket", error: error.message });
      }
    })
};

module.exports = printerService;
