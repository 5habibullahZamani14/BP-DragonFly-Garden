import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchSettings, updateSetting, fetchManagerProfile, updateManagerProfile, sendPasswordResetEmail } from "@/lib/api";
import { CheckCircle2, Eye, EyeOff, Loader2, Mail } from "lucide-react";

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

  if (hoursLoading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading settings...</div>;

  return (
    <div className="space-y-6">

      {/* ── Working Hours ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Restaurant Working Hours</CardTitle>
          <CardDescription>
            These hours determine when employees are automatically logged out.
            The manager account is exempt from this restriction.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
        </CardContent>
      </Card>

      {/* ── Kitchen Passcode ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Kitchen Access Passcode</CardTitle>
          <CardDescription>
            This is the passcode your kitchen crew enters to access the Kitchen Board.
            Share it with your kitchen staff. Default: <code className="text-xs bg-muted px-1 rounded">kitchen2024</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      {/* ── Manager Profile ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Manager Profile</CardTitle>
          <CardDescription>
            Your personal details and login credentials. Your email is used for password recovery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
        </CardContent>
      </Card>

      {/* ── Password Recovery ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Password Recovery</CardTitle>
          <CardDescription>
            Forgot your password? Enter your registered email and we will send your credentials to you.
            <br />
            <span className="text-xs text-foreground/40">Requires RESEND_API_KEY to be set in the backend .env file.</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

    </div>
  );
};
