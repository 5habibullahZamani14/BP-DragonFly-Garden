import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createCounterOrder } from "@/lib/api";
import type { MenuItem, Order } from "@/lib/api";
import { Plus, Minus, ShoppingBag, Trash2, Clock, MapPin, Phone, User } from "lucide-react";

interface PosOrderModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialOrderType: "TAKEAWAY" | "PICKUP" | "DELIVERY";
  menuItems: MenuItem[];
  qrCode: string;
  notify: (kind: "success" | "error", text: string) => void;
  onOrderCreated: (order: Order) => void;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes: string;
}

export function PosOrderModal({ isOpen, onOpenChange, initialOrderType, menuItems, qrCode, notify, onOrderCreated }: PosOrderModalProps) {
  const { t } = useTranslation();
  const [orderType, setOrderType] = useState<"TAKEAWAY" | "PICKUP" | "DELIVERY">(initialOrderType);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [collectionTime, setCollectionTime] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setOrderType(initialOrderType);
    }
  }, [isOpen, initialOrderType]);

  const addToCart = (menuItem: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(item => item.menuItem.id === menuItem.id);
      if (existing) {
        return prev.map(item => item.menuItem.id === menuItem.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { menuItem, quantity: 1, notes: "" }];
    });
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.menuItem.id === id) {
        const newQ = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQ };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.menuItem.price * item.quantity), 0);

  const handleSubmit = async () => {
    if (cart.length === 0) {
      notify("error", "Cart is empty!");
      return;
    }
    if (orderType === "PICKUP") {
      if (!customerName.trim() || !customerPhone.trim() || !collectionTime.trim()) {
        notify("error", "Name, Phone, and Collection Time are required for Pickup");
        return;
      }
    }
    if (orderType === "DELIVERY") {
      if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
        notify("error", "Name, Phone, and Address are required for Delivery");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const order = await createCounterOrder(qrCode, {
        table_id: 999, // The virtual Counter Orders table
        order_type: orderType,
        customer_name: customerName,
        customer_phone: customerPhone,
        collection_time: collectionTime,
        delivery_address: deliveryAddress,
        items: cart.map(item => ({
          menu_item_id: item.menuItem.id,
          quantity: item.quantity,
          notes: item.notes
        }))
      });
      
      notify("success", `${orderType} order created successfully!`);
      onOrderCreated(order);
      onOpenChange(false);
      
      // Reset form
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setCollectionTime("");
      setDeliveryAddress("");
    } catch (e) {
      notify("error", "Failed to create order");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden bg-gray-50 border-0 rounded-2xl shadow-2xl">
        <DialogHeader className="p-6 pb-4 bg-white border-b shrink-0 flex items-center justify-center relative">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            {orderType === "TAKEAWAY" && <ShoppingBag className="h-6 w-6 text-green-600" />}
            {orderType === "PICKUP" && <Clock className="h-6 w-6 text-orange-600" />}
            {orderType === "DELIVERY" && <MapPin className="h-6 w-6 text-blue-600" />}
            New {orderType.charAt(0) + orderType.slice(1).toLowerCase()} Order
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Configuration & Menu */}
          <div className="flex-1 flex flex-col border-r bg-white overflow-y-auto">
            <div className="p-6 space-y-8">


              {/* Customer Details Form */}
              {orderType !== "TAKEAWAY" && (
                <section className="space-y-4 bg-gray-50 p-5 rounded-xl border border-gray-100">
                  <h3 className="font-semibold text-gray-800 mb-2">{t("pos.customerDetails")}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Name *</Label>
                      <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder={t("pos.name")} />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone *</Label>
                      <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder={t("pos.phone")} />
                    </div>
                    {orderType === "PICKUP" && (
                      <div className="space-y-2 col-span-2">
                        <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Collection Time *</Label>
                        <Input type="time" value={collectionTime} onChange={e => setCollectionTime(e.target.value)} />
                      </div>
                    )}
                    {orderType === "DELIVERY" && (
                      <div className="space-y-2 col-span-2">
                        <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Delivery Address *</Label>
                        <Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder={t("pos.deliveryAddress")} />
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Menu Grid */}
              <section>
                <div className="flex justify-between items-end mb-4">
                  <h3 className="font-semibold text-gray-800 text-lg">{t("pos.menu")}</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {menuItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className="text-left p-3 rounded-xl border bg-white hover:border-green-500 hover:shadow-md transition-all group flex gap-3 h-24 items-center overflow-hidden"
                    >
                      {item.image_url ? (
                        <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-gray-100">
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 shrink-0 rounded-lg bg-green-50 flex items-center justify-center text-green-200">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                      )}
                      <div className="flex flex-col justify-center h-full flex-1 min-w-0">
                        <span className="font-medium text-gray-800 line-clamp-2 group-hover:text-green-700 leading-tight mb-1 text-sm pr-1">{item.name}</span>
                        <span className="text-gray-500 text-sm font-semibold mt-auto">RM {item.price.toFixed(2)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* Right Panel: Cart */}
          <div className="w-[400px] bg-gray-50 flex flex-col shrink-0 border-l">
            <div className="p-6 pb-2 border-b bg-white">
              <h2 className="text-xl font-bold text-gray-800 flex items-center justify-between">
                Current Order
                <span className="bg-gray-100 text-gray-600 text-sm px-2 py-1 rounded-full">{cart.reduce((a,b)=>a+b.quantity,0)} items</span>
              </h2>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 py-20">
                  <ShoppingBag className="w-16 h-16 opacity-20" />
                  <p>{t("pos.emptyCart")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.menuItem.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-gray-800">{item.menuItem.name}</span>
                        <span className="font-medium text-gray-900">RM {(item.menuItem.price * item.quantity).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1 border">
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => updateQuantity(item.menuItem.id, -1)}>
                            {item.quantity === 1 ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                          </Button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => updateQuantity(item.menuItem.id, 1)}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="p-6 bg-white border-t shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.05)]">
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-500">
                  <span>{t("customer.subtotal")}</span>
                  <span>RM {totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-xl text-gray-900 pt-3 border-t">
                  <span>{t("pos.payableTotal")}</span>
                  <span>RM {(totalAmount * 1.166).toFixed(2)} <span className="text-xs text-gray-400 font-normal">{t("pos.estTax")}</span></span>
                </div>
              </div>
              <Button 
                className="w-full h-14 text-lg font-semibold rounded-xl" 
                onClick={handleSubmit}
                disabled={cart.length === 0 || isSubmitting}
                size="lg"
              >
                {isSubmitting ? "Processing..." : `Checkout Order`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
