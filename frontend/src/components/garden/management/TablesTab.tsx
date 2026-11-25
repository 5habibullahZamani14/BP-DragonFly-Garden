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
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardSkeleton } from "@/components/ui/LoadingSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTables, createTable, updateTable, deleteTable, fetchSettings } from "@/lib/api";
import type { TableRecord } from "@/lib/api";
import { buildWifiQrValue } from "@/lib/hotspotQr";
import { ArrowUpRight, Grid3X3, Plus, Edit2, Trash2, Printer, Download, Sparkles } from "lucide-react";
import { QRCode } from "react-qrcode-logo";
import html2canvas from "html2canvas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWebSocket } from "@/lib/useWebSocket";
import { safeConsoleError } from "@/lib/safeConsole";

const QR_QUIET_ZONE = 10;
const QR_CODE_SIZE = 256;
const SYSTEM_TABLE_ID = 999;
const R4M_TABLE_NAME = "R4M";
const isR4MTable = (table: Pick<TableRecord, "table_number">) =>
  table.table_number.trim().toUpperCase() === R4M_TABLE_NAME;
const isSystemTable = (table: Pick<TableRecord, "id" | "table_number">) =>
  table.id === SYSTEM_TABLE_ID || /(takeaway|counter|to[- ]?go)/i.test(table.table_number);

