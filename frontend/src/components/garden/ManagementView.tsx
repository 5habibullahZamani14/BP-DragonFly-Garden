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
 *      (matching the shared staff session model). I also built a password
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
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime12Hour } from "@/lib/timeFormat";
import type { TFunction } from "i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Settings, Users, PackageOpen, FileText, Grid3X3, ArrowLeft, Loader2, Mail, DollarSign, Utensils, MessageSquare, Image as ImageIcon, Power, Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FeedbackTab } from "./management/FeedbackTab";
import { SettingsTab } from "./management/SettingsTab";
import { MenuTab } from "./management/MenuTab";
import { EmployeesTab } from "./management/EmployeesTab";
import { InventoryTab } from "./management/InventoryTab";
import { LogsTab } from "./management/LogsTab";
import { TablesTab } from "./management/TablesTab";
import { FinanceTab } from "./management/FinanceTab";
import { HelpModal, HelpSection } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";
import { managerAuth, logoutManager, getManagerSession, sendPasswordResetEmail, fetchInventory, checkSystemVersion, requestSystemShutdown } from "@/lib/api";
import type { InventoryItem } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { safeConsoleError } from "@/lib/safeConsole";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { notifyServerShutdownRequested } from "@/lib/useServerConnectionNotice";

interface ManagementViewProps {
  qrCode: string;
  notify: (kind: "success" | "error", text: string) => void;
}

const MANAGER_TABS = ["overview", "settings", "employees", "inventory", "logs", "tables", "finance", "menu", "feedback"] as const;
type ManagerTab = typeof MANAGER_TABS[number];
const MANAGER_NAV_ITEMS: { tab: ManagerTab; labelKey: string; icon: LucideIcon }[] = [
  { tab: "overview", labelKey: "manager.overview", icon: Home },
  { tab: "settings", labelKey: "manager.settings", icon: Settings },
  { tab: "employees", labelKey: "manager.employees", icon: Users },
  { tab: "inventory", labelKey: "manager.inventory", icon: PackageOpen },
  { tab: "logs", labelKey: "manager.logs", icon: FileText },
  { tab: "tables", labelKey: "manager.tables", icon: Grid3X3 },
  { tab: "finance", labelKey: "manager.finance", icon: DollarSign },
  { tab: "menu", labelKey: "manager.menu", icon: Utensils },
  { tab: "feedback", labelKey: "manager.feedback.title", icon: MessageSquare },
];
type ManagerSystemIssue = {
  id: number;
  source: string;
  message: string;
  actionTab: ManagerTab;
  occurrenceCount: number;
};
type PrinterJobAlert = {
  id: number;
  orderId: number | null;
  jobType: string;
  printerName: string;
  status: "submitting" | "uncertain";
  errorMessage: string | null;
};
type ManagerNotification = {
  id: string;
  type: "low_stock" | "daily_sales_missed" | "printer_issue" | "system_issue";
  title: string;
  message: string;
  action?: () => void;
  printAction?: () => void;
  ignoreAction?: () => void;
  reviewAction?: () => void;
  occurrenceCount?: number;
};

const MANAGER_SESSION_LOCK_KEY = "managerSessionLock";

const readStoredSession = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const acquireSessionLock = (key: string, session: Record<string, unknown>) => {
  const existing = readStoredSession<Record<string, unknown>>(key);
  const now = Date.now();
  if (existing?.expiry && typeof existing.expiry === "number" && existing.expiry > now) {
    if (existing.id && session.id && existing.id === session.id) return true;
    return false;
  }

  localStorage.setItem(key, JSON.stringify({ ...session, createdAt: now }));
  return true;
};

