import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Settings, Users, PackageOpen, MessageSquareText } from "lucide-react";

interface ManagementViewProps {
  qrCode: string;
  notify: (kind: "success" | "error", text: string) => void;
}

export const ManagementView = ({ qrCode, notify }: ManagementViewProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [loginName, setLoginName] = useState("");

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
      notify("success", "Manager logged in successfully");
    } else {
      notify("error", "Invalid Manager Credentials");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginId("");
    setLoginName("");
    localStorage.removeItem("managerLogin");
    notify("success", "Logged out successfully");
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
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Settings className="h-8 w-8 text-green-700" />
              Management Dashboard
            </h1>
            <p className="text-gray-500 mt-1">Dragonfly Garden Restaurant Administration</p>
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-green-500">
            <CardHeader>
              <Settings className="h-6 w-6 text-green-500 mb-2" />
              <CardTitle>Restaurant Settings</CardTitle>
              <CardDescription>Manage VAT, Service Charge, and Hours</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">Configure global settings that apply to all orders and terminals.</p>
              <Button className="w-full bg-green-50 text-green-700 hover:bg-green-100 border border-green-200" onClick={() => notify("success", "Settings module coming soon in Stage 2!")}>
                Open Settings
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-blue-500">
            <CardHeader>
              <Users className="h-6 w-6 text-blue-500 mb-2" />
              <CardTitle>Employee Directory</CardTitle>
              <CardDescription>Add, remove, and manage staff</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">Control access to the Payment Counter and Kitchen displays.</p>
              <Button className="w-full bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200" onClick={() => notify("success", "Employee module coming soon in Stage 2!")}>
                Manage Staff
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-orange-500">
            <CardHeader>
              <PackageOpen className="h-6 w-6 text-orange-500 mb-2" />
              <CardTitle>Inventory & Menu</CardTitle>
              <CardDescription>Stock levels and menu items</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">Add new items, update prices, and mark items as unavailable.</p>
              <Button className="w-full bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200" onClick={() => notify("success", "Inventory module coming soon in Stage 2!")}>
                Manage Menu
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-purple-500">
            <CardHeader>
              <MessageSquareText className="h-6 w-6 text-purple-500 mb-2" />
              <CardTitle>Customer Feedback</CardTitle>
              <CardDescription>Reviews and suggestions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">View and respond to feedback submitted by customers at the table.</p>
              <Button className="w-full bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200" onClick={() => notify("success", "Feedback module coming soon in Stage 2!")}>
                View Feedback
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
