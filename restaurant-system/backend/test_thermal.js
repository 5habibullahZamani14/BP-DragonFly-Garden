const ThermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;

let printer = new ThermalPrinter({
  type: PrinterTypes.EPSON,
  interface: "\\\\localhost\\BP_DragonFly_Garden_Confirmed"
});

printer.alignCenter();
printer.println("NODE THERMAL PRINTER TEST");
printer.cut();

printer.execute().then(() => {
  console.log("Print done!");
}).catch((err) => {
  console.error("Print failed:", err);
});
