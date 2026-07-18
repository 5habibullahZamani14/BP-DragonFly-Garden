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
import { FileText, Download, Activity, Search, Clock, PieChart, TrendingUp, Brain } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import ChartCardFooter from "@/components/ui/ChartCardFooter";
import ChartHeaderExport from "@/components/ui/ChartHeaderExport";
import ChartEmptyState from "@/components/ui/ChartEmptyState";
import CardFilters from "@/components/ui/CardFilters";
import { ChartSkeleton, TableSkeleton } from "@/components/ui/LoadingSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { matchesTimeframe, type TimeframeValue } from "@/lib/parseDbTimestamp";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { safeConsoleError } from "@/lib/safeConsole";

export const LogsTab = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [timeFrame, setTimeFrame] = useState<string>("all");
  const [orderChartTimeframe, setOrderChartTimeframe] = useState<TimeframeValue>("all");
  const [orderChartStartDate, setOrderChartStartDate] = useState("");
  const [orderChartEndDate, setOrderChartEndDate] = useState("");
  const [systemChartTimeframe, setSystemChartTimeframe] = useState<TimeframeValue>("all");
  const [systemChartStartDate, setSystemChartStartDate] = useState("");
  const [systemChartEndDate, setSystemChartEndDate] = useState("");
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [tableTimeframe, setTableTimeframe] = useState<TimeframeValue>("all");
  const [tableStartDate, setTableStartDate] = useState("");
  const [tableEndDate, setTableEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const TIMESTAMP_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };

  const parseTimestamp = (raw?: string | null) => {
    if (!raw) return null;
    const value = String(raw).trim();
    if (!value) return null;

    const sqliteUtcPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
    const normalized = sqliteUtcPattern.test(value)
      ? `${value.replace(' ', 'T')}Z`
      : value.replace(' ', 'T');

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatTimestamp = (raw?: string | null) => {
    const date = parseTimestamp(raw);
    if (!date) return "—";
    return date.toLocaleString('en-MY', TIMESTAMP_FORMAT_OPTIONS);
  };

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i} className="bg-yellow-200 text-foreground px-0.5 rounded">{part}</mark>
        : part
    );
  };

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchLogs("");
      setLogs(data || []);
    } catch (e) {
      safeConsoleError("Failed to load logs", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // Apply timeframe and category filters first
    if (tableTimeframe !== "all") {
      const now = new Date();
      const cutoff = new Date();
      if (tableTimeframe === "today") {
        cutoff.setHours(0, 0, 0, 0);
      } else if (tableTimeframe === "yesterday") {
        cutoff.setDate(now.getDate() - 1);
        cutoff.setHours(0, 0, 0, 0);
        const endOfYesterday = new Date(cutoff);
        endOfYesterday.setHours(23, 59, 59, 999);
        result = result.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate >= cutoff && logDate <= endOfYesterday;
        });
      } else if (tableTimeframe === "week") {
        cutoff.setDate(now.getDate() - 7);
      } else if (tableTimeframe === "month") {
        cutoff.setDate(now.getDate() - 30);
      } else if (tableTimeframe === "custom" && tableStartDate && tableEndDate) {
        const start = new Date(tableStartDate);
        const end = new Date(tableEndDate);
        end.setHours(23, 59, 59, 999);
        result = result.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate >= start && logDate <= end;
        });
      }
      if (tableTimeframe !== "yesterday" && tableTimeframe !== "custom") {
        result = result.filter(log => new Date(log.timestamp) >= cutoff);
      }
    }

    if (categoryFilter) {
      result = result.filter(log => log.category === categoryFilter);
    }
    
    // Calculate row numbers based on original logs array (consistent numbering)
    const resultWithRowNumbers = result.map(log => {
      const globalIndex = logs.findIndex(l => l.id === log.id);
      const rowNumber = logs.length - globalIndex;
      return { ...log, rowNumber };
    });
    
    // Then apply search filter - search only timestamp/category/action/actor/target/detail
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      
      result = resultWithRowNumbers.filter(log => {
        const targetText = String(log.target_name || log.target_id || "");
        const timestampText = formatTimestamp(log.timestamp);
        const categoryText = log.category;
        const actionText = formatAction(log.action);
        const actorText = log.actor_name || "";
        const detailsText = log.details || "";
        
        return (
          actionText.toLowerCase().includes(q) ||
          actorText.toLowerCase().includes(q) ||
          targetText.toLowerCase().includes(q) ||
          detailsText.toLowerCase().includes(q) ||
          categoryText.toLowerCase().includes(q) ||
          timestampText.toLowerCase().includes(q)
        );
      });
    } else {
      result = resultWithRowNumbers;
    }
    
    return result;
  }, [logs, searchQuery, tableTimeframe, tableStartDate, tableEndDate, categoryFilter]);

  // Pagination logic
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredLogs.slice(startIndex, endIndex);
  }, [filteredLogs, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredLogs.length / rowsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleRowsPerPageChange = (value: string) => {
    if (value === "custom") {
      setRowsPerPage(50); // Default for custom
    } else {
      setRowsPerPage(parseInt(value));
    }
    setCurrentPage(1);
  };

  const handleCustomRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (value > 0) {
      setRowsPerPage(value);
      setCurrentPage(1);
    }
  };

  const downloadExcel = async () => {
    if (filteredLogs.length === 0) return;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Grand Archive Logs');

    // Calculate dynamic column widths based on maximum content length
    let maxTs = 10, maxCat = 8, maxAct = 6, maxActor = 5, maxTarget = 6, maxDetails = 7;
    filteredLogs.forEach(log => {
      const tsLen = formatTimestamp(log.timestamp).length;
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
        timestamp: formatTimestamp(log.timestamp),
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
      .slice(0, 5);
  };

  const getCategoryDistribution = (logArray: LogEntry[]) => {
    const counts = logArray.reduce((acc, log) => {
      acc[log.category] = (acc[log.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  };

  const getActivityOverTime = (logArray: LogEntry[]) => {
    const dailyCounts = logArray.reduce((acc, log) => {
      const date = parseTimestamp(log.timestamp);
      if (!date) return acc;
      const dateKey = date.toISOString().split('T')[0];
      acc[dateKey] = (acc[dateKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(dailyCounts)
      .map(([date, count]) => ({ name: date, count }))
      .sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime())
      .slice(-7); // Last 7 days
  };

  const getMostActiveActors = (logArray: LogEntry[]) => {
    const actorCounts = logArray.reduce((acc, log) => {
      const actor = log.actor_name || "System";
      acc[actor] = (acc[actor] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(actorCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const filterLogsByTimeframe = (
    logArray: LogEntry[],
    timeframe: TimeframeValue,
    startDate: string,
    endDate: string
  ) => {
    if (timeframe === "all") return logArray;
    return logArray.filter((log) => matchesTimeframe(log.timestamp, timeframe, startDate, endDate));
  };

  const chartLogs = useMemo(
    () => filterLogsByTimeframe(logs, orderChartTimeframe, orderChartStartDate, orderChartEndDate),
    [logs, orderChartTimeframe, orderChartStartDate, orderChartEndDate]
  );

  // Fallback: if timeframe is "all" and filtered logs are empty, use all logs
  const finalChartLogs = useMemo(() => {
    if (chartLogs.length === 0 && orderChartTimeframe === "all") {
      return logs;
    }
    return chartLogs;
  }, [chartLogs, orderChartTimeframe, logs]);

  const categoryChartData = useMemo(() => getCategoryDistribution(finalChartLogs), [finalChartLogs]);
  const activityChartData = useMemo(() => getActivityOverTime(finalChartLogs), [finalChartLogs]);
  const actorChartData = useMemo(() => getMostActiveActors(finalChartLogs), [finalChartLogs]);

  // AI-generated insights for category distribution
  const categoryAdvice = useMemo(() => {
    // Only show insights if chart would actually render with data
    if (categoryChartData.length === 0 || categoryChartData.every(d => d.count === 0)) return null;
    
    const total = categoryChartData.reduce((sum, item) => sum + item.count, 0);
    const maxItem = categoryChartData.reduce((prev, curr) => prev.count > curr.count ? prev : curr);
    const maxPercentage = ((maxItem.count / total) * 100).toFixed(1);
    
    if (maxItem.name === 'ORDER') {
      return `Order activity dominates (${maxPercentage}% of events). High order volume indicates strong customer traffic. Monitor staff levels during peak hours to maintain service quality.`;
    } else if (maxItem.name === 'INVENTORY') {
      return `Inventory adjustments are frequent (${maxPercentage}% of events). Consider reviewing stock management processes to reduce manual adjustments and improve accuracy.`;
    } else if (maxItem.name === 'EMPLOYEE') {
      return `Employee-related activity is prominent (${maxPercentage}% of events). This suggests active staff management. Ensure proper training and clear procedures to maintain consistency.`;
    } else {
      return `System operations account for ${maxPercentage}% of activity. Monitor system performance and automated processes to ensure smooth operations.`;
    }
  }, [categoryChartData]);

  // AI-generated insights for activity patterns
  const activityAdvice = useMemo(() => {
    // Only show insights if chart would actually render with data
    if (activityChartData.length === 0 || activityChartData.every(d => d.count === 0)) return null;
    
    const recent = activityChartData.slice(-3);
    const earlier = activityChartData.slice(0, -3);
    if (earlier.length === 0) return null;
    
    const recentAvg = recent.reduce((sum, item) => sum + item.count, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, item) => sum + item.count, 0) / earlier.length;
    
    if (recentAvg > earlierAvg * 1.3) {
      return "Activity is increasing significantly. Consider reviewing staffing levels and resource allocation to handle the higher workload.";
    } else if (recentAvg < earlierAvg * 0.7) {
      return "Activity has decreased recently. This could indicate slower business or process improvements. Review if this aligns with business expectations.";
    } else {
      return "Activity levels are stable. Current operations appear to be running at a consistent pace.";
    }
  }, [activityChartData]);

  if (loading && logs.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-5 w-96 rounded-lg" />
        </div>
        <ChartSkeleton />
        <ChartSkeleton />
        <TableSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-2">
        <div>
          <h2 className="text-3xl font-1 font-bold" style={{ color: "hsl(140, 30%, 15%)" }}>
            {t("m.grandArchive")}
          </h2>
          <p className="text-foreground/60 mt-1 font-medium">{t("m.grandArchiveDesc")}</p>
        </div>
      </div>

      {/* Activity Analytics Section */}
      {logs.length > 0 && (
        <div className="space-y-8">
          {/* Category Distribution Chart */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px]">
            <div className="mb-4 flex items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-purple-500" />
                <div>
                  <h3 className="font-1 text-lg font-bold text-[#142d1f]">Activity by Category</h3>
                  <p className="text-xs text-foreground/50 mt-1">Distribution of system events across different operational areas.</p>
                </div>
              </div>
              <ChartHeaderExport
                targetId="category-chart"
                data={categoryChartData}
                fileName="activity-by-category"
              />
            </div>
            <CardFilters
              label={t("m.filterActivity", "Filter for Activity")}
              timeframe={orderChartTimeframe}
              onTimeframeChange={setOrderChartTimeframe}
              startDate={orderChartStartDate}
              onStartDateChange={setOrderChartStartDate}
              endDate={orderChartEndDate}
              onEndDateChange={setOrderChartEndDate}
            />
            <div className="flex-1 w-full h-[220px]">
              <div id="category-chart" className="relative w-full h-full">
                {categoryChartData.length === 0 || categoryChartData.every(d => d.count === 0) && (
                  <ChartEmptyState message={t("m.noChartData", "No activity data available for the selected filters.")} />
                )}
                {categoryChartData.length > 0 && categoryChartData.some(d => d.count > 0) && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11, fontWeight: 600 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11 }} />
                      <Tooltip cursor={{fill: 'rgba(0,0,0,0.03)'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                      <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]} barSize={24}>
                        {categoryChartData.map((entry, index) => {
                          const colors = { 'ORDER': '#10b981', 'INVENTORY': '#f97316', 'EMPLOYEE': '#3b82f6', 'SYSTEM': '#8b5cf6' };
                          return <Cell key={`cell-${index}`} fill={colors[entry.name as keyof typeof colors] || '#6b7280'} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            {categoryAdvice && (
              <div className="mt-3 p-3 bg-purple-50 border border-purple-100 rounded-2xl flex items-start gap-2.5">
                <Brain className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-purple-800 leading-relaxed">{categoryAdvice}</p>
              </div>
            )}
            <ChartCardFooter
              infoKey="## 📊 Activity by Category

This chart displays the distribution of system events across operational categories, providing insight into which activities dominate your operations.

---

### 📋 Categories

- **Order** — Customer orders and related transactions
- **Inventory** — Stock adjustments and inventory changes  
- **Employee** — Staff-related activities and updates
- **System** — Automated system operations

---

### 💡 Why This Matters

Understanding activity distribution helps you:

- **Pattern Recognition** — Identify dominant activity types in your operations
- **Resource Planning** — Allocate resources based on activity volume and frequency
- **Process Focus** — Target improvement efforts on high-frequency areas for maximum impact"
            />
          </div>

          {/* Activity Over Time Chart */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px]">
            <div className="mb-4 flex items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-indigo-500" />
                <div>
                  <h3 className="font-1 text-lg font-bold text-[#142d1f]">Activity Trends</h3>
                  <p className="text-xs text-foreground/50 mt-1">Daily system activity volume over the last 7 days.</p>
                </div>
              </div>
              <ChartHeaderExport
                targetId="activity-trend-chart"
                data={activityChartData}
                fileName="activity-trends"
              />
            </div>
            <div className="flex-1 w-full h-[220px]">
              <div id="activity-trend-chart" className="relative w-full h-full">
                {activityChartData.length === 0 || activityChartData.every(d => d.count === 0) && (
                  <ChartEmptyState message={t("m.noChartData", "No activity trend data available.")} />
                )}
                {activityChartData.length > 0 && activityChartData.some(d => d.count > 0) && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11, fontWeight: 600 }} tickFormatter={(val) => new Date(val).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11 }} />
                      <Tooltip cursor={{fill: 'rgba(0,0,0,0.03)'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} labelFormatter={(val) => new Date(val).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })} />
                      <Bar dataKey="count" name="Events" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            {activityAdvice && (
              <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start gap-2.5">
                <Brain className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-indigo-800 leading-relaxed">{activityAdvice}</p>
              </div>
            )}
            <ChartCardFooter
              infoKey="## 📈 Activity Trends

This chart displays daily system activity volume over the last 7 days, helping you identify patterns in workload and operational intensity.

---

### 🔍 Key Insights

- **Peak Days** — Identify the busiest operational periods in your schedule
- **Trend Analysis** — Spot increasing or decreasing activity patterns over time
- **Workload Planning** — Make informed staffing and resource decisions

---

### 🚀 Practical Applications

Use this data to optimize your operations:

- **Staff Scheduling** — Optimize team deployment during high-activity periods
- **Resource Allocation** — Ensure adequate resources when they're needed most
- **Performance Monitoring** — Track operational efficiency and identify improvement opportunities"
            />
          </div>
        </div>
      )}

      {/* Detailed Audit Log Table */}
      <div className="bg-white/80 backdrop-blur-md border border-white/50 shadow-xl rounded-3xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-foreground/5 flex flex-col gap-4 bg-white/40">
          <div className="flex items-center gap-3">
            <h3 className="font-1 text-xl font-bold flex items-center gap-2" style={{ color: "hsl(140, 30%, 20%)" }}>
              <FileText className="h-5 w-5 text-accent" />
              {t("m.auditTrail")}
            </h3>
          </div>

          <CardFilters
            label={t("m.filterAuditTrail", "Filter for Audit Trail")}
            timeframe={tableTimeframe}
            onTimeframeChange={setTableTimeframe}
            startDate={tableStartDate}
            onStartDateChange={setTableStartDate}
            endDate={tableEndDate}
            onEndDateChange={setTableEndDate}
            secondaryValue={categoryFilter || "all"}
            onSecondaryChange={(val) => setCategoryFilter(val === "all" ? "" : val)}
            secondaryOptions={[
              { value: "all", label: t("m.allCategories") },
              { value: "EMPLOYEE", label: t("m.logCatEmployees") },
              { value: "INVENTORY", label: t("m.logCatInventory") },
              { value: "ORDER", label: t("m.logCatOrders") },
              { value: "SYSTEM", label: t("m.logCatSystem") },
            ]}
          />
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
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

            <Button
              onClick={downloadExcel}
              className="ml-auto scale-90 bg-primary/70 hover:bg-primary/80 text-primary-foreground rounded-full shadow transition duration-200 px-4 py-2 text-sm"
            >
              <Download className="h-4 w-4 mr-2" /> {t("m.exportExcel")}
            </Button>
          </div>

          {/* Pagination Controls - Top */}
          {filteredLogs.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-foreground/5">
              <div className="flex items-center gap-2 text-xs text-foreground/60">
                <span>Show</span>
                <select
                  value={rowsPerPage === 50 ? "50" : rowsPerPage === 10 ? "10" : rowsPerPage === 20 ? "20" : rowsPerPage === 40 ? "40" : "custom"}
                  onChange={(e) => handleRowsPerPageChange(e.target.value)}
                  className="h-7 px-2 rounded border border-gray-200 bg-white text-xs"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="40">40</option>
                  <option value="50">50</option>
                  <option value="custom">Custom</option>
                </select>
                {rowsPerPage !== 10 && rowsPerPage !== 20 && rowsPerPage !== 40 && rowsPerPage !== 50 && (
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={rowsPerPage}
                    onChange={handleCustomRowsPerPage}
                    className="h-7 w-16 px-2 rounded border border-gray-200 bg-white text-xs"
                    placeholder="50"
                  />
                )}
                <span>rows per page</span>
                <span className="text-foreground/40">|</span>
                <span>{(currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, filteredLogs.length)} of {filteredLogs.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-7 w-7 rounded border border-gray-200 bg-white text-xs hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {"<"}
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`h-7 w-7 rounded border text-xs flex items-center justify-center ${
                        currentPage === pageNum
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-7 w-7 rounded border border-gray-200 bg-white text-xs hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {">"}
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse table-auto">
            <colgroup>
              <col style={{ width: 'max-content' }} />
              <col style={{ width: 'max-content' }} />
              <col style={{ width: 'max-content' }} />
              <col style={{ width: 'max-content' }} />
              <col style={{ width: 'max-content' }} />
              <col style={{ width: 'max-content' }} />
              <col style={{ width: 'minmax(180px, 1fr)' }} />
            </colgroup>
            <thead className="text-[0.65rem] font-bold tracking-widest uppercase text-foreground/40 bg-foreground/[0.02]">
              <tr>
                <th className="px-4 py-3 rounded-tl-2xl min-w-[80px]">#</th>
                <th className="px-4 py-3 min-w-[150px]">{t("m.timestamp")}</th>
                <th className="px-4 py-3 min-w-[120px]">{t("m.category")}</th>
                <th className="px-4 py-3 min-w-[170px]">{t("m.action")}</th>
                <th className="px-4 py-3 min-w-[140px]">{t("m.actor")}</th>
                <th className="px-4 py-3 min-w-[140px]">{t("m.target")}</th>
                <th className="px-4 py-3 rounded-tr-2xl min-w-[180px]">{t("m.details")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-foreground/40 font-medium">{t("m.noRecords")}</td>
                </tr>
              ) : (
                paginatedLogs.map((log, i) => {
                  // Calculate row number: oldest (last in filteredLogs) = 1, newest (first) = total
                  const globalIndex = filteredLogs.findIndex(l => l.id === log.id);
                  const rowNumber = filteredLogs.length - globalIndex;
                  return (
                    <tr 
                      key={log.id} 
                      className="hover:bg-primary/[0.05] cursor-pointer transition-colors duration-200" 
                      style={{ animation: `fade-in 0.3s ease-out ${i * 0.03}s both` }}
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-foreground/40 font-medium text-xs">
                        {highlightText(rowNumber.toString(), searchQuery)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-foreground/50 font-medium">
                        {highlightText(formatTimestamp(log.timestamp), searchQuery)}
                      </td>
                    <td className="px-4 py-3">
                      <span className={`px-3 py-1 rounded-full text-[0.65rem] font-bold tracking-wider uppercase shadow-sm ${
                        log.category === 'INVENTORY' ? 'bg-orange-100 text-orange-700' :
                        log.category === 'EMPLOYEE' ? 'bg-blue-100 text-blue-700' :
                        log.category === 'ORDER' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {highlightText(log.category, searchQuery)}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold" style={{ color: "hsl(140, 20%, 30%)" }}>{highlightText(formatAction(log.action), searchQuery)}</td>
                    <td className="px-6 py-4 font-medium text-foreground/70">{highlightText(log.actor_name || t("m.systemActor") || "", searchQuery)}</td>
                    <td className="px-6 py-4 font-medium text-foreground/90">{highlightText(String(log.target_name || log.target_id || "—"), searchQuery)}</td>
                    <td className="px-4 py-3 text-foreground/60 max-w-[28rem] break-words italic" title={formatDetails(log.details)}>
                      {highlightText(formatDetails(log.details), searchQuery)}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls - Bottom */}
        {filteredLogs.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-foreground/5 bg-white/40">
            <div className="flex items-center gap-2 text-xs text-foreground/60">
              <span>Show</span>
              <select
                value={rowsPerPage === 50 ? "50" : rowsPerPage === 10 ? "10" : rowsPerPage === 20 ? "20" : rowsPerPage === 40 ? "40" : "custom"}
                onChange={(e) => handleRowsPerPageChange(e.target.value)}
                className="h-7 px-2 rounded border border-gray-200 bg-white text-xs"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="50">50</option>
                <option value="custom">Custom</option>
              </select>
              {rowsPerPage !== 10 && rowsPerPage !== 20 && rowsPerPage !== 40 && rowsPerPage !== 50 && (
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={rowsPerPage}
                  onChange={handleCustomRowsPerPage}
                  className="h-7 w-16 px-2 rounded border border-gray-200 bg-white text-xs"
                  placeholder="50"
                />
              )}
              <span>rows per page</span>
              <span className="text-foreground/40">|</span>
              <span>{(currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, filteredLogs.length)} of {filteredLogs.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-7 w-7 rounded border border-gray-200 bg-white text-xs hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {"<"}
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`h-7 w-7 rounded border text-xs flex items-center justify-center ${
                      currentPage === pageNum
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-7 w-7 rounded border border-gray-200 bg-white text-xs hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {">"}
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="overflow-hidden border-0 shadow-2xl rounded-3xl bg-white/95 backdrop-blur-xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-foreground/5 bg-foreground/[0.02]">
            <DialogTitle className="flex items-center gap-3 text-2xl font-1" style={{ color: "hsl(140, 30%, 20%)" }}>
              <FileText className="h-6 w-6 text-primary" />
              {t("m.archiveRecord")}
            </DialogTitle>
            <DialogDescription className="font-medium text-foreground/50">
              {selectedLog && formatTimestamp(selectedLog.timestamp)}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="p-6 space-y-6 max-h-[calc(75vh-140px)] overflow-y-auto custom-scrollbar">
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
