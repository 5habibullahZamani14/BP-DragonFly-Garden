/*
 * printerService.js — Thermal printer integration for order tickets.
 * Rewritten to support Advanced C# GDI Printing with Rich Text tags
 * and distinct receipt layouts (Checklist vs Final Bill).
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const centerText = (text) => {
  const pad = Math.max(0, Math.floor((32 - text.length) / 2));
  return ' '.repeat(pad) + text;
};

const printerService = {
  formatChecklistTicket: (order, itemsToPrint, isAddOn) => {
    const timestamp = new Date().toLocaleString('en-GB');
    let ticket = "";
    
    let orderTypeStr = isAddOn ? "ADD-ON" : "NEW ORDER";
    if (order.order_type === 'PICKUP') orderTypeStr = isAddOn ? "ADD-ON (PICKUP)" : "PICKUP";
    else if (order.order_type === 'DELIVERY') orderTypeStr = isAddOn ? "ADD-ON (DELIVERY)" : "DELIVERY";
    else if (order.order_type === 'TAKEAWAY') orderTypeStr = isAddOn ? "ADD-ON (TAKEAWAY)" : "TAKEAWAY";

    ticket += centerText(orderTypeStr) + "\n";
    
    const leftHeader = `${timestamp.substring(0, 16)}`;
    const rightHeader = `${order.id}`;
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
            // Handle edge case where a single word is longer than max width
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
      ticket += "                     [ ]\n"; // Checkbox on the right
      ticket += "----------------------------\n";
    });
    
    ticket += "\n\n.";
    return ticket;
  },

  formatFinalReceipt: (order, cashierName) => {
    const timestamp = new Date().toLocaleString('en-GB');
    let ticket = "";
    
    ticket += centerText("BP DragonFly") + "\n";
    ticket += centerText("FORMOSA ETEN SDN. BHD.") + "\n";
    ticket += centerText("REG NO: 201601030589") + "\n";
    ticket += centerText("SST NO: P11-1809-32000074") + "\n";
    ticket += centerText("NO. 6H-1-19, PENANG") + "\n";
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
    ticket += `ORDER ${order.id}\n`;
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
    const serviceCharge = subtotal * (order.service_charge_rate || 0.10);
    const sst = (subtotal + serviceCharge) * (order.vat_rate || 0.06);
    const rawTotal = subtotal + sst + serviceCharge;
    
    const roundedTotal = Math.round(rawTotal * 20) / 20;
    const rounding = roundedTotal - rawTotal;
    
    ticket += `Subtotal            ${subtotal.toFixed(2).padStart(8, ' ')}\n`;
    ticket += `SST (6%)            ${sst.toFixed(2).padStart(8, ' ')}\n`;
    ticket += `SERVICE CHARGE (10%)${serviceCharge.toFixed(2).padStart(8, ' ')}\n`;
    ticket += `Bill rounding       ${rounding.toFixed(2).padStart(8, ' ')}\n`;
    ticket += "----------------------------\n";
    
    ticket += `Total (MYR)         ${roundedTotal.toFixed(2).padStart(8, ' ')}\n`;
    ticket += "----------------------------\n";
    
    ticket += "\n";
    ticket += centerText("This is an official receipt") + "\n";
    ticket += centerText("Thank you for visiting us") + "\n";
    ticket += centerText("We hope to see you again!") + "\n";
    ticket += "\n\n.";
    
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

        // Generic Bluetooth drivers in Windows ignore standard \n and require \r\n
        const formattedTicket = ticket.replace(/(?<!\r)\n/g, "\r\n");

        const logsDir = path.join(__dirname, "../../logs");
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${filenamePrefix}_${timestamp}.txt`;
        const filepath = path.join(logsDir, filename);
        fs.writeFileSync(filepath, formattedTicket);

        // Native Windows Raw Printing via PowerShell (bypasses print_gdi.exe)
        // We MUST use -Raw so PowerShell preserves the \r\n line breaks!
        const proc = spawn("powershell.exe", ["-Command", `Get-Content -Path '${filepath}' -Raw | Out-Printer`], { shell: false });
        
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (data) => stdout += data);
        proc.stderr.on("data", (data) => stderr += data);
        
        proc.on("close", (code) => {
          if (code === 0) {
            resolve({ success: true, message: `Ticket printed natively`, filename });
          } else {
            reject({ success: false, message: "Native print failed", error: stderr || stdout });
          }
        });
        proc.on("error", (err) => reject({ success: false, message: "Native print command failed", error: err.message }));
      } catch (error) {
        reject({ success: false, message: "Error printing ticket", error: error.message });
      }
    })
};

module.exports = printerService;
