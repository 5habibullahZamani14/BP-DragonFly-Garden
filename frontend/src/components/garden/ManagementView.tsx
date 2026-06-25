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

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Settings, Users, PackageOpen, FileText, Grid3X3, ArrowLeft, Loader2, Mail, DollarSign, Utensils, MessageSquare, Bot, Image as ImageIcon } from "lucide-react";
import { FeedbackTab } from "./management/FeedbackTab";
import { AIChatbotTab } from "./management/AIChatbotTab";
import { SettingsTab } from "./management/SettingsTab";
import { MenuTab } from "./management/MenuTab";
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
import { safeConsoleError } from "@/lib/safeConsole";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, AlertTriangle } from "lucide-react";

interface ManagementViewProps {
  qrCode: string;
  notify: (kind: "success" | "error", text: string) => void;
}

const MANAGER_TABS = ["overview", "settings", "employees", "inventory", "logs", "tables", "finance", "menu", "feedback", "ai-chatbot"] as const;
type ManagerTab = typeof MANAGER_TABS[number];
type ManagerNotification = {
  id: string;
  type: "low_stock";
  title: string;
  message: string;
  action: () => void;
};

export const ManagementView = ({ notify }: ManagementViewProps) => {
  const { t } = useTranslation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [shouldFlash, setShouldFlash] = useState(false);
  const flashTriggeredRef = useRef(false);
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

  const [notifications, setNotifications] = useState<ManagerNotification[]>([]);
  const [inventoryAction, setInventoryAction] = useState<{subTab?: "overview" | "stock" | "recipes", editItemId?: number} | null>(null);

  const loadNotifications = async () => {
    try {
      const invData = await fetchInventory();
      if (!invData) return false;
      const lowStock = invData.filter((item: InventoryItem) => {
        const percent = Math.min(100, Math.max(0, (item.current_stock / item.max_stock) * 100));
        return percent <= item.low_stock_threshold_percent;
      });
      setNotifications(lowStock.map((item: InventoryItem) => ({
        id: `inv-${item.id}`,
        type: "low_stock",
        title: t("manager.lowStockTitle"),
        message: t("manager.lowStockMessage", { name: item.name, stock: Number(item.current_stock).toFixed(1), unit: item.unit }),
        action: () => {
          setInventoryAction({ subTab: "stock", editItemId: item.id });
          goToTab("inventory");
        }
      })));
      return lowStock.length > 0;
    } catch (e) {
      safeConsoleError("Failed to load manager notifications", e);
      return false;
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      loadNotifications().then((hasLowStock) => {
        if (hasLowStock && !flashTriggeredRef.current) {
          setShouldFlash(true);
          flashTriggeredRef.current = true;
          setTimeout(() => {
            setShouldFlash(false);
          }, 4000);
        }
      });
    } else {
      flashTriggeredRef.current = false;
    }
  }, [isLoggedIn]);

  useWebSocket(["NEW_ORDER", "NEW_PAYMENT"], () => {
    if (isLoggedIn) loadNotifications();
  }, () => {
    const saved = localStorage.getItem("managerLogin");
    try {
      const parsed = JSON.parse(saved || "null");
      return parsed?.token || null;
    } catch {
      return null;
    }
  });

  const handleLogin = async () => {
    if (!loginId.trim() || !loginPassword.trim()) {
      setLoginError(t("manager.loginErrorBoth"));
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
          token: result.token,
          expiry: Date.now() + 7 * 24 * 60 * 60 * 1000,
        }));
      } else {
        setLoginError(t("manager.loginErrorInvalid"));
      }
    } catch {
      setLoginError(t("manager.loginErrorConnection"));
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
      setForgotMsg("⚠️ " + t("manager.emailFailed"));
    } finally {
      setForgotSending(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginId("");
    setLoginPassword("");
    sessionStorage.removeItem("mgr_active_tab");
    localStorage.removeItem("managerLogin");
  };

  const goToTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    sessionStorage.setItem("mgr_active_tab", tab);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex flex-col p-6">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center mb-auto">
          <SettingsModal restrictLanguages={true} />
          <HelpModal title={t("manager.helpTitle")} sections={getManagerHelpSections(t)} />
        </div>
        <div className="flex-1 flex items-center justify-center pb-20">
          <Card className="w-full max-w-md shadow-xl border-green-100">
            <CardHeader>
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 p-3 rounded-full">
                  <Settings className="h-8 w-8 text-green-700" />
                </div>
              </div>
              <CardTitle className="text-2xl text-center text-gray-900">{t("manager.loginTitle")}</CardTitle>
              <CardDescription className="text-center">{t("manager.authOnly")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showForgot ? (
                <>
                  <div>
                    <Label htmlFor="login-id">{t("manager.id")}</Label>
                    <Input
                      id="login-id"
                      value={loginId}
                      onChange={(e) => { setLoginId(e.target.value); setLoginError(""); }}
                      placeholder={t("manager.loginPlaceholderId")}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="login-password">{t("manager.password")}</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => { setLoginPassword(e.target.value); setLoginError(""); }}
                      placeholder={t("manager.loginPlaceholderPassword")}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                  </div>
                  {loginError && <p className="text-sm text-red-600 font-medium">{loginError}</p>}
                  <button
                    type="button"
                    onClick={() => { setShowForgot(true); setLoginError(""); }}
                    className="text-xs text-green-700 hover:underline"
                  >
                    {t("manager.forgot")}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">{t("manager.enterEmail")}</p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder={t("manager.enterEmail")}
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
                    {t("manager.backLogin")}
                  </button>
                </>
              )}
            </CardContent>
            {!showForgot && (
              <CardFooter>
                <Button onClick={handleLogin} disabled={loginLoading} className="w-full text-lg h-12 bg-green-700 hover:bg-green-800">
                  {loginLoading ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> {t("manager.verifying")}</> : t("manager.accessDash")}
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-3 sm:p-6">
      <style>{`
        @keyframes redFlashPulseThreeTimes {
          0% { opacity: 0; }
          6.25% { opacity: 0.45; }
          18.75% { opacity: 0.45; }
          25% { opacity: 0; }
          37.5% { opacity: 0; }
          43.75% { opacity: 0.45; }
          56.25% { opacity: 0.45; }
          62.5% { opacity: 0; }
          75% { opacity: 0; }
          81.25% { opacity: 0.45; }
          93.75% { opacity: 0.45; }
          100% { opacity: 0; }
        }
        .red-flash-overlay {
          animation: redFlashPulseThreeTimes 4s ease-in-out forwards;
        }
        @keyframes notificationGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
            background-color: rgba(254, 226, 226, 0.8);
            color: #ef4444;
          }
          50% {
            box-shadow: 0 0 0 8px rgba(249, 115, 22, 0);
            background-color: rgba(255, 237, 213, 0.9);
            color: #f97316;
          }
          100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
            background-color: rgba(254, 226, 226, 0.8);
            color: #ef4444;
          }
        }
        .notif-glow-btn {
          animation: notificationGlow 2s infinite ease-in-out !important;
        }
      `}</style>
      {shouldFlash && (
        <div className="fixed inset-0 bg-red-600 z-[9999] pointer-events-none red-flash-overlay" />
      )}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-8 gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <SettingsModal restrictLanguages={true} />
            {activeTab !== "overview" && (
              <Button variant="outline" size="icon" onClick={() => goToTab("overview")} className="rounded-full shadow-sm shrink-0">
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3 management-header-title">
                <Settings className="h-6 w-6 sm:h-8 sm:w-8 text-green-700 shrink-0" />
                <span className="truncate">{t("manager.dashboardTitle")}</span>
              </h1>
              <p className="text-gray-500 mt-1 text-sm sm:text-base">{t("manager.subtitle")}</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-white/60 px-3 py-2 sm:px-4 rounded-2xl sm:rounded-full shadow-sm">
            <span className="text-xs sm:text-sm font-semibold text-gray-800">
              {currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-sm font-medium text-gray-700 hidden sm:inline border-l border-gray-300 pl-4">
              {t("manager.userLabel")} <span className="text-green-700 font-bold">{t("manager.userAdmin")}</span>
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`relative rounded-full hover:bg-white/80 ${notifications.length > 0 ? "notif-glow-btn" : ""}`} 
                  title={t("manager.notifications")}
                >
                  <Bell className={`h-5 w-5 ${notifications.length > 0 ? "text-inherit" : "text-gray-600"}`} />
                  {notifications.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white shadow-sm" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0 overflow-hidden rounded-xl shadow-lg border-green-100">
                <div className="bg-gray-50/80 px-4 py-3 border-b">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Bell className="h-4 w-4 text-green-600" /> {t("manager.notifications")}
                  </h3>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">{t("manager.caughtUp")}</div>
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
            <HelpModal title={t("manager.helpTitle")} sections={getManagerHelpSections(t)} />
            <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full">
              <LogOut className="h-4 w-4 mr-2" /> {t("manager.logout")}
            </Button>
          </div>
        </div>
        
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-6">
            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-green-500 cursor-pointer min-w-0 overflow-hidden" onClick={() => goToTab("settings")}>
              <CardContent className="pt-6">
                <Settings className="h-10 w-10 text-green-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.settings")}</CardTitle>
                <CardDescription>{t("manager.settingsDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-blue-500 cursor-pointer min-w-0 overflow-hidden" onClick={() => goToTab("employees")}>
              <CardContent className="pt-6">
                <Users className="h-10 w-10 text-blue-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.employees")}</CardTitle>
                <CardDescription>{t("manager.employeesDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-orange-500 cursor-pointer min-w-0 overflow-hidden" onClick={() => goToTab("inventory")}>
              <CardContent className="pt-6">
                <PackageOpen className="h-10 w-10 text-orange-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.inventory")}</CardTitle>
                <CardDescription>{t("manager.inventoryDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500 cursor-pointer min-w-0 overflow-hidden" onClick={() => goToTab("tables")}>
              <CardContent className="pt-6">
                <Grid3X3 className="h-10 w-10 text-emerald-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.tables")}</CardTitle>
                <CardDescription>{t("manager.tablesDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-purple-500 cursor-pointer min-w-0 overflow-hidden" onClick={() => goToTab("logs")}>
              <CardContent className="pt-6">
                <FileText className="h-10 w-10 text-purple-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.logs")}</CardTitle>
                <CardDescription>{t("manager.logsDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-yellow-500 cursor-pointer min-w-0 overflow-hidden" onClick={() => goToTab("menu")}>
              <CardContent className="pt-6">
                <Utensils className="h-10 w-10 text-yellow-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.menu")}</CardTitle>
                <CardDescription>{t("manager.menuDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-rose-500 cursor-pointer min-w-0 overflow-hidden" onClick={() => goToTab("finance")}>
              <CardContent className="pt-6">
                <DollarSign className="h-10 w-10 text-rose-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.finance")}</CardTitle>
                <CardDescription>{t("manager.financeDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-teal-500 cursor-pointer min-w-0 overflow-hidden" onClick={() => goToTab("feedback")}>
              <CardContent className="pt-6">
                <MessageSquare className="h-10 w-10 text-teal-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.feedback.title")}</CardTitle>
                <CardDescription>{t("manager.feedback.desc")}</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500 cursor-pointer min-w-0 overflow-hidden" onClick={() => goToTab("ai-chatbot")}>
              <CardContent className="pt-6">
                <Bot className="h-10 w-10 text-emerald-500 mb-4" />
                <CardTitle className="mb-2">DragonBot AI</CardTitle>
                <CardDescription>Ask AI about any restaurant data — orders, menu, inventory, finance, and more.</CardDescription>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "settings" && <SettingsTab />}
        {activeTab === "employees" && <EmployeesTab />}
        {activeTab === "inventory" && <InventoryTab initialSubTab={inventoryAction?.subTab} initialEditItemId={inventoryAction?.editItemId} onInventoryChanged={loadNotifications} />}
        {activeTab === "tables" && <TablesTab />}
        {activeTab === "logs" && <LogsTab />}
        {activeTab === "finance" && <FinanceTab />}
        {activeTab === "menu" && <MenuTab />}
        {activeTab === "feedback" && <FeedbackTab notify={notify} />}
        {activeTab === "ai-chatbot" && <AIChatbotTab />}
        
      </div>
    </div>
  );
};

const managerHelpHtml = (t: TFunction, key: string) => (
  <div className="space-y-2" dangerouslySetInnerHTML={{ __html: t(key) }} />
);

const getManagerHelpSections = (t: TFunction): HelpSection[] => [
  { id: "access", title: t("manager.help.access.title"), content: managerHelpHtml(t, "manager.help.access.body") },
  { id: "overview", title: t("manager.help.overview.title"), content: managerHelpHtml(t, "manager.help.overview.body") },
  { id: "add-table", title: t("manager.help.tables.title"), content: managerHelpHtml(t, "manager.help.tables.body") },
  { id: "manage-employees", title: t("manager.help.employees.title"), content: managerHelpHtml(t, "manager.help.employees.body") },
  { id: "working-hours", title: t("manager.help.hours.title"), content: managerHelpHtml(t, "manager.help.hours.body") },
  { id: "inventory-recipes", title: t("manager.help.inventory.title"), content: managerHelpHtml(t, "manager.help.inventory.body") },
  { id: "display-settings", title: t("manager.help.display.title"), content: managerHelpHtml(t, "manager.help.display.body") },
];
