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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Eye, EyeOff, LogOut, SplitSquareHorizontal, Bell, CheckCircle2, Plus, Trash2, AlertCircle, MessageSquare, Star } from "lucide-react";
import {
  fetchUnpaidOrders,
  fetchPaidOrders,
  fetchPaymentMethods,
  processPayment,
  processSplitPayment,
  addOrderItem,
  fetchMenuItems,
  verifyEmployeeCredentials,
  fetchPublicSettings,
  printFinalBill,
  fetchStaffAssistanceRequests,
  acknowledgeStaffAssistanceRequest,
  cancelOrder,
  submitFeedback,
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

const getTenderSuggestions = (remaining: number) => {
  const baseAmount = Number.isFinite(remaining) ? remaining : 0;
  const roundedToFive = Math.max(0, Math.ceil(baseAmount / 5) * 5);
  const roundedAmount = roundedToFive === 0 ? 0 : roundedToFive;

  return [
    { label: "Exact due", value: Number(baseAmount.toFixed(2)) },
    { label: "Nearest round", value: Number(roundedAmount.toFixed(2)) },
    { label: "+RM 5", value: Number((roundedAmount + 5).toFixed(2)) },
    { label: "+RM 10", value: Number((roundedAmount + 10).toFixed(2)) },
  ];
};

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
  const visiblePaymentMethods = paymentMethods.filter((method) => method.name.toLowerCase() !== "other");
  const [addingItem, setAddingItem] = useState(false);
  const [newItemId, setNewItemId] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [posModalOpen, setPosModalOpen] = useState(false);
  const [posModalInitialType, setPosModalInitialType] = useState<"TAKEAWAY" | "PICKUP" | "DELIVERY" | "COUNTER">("TAKEAWAY");
  const [posModalParentOrder, setPosModalParentOrder] = useState<PaymentOrder | null>(null);
  const [assistanceRequests, setAssistanceRequests] = useState<StaffAssistanceRequest[]>([]);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackOrder, setFeedbackOrder] = useState<PaymentOrder | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [activeAssistanceRequest, setActiveAssistanceRequest] = useState<StaffAssistanceRequest | null>(null);
  
  const [splitItemsQuantities, setSplitItemsQuantities] = useState<Record<number, number>>({});
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [orderToCancelId, setOrderToCancelId] = useState<number | null>(null);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);

  useEffect(() => {
    if (isSplitMode && selectedOrder) {
      const splitSubtotal = selectedOrder.items.reduce((sum, item) => {
        const selectedQty = splitItemsQuantities[item.id] || 0;
        return sum + ((item.price_at_order_time ?? 0) * selectedQty);
      }, 0);
      const service = splitSubtotal * (selectedOrder.service_charge_rate || 0);
      const tax = (splitSubtotal + service) * (selectedOrder.vat_rate || 0);
      setPaymentAmount((splitSubtotal + service + tax).toFixed(2));
    }
  }, [splitItemsQuantities, isSplitMode, selectedOrder]);

  const setSplitItemQuantity = (itemId: number, quantity: number) => {
    setSplitItemsQuantities(prev => {
      if (quantity <= 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: quantity };
    });
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
    if (!selectedOrder || isSplitMode || !selectedPaymentMethod) return;

    const methodName = paymentMethods.find((method) => method.id.toString() === selectedPaymentMethod)?.name.toLowerCase() ?? "";
    const shouldAutoFillAmount = ["visa card", "mastercard", "ewallet", "e-wallet", "wallet"].some((token) => methodName.includes(token));

    if (shouldAutoFillAmount) {
      setPaymentAmount(selectedOrder.remaining.toFixed(2));
    } else if (methodName.includes("cash")) {
      setPaymentAmount("");
    }
  }, [selectedOrder, selectedPaymentMethod, isSplitMode, paymentMethods]);

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
      setIsSplitMode(false);
      setSplitItemsQuantities({});
      loadData();
    } catch (error) {
      notify("error", getErrorMessage(error, t("payment.failedProcess")));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessSplitPayment = async () => {
    const selectedItems = Object.keys(splitItemsQuantities).length;
    if (!selectedOrder || selectedItems === 0 || !selectedPaymentMethod || !loggedInEmployee) {
      notify("error", t("payment.selectItemsToPay"));
      return;
    }

    setIsProcessing(true);
    try {
      const result = await processSplitPayment(qrCode, selectedOrder.id, {
        payment_method_id: parseInt(selectedPaymentMethod),
        split_items: splitItemsQuantities,
        employee_id: loggedInEmployee.id,
        employee_name: loggedInEmployee.name
      });

      if (result?.split_receipt) {
        try {
          await printFinalBill(qrCode, result.split_receipt.id, loggedInEmployee.name);
          notify("success", t("payment.splitPaymentSuccess", "Split payment processed"));
        } catch (e) {
          notify("error", t("payment.printerFailed"));
        }
      } else {
        notify("success", t("payment.splitPaymentSuccess", "Split payment processed"));
      }

      setSelectedOrder(null);
      setPaymentAmount("");
      setIsSplitMode(false);
      setSplitItemsQuantities({});
      loadData();
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

  const handleCancelOrder = async () => {
    if (!orderToCancelId || !loggedInEmployee) {
      notify("error", t("payment.failedCancel"));
      return;
    }

    try {
      await cancelOrder(qrCode, orderToCancelId, {
        employee_id: loggedInEmployee.id,
        employee_name: loggedInEmployee.name,
      });
      notify("success", t("payment.orderCancelled"));
      setOrderToCancelId(null);
      setShowCancelConfirmation(false);
      loadData();
    } catch (error) {
      notify("error", getErrorMessage(error, t("payment.failedCancel")));
    }
  };

  const handleSendFeedback = async () => {
    const comment = feedbackComment.trim();
    if (!comment || comment.length < 8) {
      notify("error", t("feedback.commentLengthError", "Please write at least 8 characters."));
      return;
    }
    if (!loggedInEmployee) return;

    setFeedbackSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("sender_name", loggedInEmployee.name);
      formData.append("comment", comment);
      formData.append("rating_app", feedbackRating.toString());
      if (feedbackOrder) {
        formData.append("order_id", feedbackOrder.id.toString());
        if (feedbackOrder.table_id) {
          formData.append("table_id", feedbackOrder.table_id.toString());
        }
      }

      await submitFeedback(qrCode, formData);
      notify("success", t("feedback.submitSuccess", "Feedback submitted successfully!"));
      setFeedbackModalOpen(false);
      setFeedbackComment("");
    } catch (err: any) {
      notify("error", getErrorMessage(err, t("feedback.submitFailed", "Failed to submit feedback")));
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  // Render Login Screen if not logged in
  if (!loggedInEmployee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex flex-col px-4 py-6 sm:p-6">
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
            <Button onClick={handleLogin} size="xl" className="w-full text-lg sm:h-12">{t("payment.loginBtn")}</Button>
          </CardFooter>
        </Card>
        </div>
      </div>
    );
  }

  // Main UI when logged in
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 px-4 py-6 sm:p-6">
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

              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => {
                  setFeedbackOrder(null);
                  setFeedbackComment("");
                  setFeedbackRating(5);
                  setFeedbackModalOpen(true);
                }} 
                className="rounded-full bg-white hover:bg-gray-50 border-gray-200"
                title="Send general feedback"
              >
                <MessageSquare className="h-4 w-4 text-gray-600" />
              </Button>

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
            <Button onClick={() => { setPosModalInitialType("COUNTER"); setPosModalOpen(true); }} variant="ghost" className="rounded-full text-pink-700 hover:bg-white hover:shadow-sm px-6 font-semibold bg-white/40">
              + {t("payment.counterOrder", "Counter Order")}
            </Button>
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
                  <Card key={order.id} className="relative overflow-hidden shadow-md hover:shadow-lg transition-shadow">
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
                              {order.order_type === 'COUNTER' && (
                                <Badge className="bg-pink-100 text-pink-700 hover:bg-pink-200 border-0">
                                  {t("payment.counterOrder", "Counter Order")}
                                  {order.table_id !== 999 && order.table_number && ` @ ${order.table_number}`}
                                </Badge>
                              )}
                              {order.customer_name && <span className="text-sm text-gray-500 font-medium ml-1">{order.customer_name}</span>}
                            </div>
                          )}
                        </div>

                        {/* Top Center Feedback Button */}
                        <div className="absolute left-1/2 -translate-x-1/2 top-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFeedbackOrder(order);
                              setFeedbackComment("");
                              setFeedbackRating(5);
                              setFeedbackModalOpen(true);
                            }}
                            className="h-8 px-2 text-xs text-gray-500 hover:text-green-700 hover:bg-green-50 rounded-full gap-1 flex items-center bg-white/60 backdrop-blur-sm shadow-sm border border-gray-100"
                            title="Report order issue"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>{t("payment.reportIssue", "Feedback")}</span>
                          </Button>
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
                            <Button
                              className="flex-1 h-14 sm:h-12 shadow-sm"
                              size="xl"
                              onClick={() => {
                                setSelectedOrder(order);
                                setPaymentAmount(order.remaining.toFixed(2));
                              }}
                            >
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
                                    {visiblePaymentMethods.map((method) => (
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
                                        setPaymentAmount("");
                                        setSplitItemsQuantities({});
                                      } else {
                                        setSplitItemsQuantities({});
                                      }
                                    }}
                                  >
                                    {isSplitMode ? t("payment.disableSplit") : t("payment.split", "Split")}
                                  </Button>
                                </div>
                                
                                {isSplitMode && (
                                  <div className="bg-white border rounded-lg p-3 space-y-3 max-h-[300px] overflow-y-auto">
                                    <p className="text-xs text-gray-500 mb-2">{t("payment.selectItemsToPay")}</p>
                                    {order.items.map((item) => {
                                      const selectedQty = splitItemsQuantities[item.id] || 0;
                                      return (
                                        <div 
                                          key={item.id}
                                          className="flex items-center justify-between p-2 rounded border border-gray-200 hover:bg-gray-50"
                                        >
                                          <div className="flex items-center gap-3 flex-1">
                                            <span className="text-sm font-medium text-gray-600 min-w-[1.5rem] text-center">
                                              {item.quantity}X
                                            </span>
                                            <div className="flex-1">
                                              <p className="text-sm font-medium">{item.item_name}</p>
                                              <p className="text-xs text-gray-500">
                                                RM {(item.price_at_order_time ?? 0).toFixed(2)} each
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <div className="flex items-center border border-gray-300 rounded">
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0"
                                                onClick={() => setSplitItemQuantity(item.id, Math.max(0, selectedQty - 1))}
                                              >
                                                −
                                              </Button>
                                              <Input
                                                type="number"
                                                min="0"
                                                max={item.quantity}
                                                value={selectedQty}
                                                onChange={(e) => {
                                                  const val = Math.min(item.quantity, Math.max(0, parseInt(e.target.value) || 0));
                                                  setSplitItemQuantity(item.id, val);
                                                }}
                                                className="h-7 w-12 border-0 text-center p-0 text-sm"
                                              />
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0"
                                                onClick={() => setSplitItemQuantity(item.id, Math.min(item.quantity, selectedQty + 1))}
                                              >
                                                +
                                              </Button>
                                            </div>
                                            <span className="text-sm font-medium min-w-[60px] text-right">RM {((item.price_at_order_time ?? 0) * selectedQty).toFixed(2)}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
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
                                <div className="flex flex-wrap gap-2 pt-2">
                                  {getTenderSuggestions(order.remaining).map((suggestion) => (
                                    <Button
                                      key={`${suggestion.label}-${suggestion.value}`}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 px-3 text-sm"
                                      onClick={() => setPaymentAmount(suggestion.value.toFixed(2))}
                                    >
                                      RM {suggestion.value.toFixed(2)}
                                    </Button>
                                  ))}
                                </div>
                                {parseFloat(paymentAmount) > order.remaining && (
                                  <p className="text-sm text-green-600 font-medium mt-1">
                                    {t("payment.changeDue", { amount: `RM ${(parseFloat(paymentAmount) - order.remaining).toFixed(2)}` })}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 pt-4">
                              {isSplitMode ? (
                                <Button onClick={handleProcessSplitPayment} disabled={isProcessing || Object.keys(splitItemsQuantities).length === 0} className="flex-1 h-14" size="xl">
                                  {isProcessing ? t("payment.processing") : t("payment.processSplitPayment", "Process Split Payment")}
                                </Button>
                              ) : (
                                <Button onClick={handleProcessPayment} disabled={isProcessing} className="flex-1 h-14" size="xl">
                                  {isProcessing ? t("payment.processing") : t("payment.processPaymentBtn")}
                                </Button>
                              )}
                              <Button variant="outline" onClick={() => setAddingItem(true)} size="xl" className="sm:flex-none h-14">
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
                      <Button 
                        variant="destructive" 
                        size="lg" 
                        onClick={() => {
                          setOrderToCancelId(order.id);
                          setShowCancelConfirmation(true);
                        }}
                        className="flex-none font-medium"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t("payment.cancelBtn")}
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
                          
                          {/* Top Center Feedback Button for Paid Orders */}
                          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFeedbackOrder(order);
                                setFeedbackComment("");
                                setFeedbackRating(5);
                                setFeedbackModalOpen(true);
                              }}
                              className="h-8 px-2 text-xs text-gray-500 hover:text-green-700 hover:bg-green-50 rounded-full gap-1 flex items-center"
                              title="Report order issue"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>{t("payment.reportIssue", "Feedback")}</span>
                            </Button>
                          </div>
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

      <AlertDialog open={showCancelConfirmation} onOpenChange={setShowCancelConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              {t("payment.cancelConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("payment.cancelConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg bg-red-50 p-3 border border-red-200">
            <p className="text-sm text-red-800 font-medium">
              {t("payment.cancelWarning")}
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelOrder} className="bg-red-600 hover:bg-red-700">
              {t("payment.confirmCancel")}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Employee Feedback Dialog */}
      <Dialog open={feedbackModalOpen} onOpenChange={setFeedbackModalOpen}>
        <DialogContent className="sm:max-w-[500px] p-6 bg-white rounded-2xl shadow-xl border-0">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-800">
              <MessageSquare className="h-5 w-5 text-green-600" />
              {feedbackOrder 
                ? `${t("feedback.orderFeedback", "Order Feedback")} #${feedbackOrder.id}`
                : t("feedback.generalFeedback", "Send General Feedback")
              }
            </DialogTitle>
            <DialogDescription className="text-gray-500 mt-1">
              {feedbackOrder 
                ? t("feedback.orderDesc", "Submit feedback specifically regarding this order's items or processing details.")
                : t("feedback.generalDesc", "Help us improve. Report any bugs, inaccurate info, or usability issues you face.")
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-4">
            <div className="space-y-1">
              <Label className="text-gray-500 text-xs font-semibold uppercase tracking-wider">{t("feedback.sender", "Sender")}</Label>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 text-sm font-medium text-gray-700">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                {loggedInEmployee?.name} (ID: {loggedInEmployee?.id})
              </div>
            </div>

            {feedbackOrder && (
              <div className="space-y-1">
                <Label className="text-gray-500 text-xs font-semibold uppercase tracking-wider">{t("feedback.associatedOrder", "Associated Order")}</Label>
                <div className="px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-600 space-y-1">
                  <p><strong>{t("customer.total")}:</strong> RM {feedbackOrder.total_with_vat.toFixed(2)} ({feedbackOrder.order_type || "DINE_IN"})</p>
                  <p><strong>{t("feedback.items", "Items")}:</strong> {feedbackOrder.items.map(i => `${i.quantity}x ${i.item_name}`).join(", ")}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-gray-700 font-semibold">{t("feedback.ratingApp", "Rate App Experience")}</Label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFeedbackRating(star)}
                    className="p-1 transition-transform hover:scale-110 active:scale-95"
                  >
                    <Star 
                      className={`w-8 h-8 ${
                        star <= feedbackRating 
                          ? "fill-yellow-400 text-yellow-400" 
                          : "text-gray-200 fill-gray-200"
                      }`} 
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-comment" className="text-gray-700 font-semibold">{t("feedback.commentLabel", "Feedback Message")}</Label>
              <textarea
                id="feedback-comment"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                placeholder={feedbackOrder 
                  ? t("feedback.orderPlaceholder", "What went wrong with this order? E.g., item options didn't calculate correctly...")
                  : t("feedback.generalPlaceholder", "Describe the bug or broken layout you faced...")
                }
                rows={4}
                className="flex w-full rounded-xl border border-gray-200 bg-background px-3.5 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-gray-400 text-right">
                {feedbackComment.trim().length} / 8 {t("feedback.charsMin", "chars minimum")}
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFeedbackModalOpen(false)}
              className="flex-1 h-12 rounded-xl"
              disabled={feedbackSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSendFeedback}
              className="flex-1 h-12 rounded-xl"
              disabled={feedbackSubmitting || feedbackComment.trim().length < 8}
            >
              {feedbackSubmitting ? t("common.processing") : t("feedback.sendBtn", "Submit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
