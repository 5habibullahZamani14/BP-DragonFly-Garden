const fs = require('fs');
const file = 'c:\\Anything Important\\BP-DragonFly-Garden\\frontend\\src\\components\\garden\\management\\SettingsTab.tsx';
const content = fs.readFileSync(file, 'utf8');

// Find the printer accordion section and replace it
const startMarker = 'AccordionItem value="printers"';
const endMarker = 'AccordionItem value="profile"';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.log('Could not find printer section markers');
  console.log('Start index:', startIndex, 'End index:', endIndex);
  process.exit(1);
}

const before = content.substring(0, startIndex);
const after = content.substring(endIndex);

const newPrinterSection = `AccordionItem value="printers" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Printer Management</h3>
            <p className="text-sm text-muted-foreground font-normal">Discover, test, and configure printers for order receipts and kitchen tickets.</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Printer Settings & Receipt Copies */}
            <div className="lg:col-span-2 space-y-6">
              {/* Platform Info */}
              {platformInfo && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-800">
                    Platform: {platformInfo.platform} ({platformInfo.arch}) | Host: {platformInfo.hostname}
                  </p>
                </div>
              )}

              {/* Discover Printers Button */}
              <div className="flex gap-3">
                <Button 
                  onClick={() => {
                    setHasAutoDiscovered(false);
                    discoverPrinters();
                  }} 
                  disabled={printersLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white flex gap-2"
                >
                  {printersLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Refreshing...</> : <><RefreshCw className="h-4 w-4" /> Refresh Printers</>}
                </Button>
              </div>

              {/* Error Message */}
              {printerError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800">{printerError}</p>
                </div>
              )}

              {/* Printer List */}
              {printers.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm">Available Printers ({printers.length})</h4>
                  <div className="space-y-2">
                    {printers.map((printer, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              {getConnectionIcon(printer.connectionType)}
                              <span className="font-medium text-sm">{printer.name}</span>
                              <span className={\`text-xs px-2 py-0.5 rounded-full \${
                                printer.status === 'online' || printer.status === 'idle' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-red-100 text-red-700'
                              }\`}>
                                {printer.status}
                              </span>
                            </div>
                            <div className="space-y-1 text-xs text-gray-600">
                              <p><span className="font-medium">Driver:</span> {printer.driver || 'N/A'}</p>
                              <p><span className="font-medium">Connection:</span> {printer.connectionType.toUpperCase()}</p>
                              {printer.port && <p><span className="font-medium">Port:</span> {printer.port}</p>}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => testPrinter(printer.name)}
                            disabled={testPrintLoading === printer.name}
                            className="shrink-0"
                          >
                            {testPrintLoading === printer.name ? (
                              <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Testing...</>
                            ) : (
                              <><Printer className="h-3 w-3 mr-1" /> Test Print</>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Printer Settings */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold text-sm">Printer Settings</h4>
                
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Selected Printer (Active)</Label>
                    <Select value={selectedPrinter} onValueChange={(value) => {
                      setSelectedPrinter(value);
                      // Load profile for newly selected printer
                      if (printerProfiles[value]) {
                        setSelectedPrinterProfile(printerProfiles[value]);
                        setPrintDelaySeconds(printerProfiles[value].print_delay_seconds || 0);
                        setEmptyLinesBefore(printerProfiles[value].empty_lines_before || 2);
                        setEmptyLinesAfter(printerProfiles[value].empty_lines_after || 3);
                        setPaperWidth(printerProfiles[value].width || 80);
                        setMarginLeft(printerProfiles[value].margin_left || 0);
                        setMarginRight(printerProfiles[value].margin_right || 0);
                        setMarginTop(printerProfiles[value].margin_top || 0);
                        setMarginBottom(printerProfiles[value].margin_bottom || 0);
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a printer" />
                      </SelectTrigger>
                      <SelectContent>
                        {printers.map((printer, index) => (
                          <SelectItem key={index} value={printer.name}>
                            {printer.name} ({printer.connectionType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">This printer will be used for all printing operations.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Default Printer (Fallback)</Label>
                    <Select value={defaultPrinter} onValueChange={setDefaultPrinter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select default printer" />
                      </SelectTrigger>
                      <SelectContent>
                        {printers.map((printer, index) => (
                          <SelectItem key={index} value={printer.name}>
                            {printer.name} ({printer.connectionType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Used if selected printer is unavailable.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Print Delay (seconds)</Label>
                    <Input 
                      type="number" 
                      min="0" 
                      max="60"
                      value={printDelaySeconds}
                      onChange={(e) => setPrintDelaySeconds(parseInt(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">Delay between receipts (0 = no delay). Useful for printers without auto-cutter.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Empty Lines Before Receipt</Label>
                      <Input 
                        type="number" 
                        min="0" 
                        max="10"
                        value={emptyLinesBefore}
                        onChange={(e) => setEmptyLinesBefore(parseInt(e.target.value) || 0)}
                      />
                      <p className="text-xs text-muted-foreground">Spacing before printing.</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Empty Lines After Receipt</Label>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={emptyLinesAfter}
                        onChange={(e) => setEmptyLinesAfter(parseInt(e.target.value) || 0)}
                      />
                      <p className="text-xs text-muted-foreground">Spacing after printing.</p>
                    </div>
                  </div>

                  {/* Paper Width Configuration */}
                  <div className="space-y-2 pt-4 border-t">
                    <Label>Paper Width (mm)</Label>
                    <div className="flex gap-2">
                      <Select value={paperWidth.toString()} onValueChange={(value) => {
                        if (value === "custom") {
                          setPaperWidth(parseInt(customWidth) || 80);
                        } else {
                          setPaperWidth(parseInt(value));
                          setCustomWidth("");
                        }
                      }}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Select width" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="45">45mm</SelectItem>
                          <SelectItem value="50">50mm</SelectItem>
                          <SelectItem value="58">58mm</SelectItem>
                          <SelectItem value="80">80mm</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      {paperWidth.toString() === "custom" && (
                        <Input
                          type="number"
                          placeholder="Custom mm"
                          value={customWidth}
                          onChange={(e) => {
                            setCustomWidth(e.target.value);
                            setPaperWidth(parseInt(e.target.value) || 80);
                          }}
                          className="flex-1"
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Select standard thermal paper width or enter custom width in millimeters.</p>
                  </div>

                  {/* Margin Configuration */}
                  <div className="space-y-2 pt-4 border-t">
                    <Label>Paper Margins</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Left Margin (characters)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="20"
                          value={marginLeft}
                          onChange={(e) => setMarginLeft(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Right Margin (characters)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="20"
                          value={marginRight}
                          onChange={(e) => setMarginRight(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Top Margin (lines)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="10"
                          value={marginTop}
                          onChange={(e) => setMarginTop(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Bottom Margin (lines)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="10"
                          value={marginBottom}
                          onChange={(e) => setMarginBottom(parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Adjust margins to fine-tune print positioning. Left/right margins are in characters, top/bottom in lines.</p>
                  </div>
                </div>
              </div>

              {/* Receipt Copy Counts */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold text-sm">Receipt Copy Counts</h4>
                <p className="text-xs text-muted-foreground">Set how many copies of each receipt type to print globally.</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Order Receipt (Customer)</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      max="5"
                      value={orderCustomerCopies}
                      onChange={(e) => setOrderCustomerCopies(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Order Receipt (Kitchen)</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      max="5"
                      value={orderKitchenCopies}
                      onChange={(e) => setOrderKitchenCopies(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Add-on Receipt (Customer)</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      max="5"
                      value={addonCustomerCopies}
                      onChange={(e) => setAddonCustomerCopies(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Add-on Receipt (Kitchen)</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      max="5"
                      value={addonKitchenCopies}
                      onChange={(e) => setAddonKitchenCopies(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Final Receipt</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      max="5"
                      value={finalReceiptCopies}
                      onChange={(e) => setFinalReceiptCopies(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Daily Sales Report</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      max="5"
                      value={dailySalesReportCopies}
                      onChange={(e) => setDailySalesReportCopies(parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Ticket Preview */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-gray-50 border rounded-lg p-4 sticky top-4">
                <h4 className="font-semibold text-sm mb-3">Ticket Preview</h4>
                <div className="bg-white border rounded p-3 text-xs font-mono" style={{ maxWidth: \`\${paperWidth * 2}px\`, margin: "0 auto" }}>
                  <div className="text-center font-bold mb-2">BP DRAGONFLY GARDEN</div>
                  <div className="text-center text-gray-600 mb-2">Test Receipt</div>
                  <div className="border-t border-dashed my-2"></div>
                  <div className="flex justify-between">
                    <span>Item 1</span>
                    <span>$10.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Item 2</span>
                    <span>$15.00</span>
                  </div>
                  <div className="border-t border-dashed my-2"></div>
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>$25.00</span>
                  </div>
                  <div className="text-center text-gray-600 mt-2">Thank you!</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Preview based on {paperWidth}mm width and current margins.</p>
              </div>
            </div>
          </div>

          {/* Bottom Section: Daily Sales Reports */}
          <div className="pt-6 border-t space-y-4">
            <h4 className="font-semibold text-sm">Daily Sales Reports</h4>
            <p className="text-xs text-muted-foreground">Print current day's sales report on demand.</p>
            <div className="flex gap-2">
              <Button 
                onClick={printDailySalesReport} 
                disabled={printingDailyReport}
                className="bg-blue-700 hover:bg-blue-800 text-white flex gap-2"
              >
                {printingDailyReport ? <><Loader2 className="h-4 w-4 animate-spin" /> Printing...</>
                  : <><FileText className="h-4 w-4" /> Print Daily Sales Report</>
                }
              </Button>
              <Button 
                onClick={printTestTicket} 
                disabled={printingTestTicket}
                variant="outline"
                className="flex gap-2"
              >
                {printingTestTicket ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing...</>
                  : <><Printer className="h-4 w-4" /> Print Test Ticket</>
                }
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Use Test Ticket to verify printer width and spacing before printing actual receipts.</p>
          </div>
          <div className="flex justify-end pt-4">
            <Button 
              onClick={savePrinterSettings} 
              disabled={printerSettingsLoading}
              className="bg-green-700 hover:bg-green-800 text-white flex gap-2"
            >
              {printerSettingsLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                : printerSettingsSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved</>
                : "Save Printer Settings"}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>`;

const newContent = before + newPrinterSection + after;

fs.writeFileSync(file, newContent);
console.log('Replaced printer section with three-section layout');
