import { useEffect, useMemo, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDateTime12Hour } from "@/lib/timeFormat";
import { DateInputPicker } from "@/components/ui/DateInputPicker";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  deleteDataCleanupRecords,
  fetchDataCleanupDatasets,
  fetchDataCleanupRecords,
  type DataCleanupDataset,
  type DataCleanupFilters,
  type DataCleanupRecord,
} from "@/lib/api";
import { safeConsoleError } from "@/lib/safeConsole";

const PAGE_SIZE = 50;
const MAX_DELETE_COUNT = 10_000;

const FILTER_LABELS: Record<string, string> = {
  status: "Status",
  rating: "Rating",
  paymentStatus: "Payment status",
  tableId: "Table ID",
  type: "Type",
  category: "Category",
  availability: "Availability",
  department: "Department",
  jobType: "Job type",
  affectsPrice: "Price discount",
  section: "Repository section",
  priority: "Priority",
  action: "Action",
  source: "Image source",
};

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? value : formatDateTime12Hour(parsed);
};

export const DataCleanupTab = () => {
  const { t } = useTranslation();
  const [datasets, setDatasets] = useState<DataCleanupDataset[]>([]);
  const [datasetKey, setDatasetKey] = useState("");
  const [filters, setFilters] = useState<DataCleanupFilters>({ search: "", from: "", to: "" });
  const [rows, setRows] = useState<DataCleanupRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRecords, setSelectedRecords] = useState<Map<string, DataCleanupRecord>>(new Map());
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [pasteAttempted, setPasteAttempted] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dataset = datasets.find((item) => item.key === datasetKey);
  const selectedCount = allMatchingSelected ? Math.max(0, total - excludedIds.size) : selectedIds.size;
  const selectionActive = allMatchingSelected || selectedIds.size > 0;
  const isRecordSelected = (id: string) => allMatchingSelected ? !excludedIds.has(id) : selectedIds.has(id);
  const currentPageFullySelected = rows.length > 0 && rows.every((row) => isRecordSelected(row.id));
  const expectedConfirmation = dataset
    ? `DELETE ${selectedCount} ${dataset.label.toUpperCase()}`
    : "";
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterKeys = useMemo(() => Object.keys(dataset?.filters || {}), [dataset]);
  const activeFilters = Object.entries(filters)
    .filter(([key, value]) => value && key !== "search")
    .map(([key, value]) => `${FILTER_LABELS[key] || key}: ${value}`);
  const reviewExamples = allMatchingSelected
    ? rows.filter((row) => !excludedIds.has(row.id)).slice(0, 5)
    : [...selectedRecords.values()].slice(0, 5);

  useEffect(() => {
    let active = true;
    fetchDataCleanupDatasets()
      .then(({ datasets: available }) => {
        if (!active) return;
        setDatasets(available);
        setDatasetKey(available[0]?.key || "");
      })
      .catch((error: unknown) => {
        safeConsoleError("Failed to load cleanup categories", error);
        toast.error(t("m.dataCleanup.loadFailed"));
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (!datasetKey) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchDataCleanupRecords(datasetKey, filters, page, PAGE_SIZE)
        .then((result) => {
          if (!active) return;
          setRows(result.rows);
          setTotal(result.total);
        })
        .catch((error: unknown) => {
          safeConsoleError("Failed to load cleanup records", error);
          toast.error(t("m.dataCleanup.recordsFailed"));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, filters.search ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [datasetKey, filters, page, t]);

  const resetSelection = () => {
    setSelectedIds(new Set());
    setSelectedRecords(new Map());
    setAllMatchingSelected(false);
    setExcludedIds(new Set());
  };

  const updateFilter = (key: string, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
    resetSelection();
  };

  const toggleRecord = (id: string) => {
    if (allMatchingSelected) {
      setExcludedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    const record = rows.find((row) => row.id === id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedRecords((current) => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id);
      else if (record) next.set(id, record);
      return next;
    });
  };

  const selectCurrentPage = () => {
    setAllMatchingSelected(false);
    setExcludedIds(new Set());
    setSelectedIds((current) => new Set([...current, ...rows.map((row) => row.id)]));
    setSelectedRecords((current) => new Map([...current, ...rows.map((row) => [row.id, row] as const)]));
  };

  const openDeleteReview = () => {
    if (!dataset || selectedCount === 0 || selectedCount > MAX_DELETE_COUNT) return;
    setConfirmationText("");
    setPasteAttempted(false);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!dataset || selectedCount === 0 || selectedCount > MAX_DELETE_COUNT) return;
    setDeleting(true);
    try {
      const result = await deleteDataCleanupRecords({
        dataset: dataset.key,
        ids: allMatchingSelected ? undefined : [...selectedIds],
        filters,
        allMatching: allMatchingSelected,
        excludedIds: allMatchingSelected ? [...excludedIds] : undefined,
        expectedCount: selectedCount,
        confirmationText,
      });
      setConfirmOpen(false);
      resetSelection();
      toast.success(t("m.dataCleanup.deleted", { count: result.deleted }));
      if (result.warnings.length) {
        safeConsoleError("Data cleanup completed with warnings", result.warnings);
        toast.warning(t("m.dataCleanup.deleteWarning", { count: result.warnings.length }));
      }
      const refreshed = await fetchDataCleanupRecords(dataset.key, filters, page, PAGE_SIZE);
      setRows(refreshed.rows);
      setTotal(refreshed.total);
      if (refreshed.rows.length === 0 && page > 1) setPage((current) => current - 1);
    } catch (error: unknown) {
      safeConsoleError("Bulk data deletion failed", error);
      toast.error(t("m.dataCleanup.deleteFailed"));
      if (typeof error === "object" && error !== null && "status" in error && error.status === 409) {
        setConfirmOpen(false);
        resetSelection();
        setPage(1);
      }
    } finally {
      setDeleting(false);
    }
  };

  const toggleAllOnPage = (checked: boolean) => {
    if (allMatchingSelected) {
      setExcludedIds((current) => {
        const next = new Set(current);
        rows.forEach((row) => {
          if (checked) next.delete(row.id);
          else next.add(row.id);
        });
        return next;
      });
      return;
    }
    if (checked) selectCurrentPage();
    else {
      setSelectedIds((current) => {
        const next = new Set(current);
        rows.forEach((row) => next.delete(row.id));
        return next;
      });
      setSelectedRecords((current) => {
        const next = new Map(current);
        rows.forEach((row) => next.delete(row.id));
        return next;
      });
    }
  };

  const preventPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    setPasteAttempted(true);
  };

  const preventDrop = (event: DragEvent<HTMLInputElement>) => {
    event.preventDefault();
    setPasteAttempted(true);
  };

  const preventPasteShortcut = (event: KeyboardEvent<HTMLInputElement>) => {
    const key = event.key.toLowerCase();
    if (((event.ctrlKey || event.metaKey) && key === "v") || (event.shiftKey && key === "insert")) {
      event.preventDefault();
      setPasteAttempted(true);
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <header className="flex items-start gap-3">
        <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <h3 className="font-bold text-gray-900">{t("m.dataCleanup.title")}</h3>
          <p className="mt-1 text-sm text-gray-600">{t("m.dataCleanup.description")}</p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label>{t("m.dataCleanup.dataType")}</Label>
          <Select
            value={datasetKey}
            onValueChange={(value) => {
              setDatasetKey(value);
              setFilters({ search: "", from: "", to: "" });
              setPage(1);
              resetSelection();
            }}
          >
            <SelectTrigger><SelectValue placeholder={t("m.dataCleanup.dataType")} /></SelectTrigger>
            <SelectContent>
              {datasets.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cleanup-search">{t("m.dataCleanup.search")}</Label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input id="cleanup-search" className="pl-9" value={filters.search || ""} onChange={(event) => updateFilter("search", event.target.value)} />
          </div>
        </div>
        {dataset?.dateFilter && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="cleanup-from">{t("m.dataCleanup.from")}</Label>
              <DateInputPicker
                id="cleanup-from"
                label={t("m.dataCleanup.from")}
                value={filters.from || ""}
                onChange={(value) => updateFilter("from", value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cleanup-to">{t("m.dataCleanup.to")}</Label>
              <DateInputPicker
                id="cleanup-to"
                label={t("m.dataCleanup.to")}
                value={filters.to || ""}
                onChange={(value) => updateFilter("to", value)}
              />
            </div>
          </>
        )}
        {filterKeys.map((key) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`cleanup-filter-${key}`}>{FILTER_LABELS[key] || key}</Label>
            {dataset?.filters[key]?.length ? (
              <Select value={filters[key] || "any"} onValueChange={(value) => updateFilter(key, value === "any" ? "" : value)}>
                <SelectTrigger id={`cleanup-filter-${key}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t("m.dataCleanup.any")}</SelectItem>
                  {dataset.filters[key].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input id={`cleanup-filter-${key}`} value={filters[key] || ""} onChange={(event) => updateFilter(key, event.target.value)} />
            )}
          </div>
        ))}
      </div>

      {dataset && <p className="text-sm text-muted-foreground">{dataset.impact}</p>}
      {(total > MAX_DELETE_COUNT || selectedCount > MAX_DELETE_COUNT) && (
        <p className="text-sm font-medium text-amber-800">{t("m.dataCleanup.batchLimit", { count: MAX_DELETE_COUNT })}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 text-sm font-medium">
          <p>{t("m.dataCleanup.matching", { count: total })}</p>
          {allMatchingSelected && (
            <p role="status" className="text-emerald-700">
              {t("m.dataCleanup.selectedAcrossPages", { count: selectedCount })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {rows.length > 0 && (
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => toggleAllOnPage(!currentPageFullySelected)}>
              {t(currentPageFullySelected ? "m.dataCleanup.deselectPage" : "m.dataCleanup.selectPage")}
            </Button>
          )}
          {total > rows.length && total <= MAX_DELETE_COUNT && !allMatchingSelected && (
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => { setAllMatchingSelected(true); setSelectedIds(new Set()); setSelectedRecords(new Map()); setExcludedIds(new Set()); }}>
              {t("m.dataCleanup.selectAll", { count: total })}
            </Button>
          )}
          {selectedCount > 0 && (
            <Button type="button" variant="destructive" size="sm" disabled={loading || selectedCount > MAX_DELETE_COUNT} onClick={openDeleteReview}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("m.dataCleanup.deleteSelected", { count: selectedCount })}
            </Button>
          )}
          {selectionActive && (
            <Button type="button" variant="ghost" size="sm" onClick={resetSelection}>
              {t("m.dataCleanup.clearSelection")}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  aria-label={t(currentPageFullySelected ? "m.dataCleanup.deselectPage" : "m.dataCleanup.selectPage")}
                  checked={currentPageFullySelected}
                  disabled={loading}
                  onChange={(event) => toggleAllOnPage(event.target.checked)}
                />
              </th>
              <th className="p-3">{t("m.dataCleanup.record")}</th>
              <th className="p-3">{t("m.dataCleanup.type")}</th>
              <th className="p-3">{t("m.dataCleanup.date")}</th>
              <th className="p-3">{t("m.dataCleanup.details")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{t("m.dataCleanup.empty")}</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-muted/20">
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={t("m.dataCleanup.selectRecord", { record: row.label })}
                    checked={isRecordSelected(row.id)}
                    disabled={loading}
                    onChange={() => toggleRecord(row.id)}
                  />
                </td>
                <td className="max-w-[240px] truncate p-3 font-medium" title={row.label}>{row.label}</td>
                <td className="p-3">{row.type}</td>
                <td className="whitespace-nowrap p-3">{formatDate(row.created_at)}</td>
                <td className="max-w-[360px] truncate p-3 text-muted-foreground" title={row.details}>{row.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">{t("m.dataCleanup.page", { page, pages: pageCount })}</span>
        <Button type="button" variant="outline" size="icon" aria-label={t("m.dataCleanup.previous")} disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label={t("m.dataCleanup.next")} disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </footer>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("m.dataCleanup.confirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("m.dataCleanup.confirmDescription", { count: selectedCount, type: dataset?.label || "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
            <p className="font-semibold">{dataset?.impact}</p>
            <p className="mt-2">
              {allMatchingSelected && excludedIds.size === 0 ? t("m.dataCleanup.allFiltered") : t("m.dataCleanup.selectedRows")}
              {activeFilters.length > 0 && ` ${activeFilters.join(" · ")}`}
              {filters.search && ` · ${t("m.dataCleanup.search")}: “${filters.search}”`}
            </p>
            {reviewExamples.length > 0 && (
              <ul className="mt-2 list-inside list-disc">
                {reviewExamples.map((row) => <li key={row.id}>{row.label}</li>)}
                {selectedCount > reviewExamples.length && (
                  <li>{t("m.dataCleanup.moreRows", { count: selectedCount - reviewExamples.length })}</li>
                )}
              </ul>
            )}
            <p className="mt-2">{t("m.dataCleanup.irreversible")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cleanup-confirmation">{t("m.dataCleanup.typeToConfirm", { phrase: expectedConfirmation })}</Label>
            <Input
              id="cleanup-confirmation"
              aria-describedby="cleanup-confirmation-help"
              autoComplete="off"
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              onPaste={preventPaste}
              onDrop={preventDrop}
              onKeyDown={preventPasteShortcut}
            />
            <p
              id="cleanup-confirmation-help"
              className={`text-xs ${pasteAttempted ? "font-medium text-destructive" : "text-muted-foreground"}`}
              role={pasteAttempted ? "alert" : undefined}
            >
              {t("m.dataCleanup.manualEntryOnly")}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setConfirmOpen(false)}>{t("m.dataCleanup.cancel")}</Button>
            <Button type="button" variant="destructive" disabled={deleting || confirmationText !== expectedConfirmation} onClick={() => void confirmDelete()}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {t("m.dataCleanup.deleteNow")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};
