import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Eye, EyeOff } from "lucide-react";
import { fetchUnpaidOrders, fetchPaidOrders, fetchPaymentMethods, processPayment, updateVAT, addOrderItem, fetchMenuItems } from "@/lib/api";
import type { PaymentOrder } from "@/lib/api";

// ... (existing interfaces)

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

export const PaymentCounterView = ({ qrCode, notify }: PaymentCounterViewProps) => {
  const [unpaidOrders, setUnpaidOrders] = useState<PaymentOrder[]>([]);
  const [paidOrders, setPaidOrders] = useState<PaymentOrder[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [showPaidOrders, setShowPaidOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PaymentOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingVAT, setEditingVAT] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemId, setNewItemId] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("1");
  const [newVAT, setNewVAT] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
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
    } catch (error) {
      notify("error", "Failed to load payment data");
    } finally {
      setLoading(false);
    }
  }, [notify, qrCode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleProcessPayment = async () => {
    if (!selectedOrder || !paymentAmount || !selectedPaymentMethod || !employeeId || !employeeName) {
      notify("error", "Please fill all payment details");
      return;
    }

    setIsProcessing(true);
    try {
      await processPayment(qrCode, selectedOrder.id, {
        payment_method_id: parseInt(selectedPaymentMethod),
        amount_paid: parseFloat(paymentAmount),
        employee_id: employeeId,
        employee_name: employeeName
      });

      notify("success", "Payment processed successfully");
      setSelectedOrder(null);
      setPaymentAmount("");
      setSelectedPaymentMethod("");
      loadData(); // This should refresh the lists
    } catch (error) {
      notify("error", "Failed to process payment");
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleAddItem = async () => {
    if (!selectedOrder || !newItemId || !newItemQuantity) {
        notify("error", "Please select an item and quantity");
        return;
    }

    try {
        await addOrderItem(qrCode, selectedOrder.id, {
            menu_item_id: parseInt(newItemId),
            quantity: parseInt(newItemQuantity),
            employee_id: employeeId,
            employee_name: employeeName,
        });
        notify("success", "Item added successfully");
        setAddingItem(false);
        setNewItemId("");
        setNewItemQuantity("1");
        loadData(); // Refresh data to show the new item
    } catch (error) {
        notify("error", "Failed to add item");
    }
};


  const editVAT = async () => {
    if (!selectedOrder || !newVAT || !employeeId || !employeeName) {
      notify("error", "Please fill all VAT edit details");
      return;
    }

    try {
      await updateVAT(qrCode, selectedOrder.id, {
        vat_rate: parseFloat(newVAT) / 100,
        employee_id: employeeId,
        employee_name: employeeName
      });

      notify("success", "VAT updated successfully");
      setEditingVAT(false);
      setNewVAT("");
      loadData();
    } catch (error) {
      notify("error", "Failed to update VAT");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Payment Counter</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Unpaid Orders</h2>
            {loading ? (
              <p>Loading...</p>
            ) : (
              <div className="space-y-4">
                {unpaidOrders.map((order) => (
                  <Card key={order.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Table {order.table_number}</span>
                        <Badge variant={order.remaining > 0 ? "destructive" : "secondary"}>
                          RM {order.remaining.toFixed(2)}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul>
                        {order.items.map(item => (
                          <li key={item.item_name}>{item.quantity}x {item.item_name}</li>
                        ))}
                      </ul>
                      <div className="mt-4">
                        <p>Subtotal: RM {order.total_price.toFixed(2)}</p>
                        <p>VAT ({order.vat_rate * 100}%): RM {(order.total_price * order.vat_rate).toFixed(2)}</p>
                        <p className="font-bold">Total: RM {order.total_with_vat.toFixed(2)}</p>
                        <p>Paid: RM {order.total_paid.toFixed(2)}</p>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="w-full mt-4" onClick={() => setSelectedOrder(order)}>
                            Process Payment
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Process Payment - Table {order.table_number}</DialogTitle>
                          </DialogHeader>
                          {/* Payment processing form */}
                          <div className="space-y-4">
                            <div>
                              <Label>Total Amount: RM {order.total_with_vat.toFixed(2)}</Label>
                              <Label className="block text-sm text-gray-600">
                                Remaining: RM {order.remaining.toFixed(2)}
                              </Label>
                            </div>

                            <div>
                              <Label htmlFor="payment-method">Payment Method</Label>
                              <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select payment method" />
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

                            <div>
                              <Label htmlFor="amount">Payment Amount (RM)</Label>
                              <Input id="amount" type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="employee-id">Employee ID</Label>
                                <Input id="employee-id" value={employeeId} onChange={e => setEmployeeId(e.target.value)} />
                              </div>
                              <div>
                                <Label htmlFor="employee-name">Employee Name</Label>
                                <Input id="employee-name" value={employeeName} onChange={e => setEmployeeName(e.target.value)} />
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button onClick={handleProcessPayment} disabled={isProcessing} className="flex-1">
                                {isProcessing ? "Processing..." : "Process Payment"}
                              </Button>
                              <Button variant="outline" onClick={() => setEditingVAT(true)}>Edit VAT</Button>
                              <Button variant="outline" onClick={() => setAddingItem(true)}>Add Item</Button>
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
                <h2 className="text-2xl font-semibold">Paid Orders</h2>
                <Button onClick={() => setShowPaidOrders(!showPaidOrders)} variant="outline">
                    {showPaidOrders ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                    {showPaidOrders ? "Hide" : "Show"} Paid Orders
                </Button>
            </div>
            {showPaidOrders && (
              loading ? <p>Loading...</p> : (
                <div className="space-y-4">
                  {paidOrders.map((order) => (
                    <Card key={order.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>Table {order.table_number}</span>
                          <Badge>Paid</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p>Total: RM {order.total_with_vat.toFixed(2)}</p>
                        <p className="text-sm text-gray-500">Paid at: {new Date(order.created_at).toLocaleTimeString()}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            )}
          </section>
        </div>
      </div>

      {/* VAT Edit Dialog */}
       <Dialog open={editingVAT} onOpenChange={setEditingVAT}>
           <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit VAT Rate</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="vat">New VAT Rate (%)</Label>
                <Input
                  id="vat"
                  type="number"
                  step="0.01"
                  value={newVAT}
                  onChange={(e) => setNewVAT(e.target.value)}
                  placeholder="6.00"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-employee-id">Employee ID</Label>
                  <Input
                    id="edit-employee-id"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="ID"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-employee-name">Employee Name</Label>
                  <Input
                    id="edit-employee-name"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Name"
                  />
                </div>
              </div>
              <Button onClick={editVAT} className="w-full">
                Update VAT
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      {/* Add Item Dialog */}
        <Dialog open={addingItem} onOpenChange={setAddingItem}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Item to Order</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="menu-item">Menu Item</Label>
                        <Select value={newItemId} onValueChange={setNewItemId}>
                            <SelectTrigger>
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
                    <div>
                        <Label htmlFor="quantity">Quantity</Label>
                        <Input id="quantity" type="number" value={newItemQuantity} onChange={e => setNewItemQuantity(e.target.value)} min="1" />
                    </div>
                    <Button onClick={handleAddItem} className="w-full">Add Item</Button>
                </div>
            </DialogContent>
        </Dialog>
    </div>
  );
};
