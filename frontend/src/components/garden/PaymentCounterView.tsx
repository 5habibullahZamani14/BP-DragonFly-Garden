import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Eye, EyeOff, LogOut } from "lucide-react";
import { fetchUnpaidOrders, fetchPaidOrders, fetchPaymentMethods, processPayment, addOrderItem, fetchMenuItems, fetchEmployees, fetchSettings } from "@/lib/api";
import type { PaymentOrder } from "@/lib/api";

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
        const today = new Date().toDateString();
        // If login is from today, restore it. Otherwise, force new login.
        if (parsed.date === today) {
          setLoggedInEmployee({ name: parsed.name, id: parsed.id });
        } else {
          localStorage.removeItem("paymentCounterLogin");
        }
      } catch (e) {
        localStorage.removeItem("paymentCounterLogin");
      }
    }
  }, []);

  const handleLogin = async () => {
    try {
      const employees = await fetchEmployees(false);
      const matched = employees.find(
        (emp: any) => emp.employee_id === loginInputId && emp.name.toLowerCase() === loginInputName.toLowerCase()
      );

      if (matched) {
        setLoggedInEmployee({ name: matched.name, id: matched.employee_id });
        localStorage.setItem(
          "paymentCounterLogin",
          JSON.stringify({
            id: matched.employee_id,
            name: matched.name,
            date: new Date().toDateString()
          })
        );
      } else {
        notify("error", "Invalid Employee ID or Name");
      }
    } catch (e) {
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
      await processPayment(qrCode, selectedOrder.id, {
        payment_method_id: parseInt(selectedPaymentMethod),
        amount_paid: finalAmount,
        employee_id: loggedInEmployee.id,
        employee_name: loggedInEmployee.name
      });

      setSelectedOrder(null);
      setPaymentAmount("");
      // Don't reset selectedPaymentMethod so it stays on Cash
      loadData(); // This should refresh the lists
    } catch (error: any) {
      notify("error", error?.message || "Failed to process payment");
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
    } catch (error: any) {
        notify("error", error?.message || "Failed to add item");
    }
  };

  // Render Login Screen if not logged in
  if (!loggedInEmployee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-6">
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
    );
  }

  // Main UI when logged in
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <h1 className="text-3xl font-bold text-gray-900">Payment Counter</h1>
          <div className="flex items-center gap-4 bg-white/60 px-4 py-2 rounded-full shadow-sm">
            <span className="text-sm font-medium text-gray-700">
              Shift: <span className="text-green-700">{loggedInEmployee.name}</span>
            </span>
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
                        <span className="text-xl">Table {order.table_number}</span>
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
                        <div className="flex justify-between"><p>VAT ({order.vat_rate * 100}%):</p><p>RM {(order.total_price * (1 + (order.service_charge_rate || 0.10)) * order.vat_rate).toFixed(2)}</p></div>
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
                            <DialogDescription>Table {order.table_number}</DialogDescription>
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
                                {isProcessing ? "Processing..." : "Process"}
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
