const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const printerService = {
  formatTicket: (order) => {
    const timestamp = new Date().toLocaleString();

    let ticket = "";
    ticket += "================================\n";
    ticket += "      RESTAURANT ORDERS        \n";
    ticket += "================================\n\n";
    ticket += `Order #${order.id}\n`;
    ticket += `Table: ${order.table_number}\n`;
    ticket += `Time: ${timestamp}\n`;
    ticket += `Status: ${order.status}\n\n`;
    ticket += "--------------------------------\n";
    ticket += "ITEMS:\n";
    ticket += "--------------------------------\n";

    if (Array.isArray(order.items)) {
      order.items.forEach((item, index) => {
        const lineTotal = item.quantity * item.price_at_order_time;
        ticket += `${index + 1}. ${item.item_name}\n`;
        ticket += `   Qty: ${item.quantity} x $${item.price_at_order_time.toFixed(2)} = $${lineTotal.toFixed(2)}\n`;

        if (item.notes) {
          ticket += `   Note: ${item.notes}\n`;
        }
      });
    }

    ticket += "\n--------------------------------\n";
    ticket += `TOTAL: $${order.total_price.toFixed(2)}\n`;
    ticket += "--------------------------------\n\n";
    ticket += "Please prepare items above\n";
    ticket += "================================\n";

    return ticket;
  },

  printTicket: (order) =>
    new Promise((resolve, reject) => {
      try {
        const ticket = printerService.formatTicket(order);

        console.log("\n========== PRINTING TICKET ==========");
        console.log(ticket);
        console.log("=====================================\n");

        const logsDir = path.join(__dirname, "../../logs");
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `order_${order.id}_${timestamp}.txt`;
        const filepath = path.join(logsDir, filename);

        fs.writeFileSync(filepath, ticket);

        const printerCommand = process.env.PRINTER_COMMAND;

        if (!printerCommand) {
          resolve({
            success: true,
            message: `Ticket saved for order #${order.id}`,
            filename
          });
          return;
        }

        const printerProcess = spawn(printerCommand, {
          shell: true,
          stdio: ["pipe", "ignore", "pipe"]
        });

        let stderr = "";

        printerProcess.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        printerProcess.on("error", (processError) => {
          reject({
            success: false,
            message: "Error printing ticket",
            error: processError.message
          });
        });

        printerProcess.on("close", (code) => {
          if (code !== 0) {
            reject({
              success: false,
              message: "Printer command failed",
              error: stderr.trim() || `Exit code ${code}`
            });
            return;
          }

          resolve({
            success: true,
            message: `Ticket printed for order #${order.id}`,
            filename
          });
        });

        printerProcess.stdin.write(ticket);
        printerProcess.stdin.end();
      } catch (error) {
        reject({
          success: false,
          message: "Error printing ticket",
          error: error.message
        });
      }
    }),

  configurePrinter: (config) => {
    console.log("Printer configuration:", config);
    return true;
  }
};

module.exports = printerService;
