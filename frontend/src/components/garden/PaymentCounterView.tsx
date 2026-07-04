/*
 * PaymentCounterView.tsx — The digital cash register for cafe staff.
 *
 * I built this view to handle the final stage of the customer journey:
 * paying the bill. It is designed to be used by a cashier or manager
 * at a physical payment counter.
 *
 * Technical highlights:
 *
 *   1. Shift Management: I implemented an employee-based login system.
 *      Staff enter their Employee ID and Name to "clock in" for their
 *      shift. Like the other views, I cache this session for 7 days
 *      in localStorage.
 *
 *   2. Working Hours Enforcement: To ensure security, I added a background
 *      timer that checks the restaurant's operating hours every minute.
 *      If the current time falls outside the allowed window (e.g. after
 *      closing), I automatically log the staff member out.
 *
 *   3. Dynamic Billing: The bill is calculated in real-time. I factored
 *      in the subtotal, service charge (default 10%), and VAT (government
 *      tax). I also built a "Process Payment" dialog that handles partial
 *      payments and change calculation automatically.
 *
 *   4. Last-Minute Additions: I added a feature allowing staff to append
 *      items to an order directly from the payment screen. This is useful
 *      when a guest grabs a drink or snack right as they are paying.
 *
 *   5. WebSocket Integration: I listen for NEW_ORDER and NEW_PAYMENT
 *      events so the list of unpaid orders stays synchronized across
 *      all devices in the cafe.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Eye, EyeOff, LogOut, SplitSquareHorizontal, CheckSquare, Square, Bell, CheckCircle2, Plus } from "lucide-react";
import {
  fetchUnpaidOrders,
  fetchPaidOrders,
  fetchPaymentMethods,
  processPayment,
  addOrderItem,
  fetchMenuItems,
  verifyEmployeeCredentials,
  fetchPublicSettings,
  printFinalBill,
  fetchStaffAssistanceRequests,
  acknowledgeStaffAssistanceRequest,
} from "@/lib/api";
import type { MenuItem, PaymentOrder, StaffAssistanceRequest } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { safeConsoleError } from "@/lib/safeConsole";
import { HelpModal, HelpSection } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";
import { PosOrderModal } from "./PosOrderModal";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

interface PaymentMethod {
  id: number;
  name: string;
}

interface PaymentCounterViewProps {
  qrCode: string;
  notify: (kind: "success" | "error", text: string) => void;
}

interface Employee {
  name: string;
  id: string;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const PAYMENT_COUNTER_SESSION_LOCK_KEY = "paymentCounterSessionLock";

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
    if (existing.token && session.token && existing.token === session.token) return true;
    return false;
  }

  localStorage.setItem(key, JSON.stringify({ ...session, createdAt: now }));
  return true;
};

const releaseSessionLock = (key: string) => {
  localStorage.removeItem(key);
};

export const PaymentCounterView = ({ qrCode, notify }: PaymentCounterViewProps) => {
  const { t } = useTranslation();
  const [loggedInEmployee, setLoggedInEmployee] = useState<Employee | null>(null);
  const [loginInputId, setLoginInputId] = useState("");
  const [loginInputName, setLoginInputName] = useState("");

  const [unpaidOrders, setUnpaidOrders] = useState<PaymentOrder[]>([]);
  const [paidOrders, setPaidOrders] = useState<PaymentOrder[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [showPaidOrders, setShowPaidOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PaymentOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemId, setNewItemId] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [posModalOpen, setPosModalOpen] = useState(false);
  const [posModalInitialType, setPosModalInitialType] = useState<"TAKEAWAY" | "PICKUP" | "DELIVERY">("TAKEAWAY");
  const [posModalParentOrder, setPosModalParentOrder] = useState<PaymentOrder | null>(null);
  const [assistanceRequests, setAssistanceRequests] = useState<StaffAssistanceRequest[]>([]);
  const [activeAssistanceRequest, setActiveAssistanceRequest] = useState<StaffAssistanceRequest | null>(null);
  
  const [splitItems, setSplitItems] = useState<number[]>([]);
  const [isSplitMode, setIsSplitMode] = useState(false);

  useEffect(() => {
    if (isSplitMode && selectedOrder) {
      const splitSubtotal = splitItems.reduce((sum, index) => {
        const item = selectedOrder.items[index];
        return sum + ((item.price_at_order_time ?? 0) * item.quantity);
      }, 0);
      const service = splitSubtotal * (selectedOrder.service_charge_rate || 0.1);
      const tax = (splitSubtotal + service) * (selectedOrder.vat_rate || 0.06);
      setPaymentAmount((splitSubtotal + service + tax).toFixed(2));
    }
  }, [splitItems, isSplitMode, selectedOrder]);

  const toggleSplitItem = (index: number) => {
    setSplitItems(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
  };

  const [currentTime, setCurrentTime] = useState(new Date());
  const [workHours, setWorkHours] = useState<{ start: string; end: string } | null>(null);
  const [isWithinWorkHours, setIsWithinWorkHours] = useState<boolean>(true);
  const unacknowledgedAssistanceCount = assistanceRequests.filter((request) => !request.acknowledged_at).length;

  const formatAssistanceTime = (value: string) => {
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
    const normalized = hasTimezone ? value : `${value.replace(" ", "T")}Z`;
    return new Date(normalized).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const parseTimeToMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const isTimeInRange = (current: string, start: string, end: string) => {
    const currentMinutes = parseTimeToMinutes(current);
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  };

  const getOperationStatus = () => {
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

    if (workHours) {
      return isTimeInRange(currentTimeStr, workHours.start, workHours.end) ? "workingTime" : "outsideWorking";
    }

    if (currentHour >= 9 && currentHour < 18) return "workingTime";
    if (currentHour >= 18 && currentHour < 22) return "overTime";
    return "outsideWorking";
  };

  const operationStatus = getOperationStatus();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Check login state on mount
  const getSavedPaymentCounterLogin = () => {
    const savedLogin = localStorage.getItem("paymentCounterLogin");
    if (!savedLogin) return null;
    try {
      const parsed = JSON.parse(savedLogin);
      if (!parsed.token || !parsed.expiry || !parsed.name || !parsed.id) return null;
      if (Date.now() >= parsed.expiry) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const savedLogin = getSavedPaymentCounterLogin();
    if (savedLogin) {
      const lockAcquired = acquireSessionLock(PAYMENT_COUNTER_SESSION_LOCK_KEY, savedLogin);
      if (!lockAcquired) {
        localStorage.removeItem("paymentCounterLogin");
        releaseSessionLock(PAYMENT_COUNTER_SESSION_LOCK_KEY);
        notify("error", t("payment.sessionInUse"));
      } else {
        setLoggedInEmployee({ name: savedLogin.name, id: savedLogin.id });
      }
    } else {
      localStorage.removeItem("paymentCounterLogin");
      releaseSessionLock(PAYMENT_COUNTER_SESSION_LOCK_KEY);
    }
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PAYMENT_COUNTER_SESSION_LOCK_KEY) return;
      if (!event.newValue) return;
      const incoming = readStoredSession<Record<string, unknown>>(PAYMENT_COUNTER_SESSION_LOCK_KEY);
      const current = readStoredSession<Record<string, unknown>>("paymentCounterLogin");
      if (incoming?.token && current?.token && incoming.token !== current.token) {
        setLoggedInEmployee(null);
        setLoginInputId("");
        setLoginInputName("");
        localStorage.removeItem("paymentCounterLogin");
        releaseSessionLock(PAYMENT_COUNTER_SESSION_LOCK_KEY);
        notify("error", t("payment.sessionInUse"));
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [notify, t]);

  const handleLogin = async () => {
    if (!loginInputId.trim() || !loginInputName.trim()) {
      notify("error", t("payment.invalidLogin"));
      return;
    }
    try {
      const result = await verifyEmployeeCredentials(loginInputId, loginInputName);
      if (result.success && result.employee && result.token) {
        const sessionPayload = {
          id: result.employee.id,
          name: result.employee.name,
          token: result.token,
          expiry: Date.now() + 7 * 24 * 60 * 60 * 1000,
        };
        const lockAcquired = acquireSessionLock(PAYMENT_COUNTER_SESSION_LOCK_KEY, sessionPayload);
        if (!lockAcquired) {
          notify("error", t("payment.sessionInUse"));
          return;
        }
        setLoggedInEmployee({ name: result.employee.name, id: result.employee.id });
        localStorage.setItem("paymentCounterLogin", JSON.stringify(sessionPayload));
      } else {
        notify("error", t("payment.invalidLogin"));
      }
    } catch (error: any) {
      if (error?.message?.includes("429")) {
        notify("error", t("payment.rateLimited", "Too many login attempts. Please try again in 5 minutes."));
      } else if (error?.message?.includes("401")) {
        notify("error", t("payment.invalidLogin"));
      } else {
        notify("error", t("payment.failedVerify"));
      }
    }
  };

  useEffect(() => {
    const checkWorkingHours = async () => {
      if (!loggedInEmployee) return;
      try {
        const settings = await fetchPublicSettings();
        if (settings && settings.work_hours) {
          setWorkHours(settings.work_hours);
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          const currentTimeStr = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;
          const inside = isTimeInRange(currentTimeStr, settings.work_hours.start, settings.work_hours.end);
          setIsWithinWorkHours(inside);

          if (!inside) {
            notify("error", t("payment.systemLockedHours", { start: settings.work_hours.start, end: settings.work_hours.end }));
            handleLogout();
          }
        }
      } catch (e) {
        safeConsoleError("Failed to check hours", e);
      }
    };
    
    checkWorkingHours();
    const interval = setInterval(checkWorkingHours, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [loggedInEmployee]);

  const handleLogout = () => {
    setLoggedInEmployee(null);
    setLoginInputId("");
    setLoginInputName("");
    localStorage.removeItem("paymentCounterLogin");
    releaseSessionLock(PAYMENT_COUNTER_SESSION_LOCK_KEY);
  };

  const loadData = useCallback(async () => {
    // Only load if logged in
    if (!loggedInEmployee) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const [unpaid, paid, methods, menu] = await Promise.all([
        fetchUnpaidOrders(qrCode),
        fetchPaidOrders(qrCode),
        fetchPaymentMethods(qrCode),
        fetchMenuItems(qrCode)
      ]);

      setUnpaidOrders(unpaid);
      setPaidOrders(paid);
      setPaymentMethods(methods);
      setMenuItems(menu);

      const cashMethod = methods.find(m => m.name.toLowerCase() === "cash");
      if (cashMethod) {
        setSelectedPaymentMethod(cashMethod.id.toString());
      }
      
      return unpaid;
    } catch (error) {
      notify("error", t("payment.failedLoad"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [notify, qrCode, loggedInEmployee]);

  const loadAssistanceRequests = useCallback(async () => {
    if (!loggedInEmployee) return;
    try {
      const requests = await fetchStaffAssistanceRequests(qrCode);
      setAssistanceRequests(requests || []);
    } catch (error) {
      safeConsoleError("Failed to load assistance requests", error);
    }
  }, [loggedInEmployee, qrCode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadAssistanceRequests();
  }, [loadAssistanceRequests]);

  useEffect(() => {
    if (!activeAssistanceRequest) return;
    const timer = setTimeout(() => {
      setActiveAssistanceRequest(null);
    }, 30000);
    return () => clearTimeout(timer);
  }, [activeAssistanceRequest]);

  const acknowledgeAssistance = async (request: StaffAssistanceRequest) => {
    if (!loggedInEmployee || request.acknowledged_at) return;
    try {
      const updated = await acknowledgeStaffAssistanceRequest(qrCode, request.id, {
        employee_id: loggedInEmployee.id,
        employee_name: loggedInEmployee.name,
      });
      setAssistanceRequests((current) =>
        current.map((item) => item.id === updated.id ? updated : item)
      );
      setActiveAssistanceRequest((current) => current?.id === updated.id ? null : current);
    } catch (error) {
      notify("error", t("payment.failedAcknowledge"));
    }
  };

  const getPaymentCounterToken = useCallback(() => {
    const savedLogin = getSavedPaymentCounterLogin();
    return savedLogin?.token || null;
  }, [loggedInEmployee]);

  useWebSocket(["NEW_ORDER", "ORDER_STATUS_UPDATE", "NEW_PAYMENT", "CALL_WAITER", "CALL_WAITER_ACK"], (event) => {
    if (event.type === "CALL_WAITER") {
      const request = event.payload as StaffAssistanceRequest;
      setAssistanceRequests((current) => {
        if (current.some((item) => item.id === request.id)) return current;
        return [request, ...current];
      });
      setActiveAssistanceRequest(request);
      return;
    }
    if (event.type === "CALL_WAITER_ACK") {
      const request = event.payload as StaffAssistanceRequest;
      setAssistanceRequests((current) =>
        current.map((item) => item.id === request.id ? request : item)
      );
      setActiveAssistanceRequest((current) => current?.id === request.id ? null : current);
      return;
    }
    if (loggedInEmployee) {
      loadData();
    }
  }, getPaymentCounterToken);

  const handleProcessPayment = async () => {
    if (!selectedOrder || !paymentAmount || !selectedPaymentMethod || !loggedInEmployee) {
      notify("error", t("payment.fillDetails"));
      return;
    }

    const parsedAmount = parseFloat(paymentAmount);
    const finalAmount = Math.min(parsedAmount, selectedOrder.remaining);
    const change = Math.max(0, parsedAmount - selectedOrder.remaining);

    setIsProcessing(true);
    try {
      const paymentOrder = await processPayment(qrCode, selectedOrder.id, {
        payment_method_id: parseInt(selectedPaymentMethod),
        amount_paid: finalAmount,
        employee_id: loggedInEmployee.id,
        employee_name: loggedInEmployee.name
      });

      if (paymentOrder && paymentOrder.payment_status === "paid") {
        try {
          await printFinalBill(qrCode, selectedOrder.id, loggedInEmployee.name);
          notify("success", t("payment.paymentSuccess"));
        } catch (e) {
          notify("error", t("payment.printerFailed"));
        }
      } else {
        notify("success", t("payment.partialPayment"));
      }

      setSelectedOrder(null);
      setPaymentAmount("");
      // Don't reset selectedPaymentMethod so it stays on Cash
      loadData(); // This should refresh the lists
    } catch (error) {
      notify("error", getErrorMessage(error, t("payment.failedProcess")));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddItem = async () => {
    if (!selectedOrder || !newItemId || !newItemQuantity || !loggedInEmployee) {
        notify("error", t("payment.selectItem"));
        return;
    }

    try {
        await addOrderItem(qrCode, selectedOrder.id, {
            menu_item_id: parseInt(newItemId),
            quantity: parseInt(newItemQuantity),
            employee_id: loggedInEmployee.id,
            employee_name: loggedInEmployee.name,
        });
        setAddingItem(false);
        setNewItemId("");
        setNewItemQuantity("1");
        loadData(); // Refresh data to show the new item
    } catch (error) {
        notify("error", getErrorMessage(error, t("payment.failedAddItem")));
    }
  };

  // Render Login Screen if not logged in
  if (!loggedInEmployee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex flex-col p-6">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center mb-auto">
          <SettingsModal />
          <HelpModal title={t("payment.title")} sections={getPaymentHelpSections(t)} />
        </div>
        <div className="flex-1 flex items-center justify-center pb-20">
          <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-center text-gray-900">{t("payment.loginTitle")}</CardTitle>
            <CardDescription className="text-center">{t("payment.loginSub")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="login-id">{t("payment.empId")}</Label>
              <Input
                id="login-id"
                value={loginInputId}
                onChange={(e) => setLoginInputId(e.target.value)}
                placeholder={t("payment.loginPlaceholderId")}
              />
            </div>
            <div>
              <Label htmlFor="login-name">{t("payment.empName")}</Label>
              <Input
                id="login-name"
                value={loginInputName}
                onChange={(e) => setLoginInputName(e.target.value)}
                placeholder={t("payment.loginPlaceholderName")}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleLogin} className="w-full text-lg h-12">{t("payment.loginBtn")}</Button>
          </CardFooter>
        </Card>
        </div>
      </div>
    );
  }

  // Main UI when logged in
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      {activeAssistanceRequest && (
        <div className="fixed right-5 top-5 z-50 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-green-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green-100 text-green-700">
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">{t("payment.assistanceRequested", { table: activeAssistanceRequest.table_number })}</p>
              <p className="mt-1 text-sm text-gray-500">{formatAssistanceTime(activeAssistanceRequest.requested_at)}</p>
            </div>
            <button
              onClick={() => acknowledgeAssistance(activeAssistanceRequest)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-600 text-white shadow-sm transition hover:bg-green-700 active:scale-95"
              aria-label={t("payment.ariaAcknowledge")}
            >
              <CheckCircle2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between mb-4 gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <SettingsModal />
            <h1 className="text-3xl font-bold text-gray-900 mr-2 min-w-0 truncate">{t("payment.title")}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-white/60 px-4 py-3 rounded-2xl shadow-sm w-full xl:w-auto">
            <div className="flex flex-wrap items-center gap-3 shrink-0 min-w-0">
              <span className="text-sm font-semibold text-gray-800 min-w-0">
                {currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              </span>
              <Badge variant="outline" className={
                operationStatus === "workingTime" ? "bg-green-100 text-green-700 border-green-200" :
                operationStatus === "overTime" ? "bg-orange-100 text-orange-700 border-orange-200" :
                "bg-gray-100 text-gray-600 border-gray-200"
              }>
                {operationStatus === "workingTime" && t("payment.workingTime")}
                {operationStatus === "overTime" && t("payment.overTime")}
                {operationStatus === "outsideWorking" && t("payment.outsideWorking")}
              </Badge>
            </div>
            <span className="text-sm font-medium text-gray-700 border-l border-gray-300 pl-4 shrink-0 min-w-0">
              {t("payment.shift")}: <span className="text-green-700">{loggedInEmployee.name}</span>
            </span>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative rounded-full hover:bg-white/80" title={t("payment.staffAssistance")}>
                    <Bell className="h-5 w-5 text-gray-600" />
                    {unacknowledgedAssistanceCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500 shadow-sm" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 overflow-hidden rounded-xl border-green-100 p-0 shadow-lg">
                  <div className="border-b bg-gray-50/80 px-4 py-3">
                    <h3 className="flex items-center gap-2 font-semibold text-gray-800">
                      <Bell className="h-4 w-4 text-green-600" /> {t("payment.staffAssistance")}
                    </h3>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto">
                    {assistanceRequests.length === 0 ? (
                      <div className="p-6 text-center text-sm text-gray-500">{t("payment.noAssistanceToday")}</div>
                    ) : (
                      <div className="flex flex-col">
                        {assistanceRequests.map((request) => (
                          <div key={request.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-0">
                            <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${request.acknowledged_at ? "bg-green-500" : "bg-red-500"}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800">{t("payment.assistanceRequested", { table: request.table_number })}</p>
                              <p className="mt-1 text-xs text-gray-500">{formatAssistanceTime(request.requested_at)}</p>
                              {request.acknowledged_at && (
                                <p className="mt-1 text-xs text-green-700">
                                  {t("payment.acknowledgedAt", { time: formatAssistanceTime(request.acknowledged_at) })}
                                </p>
                              )}
                            </div>
                            {!request.acknowledged_at && (
                              <button
                                onClick={() => acknowledgeAssistance(request)}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-green-600 text-white transition hover:bg-green-700 active:scale-95"
                                aria-label={t("payment.ariaAcknowledge")}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <HelpModal title={t("payment.title")} sections={getPaymentHelpSections(t)} />
              <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full">
                <LogOut className="h-4 w-4 mr-2" /> {t("payment.logout")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-8 bg-white/60 p-2 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto w-full">
          <span className="text-sm font-medium text-gray-500 pl-3 pr-2 shrink-0 uppercase tracking-widest">{t("payment.newOrder")}</span>
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={() => { setPosModalInitialType("TAKEAWAY"); setPosModalOpen(true); }} variant="ghost" className="rounded-full text-green-700 hover:bg-white hover:shadow-sm px-6 font-semibold bg-white/40">
              + {t("payment.takeawayBadge")}
            </Button>
            <Button onClick={() => { setPosModalInitialType("PICKUP"); setPosModalOpen(true); }} variant="ghost" className="rounded-full text-orange-600 hover:bg-white hover:shadow-sm px-6 font-semibold bg-white/40">
              + {t("payment.pickup").replace(' +', '')}
            </Button>
            <Button onClick={() => { setPosModalInitialType("DELIVERY"); setPosModalOpen(true); }} variant="ghost" className="rounded-full text-blue-600 hover:bg-white hover:shadow-sm px-6 font-semibold bg-white/40">
              + {t("payment.delivery")}
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">{t("payment.unpaidOrders")}</h2>
            {loading ? (
              <div className="flex justify-center p-8"><p className="text-gray-500 animate-pulse">{t("common.loading")}</p></div>
            ) : (
              <div className="space-y-4">
                {unpaidOrders.length === 0 ? (
                  <p className="text-gray-500 italic">{t("payment.noUnpaid")}</p>
                ) : unpaidOrders.map((order) => (
                  <Card key={order.id} className="overflow-hidden shadow-md hover:shadow-lg transition-shadow">
                    <CardHeader className="bg-white pb-4">
                      <CardTitle className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-xl">
                             {!order.order_type || order.order_type === 'DINE_IN' ? `${order.table_number} (${t("payment.ticket")} #${order.daily_ticket_number || order.id})` : `${t("payment.ticket")} #${order.daily_ticket_number || order.id}`}
                          </span>
                          {order.order_type && order.order_type !== 'DINE_IN' && (
                            <div className="flex gap-2 items-center flex-wrap mt-1">
                              {order.order_type === 'PICKUP' && <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-200 border-0">{t("payment.pickup")} {order.collection_time && `@ ${order.collection_time}`}</Badge>}
                              {order.order_type === 'DELIVERY' && <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-0">{t("payment.delivery")}</Badge>}
                              {order.order_type === 'TAKEAWAY' && <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-0">{t("payment.takeawayBadge")}</Badge>}
                              {order.customer_name && <span className="text-sm text-gray-500 font-medium ml-1">{order.customer_name}</span>}
                            </div>
                          )}
                        </div>
                        <Badge variant={order.remaining > 0 ? "destructive" : "secondary"} className="text-sm px-3 py-1">
                          RM {order.remaining.toFixed(2)}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="bg-gray-50 pt-4">
                      <ul className="space-y-2 mb-4 text-gray-700">
                        {order.items.map((item, index) => (
                          <li key={`${item.id || item.item_name}-${index}`} className="flex flex-col border-b border-gray-100 pb-1 last:border-0 last:pb-0">
                            <div className="flex justify-between items-start">
                              <span className="font-medium">{item.quantity}x {item.item_name}</span>
                              <span className="text-sm text-gray-600 font-mono">RM {((item.price_at_order_time ?? 0) * item.quantity).toFixed(2)}</span>
                            </div>
                            {item.notes && (
                              <span className="text-xs text-gray-500 italic pl-4">
                                "{item.notes}"
                              </span>
                            )}
                            {item.options_json && (() => {
                              try {
                                const opts = JSON.parse(item.options_json);
                                if (Array.isArray(opts) && opts.length > 0) {
                                  return (
                                    <ul className="text-xs text-gray-500 list-disc pl-8 mt-0.5">
                                      {opts.map((opt: any, idx: number) => {
                                        const deltaText = opt.delta > 0 ? ` (+RM ${opt.delta.toFixed(2)})` : "";
                                        return (
                                          <li key={idx}>
                                            {opt.option}{deltaText}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  );
                                }
                              } catch (e) {
                                return null;
                              }
                              return null;
                            })()}
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-gray-200 pt-4 space-y-1 text-sm text-gray-600">
                        <div className="flex justify-between"><p>{t("customer.subtotal")}:</p><p>RM {order.total_price.toFixed(2)}</p></div>
                        {(order.service_charge_rate || 0) > 0 && (
                          <div className="flex justify-between"><p>{t("customer.serviceCharge")} ({(order.service_charge_rate || 0) * 100}%):</p><p>RM {(order.total_price * (order.service_charge_rate || 0)).toFixed(2)}</p></div>
                        )}
                        {(order.vat_rate || 0) > 0 && (
                          <div className="flex justify-between"><p>{t("customer.sst")} ({(order.vat_rate || 0) * 100}%):</p><p>RM {(order.total_price * (1 + (order.service_charge_rate || 0)) * order.vat_rate).toFixed(2)}</p></div>
                        )}
                        <div className="flex justify-between font-bold text-gray-900 text-lg mt-2 pt-2 border-t border-gray-200">
                          <p>{t("customer.total")}:</p><p>RM {order.total_with_vat.toFixed(2)}</p>
                        </div>
                        <div className="flex justify-between text-green-700 font-medium">
                          <p>{t("payment.paid")}:</p><p>RM {order.total_paid.toFixed(2)}</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mt-6">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button className="flex-1 shadow-sm" size="lg" onClick={() => setSelectedOrder(order)}>
                              {t("payment.processPayment")}
                            </Button>
                          </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px] max-h-[75vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>{t("payment.processPayment")}</DialogTitle>
                            <DialogDescription>{order.table_number}</DialogDescription>
                          </DialogHeader>
                          
                          <div className="space-y-6 mt-4">
                            <div className="bg-gray-50 p-4 rounded-lg flex justify-between items-center">
                              <div className="space-y-1">
                                <p className="text-sm text-gray-500">{t("payment.totalAmount")}</p>
                                <p className="font-semibold">RM {order.total_with_vat.toFixed(2)}</p>
                              </div>
                              <div className="text-right space-y-1">
                                <p className="text-sm text-gray-500">{t("payment.remaining")}</p>
                                <p className="font-bold text-red-600 text-lg">RM {order.remaining.toFixed(2)}</p>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="payment-method">{t("payment.method")}</Label>
                                <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder={t("payment.selectMethodPlaceholder")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {paymentMethods.map((method) => (
                                      <SelectItem key={method.id} value={method.id.toString()}>
                                        {method.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-4 border-t border-gray-200 pt-4">
                                <div className="flex justify-between items-center">
                                  <Label className="text-md font-semibold flex items-center gap-2">
                                    <SplitSquareHorizontal className="h-4 w-4" />
                                    {t("payment.splitBill")}
                                  </Label>
                                  <Button 
                                    variant={isSplitMode ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                      setIsSplitMode(!isSplitMode);
                                      if (isSplitMode) {
                                        setPaymentAmount(""); // Reset when turning off
                                      } else {
                                        setSplitItems([]); // Reset selection when turning on
                                      }
                                    }}
                                  >
                                    {isSplitMode ? t("payment.disableSplit") : t("payment.enableSplit")}
                                  </Button>
                                </div>
                                
                                {isSplitMode && (
                                  <div className="bg-white border rounded-lg p-3 space-y-2 max-h-[300px] overflow-y-auto">
                                    <p className="text-xs text-gray-500 mb-2">{t("payment.selectItemsToPay")}</p>
                                    {order.items.map((item, index) => (
                                      <div 
                                        key={index} 
                                        onClick={() => toggleSplitItem(index)}
                                        className={`flex items-center justify-between p-2 rounded cursor-pointer border ${splitItems.includes(index) ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-gray-50'}`}
                                      >
                                        <div className="flex items-center gap-2">
                                          {splitItems.includes(index) ? (
                                            <CheckSquare className="h-4 w-4 text-primary" />
                                          ) : (
                                            <Square className="h-4 w-4 text-gray-300" />
                                          )}
                                          <span className="text-sm font-medium">{item.quantity}x {item.item_name}</span>
                                        </div>
                                        <span className="text-sm">RM {((item.price_at_order_time ?? 0) * item.quantity).toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="space-y-2 pt-2 border-t border-gray-200">
                                <Label htmlFor="amount">{t("payment.tendered")}</Label>
                                <Input 
                                  id="amount" 
                                  type="number" 
                                  step="0.01" 
                                  value={paymentAmount} 
                                  onChange={e => setPaymentAmount(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && !isProcessing) {
                                      handleProcessPayment();
                                    }
                                  }}
                                  placeholder={t("payment.tenderedPlaceholder")}
                                  className="text-lg"
                                />
                                {parseFloat(paymentAmount) > order.remaining && (
                                  <p className="text-sm text-green-600 font-medium mt-1">
                                    {t("payment.changeDue", { amount: `RM ${(parseFloat(paymentAmount) - order.remaining).toFixed(2)}` })}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 pt-4">
                              <Button onClick={handleProcessPayment} disabled={isProcessing} className="flex-1" size="lg">
                                {isProcessing ? t("payment.processing") : t("payment.processPaymentBtn")}
                              </Button>
                              <Button variant="outline" onClick={() => setAddingItem(true)} size="lg" className="sm:flex-none">
                                {t("payment.addItem")}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button 
                        variant="outline" 
                        size="lg" 
                        onClick={() => {
                          setPosModalParentOrder(order);
                          setPosModalInitialType(order.order_type as any || "TAKEAWAY");
                          setPosModalOpen(true);
                        }}
                        className="flex-none font-medium bg-white hover:bg-gray-50 border-gray-200"
                      >
                        {t("payment.addOnBtn")}
                      </Button>
                    </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold text-gray-800">{t("payment.paidOrders")}</h2>
                <Button onClick={() => setShowPaidOrders(!showPaidOrders)} variant="outline" className="shadow-sm bg-white hover:bg-gray-50">
                    {showPaidOrders ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                    {showPaidOrders ? t("payment.hide") : t("payment.show")}
                </Button>
            </div>
            {showPaidOrders && (
              loading ? <div className="flex justify-center p-8"><p className="text-gray-500 animate-pulse">{t("common.loading")}</p></div> : (
                <div className="space-y-4 opacity-80">
                  {paidOrders.length === 0 ? (
                    <p className="text-gray-500 italic">{t("payment.noPaid")}</p>
                  ) : paidOrders.map((order) => (
                    <Card key={order.id} className="bg-gray-50">
                      <CardHeader className="py-4">
                        <CardTitle className="flex items-center justify-between text-lg">
                          <span className="text-gray-700">{t("customer.atTable").replace('at ', '')} {order.table_number}</span>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{t("payment.paid")}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-0 pb-4">
                        <div className="flex justify-between items-center">
                          <p className="font-medium text-gray-900">RM {order.total_with_vat.toFixed(2)}</p>
                          <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleTimeString()}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            )}
          </section>
        </div>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={addingItem} onOpenChange={setAddingItem}>
          <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                  <DialogTitle>{t("payment.addLastMinute")}</DialogTitle>
                  <DialogDescription>
                    {t("payment.appendItem")}
                  </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 mt-4">
                  <div className="space-y-2">
                      <Label htmlFor="menu-item">{t("payment.menuItem")}</Label>
                      <Select value={newItemId} onValueChange={setNewItemId}>
                          <SelectTrigger className="w-full">
                              <SelectValue placeholder={t("payment.selectItemPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                              {menuItems.map(item => (
                                  <SelectItem key={item.id} value={item.id.toString()}>
                                      {item.name} - RM {item.price.toFixed(2)}
                                  </SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="quantity">{t("payment.quantity")}</Label>
                      <Input id="quantity" type="number" value={newItemQuantity} onChange={e => setNewItemQuantity(e.target.value)} min="1" />
                  </div>
                  <Button onClick={handleAddItem} className="w-full" size="lg">{t("payment.addToOrderBtn")}</Button>
              </div>
          </DialogContent>
      </Dialog>

      <PosOrderModal 
        isOpen={posModalOpen} 
        onOpenChange={(open) => {
          setPosModalOpen(open);
          if (!open) {
            setPosModalParentOrder(null);
          }
        }} 
        initialOrderType={posModalInitialType}
        menuItems={menuItems} 
        qrCode={qrCode} 
        notify={notify} 
        parentOrder={posModalParentOrder}
        onOrderCreated={async (order) => {
           const unpaid = await loadData();
           if (unpaid) {
               const newlyCreated = unpaid.find(o => o.id === order.id);
               if (newlyCreated) setSelectedOrder(newlyCreated);
           }
        }} 
      />
    </div>
  );
};

const helpHtml = (t: TFunction, key: string) => (
  <div className="space-y-2" dangerouslySetInnerHTML={{ __html: t(key) }} />
);

const getPaymentHelpSections = (t: TFunction): HelpSection[] => [
  { id: "login", title: t("payment.help.login.title"), content: helpHtml(t, "payment.help.login.body") },
  { id: "process-payment", title: t("payment.help.process.title"), content: helpHtml(t, "payment.help.process.body") },
  { id: "add-items", title: t("payment.help.addItems.title"), content: helpHtml(t, "payment.help.addItems.body") },
  { id: "paid-orders", title: t("payment.help.paid.title"), content: helpHtml(t, "payment.help.paid.body") },
  { id: "display-settings", title: t("payment.help.display.title"), content: helpHtml(t, "payment.help.display.body") },
];