export const TablesTab = () => {
  const { t } = useTranslation();
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedTablesRef = useRef(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState<"manual" | "auto" | null>(null); // "manual" or "auto"
  const [newTable, setNewTable] = useState({ table_number: "" });
  const [autoTableToCreate, setAutoTableToCreate] = useState<{ table_number: string } | null>(null);
  const [showAutoConfirm, setShowAutoConfirm] = useState(false);
  const [viewQRCodeTable, setViewQRCodeTable] = useState<TableRecord | null>(null);
  const [showHotspotQR, setShowHotspotQR] = useState(false);
  const [sortBy, setSortBy] = useState<"number" | "creation_order">("number");
  const qrPrintAreaRef = useRef<HTMLDivElement | null>(null);

  const handleDownloadQR = async () => {
    const element = qrPrintAreaRef.current;
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
  const getNextTableNumber = (): { number: number; name: string } => {
    // Extract numeric table numbers from existing tables
    const existingNumbers = tables
      .filter(t => !isSystemTable(t) && !isR4MTable(t))
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
    return { number: nextNum, name: tableName };
  };

  const handleAutoTableCreate = () => {
    const nextTable = getNextTableNumber();
    setAutoTableToCreate({
      table_number: nextTable.name,
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
    const filtered = tablesToSort.filter(table => !isSystemTable(table) && !isR4MTable(table));

    if (sortBy === "number") {
      return filtered.sort((a, b) => {
        const numA = parseInt(a.table_number.match(/\d+/)?.[0] || "999", 10);
        const numB = parseInt(b.table_number.match(/\d+/)?.[0] || "999", 10);
        return numA - numB;
      });
    }
    return filtered.sort((a, b) => a.id - b.id);
  };
  
  const [editingTableId, setEditingTableId] = useState<number | null>(null);
  const [editTable, setEditTable] = useState({ table_number: "" });
  const [hotspotSsid, setHotspotSsid] = useState("");
  const [hotspotPassword, setHotspotPassword] = useState("");
  const [hotspotSecurity, setHotspotSecurity] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [hotspotLoading, setHotspotLoading] = useState(true);

  useEffect(() => {
    loadTables();
    loadHotspotSettings();
  }, []);

  // WebSocket listener for real-time table updates
  useWebSocket(["TABLE_UPDATE", "SETTINGS_UPDATE", "DATA_REFRESH", "CONNECTION_RESTORED"], (event) => {
    if (
      event.type === "TABLE_UPDATE" ||
      event.type === "DATA_REFRESH" ||
      event.type === "CONNECTION_RESTORED"
    ) {
      void loadTables();
    }
    if (event.type === "DATA_REFRESH" || event.type === "CONNECTION_RESTORED") {
      void loadHotspotSettings();
    } else if (event.type === "SETTINGS_UPDATE") {
      const payload = event.payload as { key?: string };
      if (["hotspot_ssid", "hotspot_password", "hotspot_security"].includes(payload?.key ?? "")) {
        void loadHotspotSettings();
      }
    }
  });

  const loadTables = async () => {
    try {
      if (!hasLoadedTablesRef.current) setLoading(true);
      const data = await fetchTables();
      setTables(data || []);
      hasLoadedTablesRef.current = true;
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
    if (!newTable.table_number.trim()) return;
    try {
      await createTable(newTable);
      setIsAdding(false);
      setAddMode(null);
      setNewTable({ table_number: "" });
      loadTables();
    } catch (e) {
      safeConsoleError("Table request failed", e);
      if (e instanceof Error && e.message.includes("reserved for the system ordering route")) {
        toast.error(t("m.systemTableNameReserved"));
      }
    }
  };

  const handleUpdate = async () => {
    if (!editingTableId || !editTable.table_number.trim()) return;
    try {
      await updateTable(editingTableId, editTable);
      setEditingTableId(null);
      loadTables();
    } catch (e) {
      safeConsoleError("Table update failed", e);
      if (e instanceof Error && e.message.includes("reserved for the system ordering route")) {
        toast.error(t("m.systemTableNameReserved"));
      }
    }
  };

  const handleDelete = async (id: number) => {
    toast(t("m.confirmDeleteTable"), {
      action: {
        label: t("m.delete"),
        onClick: async () => {
          try {
            await deleteTable(id);
            loadTables();
          } catch (e) {
            safeConsoleError("Table deletion failed", e);
          }
        },
      },
    });
  };

  const hotspotQrValue = buildWifiQrValue(hotspotSsid, hotspotPassword, hotspotSecurity);
  const r4mTable = tables.find(isR4MTable);

  if (loading) return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-5 w-96 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );

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
              {t("m.tableSortByNumber")}
            </Button>
            <Button
              onClick={() => setSortBy("creation_order")}
              className={sortBy === "creation_order" ? "bg-white shadow-sm text-gray-800 hover:bg-white" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}
              size="sm"
            >
              {t("m.tableSortByCreationOrder")}
            </Button>
          </div>
          {!isAdding ? (
            <>
              <Button onClick={() => { setIsAdding(true); setAddMode("manual"); }} className="bg-green-600 hover:bg-green-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> {t("m.addNewTableManually")}
              </Button>
              <Button onClick={() => { setIsAdding(true); setAddMode("auto"); handleAutoTableCreate(); }} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> {t("m.addNewTableAutomatically")}
              </Button>
            </>
          ) : (
            <Button onClick={() => { setIsAdding(false); setAddMode(null); setNewTable({ table_number: "" }); }} variant="outline">
              {t("m.close")}
            </Button>
          )}
        </div>
      </div>

      {r4mTable && (
        <div className="space-y-4">
          <div className="r4m-rainbow rounded-2xl p-[2px] shadow-[0_0_24px_rgba(168,85,247,0.28)]">
            <a
              href={r4mTable.ordering_url || `/?table=${r4mTable.id}&qr=${encodeURIComponent(r4mTable.qr_code)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-[14px] bg-white/95 p-4 text-left transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white shadow-lg">
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-black uppercase tracking-[0.2em] text-fuchsia-700">
                  R4M · {t("m.r4m.special")}
                </span>
                <span className="mt-1 block text-lg font-bold text-gray-900">{t("m.r4m.title")}</span>
                <span className="mt-1 block text-sm text-gray-600">{t("m.r4m.description")}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-100 px-3 py-2 text-sm font-bold text-violet-800 transition-colors group-hover:bg-violet-200">
                {t("m.r4m.open")}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </a>
          </div>
          <div role="separator" aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-violet-300 to-transparent" />
        </div>
      )}

      {isAdding && addMode === "manual" && (
        <Card className="border-green-200 shadow-md">
          <CardHeader>
            <CardTitle>{t("m.addTableManually")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>{t("m.tableName")}</Label>
                <Input value={newTable.table_number} onChange={(e) => setNewTable({...newTable, table_number: e.target.value})} placeholder={t("m.tableNameExample")} />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleCreate} className="bg-green-600 hover:bg-green-700 text-white flex-1">{t("m.saveTable")}</Button>
              <Button onClick={() => { setIsAdding(false); setAddMode(null); setNewTable({ table_number: "" }); }} variant="outline" className="flex-1">{t("m.cancel")}</Button>
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
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>{t("m.tableName")}</Label>
                <Input value={editTable.table_number} onChange={(e) => setEditTable({...editTable, table_number: e.target.value})} />
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
              {!isSystemTable(table) && (
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  aria-label={`Edit ${table.table_number}`}
                  title={`Edit ${table.table_number}`}
                  onClick={() => {
                    setEditingTableId(table.id);
                    setEditTable({ table_number: table.table_number });
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
            <DialogTitle>{t("m.createTableAutomatically")}</DialogTitle>
            <DialogDescription>
              {t("m.confirmTableDetails")}
            </DialogDescription>
          </DialogHeader>
          {autoTableToCreate && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t("m.tableName")}</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{autoTableToCreate.table_number}</p>
                  </div>
                  <p className="text-sm text-gray-700">{t("m.secureQrCredentialInfo")}</p>
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleConfirmAutoCreate}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                >
                  {t("m.createTable")}
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
                  {t("m.cancel")}
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
        <DialogContent className="sm:max-w-[420px] w-full !h-[80.5vh] !max-h-[80.5vh] border-none shadow-2xl overflow-hidden p-0 [&>button]:right-3 [&>button]:top-3 [&>button]:bg-white [&>button]:rounded-full [&>button]:p-1 [&>button]:shadow-sm">
          {viewQRCodeTable && (
            <div className="max-h-[calc(100vh-4rem)] overflow-y-auto bg-gradient-to-b from-blue-50 to-blue-100 p-4 flex flex-col items-center justify-start">
              <DialogHeader className="w-full text-center mb-3">
                <DialogTitle className="text-lg font-bold text-gray-900">
                  {showHotspotQR ? t("m.wifiNetworkQrTitle") : t("m.tableOrderingQrTitle")}
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-600 mt-1.5">
                  {showHotspotQR
                    ? t("m.hotspotQrDescription", { table: viewQRCodeTable.table_number })
                    : t("m.orderingQrDescription", { table: viewQRCodeTable.table_number })}
                </DialogDescription>
              </DialogHeader>

              {/* Printable Area */}
              <div ref={qrPrintAreaRef} className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-lg border-2 border-gray-200 w-full max-w-xs mb-4">
                {/* The QR Code Container */}
                {showHotspotQR && hotspotSsid && !hotspotLoading ? (
                  <>
                    <div className="text-center mb-3">
                      <h3 className="text-base font-bold text-gray-900">{t("m.wifiNetwork")}</h3>
                      <p className="text-xs text-gray-600 mt-0.5">{hotspotSsid}</p>
                    </div>
                    <div className="relative min-w-0 overflow-hidden border-[5px] border-[#555555] rounded-lg p-2 bg-white flex items-center justify-center z-10 shadow-md w-full max-w-[90vw]">
                      <QRCode
                        value={hotspotQrValue}
                        size={QR_CODE_SIZE}
                        quietZone={QR_QUIET_ZONE}
                        ecLevel="H"
                        fgColor="#444444"
                        bgColor="#ffffff"
                        qrStyle="dots"
                        eyeRadius={10}
                        style={{ display: "block", maxWidth: "100%", height: "auto" }}
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
                      <h3 className="text-base font-bold text-gray-900">{t("m.orderingPortal")}</h3>
                      <p className="text-xs text-gray-600 mt-0.5">{t("m.directAccessToMenu")}</p>
                    </div>
                    <div className="relative min-w-0 overflow-hidden border-[5px] border-[#555555] rounded-lg p-2 bg-white flex items-center justify-center z-10 shadow-md w-full max-w-[90vw]">
                      <QRCode
                        value={viewQRCodeTable.ordering_url || `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/?qr=${viewQRCodeTable.qr_code}`}
                        size={QR_CODE_SIZE}
                        quietZone={QR_QUIET_ZONE}
                        ecLevel="H"
                        fgColor="#444444"
                        bgColor="#ffffff"
                        qrStyle="dots"
                        eyeRadius={10}
                        style={{ display: "block", maxWidth: "100%", height: "auto" }}
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

                <p className="mt-4 text-lg font-bold text-gray-800 uppercase tracking-widest">{t("m.tableNumberLabel", { number: viewQRCodeTable.table_number })}</p>
              </div>

              {/* Footer with Toggle and Download Buttons */}
              <div className={`grid w-full max-w-xs gap-2 ${hotspotSsid && !hotspotLoading ? "grid-cols-2" : "grid-cols-1"}`}>
                {hotspotSsid && !hotspotLoading && (
                  <Button 
                    onClick={() => setShowHotspotQR(!showHotspotQR)}
                    aria-label={showHotspotQR ? t("m.showOrderingQr") : t("m.showWifiQr")}
                    className="w-full min-w-0 whitespace-normal bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md font-semibold px-1 py-1.5 text-xs leading-tight"
                  >
                    {showHotspotQR ? t("m.orderingQr") : t("m.wifiQr")}
                  </Button>
                )}
                <Button 
                  aria-label={showHotspotQR ? t("m.downloadWifiQr") : t("m.downloadOrderingQr")}
                  className="w-full min-w-0 whitespace-normal bg-green-600 hover:bg-green-700 text-white rounded-full shadow-md font-semibold px-1 py-1.5 text-xs leading-tight"
                  onClick={handleDownloadQR}
                >
                  <Download className="h-3.5 w-3.5 shrink-0 mr-1" /> {t("m.downloadQr")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
