/*
 * SettingsTab.tsx — Global configuration and manager profile UI.
 *
 * The component centralizes restaurant-wide settings, including:
 *   • Working hours that trigger automatic employee logout.
 *   • Manager profile editing with password change support.
 *   • Backup and printer controls, plus a gated system-update card.
 *
 * The UI uses our design system's Card, Input, and Button components to present
 * a clean, accessible form. State is persisted through the backend API and
 * reflected instantly in the UI via optimistic updates.
 */
import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CardSkeleton } from "@/components/ui/LoadingSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSettings, updateSetting, fetchManagerProfile, updateManagerProfile, fetchBackups, fetchCloudBackups, createBackup, restoreBackup, restoreCloudBackup, restoreUploadedBackup, downloadBackup, fetchDataResetOptions, performDataReset, applyDefaultCardSize, fetchPatterns, BackupFile, checkSystemVersion, performSystemUpdate, requestSystemShutdown, VersionCheckResult } from "@/lib/api";
import { CheckCircle2, Eye, EyeOff, Loader2, Database, DownloadCloud, UploadCloud, CloudDownload, AlertCircle, Percent, AlertTriangle, RefreshCw, Printer, Wifi, Cable, Bluetooth, Search, Check, FileText, Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWebSocket } from "@/lib/useWebSocket";
import { notifyServerShutdownRequested } from "@/lib/useServerConnectionNotice";
import { safeConsoleError } from "@/lib/safeConsole";
import { DataCleanupTab } from "./DataCleanupTab";

type ReceiptCopies = {
  order_customer?: number;
  order_kitchen?: number;
  addon_customer?: number;
  addon_kitchen?: number;
  final_receipt?: number;
  daily_sales_report?: number;
};

type PrinterPreferences = {
  receipt_copies?: { global?: ReceiptCopies };
  [key: string]: unknown;
};

type DiscoveredPrinter = {
  name: string;
  connectionType?: string;
  status?: string;
  driver?: string;
  port?: string;
};

type PrinterApiResponse = { success: boolean; message?: string };
type PrinterJobReview = {
  id: number;
  orderId: number | null;
  jobType: string;
  printerName: string;
  status: "submitting" | "uncertain";
  errorMessage: string | null;
  createdAt: string;
};
type PrinterDiscoveryResponse = PrinterApiResponse & {
  printers?: DiscoveredPrinter[];
};
type PrinterSettingsResponse = PrinterApiResponse & {
  selectedPrinter?: string;
  defaultPrinter?: string;
  printerPreferences?: PrinterPreferences;
};
type SampleTicketResponse = PrinterApiResponse & { ticket?: string };
type SampleTicketType = "order_customer" | "order_kitchen" | "addon_customer" | "addon_kitchen" | "final_receipt" | "daily_sales_report";
type SampleTicketLine = { text: string; alignment: "left" | "center" | "right" };

const SAMPLE_TICKET_TYPES: { value: SampleTicketType; label: string }[] = [
  { value: "order_customer", label: "New Order — Customer Copy" },
  { value: "order_kitchen", label: "New Order — Kitchen Copy" },
  { value: "addon_customer", label: "Add-on — Customer Copy" },
  { value: "addon_kitchen", label: "Add-on — Kitchen Copy" },
  { value: "final_receipt", label: "Final Receipt" },
  { value: "daily_sales_report", label: "Daily Sales Report" }
];

const isSampleTicketType = (value: string): value is SampleTicketType =>
  SAMPLE_TICKET_TYPES.some((ticketType) => ticketType.value === value);

const parseSampleTicketLines = (ticket: string): SampleTicketLine[] =>
  ticket.split(/\r?\n/).map((line) => {
    if (line.startsWith("[CENTER]")) return { text: line.slice(8), alignment: "center" };
    if (line.startsWith("[RIGHT]")) return { text: line.slice(7), alignment: "right" };
    if (line.startsWith("[LEFT]")) return { text: line.slice(6), alignment: "left" };
    return { text: line, alignment: "left" };
  });

const DEFAULT_TEST_TICKET = [
  "BP DRAGONFLY GARDEN",
  "PRINTER TEST",
  "--------------------------------",
  "This is a printer test ticket.",
  "Thank you!"
].join("\n");
const getErrorMessage = (error: unknown, fallback = "Unknown error") =>
  error instanceof Error ? error.message : fallback;

const getErrorStatus = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;

const isCardSize = (value: string): value is "normal" | "large" | "extra_large" =>
  value === "normal" || value === "large" || value === "extra_large";

