import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Eye, EyeOff, CreditCard, DollarSign } from "lucide-react";
import { fetchUnpaidOrders, fetchPaidOrders, fetchPaymentMethods, processPayment, updateVAT } from "@/lib/api";

interface Order {
  id: number;
  table_number: string;
  total_price: number;
  vat_rate: number;
  total_with_vat: number;
  items: Array<{
    quantity: number;
    price_at_order_time: number;
    item_name: string;
  }>;
  total_paid: number;
  remaining: number;
  created_at: string;
}

interface PaymentMethod {
  id: number;
  name: string;
}

interface PaymentCounterViewProps {
  qrCode: string;
  notify: (kind: "success" | "error", text: string) => void;
}

export const PaymentCounterView = ({ qrCode, notify }: PaymentCounterViewProps) => {
  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([]);
  const [paidOrders, setPaidOrders] = useState<Order[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showPaidOrders, setShowPaidOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingVAT, setEditingVAT] = useState(false);
  const [newVAT, setNewVAT] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [unpaidOrders, paidOrders, paymentMethods] = await Promise.all([
        fetchUnpaidOrders(qrCode),
        fetchPaidOrders(qrCode),
        fetchPaymentMethods(qrCode)
      ]);

      setUnpaidOrders(unpaidOrders);
      setPaidOrders(paidOrders);
      setPaymentMethods(paymentMethods);
    } catch (error) {
      notify("error", "Failed to load payment data");
      setUnpaidOrders([]);
      setPaidOrders([]);
      setPaymentMethods([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedOrder || !paymentAmount || !selectedPaymentMethod || !employeeId || !employeeName) {
      notify("error", "Please fill all payment details");
      return;
    }

    setIsProcessing(true);
    try {
      await processPayment(qrCode, selectedOrder.id, {
        method_id: parseInt(selectedPaymentMethod),
        amount: parseFloat(paymentAmount),
        employee_id: employeeId,
        employee_name: employeeName
      });

      notify("success", "Payment processed successfully");
      setSelectedOrder(null);
      setPaymentAmount("");
      setSelectedPaymentMethod("");
      loadData();
    } catch (error) {
      notify("error", "Failed to process payment");
    } finally {
      setIsProcessing(false);
    }
  };

  const editVAT = async () => {
    if (!selectedOrder || !newVAT || !employeeId || !employeeName) {
      notify("error", "Please fill all VAT edit details");
      return;
    }

    try {
      await updateVAT(qrCode, selectedOrder.id, {
        vat_rate: parseFloat(newVAT) / 100, // Convert percentage to decimal
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
            <Button
              onClick={() => setShowPaidOrders(!showPaidOrders)}
              variant="outline"
              className="flex items-center gap-2"
            >
              {showPaidOrders ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPaidOrders ? "Hide" : "Show"} Paid Orders
            </Button>
          </div>
        <div className="space-y-10">
          <section className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Unpaid Orders</h2>
                <p className="text-sm text-gray-600">Current receipts waiting for payment.</p>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-sm font-medium shadow-sm">
                {loading ? "Loading..." : `${unpaidOrders.length} unpaid`}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-8">Loading unpaid orders...</div>
            ) : unpaidOrders.length === 0 ? (
              <div className="text-center py-8 text-gray-600">No unpaid orders at the moment.</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {unpaidOrders.map((order) => (
                  <Card key={order.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        Table {order.table_number}
                        <Badge variant={order.remaining > 0 ? "destructive" : "secondary"}>
                          RM {order.remaining.toFixed(2)}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div>Items: {order.items.reduce((sum, item) => sum + item.quantity, 0)}</div>
                        <div>Subtotal: RM {order.total_price.toFixed(2)}</div>
                        <div>VAT: RM {(order.total_price * order.vat_rate).toFixed(2)}</div>
                        <div className="font-semibold">Total: RM {order.total_with_vat.toFixed(2)}</div>
                        <div>Paid: RM {order.total_paid.toFixed(2)}</div>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            className="w-full mt-4"
                            onClick={() => setSelectedOrder(order)}
                          >
                            Process Payment
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Process Payment - Table {order.table_number}</DialogTitle>
                          </DialogHeader>
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
                                  {(paymentMethods || []).map((method) => (
                                    <SelectItem key={method.id} value={method.id.toString()}>
                                      {method.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label htmlFor="amount">Payment Amount (RM)</Label>
                              <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                placeholder="Enter amount"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="employee-id">Employee ID</Label>
                                <Input
                                  id="employee-id"
                                  value={employeeId}
                                  onChange={(e) => setEmployeeId(e.target.value)}
                                  placeholder="ID"
                                />
                              </div>
                              <div>
                                <Label htmlFor="employee-name">Employee Name</Label>
                                <Input
                                  id="employee-name"
                                  value={employeeName}
                                  onChange={(e) => setEmployeeName(e.target.value)}
                                  placeholder="Name"
                                />
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                onClick={handleProcessPayment}
                                disabled={isProcessing}
                                className="flex-1"
                              >
                                {isProcessing ? "Processing..." : "Process Payment"}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setEditingVAT(true)}
                              >
                                Edit VAT
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
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Paid Orders</h2>
                <p className="text-sm text-gray-600">Paid receipts are shown below.</p>
              </div>
              <Button onClick={() => setShowPaidOrders(!showPaidOrders)} variant="outline" className="flex items-center gap-2">
                {showPaidOrders ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPaidOrders ? "Hide Paid Orders" : "Show Paid Orders"}
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8">Loading paid orders...</div>
            ) : showPaidOrders ? (
              paidOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-600">No paid orders yet.</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {paidOrders.map((order) => (
                    <Card key={order.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          Table {order.table_number}
                          <Badge variant="default">Paid</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div>Items: {order.items.reduce((sum, item) => sum + item.quantity, 0)}</div>
                          <div>Total: RM {order.total_with_vat.toFixed(2)}</div>
                          <div className="text-gray-600">
                            {new Date(order.created_at).toLocaleString()}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            ) : (
              <div className="text-sm text-gray-600">Paid orders are hidden. Click the button above to show them.</div>
            )}
          </section>
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
      </div>
    </div>
  );
};