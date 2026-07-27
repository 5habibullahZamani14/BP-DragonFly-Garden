const fs = require('fs');
const file = 'c:\\Anything Important\\BP-DragonFly-Garden\\frontend\\src\\components\\garden\\management\\SettingsTab.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
const newLines = [];
let inPrinterContent = false;
let foundAccordionContent = false;
let skipUntil = -1;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Find the printer accordion content
  if (line.includes('AccordionContent') && lines[i-1] && lines[i-1].includes('Printer Management')) {
    foundAccordionContent = true;
    inPrinterContent = true;
    newLines.push(line);
    newLines.push('          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">');
    newLines.push('            {/* Left Column: Printer Settings & Receipt Copies */}');
    newLines.push('            <div className="lg:col-span-2 space-y-6">');
    continue;
  }
  
  // Skip everything in the old printer content until we find the closing AccordionContent
  if (inPrinterContent && line.includes('AccordionContent') && line.includes('</')) {
    inPrinterContent = false;
    newLines.push('            </div>');
    newLines.push('            {/* Right Column: Ticket Preview */}');
    newLines.push('            <div className="lg:col-span-1 space-y-4">');
    newLines.push('              <div className="bg-gray-50 border rounded-lg p-4 sticky top-4">');
    newLines.push('                <h4 className="font-semibold text-sm mb-3">Ticket Preview</h4>');
    newLines.push('                <div className="bg-white border rounded p-3 text-xs font-mono" style={{ maxWidth: `${paperWidth * 2}px`, margin: "0 auto" }}>');
    newLines.push('                  <div className="text-center font-bold mb-2">BP DRAGONFLY GARDEN</div>');
    newLines.push('                  <div className="text-center text-gray-600 mb-2">Test Receipt</div>');
    newLines.push('                  <div className="border-t border-dashed my-2"></div>');
    newLines.push('                  <div className="flex justify-between">');
    newLines.push('                    <span>Item 1</span>');
    newLines.push('                    <span>$10.00</span>');
    newLines.push('                  </div>');
    newLines.push('                  <div className="flex justify-between">');
    newLines.push('                    <span>Item 2</span>');
    newLines.push('                    <span>$15.00</span>');
    newLines.push('                  </div>');
    newLines.push('                  <div className="border-t border-dashed my-2"></div>');
    newLines.push('                  <div className="flex justify-between font-bold">');
    newLines.push('                    <span>Total</span>');
    newLines.push('                    <span>$25.00</span>');
    newLines.push('                  </div>');
    newLines.push('                  <div className="text-center text-gray-600 mt-2">Thank you!</div>');
    newLines.push('                </div>');
    newLines.push('                <p className="text-xs text-muted-foreground mt-2">Preview based on {paperWidth}mm width and current margins.</p>');
    newLines.push('              </div>');
    newLines.push('            </div>');
    newLines.push('          </div>');
    newLines.push('          {/* Bottom Section: Daily Sales Reports */}');
    newLines.push('          <div className="pt-6 border-t space-y-4">');
    newLines.push('            <h4 className="font-semibold text-sm">Daily Sales Reports</h4>');
    newLines.push('            <p className="text-xs text-muted-foreground">Print current day\'s sales report on demand.</p>');
    newLines.push('            <div className="flex gap-2">');
    newLines.push('              <Button');
    newLines.push('                onClick={printDailySalesReport}');
    newLines.push('                disabled={printingDailyReport}');
    newLines.push('                className="bg-blue-700 hover:bg-blue-800 text-white flex gap-2"');
    newLines.push('              >');
    newLines.push('                {printingDailyReport ? <><Loader2 className="h-4 w-4 animate-spin" /> Printing...</>');
    newLines.push('                  : <><FileText className="h-4 w-4" /> Print Daily Sales Report</>');
    newLines.push('                }');
    newLines.push('              </Button>');
    newLines.push('              <Button');
    newLines.push('                onClick={printTestTicket}');
    newLines.push('                disabled={printingTestTicket}');
    newLines.push('                variant="outline"');
    newLines.push('                className="flex gap-2"');
    newLines.push('              >');
    newLines.push('                {printingTestTicket ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing...</>');
    newLines.push('                  : <><Printer className="h-4 w-4" /> Print Test Ticket</>');
    newLines.push('                }');
    newLines.push('              </Button>');
    newLines.push('            </div>');
    newLines.push('            <p className="text-xs text-muted-foreground">Use Test Ticket to verify printer width and spacing before printing actual receipts.</p>');
    newLines.push('          </div>');
    newLines.push('          <div className="flex justify-end pt-4">');
    newLines.push('            <Button');
    newLines.push('              onClick={savePrinterSettings}');
    newLines.push('              disabled={printerSettingsLoading}');
    newLines.push('              className="bg-green-700 hover:bg-green-800 text-white flex gap-2"');
    newLines.push('            >');
    newLines.push('              {printerSettingsLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>');
    newLines.push('                : printerSettingsSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved</>');
    newLines.push('                : "Save Printer Settings"}');
    newLines.push('            </Button>');
    newLines.push('          </div>');
    newLines.push(line);
    continue;
  }
  
  // Skip all lines inside the printer accordion content
  if (inPrinterContent) {
    continue;
  }
  
  newLines.push(line);
}

fs.writeFileSync(file, newLines.join('\n'));
console.log('Complete restructure done');
