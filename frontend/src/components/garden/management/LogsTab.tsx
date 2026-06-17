/*
 * LogsTab.tsx — The "Grand Archive" audit interface.
 *
 * I built this tab to provide absolute transparency into the system's
 * history. Every major action—from a price change to an ingredient
 * restock—is logged with a timestamp and the actor's identity.
 *
 * Key features:
 *
 *   1. Activity Visualization: I added a stacked bar chart to show
 *      the volume of activity across categories (Employee, Inventory, 
 *      Order, System). This helps managers spot unusual spikes in activity.
 *
 *   2. Audit Trail: The table provides a granular view of every change.
 *      I implemented category filters so managers can focus on specific
 *      areas (e.g. only looking at inventory stock-outs).
 *
 *   3. Data Portability: I implemented a CSV export function that 
 *      dynamically parses the current log view into a downloadable file. 
 *      This is essential for the restaurant's end-of-month reporting 
 *      and compliance.
 */

import { useTranslation } from "react-i18next";
import { useCallback, useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fetchLogs } from "@/lib/api";
import type { LogEntry } from "@/lib/api";
import { FileText, Download, Activity, Search, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export const LogsTab = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [timeFrame, setTimeFrame] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchLogs(categoryFilter);
      setLogs(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    let result = [...logs];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(log => 
        log.action.toLowerCase().includes(q) ||
        (log.actor_name || "").toLowerCase().includes(q) ||
        (log.target_name || log.target_id || "").toLowerCase().includes(q) ||
        (log.details || "").toLowerCase().includes(q)
      );
    }
    
    if (timeFrame !== "all") {
      const now = new Date();
      const cutoff = new Date();
      if (timeFrame === "24h") cutoff.setHours(now.getHours() - 24);
      else if (timeFrame === "7d") cutoff.setDate(now.getDate() - 7);
      else if (timeFrame === "30d") cutoff.setDate(now.getDate() - 30);
      
      result = result.filter(log => new Date(log.timestamp) >= cutoff);
    }
    
    return result;
  }, [logs, searchQuery, timeFrame]);

  const downloadExcel = async () => {
    if (filteredLogs.length === 0) return;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Grand Archive Logs');

    // Calculate dynamic column widths based on maximum content length
    let maxTs = 10, maxCat = 8, maxAct = 6, maxActor = 5, maxTarget = 6, maxDetails = 7;
    filteredLogs.forEach(log => {
      const tsLen = new Date(log.timestamp).toLocaleString('en-MY', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).length;
      if (tsLen > maxTs) maxTs = tsLen;
      if (log.category.length > maxCat) maxCat = log.category.length;
      if (log.action.length > maxAct) maxAct = log.action.length;
      if ((log.actor_name || "System").length > maxActor) maxActor = (log.actor_name || "System").length;
      if ((log.target_name || log.target_id || "—").toString().length > maxTarget) maxTarget = (log.target_name || log.target_id || "—").toString().length;
      if ((log.details || "—").length > maxDetails) maxDetails = (log.details || "—").length;
    });

    // Define columns with dynamic widths
    worksheet.columns = [
      { header: 'TIMESTAMP', key: 'timestamp', width: maxTs + 4 },
      { header: 'CATEGORY', key: 'category', width: maxCat + 4 },
      { header: 'ACTION', key: 'action', width: maxAct + 4 },
      { header: 'ACTOR', key: 'actor', width: maxActor + 4 },
      { header: 'TARGET', key: 'target', width: maxTarget + 4 },
      { header: 'DETAILS', key: 'details', width: maxDetails + 4 }
    ];

    // Style the header row (Vibrant, high-contrast, double size)
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial' };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3224' } }; // Deep DragonFly Green
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 48;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'medium', color: { argb: 'FFD1D5DB' } },
        left: { style: 'medium', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'medium', color: { argb: 'FFD1D5DB' } },
        right: { style: 'medium', color: { argb: 'FFD1D5DB' } }
      };
    });

    // Add data and style rows
    filteredLogs.forEach((log) => {
      const formattedAction = log.action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
      let formattedDetails = log.details || "—";
      try {
        if (log.details && log.details.startsWith('{')) {
          const parsed = JSON.parse(log.details);
          formattedDetails = Object.entries(parsed).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' | ');
        }
      } catch (e) { /* ignore */ }

      const row = worksheet.addRow({
        timestamp: new Date(log.timestamp).toLocaleString('en-MY', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }),
        category: log.category,
        action: formattedAction,
        actor: log.actor_name || "System",
        target: log.target_name || log.target_id || "—",
        details: formattedDetails
      });

      row.height = 36;
      row.alignment = { vertical: 'middle', horizontal: 'left' };

      // Typography matching
      row.getCell('timestamp').font = { color: { argb: 'FF9CA3AF' }, bold: true };
      row.getCell('action').font = { bold: true, color: { argb: 'FF2F4F4F' } };
      row.getCell('actor').font = { color: { argb: 'FF4B5563' }, bold: true };
      row.getCell('target').font = { color: { argb: 'FF111827' }, bold: true };
      row.getCell('details').font = { color: { argb: 'FF6B7280' }, italic: true };

      // Clean category styling (crisp colored text with soft pill-like background fill)
      const catCell = row.getCell('category');
      catCell.font = { bold: true, size: 9 };
      catCell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (log.category === 'INVENTORY') {
        catCell.font.color = { argb: 'FFC2410C' };
        catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
      } else if (log.category === 'EMPLOYEE') {
        catCell.font.color = { argb: 'FF1D4ED8' };
        catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      } else if (log.category === 'ORDER') {
        catCell.font.color = { argb: 'FF047857' };
        catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      } else {
        catCell.font.color = { argb: 'FF374151' };
        catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      }

      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: 'medium', color: { argb: 'FFD1D5DB' } },
          left: { style: 'medium', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'medium', color: { argb: 'FFD1D5DB' } },
          right: { style: 'medium', color: { argb: 'FFD1D5DB' } }
        };
      });
    });

    // Write to buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `DragonFly_Archive_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatDetails = (details: string | undefined | null) => {
    if (!details) return "—";
    try {
      if (details.startsWith('{')) {
        const parsed = JSON.parse(details);
        return Object.entries(parsed).map(([k, v]) => {
          const cleanKey = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return `${cleanKey}: ${v}`;
        }).join(' | ');
      }
    } catch {
      // ignore JSON parse errors and just return the string
    }
    return details;
  };

  const getActionCounts = (logArray: LogEntry[]) => {
    const counts = logArray.reduce((acc, log) => {
      const act = formatAction(log.action);
      acc[act] = (acc[act] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // top 5 actions for clarity
  };

  const orderLogs = logs.filter(l => l.category === 'ORDER');
  const systemLogs = logs.filter(l => l.category !== 'ORDER');
  const orderChartData = getActionCounts(orderLogs);
  const systemChartData = getActionCounts(systemLogs);

  if (loading && logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 animate-pulse text-foreground/40">
        <Activity className="h-8 w-8 mb-4 opacity-50" />
        <p className="font-1 text-lg">{t("m.unearthingArchives")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-2">
        <div>
          <h2 className="text-3xl font-1 font-bold" style={{ color: "hsl(140, 30%, 15%)" }}>
            {t("m.grandArchive")}
          </h2>
          <p className="text-foreground/60 mt-1 font-medium">{t("m.grandArchiveDesc")}</p>
        </div>
        <Button 
          onClick={downloadExcel} 
          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-lg transition-transform hover:scale-105 px-6"
        >
          <Download className="h-4 w-4 mr-2" /> {t("m.exportExcel")}
        </Button>
      </div>

      {/* Activity Chart Section */}
      {logs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Order Events Chart */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6">
            <div className="mb-6 flex items-center gap-2 px-2">
              <Activity className="h-5 w-5 text-emerald-500" />
              <h3 className="font-1 text-xl font-bold" style={{ color: "hsl(140, 30%, 20%)" }}>{t("m.orderRev")}</h3>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11, fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11 }} />
                  <Tooltip cursor={{fill: 'rgba(0,0,0,0.03)'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                  <Bar dataKey="count" name={t("m.chartTotalEvents")} fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* System & Inventory Chart */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6">
            <div className="mb-6 flex items-center gap-2 px-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <h3 className="font-1 text-xl font-bold" style={{ color: "hsl(140, 30%, 20%)" }}>{t("m.sysInv")}</h3>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={systemChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11, fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11 }} />
                  <Tooltip cursor={{fill: 'rgba(0,0,0,0.03)'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                  <Bar dataKey="count" name={t("m.chartTotalEvents")} fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Audit Log Table */}
      <div className="bg-white/80 backdrop-blur-md border border-white/50 shadow-xl rounded-3xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-foreground/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/40">
          <h3 className="font-1 text-xl font-bold flex items-center gap-2" style={{ color: "hsl(140, 30%, 20%)" }}>
            <FileText className="h-5 w-5 text-accent" />
            {t("m.auditTrail")}
          </h3>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Search Bar */}
            <div className="relative group flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder={t("m.searchArchives")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-full border-none bg-white shadow-sm text-sm outline-none ring-2 ring-transparent focus:ring-primary/20 transition-all text-foreground/80 placeholder:text-foreground/40"
              />
            </div>

            {/* Time Frame Filter */}
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
              <select 
                className="h-10 w-full sm:w-auto pl-10 pr-8 rounded-full border-none bg-white shadow-sm text-sm font-semibold outline-none ring-2 ring-transparent focus:ring-primary/20 transition-all text-foreground/70 appearance-none"
                value={timeFrame}
                onChange={(e) => setTimeFrame(e.target.value)}
              >
                <option value="all">{t("m.allTime")}</option>
                <option value="24h">{t("m.last24h")}</option>
                <option value="7d">{t("m.last7Days")}</option>
                <option value="30d">{t("m.last30Days")}</option>
              </select>
            </div>

            {/* Category Filter */}
            <select 
              className="h-10 w-full sm:w-auto rounded-full border-none bg-white shadow-sm px-4 py-1 text-sm font-semibold outline-none ring-2 ring-transparent focus:ring-primary/20 transition-all text-foreground/70"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">{t("m.allCategories")}</option>
              <option value="EMPLOYEE">{t("m.logCatEmployees")}</option>
              <option value="INVENTORY">{t("m.logCatInventory")}</option>
              <option value="ORDER">{t("m.logCatOrders")}</option>
              <option value="SYSTEM">{t("m.logCatSystem")}</option>
            </select>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-[0.65rem] font-bold tracking-widest uppercase text-foreground/40 bg-foreground/[0.02]">
              <tr>
                <th className="px-6 py-4 rounded-tl-2xl">{t("m.timestamp")}</th>
                <th className="px-6 py-4">{t("m.category")}</th>
                <th className="px-6 py-4">{t("m.action")}</th>
                <th className="px-6 py-4">{t("m.actor")}</th>
                <th className="px-6 py-4">{t("m.target")}</th>
                <th className="px-6 py-4 rounded-tr-2xl">{t("m.details")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-foreground/40 font-medium">{t("m.noRecords")}</td>
                </tr>
              ) : (
                filteredLogs.map((log, i) => (
                  <tr 
                    key={log.id} 
                    className="hover:bg-primary/[0.05] cursor-pointer transition-colors duration-200" 
                    style={{ animation: `fade-in 0.3s ease-out ${i * 0.03}s both` }}
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-foreground/50 font-medium">
                      {new Date(log.timestamp).toLocaleString('en-MY', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[0.65rem] font-bold tracking-wider uppercase shadow-sm ${
                        log.category === 'INVENTORY' ? 'bg-orange-100 text-orange-700' :
                        log.category === 'EMPLOYEE' ? 'bg-blue-100 text-blue-700' :
                        log.category === 'ORDER' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {log.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold" style={{ color: "hsl(140, 20%, 30%)" }}>{formatAction(log.action)}</td>
                    <td className="px-6 py-4 font-medium text-foreground/70">{log.actor_name || t("m.systemActor")}</td>
                    <td className="px-6 py-4 font-medium text-foreground/90">{log.target_name || log.target_id || "—"}</td>
                    <td className="px-6 py-4 text-foreground/60 max-w-xs truncate italic" title={formatDetails(log.details)}>
                      {formatDetails(log.details)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-[85vw] w-[85vw] overflow-hidden border-0 shadow-2xl rounded-3xl bg-white/95 backdrop-blur-xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-foreground/5 bg-foreground/[0.02]">
            <DialogTitle className="flex items-center gap-3 text-2xl font-1" style={{ color: "hsl(140, 30%, 20%)" }}>
              <FileText className="h-6 w-6 text-primary" />
              {t("m.archiveRecord")}
            </DialogTitle>
            <DialogDescription className="font-medium text-foreground/50">
              {selectedLog && new Date(selectedLog.timestamp).toLocaleString('en-MY', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-foreground/[0.02] p-4 rounded-2xl border border-foreground/5">
                  <p className="text-xs uppercase tracking-wider font-bold text-foreground/40 mb-1">{t("m.category")}</p>
                  <p className={`inline-flex px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-sm ${
                        selectedLog.category === 'INVENTORY' ? 'bg-orange-100 text-orange-700' :
                        selectedLog.category === 'EMPLOYEE' ? 'bg-blue-100 text-blue-700' :
                        selectedLog.category === 'ORDER' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                    {selectedLog.category}
                  </p>
                </div>
                <div className="bg-foreground/[0.02] p-4 rounded-2xl border border-foreground/5">
                  <p className="text-xs uppercase tracking-wider font-bold text-foreground/40 mb-1">{t("m.action")}</p>
                  <p className="font-bold text-foreground/80">{formatAction(selectedLog.action)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-foreground/[0.02] p-4 rounded-2xl border border-foreground/5">
                  <p className="text-xs uppercase tracking-wider font-bold text-foreground/40 mb-1">{t("m.actor")}</p>
                  <p className="font-bold text-foreground/70">{selectedLog.actor_name || t("m.systemAutomated")}</p>
                </div>
                <div className="bg-foreground/[0.02] p-4 rounded-2xl border border-foreground/5">
                  <p className="text-xs uppercase tracking-wider font-bold text-foreground/40 mb-1">{t("m.targetResource")}</p>
                  <p className="font-bold text-foreground/90">{selectedLog.target_name || selectedLog.target_id || t("m.systemGlobal")}</p>
                </div>
              </div>

              <div className="bg-foreground/[0.02] p-5 rounded-2xl border border-foreground/5">
                <p className="text-xs uppercase tracking-wider font-bold text-foreground/40 mb-2">{t("m.detailedPayload")}</p>
                <div className="bg-white/60 p-4 rounded-xl border border-foreground/5">
                  {selectedLog.details ? (
                    (() => {
                      try {
                        if (selectedLog.details.startsWith('{')) {
                          const parsed = JSON.parse(selectedLog.details);
                          return (
                            <div className="flex flex-col gap-2">
                              {Object.entries(parsed).map(([k, v]) => (
                                <div key={k} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 border-b border-foreground/5 last:border-0 pb-2 last:pb-0">
                                  <span className="font-bold text-foreground/50 text-xs sm:w-1/3 break-words uppercase tracking-wide">
                                    {k.replace(/_/g, ' ')}
                                  </span>
                                  <span className="font-medium text-foreground/80 text-sm sm:w-2/3 break-words">
                                    {String(v)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                      } catch { /* ignore */ }
                      return <p className="font-mono text-sm text-foreground/70 break-words">{selectedLog.details}</p>;
                    })()
                  ) : (
                    <p className="text-sm italic text-foreground/40">{t("m.noAdditionalDetails")}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
