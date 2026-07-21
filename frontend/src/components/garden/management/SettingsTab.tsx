/*
 * SettingsTab.tsx — Global configuration and manager profile UI.
 *
 * I created this component to centralize all restaurant-wide settings, including:
 *   • Working hours that trigger automatic employee logout.
 *   • Kitchen passcode management for secure board access.
 *   • Manager profile editing with password change support.
 *   • Password recovery via email using the RESEND service.
 *
 * The UI uses our design system's Card, Input, and Button components to present
 * a clean, accessible form. State is persisted through the backend API and
 * reflected instantly in the UI via optimistic updates.
 */
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CardSkeleton } from "@/components/ui/LoadingSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSettings, updateSetting, fetchManagerProfile, updateManagerProfile, sendPasswordResetEmail, fetchBackups, fetchCloudBackups, createBackup, restoreBackup, restoreCloudBackup, restoreUploadedBackup, downloadBackup, applyDefaultCardSize, fetchPatterns, BackupFile, checkSystemVersion, performSystemUpdate, VersionCheckResult } from "@/lib/api";
import { CheckCircle2, Eye, EyeOff, Loader2, Mail, Database, DownloadCloud, UploadCloud, CloudDownload, AlertCircle, Percent, AlertTriangle, RefreshCw, Printer, Wifi, Cable, Bluetooth, Search, Check, FileText } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWebSocket } from "@/lib/useWebSocket";
import { safeConsoleError } from "@/lib/safeConsole";