const releaseSessionLock = (key: string) => {
  localStorage.removeItem(key);
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
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      checkSystemVersion().then(result => {
        setAppVersion(result.version);
      }).catch(err => {
        safeConsoleError("Failed to fetch version info", err);
      });
    }
  }, [isLoggedIn]);

  useEffect(() => {
    let active = true;
    getManagerSession().then(session => {
      if (!active || !session.success) return;
      const sessionMetadata = {
        id: session.id,
        name: session.name,
        expiry: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
      if (!acquireSessionLock(MANAGER_SESSION_LOCK_KEY, sessionMetadata)) {
        notify("error", t("manager.sessionInUse"));
        return;
      }
      localStorage.setItem("managerLogin", JSON.stringify(sessionMetadata));
      setIsLoggedIn(true);
    }).catch(() => {
      localStorage.removeItem("managerLogin");
      releaseSessionLock(MANAGER_SESSION_LOCK_KEY);
    });
    return () => { active = false; };
  }, [notify, t]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MANAGER_SESSION_LOCK_KEY) return;
      if (!event.newValue) return;
      const incoming = readStoredSession<Record<string, unknown>>(MANAGER_SESSION_LOCK_KEY);
      const current = readStoredSession<Record<string, unknown>>("managerLogin");
      if (incoming?.id && current?.id && incoming.id !== current.id) {
        setIsLoggedIn(false);
        localStorage.removeItem("managerLogin");
        releaseSessionLock(MANAGER_SESSION_LOCK_KEY);
        notify("error", t("manager.sessionInUse"));
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [notify, t]);

  const [notifications, setNotifications] = useState<ManagerNotification[]>([]);
  const [shutdownRequested, setShutdownRequested] = useState(false);
  const [shutdownConfirmationOpen, setShutdownConfirmationOpen] = useState(false);
  const [shutdownPending, setShutdownPending] = useState(false);
  const [settingsUpdateInProgress, setSettingsUpdateInProgress] = useState(false);
  const [inventoryAction, setInventoryAction] = useState<{subTab?: "overview" | "stock" | "recipes", editItemId?: number} | null>(null);
  const [settingsAlertRequest, setSettingsAlertRequest] = useState<{
    section: "printers" | "printer-job-review";
    sequence: number;
  } | null>(null);

  const loadNotifications = async () => {
    let lowStockNotifications: ManagerNotification[] = [];
    try {
      const invData = await fetchInventory();
      const lowStock = (invData || []).filter((item: InventoryItem) => {
        const percent = Math.min(100, Math.max(0, (item.current_stock / item.max_stock) * 100));
        return percent <= item.low_stock_threshold_percent;
      });
      lowStockNotifications = lowStock.map((item: InventoryItem) => ({
        id: `inv-${item.id}`,
        type: "low_stock",
        title: t("manager.lowStockTitle"),
        message: t("manager.lowStockMessage", { name: item.name, stock: Number(item.current_stock).toFixed(1), unit: item.unit }),
        action: () => {
          setInventoryAction({ subTab: "stock", editItemId: item.id });
          goToTab("inventory");
        }
      }));
    } catch (error) {
      safeConsoleError("Failed to load low stock notifications", error);
    }

    let missedNotifications: ManagerNotification[] = [];
    try {
      const response = await fetch("/management/printers/daily-sales-report/status", { credentials: "include" });
      const data = await response.json();
      if (response.ok && data.success) {
        missedNotifications = (data.reports || [])
          .filter((report: { status: string }) => report.status === "missed")
          .map((report: { sales_date: string; order_count?: number; total_sales?: number; error_message?: string }) => ({
            id: `daily-sales-${report.sales_date}`,
            type: "daily_sales_missed" as const,
            title: t("manager.dailySales.missedTitle", { date: report.sales_date }),
            message: t("manager.dailySales.missedMessage"),
            printAction: () => {
              void (async () => {
                try {
                  const printResponse = await fetch(`/management/printers/daily-sales-report/${encodeURIComponent(report.sales_date)}/print`, {
                    method: "POST",
                    credentials: "include",
                  });
                  const printData = await printResponse.json();
                  if (!printResponse.ok || !printData.success) throw new Error(printData.message || "Print failed");
                  notify("success", t("manager.dailySales.printSuccess"));
                } catch (error) {
                  safeConsoleError("Failed to print missed daily sales receipt", error);
                  notify("error", t("manager.dailySales.printFailure"));
                } finally {
                  void loadNotifications();
                }
              })();
            },
            ignoreAction: () => {
              void (async () => {
                try {
                  const ignoreResponse = await fetch(`/management/printers/daily-sales-report/${encodeURIComponent(report.sales_date)}/ignore`, {
                    method: "POST",
                    credentials: "include",
                  });
                  const ignoreData = await ignoreResponse.json();
                  if (!ignoreResponse.ok || !ignoreData.success) throw new Error(ignoreData.message || "Could not dismiss the alert");
                  notify("success", t("manager.dailySales.ignoreSuccess"));
                } catch (error) {
                  safeConsoleError("Failed to dismiss missed daily sales notification", error);
                  notify("error", t("manager.dailySales.ignoreFailure"));
                } finally {
                  void loadNotifications();
                }
              })();
            },
          }));
      }
    } catch (error) {
      safeConsoleError("Failed to load missed daily sales receipts", error);
    }

    let printerNotifications: ManagerNotification[] = [];
    try {
      const response = await fetch("/management/printers/jobs/review", { credentials: "include" });
      const data: { success: boolean; jobs?: PrinterJobAlert[] } = await response.json();
      if (!response.ok || !data.success) throw new Error(`Request failed (HTTP ${response.status})`);
      printerNotifications = (data.jobs || []).map((job) => ({
        id: `printer-job-${job.id}`,
        type: "printer_issue",
        title: t("manager.printerIssueTitle"),
        message: [
          job.orderId ? `Order #${job.orderId}` : job.jobType.replace(/_/g, " "),
          job.printerName,
          job.errorMessage || t("manager.printerIssueFallback"),
        ].filter(Boolean).join(" · "),
        action: () => openSettingsAlert("printer-job-review"),
      }));
    } catch (error) {
      safeConsoleError("Failed to load printer alerts", error);
    }

    let systemIssueNotifications: ManagerNotification[] = [];
    try {
      const response = await fetch("/management/system-issues", { credentials: "include" });
      const data: { success: boolean; issues?: ManagerSystemIssue[] } = await response.json();
      if (!response.ok || !data.success) throw new Error(`Request failed (HTTP ${response.status})`);
      systemIssueNotifications = (data.issues || []).map((issue) => ({
        id: `system-issue-${issue.id}`,
        type: "system_issue",
        title: t("manager.systemIssueTitle"),
        message: `${issue.source}: ${issue.message}`,
        occurrenceCount: issue.occurrenceCount,
        action: () => {
          if (issue.actionTab === "settings") openSettingsAlert("printers");
          else goToTab(issue.actionTab);
        },
        reviewAction: () => {
          void (async () => {
            try {
              const reviewResponse = await fetch(`/management/system-issues/${issue.id}/acknowledge`, {
                method: "POST",
                credentials: "include",
              });
              if (!reviewResponse.ok) throw new Error(`Request failed (HTTP ${reviewResponse.status})`);
              void loadNotifications();
            } catch (error) {
              safeConsoleError(`Failed to review system alert ${issue.id}`, error);
              notify("error", t("manager.issueReviewFailed"));
            }
          })();
        },
      }));
    } catch (error) {
      safeConsoleError("Failed to load system alerts", error);
    }

    const combined = [
      ...systemIssueNotifications,
      ...printerNotifications,
      ...missedNotifications,
      ...lowStockNotifications,
    ];
    setNotifications(combined);
    return combined.length > 0;
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

  useWebSocket([
    "NEW_ORDER",
    "ORDER_STATUS_UPDATE",
    "NEW_PAYMENT",
    "INVENTORY_UPDATE",
    "DATA_REFRESH",
    "DAILY_SALES_REPORT_UPDATE",
    "PRINT_JOB_REVIEW_REQUIRED",
    "PRINT_JOB_REVIEW_UPDATED",
    "MANAGER_ISSUE_UPDATED",
    "CONNECTION_RESTORED",
  ], (event) => {
    if (!isLoggedIn) return;
    if (
      event.type === "NEW_ORDER" ||
      event.type === "ORDER_STATUS_UPDATE" ||
      event.type === "NEW_PAYMENT" ||
      event.type === "INVENTORY_UPDATE" ||
      event.type === "DATA_REFRESH" ||
      event.type === "DAILY_SALES_REPORT_UPDATE" ||
      event.type === "PRINT_JOB_REVIEW_UPDATED" ||
      event.type === "MANAGER_ISSUE_UPDATED" ||
      event.type === "CONNECTION_RESTORED"
    ) {
      void loadNotifications();
    }
    if (event.type === "PRINT_JOB_REVIEW_REQUIRED") {
      void loadNotifications();
      const payload = event.payload as { orderId?: number; submissionStarted?: boolean };
      const orderLabel = payload.orderId ? ` for order #${payload.orderId}` : "";
      const notification = payload.submissionStarted
        ? `Printer submission${orderLabel} has an uncertain outcome. Check Printer Management and the printer before arranging a reprint.`
        : `Printer submission${orderLabel} could not be started. Check Printer Management before trying again.`;
      notify("error", notification);
    }
  }, "manager", isLoggedIn);

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
        const sessionPayload = {
          id: result.id || loginId.trim(),
          name: result.name || "manager",
          expiry: Date.now() + 7 * 24 * 60 * 60 * 1000,
        };
        const lockAcquired = acquireSessionLock(MANAGER_SESSION_LOCK_KEY, sessionPayload);
        if (!lockAcquired) {
          setLoginError(t("manager.sessionInUse"));
          return;
        }
        setIsLoggedIn(true);
        localStorage.setItem("managerLogin", JSON.stringify(sessionPayload));
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
    void logoutManager().catch(error => {
      safeConsoleError("Manager logout request failed", error);
    });
    setIsLoggedIn(false);
    setLoginId("");
    setLoginPassword("");
    sessionStorage.removeItem("mgr_active_tab");
    localStorage.removeItem("managerLogin");
    releaseSessionLock(MANAGER_SESSION_LOCK_KEY);
  };

  const handleConfirmShutdown = async () => {
    setShutdownPending(true);
    try {
      const result = await requestSystemShutdown();
      if (!result.success) {
        throw new Error(result.message || "The server did not accept the shutdown request.");
      }
      setShutdownRequested(true);
      setShutdownConfirmationOpen(false);
      notifyServerShutdownRequested();
    } catch (error: unknown) {
      safeConsoleError("Server shutdown request failed", error);
      const message = error instanceof Error ? error.message : String(error);
      notify("error", t("m.settings.shutdownError", { error: message }));
    } finally {
      setShutdownPending(false);
    }
  };

  const goToTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    sessionStorage.setItem("mgr_active_tab", tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleOverviewCardKeyDown = (tab: ManagerTab) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goToTab(tab);
    }
  };

  const openSettingsAlert = (section: "printers" | "printer-job-review") => {
    setSettingsAlertRequest((current) => ({
      section,
      sequence: (current?.sequence || 0) + 1,
    }));
    goToTab("settings");
  };

  useEffect(() => {
    if (!isLoggedIn) return;

    const reportClientIssue = (kind: "runtime_error" | "unhandled_rejection", message: string) => {
      void fetch("/management/system-issues/client", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message: message.slice(0, 500) }),
      }).then((response) => {
        if (!response.ok) throw new Error(`Request failed (HTTP ${response.status})`);
      }).catch((error) => {
        safeConsoleError("Failed to report a manager interface error", error);
      });
    };

    const handleRuntimeError = (event: ErrorEvent) => {
      reportClientIssue("runtime_error", event.message || "Unhandled browser runtime error.");
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled asynchronous error.";
      reportClientIssue("unhandled_rejection", message);
    };

    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleRuntimeError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col p-6">
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
    <div className="min-h-screen bg-transparent p-3 sm:p-6">
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
              <p className="text-gray-500 mt-1 text-sm sm:text-base management-header-subtitle">{t("manager.subtitle")}</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-white/60 px-3 py-2 sm:px-4 rounded-2xl sm:rounded-full shadow-sm">
            <span className="text-xs sm:text-sm font-semibold text-gray-800">
              {formatDateTime12Hour(currentTime, true)}
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
                        <div key={notif.id || idx} className="px-4 py-3 border-b last:border-0 hover:bg-green-50 transition-colors">
                          {notif.type === "daily_sales_missed" ? (
                            <div className="flex gap-3 items-start">
                              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-800">{notif.title}</p>
                                <p className="text-xs text-gray-500 mt-1 leading-snug">{notif.message}</p>
                                <div className="grid grid-cols-2 gap-2 mt-3">
                                  <Button size="sm" className="h-8 bg-green-700 hover:bg-green-800 text-white" onClick={notif.printAction}>
                                    {t("manager.dailySales.printAction")}
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-8" onClick={notif.ignoreAction}>
                                    {t("manager.dailySales.ignoreAction")}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : notif.type === "system_issue" ? (
                            <div className="flex gap-3 items-start">
                              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <button onClick={notif.action} className="w-full text-left">
                                  <p className="text-sm font-medium text-gray-800">{notif.title}</p>
                                  <p className="text-xs text-gray-500 mt-1 leading-snug">{notif.message}</p>
                                  {notif.occurrenceCount && notif.occurrenceCount > 1 && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {t("manager.issueOccurrences", { count: notif.occurrenceCount })}
                                    </p>
                                  )}
                                </button>
                                <Button size="sm" variant="outline" className="h-8 mt-2" onClick={notif.reviewAction}>
                                  {t("manager.markIssueReviewed")}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={notif.action} className="w-full text-left flex gap-3 items-start">
                              <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${notif.type === "printer_issue" ? "text-red-500" : "text-orange-500"}`} />
                              <div>
                                <p className="text-sm font-medium text-gray-800">{notif.title}</p>
                                <p className="text-xs text-gray-500 mt-1 leading-snug">{notif.message}</p>
                              </div>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2 rounded-full px-4 font-bold tracking-wide shadow-sm transition-all hover:shadow-md active:scale-95"
              title={t("m.settings.shutdownEveryone")}
              aria-label={t("m.settings.shutdownEveryone")}
              disabled={shutdownRequested || shutdownPending || settingsUpdateInProgress}
              onClick={() => setShutdownConfirmationOpen(true)}
            >
              {shutdownPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Power className="h-4 w-4" />}
              STOP
            </Button>
            <HelpModal title={t("manager.helpTitle")} sections={getManagerHelpSections(t)} version={appVersion || "v1.0.0.0 Beta"} />
            <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full">
              <LogOut className="h-4 w-4 mr-2" /> {t("manager.logout")}
            </Button>
          </div>
        </div>

        {activeTab !== "overview" && (
          <nav
            aria-label={t("manager.sectionNavigation")}
            className="mb-4 overflow-x-auto rounded-2xl border border-white/70 bg-white/50 p-1.5 shadow-sm backdrop-blur sm:mb-6"
          >
            <div className="flex min-w-max gap-1">
              {MANAGER_NAV_ITEMS.map(({ tab, labelKey, icon: Icon }) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => goToTab(tab)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 ${
                      isActive
                        ? "bg-green-700 text-white shadow-sm"
                        : "text-gray-600 hover:bg-white/80 hover:text-green-800"
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span>{t(labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        <Dialog
          open={shutdownConfirmationOpen}
          onOpenChange={(open) => {
            if (!shutdownPending) setShutdownConfirmationOpen(open);
          }}
        >
          <DialogContent className="!h-auto !max-h-[90vh] !w-[min(94vw,36rem)] !max-w-none flex flex-col gap-0 overflow-y-auto rounded-2xl border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 !p-0 sm:!p-0 shadow-2xl">
            <div className="popup-frame-header p-6 pr-14">
              <DialogHeader className="relative flex-row items-start gap-4 space-y-0 text-left">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-white/80 text-rose-600 shadow-sm">
                  <Power className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <DialogTitle className="text-xl font-bold text-slate-900">Stop DragonFly Garden?</DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-600">
                    This will stop the server for everyone using the system.
                  </DialogDescription>
                </div>
              </DialogHeader>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-white/75 px-4 py-3 shadow-sm">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm leading-6 text-slate-700">
                  Make sure no orders or payments are in progress. The server will stop accepting requests, disconnect open browser sessions, finish active background work, and close the database. You will need to start it again using its normal startup method.
                </p>
              </div>
            </div>
            <DialogFooter className="popup-frame-footer sticky bottom-0 mt-auto flex flex-col gap-2 px-6 py-4 sm:flex-row sm:justify-end sm:space-x-0">
              <Button
                variant="outline"
                className="w-full rounded-full border-amber-200 px-5 hover:bg-amber-50 sm:w-auto"
                onClick={() => setShutdownConfirmationOpen(false)}
                disabled={shutdownPending}
              >
                {t("m.cancel")}
              </Button>
              <Button
                variant="destructive"
                className="w-full rounded-full bg-rose-600 px-6 shadow-sm transition-all hover:bg-rose-700 hover:shadow-md active:scale-95 sm:w-auto"
                onClick={() => void handleConfirmShutdown()}
                disabled={shutdownPending}
              >
                {shutdownPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("m.confirm")}</>
                  : "STOP"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-6">
            <Card role="button" tabIndex={0} className="hover:shadow-lg transition-shadow border-t-4 border-t-green-500 cursor-pointer min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2" onClick={() => goToTab("settings")} onKeyDown={handleOverviewCardKeyDown("settings")}>
              <CardContent className="pt-6">
                <Settings className="h-10 w-10 text-green-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.settings")}</CardTitle>
                <CardDescription>{t("manager.settingsDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card role="button" tabIndex={0} className="hover:shadow-lg transition-shadow border-t-4 border-t-blue-500 cursor-pointer min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2" onClick={() => goToTab("employees")} onKeyDown={handleOverviewCardKeyDown("employees")}>
              <CardContent className="pt-6">
                <Users className="h-10 w-10 text-blue-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.employees")}</CardTitle>
                <CardDescription>{t("manager.employeesDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card role="button" tabIndex={0} className="hover:shadow-lg transition-shadow border-t-4 border-t-orange-500 cursor-pointer min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2" onClick={() => goToTab("inventory")} onKeyDown={handleOverviewCardKeyDown("inventory")}>
              <CardContent className="pt-6">
                <PackageOpen className="h-10 w-10 text-orange-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.inventory")}</CardTitle>
                <CardDescription>{t("manager.inventoryDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card role="button" tabIndex={0} className="hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500 cursor-pointer min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2" onClick={() => goToTab("tables")} onKeyDown={handleOverviewCardKeyDown("tables")}>
              <CardContent className="pt-6">
                <Grid3X3 className="h-10 w-10 text-emerald-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.tables")}</CardTitle>
                <CardDescription>{t("manager.tablesDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card role="button" tabIndex={0} className="hover:shadow-lg transition-shadow border-t-4 border-t-purple-500 cursor-pointer min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2" onClick={() => goToTab("logs")} onKeyDown={handleOverviewCardKeyDown("logs")}>
              <CardContent className="pt-6">
                <FileText className="h-10 w-10 text-purple-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.logs")}</CardTitle>
                <CardDescription>{t("manager.logsDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card role="button" tabIndex={0} className="hover:shadow-lg transition-shadow border-t-4 border-t-yellow-500 cursor-pointer min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2" onClick={() => goToTab("menu")} onKeyDown={handleOverviewCardKeyDown("menu")}>
              <CardContent className="pt-6">
                <Utensils className="h-10 w-10 text-yellow-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.menu")}</CardTitle>
                <CardDescription>{t("manager.menuDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card role="button" tabIndex={0} className="hover:shadow-lg transition-shadow border-t-4 border-t-rose-500 cursor-pointer min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2" onClick={() => goToTab("finance")} onKeyDown={handleOverviewCardKeyDown("finance")}>
              <CardContent className="pt-6">
                <DollarSign className="h-10 w-10 text-rose-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.finance")}</CardTitle>
                <CardDescription>{t("manager.financeDesc")}</CardDescription>
              </CardContent>
            </Card>

            <Card role="button" tabIndex={0} className="hover:shadow-lg transition-shadow border-t-4 border-t-teal-500 cursor-pointer min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2" onClick={() => goToTab("feedback")} onKeyDown={handleOverviewCardKeyDown("feedback")}>
              <CardContent className="pt-6">
                <MessageSquare className="h-10 w-10 text-teal-500 mb-4" />
                <CardTitle className="mb-2">{t("manager.feedback.title")}</CardTitle>
                <CardDescription>{t("manager.feedback.desc")}</CardDescription>
              </CardContent>
            </Card>

          </div>
        )}

        {activeTab === "settings" && (
          <SettingsTab
            alertRequest={settingsAlertRequest}
            onUpdateInProgressChange={setSettingsUpdateInProgress}
          />
        )}
        {activeTab === "employees" && <EmployeesTab />}
        {activeTab === "inventory" && <InventoryTab initialSubTab={inventoryAction?.subTab} initialEditItemId={inventoryAction?.editItemId} onInventoryChanged={loadNotifications} />}
        {activeTab === "tables" && <TablesTab />}
        {activeTab === "logs" && <LogsTab />}
        {activeTab === "finance" && <FinanceTab />}
        {activeTab === "menu" && <MenuTab />}
        {activeTab === "feedback" && <FeedbackTab notify={notify} />}
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
