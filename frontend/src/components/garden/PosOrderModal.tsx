import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createCounterOrder, fetchTables, type TableRecord } from "@/lib/api";
import type { MenuItem, Order } from "@/lib/api";
import { Plus, Minus, ShoppingBag, Trash2, Clock, MapPin, Phone, User, Check, Layers } from "lucide-react";

interface PosOrderModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialOrderType: "TAKEAWAY" | "PICKUP" | "DELIVERY" | "COUNTER";
  menuItems: MenuItem[];
  qrCode: string;
  notify: (kind: "success" | "error", text: string) => void;
  onOrderCreated: (order: Order) => void;
  parentOrder?: Order | null;
}

interface SelectedOption {
  groupId: number;
  groupName: string;
  optionId: number;
  optionLabel: string;
  priceDelta: number;
}

interface CartItem {
  cartKey: string;
  menuItem: MenuItem;
  quantity: number;
  notes: string;
  selectedOptions: SelectedOption[];
  effectivePrice: number;
}

export function PosOrderModal({ isOpen, onOpenChange, initialOrderType, menuItems, qrCode, notify, onOrderCreated, parentOrder = null }: PosOrderModalProps) {
  const { t } = useTranslation();
  const [orderType, setOrderType] = useState<"TAKEAWAY" | "PICKUP" | "DELIVERY" | "COUNTER">(initialOrderType);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [collectionTime, setCollectionTime] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number>(999);

  const [configuringItem, setConfiguringItem] = useState<MenuItem | null>(null);
  const [selectedGroupOptions, setSelectedGroupOptions] = useState<Record<number, { optionId: number; name: string; delta: number }[]>>({});

  useEffect(() => {
    if (isOpen) {
      fetchTables().then(setTables).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (parentOrder) {
        setOrderType(parentOrder.order_type as any);
        setSelectedTableId(parentOrder.table_id || 999);
      } else {
        setOrderType(initialOrderType);
        setSelectedTableId(999);
      }
    }
  }, [isOpen, initialOrderType, parentOrder]);

  const handleItemClick = (menuItem: MenuItem) => {
    if (menuItem.option_groups && menuItem.option_groups.length > 0) {
      const defaults: Record<number, { optionId: number; name: string; delta: number }[]> = {};
      menuItem.option_groups.forEach(group => {
        if (!group.is_multi_select && group.options && group.options.length > 0) {
          const opt = group.options[0];
          defaults[group.id] = [{ optionId: opt.id, name: opt.label, delta: opt.price_delta || 0 }];
        }
      });
      setSelectedGroupOptions(defaults);
      setConfiguringItem(menuItem);
    } else {
      addToCartWithDetails(menuItem, []);
    }
  };

  const addToCartWithDetails = (menuItem: MenuItem, selectedOptions: SelectedOption[]) => {
    const deltasSum = selectedOptions.reduce((sum, o) => sum + o.priceDelta, 0);
    const effectivePrice = menuItem.price + deltasSum;
    const cartKey = `${menuItem.id}-${selectedOptions.map(o => `${o.groupName}:${o.optionLabel}`).sort().join("|")}`;

    setCart(prev => {
      const existing = prev.find(item => item.cartKey === cartKey);
      if (existing) {
        return prev.map(item => item.cartKey === cartKey ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { cartKey, menuItem, quantity: 1, notes: "", selectedOptions, effectivePrice }];
    });
  };

  const confirmOptions = () => {
    if (!configuringItem) return;
    
    const options: SelectedOption[] = [];
    Object.entries(selectedGroupOptions).forEach(([groupIdStr, opts]) => {
      const group = (configuringItem.option_groups || []).find(g => g.id === parseInt(groupIdStr));
      if (group) {
        opts.forEach(o => {
          options.push({
            groupId: group.id,
            groupName: group.name,
            optionId: o.optionId,
            optionLabel: o.name,
            priceDelta: o.delta
          });
        });
      }
    });

    addToCartWithDetails(configuringItem, options);
    setConfiguringItem(null);
    setSelectedGroupOptions({});
  };

  const handleToggleOption = (groupId: number, isMultiSelect: boolean, option: any) => {
    setSelectedGroupOptions(prev => {
      const current = prev[groupId] || [];
      if (!isMultiSelect) {
        return {
          ...prev,
          [groupId]: [{ optionId: option.id, name: option.label, delta: option.price_delta || 0 }]
        };
      } else {
        const exists = current.some(o => o.optionId === option.id);
        if (exists) {
          return {
            ...prev,
            [groupId]: current.filter(o => o.optionId !== option.id)
          };
        } else {
          return {
            ...prev,
            [groupId]: [...current, { optionId: option.id, name: option.label, delta: option.price_delta || 0 }]
          };
        }
      }
    });
  };

  const updateQuantity = (cartKey: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartKey === cartKey) {
        const newQ = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQ };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.effectivePrice * item.quantity), 0);

  const handleSubmit = async () => {
    if (cart.length === 0) {
      notify("error", t("pos.cartEmpty"));
      return;
    }
    if (!parentOrder && orderType === "PICKUP") {
      if (!customerName.trim() || !customerPhone.trim() || !collectionTime.trim()) {
        notify("error", t("pos.pickupRequired"));
        return;
      }
    }
    if (!parentOrder && orderType === "DELIVERY") {
      if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
        notify("error", t("pos.deliveryRequired"));
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const order = await createCounterOrder(qrCode, {
        table_id: parentOrder ? parentOrder.table_id : (orderType === "COUNTER" ? selectedTableId : 999),
        order_type: orderType,
        customer_name: parentOrder ? parentOrder.customer_name : customerName,
        customer_phone: parentOrder ? parentOrder.customer_phone : customerPhone,
        collection_time: parentOrder ? parentOrder.collection_time : collectionTime,
        delivery_address: parentOrder ? parentOrder.delivery_address : deliveryAddress,
        parent_order_id: parentOrder?.id,
        items: cart.map(item => ({
          menu_item_id: item.menuItem.id,
          quantity: item.quantity,
          notes: item.notes,
          options: item.selectedOptions
        }))
      });
      
      notify("success", t("pos.orderCreatedSuccess", {
        orderType: 
          orderType === "TAKEAWAY" ? t("pos.orderTypeTakeaway")
            : orderType === "PICKUP" ? t("pos.orderTypePickup")
            : orderType === "DELIVERY" ? t("pos.orderTypeDelivery")
            : t("pos.orderTypeCounter", "Counter Order"),
      }));
      onOrderCreated(order);
      onOpenChange(false);
      
      // Reset form
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setCollectionTime("");
      setDeliveryAddress("");
    } catch (e) {
      notify("error", t("pos.orderCreateFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden bg-gray-50 border-0 rounded-2xl shadow-2xl">
          <DialogHeader className="p-6 pb-4 bg-white border-b shrink-0 flex items-center justify-center relative">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              {parentOrder ? (
                <>
                  <Plus className="h-6 w-6 text-green-600" />
                  Add-on items to Order #{parentOrder.id} ({parentOrder.order_type})
                </>
              ) : (
                <>
                  {orderType === "TAKEAWAY" && <ShoppingBag className="h-6 w-6 text-green-600" />}
                  {orderType === "PICKUP" && <Clock className="h-6 w-6 text-orange-600" />}
                  {orderType === "DELIVERY" && <MapPin className="h-6 w-6 text-blue-600" />}
                  {orderType === "COUNTER" && <Layers className="h-6 w-6 text-pink-600" />}
                  {t("pos.newOrderTitle", {
                    orderType: 
                      orderType === "TAKEAWAY" ? t("pos.orderTypeTakeaway")
                        : orderType === "PICKUP" ? t("pos.orderTypePickup")
                        : orderType === "DELIVERY" ? t("pos.orderTypeDelivery")
                        : t("pos.orderTypeCounter", "Counter Order"),
                  })}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel: Configuration & Menu */}
            <div className="flex-1 flex flex-col border-r bg-white overflow-y-auto">
              <div className="p-6 space-y-8">

                {/* Customer/Counter Details Form */}
                {!parentOrder && (orderType === "PICKUP" || orderType === "DELIVERY" || orderType === "COUNTER") && (
                  <section className="space-y-4 bg-gray-50 p-5 rounded-xl border border-gray-100">
                    <h3 className="font-semibold text-gray-800 mb-2">
                      {orderType === "COUNTER" ? t("pos.counterOrderDetails", "Counter Order Details") : t("pos.customerDetails")}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {orderType === "COUNTER" && (
                        <div className="space-y-2 col-span-2">
                          <Label className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-pink-600" /> {t("pos.tableNumber", "Table Number (Optional)")}</Label>
                          <select
                            value={selectedTableId}
                            onChange={(e) => setSelectedTableId(Number(e.target.value))}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value={999}>{t("pos.noTable", "No Table (At Counter)")}</option>
                            {tables
                              .filter(t => t.id !== 999 && t.table_number !== "Counter Order")
                              .map(t => (
                                <option key={t.id} value={t.id}>{t.table_number}</option>
                              ))
                            }
                          </select>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {t("pos.name")}</Label>
                        <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder={t("pos.name")} />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {t("pos.phone")}</Label>
                        <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder={t("pos.phone")} />
                      </div>
                      {orderType === "PICKUP" && (
                        <div className="space-y-2 col-span-2">
                          <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {t("pos.collectionTime")}</Label>
                          <Input type="time" value={collectionTime} onChange={e => setCollectionTime(e.target.value)} />
                        </div>
                      )}
                      {orderType === "DELIVERY" && (
                        <div className="space-y-2 col-span-2">
                          <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {t("pos.deliveryAddress")}</Label>
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
                        disabled={item.is_sold_out}
                        onClick={() => handleItemClick(item)}
                        className={`text-left p-3 rounded-xl border bg-white hover:border-green-500 hover:shadow-md transition-all group flex gap-3 h-24 items-center overflow-hidden relative ${item.is_sold_out ? 'opacity-50 grayscale cursor-not-allowed border-gray-200' : ''}`}
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
                          <span className="text-gray-500 text-sm font-semibold mt-auto font-mono">
                            {item.is_sold_out ? (
                              <span className="text-red-500 text-xs font-bold uppercase">{t("customer.soldOut")}</span>
                            ) : (
                              `RM ${item.price.toFixed(2)}`
                            )}
                          </span>
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
                  {t("pos.currentOrder")}
                  <span className="bg-gray-100 text-gray-600 text-sm px-2 py-1 rounded-full">{t("pos.cartItemCount", { count: cart.reduce((a, b) => a + b.quantity, 0) })}</span>
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
                      <div key={item.cartKey} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-800">{item.menuItem.name}</span>
                            {item.selectedOptions.length > 0 && (
                              <ul className="text-xs text-gray-400 list-disc pl-4 mt-1">
                                {item.selectedOptions.map((opt, idx) => (
                                  <li key={idx}>
                                    {opt.groupName}: {opt.optionLabel}{opt.priceDelta > 0 ? ` (+RM ${opt.priceDelta.toFixed(2)})` : ""}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <span className="font-medium text-gray-900 font-mono">RM {(item.effectivePrice * item.quantity).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1 border">
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => updateQuantity(item.cartKey, -1)}>
                              {item.quantity === 1 ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                            </Button>
                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => updateQuantity(item.cartKey, 1)}>
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
                  {isSubmitting ? t("common.processing") : t("pos.checkoutOrder")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Option Selection Dialog */}
      <Dialog open={!!configuringItem} onOpenChange={(open) => !open && setConfiguringItem(null)}>
        <DialogContent className="max-w-md w-[90vw] bg-white rounded-2xl shadow-xl p-6 border-0">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-800">
              {configuringItem?.name} - {t("menu.configure")}
            </DialogTitle>
          </DialogHeader>

          {configuringItem && (
            <div className="space-y-6 my-4 max-h-[60vh] overflow-y-auto pr-1">
              {(configuringItem.option_groups || []).map(group => (
                <div key={group.id} className="space-y-2 border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-700">{group.name}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                      {!group.is_multi_select ? t("menu.singleSelect") : t("menu.multiSelect")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(group.options || []).map((opt: any) => {
                      const selectedList = selectedGroupOptions[group.id] || [];
                      const isSelected = selectedList.some(o => o.optionId === opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleToggleOption(group.id, group.is_multi_select, opt)}
                          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm border font-medium transition-all ${
                            isSelected
                              ? "bg-green-50 text-green-700 border-green-500 shadow-sm"
                              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                          <span>{opt.label}</span>
                          {opt.price_delta > 0 && (
                            <span className="text-xs text-gray-400 font-mono font-normal">
                              +RM {opt.price_delta.toFixed(2)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="ghost" className="rounded-xl flex-1 h-12" onClick={() => { setConfiguringItem(null); setSelectedGroupOptions({}); }}>
              {t("common.cancel")}
            </Button>
            <Button className="rounded-xl flex-1 h-12" onClick={confirmOptions}>
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
