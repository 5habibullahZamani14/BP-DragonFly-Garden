/*
 * InventoryTab.tsx — The supply chain management system.
 *
 * I designed this component to ensure the restaurant never runs out
 * of ingredients. It is divided into three distinct sub-sections:
 *
 *   1. Overview Analytics: I implemented a horizontal bar chart that
 *      sorts items by their stock health. This makes it instantly 
 *      obvious which items are reaching their critical thresholds.
 *
 *   2. Raw Stock Levels: This is the manual control center where 
 *      managers can log new deliveries or adjust stock counts.
 *
 *   3. Menu Recipes Builder: This is the most complex part of the system.
 *      I built a relational editor where managers link raw ingredients 
 *      to menu items. When an order is placed, the backend uses these 
 *      recipes to automatically deduct the correct gram/ml quantities 
 *      from the raw stock.
 */

import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { fetchInventory, createInventoryItem, updateInventoryStock, fetchRecipes, updateRecipe, fetchMenuItems } from "@/lib/api";
import type { InventoryItem, MenuItem, Recipe, RecipeIngredient } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { Package, UtensilsCrossed, AlertTriangle, Plus, Save, TrendingUp, Activity, Info, Pencil, Search } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

type EditableInventoryItem = Omit<InventoryItem, "current_stock" | "max_stock" | "low_stock_threshold_percent" | "usage_conversion"> & {
  current_stock: number | string;
  max_stock: number | string;
  low_stock_threshold_percent: number | string;
  usage_conversion?: number | string;
};