export const SettingsTab = () => {
  const { t } = useTranslation();
  const [hours, setHours] = useState({ start: "09:00", end: "22:00" });
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursSaved, setHoursSaved] = useState(false);

  const [profile, setProfile] = useState({ name: "", id: "", email: "", phone: "" });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [cloudBackups, setCloudBackups] = useState<BackupFile[]>([]);
  const [backupName, setBackupName] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{text: string, isError: boolean} | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState<string | null>(null);
  const [activeRestoreSource, setActiveRestoreSource] = useState<"local"|"cloud"|null>(null);
  const [uploadingBackup, setUploadingBackup] = useState(false);

  // In-app restore confirmation & result dialogs
  const [restoreConfirmFile, setRestoreConfirmFile] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<{ message: string; isError: boolean } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [resetOptions, setResetOptions] = useState<{ key: string; label: string; description: string }[]>([]);
  const [resetCategory, setResetCategory] = useState<string>("all_data");
  const [resetConfirmationInput, setResetConfirmationInput] = useState("");
  const [resetSentenceExpected, setResetSentenceExpected] = useState("");
  const [resetPasswordInput, setResetPasswordInput] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Tax & service charge settings
  const [sstEnabled, setSstEnabled] = useState(true);
  const [sstPercent, setSstPercent] = useState("6");
  const [scEnabled, setScEnabled] = useState(true);
  const [scPercent, setScPercent] = useState("10");
  const [taxSaved, setTaxSaved] = useState(false);
  const [taxSaving, setTaxSaving] = useState(false);
  const [defaultCardSize, setDefaultCardSize] = useState<"normal"|"large"|"extra_large">("normal");
  const [cardSizeSaved, setCardSizeSaved] = useState(false);
  const [applyingCardSize, setApplyingCardSize] = useState(false);
  const [patterns, setPatterns] = useState<{ id: number; name: string; image_url: string }[]>([]);
  const [defaultPatternId, setDefaultPatternId] = useState<number | null>(null);
  const [defaultPatternSaved, setDefaultPatternSaved] = useState(false);

  // System update state
  const [updateCheckLoading, setUpdateCheckLoading] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionCheckResult | null>(null);
  const [updateInProgress, setUpdateInProgress] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [shutdownRequested, setShutdownRequested] = useState(false);
  const [shutdownError, setShutdownError] = useState<string | null>(null);

  // Printer management state
  const [printers, setPrinters] = useState<DiscoveredPrinter[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [defaultPrinter, setDefaultPrinter] = useState("");
  const [printerPreferences, setPrinterPreferences] = useState<PrinterPreferences>({});
  const [testPrintLoading, setTestPrintLoading] = useState<string | null>(null);
  const [testPrintResult, setTestPrintResult] = useState<{
    printerName: string;
    success: boolean;
    message: string;
  } | null>(null);
  const [printerSettingsLoading, setPrinterSettingsLoading] = useState(false);
  const hasLoadedPrinterSettingsRef = useRef(false);
  const [printerChoiceSaving, setPrinterChoiceSaving] = useState<{
    printerName: string;
    choice: "active" | "default";
  } | null>(null);

  const [ticketPreview, setTicketPreview] = useState("");
  const [savedTicketPreview, setSavedTicketPreview] = useState("");
  const [editingTicketPreview, setEditingTicketPreview] = useState(false);
  const [ticketPreviewSaving, setTicketPreviewSaving] = useState(false);
  const [ticketPreviewHasBeenSaved, setTicketPreviewHasBeenSaved] = useState(false);
  const ticketPreviewValueRef = useRef(ticketPreview);
  const ticketPreviewContentRef = useRef<HTMLPreElement>(null);
  const [sampleTicketType, setSampleTicketType] = useState<SampleTicketType>("order_customer");
  const [sampleTicket, setSampleTicket] = useState("");
  const [sampleTicketLoading, setSampleTicketLoading] = useState(false);
  const [sampleTicketError, setSampleTicketError] = useState<string | null>(null);
  const [printingSampleTicket, setPrintingSampleTicket] = useState(false);
  const [receiptCopiesSaving, setReceiptCopiesSaving] = useState(false);
  const [receiptCopiesSaved, setReceiptCopiesSaved] = useState(false);
  
  // Receipt copy counts
  const [orderCustomerCopies, setOrderCustomerCopies] = useState(1);
  const [orderKitchenCopies, setOrderKitchenCopies] = useState(1);
  const [addonCustomerCopies, setAddonCustomerCopies] = useState(1);
  const [addonKitchenCopies, setAddonKitchenCopies] = useState(1);
  const [finalReceiptCopies, setFinalReceiptCopies] = useState(1);
  const [dailySalesReportCopies, setDailySalesReportCopies] = useState(1);
  const [printingDailyReport, setPrintingDailyReport] = useState(false);
  const [printingTestTicket, setPrintingTestTicket] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState<string | undefined>();

  // Confirmation dialog state

  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
    pending: boolean;
  }>({ open: false, title: "", description: "", onConfirm: async () => {}, pending: false });

  ticketPreviewValueRef.current = ticketPreview;

  useEffect(() => {
    const preview = ticketPreviewContentRef.current;
    if (!preview) return;
    preview.textContent = ticketPreviewValueRef.current;
    if (editingTicketPreview) preview.focus();
  }, [editingTicketPreview]);

  useEffect(() => {
    loadAll();
  }, []);

  // WebSocket listener for real-time settings updates
  useWebSocket([
    "SETTINGS_UPDATE",
    "MENU_UPDATE",
    "BACKUP_UPDATE",
    "DATA_REFRESH",
    "PRINTER_SETTINGS_UPDATE",
    "PRINT_JOB_REVIEW_REQUIRED",
    "PRINT_JOB_REVIEW_UPDATED",
    "CONNECTION_RESTORED",
  ], (event) => {
    if (event.type === "SETTINGS_UPDATE" || event.type === "DATA_REFRESH" || event.type === "CONNECTION_RESTORED") {
      void loadAll();
    }
    if (
      event.type === "PRINTER_SETTINGS_UPDATE" ||
      event.type === "DATA_REFRESH" ||
      event.type === "CONNECTION_RESTORED"
    ) {
      void loadPrinterSettings();
    }
    if (event.type === "MENU_UPDATE") {
      const payload = event.payload as { reason?: string };
      if (payload?.reason !== "inventory" && payload?.reason !== "order_inventory") {
        void fetchPatterns()
          .then((data) => setPatterns(data || []))
          .catch((error) => safeConsoleError("Failed to refresh settings patterns", error));
      }
    }
    if (event.type === "BACKUP_UPDATE") {
      void loadBackups();
      void loadCloudBackups();
    }
    if (
      event.type === "PRINT_JOB_REVIEW_REQUIRED" ||
      event.type === "PRINT_JOB_REVIEW_UPDATED" ||
      event.type === "DATA_REFRESH" ||
      event.type === "CONNECTION_RESTORED"
    ) {
      void loadPrinterJobs();
    }
  });

  const loadAll = async () => {
    let data: Awaited<ReturnType<typeof fetchSettings>> | null = null;
    try {
      data = await fetchSettings();
      if (data?.work_hours) setHours(data.work_hours);
      if (typeof data?.default_card_size === "string" && isCardSize(data.default_card_size)) {
        setDefaultCardSize(data.default_card_size);
      }
      // Load tax settings
      setSstEnabled(data?.sst_enabled !== false && data?.sst_enabled !== 'false');
      setSstPercent(data?.sst_rate !== undefined ? String(Math.round(parseFloat(String(data.sst_rate)) * 100)) : "6");
      setScEnabled(data?.service_charge_enabled !== false && data?.service_charge_enabled !== 'false');
      setScPercent(data?.service_charge_rate !== undefined ? String(Math.round(parseFloat(String(data.service_charge_rate)) * 100)) : "10");
    } catch (e) { safeConsoleError("Settings load failed", e); }
    finally { setHoursLoading(false); }

    try {
      const patternsData = await fetchPatterns();
      setPatterns(patternsData || []);
      if (data?.default_pattern_id) {
        setDefaultPatternId(Number(data.default_pattern_id));
      }
    } catch (e) {
      safeConsoleError("Failed to load default patterns", e);
    }

    try {
      const p = await fetchManagerProfile();
      setProfile({ name: p.name || "", id: p.id || "", email: p.email || "", phone: p.phone || "" });
    } catch (e) { safeConsoleError("Profile load failed", e); }

    await Promise.all([loadBackups(), loadCloudBackups(), loadResetOptions()]);
  };

  const loadResetOptions = async () => {
    try {
      const data = await fetchDataResetOptions();
      setResetOptions(data.options || []);
      setResetCategory(data.options?.[0]?.key || "all_data");
      setResetSentenceExpected(data.confirmationSentence || "");
    } catch (e) {
      safeConsoleError("Failed to load data reset options", e);
    }
  };

  const loadBackups = async () => {
    try {
      const data = await fetchBackups();
      setBackups(data || []);
      
      // Auto-generate a default name for new backups
      const dateStr = new Date().toISOString().split('T')[0];
      setBackupName(`backup_${dateStr}`);
    } catch (e) {
      safeConsoleError("Failed to load backups", e);
    }
  };

  const loadCloudBackups = async () => {
    try {
      const data = await fetchCloudBackups();
      setCloudBackups(data || []);
    } catch (e) {
      safeConsoleError("Failed to load cloud backups", e);
    }
  };

  const showConfirmation = (title: string, description: string, onConfirm: () => Promise<void>) => {
    setConfirmationDialog({ open: true, title, description, onConfirm, pending: false });
  };

  const handleConfirmationConfirm = async () => {
    setConfirmationDialog(prev => ({ ...prev, pending: true }));
    try {
      await confirmationDialog.onConfirm();
    } finally {
      setConfirmationDialog({ open: false, title: "", description: "", onConfirm: async () => {}, pending: false });
    }
  };

  // System update functions
  const handleCheckForUpdates = async () => {
    setUpdateCheckLoading(true);
    setUpdateAvailable(false);
    setVersionInfo(null);
    setUpdateMsg(null);
    try {
      const result = await checkSystemVersion();
      setVersionInfo(result);
      setUpdateAvailable(result.needs_update && result.can_update);
      if (!result.needs_update) {
        setUpdateMsg({ text: "✅ App is already up to date.", isError: false });
      } else if (!result.can_update) {
        setUpdateMsg({
          text: `⚠️ An update is available, but it cannot be applied automatically. ${result.reason || "Use the documented maintenance update procedure."}`,
          isError: true,
        });
      }
    } catch (err: unknown) {
      safeConsoleError("Version check failed", err);
      setUpdateMsg({ text: `❌ Failed to check for updates: ${getErrorMessage(err)}`, isError: true });
    } finally {
      setUpdateCheckLoading(false);
    }
  };

  const handlePerformUpdate = async () => {
    const reviewedCommit = versionInfo?.latest_commit;
    if (!reviewedCommit || !versionInfo?.can_update) {
      setUpdateMsg({ text: "Check for updates again before applying an update.", isError: true });
      return;
    }
    showConfirmation(
      "Confirm System Update",
      `DragonFly Garden will validate commit ${reviewedCommit.slice(0, 12)} in a separate temporary worktree, run backend tests, build the frontend, then fast-forward this installation. It will not change restaurant data or .env files. Make sure a current backup is verified and no orders or payments are in progress. The backend must be restarted afterward. Continue?`,
      async () => {
        setUpdateInProgress(true);
        setUpdateMsg({ text: "Validating the update in a temporary workspace. This may take several minutes...", isError: false });
        try {
          const result = await performSystemUpdate(reviewedCommit);
          if (result.success) {
            setUpdateAvailable(false);
            setVersionInfo((current) => current
              ? { ...current, current_commit: result.commit || reviewedCommit, needs_update: false, can_update: false }
              : current);
            setUpdateMsg({
              text: `✅ ${result.message} ${result.restart_instructions || "Restart the backend before using the updated system."} The displayed version refreshes after restart.`,
              isError: false,
            });
          } else {
            setUpdateMsg({ text: `⚠️ ${result.message}`, isError: true });
          }
        } catch (err: unknown) {
          safeConsoleError("Update failed", err);
          setUpdateMsg({ text: `❌ Update failed: ${getErrorMessage(err)}`, isError: true });
        } finally {
          setUpdateInProgress(false);
        }
      }
    );
  };

  const handleRequestShutdown = () => {
    showConfirmation(
      "Stop DragonFly Garden?",
      "Make sure no orders or payments are in progress. This will stop new requests, disconnect open browser sessions, and then wait for active background work before closing the database. The app will not be available again until the server is started using its normal startup method. Proceed?",
      async () => {
        setShutdownError(null);
        try {
          const result = await requestSystemShutdown();
          if (!result.success) {
            throw new Error(result.message || "The server did not accept the shutdown request.");
          }
          setShutdownRequested(true);
          notifyServerShutdownRequested();
        } catch (err: unknown) {
          safeConsoleError("Server shutdown request failed", err);
          setShutdownError(getErrorMessage(err));
        }
      }
    );
  };

  const saveTaxSettings = async () => {
    showConfirmation(
      "Confirm tax settings",
      "These changes will affect all new orders and receipts.",
      async () => {
        setTaxSaving(true);
        try {
          await updateSetting("sst_enabled", String(sstEnabled));
          await updateSetting("sst_rate", String(parseFloat(sstPercent) / 100));
          await updateSetting("service_charge_enabled", String(scEnabled));
          await updateSetting("service_charge_rate", String(parseFloat(scPercent) / 100));
          setTaxSaved(true);
          setTimeout(() => setTaxSaved(false), 2500);
        } finally {
          setTaxSaving(false);
        }
      }
    );
  };

  const saveDefaultCardSize = async () => {
    showConfirmation(
      "Confirm default card size",
      "This will set the default size for newly created menu items and update customer-facing card layouts.",
      async () => {
        try {
          await updateSetting("default_card_size", defaultCardSize);
          setCardSizeSaved(true);
          setTimeout(() => setCardSizeSaved(false), 2500);
        } catch (e) { safeConsoleError("Failed to save default card size", e); }
      }
    );
  };

  const saveDefaultPattern = async () => {
    showConfirmation(
      "Confirm default pattern",
      "This will update the default menu pattern overlay used for items without their own custom pattern.",
      async () => {
        try {
          await updateSetting("default_pattern_id", defaultPatternId);
          setDefaultPatternSaved(true);
          setTimeout(() => setDefaultPatternSaved(false), 2500);
        } catch (e) {
          safeConsoleError("Failed to load saved printer state", e);
        }
      }
    );
  };

  // Printer management functions
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [printerJobs, setPrinterJobs] = useState<PrinterJobReview[]>([]);
  const [printerJobsLoading, setPrinterJobsLoading] = useState(false);
  const hasLoadedPrinterJobsRef = useRef(false);

  const loadPrinterJobs = useCallback(async (showLoading = false) => {
    if (showLoading || !hasLoadedPrinterJobsRef.current) setPrinterJobsLoading(true);
    try {
      const response = await fetch("/management/printers/jobs/review", {
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      });
      const data: { success: boolean; jobs?: PrinterJobReview[]; message?: string } = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Request failed (HTTP ${response.status})`);
      }
      setPrinterJobs(data.jobs || []);
      hasLoadedPrinterJobsRef.current = true;
    } catch (error: unknown) {
      safeConsoleError("Failed to load printer jobs needing review", error);
      toast.error(`Could not load printer job status: ${getErrorMessage(error)}`);
    } finally {
      setPrinterJobsLoading(false);
    }
  }, []);

  const acknowledgePrinterJob = async (jobId: number) => {
    if (!window.confirm("Have you checked the printer and verified whether this ticket printed? This only marks the alert reviewed; it will not reprint the ticket.")) return;
    try {
      const response = await fetch(`/management/printers/jobs/${jobId}/acknowledge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      });
      const data: PrinterApiResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Request failed (HTTP ${response.status})`);
      }
      toast.success(data.message || "Printer job reviewed.");
      await loadPrinterJobs();
    } catch (error: unknown) {
      safeConsoleError(`Failed to acknowledge printer job ${jobId}`, error);
      toast.error(`Could not update printer job: ${getErrorMessage(error)}`);
    }
  };

  const discoverPrinters = useCallback(async () => {
    setPrinterError(null);
    setPrintersLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch("/management/printers/discover?refresh=true", {
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal
      });
      
      if (response.status === 401) {
        setPrinterError("Authentication failed. Your session may have expired. Please log in again.");
        setPrintersLoading(false);
        return;
      }
      
      const data: PrinterDiscoveryResponse = await response.json();
      
      if (data.success) {
        setPrinters(data.printers ?? []);
      } else {
        setPrinterError(`Failed to discover printers: ${data.message}`);
        safeConsoleError("Failed to discover printers", data.message);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setPrinterError("Request timed out. The printer discovery is taking too long. Please check your backend logs.");
      } else {
        const message = getErrorMessage(err);
        setPrinterError(`Error discovering printers: ${message}`);
        safeConsoleError("Printer discovery failed", err);
      }
    } finally {
      clearTimeout(timeoutId);
      setPrintersLoading(false);
    }
  }, []);

  const loadPrinterSettings = async () => {
    if (!hasLoadedPrinterSettingsRef.current) setPrinterSettingsLoading(true);
    try {
      const response = await fetch("/management/printers/settings", {
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const data: PrinterSettingsResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Request failed (HTTP ${response.status})`);
      }
      setSelectedPrinter(data.selectedPrinter || "");
      setDefaultPrinter(data.defaultPrinter || "");
      setPrinterPreferences(data.printerPreferences || {});
      const savedTestTicket = data.printerPreferences?.test_ticket;
      const testTicket = typeof savedTestTicket === "string" ? savedTestTicket : DEFAULT_TEST_TICKET;
      setTicketPreview(testTicket);
      setSavedTicketPreview(testTicket);
      setTicketPreviewHasBeenSaved(typeof savedTestTicket === "string");
      setEditingTicketPreview(false);

      const copies = data.printerPreferences?.receipt_copies?.global;
      setOrderCustomerCopies(copies?.order_customer ?? 1);
      setOrderKitchenCopies(copies?.order_kitchen ?? 1);
      setAddonCustomerCopies(copies?.addon_customer ?? 1);
      setAddonKitchenCopies(copies?.addon_kitchen ?? 1);
      setFinalReceiptCopies(copies?.final_receipt ?? 1);
      setDailySalesReportCopies(copies?.daily_sales_report ?? 1);
      hasLoadedPrinterSettingsRef.current = true;
    } catch (err: unknown) {
      safeConsoleError("Failed to load printer settings", err);
      toast.error(`Could not load printer settings: ${getErrorMessage(err)}`);
    } finally {
      setPrinterSettingsLoading(false);
    }
  };

  const printDailySalesReport = async () => {
    setPrintingDailyReport(true);
    try {
      const response = await fetch("/management/printers/daily-sales-report", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const data: PrinterApiResponse = await response.json();
      if (!data.success) {
        safeConsoleError("Failed to print daily sales report", data.message);
        toast.error(`Failed to print daily sales report: ${data.message || "Unknown error"}`);
      } else {
        toast.success(data.message || "Daily sales report submitted.");
      }
    } catch (err: unknown) {
      safeConsoleError("Failed to print daily sales report", err);
      toast.error(`Failed to print daily sales report: ${getErrorMessage(err)}`);
    } finally {
      setPrintingDailyReport(false);
      void loadPrinterJobs();
    }
  };

  const printSampleTicket = async () => {
    const printerName = selectedPrinter || defaultPrinter;
    if (!printerName) {
      toast.error("Choose an active or default printer before printing a sample.");
      return;
    }
    if (sampleTicketLoading || sampleTicketError || !sampleTicket.trim()) {
      toast.error("Wait for the selected sample preview to finish loading.");
      return;
    }

    setPrintingSampleTicket(true);
    try {
      const response = await fetch("/management/printers/sample-ticket/print", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: sampleTicketType })
      });
      const data: PrinterApiResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Request failed (HTTP ${response.status})`);
      }
      const sampleLabel = SAMPLE_TICKET_TYPES.find(({ value }) => value === sampleTicketType)?.label || "sample ticket";
      toast.success(data.message || `${sampleLabel} sent to ${printerName}.`);
    } catch (error: unknown) {
      safeConsoleError("Failed to print sample ticket", error);
      toast.error(`Sample print failed: ${getErrorMessage(error)}`);
    } finally {
      setPrintingSampleTicket(false);
      void loadPrinterJobs();
    }
  };

  const printTestTicket = async () => {
    if (!selectedPrinter) {
      toast.error("Select an active printer before testing.");
      return;
    }
    if (!ticketPreviewHasBeenSaved || ticketPreview !== savedTicketPreview) {
      toast.error("Save the ticket preview before printing it.");
      return;
    }
    setPrintingTestTicket(true);
    try {
      const response = await fetch("/management/printers/test", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ printerName: selectedPrinter })
      });
      const data: PrinterApiResponse = await response.json();
      if (!response.ok || !data.success) {
        safeConsoleError("Failed to print test ticket", data.message);
        toast.error(`Test print failed: ${data.message || `Request failed (HTTP ${response.status})`}`);
      } else {
        toast.success(data.message || "Test print submitted.");
      }
    } catch (err: unknown) {
      safeConsoleError("Failed to print test ticket", err);
      toast.error(`Test print failed: ${getErrorMessage(err)}`);
    } finally {
      setPrintingTestTicket(false);
      void loadPrinterJobs();
    }
  };

  const savePrinterChoice = async (printerName: string, choice: "active" | "default") => {
    if (printerChoiceSaving) return;
    if (choice === "active" ? selectedPrinter === printerName : defaultPrinter === printerName) return;

    setPrinterChoiceSaving({ printerName, choice });
    try {
      const response = await fetch("/management/printers/settings", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(choice === "active" ? { selectedPrinter: printerName } : { defaultPrinter: printerName })
      });
      const data: PrinterSettingsResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Request failed (HTTP ${response.status})`);
      }
      if (choice === "active") setSelectedPrinter(printerName);
      else setDefaultPrinter(printerName);
      setPrinterPreferences(data.printerPreferences || {});
      toast.success(choice === "active" ? "Active printer selected." : "Default printer saved.");
    } catch (err: unknown) {
      safeConsoleError(`Failed to update ${choice} printer`, err);
      toast.error(`Failed to update ${choice} printer: ${getErrorMessage(err)}`);
    } finally {
      setPrinterChoiceSaving(null);
    }
  };

  const saveReceiptCopyCounts = async () => {
    const requestedCounts = {
      order_customer: orderCustomerCopies,
      order_kitchen: orderKitchenCopies,
      addon_customer: addonCustomerCopies,
      addon_kitchen: addonKitchenCopies,
      final_receipt: finalReceiptCopies,
      daily_sales_report: dailySalesReportCopies
    };
    if (Object.values(requestedCounts).some(count => !Number.isInteger(count) || count < 1 || count > 5)) {
      toast.error("Every receipt copy count must be a whole number from 1 to 5.");
      return;
    }

    setReceiptCopiesSaving(true);
    try {
      const updatedPreferences = {
        receipt_copies: {
          global: requestedCounts
        }
      };
      const response = await fetch("/management/printers/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerPreferences: updatedPreferences })
      });
      const data: PrinterSettingsResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Request failed (HTTP ${response.status})`);
      }
      const savedCopies = data.printerPreferences?.receipt_copies?.global;
      if (!savedCopies) {
        throw new Error("The server did not confirm the saved receipt copy counts.");
      }
      const expectedCopies: ReceiptCopies = updatedPreferences.receipt_copies.global;
      for (const [type, expected] of Object.entries(expectedCopies)) {
        if (savedCopies[type as keyof ReceiptCopies] !== expected) {
          throw new Error(`The server did not confirm the saved ${type.replace(/_/g, " ")} copy count.`);
        }
      }
      setPrinterPreferences(data.printerPreferences || {});
      setOrderCustomerCopies(savedCopies.order_customer ?? 1);
      setOrderKitchenCopies(savedCopies.order_kitchen ?? 1);
      setAddonCustomerCopies(savedCopies.addon_customer ?? 1);
      setAddonKitchenCopies(savedCopies.addon_kitchen ?? 1);
      setFinalReceiptCopies(savedCopies.final_receipt ?? 1);
      setDailySalesReportCopies(savedCopies.daily_sales_report ?? 1);
      setReceiptCopiesSaved(true);
      setTimeout(() => setReceiptCopiesSaved(false), 2500);
      toast.success("Receipt copy counts saved.");
    } catch (error: unknown) {
      safeConsoleError("Failed to save receipt copy counts", error);
      toast.error(`Failed to save receipt copy counts: ${getErrorMessage(error)}`);
    } finally {
      setReceiptCopiesSaving(false);
    }
  };

  const saveTicketPreview = async () => {
    if (!ticketPreview.trim()) {
      toast.error("The test ticket cannot be empty.");
      return;
    }
    if (ticketPreview.length > 4000) {
      toast.error("The test ticket must be 4,000 characters or fewer.");
      return;
    }
    setTicketPreviewSaving(true);
    try {
      const response = await fetch("/management/printers/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testTicket: ticketPreview })
      });
      const data: PrinterSettingsResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Request failed (HTTP ${response.status})`);
      }
      setPrinterPreferences(data.printerPreferences || {});
      setSavedTicketPreview(ticketPreview);
      setTicketPreviewHasBeenSaved(true);
      setEditingTicketPreview(false);
      toast.success("Test ticket preview saved.");
    } catch (error: unknown) {
      safeConsoleError("Failed to save test ticket preview", error);
      toast.error(`Failed to save test ticket preview: ${getErrorMessage(error)}`);
    } finally {
      setTicketPreviewSaving(false);
    }
  };

  const testPrinter = async (printerName: string) => {
    if (!ticketPreviewHasBeenSaved || ticketPreview !== savedTicketPreview) {
      toast.error("Save the ticket preview before printing it.");
      return;
    }
    setTestPrintLoading(printerName);
    setTestPrintResult(null);
    try {
      const response = await fetch("/management/printers/test", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ printerName })
      });
      const data: PrinterApiResponse = await response.json();
      if (response.ok && data.success) {
        const message = data.message || `Test print queued for ${printerName}`;
        setTestPrintResult({ printerName, success: true, message });
        toast.success(message);
      } else {
        const message = data.message || `Print request failed (HTTP ${response.status})`;
        setTestPrintResult({ printerName, success: false, message });
        toast.error(`Test print failed: ${message}`);
      }
    } catch (err: unknown) {
      safeConsoleError("Test print failed", err);
      const message = getErrorMessage(err, "Could not read the printer response.");
      setTestPrintResult({ printerName, success: false, message });
      toast.error(`Test print failed: ${message}`);
    } finally {
      setTestPrintLoading(null);
    }
  };

  const getConnectionIcon = (connectionType: string) => {
    if (!connectionType) {
      return <Printer className="h-4 w-4 text-gray-600" />;
    }
    switch (connectionType.toLowerCase()) {
      case "wifi":
        return <Wifi className="h-4 w-4 text-blue-600" />;
      case "wire":
        return <Cable className="h-4 w-4 text-green-600" />;
      case "bluetooth":
        return <Bluetooth className="h-4 w-4 text-purple-600" />;
      default:
        return <Printer className="h-4 w-4 text-gray-600" />;
    }
  };

  const clearDefaultPattern = async () => {
    showConfirmation(
      "Clear default pattern",
      "This will remove the global default pattern overlay for menu items.",
      async () => {
        try {
          await updateSetting("default_pattern_id", null);
          setDefaultPatternId(null);
          setDefaultPatternSaved(true);
          setTimeout(() => setDefaultPatternSaved(false), 2500);
        } catch (e) {
          safeConsoleError("Failed to read saved card size", e);
        }
      }
    );
  };

  const handleApplyCardSizeToAll = async () => {
    showConfirmation(
      "Apply card size to all items",
      "This will update all existing menu items to the selected customer-facing card size.",
      async () => {
        setApplyingCardSize(true);
        try {
          await applyDefaultCardSize(defaultCardSize);
          await updateSetting("default_card_size", defaultCardSize);
          setCardSizeSaved(true);
          setTimeout(() => setCardSizeSaved(false), 2500);
        } catch (e) { safeConsoleError("Failed to apply card size", e); toast.error("Failed to apply card size"); }
        finally { setApplyingCardSize(false); }
      }
    );
  };

  const saveHours = async () => {
    showConfirmation(
      "Confirm working hours",
      `The restaurant operating hours will be changed to ${hours.start} - ${hours.end}.`,
      async () => {
        await updateSetting("work_hours", hours);
        setHoursSaved(true);
        setTimeout(() => setHoursSaved(false), 2500);
      }
    );
  };

  const saveProfile = async () => {
    setProfileError("");
    if (!profile.name.trim() || !profile.id.trim()) {
      setProfileError(t("m.profileNameRequired"));
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setProfileError(t("m.passwordMismatch"));
      return;
    }
    showConfirmation(
      "Confirm profile update",
      "This will update the manager profile and any password change immediately.",
      async () => {
        setProfileSaving(true);
        try {
          await updateManagerProfile({
            name: profile.name.trim(),
            id: profile.id.trim(),
            email: profile.email.trim(),
            phone: profile.phone.trim(),
            ...(newPassword ? { password: newPassword } : {}),
          });
          setNewPassword("");
          setConfirmPassword("");
          setProfileSaved(true);
          setTimeout(() => setProfileSaved(false), 2500);
        } catch (e) {
          setProfileError(e instanceof Error ? e.message : t("m.profileSaveFailed"));
        } finally {
          setProfileSaving(false);
        }
      }
    );
  };

  // Load printer settings on mount
  useEffect(() => {
    loadPrinterSettings();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadSampleTicket = async () => {
      setSampleTicketLoading(true);
      setSampleTicketError(null);
      setSampleTicket("");
      try {
        const response = await fetch(
          `/management/printers/sample-ticket?type=${encodeURIComponent(sampleTicketType)}`,
          { credentials: "include", signal: controller.signal }
        );
        const data: SampleTicketResponse = await response.json();
        if (!response.ok || !data.success || typeof data.ticket !== "string") {
          throw new Error(data.message || `Request failed (HTTP ${response.status})`);
        }
        setSampleTicket(data.ticket);
      } catch (error) {
        if (controller.signal.aborted) return;
        safeConsoleError("Failed to load sample ticket preview", error);
        setSampleTicketError(getErrorMessage(error, "Could not load this sample ticket."));
      } finally {
        if (!controller.signal.aborted) setSampleTicketLoading(false);
      }
    };

    void loadSampleTicket();
    return () => controller.abort();
  }, [sampleTicketType]);

  // Don't reload printer settings when switching printers - use local state
  // Only reload on initial mount

  // Auto-discover printers when printer accordion opens
  useEffect(() => {
    if (activeAccordion === "printers") {
      void discoverPrinters();
      void loadPrinterJobs();
    }
  }, [activeAccordion, discoverPrinters, loadPrinterJobs]);

  const handleCreateBackup = async (overwrite: boolean = false) => {
    if (!backupName.trim()) return;
    setBackupLoading(true);
    setBackupMsg(null);
    setShowOverwriteConfirm(false);

    try {
      await createBackup(backupName.trim(), overwrite);
      setBackupMsg({ text: "✅ Backup created successfully", isError: false });
      loadBackups();
      setTimeout(() => setBackupMsg(null), 3000);
    } catch (err: unknown) {
      const message = getErrorMessage(err, "");
      const alreadyExists = getErrorStatus(err) === 409 || message.toLowerCase().includes("already exists");
      if (alreadyExists && !overwrite) {
        setShowOverwriteConfirm(true);
      } else {
        setBackupMsg({ text: `⚠️ ${message || t("m.backupCreateFailed")}`, isError: true });
      }
    } finally {
      setBackupLoading(false);
    }
  };

  const performRestore = async (filename: string, source: "local" | "cloud") => {
    setRestoreLoading(filename);
    setRestoreResult(null);

    try {
      if (source === "local") {
        await restoreBackup(filename);
      } else {
        await restoreCloudBackup(filename);
      }
      setRestoreResult({ message: t("m.restoreSuccess"), isError: false });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: unknown) {
      setRestoreResult({ message: t("m.restoreFailed", { message: getErrorMessage(err) }), isError: true });
    } finally {
      setRestoreLoading(null);
    }
  };

  const handleRestoreBackup = async (filename: string, source: "local" | "cloud") => {
    showConfirmation(
      t("m.confirmRestoreBackup"),
      t("m.confirmRestoreBackupDescription", { filename, source: source === "local" ? t("m.localDevice") : t("m.cloud") }),
      async () => {
        await performRestore(filename, source);
      }
    );
  };

  const handlePerformDataReset = async () => {
    setResetLoading(true);
    setResetMessage(null);
    try {
      const selectedOption = resetOptions.find((option) => option.key === resetCategory);
      if (!selectedOption) {
        throw new Error("Please select a reset category.");
      }
      const payload: {
        category: string;
        confirmationSentence?: string;
        confirmationText?: string;
        managerPassword?: string;
      } = { category: resetCategory };

      if (selectedOption.key === "all_data") {
        payload.confirmationSentence = resetConfirmationInput.trim();
        payload.managerPassword = resetPasswordInput;
      } else {
        payload.confirmationText = resetConfirmationInput.trim();
      }

      const result = await performDataReset(payload);
      setResetMessage({
        text: result.warnings?.length
          ? `Data reset completed. ${result.warnings.join(" ")}`
          : "Data reset completed successfully.",
        isError: false,
      });
      setResetConfirmationInput("");
      setResetPasswordInput("");
      if (selectedOption.key === "all_data") {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err: unknown) {
      setResetMessage({ text: `⚠️ ${getErrorMessage(err, "Reset failed.")}`, isError: true });
    } finally {
      setResetLoading(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      await downloadBackup(filename);
    } catch (err: unknown) {
      safeConsoleError("Download failed", err);
      setBackupMsg({ text: `⚠️ ${getErrorMessage(err, "Download failed.")}`, isError: true });
    }
  };

  const handleUploadBackupFile = (file: File | null) => {
    setUploadFile(file);
    setUploadError(null);
  };

  if (hoursLoading) return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-5 w-96 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );

  return (
    <>
    <div className="space-y-6 pb-6">
      <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg text-blue-900">System Updates</CardTitle>
          </div>
          <CardDescription>Apply only clean, fast-forward updates whose commits are signed by a trusted key</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {updateMsg && (
            <div className={`p-3 rounded-lg text-sm font-medium ${
              updateMsg.isError
                ? 'bg-red-100 text-red-800 border border-red-300'
                : 'bg-green-100 text-green-800 border border-green-300'
            }`}>
              {updateMsg.text}
            </div>
          )}

          {versionInfo && !updateInProgress && (
            <div className="bg-white/70 p-3 rounded-lg border border-blue-200 text-sm">
              <div className="space-y-2">
                <div><span className="font-semibold">Current Version:</span> {versionInfo.version}</div>
                <div><span className="font-semibold">Update branch:</span> {versionInfo.branch}</div>
                <div><span className="font-semibold">Installed commit:</span> {versionInfo.current_commit.slice(0, 12)}</div>
                {versionInfo.needs_update && (
                  <div><span className="font-semibold">Available commit:</span> {versionInfo.latest_commit.slice(0, 12)}</div>
                )}
                {versionInfo.needs_update && (
                  <div>
                    <span className="font-semibold">Trusted commit signature:</span>{" "}
                    {versionInfo.trusted_commit_signature ? "Verified" : "Not verified"}
                  </div>
                )}
                {versionInfo.needs_update && (
                  <div className={versionInfo.can_update ? "text-orange-600 font-medium" : "text-red-700 font-medium"}>
                    {versionInfo.can_update ? "Update available and ready to validate" : "Automatic update is blocked"}
                  </div>
                )}
                {versionInfo.reason && <p className="text-amber-900">{versionInfo.reason}</p>}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleCheckForUpdates}
              disabled={updateCheckLoading || updateInProgress}
              variant="outline"
              className="gap-2"
            >
              {updateCheckLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Check for Updates
            </Button>

            {updateAvailable && versionInfo?.can_update && (
              <Button
                onClick={handlePerformUpdate}
                disabled={updateCheckLoading || updateInProgress}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                {updateInProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {updateInProgress ? "Updating..." : "Update Now"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-amber-200 bg-amber-50/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Power className="h-5 w-5 text-amber-700" />
            <CardTitle className="text-lg text-amber-950">Server control</CardTitle>
          </div>
          <CardDescription>
            Stop the backend safely when the restaurant is finished using the system. This affects every connected device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {shutdownError && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-100 p-3 text-sm text-red-800">
              Could not stop the server: {shutdownError}
            </div>
          )}
          <Button
            onClick={handleRequestShutdown}
            disabled={updateInProgress || shutdownRequested}
            variant="destructive"
            className="gap-2"
          >
            <Power className="h-4 w-4" />
            Stop backend for everyone
          </Button>
        </CardContent>
      </Card>

    <Accordion type="single" collapsible className="space-y-6" value={activeAccordion} onValueChange={setActiveAccordion}>
      <AccordionItem value="data-cleanup" className="border rounded-xl bg-card text-card-foreground shadow-sm border-amber-200">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="font-semibold text-lg flex items-center gap-2">
            <Database className="h-5 w-5 text-amber-700" />
            {t("m.dataCleanup.title")}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <DataCleanupTab />
        </AccordionContent>
      </AccordionItem>
      {/* ── Tax & Service Charge ─────────────────────────── */}
      <AccordionItem value="tax" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg flex items-center gap-2">
              <Percent className="h-5 w-5 text-green-700" />
              Tax &amp; Service Charge
            </h3>
            <p className="text-sm text-muted-foreground font-normal">
              Toggle SST and service charge on or off, and set their percentages. Changes apply to new orders only.
            </p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <div className="space-y-5">

            {/* SST row */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Switch
                  id="sst-toggle"
                  checked={sstEnabled}
                  onCheckedChange={setSstEnabled}
                />
                <div className="min-w-0">
                  <label htmlFor="sst-toggle" className="font-semibold text-sm cursor-pointer">SST (Sales &amp; Service Tax)</label>
                  <p className="text-xs text-muted-foreground">{sstEnabled ? "Shown on receipts and calculated in totals" : "Hidden everywhere, not calculated"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Input
                  id="sst-rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={sstPercent}
                  onChange={(e) => setSstPercent(e.target.value)}
                  disabled={!sstEnabled}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground font-medium">%</span>
              </div>
            </div>

            {/* Service Charge row */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Switch
                  id="sc-toggle"
                  checked={scEnabled}
                  onCheckedChange={setScEnabled}
                />
                <div className="min-w-0">
                  <label htmlFor="sc-toggle" className="font-semibold text-sm cursor-pointer">Service Charge</label>
                  <p className="text-xs text-muted-foreground">{scEnabled ? "Shown on receipts and calculated in totals" : "Hidden everywhere, not calculated"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Input
                  id="sc-rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={scPercent}
                  onChange={(e) => setScPercent(e.target.value)}
                  disabled={!scEnabled}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground font-medium">%</span>
              </div>
            </div>

            <div className="pt-1">
              <p className="text-xs text-amber-600 font-medium mb-3">⚠️ Changes apply to new orders only. Existing open orders keep their original rates.</p>
              <Button onClick={saveTaxSettings} disabled={taxSaving} className="bg-green-700 hover:bg-green-800 text-white flex gap-2">
                {taxSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : taxSaved ? <><CheckCircle2 className="h-4 w-4" /> {t("m.saved")}</>
                  : "Save Tax Settings"}
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── Card Size Defaults ───────────────────────────────────────────── */}
      <AccordionItem value="cardsize" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Card Size Defaults</h3>
            <p className="text-sm text-muted-foreground font-normal">Set the default card size for new items and optionally apply to all existing items.</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Default Card Size</Label>
              <Select value={defaultCardSize} onValueChange={value => {
                if (isCardSize(value)) setDefaultCardSize(value);
              }}>
                <SelectTrigger><SelectValue placeholder="Normal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                  <SelectItem value="extra_large">Extra Large</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">New items will use this size unless overridden per-item.</p>
            </div>

            <div className="flex gap-2">
              <Button onClick={saveDefaultCardSize} className="bg-green-700 hover:bg-green-800 text-white">{cardSizeSaved ? "Saved" : "Save Default"}</Button>
              <Button variant="destructive" onClick={handleApplyCardSizeToAll} disabled={applyingCardSize}>{applyingCardSize ? "Applying…" : "Apply To All Items"}</Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── Menu Pattern Defaults ───────────────────────────────────────────── */}
      <AccordionItem value="patterns" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Menu Pattern Defaults</h3>
            <p className="text-sm text-muted-foreground font-normal">Set a global default pattern overlay for all menu items without a custom pattern.</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Default Pattern</Label>
              <Select value={defaultPatternId ? String(defaultPatternId) : "none"} onValueChange={value => setDefaultPatternId(value === "none" ? null : parseInt(value, 10))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — no pattern overlay</SelectItem>
                  {patterns.map(pattern => (
                    <SelectItem key={pattern.id} value={String(pattern.id)}>{pattern.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">This pattern will appear on all items that don't have a custom pattern assigned. Display with 40% opacity.</p>
            </div>

            <div className="flex gap-2">
              <Button onClick={saveDefaultPattern} className="bg-green-700 hover:bg-green-800 text-white">{defaultPatternSaved ? "Saved" : "Save Default"}</Button>
              <Button variant="outline" onClick={clearDefaultPattern} disabled={defaultPatternId === null}>Clear Pattern</Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── Working Hours ───────────────────────────────────── */}
      <AccordionItem value="hours" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">{t("m.restHours")}</h3>
            <p className="text-sm text-muted-foreground font-normal">{t("m.hoursDesc")}</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="start-time">{t("m.openTime")}</Label>
                <Input id="start-time" type="time" value={hours.start}
                  onChange={(e) => setHours({ ...hours, start: e.target.value })} className="w-full text-lg" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">{t("m.closeTime")}</Label>
                <Input id="end-time" type="time" value={hours.end}
                  onChange={(e) => setHours({ ...hours, end: e.target.value })} className="w-full text-lg" />
              </div>
            </div>
            <Button onClick={saveHours} className="bg-green-700 hover:bg-green-800 text-white flex gap-2">
              {hoursSaved ? <><CheckCircle2 className="h-4 w-4" /> {t("m.saved")}</> : t("m.saveHours")}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── Printer Management ───────────────────────────────────────────── */}
      <AccordionItem value="printers" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Printer Management</h3>
            <p className="text-sm text-muted-foreground font-normal">Discover, test, and configure printers for order receipts and kitchen tickets.</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <Accordion type="multiple" className="w-full">
            {/* ── Printer Settings ───────────────────────────────────────────── */}
            <AccordionItem value="printer-settings" className="border rounded-lg bg-card mb-4">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="text-left flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  <h4 className="font-semibold text-sm">Printer Settings</h4>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-3 pb-4 border-t">
                <div className="space-y-4">
                  {/* Discover Printers Button */}
                  <div className="flex gap-3">
                    <Button 
                    onClick={() => {
                      void discoverPrinters();
                    }} 
                    disabled={printersLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white flex gap-2"
                  >
                    {printersLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Discovering installed queues...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" /> Discover Printers
                      </>
                    )}
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
                                  {getConnectionIcon(printer.connectionType ?? "")}
                                  <span className="font-medium text-sm">{printer.name}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    printer.status === 'online' || printer.status === 'idle' 
                                      ? 'bg-green-100 text-green-700' 
                                      : 'bg-red-100 text-red-700'
                                  }`}>
                                    {printer.status}
                                  </span>
                                </div>
                                <div className="space-y-1 text-xs text-gray-600">
                                  <p><span className="font-medium">Driver:</span> {printer.driver || 'N/A'}</p>
                                  <p><span className="font-medium">Connection:</span> {printer.connectionType?.toUpperCase() || 'N/A'}</p>
                                  {printer.port && <p><span className="font-medium">Port:</span> {printer.port}</p>}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant={selectedPrinter === printer.name ? "default" : "outline"}
                                    className={selectedPrinter === printer.name ? "bg-green-700 text-white hover:bg-green-800" : ""}
                                    aria-pressed={selectedPrinter === printer.name}
                                    onClick={() => void savePrinterChoice(printer.name, "active")}
                                    disabled={printerSettingsLoading || printerChoiceSaving !== null || selectedPrinter === printer.name}
                                  >
                                    {printerChoiceSaving?.printerName === printer.name && printerChoiceSaving.choice === "active"
                                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
                                      : selectedPrinter === printer.name ? "Selected (Active)" : "Select Active"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={defaultPrinter === printer.name ? "default" : "outline"}
                                    className={defaultPrinter === printer.name ? "bg-indigo-700 text-white hover:bg-indigo-800" : ""}
                                    aria-pressed={defaultPrinter === printer.name}
                                    onClick={() => void savePrinterChoice(printer.name, "default")}
                                    disabled={printerSettingsLoading || printerChoiceSaving !== null || defaultPrinter === printer.name}
                                  >
                                    {printerChoiceSaving?.printerName === printer.name && printerChoiceSaving.choice === "default"
                                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
                                      : defaultPrinter === printer.name ? "Default" : "Set as Default"}
                                  </Button>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => testPrinter(printer.name)}
                                disabled={
                                  testPrintLoading === printer.name ||
                                  !ticketPreviewHasBeenSaved ||
                                  ticketPreview !== savedTicketPreview
                                }
                                className="shrink-0"
                              >
                                {testPrintLoading === printer.name ? (
                                  <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Testing...</>
                                ) : (
                                  <><Printer className="h-3 w-3 mr-1" /> Test Print</>
                                )}
                              </Button>
                            </div>
                            {testPrintResult?.printerName === printer.name && (
                              <p
                                role={testPrintResult.success ? "status" : "alert"}
                                className={`mt-3 text-sm ${
                                  testPrintResult.success ? "text-green-700" : "text-red-700"
                                }`}
                              >
                                {testPrintResult.success ? "Test print: " : "Test print failed: "}
                                {testPrintResult.message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="printer-job-review" className="border rounded-lg bg-card mb-4">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="text-left flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <h4 className="font-semibold text-sm">Print Jobs Needing Review ({printerJobs.length})</h4>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-3 pb-4 border-t">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    If submission was interrupted, the ticket may or may not have printed. Check the printer and its queue before arranging a manual reprint. The system never retries these jobs automatically.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void loadPrinterJobs(true)} disabled={printerJobsLoading}>
                    {printerJobsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh job status
                  </Button>
                  {printerJobs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No print jobs currently need review.</p>
                  ) : (
                    <div className="space-y-3">
                      {printerJobs.map(job => (
                        <div key={job.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 text-sm">
                              <p className="font-medium">
                                {job.jobType.replace(/_/g, " ")}{job.orderId ? ` · Order #${job.orderId}` : ""}
                              </p>
                              <p>Printer: {job.printerName}</p>
                              <p>Status: {job.status === "submitting" ? "Submission not confirmed" : "Outcome uncertain"}</p>
                              <p className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</p>
                              {job.errorMessage && <p className="text-xs text-red-700">{job.errorMessage}</p>}
                            </div>
                            <Button size="sm" variant="outline" onClick={() => void acknowledgePrinterJob(job.id)}>
                              Mark reviewed
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ── Receipt Copy Counts ───────────────────────────────────────────── */}
            <AccordionItem value="receipt-copies" className="border rounded-lg bg-card mb-4">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="text-left flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <h4 className="font-semibold text-sm">Receipt Copy Counts</h4>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-3 pb-4 border-t">
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Set how many copies of each receipt type to print globally.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Order Receipt (Customer)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        value={orderCustomerCopies}
                        onChange={(e) => {
                          setOrderCustomerCopies(Number.parseInt(e.target.value, 10));
                          setReceiptCopiesSaved(false);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Order Receipt (Kitchen)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        value={orderKitchenCopies}
                        onChange={(e) => {
                          setOrderKitchenCopies(Number.parseInt(e.target.value, 10));
                          setReceiptCopiesSaved(false);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Add-on Receipt (Customer)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        value={addonCustomerCopies}
                        onChange={(e) => {
                          setAddonCustomerCopies(Number.parseInt(e.target.value, 10));
                          setReceiptCopiesSaved(false);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Add-on Receipt (Kitchen)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        value={addonKitchenCopies}
                        onChange={(e) => {
                          setAddonKitchenCopies(Number.parseInt(e.target.value, 10));
                          setReceiptCopiesSaved(false);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Final Receipt</Label>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        value={finalReceiptCopies}
                        onChange={(e) => {
                          setFinalReceiptCopies(Number.parseInt(e.target.value, 10));
                          setReceiptCopiesSaved(false);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Daily Sales Report</Label>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        value={dailySalesReportCopies}
                        onChange={(e) => {
                          setDailySalesReportCopies(Number.parseInt(e.target.value, 10));
                          setReceiptCopiesSaved(false);
                        }}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => void saveReceiptCopyCounts()}
                    disabled={receiptCopiesSaving}
                    className="w-full bg-green-700 hover:bg-green-800 text-white flex gap-2"
                  >
                    {receiptCopiesSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                      : receiptCopiesSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved</>
                      : "Save Receipt Copy Counts"}
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ── Ticket Preview & Actions ───────────────────────────────────────────── */}
            <AccordionItem value="ticket-preview" className="border rounded-lg bg-card">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="text-left flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  <h4 className="font-semibold text-sm">Ticket Preview & Actions</h4>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-3 pb-4 border-t">
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="min-w-0 bg-gray-50 border rounded-lg p-4" style={{ containerType: "inline-size" }}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h4 className="font-semibold text-sm">Test Ticket Preview</h4>
                        {!editingTicketPreview ? (
                          <Button variant="outline" size="sm" onClick={() => setEditingTicketPreview(true)}>
                            Edit
                          </Button>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setTicketPreview(savedTicketPreview || DEFAULT_TEST_TICKET);
                                setEditingTicketPreview(false);
                              }}
                              disabled={ticketPreviewSaving}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void saveTicketPreview()}
                              disabled={ticketPreviewSaving || !ticketPreview.trim() || ticketPreview.length > 4000}
                            >
                              {ticketPreviewSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Preview"}
                            </Button>
                          </div>
                        )}
                      </div>

                      <pre
                        ref={ticketPreviewContentRef}
                        contentEditable={editingTicketPreview}
                        suppressContentEditableWarning
                        role={editingTicketPreview ? "textbox" : undefined}
                        aria-label={editingTicketPreview ? "Editable test ticket text" : undefined}
                        aria-multiline={editingTicketPreview || undefined}
                        spellCheck={false}
                        onInput={(event) => {
                          const enteredText = event.currentTarget.innerText.replace(/\r\n?/g, "\n");
                          const nextText = enteredText.slice(0, 4000);
                          if (nextText !== enteredText) {
                            event.currentTarget.textContent = nextText;
                            const range = document.createRange();
                            range.selectNodeContents(event.currentTarget);
                            range.collapse(false);
                            const selection = window.getSelection();
                            selection?.removeAllRanges();
                            selection?.addRange(range);
                          }
                          setTicketPreview(nextText);
                        }}
                        className="mt-3 min-h-40 w-full whitespace-pre-wrap break-all bg-white border font-mono focus:outline-none"
                        style={{
                          fontSize: "calc(3.472222cqi - 0.069444px)",
                          lineHeight: 1.2,
                          padding: 0,
                          overflowWrap: "anywhere"
                        }}
                      >
                        {editingTicketPreview ? null : ticketPreview}
                      </pre>
                      {ticketPreviewHasBeenSaved && ticketPreview !== savedTicketPreview && (
                        <p role="status" className="mt-2 text-sm text-amber-700">Preview changed; save it before printing the test ticket.</p>
                      )}
                      {!ticketPreviewHasBeenSaved && (
                        <p role="status" className="mt-2 text-sm text-amber-700">Save this preview once before printing a test ticket.</p>
                      )}
                      <Button
                        onClick={() => void printTestTicket()}
                        disabled={printingTestTicket || !selectedPrinter || !ticketPreviewHasBeenSaved || ticketPreview !== savedTicketPreview}
                        className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white flex gap-2"
                      >
                        {printingTestTicket ? <><Loader2 className="h-4 w-4 animate-spin" /> Printing...</>
                          : <><Printer className="h-4 w-4" /> Print Test Ticket</>}
                      </Button>
                    </div>

                    <div className="min-w-0 bg-gray-50 border rounded-lg p-4" style={{ containerType: "inline-size" }}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h4 className="font-semibold text-sm">Sample Ticket Preview</h4>
                        <Select
                          value={sampleTicketType}
                          disabled={printingSampleTicket}
                          onValueChange={(value) => {
                            if (isSampleTicketType(value)) setSampleTicketType(value);
                          }}
                        >
                          <SelectTrigger aria-label="Sample ticket type" className="w-full sm:w-64">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SAMPLE_TICKET_TYPES.map(({ value, label }) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="mt-3 min-h-40 w-full whitespace-pre-wrap break-all border bg-white font-mono">
                        {sampleTicketLoading ? (
                          <p role="status" className="p-3 text-sm text-muted-foreground">Loading sample...</p>
                        ) : sampleTicketError ? (
                          <p role="alert" className="p-3 text-sm text-destructive">{sampleTicketError}</p>
                        ) : (
                          <div
                            style={{
                              fontSize: "calc(3.472222cqi - 0.069444px)",
                              lineHeight: 1.2,
                              overflowWrap: "anywhere"
                            }}
                          >
                            {parseSampleTicketLines(sampleTicket).map((line, index) => (
                              <div key={index} style={{ textAlign: line.alignment }}>
                                {line.text || "\u00a0"}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <Button
                          onClick={() => void printSampleTicket()}
                          disabled={
                            printingSampleTicket ||
                            sampleTicketLoading ||
                            Boolean(sampleTicketError) ||
                            !sampleTicket.trim() ||
                            (!selectedPrinter && !defaultPrinter)
                          }
                          className="bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                          {printingSampleTicket ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Printing sample...</>
                          ) : (
                            <><Printer className="mr-2 h-4 w-4" /> Print This Sample</>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          {selectedPrinter || defaultPrinter
                            ? `Prints one copy on ${selectedPrinter || defaultPrinter}.`
                            : "Select an active or default printer to enable sample printing."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-semibold text-sm">Daily Sales Reports</h4>
                    <p className="text-xs text-muted-foreground">Print current day's sales report on demand.</p>

                    <div className="flex gap-2">
                      <Button
                        onClick={printDailySalesReport}
                        disabled={printingDailyReport}
                        className="bg-blue-700 hover:bg-blue-800 text-white flex gap-2"
                      >
                        {printingDailyReport ? <><Loader2 className="h-4 w-4 animate-spin" /> Printing...</>
                          : <><FileText className="h-4 w-4" /> Print Daily Sales Report</>}
                      </Button>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </AccordionContent>
      </AccordionItem>

      {/* ── Manager Profile ─────────────────────────────────── */}
      <AccordionItem value="profile" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">{t("m.mgrProfile")}</h3>
            <p className="text-sm text-muted-foreground font-normal">{t("m.profileDesc")}</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="mgr-name">{t("m.fullName")}</Label>
                <Input id="mgr-name" value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  placeholder={t("m.namePlaceholderMgr")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mgr-id">{t("m.mgrId")} <span className="text-xs text-foreground/50">{t("m.managerIdHint")}</span></Label>
                <Input id="mgr-id" value={profile.id}
                  onChange={(e) => setProfile({ ...profile, id: e.target.value })}
                  placeholder={t("manager.loginPlaceholderId")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mgr-email">{t("m.emailLabel")} <span className="text-xs text-foreground/50">{t("m.emailHint")}</span></Label>
                <Input id="mgr-email" type="email" value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  placeholder={t("m.emailPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mgr-phone">{t("m.phoneLabel")}</Label>
                <Input id="mgr-phone" value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder={t("m.phonePlaceholder")} />
              </div>
            </div>

            {/* Change password */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold text-foreground/70">{t("m.changePass")} <span className="font-normal text-foreground/40">{t("m.changePasswordHint")}</span></p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-pw">{t("m.newPassword")}</Label>
                  <div className="relative">
                    <Input id="new-pw" type={showPassword ? "text" : "password"}
                      value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t("m.newPasswordPlaceholder")} className="pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-pw">{t("m.confirmPassword")}</Label>
                  <Input id="confirm-pw" type={showPassword ? "text" : "password"}
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("m.confirmPasswordPlaceholder")} />
                </div>
              </div>
            </div>

            {profileError && <p className="text-sm text-destructive font-medium">{profileError}</p>}

            <Button onClick={saveProfile} disabled={profileSaving} className="bg-green-700 hover:bg-green-800 text-white flex gap-2">
              {profileSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("m.saving")}</>
                : profileSaved ? <><CheckCircle2 className="h-4 w-4" /> {t("m.saved")}</>
                : t("m.saveProfile")}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── System Backups ──────────────────────────────────── */}
      <AccordionItem value="backups" className="border rounded-xl bg-card text-card-foreground shadow-sm border-blue-200">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-blue-50/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg text-blue-900 flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" /> {t("m.sysBackup")}
            </h3>
            <p className="text-sm text-blue-700/70 font-normal">{t("m.backupDesc")}</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t border-blue-100 bg-blue-50/20">
          <div className="space-y-8">
            {/* Create Backup */}
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
              <h4 className="font-bold text-gray-800 flex items-center gap-2">
                <DownloadCloud className="h-4 w-4 text-blue-500" /> {t("m.createNewBackup")}
              </h4>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-500">{t("m.backupFileName")}</Label>
                  <div className="flex items-center">
                    <Input 
                      value={backupName} 
                      onChange={(e) => { setBackupName(e.target.value); setShowOverwriteConfirm(false); setBackupMsg(null); }}
                      placeholder={t("m.backupNamePlaceholder")}
                      className="rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:border-blue-500"
                    />
                    <div className="h-10 px-3 flex items-center bg-gray-50 border border-l-0 border-input rounded-r-md text-sm text-gray-500 font-mono">
                      .tar.gz
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("m.backupNameHelp")}</p>
                </div>
                <div className="flex items-end">
                  {!showOverwriteConfirm ? (
                    <Button 
                      onClick={() => handleCreateBackup(false)} 
                      disabled={backupLoading || !backupName.trim()} 
                      className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                    >
                      {backupLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {t("m.saveBackup")}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 w-full sm:w-auto animate-in slide-in-from-right-4">
                      <div className="text-sm font-bold text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" /> {t("m.backupOverwrite")}
                      </div>
                      <Button onClick={() => handleCreateBackup(true)} variant="destructive" size="sm">{t("m.yes")}</Button>
                      <Button onClick={() => setShowOverwriteConfirm(false)} variant="outline" size="sm">{t("m.no")}</Button>
                    </div>
                  )}
                </div>
              </div>
              {backupMsg && (
                <p className={`text-sm font-medium ${backupMsg.isError ? 'text-red-600' : 'text-green-600'}`}>
                  {backupMsg.text}
                </p>
              )}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <div>
                <p className="font-bold text-gray-900">Data Reset</p>
                <p className="text-sm text-gray-600">Remove a complete data category, or use Reset Everything for a clean restaurant setup.</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-category">Reset Category</Label>
                  <Select value={resetCategory} onValueChange={(value) => setResetCategory(value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select reset category" />
                    </SelectTrigger>
                    <SelectContent>
                      {resetOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{resetOptions.find((option) => option.key === resetCategory)?.description}</p>
                </div>

                {resetCategory === "all_data" ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950">
                      <p className="font-bold">This permanently removes business data and uploaded photos.</p>
                      <p className="mt-1">It clears orders and archives, feedback, menu items and categories, tables, inventory, employees, printer history, promotions, and activity history.</p>
                      <p className="mt-1">Your manager login, printer setup, tax and service-charge settings, working hours, the Counter Order system route, and backup archives are retained so the app remains usable and recoverable.</p>
                      <p className="mt-1 font-semibold">This cannot be undone except by restoring a backup.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reset-confirmation-sentence">Type the exact confirmation sentence</Label>
                      <Input
                        id="reset-confirmation-sentence"
                        value={resetConfirmationInput}
                        onChange={(e) => setResetConfirmationInput(e.target.value)}
                        autoComplete="off"
                        placeholder="Type the exact sentence shown below"
                      />
                      <p className="text-xs text-muted-foreground">Required: {resetSentenceExpected || "Loading confirmation..."}</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reset-manager-password">Re-enter the manager password</Label>
                      <Input
                        id="reset-manager-password"
                        type="password"
                        value={resetPasswordInput}
                        onChange={(e) => setResetPasswordInput(e.target.value)}
                        autoComplete="current-password"
                        placeholder="Manager password"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="reset-confirmation-text">Confirmation text</Label>
                    <Input
                      id="reset-confirmation-text"
                      value={resetConfirmationInput}
                      onChange={(e) => setResetConfirmationInput(e.target.value)}
                      placeholder="Type the selected category label exactly"
                    />
                    <p className="text-xs text-muted-foreground">Type exactly: {resetOptions.find((option) => option.key === resetCategory)?.label}</p>
                  </div>
                )}

                {resetMessage && (
                  <p className={`text-sm ${resetMessage.isError ? 'text-red-600' : 'text-green-600'}`}>{resetMessage.text}</p>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={handlePerformDataReset}
                    disabled={
                      resetLoading ||
                      !resetCategory ||
                      (resetCategory === "all_data"
                        ? resetConfirmationInput.trim() !== resetSentenceExpected || !resetPasswordInput
                        : resetConfirmationInput.trim() !== resetOptions.find((option) => option.key === resetCategory)?.label)
                    }
                    variant="destructive"
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    {resetLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Deleting data…</>
                      : resetCategory === "all_data" ? "Reset Everything" : "Delete this category"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              {/* Local Backups + Upload Restore */}
              <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-gray-800 flex items-center gap-2">
                    <UploadCloud className="h-4 w-4 text-emerald-500" /> {t("m.localBackups")}
                  </div>
                  <span className="text-xs text-muted-foreground">{t("m.localBackupNote")}</span>
                </div>

                {restoreResult && (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${restoreResult.isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
                    {restoreResult.message}
                  </div>
                )}

                {backups.length === 0 ? (
                  <div className="text-center p-6 rounded-2xl border border-dashed border-gray-300 text-gray-500 text-sm">
                    {t("m.noBackups")}
                  </div>
                ) : (
                  <div className="grid gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {backups.map((file) => (
                      <div key={file.filename} className="p-4 rounded-2xl border border-gray-200 shadow-sm hover:border-blue-300 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 break-all">{file.filename}</p>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                              <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                              <span>{new Date(file.created_at).toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleDownloadBackup(file.filename)}>
                              Download
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => handleRestoreBackup(file.filename, "local")}
                              disabled={restoreLoading !== null}
                              variant="outline"
                              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300"
                            >
                              {restoreLoading === file.filename ? (
                                <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("m.restoring")}</>
                              ) : (
                                t("m.restoreThisVersion")
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-3xl border border-dashed border-gray-200 bg-slate-50 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-gray-800">{t("m.restoreLocalDevice")}</h4>
                      <p className="text-sm text-gray-600 mt-1">{t("m.restoreLocalDeviceDesc")}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{t("m.restoreLocalHelp")}</span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <Label htmlFor="backup-upload" className="text-xs text-muted-foreground">{t("m.uploadBackupFile")}</Label>
                      <input
                        id="backup-upload"
                        type="file"
                        title={t("m.uploadBackupFile")}
                        aria-label={t("m.uploadBackupFile")}
                        accept=".tar.gz,.tar.gz.enc,.enc"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          handleUploadBackupFile(file);
                        }}
                        className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold"
                      />
                    </div>
                    <Button
                      onClick={async () => {
                        if (!uploadFile) {
                          setUploadError(t("m.uploadFileRequired"));
                          return;
                        }
                        setUploadError(null);
                        setUploadingBackup(true);
                        try {
                          await restoreUploadedBackup(uploadFile);
                          setRestoreResult({ message: t("m.restoreSuccess"), isError: false });
                          setTimeout(() => window.location.reload(), 1500);
                        } catch (err: unknown) {
                          setUploadError(getErrorMessage(err, t("m.restoreFailed", { message: "Unknown error" })));
                        } finally {
                          setUploadingBackup(false);
                        }
                      }}
                      disabled={!uploadFile || uploadingBackup}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
                    >
                      {uploadingBackup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {t("m.restoreFromUpload")}
                    </Button>
                  </div>
                  {uploadError && <p className="mt-3 text-sm text-red-600">{uploadError}</p>}
                </div>
              </div>

              {/* Cloud Backups */}
              <div className="space-y-5">
                <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-gray-800 flex items-center gap-2">
                      <CloudDownload className="h-4 w-4 text-sky-500" /> {t("m.cloudBackups")}
                    </div>
                    <span className="text-xs text-muted-foreground">{t("m.cloudBackupNote")}</span>
                  </div>
                  {cloudBackups.length === 0 ? (
                    <div className="text-center p-6 rounded-2xl border border-dashed border-gray-300 text-gray-500 text-sm">
                      {t("m.noCloudBackups")}
                    </div>
                  ) : (
                    <div className="grid gap-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                      {cloudBackups.map((file) => (
                        <div key={file.filename} className="p-4 rounded-2xl border border-gray-200 shadow-sm hover:border-blue-300 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 break-all">{file.filename}</p>
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                                <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                <span>{new Date(file.created_at).toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                            <Button 
                              size="sm"
                              onClick={() => handleRestoreBackup(file.filename, "cloud")}
                              disabled={restoreLoading !== null}
                              variant="outline"
                              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300"
                            >
                              {restoreLoading === file.filename ? (
                                <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("m.restoring")}</>
                              ) : (
                                t("m.restoreThisVersion")
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
    </div>

      <Dialog
        open={confirmationDialog.open}
        onOpenChange={(open) => setConfirmationDialog(prev => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{confirmationDialog.title}</DialogTitle>
            <DialogDescription>{confirmationDialog.description}</DialogDescription>
          </DialogHeader>
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setConfirmationDialog(prev => ({ ...prev, open: false }))}
              disabled={confirmationDialog.pending}
            >
              {t("m.cancel")}
            </Button>
            <Button onClick={handleConfirmationConfirm} disabled={confirmationDialog.pending}>
              {confirmationDialog.pending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("m.confirm")}</> : t("m.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
