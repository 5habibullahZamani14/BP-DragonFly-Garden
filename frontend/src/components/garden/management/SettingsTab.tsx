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
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { fetchSettings, updateSetting, fetchManagerProfile, updateManagerProfile, sendPasswordResetEmail, fetchBackups, createBackup, restoreBackup, BackupFile } from "@/lib/api";
import { CheckCircle2, Eye, EyeOff, Loader2, Mail, Database, DownloadCloud, UploadCloud, AlertCircle } from "lucide-react";

export const SettingsTab = () => {
  const [hours, setHours] = useState({ start: "09:00", end: "22:00" });
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursSaved, setHoursSaved] = useState(false);

  const [kitchenPasscode, setKitchenPasscode] = useState("");
  const [passcodeSaved, setPasscodeSaved] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);

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
  const [backupName, setBackupName] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{text: string, isError: boolean} | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const data = await fetchSettings();
      if (data?.work_hours) setHours(data.work_hours);
      if (data?.kitchen_passcode) setKitchenPasscode(data.kitchen_passcode);
    } catch (e) { console.error("Settings load failed", e); }
    finally { setHoursLoading(false); }

    try {
      const p = await fetchManagerProfile();
      setProfile({ name: p.name || "", id: p.id || "", email: p.email || "", phone: p.phone || "" });
    } catch (e) { console.error("Profile load failed", e); }

    loadBackups();
  };

  const loadBackups = async () => {
    try {
      const data = await fetchBackups();
      setBackups(data || []);
      
      // Auto-generate a default name for new backups
      const dateStr = new Date().toISOString().split('T')[0];
      setBackupName(`backup_${dateStr}`);
    } catch (e) {
      console.error("Failed to load backups", e);
    }
  };

  const saveHours = async () => {
    await updateSetting("work_hours", hours);
    setHoursSaved(true);
    setTimeout(() => setHoursSaved(false), 2500);
  };

  const savePasscode = async () => {
    if (!kitchenPasscode.trim()) return;
    await updateSetting("kitchen_passcode", kitchenPasscode.trim());
    setPasscodeSaved(true);
    setTimeout(() => setPasscodeSaved(false), 2500);
  };

  const saveProfile = async () => {
    setProfileError("");
    if (!profile.name.trim() || !profile.id.trim()) {
      setProfileError("Name and Manager ID are required.");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setProfileError("Passwords do not match.");
      return;
    }
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
      setProfileError("Failed to save. Please try again.");
    } finally {
      setProfileSaving(false);
    }
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
      if (err.message && err.message.includes("already exists")) {
        setShowOverwriteConfirm(true);
      } else {
        setBackupMsg({ text: `⚠️ ${err.message || "Failed to create backup"}`, isError: true });
      }
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to restore the system to "${filename}"?\n\nWARNING: All current data will be overwritten and lost immediately. This cannot be undone.`)) {
      return;
    }
    
    setRestoreLoading(filename);
    try {
      await restoreBackup(filename);
      window.alert("System restored successfully. The page will now reload.");
      window.location.reload();
    } catch (err: any) {
      window.alert(`Restore failed: ${err.message || "Unknown error"}`);
      setRestoreLoading(null);
    }
  };

  if (hoursLoading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading settings...</div>;

  return (
    <Accordion type="single" collapsible className="space-y-6">

      {/* ── Working Hours ───────────────────────────────────── */}
      <AccordionItem value="hours" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Restaurant Working Hours</h3>
            <p className="text-sm text-muted-foreground font-normal">
              These hours determine when employees are automatically logged out.
              The manager account is exempt from this restriction.
            </p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pt-4 pb-6 border-t">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="start-time">Opening Time</Label>
                <Input id="start-time" type="time" value={hours.start}
                  onChange={(e) => setHours({ ...hours, start: e.target.value })} className="w-full text-lg" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">Closing Time</Label>
                <Input id="end-time" type="time" value={hours.end}
                  onChange={(e) => setHours({ ...hours, end: e.target.value })} className="w-full text-lg" />
              </div>
            </div>
            <Button onClick={saveHours} className="bg-green-700 hover:bg-green-800 text-white flex gap-2">
              {hoursSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved!</> : "Save Hours"}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── Kitchen Passcode ────────────────────────────────── */}
      <AccordionItem value="kitchen" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Kitchen Access Passcode</h3>
            <p className="text-sm text-muted-foreground font-normal">
              This is the passcode your kitchen crew enters to access the Kitchen Board. Share it with your staff.
            </p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pt-4 pb-6 border-t">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="kitchen-passcode">Passcode</Label>
              <div className="relative">
                <Input
                  id="kitchen-passcode"
                  type={showPasscode ? "text" : "password"}
                  value={kitchenPasscode}
                  onChange={(e) => setKitchenPasscode(e.target.value)}
                  placeholder="Enter new kitchen passcode..."
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowPasscode(!showPasscode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground">
                  {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button onClick={savePasscode} className="bg-green-700 hover:bg-green-800 text-white flex gap-2">
              {passcodeSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved!</> : "Update Passcode"}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── Manager Profile ─────────────────────────────────── */}
      <AccordionItem value="profile" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Manager Profile</h3>
            <p className="text-sm text-muted-foreground font-normal">
              Your personal details and login credentials. Your email is used for password recovery.
            </p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pt-4 pb-6 border-t">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="mgr-name">Full Name</Label>
                <Input id="mgr-name" value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  placeholder="e.g. Ahmad bin Ibrahim" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mgr-id">Manager ID <span className="text-xs text-foreground/50">(used to log in)</span></Label>
                <Input id="mgr-id" value={profile.id}
                  onChange={(e) => setProfile({ ...profile, id: e.target.value })}
                  placeholder="e.g. admin" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mgr-email">Email Address <span className="text-xs text-foreground/50">(for password recovery)</span></Label>
                <Input id="mgr-email" type="email" value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  placeholder="e.g. manager@dragonflygarden.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mgr-phone">Phone / WhatsApp</Label>
                <Input id="mgr-phone" value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="e.g. +60 12-345 6789" />
              </div>
            </div>

            {/* Change password */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold text-foreground/70">Change Password <span className="font-normal text-foreground/40">(leave blank to keep current)</span></p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-pw">New Password</Label>
                  <div className="relative">
                    <Input id="new-pw" type={showPassword ? "text" : "password"}
                      value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password..." className="pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-pw">Confirm Password</Label>
                  <Input id="confirm-pw" type={showPassword ? "text" : "password"}
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password..." />
                </div>
              </div>
            </div>

            {profileError && <p className="text-sm text-destructive font-medium">{profileError}</p>}

            <Button onClick={saveProfile} disabled={profileSaving} className="bg-green-700 hover:bg-green-800 text-white flex gap-2">
              {profileSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                : profileSaved ? <><CheckCircle2 className="h-4 w-4" /> Saved!</>
                : "Save Profile"}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── Password Recovery ───────────────────────────────── */}
      <AccordionItem value="recovery" className="border rounded-xl bg-card text-card-foreground shadow-sm">
        <AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Password Recovery</h3>
            <p className="text-sm text-muted-foreground font-normal">
              Forgot your password? Enter your registered email and we will send your credentials to you.
            </p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pt-4 pb-6 border-t">
          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="Enter your registered email..."
                className="flex-1"
              />
              <Button onClick={sendReset} disabled={resetSending} variant="outline" className="flex gap-2 shrink-0">
                {resetSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send
              </Button>
            </div>
            {resetMsg && <p className="text-sm text-foreground/70">{resetMsg}</p>}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── System Backups ──────────────────────────────────── */}
      <AccordionItem value="backups" className="border rounded-xl bg-card text-card-foreground shadow-sm border-blue-200">
        <AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-blue-50/50 rounded-t-xl data-[state=closed]:rounded-b-xl transition-all">
          <div className="text-left flex flex-col gap-1.5">
            <h3 className="font-semibold leading-none tracking-tight text-lg text-blue-900 flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" /> System Backup & Restore
            </h3>
            <p className="text-sm text-blue-700/70 font-normal">
              Create complete offline snapshots of the database, or restore the entire system instantly from an older backup file.
            </p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pt-4 pb-6 border-t border-blue-100 bg-blue-50/20">
          <div className="space-y-8">
            {/* Create Backup */}
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
              <h4 className="font-bold text-gray-800 flex items-center gap-2">
                <DownloadCloud className="h-4 w-4 text-blue-500" /> Create New Backup
              </h4>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-500">Backup File Name</Label>
                  <div className="flex items-center">
                    <Input 
                      value={backupName} 
                      onChange={(e) => { setBackupName(e.target.value); setShowOverwriteConfirm(false); setBackupMsg(null); }}
                      placeholder="e.g. end_of_month_backup"
                      className="rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:border-blue-500"
                    />
                    <div className="h-10 px-3 flex items-center bg-gray-50 border border-l-0 border-input rounded-r-md text-sm text-gray-500 font-mono">
                      .sqlite
                    </div>
                  </div>
                </div>
                <div className="flex items-end">
                  {!showOverwriteConfirm ? (
                    <Button 
                      onClick={() => handleCreateBackup(false)} 
                      disabled={backupLoading || !backupName.trim()} 
                      className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                    >
                      {backupLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Save Backup
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 w-full sm:w-auto animate-in slide-in-from-right-4">
                      <div className="text-sm font-bold text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" /> Already exists. Overwrite?
                      </div>
                      <Button onClick={() => handleCreateBackup(true)} variant="destructive" size="sm">Yes</Button>
                      <Button onClick={() => setShowOverwriteConfirm(false)} variant="outline" size="sm">No</Button>
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

            {/* List Backups */}
            <div className="space-y-3">
              <h4 className="font-bold text-gray-800 flex items-center gap-2">
                <UploadCloud className="h-4 w-4 text-emerald-500" /> Available Backups
              </h4>
              {backups.length === 0 ? (
                <div className="text-center p-6 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-500 text-sm">
                  No backups found on the server.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {backups.map((file) => (
                    <div key={file.filename} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between gap-4 hover:border-blue-300 transition-colors">
                      <div>
                        <p className="font-bold text-gray-800 break-all">{file.filename}</p>
                        <div className="flex gap-4 mt-2 text-xs font-medium text-gray-500">
                          <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                          <span>{new Date(file.created_at).toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <Button 
                        onClick={() => handleRestoreBackup(file.filename)} 
                        disabled={restoreLoading !== null}
                        variant="outline" 
                        className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 transition-colors"
                      >
                        {restoreLoading === file.filename ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Restoring...</>
                        ) : (
                          "Restore This Version"
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

    </Accordion>
  );
};
