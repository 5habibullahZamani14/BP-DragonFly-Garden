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
import { Eye, EyeOff, LogOut } from "lucide-react";
import { fetchUnpaidOrders, fetchPaidOrders, fetchPaymentMethods, processPayment, addOrderItem, fetchMenuItems, fetchEmployees, fetchSettings, printFinalBill } from "@/lib/api";
import type { PaymentOrder } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { HelpModal, HelpSection } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";

interface PaymentMethod {
  id: number;
  name: string;
}

interface MenuItem {
  id: number;
  name: string;
  price: number;
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

export const PaymentCounterView = ({ qrCode, notify }: PaymentCounterViewProps) => {
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

  // Check login state on mount
  useEffect(() => {
    const savedLogin = localStorage.getItem("paymentCounterLogin");
    if (savedLogin) {
      try {
        const parsed = JSON.parse(savedLogin);
        // 7-day expiry
        if (parsed.expiry && Date.now() < parsed.expiry) {
          setLoggedInEmployee({ name: parsed.name, id: parsed.id });
        } else {
          localStorage.removeItem("paymentCounterLogin");
        }
      } catch {
        localStorage.removeItem("paymentCounterLogin");
      }
    }
  }, []);

  const handleLogin = async () => {
    try {
      const employees = await fetchEmployees(false);
      const matched = employees.find(
        (emp) => emp.employee_id === loginInputId && emp.name.toLowerCase() === loginInputName.toLowerCase()
      );

      if (matched) {
        setLoggedInEmployee({ name: matched.name, id: matched.employee_id });
        localStorage.setItem(
          "paymentCounterLogin",
          JSON.stringify({
            id: matched.employee_id,
            name: matched.name,
            expiry: Date.now() + 7 * 24 * 60 * 60 * 1000,
          })
        );
      } else {
        notify("error", "Invalid Employee ID or Name");
      }
    } catch {
      notify("error", "Failed to verify employee");
    }
  };

  useEffect(() => {
    const checkWorkingHours = async () => {
      if (!loggedInEmployee) return;
      try {
        const settings = await fetchSettings();
        if (settings && settings.work_hours) {
          const { start, end } = settings.work_hours;
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
          
          if (currentTimeStr < start || currentTimeStr > end) {
            handleLogout();
            // Silent logout, or inline UI alert later. For now just clear session
          }
        }
      } catch (e) {
        console.error("Failed to check hours", e);
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
    } catch (error) {
      notify("error", "Failed to load payment data");
    } finally {
      setLoading(false);
    }
  }, [notify, qrCode, loggedInEmployee]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useWebSocket(["NEW_ORDER", "ORDER_STATUS_UPDATE", "NEW_PAYMENT"], (event) => {
    if (loggedInEmployee) {
      loadData();
    }
  });

  const handleProcessPayment = async () => {
    if (!selectedOrder || !paymentAmount || !selectedPaymentMethod || !loggedInEmployee) {
      notify("error", "Please fill all payment details");
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
          notify("success", "Payment successful! Final receipt printing.");
        } catch (e) {
          notify("error", "Payment successful but printer failed!");
        }
      } else {
        notify("success", "Partial payment recorded.");
      }

      setSelectedOrder(null);
      setPaymentAmount("");
      // Don't reset selectedPaymentMethod so it stays on Cash
      loadData(); // This should refresh the lists
    } catch (error) {
      notify("error", getErrorMessage(error, "Failed to process payment"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddItem = async () => {
    if (!selectedOrder || !newItemId || !newItemQuantity || !loggedInEmployee) {
        notify("error", "Please select an item and quantity");
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
        notify("error", getErrorMessage(error, "Failed to add item"));
    }
  };

  // Render Login Screen if not logged in
  if (!loggedInEmployee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex flex-col p-6">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center mb-auto">
          <SettingsModal />
          <HelpModal title="Payment Counter" sections={paymentHelpSections} />
        </div>
        <div className="flex-1 flex items-center justify-center pb-20">
          <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-center text-gray-900">Payment Counter Login</CardTitle>
            <CardDescription className="text-center">Enter your employee credentials to start your shift.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="login-id">Employee ID</Label>
              <Input
                id="login-id"
                value={loginInputId}
                onChange={(e) => setLoginInputId(e.target.value)}
                placeholder="e.g. 111"
              />
            </div>
            <div>
              <Label htmlFor="login-name">Employee Name</Label>
              <Input
                id="login-name"
                value={loginInputName}
                onChange={(e) => setLoginInputName(e.target.value)}
                placeholder="e.g. epm1"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleLogin} className="w-full text-lg h-12">Login</Button>
          </CardFooter>
        </Card>
        </div>
      </div>
    );
  }

  // Main UI when logged in
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <SettingsModal />
            <h1 className="text-3xl font-bold text-gray-900">Payment Counter</h1>
          </div>
          <div className="flex items-center gap-4 bg-white/60 px-4 py-2 rounded-full shadow-sm">
            <span className="text-sm font-medium text-gray-700">
              Shift: <span className="text-green-700">{loggedInEmployee.name}</span>
            </span>
            <HelpModal title="Payment Counter" sections={paymentHelpSections} />
            <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full">
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">Unpaid Orders</h2>
            {loading ? (
              <div className="flex justify-center p-8"><p className="text-gray-500 animate-pulse">Loading orders...</p></div>
            ) : (
              <div className="space-y-4">
                {unpaidOrders.length === 0 ? (
                  <p className="text-gray-500 italic">No unpaid orders found.</p>
                ) : unpaidOrders.map((order) => (
                  <Card key={order.id} className="overflow-hidden shadow-md hover:shadow-lg transition-shadow">
                    <CardHeader className="bg-white pb-4">
                      <CardTitle className="flex items-center justify-between">
                        <span className="text-xl">{order.table_number}</span>
                        <Badge variant={order.remaining > 0 ? "destructive" : "secondary"} className="text-sm px-3 py-1">
                          RM {order.remaining.toFixed(2)}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="bg-gray-50 pt-4">
                      <ul className="space-y-1 mb-4 text-gray-700">
                        {order.items.map((item, index) => (
                          <li key={`${item.id || item.item_name}-${index}`} className="flex justify-between">
                            <span>{item.quantity}x {item.item_name}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-gray-200 pt-4 space-y-1 text-sm text-gray-600">
                        <div className="flex justify-between"><p>Subtotal:</p><p>RM {order.total_price.toFixed(2)}</p></div>
                        <div className="flex justify-between"><p>Service Charge ({(order.service_charge_rate || 0.10) * 100}%):</p><p>RM {(order.total_price * (order.service_charge_rate || 0.10)).toFixed(2)}</p></div>
                        <div className="flex justify-between"><p>SST ({order.vat_rate * 100}%):</p><p>RM {(order.total_price * (1 + (order.service_charge_rate || 0.10)) * order.vat_rate).toFixed(2)}</p></div>
                        <div className="flex justify-between font-bold text-gray-900 text-lg mt-2 pt-2 border-t border-gray-200">
                          <p>Total:</p><p>RM {order.total_with_vat.toFixed(2)}</p>
                        </div>
                        <div className="flex justify-between text-green-700 font-medium">
                          <p>Paid:</p><p>RM {order.total_paid.toFixed(2)}</p>
                        </div>
                      </div>
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="w-full mt-6 shadow-sm" size="lg" onClick={() => setSelectedOrder(order)}>
                            Process Payment
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Process Payment</DialogTitle>
                            <DialogDescription>{order.table_number}</DialogDescription>
                          </DialogHeader>
                          
                          <div className="space-y-6 mt-4">
                            <div className="bg-gray-50 p-4 rounded-lg flex justify-between items-center">
                              <div className="space-y-1">
                                <p className="text-sm text-gray-500">Total Amount</p>
                                <p className="font-semibold">RM {order.total_with_vat.toFixed(2)}</p>
                              </div>
                              <div className="text-right space-y-1">
                                <p className="text-sm text-gray-500">Remaining</p>
                                <p className="font-bold text-red-600 text-lg">RM {order.remaining.toFixed(2)}</p>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="payment-method">Payment Method</Label>
                                <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select method" />
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

                              <div className="space-y-2">
                                <Label htmlFor="amount">Tendered Amount (RM)</Label>
                                <Input 
                                  id="amount" 
                                  type="number" 
                                  step="0.01" 
                                  value={paymentAmount} 
                                  onChange={e => setPaymentAmount(e.target.value)}
                                  placeholder="e.g. 50.00"
                                  className="text-lg"
                                />
                                {parseFloat(paymentAmount) > order.remaining && (
                                  <p className="text-sm text-green-600 font-medium mt-1">
                                    Change due: RM {(parseFloat(paymentAmount) - order.remaining).toFixed(2)}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 pt-4">
                              <Button onClick={handleProcessPayment} disabled={isProcessing} className="flex-1" size="lg">
                                {isProcessing ? "Processing..." : "Process Payment"}
                              </Button>
                              <Button variant="outline" onClick={() => setAddingItem(true)} size="lg" className="sm:flex-none">
                                Add Item
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold text-gray-800">Paid Orders</h2>
                <Button onClick={() => setShowPaidOrders(!showPaidOrders)} variant="outline" className="shadow-sm bg-white hover:bg-gray-50">
                    {showPaidOrders ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                    {showPaidOrders ? "Hide" : "Show"}
                </Button>
            </div>
            {showPaidOrders && (
              loading ? <div className="flex justify-center p-8"><p className="text-gray-500 animate-pulse">Loading orders...</p></div> : (
                <div className="space-y-4 opacity-80">
                  {paidOrders.length === 0 ? (
                    <p className="text-gray-500 italic">No paid orders today.</p>
                  ) : paidOrders.map((order) => (
                    <Card key={order.id} className="bg-gray-50">
                      <CardHeader className="py-4">
                        <CardTitle className="flex items-center justify-between text-lg">
                          <span className="text-gray-700">Table {order.table_number}</span>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Paid</Badge>
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
                  <DialogTitle>Add Last-Minute Item</DialogTitle>
                  <DialogDescription>
                    Append an item to the order before final payment.
                  </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 mt-4">
                  <div className="space-y-2">
                      <Label htmlFor="menu-item">Menu Item</Label>
                      <Select value={newItemId} onValueChange={setNewItemId}>
                          <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select an item" />
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
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input id="quantity" type="number" value={newItemQuantity} onChange={e => setNewItemQuantity(e.target.value)} min="1" />
                  </div>
                  <Button onClick={handleAddItem} className="w-full" size="lg">Add to Order</Button>
              </div>
          </DialogContent>
      </Dialog>
    </div>
  );
};

const paymentHelpSections: HelpSection[] = [
  {
    id: "login",
    title: "1. Login & Session",
    content: (
      <div className="space-y-2">
        <p>Before you can process payments, log in using your <strong>Employee ID</strong> and <strong>Name</strong>. This ensures every transaction is tracked under your name.</p>
        <p><strong>Your session is remembered for 7 days.</strong> You will not need to log in again until the week ends or you manually click Logout.</p>
        <p>The ⚙️ Settings icon (top-left) and the ℹ️ Info icon (top-right) are always accessible, even before you log in.</p>
        <p><strong>Note:</strong> The system automatically monitors restaurant working hours. If the restaurant closes, it will automatically end your shift and log you out.</p>
      </div>
    )
  },
  {
    id: "process-payment",
    title: "2. How to Process a Payment",
    content: (
      <div className="space-y-2">
        <p>When a customer is ready to pay, find their order in the <strong>Unpaid Orders</strong> list on the left side of your screen.</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Verify the Table number and the items listed on the ticket.</li>
          <li>Click the blue <strong>Process Payment</strong> button.</li>
          <li>A window will appear showing the total cost (including VAT and Service Charge) and the <strong>Remaining</strong> amount due.</li>
          <li>Select the <strong>Payment Method</strong> (e.g., Cash, Card).</li>
          <li>Enter the <strong>Tendered Amount</strong> (the amount the customer handed to you). If they gave more than the total, the system will automatically calculate the <strong>Change due</strong>.</li>
          <li>Click <strong>Process</strong>. The system will record the payment and move the order to the Paid list if the balance is fully settled.</li>
        </ol>
      </div>
    )
  },
  {
    id: "add-items",
    title: "3. Adding Last-Minute Items",
    content: (
      <div className="space-y-2">
        <p>Sometimes a customer will want to add an item right as they are paying (like a last-minute drink or dessert).</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Click <strong>Process Payment</strong> on their order.</li>
          <li>Instead of entering payment, click the <strong>Add Item</strong> button.</li>
          <li>Select the item from the dropdown list and enter the quantity.</li>
          <li>Click <strong>Add to Order</strong>. The item will be instantly added to their bill, the total will update, and inventory will be automatically deducted.</li>
        </ol>
      </div>
    )
  },
  {
    id: "paid-orders",
    title: "4. Viewing Paid Orders",
    content: (
      <div className="space-y-2">
        <p>The right side of your screen contains the <strong>Paid Orders</strong> list. By default, it is hidden to keep your screen clean.</p>
        <p>Click the <strong>Show</strong> button to reveal all fully paid orders from today. You can use this to verify past transactions or confirm a payment went through successfully.</p>
      </div>
    )
  },
  {
    id: "display-settings",
    title: "5. Display Settings",
    content: (
      <div className="space-y-2">
        <p>Tap the <strong>⚙️ Settings icon</strong> in the top-left corner at any time (even before logging in) to open Display Settings. From there you can:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Switch between three font styles (Clarity, Classic, Elegance).</li>
          <li>Adjust the Interface Size and Text Size using sliders or +/− buttons.</li>
        </ul>
        <p>All settings are saved automatically and remembered across visits.</p>
      </div>
    )
  },
];
