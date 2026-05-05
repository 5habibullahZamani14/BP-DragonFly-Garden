import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Settings, Users, PackageOpen, FileText, Grid3X3, ArrowLeft } from "lucide-react";
import { SettingsTab } from "./management/SettingsTab";
import { EmployeesTab } from "./management/EmployeesTab";
import { InventoryTab } from "./management/InventoryTab";
import { LogsTab } from "./management/LogsTab";
import { TablesTab } from "./management/TablesTab";

interface ManagementViewProps {
  qrCode: string;
  notify: (kind: "success" | "error", text: string) => void;
}

export const ManagementView = ({ notify }: ManagementViewProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [loginName, setLoginName] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "settings" | "employees" | "inventory" | "logs" | "tables">("overview");

  useEffect(() => {
    const savedLogin = localStorage.getItem("managerLogin");
    if (savedLogin) {
      try {
        const parsed = JSON.parse(savedLogin);
        const today = new Date().toDateString();
        if (parsed.date === today && parsed.id === "admin") {
          setIsLoggedIn(true);
        } else {
          localStorage.removeItem("managerLogin");
        }
      } catch (e) {
        localStorage.removeItem("managerLogin");
      }
    }
  }, []);

  const handleLogin = () => {
    if (loginId === "admin" && loginName === "manager") {
      setIsLoggedIn(true);
      localStorage.setItem(
        "managerLogin",
        JSON.stringify({
          id: "admin",
          name: "manager",
          date: new Date().toDateString()
        })
      );
    } else {
      notify("error", "Invalid Manager Credentials");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginId("");
    setLoginName("");
    localStorage.removeItem("managerLogin");
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-xl border-green-100">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="bg-green-100 p-3 rounded-full">
                <Settings className="h-8 w-8 text-green-700" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center text-gray-900">Manager Access</CardTitle>
            <CardDescription className="text-center">Authorized personnel only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="login-id">Manager ID</Label>
              <Input
                id="login-id"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="e.g. admin"
              />
            </div>
            <div>
              <Label htmlFor="login-name">Manager Name</Label>
              <Input
                id="login-name"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="e.g. manager"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleLogin} className="w-full text-lg h-12 bg-green-700 hover:bg-green-800">Access Dashboard</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            {activeTab !== "overview" && (
              <Button variant="outline" size="icon" onClick={() => setActiveTab("overview")} className="rounded-full shadow-sm">
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </Button>
            )}
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Settings className="h-8 w-8 text-green-700" />
                Management Dashboard
              </h1>
              <p className="text-gray-500 mt-1">Dragonfly Garden Restaurant Administration</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-white/60 px-4 py-2 rounded-full shadow-sm">
            <span className="text-sm font-medium text-gray-700">
              User: <span className="text-green-700 font-bold">Admin</span>
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full">
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
        
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-green-500 cursor-pointer" onClick={() => setActiveTab("settings")}>
              <CardContent className="pt-6">
                <Settings className="h-10 w-10 text-green-500 mb-4" />
                <CardTitle className="mb-2">Settings</CardTitle>
                <CardDescription>Working hours and system configuration</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-blue-500 cursor-pointer" onClick={() => setActiveTab("employees")}>
              <CardContent className="pt-6">
                <Users className="h-10 w-10 text-blue-500 mb-4" />
                <CardTitle className="mb-2">Employees</CardTitle>
                <CardDescription>Staff directory, shifts, and salaries</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-orange-500 cursor-pointer" onClick={() => setActiveTab("inventory")}>
              <CardContent className="pt-6">
                <PackageOpen className="h-10 w-10 text-orange-500 mb-4" />
                <CardTitle className="mb-2">Inventory</CardTitle>
                <CardDescription>Raw materials, stock levels, and recipes</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500 cursor-pointer" onClick={() => setActiveTab("tables")}>
              <CardContent className="pt-6">
                <Grid3X3 className="h-10 w-10 text-emerald-500 mb-4" />
                <CardTitle className="mb-2">Tables</CardTitle>
                <CardDescription>Manage table numbers and QR codes</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-purple-500 cursor-pointer" onClick={() => setActiveTab("logs")}>
              <CardContent className="pt-6">
                <FileText className="h-10 w-10 text-purple-500 mb-4" />
                <CardTitle className="mb-2">Grand Archive</CardTitle>
                <CardDescription>Audit logs, activity history, and reports</CardDescription>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "settings" && <SettingsTab />}
        {activeTab === "employees" && <EmployeesTab />}
        {activeTab === "inventory" && <InventoryTab />}
        {activeTab === "tables" && <TablesTab />}
        {activeTab === "logs" && <LogsTab />}
        
      </div>
    </div>
  );
};
