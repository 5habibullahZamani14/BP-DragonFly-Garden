import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchInventory, createInventoryItem, updateInventoryStock, fetchRecipes, updateRecipe, fetchMenuItems } from "@/lib/api";
import { Package, UtensilsCrossed, AlertTriangle, Plus, Save } from "lucide-react";

export const InventoryTab = () => {
  const [activeSubTab, setActiveSubTab] = useState<"stock" | "recipes">("stock");
  
  // Stock State
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "Vegetables", unit: "kg", current_stock: "", max_stock: "100", low_stock_threshold_percent: "15" });

  // Recipe State
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [selectedMenuItem, setSelectedMenuItem] = useState<number | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

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

  const handleCreateItem = async () => {
    try {
      await createInventoryItem({
        ...newItem,
        current_stock: parseFloat(newItem.current_stock) || 0,
        max_stock: parseFloat(newItem.max_stock) || 100,
        low_stock_threshold_percent: parseFloat(newItem.low_stock_threshold_percent) || 15
      });
      setIsAddingItem(false);
      setNewItem({ name: "", category: "Vegetables", unit: "kg", current_stock: "", max_stock: "100", low_stock_threshold_percent: "15" });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStock = async (id: number, current_stock: number, max_stock: number) => {
    try {
      await updateInventoryStock(id, { current_stock, max_stock });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const selectRecipe = (menuItemId: number) => {
    setSelectedMenuItem(menuItemId);
    const existingRecipe = recipes.find(r => r.id === menuItemId);
    if (existingRecipe) {
      setEditingRecipe([...existingRecipe.ingredients]);
    } else {
      setEditingRecipe([]);
    }
  };

  const handleAddIngredientToRecipe = () => {
    if (inventory.length === 0) return;
    setEditingRecipe([...editingRecipe, { inventory_item_id: inventory[0].id, quantity_required: 1 }]);
  };

  const updateIngredientInRecipe = (index: number, field: string, value: any) => {
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
        inventory_item_id: parseInt(ing.inventory_item_id),
        quantity_required: parseFloat(ing.quantity_required)
      })));
      setSelectedMenuItem(null);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading inventory...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Package className="h-6 w-6 text-orange-600" />
          Inventory Management
        </h2>
      </div>

      <div className="flex gap-4 border-b border-gray-200 pb-2">
        <button 
          className={\`px-4 py-2 font-medium text-sm rounded-t-lg \${activeSubTab === "stock" ? "bg-orange-100 text-orange-700" : "text-gray-500 hover:text-gray-700"}\`}
          onClick={() => setActiveSubTab("stock")}
        >
          Raw Stock
        </button>
        <button 
          className={\`px-4 py-2 font-medium text-sm rounded-t-lg \${activeSubTab === "recipes" ? "bg-orange-100 text-orange-700" : "text-gray-500 hover:text-gray-700"}\`}
          onClick={() => setActiveSubTab("recipes")}
        >
          Menu Recipes
        </button>
      </div>

      {activeSubTab === "stock" && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => setIsAddingItem(!isAddingItem)} className="bg-orange-600 hover:bg-orange-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> Add Inventory Item
            </Button>
          </div>

          {isAddingItem && (
            <Card className="border-orange-200 shadow-md">
              <CardHeader>
                <CardTitle>New Inventory Item</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Item Name</Label>
                    <Input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="e.g. Tomatoes" />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                      <option value="Vegetables">Vegetables</option>
                      <option value="Meat">Meat</option>
                      <option value="Dairy">Dairy</option>
                      <option value="Dry Goods">Dry Goods</option>
                      <option value="Packaging">Packaging</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Unit of Measurement</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})}>
                      <option value="kg">Kilograms (kg)</option>
                      <option value="g">Grams (g)</option>
                      <option value="L">Liters (L)</option>
                      <option value="ml">Milliliters (ml)</option>
                      <option value="pcs">Pieces (pcs)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Current Stock</Label>
                    <Input type="number" value={newItem.current_stock} onChange={e => setNewItem({...newItem, current_stock: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Capacity (100%)</Label>
                    <Input type="number" value={newItem.max_stock} onChange={e => setNewItem({...newItem, max_stock: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Low Stock Warning Threshold (%)</Label>
                    <Input type="number" value={newItem.low_stock_threshold_percent} onChange={e => setNewItem({...newItem, low_stock_threshold_percent: e.target.value})} />
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={handleCreateItem} className="bg-orange-600 hover:bg-orange-700 text-white flex-1">Save Item</Button>
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
                <Card key={item.id} className={\`border-l-4 \${isLow ? 'border-l-red-500 bg-red-50' : 'border-l-green-500'}\`}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{item.name}</CardTitle>
                        <CardDescription>{item.category}</CardDescription>
                      </div>
                      {isLow && <AlertTriangle className="h-5 w-5 text-red-500" />}
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
                          <div className={\`h-2.5 rounded-full \${isLow ? 'bg-red-500' : 'bg-green-500'}\`} style={{ width: \`\${percent}%\` }}></div>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Input 
                          type="number" 
                          className="w-24"
                          placeholder="Amount" 
                          id={\`restock-\${item.id}\`}
                          defaultValue={item.current_stock}
                        />
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            const val = parseFloat((document.getElementById(\`restock-\${item.id}\`) as HTMLInputElement).value);
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
        </div>
      )}

      {activeSubTab === "recipes" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-2">
            <h3 className="font-bold text-gray-700 mb-4">Menu Items</h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
              {menuItems.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => selectRecipe(item.id)}
                  className={\`p-3 rounded-lg cursor-pointer border transition-colors \${selectedMenuItem === item.id ? 'bg-orange-100 border-orange-300 shadow-sm' : 'bg-white hover:bg-gray-50 border-gray-200'}\`}
                >
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <UtensilsCrossed className="h-3 w-3" />
                    {recipes.find(r => r.id === item.id)?.ingredients?.length || 0} ingredients
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
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
                              <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>
                            ))}
                          </select>
                          <Input 
                            type="number" 
                            className="w-24" 
                            value={ing.quantity_required}
                            onChange={(e) => updateIngredientInRecipe(idx, 'quantity_required', e.target.value)}
                          />
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
      )}
    </div>
  );
};
