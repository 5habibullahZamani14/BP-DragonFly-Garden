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
import { fetchSettings, updateSetting, fetchManagerProfile, updateManagerProfile, sendPasswordResetEmail, fetchBackups, fetchCloudBackups, createBackup, restoreBackup, restoreCloudBackup, restoreUploadedBackup, downloadBackup, applyDefaultCardSize, fetchPatterns, BackupFile } from "@/lib/api";
import { CheckCircle2, Eye, EyeOff, Loader2, Mail, Database, DownloadCloud, UploadCloud, CloudDownload, AlertCircle, Percent, AlertTriangle } from "lucide-react";
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
      if (data?.kitchen_passcode) setKitchenPasscode(data.kitchen_passcode);
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

  if (hoursLoading) return <div className="p-8 text-center text-gray-500 animate-pulse">{t("m.loadingSettings")}</div>;

  return (
    <>
    <Accordion type="single" collapsible className="space-y-6">

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
