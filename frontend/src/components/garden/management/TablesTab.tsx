/*
 * TablesTab.tsx — Management UI for restaurant tables.
 *
 * I created this component to allow staff to add, edit, and delete tables,
 * each associated with a QR code for scanning at the point of service.
 * The UI presents a grid of table cards with quick actions, and
 * includes a form for creating new tables. State is synchronized with
 * the backend via the API utilities.
 *
 * Design notes: I used the Card component with hover shadows,
 * and the Grid3X3, Plus, Edit2, Trash2 icons from Lucide.
 */
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchTables, createTable, updateTable, deleteTable, fetchSettings } from "@/lib/api";
import type { TableRecord } from "@/lib/api";
import { buildWifiQrValue } from "@/lib/hotspotQr";
import { Grid3X3, Plus, QrCode, Edit2, Trash2, Printer, Download } from "lucide-react";
import { QRCode } from "react-qrcode-logo";
import html2canvas from "html2canvas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWebSocket } from "@/lib/useWebSocket";
import { safeConsoleError } from "@/lib/safeConsole";

export const TablesTab = () => {
  const { t } = useTranslation();
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState<"manual" | "auto" | null>(null); // "manual" or "auto"
  const [newTable, setNewTable] = useState({ table_number: "", qr_code: "" });
  const [autoTableToCreate, setAutoTableToCreate] = useState<{ table_number: string; qr_code: string } | null>(null);
  const [showAutoConfirm, setShowAutoConfirm] = useState(false);
  const [viewQRCodeTable, setViewQRCodeTable] = useState<TableRecord | null>(null);
  const [showHotspotQR, setShowHotspotQR] = useState(false);
  const [sortBy, setSortBy] = useState<"number" | "creation_date">("number"); // Sorting mode

  const handleDownloadQR = async () => {
    const element = document.getElementById("qr-code-print-area");
    if (!element || !viewQRCodeTable) return;
    
    try {
      const canvas = await html2canvas(element, { 
        backgroundColor: "#ffffff", 
        scale: 4 // High resolution for printing
      });
      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      const qrType = showHotspotQR ? "WiFi" : "Ordering";
      link.download = `Table-${viewQRCodeTable.table_number}-${qrType}-QRCode.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      safeConsoleError("Failed to generate QR Code image", err);
    }
  };

  // Function to find the next available table number, filling gaps from lowest
  const getNextTableNumber = (): { number: number; name: string; qrCode: string } => {
    // Extract numeric table numbers from existing tables
    const existingNumbers = tables
      .filter(t => !/(takeaway|counter|to[- ]?go)/i.test(t.table_number))
      .map(t => {
        const match = t.table_number.match(/\d+/);
        return match ? parseInt(match[0], 10) : null;
      })
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);

    // Find the lowest missing number starting from 1
    let nextNum = 1;
    for (const num of existingNumbers) {
      if (num === nextNum) {
        nextNum++;
      } else if (num > nextNum) {
        break; // Found the gap
      }
    }

    const tableName = `Table ${nextNum}`;
    const qrCode = `table-${nextNum}`;
    return { number: nextNum, name: tableName, qrCode };
  };

  const handleAutoTableCreate = () => {
    const nextTable = getNextTableNumber();
    setAutoTableToCreate({
      table_number: nextTable.name,
      qr_code: nextTable.qrCode,
    });
    setShowAutoConfirm(true);
  };

  const handleConfirmAutoCreate = async () => {
    if (!autoTableToCreate) return;
    try {
      await createTable(autoTableToCreate);
      setShowAutoConfirm(false);
      setAutoTableToCreate(null);
      setIsAdding(false);
      setAddMode(null);
      loadTables();
    } catch (e) {
      safeConsoleError("Failed to create auto table", e);
    }
  };

  const getSortedTables = (tablesToSort: TableRecord[]) => {
    const filtered = tablesToSort.filter(table => !/(takeaway|counter|to[- ]?go)/i.test(table.table_number));

    if (sortBy === "number") {
      return filtered.sort((a, b) => {
        const numA = parseInt(a.table_number.match(/\d+/)?.[0] || "999", 10);
        const numB = parseInt(b.table_number.match(/\d+/)?.[0] || "999", 10);
        return numA - numB;
      });
    } else {
      // Sort by creation date (oldest first)
      return filtered.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB;
      });
    }
  };
  
  const [editingTableId, setEditingTableId] = useState<number | null>(null);
  const [editTable, setEditTable] = useState({ table_number: "", qr_code: "" });
  const [hotspotSsid, setHotspotSsid] = useState("");
  const [hotspotPassword, setHotspotPassword] = useState("");
  const [hotspotSecurity, setHotspotSecurity] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [hotspotLoading, setHotspotLoading] = useState(true);

  useEffect(() => {
    loadTables();
    loadHotspotSettings();
  }, []);

  // WebSocket listener for real-time table updates
  useWebSocket(["TABLE_UPDATE"], (event) => {
    loadTables();
  });

  const loadTables = async () => {
    try {
      setLoading(true);
      const data = await fetchTables();
      setTables(data || []);
    } catch (e) {
      safeConsoleError("Failed to load table data", e);
    } finally {
      setLoading(false);
    }
  };

  const loadHotspotSettings = async () => {
    try {
      const settings = await fetchSettings();
      if (settings?.hotspot_ssid) setHotspotSsid(String(settings.hotspot_ssid));
      if (settings?.hotspot_password) setHotspotPassword(String(settings.hotspot_password));
      if (settings?.hotspot_security) {
        const security = String(settings.hotspot_security).toUpperCase();
        if (security === "WEP" || security === "NOPASS") {
          setHotspotSecurity(security as "WEP" | "nopass");
        } else {
          setHotspotSecurity("WPA");
        }
      }
    } catch (e) {
      safeConsoleError("Failed to load hotspot settings", e);
    } finally {
      setHotspotLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTable.table_number || !newTable.qr_code) return;
    try {
      await createTable(newTable);
      setIsAdding(false);
      setAddMode(null);
      setNewTable({ table_number: "", qr_code: "" });
      loadTables();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdate = async () => {
    if (!editingTableId || !editTable.table_number || !editTable.qr_code) return;
    try {
      await updateTable(editingTableId, editTable);
      setEditingTableId(null);
      loadTables();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("m.confirmDeleteTable"))) return;
    try {
      await deleteTable(id);
      loadTables();
    } catch (e) {
      console.error(e);
    }
  };

  const hotspotQrValue = buildWifiQrValue(hotspotSsid, hotspotPassword, hotspotSecurity);

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">{t("m.loadingTables")}</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Grid3X3 className="h-6 w-6 text-green-600" />
          {t("m.restaurantTables")}
        </h2>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <Button
              onClick={() => setSortBy("number")}
              className={sortBy === "number" ? "bg-white shadow-sm text-gray-800 hover:bg-white" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}
              size="sm"
            >
              Sort by Number
            </Button>
            <Button
              onClick={() => setSortBy("creation_date")}
              className={sortBy === "creation_date" ? "bg-white shadow-sm text-gray-800 hover:bg-white" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}
              size="sm"
            >
              Sort by Creation Date
            </Button>
          </div>
          {!isAdding ? (
            <>
              <Button onClick={() => { setIsAdding(true); setAddMode("manual"); }} className="bg-green-600 hover:bg-green-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> Add New Table Manually
              </Button>
              <Button onClick={() => { setIsAdding(true); setAddMode("auto"); handleAutoTableCreate(); }} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> Add New Table Automatically
              </Button>
            </>
          ) : (
            <Button onClick={() => { setIsAdding(false); setAddMode(null); setNewTable({ table_number: "", qr_code: "" }); }} variant="outline">
              Close
            </Button>
          )}
        </div>
      </div>

      {isAdding && addMode === "manual" && (
        <Card className="border-green-200 shadow-md">
          <CardHeader>
            <CardTitle>Add Table Manually</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("m.tableName")}</Label>
                <Input value={newTable.table_number} onChange={(e) => setNewTable({...newTable, table_number: e.target.value})} placeholder="e.g. Table 12 or VIP Lounge" />
              </div>
              <div className="space-y-2">
                <Label>{t("m.qrId")}</Label>
                <Input value={newTable.qr_code} onChange={(e) => setNewTable({...newTable, qr_code: e.target.value})} placeholder="e.g. table-12" />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleCreate} className="bg-green-600 hover:bg-green-700 text-white flex-1">{t("m.saveTable")}</Button>
              <Button onClick={() => { setIsAdding(false); setAddMode(null); setNewTable({ table_number: "", qr_code: "" }); }} variant="outline" className="flex-1">{t("m.cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editingTableId && (
        <Card className="border-blue-200 shadow-md">
          <CardHeader>
            <CardTitle>{t("m.editTable")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("m.tableName")}</Label>
                <Input value={editTable.table_number} onChange={(e) => setEditTable({...editTable, table_number: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>{t("m.qrId")}</Label>
                <Input value={editTable.qr_code} onChange={(e) => setEditTable({...editTable, qr_code: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleUpdate} className="bg-blue-600 hover:bg-blue-700 text-white flex-1">{t("m.updateTable")}</Button>
              <Button onClick={() => setEditingTableId(null)} variant="outline" className="flex-1">{t("m.cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {getSortedTables(tables).map((table) => (
          <Card key={table.id} className="text-center hover:shadow-md transition-all border-t-4 border-t-green-500 relative group cursor-pointer" onClick={() => setViewQRCodeTable(table)}>
            <CardContent className="pt-6 pb-4">
              {!/(takeaway|counter|to[- ]?go)/i.test(table.table_number) && (
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  aria-label={`Edit ${table.table_number}`}
                  title={`Edit ${table.table_number}`}
                  onClick={() => {
                    setEditingTableId(table.id);
                    setEditTable({ table_number: table.table_number, qr_code: table.qr_code });
                  }}
                  className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${table.table_number}`}
                  title={`Delete ${table.table_number}`}
                  onClick={() => handleDelete(table.id)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              )}
              <Grid3X3 className="h-8 w-8 text-green-200 mx-auto mb-2" />
              <div className="font-bold text-lg text-gray-800">{table.table_number}</div>
              <div className="text-xs text-gray-500 mt-2 flex items-center justify-center gap-1">
                <QrCode className="h-3 w-3" /> {table.qr_code}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Auto Create Confirmation Dialog */}
      <Dialog open={showAutoConfirm} onOpenChange={(open) => {
        if (!open) {
          setShowAutoConfirm(false);
          setAutoTableToCreate(null);
          setIsAdding(false);
          setAddMode(null);
        }
      }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create Table Automatically</DialogTitle>
            <DialogDescription>
              Please confirm the table details below
            </DialogDescription>
          </DialogHeader>
          {autoTableToCreate && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Table Name</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{autoTableToCreate.table_number}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">QR Code ID</p>
                    <p className="text-sm text-gray-800 mt-1 font-mono">{autoTableToCreate.qr_code}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleConfirmAutoCreate}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                >
                  Create Table
                </Button>
                <Button 
                  onClick={() => {
                    setShowAutoConfirm(false);
                    setAutoTableToCreate(null);
                    setIsAdding(false);
                    setAddMode(null);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      <Dialog open={!!viewQRCodeTable} onOpenChange={(open) => {
        if (!open) {
          setViewQRCodeTable(null);
          setShowHotspotQR(false); // Reset to the customer ordering QR when closing
        }
      }}>
        <DialogContent className="sm:max-w-[420px] border-none shadow-2xl overflow-hidden p-0 [&>button]:right-3 [&>button]:top-3 [&>button]:bg-white [&>button]:rounded-full [&>button]:p-1 [&>button]:shadow-sm">
          {viewQRCodeTable && (
            <div className="bg-gradient-to-b from-blue-50 to-blue-100 p-4 flex flex-col items-center justify-start">
              <DialogHeader className="w-full text-center mb-3">
                <DialogTitle className="text-lg font-bold text-gray-900">
                  {showHotspotQR ? "🌐 WiFi Network QR Code" : "🛒 Table Ordering QR Code"}
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-600 mt-1.5">
                  {showHotspotQR 
                    ? `Table: ${viewQRCodeTable.table_number} • Optional network QR for hotspot access`
                    : `Table: ${viewQRCodeTable.table_number} • This is the single QR customers scan to order`
                  }
                </DialogDescription>
              </DialogHeader>

              {/* Printable Area */}
              <div id="qr-code-print-area" className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-lg border-2 border-gray-200 w-full max-w-xs mb-4">
                {/* The QR Code Container */}
                {showHotspotQR && hotspotSsid && !hotspotLoading ? (
                  <>
                    <div className="text-center mb-3">
                      <h3 className="text-base font-bold text-gray-900">🌐 WiFi Network</h3>
                      <p className="text-xs text-gray-600 mt-0.5">{hotspotSsid}</p>
                    </div>
                    <div className="relative border-[5px] border-[#555555] rounded-lg p-2 bg-white flex flex-col items-center justify-center z-10 shadow-md">
                      <QRCode
                        value={hotspotQrValue}
                        size={180}
                        ecLevel="H"
                        fgColor="#444444"
                        bgColor="#ffffff"
                        qrStyle="dots"
                        eyeRadius={10}
                      />
                      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                        <div className="bg-white px-2 py-1 flex flex-col items-center justify-center border-none rounded-lg shadow-[0_0_8px_rgba(255,255,255,0.8)]">
                          <span className="text-[12px] font-black text-[#555555] uppercase tracking-widest leading-none">{t("m.qrScan")}</span>
                          <span className="text-[16px] font-black text-[#555555] uppercase tracking-widest leading-none mt-0.5">{t("m.qrMe")}</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : !showHotspotQR ? (
                  <>
                    <div className="text-center mb-3">
                      <h3 className="text-base font-bold text-gray-900">🛒 Ordering Portal</h3>
                      <p className="text-xs text-gray-600 mt-0.5">Direct access to menu</p>
                    </div>
                    <div className="relative border-[5px] border-[#555555] rounded-lg p-2 bg-white flex items-center justify-center z-10 shadow-md">
                      <QRCode 
                        value={viewQRCodeTable.ordering_url || `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/?qr=${viewQRCodeTable.qr_code}`} 
                        size={180} 
                        ecLevel="H"
                        fgColor="#444444"
                        bgColor="#ffffff"
                        qrStyle="dots"
                        eyeRadius={10}
                      />
                      
                      {/* The SCAN ME Center Badge */}
                      <div className="absolute inset-0 flex items-center justify-center z-20">
                        <div className="bg-white px-2 py-1 flex flex-col items-center justify-center border-none rounded-lg shadow-[0_0_8px_rgba(255,255,255,0.8)]">
                          <span className="text-[12px] font-black text-[#555555] uppercase tracking-widest leading-none">{t("m.qrScan")}</span>
                          <span className="text-[16px] font-black text-[#555555] uppercase tracking-widest leading-none mt-0.5">{t("m.qrMe")}</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                <p className="mt-4 text-lg font-bold text-gray-800 uppercase tracking-widest">TABLE {viewQRCodeTable.table_number}</p>
              </div>

              {/* Footer with Toggle and Download Buttons */}
              <div className="w-full max-w-xs space-y-2">
                {hotspotSsid && !hotspotLoading && (
                  <Button 
                    onClick={() => setShowHotspotQR(!showHotspotQR)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md font-semibold py-1.5 text-sm"
                  >
                    {showHotspotQR ? "🛒 Show Ordering QR" : "🌐 Show Wi-Fi QR"}
                  </Button>
                )}
                <Button 
                  className="w-full bg-green-600 hover:bg-green-700 text-white rounded-full shadow-md font-semibold py-1.5 text-sm"
                  onClick={handleDownloadQR}
                >
                  <Download className="w-4 h-4 mr-2" /> Download {showHotspotQR ? "WiFi" : "Ordering"} QR
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
