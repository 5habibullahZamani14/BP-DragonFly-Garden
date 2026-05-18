/*
 * ManagementView.tsx — The administrative nerve center of the restaurant.
 *
 * I designed this view as a secure dashboard where managers can oversee
 * the entire operation. It is protected by a login screen that requires
 * a Manager ID and Password, both verified against the backend.
 *
 * Key architecture features:
 *
 *   1. Secure Authentication: I implemented a two-step login process.
 *      Successful logins are stored in localStorage with a 7-day expiry
 *      (matching the kitchen's session model). I also built a password
 *      recovery flow that uses the backend email service (Resend) to
 *      send credentials to the manager's registered email.
 *
 *   2. Tabbed Navigation: To keep the interface clean, I used a tabbed
 *      system. The "Overview" acts as a portal with large cards, while
 *      the individual tabs (Settings, Employees, Inventory, etc.) handle
 *      the heavy lifting. I persist the activeTab in sessionStorage so
 *      if the manager refreshes the page, they land right back where they
 *      were.
 *
 *   3. Shared Modals: The SettingsModal and HelpModal are placed at the
 *      top level so they remain accessible throughout the management
 *      experience, even on the login screen.
 *
 *   4. Contextual Help: At the bottom of this file, I defined a detailed
 *      managerHelpSections array. This provides an on-screen manual for
 *      every administrative task, from adding tables to managing inventory.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Settings, Users, PackageOpen, FileText, Grid3X3, ArrowLeft, Loader2, Mail, DollarSign } from "lucide-react";
import { SettingsTab } from "./management/SettingsTab";
import { EmployeesTab } from "./management/EmployeesTab";
import { InventoryTab } from "./management/InventoryTab";
import { LogsTab } from "./management/LogsTab";
import { TablesTab } from "./management/TablesTab";
import { FinanceTab } from "./management/FinanceTab";
import { HelpModal, HelpSection } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";
import { managerAuth, sendPasswordResetEmail, fetchInventory } from "@/lib/api";
import type { InventoryItem } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, AlertTriangle } from "lucide-react";

interface ManagementViewProps {
  qrCode: string;
  notify: (kind: "success" | "error", text: string) => void;
}

const MANAGER_TABS = ["overview", "settings", "employees", "inventory", "logs", "tables", "finance"] as const;
type ManagerTab = typeof MANAGER_TABS[number];

export const ManagementView = ({ notify }: ManagementViewProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");
  const [activeTab, setActiveTab] = useState<ManagerTab>(() => {
    try {
      const s = sessionStorage.getItem("mgr_active_tab");
      return MANAGER_TABS.includes(s as ManagerTab) ? s as ManagerTab : "overview";
    } catch { return "overview"; }
  });

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedLogin = localStorage.getItem("managerLogin");
    if (savedLogin) {
      try {
        const parsed = JSON.parse(savedLogin);
        if (parsed.expiry && Date.now() < parsed.expiry) {
          setIsLoggedIn(true);
        } else {
          localStorage.removeItem("managerLogin");
        }
      } catch (e) {
        localStorage.removeItem("managerLogin");
      }
    }
  }, []);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [inventoryAction, setInventoryAction] = useState<{subTab?: "overview" | "stock" | "recipes", editItemId?: number} | null>(null);

  const loadNotifications = async () => {
    try {
      const invData = await fetchInventory();
      if (!invData) return;
      const lowStock = invData.filter((item: InventoryItem) => {
        const percent = Math.min(100, Math.max(0, (item.current_stock / item.max_stock) * 100));
        return percent <= item.low_stock_threshold_percent;
      });
      setNotifications(lowStock.map((item: InventoryItem) => ({
        id: `inv-${item.id}`,
        type: "low_stock",
        title: "Low Stock Alert",
        message: `${item.name} is running low (${Number(item.current_stock).toFixed(1)} ${item.unit} remaining).`,
        action: () => {
          setInventoryAction({ subTab: "stock", editItemId: item.id });
          goToTab("inventory");
        }
      })));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isLoggedIn) loadNotifications();
  }, [isLoggedIn]);

  useWebSocket(["NEW_ORDER", "NEW_PAYMENT"], () => {
    if (isLoggedIn) loadNotifications();
  });

  const handleLogin = async () => {
    if (!loginId.trim() || !loginPassword.trim()) {
      setLoginError("Please enter both Manager ID and Password.");
      return;
    }
    setLoginLoading(true);
    setLoginError("");
    try {
      const result = await managerAuth(loginId.trim(), loginPassword.trim());
      if (result.success) {
        setIsLoggedIn(true);
        localStorage.setItem("managerLogin", JSON.stringify({
          id: loginId.trim(),
          expiry: Date.now() + 7 * 24 * 60 * 60 * 1000,
        }));
      } else {
        setLoginError("Invalid Manager ID or Password. Please try again.");
      }
    } catch {
      setLoginError("Could not connect to the server. Please check your connection.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!forgotEmail.trim()) return;
    setForgotSending(true);
    setForgotMsg("");
    try {
      const result = await sendPasswordResetEmail(forgotEmail.trim());
      setForgotMsg(result.success
        ? "✅ " + result.message
        : "⚠️ " + result.message);
    } catch {
      setForgotMsg("⚠️ Could not send email. Check the backend email configuration.");
    } finally {
      setForgotSending(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginId("");
    sessionStorage.removeItem("mgr_active_tab");
    localStorage.removeItem("managerLogin");
  };

  const goToTab = (t: typeof activeTab) => {
    setActiveTab(t);
    sessionStorage.setItem("mgr_active_tab", t);
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
              {!showForgot ? (
                <>
                  <div>
                    <Label htmlFor="login-id">Manager ID</Label>
                    <Input
                      id="login-id"
                      value={loginId}
                      onChange={(e) => { setLoginId(e.target.value); setLoginError(""); }}
                      placeholder="e.g. admin"
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => { setLoginPassword(e.target.value); setLoginError(""); }}
                      placeholder="Enter password..."
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                  </div>
                  {loginError && <p className="text-sm text-red-600 font-medium">{loginError}</p>}
                  <button
                    type="button"
                    onClick={() => { setShowForgot(true); setLoginError(""); }}
                    className="text-xs text-green-700 hover:underline"
                  >
                    Forgot your password?
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Enter your registered email and we will send your credentials.</p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Your registered email..."
                      className="flex-1"
                    />
                    <Button onClick={handleForgot} disabled={forgotSending} variant="outline" className="shrink-0">
                      {forgotSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    </Button>
                  </div>
                  {forgotMsg && <p className="text-sm text-gray-700">{forgotMsg}</p>}
                  <button
                    type="button"
                    onClick={() => { setShowForgot(false); setForgotMsg(""); }}
                    className="text-xs text-green-700 hover:underline"
                  >
                    ← Back to login
                  </button>
                </>
              )}
            </CardContent>
            {!showForgot && (
              <CardFooter>
                <Button onClick={handleLogin} disabled={loginLoading} className="w-full text-lg h-12 bg-green-700 hover:bg-green-800">
                  {loginLoading ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Verifying...</> : "Access Dashboard"}
                </Button>
              </CardFooter>
            )}
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
              <Button variant="outline" size="icon" onClick={() => goToTab("overview")} className="rounded-full shadow-sm">
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
          
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 bg-white/60 px-4 py-2 rounded-full shadow-sm">
            <span className="text-sm font-semibold text-gray-800">
              {currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-sm font-medium text-gray-700 hidden sm:inline border-l border-gray-300 pl-4">
              User: <span className="text-green-700 font-bold">Admin</span>
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-full hover:bg-white/80" title="Notifications">
                  <Bell className="h-5 w-5 text-gray-600" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white shadow-sm" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0 overflow-hidden rounded-xl shadow-lg border-green-100">
                <div className="bg-gray-50/80 px-4 py-3 border-b">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Bell className="h-4 w-4 text-green-600" /> Notifications
                  </h3>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">You're all caught up!</div>
                  ) : (
                    <div className="flex flex-col">
                      {notifications.map((notif, idx) => (
                        <button
                          key={notif.id || idx}
                          onClick={notif.action}
                          className="text-left px-4 py-3 border-b last:border-0 hover:bg-green-50 transition-colors flex gap-3 items-start"
                        >
                          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-gray-800">{notif.title}</p>
                            <p className="text-xs text-gray-500 mt-1 leading-snug">{notif.message}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <HelpModal title="Manager" sections={managerHelpSections} />
            <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full">
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
        
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-green-500 cursor-pointer" onClick={() => goToTab("settings")}>
              <CardContent className="pt-6">
                <Settings className="h-10 w-10 text-green-500 mb-4" />
                <CardTitle className="mb-2">Settings</CardTitle>
                <CardDescription>Working hours and system configuration</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-blue-500 cursor-pointer" onClick={() => goToTab("employees")}>
              <CardContent className="pt-6">
                <Users className="h-10 w-10 text-blue-500 mb-4" />
                <CardTitle className="mb-2">Employees</CardTitle>
                <CardDescription>Staff directory, shifts, and salaries</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-orange-500 cursor-pointer" onClick={() => goToTab("inventory")}>
              <CardContent className="pt-6">
                <PackageOpen className="h-10 w-10 text-orange-500 mb-4" />
                <CardTitle className="mb-2">Inventory</CardTitle>
                <CardDescription>Raw materials, stock levels, and recipes</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500 cursor-pointer" onClick={() => goToTab("tables")}>
              <CardContent className="pt-6">
                <Grid3X3 className="h-10 w-10 text-emerald-500 mb-4" />
                <CardTitle className="mb-2">Tables</CardTitle>
                <CardDescription>Manage table numbers and QR codes</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-purple-500 cursor-pointer" onClick={() => goToTab("logs")}>
              <CardContent className="pt-6">
                <FileText className="h-10 w-10 text-purple-500 mb-4" />
                <CardTitle className="mb-2">Grand Archive</CardTitle>
                <CardDescription>Audit logs, activity history, and reports</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-rose-500 cursor-pointer" onClick={() => goToTab("finance")}>
              <CardContent className="pt-6">
                <DollarSign className="h-10 w-10 text-rose-500 mb-4" />
                <CardTitle className="mb-2">Finance</CardTitle>
                <CardDescription>Profit & Loss analysis and performance metrics</CardDescription>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "settings" && <SettingsTab />}
        {activeTab === "employees" && <EmployeesTab />}
        {activeTab === "inventory" && <InventoryTab initialSubTab={inventoryAction?.subTab} initialEditItemId={inventoryAction?.editItemId} />}
        {activeTab === "tables" && <TablesTab />}
        {activeTab === "logs" && <LogsTab />}
        {activeTab === "finance" && <FinanceTab />}
        
      </div>
    </div>
  );
};

const managerHelpSections: HelpSection[] = [
  {
    id: "access",
    title: "1. Logging In & Session",
    content: (
      <div className="space-y-2">
        <p>Use your Manager ID (<strong>admin</strong>) and Manager Name (<strong>manager</strong>) to log in. Your session is remembered for <strong>7 days</strong> — you will not need to log in again until the session expires or you click Logout.</p>
        <p>The ⚙️ Settings icon (top-left) and the ℹ️ Info icon (top-right) are always accessible, even before you log in.</p>
      </div>
    )
  },
  {
    id: "overview",
    title: "2. Dashboard Overview",
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
    title: "3. How to Add, Rename, or Remove a Table",
    content: (
      <div className="space-y-2">
        <p>To manage the physical tables in your restaurant:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Click on the <strong>Tables</strong> card from the main overview.</li>
          <li>To <strong>Add a Table</strong>: Click the green "+ Add Table" button. Enter a human-readable name (e.g., "Table 1") and a unique QR Code Identifier (e.g., "table-1"). Click Save. The system will automatically generate a scannable QR code.</li>
          <li>To <strong>Rename/Edit</strong>: Hover over an existing table card and click the blue pencil icon. Update the details and click Update.</li>
          <li>To <strong>Remove</strong>: Hover over the table card and click the red trash icon. Confirm the deletion. <em>Note: This will break any existing printed QR codes for this table.</em></li>
        </ol>
      </div>
    )
  },
  {
    id: "manage-employees",
    title: "4. How to Manage Employees & Roles",
    content: (
      <div className="space-y-2">
        <p>The Employees section allows you to manage your workforce and view payroll analytics:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Click the <strong>Employees</strong> card. At the top, you will see charts breaking down staff distribution and payroll load.</li>
          <li>To <strong>Add Staff</strong>: Click "+ Add Employee". Fill out their Name, Department, Salary, and Shift Times. The system will automatically generate a unique Employee ID.</li>
          <li>To <strong>Edit</strong>: Find the employee and click "Edit". Adjust their salary, shift times, or contact info.</li>
          <li>To <strong>Remove/Archive</strong>: Click "Archive". The employee will be removed from active use but their historical data is preserved in the Grand Archive.</li>
        </ol>
      </div>
    )
  },
  {
    id: "working-hours",
    title: "5. Setting Restaurant Working Hours",
    content: (
      <div className="space-y-2">
        <p>The restaurant's operating hours dictate when employees can actively process orders.</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Navigate to the <strong>Settings</strong> tab.</li>
          <li>Under "Restaurant Operating Hours", define the Start Time and End Time.</li>
          <li><strong>Important:</strong> When the End Time is reached, any cashier currently logged into the Payment Counter will be automatically logged out by the system.</li>
        </ol>
      </div>
    )
  },
  {
    id: "inventory-recipes",
    title: "6. Tracking Inventory & Building Recipes",
    content: (
      <div className="space-y-2">
        <p>The Inventory system ensures you never run out of ingredients. It has three sub-tabs:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Overview Analytics:</strong> Shows a chart of your stock health. Items below their warning threshold appear red.</li>
          <li><strong>Raw Stock Levels:</strong> Click "+ Add Inventory Item" to register raw ingredients. Set the maximum capacity and the low-stock warning percentage. You can manually update stock levels here when a delivery arrives.</li>
          <li><strong>Menu Recipes Builder:</strong> Select a menu item, then add ingredients to it. When a customer orders that item, the exact quantities defined here are automatically deducted from Raw Stock.</li>
        </ul>
      </div>
    )
  },
  {
    id: "display-settings",
    title: "7. Display Settings",
    content: (
      <div className="space-y-2">
        <p>Tap the <strong>⚙️ Settings icon</strong> in the top-left corner to open Display Settings. From there you can:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Switch between three font styles (Clarity, Classic, Elegance).</li>
          <li>Adjust the Interface Size and Text Size using sliders or +/− buttons.</li>
        </ul>
        <p>All settings are saved automatically and remembered across visits.</p>
      </div>
    )
  },
];
