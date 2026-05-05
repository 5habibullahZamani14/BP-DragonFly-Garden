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
import { HelpModal, HelpSection } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";

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
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex flex-col p-6">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center mb-auto">
          <SettingsModal />
          <HelpModal title="Manager" sections={managerHelpSections} />
        </div>
        <div className="flex-1 flex items-center justify-center pb-20">
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <SettingsModal />
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
            <span className="text-sm font-medium text-gray-700 hidden sm:inline">
              User: <span className="text-green-700 font-bold">Admin</span>
            </span>
            <HelpModal title="Manager" sections={managerHelpSections} />
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

const managerHelpSections: HelpSection[] = [
  {
    id: "overview",
    title: "1. Dashboard Overview",
    content: (
      <div className="space-y-2">
        <p>The Management Dashboard is your central hub for controlling the restaurant. It is divided into five main sections:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Settings:</strong> Configure restaurant working hours.</li>
          <li><strong>Employees:</strong> Manage staff, salaries, and shifts.</li>
          <li><strong>Inventory:</strong> Track raw materials and build recipes.</li>
          <li><strong>Tables:</strong> Add or remove physical tables and generate QR codes.</li>
          <li><strong>Grand Archive:</strong> View complete logs of all system activity.</li>
        </ul>
      </div>
    )
  },
  {
    id: "add-table",
    title: "2. How to Add, Rename, or Remove a Table",
    content: (
      <div className="space-y-2">
        <p>To manage the physical tables in your restaurant:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Click on the <strong>Tables</strong> card from the main overview.</li>
          <li>To <strong>Add a Table</strong>: Click the green "+ Add Table" button in the top right. Enter a human-readable name (e.g., "Table 1") and a unique QR Code Identifier (e.g., "table-1"). Click Save. The system will automatically generate a scannable QR code.</li>
          <li>To <strong>Rename/Edit</strong>: Hover your mouse over an existing table card. Click the blue pencil icon that appears in the top right corner. Update the details and click Update.</li>
          <li>To <strong>Remove</strong>: Hover over the table card and click the red trash can icon. Confirm the deletion. <em>Note: This will break any existing printed QR codes for this table.</em></li>
        </ol>
      </div>
    )
  },
  {
    id: "manage-employees",
    title: "3. How to Manage Employees & Roles",
    content: (
      <div className="space-y-2">
        <p>The Employees section allows you to manage your workforce and view payroll analytics:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Click the <strong>Employees</strong> card. At the top, you will see charts breaking down your staff distribution and payroll load.</li>
          <li>To <strong>Add Staff</strong>: Click "+ Add Employee". Fill out their Name, Department (e.g., Chef, Waiter), Salary, and Shift Times. When saved, the system will automatically generate a unique 4-character uppercase Employee ID.</li>
          <li>To <strong>Edit</strong>: Find the employee in their department group and click "Edit". You can adjust their salary, shift times, or contact info here.</li>
          <li>To <strong>Remove/Archive</strong>: Click "Archive". The employee will be removed from the active system (they can no longer log in), but their historical data is preserved in the Grand Archive.</li>
        </ol>
      </div>
    )
  },
  {
    id: "working-hours",
    title: "4. Setting Restaurant Working Hours",
    content: (
      <div className="space-y-2">
        <p>The restaurant's operating hours dictate when employees can actively process orders.</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Navigate to the <strong>Settings</strong> tab.</li>
          <li>Under "Restaurant Operating Hours", define the Start Time and End Time.</li>
          <li><strong>Important:</strong> The Payment Counter system constantly monitors these hours. When the End Time is reached, any cashier currently logged into the Payment Counter will be automatically logged out by the system.</li>
        </ol>
      </div>
    )
  },
  {
    id: "inventory-recipes",
    title: "5. Tracking Inventory & Building Recipes",
    content: (
      <div className="space-y-2">
        <p>The Inventory system ensures you never run out of ingredients. It has three sub-tabs:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Overview Analytics:</strong> Shows a chart of your stock health. Items that drop below their warning threshold will appear red.</li>
          <li><strong>Raw Stock Levels:</strong> Click "+ Add Inventory Item" to register raw ingredients (e.g., Tomatoes, Chicken). Set the maximum capacity and the low-stock warning percentage (e.g., alert me at 15%). You can manually update stock levels here when a delivery arrives.</li>
          <li><strong>Menu Recipes Builder:</strong> This is critical. Select a menu item from the list on the left. Then, add ingredients to it (e.g., Chicken Burger uses 1 Chicken Patty, 2 Buns). <em>When a customer orders this item, the exact quantities defined here are automatically deducted from the Raw Stock.</em></li>
        </ul>
      </div>
    )
  },
  {
    id: "grand-archive",
    title: "6. Using the Grand Archive (Logs)",
    content: (
      <div className="space-y-2">
        <p>The Grand Archive acts as your restaurant's black box, recording every single action.</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Click the <strong>Grand Archive</strong> card.</li>
          <li>You will see a chronological list of actions (e.g., "Cashier processed payment", "Manager updated inventory", "Order placed").</li>
          <li>Use the category filters (All, Orders, Inventory, Employees, System) to narrow down the logs.</li>
          <li>Click "Export to CSV" to download the currently filtered logs into a spreadsheet for accounting or auditing purposes.</li>
        </ol>
      </div>
    )
  }
];
