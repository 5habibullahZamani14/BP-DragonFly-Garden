import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchSettings, updateSetting } from "@/lib/api";

export const SettingsTab = () => {
  const [hours, setHours] = useState({ start: "09:00", end: "22:00" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await fetchSettings();
      if (data && data.work_hours) {
        setHours(data.work_hours);
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      await updateSetting("work_hours", hours);
      // No notifications based on user request! Just update silently or show inline text
    } catch (e) {
      console.error("Failed to save settings", e);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading settings...</div>;

  return (
    <div className="space-y-6">
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
              <Input 
                id="start-time" 
                type="time" 
                value={hours.start} 
                onChange={(e) => setHours({ ...hours, start: e.target.value })} 
                className="w-full text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-time">Closing Time</Label>
              <Input 
                id="end-time" 
                type="time" 
                value={hours.end} 
                onChange={(e) => setHours({ ...hours, end: e.target.value })} 
                className="w-full text-lg"
              />
            </div>
          </div>
          <Button onClick={saveSettings} className="bg-green-700 hover:bg-green-800 text-white">
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