export const SettingsTab = () => {
  const { t } = useTranslation();
  const [hours, setHours] = useState({ start: "09:00", end: "22:00" });
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursSaved, setHoursSaved] = useState(false);

  const [kitchenPasscode, setKitchenPasscode] = useState("");
  const [passcodeSaved, setPasscodeSaved] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const [captivePortalTarget, setCaptivePortalTarget] = useState("http://10.42.0.1:5000/");
  const [captivePortalSaving, setCaptivePortalSaving] = useState(false);
  const [captivePortalSaved, setCaptivePortalSaved] = useState(false);

  const [profile, setProfile] = useState({ name: "", id: "", email: "", phone: "" });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

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

  const [hotspotSsid, setHotspotSsid] = useState("");
  const [hotspotPassword, setHotspotPassword] = useState("");
  const [hotspotSecurity, setHotspotSecurity] = useState<"WPA"|"WEP"|"nopass">("WPA");
  const [hotspotSaved, setHotspotSaved] = useState(false);
  const [hotspotSaving, setHotspotSaving] = useState(false);

  // System update state
  const [updateCheckLoading, setUpdateCheckLoading] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionCheckResult | null>(null);
  const [updateInProgress, setUpdateInProgress] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Printer management state
  const [printers, setPrinters] = useState<any[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [defaultPrinter, setDefaultPrinter] = useState("");
  const [printerPreferences, setPrinterPreferences] = useState<any>({});
  const [printerProfiles, setPrinterProfiles] = useState<any>({});
  const [testPrintLoading, setTestPrintLoading] = useState<string | null>(null);
  const [printerSettingsLoading, setPrinterSettingsLoading] = useState(false);
  const [printerSettingsSaved, setPrinterSettingsSaved] = useState(false);
  const [platformInfo, setPlatformInfo] = useState<any>(null);
  const [printDelaySeconds, setPrintDelaySeconds] = useState(0);
  const [emptyLinesBefore, setEmptyLinesBefore] = useState(2);
  const [emptyLinesAfter, setEmptyLinesAfter] = useState(3);
  const [selectedPrinterProfile, setSelectedPrinterProfile] = useState<any>(null);
  
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
  const [hasAutoDiscovered, setHasAutoDiscovered] = useState(false);

  // Confirmation dialog state

  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
    pending: boolean;
  }>({ open: false, title: "", description: "", onConfirm: async () => {}, pending: false });

  useEffect(() => {
    loadAll();
  }, []);

  // WebSocket listener for real-time settings updates
  useWebSocket(["SETTINGS_UPDATE"], (event) => {
    loadAll();
  });

  const loadAll = async () => {
    let data: Awaited<ReturnType<typeof fetchSettings>> | null = null;
    try {
      data = await fetchSettings();
      if (data?.work_hours) setHours(data.work_hours);
      if (data?.kitchen_passcode) setKitchenPasscode(String(data.kitchen_passcode));
      if (data?.captive_portal_target) setCaptivePortalTarget(data.captive_portal_target);
      if (data?.default_card_size) setDefaultCardSize(data.default_card_size as any);
      if (data?.hotspot_ssid) setHotspotSsid(String(data.hotspot_ssid));
      if (data?.hotspot_password) setHotspotPassword(String(data.hotspot_password));
      if (data?.hotspot_security) {
        const security = String(data.hotspot_security).toUpperCase();
        if (security === "WEP" || security === "NOPASS") {
          setHotspotSecurity(security as "WPA"|"WEP"|"nopass");
        } else {
          setHotspotSecurity("WPA");
        }
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

    await Promise.all([loadBackups(), loadCloudBackups()]);
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
    setUpdateMsg(null);
    try {
      const result = await checkSystemVersion();
      setVersionInfo(result);
      setUpdateAvailable(result.needs_update);
      if (result.is_up_to_date) {
        setUpdateMsg({ text: "✅ App is already up to date.", isError: false });
      }
    } catch (err: any) {
      safeConsoleError("Version check failed", err);
      setUpdateMsg({ text: `❌ Failed to check for updates: ${err.message || "Unknown error"}`, isError: true });
    } finally {
      setUpdateCheckLoading(false);
    }
  };

  const handlePerformUpdate = async () => {
    showConfirmation(
      "Confirm System Update",
      "This will update the application to the latest version from GitHub. Frontend and backend dependencies will be reinstalled and rebuilt. This may take a few minutes. Proceed?",
      async () => {
        setUpdateInProgress(true);
        setUpdateMsg(null);
        try {
          const result = await performSystemUpdate();
          if (result.success) {
            setUpdateMsg({ text: "✅ System updated successfully! Reloading in 3 seconds...", isError: false });
            setTimeout(() => window.location.reload(), 3000);
          } else {
            setUpdateMsg({ text: `⚠️ ${result.message}`, isError: true });
          }
        } catch (err: any) {
          safeConsoleError("Update failed", err);
          setUpdateMsg({ text: `❌ Update failed: ${err.message || "Unknown error"}`, isError: true });
        } finally {
          setUpdateInProgress(false);
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
          console.error(e);
        }
      }
    );
  };

  // Printer management functions
  const [printerError, setPrinterError] = useState<string | null>(null);

  const getManagerToken = () => {
    const managerLogin = localStorage.getItem("managerLogin");
    if (managerLogin) {
      try {
        const parsed = JSON.parse(managerLogin);
        return parsed.token;
      } catch (e) {
        console.error("Failed to parse managerLogin:", e);
        return null;
      }
    }
    return null;
  };

  const discoverPrinters = async () => {
    setPrinterError(null);
    setPrintersLoading(true);
    try {
      const token = getManagerToken();
      
      if (!token) {
        setPrinterError("Manager authentication required. Please log in to access printer management.");
        safeConsoleError("Manager token not found");
        return;
      }
      
      console.log("Discovering printers...");
      const response = await fetch("/management/printers/discover", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      
      console.log("Response status:", response.status);
      
      if (response.status === 401) {
        const errorText = await response.text();
        console.log("401 Error response:", errorText);
        setPrinterError("Authentication failed. Your session may have expired. Please log in again.");
        return;
      }
      
      const data = await response.json();
      console.log("Response data:", data);
      
      if (data.success) {
        setPrinters(data.printers);
        setPlatformInfo(data.platform);
      } else {
        setPrinterError(`Failed to discover printers: ${data.message}`);
        safeConsoleError("Failed to discover printers", data.message);
      }
    } catch (err: any) {
      setPrinterError(`Error discovering printers: ${err.message}`);
      safeConsoleError("Printer discovery failed", err);
    } finally {
      setPrintersLoading(false);
    }
  };

  const loadPrinterSettings = async () => {
    setPrinterSettingsLoading(true);
    try {
      const token = getManagerToken();
      if (!token) {
        safeConsoleError("Manager token not found");
        return;
      }
      
      const response = await fetch("/management/printers/settings", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const data = await response.json();
      if (data.success) {
        setSelectedPrinter(data.selectedPrinter || "");
        setDefaultPrinter(data.defaultPrinter || "");
        setPrinterPreferences(data.printerPreferences || {});
        setPrinterProfiles(data.printerProfiles || {});
        
        // Load settings from selected printer profile
        if (data.selectedPrinter && data.printerProfiles[data.selectedPrinter]) {
          const profile = data.printerProfiles[data.selectedPrinter];
          setSelectedPrinterProfile(profile);
          setPrintDelaySeconds(profile.print_delay_seconds || 0);
          setEmptyLinesBefore(profile.empty_lines_before || 2);
          setEmptyLinesAfter(profile.empty_lines_after || 3);
        } else {
          // Fallback to defaults if no profile
          setPrintDelaySeconds(0);
          setEmptyLinesBefore(2);
          setEmptyLinesAfter(3);
        }
        
        // Load receipt copy counts
        if (data.printerPreferences.receipt_copies && data.printerPreferences.receipt_copies.global) {
          const copies = data.printerPreferences.receipt_copies.global;
          setOrderCustomerCopies(copies.order_customer || 1);
          setOrderKitchenCopies(copies.order_kitchen || 1);
          setAddonCustomerCopies(copies.addon_customer || 1);
          setAddonKitchenCopies(copies.addon_kitchen || 1);
          setFinalReceiptCopies(copies.final_receipt || 1);
          setDailySalesReportCopies(copies.daily_sales_report || 1);
        }
      }
    } catch (err: any) {
      safeConsoleError("Failed to load printer settings", err);
    } finally {
      setPrinterSettingsLoading(false);
    }
  };

  const printDailySalesReport = async () => {
    setPrintingDailyReport(true);
    try {
      const token = getManagerToken();
      if (!token) {
        safeConsoleError("Manager token not found");
        return;
      }
      
      const response = await fetch("/management/printers/daily-sales-report", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const data = await response.json();
      if (data.success) {
        console.log("Daily sales report printed successfully");
      } else {
        safeConsoleError("Failed to print daily sales report", data.message);
      }
    } catch (err: any) {
      safeConsoleError("Failed to print daily sales report", err);
    } finally {
      setPrintingDailyReport(false);
    }
  };

  const printTestTicket = async () => {
    setPrintingTestTicket(true);
    try {
      const token = getManagerToken();
      if (!token) {
        safeConsoleError("Manager token not found");
        return;
      }
      
      const response = await fetch("/management/printers/test", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ printerName: selectedPrinter })
      });
      const data = await response.json();
      if (data.success) {
        console.log("Test ticket printed successfully");
      } else {
        safeConsoleError("Failed to print test ticket", data.message);
      }
    } catch (err: any) {
      safeConsoleError("Failed to print test ticket", err);
    } finally {
      setPrintingTestTicket(false);
    }
  };

  const savePrinterSettings = async () => {
    setPrinterSettingsLoading(true);
    try {
      const token = getManagerToken();
      if (!token) {
        safeConsoleError("Manager token not found");
        return;
      }
      
      console.log("Saving printer settings with values:", {
        printDelaySeconds,
        emptyLinesBefore,
        emptyLinesAfter,
        selectedPrinter
      });
      
      // Update printer profile for selected printer
      const updatedProfiles = { ...printerProfiles };
      if (selectedPrinter) {
        updatedProfiles[selectedPrinter] = {
          width: 80,
          print_delay_seconds: printDelaySeconds,
          empty_lines_before: emptyLinesBefore,
          empty_lines_after: emptyLinesAfter,
          has_auto_cutter: printDelaySeconds === 0,
          connection_type: "USB",
          notes: `Printer profile for ${selectedPrinter}`
        };
      }
      
      console.log("Updated printer profiles:", updatedProfiles);
      
      // Update local state immediately so it persists during the session
      setPrinterProfiles(updatedProfiles);
      
      // Update receipt copy counts
      const updatedPrefs = { ...printerPreferences };
      updatedPrefs.receipt_copies = {
        global: {
          order_customer: orderCustomerCopies,
          order_kitchen: orderKitchenCopies,
          addon_customer: addonCustomerCopies,
          addon_kitchen: addonKitchenCopies,
          final_receipt: finalReceiptCopies,
          daily_sales_report: dailySalesReportCopies
        }
      };
      
      const response = await fetch("/management/printers/settings", {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          selectedPrinter,
          defaultPrinter,
          printerProfiles: updatedProfiles,
          printerPreferences: updatedPrefs
        })
      });
      const data = await response.json();
      if (data.success) {
        console.log("Save successful, updating local state");
        setPrinterProfiles(updatedProfiles);
        setPrinterPreferences(updatedPrefs);
        setPrinterSettingsSaved(true);
        setTimeout(() => setPrinterSettingsSaved(false), 2500);
      } else {
        safeConsoleError("Failed to save printer settings", data.message);
      }
    } catch (err: any) {
      safeConsoleError("Failed to save printer settings", err);
    } finally {
      setPrinterSettingsLoading(false);
    }
  };

  const testPrinter = async (printerName: string) => {
    setTestPrintLoading(printerName);
    try {
      const token = getManagerToken();
      if (!token) {
        safeConsoleError("Manager token not found");
        return;
      }
      
      const response = await fetch("/management/printers/test", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ printerName })
      });
      const data = await response.json();
      if (data.success) {
        alert(`Test print sent successfully to ${printerName}`);
      } else {
        alert(`Test print failed: ${data.message}`);
      }
    } catch (err: any) {
      safeConsoleError("Test print failed", err);
      alert(`Test print failed: ${err.message}`);
    } finally {
      setTestPrintLoading(null);
    }
  };

  const getConnectionIcon = (connectionType: string) => {
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
          console.error(e);
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
        } catch (e) { safeConsoleError("Failed to apply card size", e); alert("Failed to apply card size"); }
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

  const savePasscode = async () => {
    if (!kitchenPasscode.trim()) return;
    await updateSetting("kitchen_passcode", kitchenPasscode.trim());
    setPasscodeSaved(true);
    setTimeout(() => setPasscodeSaved(false), 2500);
  };

  const saveCaptivePortalTarget = async () => {
    if (!captivePortalTarget.trim()) return;
    showConfirmation(
      "Confirm captive portal redirect",
      "This will update the customer redirect URL used after Wi-Fi sign-in.",
      async () => {
        setCaptivePortalSaving(true);
        try {
          await updateSetting("captive_portal_target", captivePortalTarget.trim());
          setCaptivePortalSaved(true);
          setTimeout(() => setCaptivePortalSaved(false), 2500);
        } catch (e) {
          safeConsoleError("Failed to save captive portal target", e);
        } finally {
          setCaptivePortalSaving(false);
        }
      }
    );
  };

  const saveHotspotSettings = async () => {
    showConfirmation(
      "Confirm hotspot settings",
      "The Wi-Fi hotspot credentials will be updated for customer access.",
      async () => {
        setHotspotSaving(true);
        try {
          await updateSetting("hotspot_ssid", hotspotSsid.trim());
          await updateSetting("hotspot_password", hotspotPassword);
          await updateSetting("hotspot_security", hotspotSecurity);
          setHotspotSaved(true);
          setTimeout(() => setHotspotSaved(false), 2500);
        } catch (e) {
          safeConsoleError("Failed to save hotspot settings", e);
        } finally {
          setHotspotSaving(false);
        }
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
          setProfileError(t("m.profileSaveFailed"));
        } finally {
          setProfileSaving(false);
        }
      }
    );
  };

  const sendReset = async () => {
    if (!resetEmail.trim()) return;
    setResetSending(true);
    setResetMsg("");
    try {
      const result = await sendPasswordResetEmail(resetEmail.trim());
      if (result.success) {
        setResetMsg("✅ " + result.message);
      } else {
        setResetMsg("⚠️ " + result.message);
      }
    } catch {
      setResetMsg("⚠️ Could not connect to email service. Check backend .env configuration.");
    } finally {
      setResetSending(false);
    }
  };

  // Load printer settings on mount
  useEffect(() => {
    loadPrinterSettings();
  }, []);

  // Don't reload printer settings when switching printers - use local state
  // Only reload on initial mount

  // Auto-discover printers when printer accordion opens
  useEffect(() => {
    if (activeAccordion === "printers" && !hasAutoDiscovered) {
      discoverPrinters();
      setHasAutoDiscovered(true);
    }
  }, [activeAccordion]);

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
    } catch (err: any) {
      const alreadyExists = err.status === 409 || (err.message && err.message.toLowerCase().includes("already exists"));
      if (alreadyExists && !overwrite) {
        setShowOverwriteConfirm(true);
      } else {
        setBackupMsg({ text: `⚠️ ${err.message || t("m.backupCreateFailed")}`, isError: true });
      }
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (filename: string, source: "local" | "cloud") => {
    setActiveRestoreSource(source);
    setRestoreConfirmFile(filename);
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      await downloadBackup(filename);
    } catch (err: any) {
      safeConsoleError("Download failed", err);
      setBackupMsg({ text: `⚠️ ${err.message || "Download failed."}`, isError: true });
    }
  };

  const handleUploadBackupFile = (file: File | null) => {
    setUploadFile(file);
    setUploadError(null);
  };

  const executeRestore = async () => {
    const filename = restoreConfirmFile;
    if (!filename || !activeRestoreSource) return;
    setRestoreConfirmFile(null);
    
    setRestoreLoading(filename);
    try {
      if (activeRestoreSource === "local") {
        await restoreBackup(filename);
      } else {
        await restoreCloudBackup(filename);
      }
      setRestoreResult({ message: t("m.restoreSuccess"), isError: false });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setRestoreResult({ message: t("m.restoreFailed", { message: err.message || "Unknown error" }), isError: true });
      setRestoreLoading(null);
    } finally {
      setActiveRestoreSource(null);
    }
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
      {/* ── System Update Card ─────────────────────────── */}
      <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg text-blue-900">System Updates</CardTitle>
          </div>
          <CardDescription>Check and apply the latest application updates from GitHub</CardDescription>
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
                <div><span className="font-semibold">Current Version:</span> {versionInfo.current_version}</div>
                <div><span className="font-semibold">Latest Version:</span> {versionInfo.latest_version}</div>
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

            {updateAvailable && !updateInProgress && (
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
    </div>

    <Accordion type="single" collapsible className="space-y-6" value={activeAccordion} onValueChange={setActiveAccordion}>

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
              <Select value={defaultCardSize} onValueChange={v => setDefaultCardSize(v as any)}>
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

      <AccordionItem value="captive" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Captive Portal Redirect</h3>
            <p className="text-sm text-muted-foreground font-normal">Configure the local hotspot landing URL for captive portal detection traffic.</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="captive-portal-target">Landing URL</Label>
              <Input
                id="captive-portal-target"
                type="url"
                value={captivePortalTarget}
                onChange={(e) => setCaptivePortalTarget(e.target.value)}
                placeholder="http://10.42.0.1:5000/"
              />
              <p className="text-xs text-muted-foreground">Use the hotspot gateway address devices can reach after connecting. Defaults to the Raspberry Pi hotspot address.</p>
            </div>
            <Button onClick={saveCaptivePortalTarget} disabled={captivePortalSaving} className="bg-green-700 hover:bg-green-800 text-white flex gap-2">
              {captivePortalSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : captivePortalSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved</>
                : "Save Captive Portal Target"}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="hotspot" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Hotspot Wi-Fi QR</h3>
            <p className="text-sm text-muted-foreground font-normal">Configure the wireless network details used when printing table hotspot QR codes.</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="hotspot-ssid">Wi-Fi SSID</Label>
                <Input
                  id="hotspot-ssid"
                  type="text"
                  value={hotspotSsid}
                  onChange={(e) => setHotspotSsid(e.target.value)}
                  placeholder="Dragonfly Garden"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hotspot-security">Security</Label>
                <Select value={hotspotSecurity} onValueChange={(value) => setHotspotSecurity(value as "WPA" | "WEP" | "nopass") }>
                  <SelectTrigger id="hotspot-security">
                    <SelectValue placeholder="Security" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WPA">WPA/WPA2</SelectItem>
                    <SelectItem value="WEP">WEP</SelectItem>
                    <SelectItem value="nopass">Open network</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {hotspotSecurity !== "nopass" && (
              <div className="space-y-2">
                <Label htmlFor="hotspot-password">Wi-Fi Password</Label>
                <Input
                  id="hotspot-password"
                  type="password"
                  value={hotspotPassword}
                  onChange={(e) => setHotspotPassword(e.target.value)}
                  placeholder="Enter network password"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">This information is used to generate a secondary hotspot QR code for customers to scan and join the local network before ordering.</p>
            <Button onClick={saveHotspotSettings} disabled={hotspotSaving} className="bg-green-700 hover:bg-green-800 text-white flex gap-2">
              {hotspotSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : hotspotSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved</>
                : "Save Hotspot Settings"}
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
          <div className="space-y-6">
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

              {/* Daily Sales Report Button */}
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
          </div>
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

      {/* ── Password Recovery ───────────────────────────────── */}
      <AccordionItem value="recovery" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-4 py-4 sm:px-6 sm:py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">{t("m.passwordRecovery")}</h3>
            <p className="text-sm text-muted-foreground font-normal">{t("m.forgotDesc")}</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 border-t">
          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder={t("m.resetEmailPlaceholder")}
                className="flex-1"
              />
              <Button onClick={sendReset} disabled={resetSending} variant="outline" className="flex gap-2 shrink-0">
                {resetSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {t("m.send")}
              </Button>
            </div>
            {resetMsg && <p className="text-sm text-foreground/70">{resetMsg}</p>}
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
                      .sqlite
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

            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              {/* Local Backups */}
              <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-gray-800 flex items-center gap-2">
                    <UploadCloud className="h-4 w-4 text-emerald-500" /> {t("m.localBackups")}
                  </div>
                  <span className="text-xs text-muted-foreground">{t("m.localBackupNote")}</span>
                </div>
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
              </div>

              {/* Cloud Backups + Local Upload Restore */}
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

                <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
                  <h4 className="font-bold text-gray-800">{t("m.restoreLocalDevice")}</h4>
                  <p className="text-sm text-gray-600">{t("m.restoreLocalDeviceDesc")}</p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <Label htmlFor="backup-upload" className="text-xs text-muted-foreground">{t("m.uploadBackupFile")}</Label>
                      <input
                        id="backup-upload"
                        type="file"
                        title={t("m.uploadBackupFile")}
                        aria-label={t("m.uploadBackupFile")}
                        accept=".sqlite"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          handleUploadBackupFile(file);
                        }}
                        className="block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold"
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
                        } catch (err: any) {
                          setUploadError(err.message || t("m.restoreFailed", { message: "Unknown error" }));
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
                  {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
                </div>
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

    </Accordion>

      {/* ── In-app Restore Confirmation Dialog ───────────────── */}
      <Dialog open={!!restoreConfirmFile} onOpenChange={(open) => { if (!open) setRestoreConfirmFile(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Confirm Restore
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm text-gray-600">
              Are you sure you want to restore the system to <strong className="text-gray-900">"{restoreConfirmFile}"</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 mt-2">
            <p className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" /> WARNING
            </p>
            <p className="text-sm text-red-700 mt-1">
              All current data will be overwritten and lost immediately. This cannot be undone.
            </p>
          </div>
          <div className="flex gap-3 mt-4 justify-end">
            <Button variant="outline" onClick={() => setRestoreConfirmFile(null)}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={executeRestore}>
              <UploadCloud className="h-4 w-4 mr-1.5" /> Yes, Restore
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── In-app Restore Result Dialog ──────────────────────── */}
      <Dialog open={confirmationDialog.open} onOpenChange={(open) => { if (!open) setConfirmationDialog(prev => ({ ...prev, open: false })); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{confirmationDialog.title}</DialogTitle>
            <DialogDescription className="pt-2 text-sm text-gray-600">
              {confirmationDialog.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4 justify-end">
            <Button variant="outline" onClick={() => setConfirmationDialog(prev => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConfirmationConfirm}
              disabled={confirmationDialog.pending}
            >
              {confirmationDialog.pending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Confirming...</> : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!restoreResult} onOpenChange={(open) => { if (!open) setRestoreResult(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${restoreResult?.isError ? 'text-red-700' : 'text-green-700'}`}>
              {restoreResult?.isError
                ? <><AlertCircle className="h-5 w-5" /> Restore Failed</>
                : <><CheckCircle2 className="h-5 w-5" /> Restore Successful</>}
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm">
              {restoreResult?.message}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setRestoreResult(null)}>
              {restoreResult?.isError ? 'Close' : 'OK'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