export const InventoryTab = ({
  initialSubTab = "overview",
  initialEditItemId,
  onInventoryChanged,
}: {
  initialSubTab?: "overview" | "stock" | "recipes",
  initialEditItemId?: number,
  onInventoryChanged?: () => void
}) => {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "stock" | "recipes">(initialSubTab);

  // Stock State
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "Vegetables", unit: "kg", usage_unit: "g", usage_conversion: "1000", current_stock: "", max_stock: "100", low_stock_threshold_percent: "15" });
  const [addWarning, setAddWarning] = useState<{ message: string, isExact: boolean } | null>(null);
  const [editingItem, setEditingItem] = useState<EditableInventoryItem | null>(null);

  // Recipe State
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedMenuItem, setSelectedMenuItem] = useState<number | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<RecipeIngredient[]>([]);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (initialSubTab) setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  const lastAppliedEditId = useRef<number | null>(null);

  useEffect(() => {
    if (initialEditItemId && inventory.length > 0 && lastAppliedEditId.current !== initialEditItemId) {
      const itemToEdit = inventory.find(i => i.id === initialEditItemId);
      if (itemToEdit) {
        setEditingItem(itemToEdit);
        lastAppliedEditId.current = initialEditItemId;
      }
    }
  }, [initialEditItemId, inventory]);

  const loadData = async () => {
    try {
      setLoading(true);
      const invData = await fetchInventory();
      setInventory(invData || []);

      const menuData = await fetchMenuItems("");
      setMenuItems(menuData || []);

      const recipeData = await fetchRecipes();
      setRecipes(recipeData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useWebSocket(["NEW_ORDER", "NEW_PAYMENT"], () => {
    // Inventory changes on order creation/payment
    loadData();
  });

  const handleCreateItem = async (force = false) => {
    setAddWarning(null);
    if (!newItem.name.trim()) {
      setAddWarning({ message: "Item name is required.", isExact: true });
      return;
    }

    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const newNameNorm = normalize(newItem.name);

    if (!force) {
      const exactDuplicate = inventory.find(item => normalize(item.name) === newNameNorm);
      if (exactDuplicate) {
        setAddWarning({ message: `An exact match ("${exactDuplicate.name}") already exists. This cannot be added.`, isExact: true });
        return;
      }

      const similarDuplicate = inventory.find(item => {
        const existingNameNorm = normalize(item.name);
        return (existingNameNorm.includes(newNameNorm) && newNameNorm.length >= 4) ||
          (newNameNorm.includes(existingNameNorm) && existingNameNorm.length >= 4);
      });

      if (similarDuplicate) {
        setAddWarning({ message: `An item that sounds similar ("${similarDuplicate.name}") already exists. Are you sure you want to proceed?`, isExact: false });
        return;
      }
    }

    try {
      await createInventoryItem({
        ...newItem,
        current_stock: parseFloat(newItem.current_stock) || 0,
        max_stock: parseFloat(newItem.max_stock) || 100,
        low_stock_threshold_percent: parseFloat(newItem.low_stock_threshold_percent) || 15,
        usage_unit: newItem.usage_unit,
        usage_conversion: parseFloat(newItem.usage_conversion) || 1
      });
      setIsAddingItem(false);
      setNewItem({ name: "", category: "Vegetables", unit: "kg", usage_unit: "g", usage_conversion: "1000", current_stock: "", max_stock: "100", low_stock_threshold_percent: "15" });
      await loadData();
      onInventoryChanged?.();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateFullItem = async () => {
    if (!editingItem) return;
    try {
      await updateInventoryStock(editingItem.id, {
        name: editingItem.name,
        category: editingItem.category,
        unit: editingItem.unit,
        usage_unit: editingItem.usage_unit,
        usage_conversion: parseFloat(String(editingItem.usage_conversion ?? 1)) || 1,
        current_stock: parseFloat(String(editingItem.current_stock)) || 0,
        max_stock: parseFloat(String(editingItem.max_stock)) || 100,
        low_stock_threshold_percent: parseFloat(String(editingItem.low_stock_threshold_percent)) || 15
      });
      setEditingItem(null);
      await loadData();
      onInventoryChanged?.();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStock = async (id: number, current_stock: number, max_stock: number) => {
    try {
      await updateInventoryStock(id, { current_stock, max_stock });
      await loadData();
      onInventoryChanged?.();
    } catch (e) {
      console.error(e);
    }
  };

  const selectRecipe = (menuItemId: number) => {
    setSelectedMenuItem(menuItemId);
    const existingRecipe = recipes.find(r => r.id === menuItemId);
    if (existingRecipe) {
        setEditingRecipe([...(existingRecipe.ingredients || [])]);
    } else {
      setEditingRecipe([]);
    }
  };

  const handleAddIngredientToRecipe = () => {
    if (inventory.length === 0) return;
    setEditingRecipe([...editingRecipe, { inventory_item_id: inventory[0].id, quantity_required: 1 }]);
  };

  const updateIngredientInRecipe = (index: number, field: keyof RecipeIngredient, value: string) => {
    const updated = [...editingRecipe];
    updated[index] = { ...updated[index], [field]: value };
    setEditingRecipe(updated);
  };

  const removeIngredientFromRecipe = (index: number) => {
    const updated = [...editingRecipe];
    updated.splice(index, 1);
    setEditingRecipe(updated);
  };

  const saveRecipe = async () => {
    if (!selectedMenuItem) return;
    try {
      await updateRecipe(selectedMenuItem, editingRecipe.map(ing => ({
        inventory_item_id: parseInt(String(ing.inventory_item_id)),
        quantity_required: parseFloat(String(ing.quantity_required))
      })));
      setSelectedMenuItem(null);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // --- Analytics Data Prep ---
  const { healthData, menuComplexityData } = useMemo(() => {
    const health = inventory.map(item => {
      const percent = Math.min(100, Math.max(0, (item.current_stock / item.max_stock) * 100));
      return {
        name: item.name,
        category: item.category,
        percent: parseFloat(percent.toFixed(1)),
        isLow: percent <= item.low_stock_threshold_percent,
        threshold: item.low_stock_threshold_percent
      };
    }).sort((a, b) => a.percent - b.percent);

    const complexity = menuItems.map(m => {
      const rec = recipes.find(r => r.id === m.id);
      return {
        name: m.name,
        ingredientsCount: rec?.ingredients?.length || 0
      };
    }).sort((a, b) => b.ingredientsCount - a.ingredientsCount).slice(0, 10);

    return { healthData: health, menuComplexityData: complexity };
  }, [inventory, menuItems, recipes]);


  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading inventory...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Package className="h-6 w-6 text-orange-600" />
          Inventory & Performance
        </h2>
      </div>

      <div className="flex gap-4 border-b border-gray-200 pb-2 overflow-x-auto">
        <button
          className={`px-4 py-2 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeSubTab === "overview" ? "bg-orange-100 text-orange-700" : "text-gray-500 hover:text-gray-700"}`}
          onClick={() => setActiveSubTab("overview")}
        >
          <Activity className="h-4 w-4 inline mr-2" />
          Overview Analytics
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeSubTab === "stock" ? "bg-orange-100 text-orange-700" : "text-gray-500 hover:text-gray-700"}`}
          onClick={() => setActiveSubTab("stock")}
        >
          <Package className="h-4 w-4 inline mr-2" />
          Raw Stock Levels
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeSubTab === "recipes" ? "bg-orange-100 text-orange-700" : "text-gray-500 hover:text-gray-700"}`}
          onClick={() => setActiveSubTab("recipes")}
        >
          <UtensilsCrossed className="h-4 w-4 inline mr-2" />
          Menu Recipes Builder
        </button>
      </div>

      {activeSubTab === "overview" && (
        <div className="space-y-6">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="help" className="border border-blue-200 bg-blue-50 rounded-xl overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-blue-100/50 text-blue-800 border-b-0">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Info className="h-4 w-4" /> Need help?
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-1 text-blue-800 text-sm leading-relaxed border-t border-blue-100">
                <p>This dashboard helps you visualize your supply chain at a glance. The <strong>Health Status</strong> chart on the left ranks your inventory from lowest percentage to highest, immediately highlighting what needs to be reordered. The <strong>Complexity</strong> chart on the right shows which menu items rely on the most ingredients, helping you identify supply bottlenecks.</p>
                <p className="pt-3 mt-3 border-t border-blue-200/50">
                  If you need more help about understanding how to use other features you can <button onClick={() => document.getElementById('global-help-btn')?.click()} className="underline font-bold hover:text-blue-900">click here</button>.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("m.invHealth")}</CardTitle>
                <CardDescription>Current stock levels as a percentage of maximum capacity (lowest first)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={healthData.slice(0, 15)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => [`${value}%`, 'Stock Level']} cursor={{ fill: 'transparent' }} />
                      <ReferenceLine x={20} stroke="red" strokeDasharray="3 3" label={{ position: 'top', value: 'Avg Threshold', fill: 'red', fontSize: 10 }} />
                      <Bar dataKey="percent" radius={[0, 4, 4, 0]} barSize={15}>
                        {healthData.slice(0, 15).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.isLow ? '#ef4444' : '#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-orange-500" /> Menu Complexity</CardTitle>
                <CardDescription>Top menu items by number of linked ingredients</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={menuComplexityData} margin={{ top: 20, right: 30, left: 0, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip formatter={(value: number) => [value, 'Ingredients']} cursor={{ fill: 'transparent' }} />
                      <Bar dataKey="ingredientsCount" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeSubTab === "stock" && (
        <div className="space-y-6">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="help" className="border border-blue-200 bg-blue-50 rounded-xl overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-blue-100/50 text-blue-800 border-b-0">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Info className="h-4 w-4" /> Need help?
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-1 text-blue-800 text-sm leading-relaxed border-t border-blue-100 space-y-2">
                <p>The system now handles unit math for you! Set your <strong>Purchase Unit</strong> (how you buy and store the item, e.g. "kg") and your <strong>Recipe Usage Unit</strong> (how you use it in dishes, e.g. "g"). Then, tell the system the conversion rate (e.g. 1 kg = 1000 g).</p>
                <p>When you build your recipes, you can just think in grams, and the system will automatically deduct the precise fraction of a kilogram from your stock!</p>
                <p className="pt-3 mt-3 border-t border-blue-200/50">
                  If you need more help about understanding how to use other features you can <button onClick={() => document.getElementById('global-help-btn')?.click()} className="underline font-bold hover:text-blue-900">click here</button>.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex justify-end">
            <Button onClick={() => setIsAddingItem(!isAddingItem)} className="bg-orange-600 hover:bg-orange-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> Add Inventory Item
            </Button>
          </div>

          {isAddingItem && (
            <Card className="border-orange-200 shadow-md">
              <CardHeader>
                <CardTitle>New Inventory Item</CardTitle>
                {addWarning && (
                  <div className={`border p-3 rounded-lg text-sm mt-2 flex flex-col gap-2 ${addWarning.isExact ? 'bg-red-50 border-red-200 text-red-700' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{addWarning.message}</span>
                    </div>
                    {!addWarning.isExact && (
                      <div className="flex gap-2 mt-1 ml-6">
                        <Button size="sm" variant="outline" className="bg-white border-orange-200 text-orange-800 hover:bg-orange-100" onClick={() => setAddWarning(null)}>Cancel</Button>
                        <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => handleCreateItem(true)}>Proceed Anyway</Button>
                      </div>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Item Name</Label>
                    <Input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="e.g. Tomatoes" />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })}>
                      <option value="Vegetables">Vegetables</option>
                      <option value="Meat">Meat</option>
                      <option value="Dairy">Dairy</option>
                      <option value="Dry Goods">Dry Goods</option>
                      <option value="Packaging">Packaging</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Purchase Unit (Stored As)</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })}>
                      <option value="kg">Kilograms (kg)</option>
                      <option value="g">Grams (g)</option>
                      <option value="L">Liters (L)</option>
                      <option value="ml">Milliliters (ml)</option>
                      <option value="pcs">Pieces (pcs)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Recipe Usage Unit</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newItem.usage_unit} onChange={e => setNewItem({ ...newItem, usage_unit: e.target.value })}>
                      <option value="g">Grams (g)</option>
                      <option value="kg">Kilograms (kg)</option>
                      <option value="ml">Milliliters (ml)</option>
                      <option value="L">Liters (L)</option>
                      <option value="pcs">Pieces (pcs)</option>
                      <option value="slice">Slices</option>
                      <option value="pinch">Pinches</option>
                    </select>
                  </div>
                  <div className="space-y-2 col-span-1 md:col-span-2 bg-green-50 p-3 rounded-lg border border-green-100 flex items-center justify-between">
                    <div className="text-sm font-medium text-green-800">Conversion Rate:</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-green-900">1 {newItem.unit} = </span>
                      <Input type="number" className="w-24 h-8" value={newItem.usage_conversion} onChange={e => setNewItem({ ...newItem, usage_conversion: e.target.value })} />
                      <span className="text-sm font-semibold text-green-900">{newItem.usage_unit}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("m.currStock")}</Label>
                    <Input type="number" value={newItem.current_stock} onChange={e => setNewItem({ ...newItem, current_stock: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Capacity (100%)</Label>
                    <Input type="number" value={newItem.max_stock} onChange={e => setNewItem({ ...newItem, max_stock: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Low Stock Warning Threshold (%)</Label>
                    <Input type="number" value={newItem.low_stock_threshold_percent} onChange={e => setNewItem({ ...newItem, low_stock_threshold_percent: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={() => handleCreateItem(false)} className="bg-orange-600 hover:bg-orange-700 text-white flex-1">{t("m.saveItem")}</Button>
                  <Button onClick={() => setIsAddingItem(false)} variant="outline" className="flex-1">Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inventory.map(item => {
              const percent = Math.min(100, Math.max(0, (item.current_stock / item.max_stock) * 100));
              const isLow = percent <= item.low_stock_threshold_percent;
              return (
                <Card key={item.id} className={`border-l-4 ${isLow ? 'border-l-red-500 bg-red-50' : 'border-l-green-500'}`}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{item.name}</CardTitle>
                        <CardDescription>{item.category}</CardDescription>
                      </div>
                      <div className="flex items-center gap-1 -mt-1 -mr-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-gray-100/80 rounded-full" onClick={() => setEditingItem(item)}>
                          <Pencil className="h-4 w-4 text-gray-500 hover:text-blue-600" />
                        </Button>
                        {isLow && <AlertTriangle className="h-5 w-5 text-red-500" />}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{Number(item.current_stock).toFixed(2)} {item.unit}</span>
                          <span className="text-gray-500">{percent.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div className={`h-2.5 rounded-full ${isLow ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Input
                          type="number"
                          className="w-24"
                          placeholder="Amount"
                          id={`restock-${item.id}`}
                          defaultValue={item.current_stock}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const val = parseFloat((document.getElementById(`restock-${item.id}`) as HTMLInputElement).value);
                            handleUpdateStock(item.id, val, item.max_stock);
                          }}
                        >
                          Update
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("m.editInvItem")}</DialogTitle>
              </DialogHeader>
              {editingItem && (
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Item Name</Label>
                      <Input value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editingItem.category} onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}>
                        <option value="Vegetables">Vegetables</option>
                        <option value="Meat">Meat</option>
                        <option value="Dairy">Dairy</option>
                        <option value="Dry Goods">Dry Goods</option>
                        <option value="Packaging">Packaging</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Purchase Unit</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editingItem.unit} onChange={e => setEditingItem({ ...editingItem, unit: e.target.value })}>
                        <option value="kg">Kilograms (kg)</option>
                        <option value="g">Grams (g)</option>
                        <option value="L">Liters (L)</option>
                        <option value="ml">Milliliters (ml)</option>
                        <option value="pcs">Pieces (pcs)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Recipe Usage Unit</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editingItem.usage_unit} onChange={e => setEditingItem({ ...editingItem, usage_unit: e.target.value })}>
                        <option value="g">Grams (g)</option>
                        <option value="kg">Kilograms (kg)</option>
                        <option value="ml">Milliliters (ml)</option>
                        <option value="L">Liters (L)</option>
                        <option value="pcs">Pieces (pcs)</option>
                        <option value="slice">Slices</option>
                        <option value="pinch">Pinches</option>
                      </select>
                    </div>
                    <div className="space-y-2 col-span-1 md:col-span-2 bg-green-50 p-3 rounded-lg border border-green-100 flex items-center justify-between">
                      <div className="text-sm font-medium text-green-800">Conversion Rate:</div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-green-900">1 {editingItem.unit} = </span>
                        <Input type="number" className="w-24 h-8" value={editingItem.usage_conversion} onChange={e => setEditingItem({ ...editingItem, usage_conversion: e.target.value })} />
                        <span className="text-sm font-semibold text-green-900">{editingItem.usage_unit}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("m.currStock")}</Label>
                      <Input type="number" value={editingItem.current_stock} onChange={e => setEditingItem({ ...editingItem, current_stock: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Capacity (100%)</Label>
                      <Input type="number" value={editingItem.max_stock} onChange={e => setEditingItem({ ...editingItem, max_stock: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Low Stock Warning Threshold (%)</Label>
                      <Input type="number" value={editingItem.low_stock_threshold_percent} onChange={e => setEditingItem({ ...editingItem, low_stock_threshold_percent: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
                    <Button onClick={handleUpdateFullItem} className="bg-orange-600 hover:bg-orange-700 text-white">Save Changes</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

        </div>
      )}

      {activeSubTab === "recipes" && (
        <div className="space-y-6">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="help" className="border border-blue-200 bg-blue-50 rounded-xl overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-blue-100/50 text-blue-800 border-b-0">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Info className="h-4 w-4" /> Need help?
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-1 text-blue-800 text-sm leading-relaxed border-t border-blue-100">
                <p>This is where you teach the system how to automatically deduct stock. Select a menu item from the left, then add the ingredients required to make it. <strong>Example:</strong> If you select "Mummy Farm Salad", you might add "Tomatoes" and set the quantity to "150". When a customer orders the salad, 150g of Tomatoes will vanish from your Raw Stock completely automatically.</p>
                <p className="pt-3 mt-3 border-t border-blue-200/50">
                  If you need more help about understanding how to use other features you can <button onClick={() => document.getElementById('global-help-btn')?.click()} className="underline font-bold hover:text-blue-900">click here</button>.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col space-y-3">
              <div className="flex items-center justify-between gap-4 mb-1">
                <h3 className="font-bold text-gray-700 whitespace-nowrap">Menu Items</h3>
                <div className="relative w-full max-w-[200px] xl:max-w-[300px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search dishes..."
                    className="pl-9 h-9 bg-white"
                    value={recipeSearchQuery}
                    onChange={(e) => setRecipeSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                {menuItems.filter(item => item.name.toLowerCase().includes(recipeSearchQuery.toLowerCase())).map(item => (
                  <div
                    key={item.id}
                    onClick={() => selectRecipe(item.id)}
                    className={`p-3 rounded-lg cursor-pointer border transition-colors flex items-center gap-3 ${selectedMenuItem === item.id ? 'bg-orange-100 border-orange-300 shadow-sm' : 'bg-white hover:bg-gray-50 border-gray-200'}`}
                  >
                    {item.image_url ? (
                      <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 bg-gray-100 shadow-sm">
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 bg-orange-50 flex items-center justify-center shadow-sm border border-orange-100">
                        <UtensilsCrossed className="h-5 w-5 text-orange-300" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{item.name}</div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <UtensilsCrossed className="h-3 w-3" />
                        {recipes.find(r => r.id === item.id)?.ingredients?.length || 0} ingredients
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="">
              {selectedMenuItem ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{menuItems.find(m => m.id === selectedMenuItem)?.name} Recipe</CardTitle>
                    <CardDescription>Define exactly what gets deducted from inventory when this is ordered.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {editingRecipe.length === 0 ? (
                      <div className="text-center p-6 bg-gray-50 rounded-lg text-gray-500 border border-dashed border-gray-300">
                        No ingredients defined for this item yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {editingRecipe.map((ing, idx) => (
                          <div key={idx} className="flex gap-3 items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <select
                              className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={ing.inventory_item_id}
                              onChange={(e) => updateIngredientInRecipe(idx, 'inventory_item_id', e.target.value)}
                            >
                              {inventory.map(inv => (
                                <option key={inv.id} value={inv.id}>{inv.name} ({inv.usage_unit || inv.unit})</option>
                              ))}
                            </select>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                className="w-24"
                                value={ing.quantity_required}
                                onChange={(e) => updateIngredientInRecipe(idx, 'quantity_required', e.target.value)}
                              />
                              <span className="text-sm font-medium text-gray-500 w-8">
                                {inventory.find(i => String(i.id) === String(ing.inventory_item_id))?.usage_unit ||
                                  inventory.find(i => String(i.id) === String(ing.inventory_item_id))?.unit}
                              </span>
                            </div>
                            <Button variant="destructive" size="icon" onClick={() => removeIngredientFromRecipe(idx)}>
                              &times;
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleAddIngredientToRecipe} className="flex-1 border-dashed">
                        <Plus className="h-4 w-4 mr-2" /> Add Ingredient
                      </Button>
                      <Button onClick={saveRecipe} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white">
                        <Save className="h-4 w-4 mr-2" /> Save Recipe
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <UtensilsCrossed className="h-16 w-16 mb-4 text-gray-300" />
                  <p>Select a menu item from the list to edit its recipe ingredients.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
