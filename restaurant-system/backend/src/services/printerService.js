/*
 * printerService.js — Thermal printer integration for order tickets.
 * Rewritten to support Advanced C# GDI Printing with Rich Text tags
 * and distinct receipt layouts (Checklist vs Final Bill).
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const printerService = {
  formatChecklistTicket: (order, itemsToPrint, isAddOn) => {
    const timestamp = new Date().toLocaleString('en-GB');
    let ticket = "\n";
    
    ticket += `[CENTER]No. 1/1\n`;
    ticket += `[CENTER][H1] ${isAddOn ? "ADD-ON" : "NEW ORDER"}\n`;
    
    const leftHeader = `${timestamp.substring(0, 16)}`;
    const rightHeader = `${order.id}`;
    ticket += `${leftHeader}${rightHeader.padStart(28 - leftHeader.length, ' ')}\n`;
    ticket += `Send by: Cashier\n`;
    ticket += `Table: ${order.table_number}\n`;
    ticket += "----------------------------\n";
    
    itemsToPrint.forEach(item => {
      
      const words = item.item_name.split(' ');
      const nameLines = [];
      let curLine = "";
      for (let w of words) {
         if ((curLine + w).length > 22) {
            if (curLine) nameLines.push(curLine.trim());
            while (w.length > 22) {
               nameLines.push(w.substring(0, 22));
               w = w.substring(22);
            }
            curLine = w + " ";
         } else {
            curLine += w + " ";
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
        // Wrap notes too
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
      ticket += `[RIGHT][SQUARE]\n`;
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
    ticket += `Table: ${order.table_number}\n`;
    ticket += "\n";
    ticket += `[H1] ORDER ${order.id}\n`;
    ticket += "----------------------------\n";
    ticket += "Qty Item          Price(MYR)\n";
    ticket += "----------------------------\n";
    
    let totalQty = 0;
    
    order.items.forEach(item => {
      totalQty += item.quantity;
      const qtyStr = item.quantity.toString().padEnd(3, ' ');
      // 28 chars total. Qty(3)+space(1)+name(16)+price(8) = 28 chars
      const nameStr = item.item_name.substring(0, 16).padEnd(16, ' ');
      const lineTotal = (item.quantity * item.price_at_order_time).toFixed(2);
      const priceStr = lineTotal.padStart(8, ' ');
      
      ticket += `${qtyStr} ${nameStr}${priceStr}\n`;
      ticket += `    (${item.price_at_order_time.toFixed(2)})\n`;
    });
    
    ticket += "----------------------------\n";
    ticket += `Qty ${totalQty}\n`;
    
    const subtotal = Number(order.total_price || 0);
    const sst = subtotal * (order.vat_rate || 0.06);
    const serviceCharge = subtotal * (order.service_charge_rate || 0.10);
    const rawTotal = subtotal + sst + serviceCharge;
    
    const roundedTotal = Math.round(rawTotal * 20) / 20;
    const rounding = roundedTotal - rawTotal;
    
    ticket += `Subtotal            ${subtotal.toFixed(2).padStart(8, ' ')}\n`;
    ticket += `SST (6%)            ${sst.toFixed(2).padStart(8, ' ')}\n`;
    ticket += `SERVICE CHARGE (10%)${serviceCharge.toFixed(2).padStart(8, ' ')}\n`;
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

  printChecklistTicket: async (order, itemsToPrint, isAddOn) => {
    const ticket = printerService.formatChecklistTicket(order, itemsToPrint, isAddOn);
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
        fs.writeFileSync(filepath, ticket);

        const exePath = "C:\\Anything Important\\BP-DragonFly-Garden\\print_gdi.exe";
        const printerName = "BP_DragonFly_Garden_Confirmed";
        
        const proc = spawn(exePath, [filepath, printerName], { shell: false });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (data) => stdout += data);
        proc.stderr.on("data", (data) => stderr += data);
        
        proc.on("close", (code) => {
          if (code === 0 && stdout.includes("Success")) {
            resolve({ success: true, message: `Ticket printed`, filename });
          } else {
            reject({ success: false, message: "Printer command failed", error: `Code: ${code}, Stdout: ${stdout}, Stderr: ${stderr}` });
          }
        });
        proc.on("error", (err) => reject({ success: false, message: "Printer command failed", error: err.message }));
      } catch (error) {
        reject({ success: false, message: "Error printing ticket", error: error.message });
      }
    })
};

module.exports = printerService;
