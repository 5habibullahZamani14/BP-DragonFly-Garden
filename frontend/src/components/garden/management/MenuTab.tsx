import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchMenu, fetchCategories, createMenuItem, updateMenuItem, deleteMenuItem, uploadMenuItemImage, type MenuItem } from "@/lib/api";
import { Plus, Edit2, Trash2, Tag, Star, Image as ImageIcon, RotateCw, FlipHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import Cropper, { ReactCropperElement } from "react-cropper";
import "cropperjs/dist/cropper.css";
import { useRef } from "react";

export function MenuTab() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<{id: number; name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const cropperRef = useRef<ReactCropperElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [menuData, catData] = await Promise.all([fetchMenu(), fetchCategories()]);
      setItems(menuData);
      setCategories(catData);
    } catch (e) {
      toast.error("Failed to load menu data");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingItem?.name || !editingItem?.price || !editingItem?.category_id) {
      toast.error("Please fill all required fields");
      return;
    }
    
    try {
      let finalItemId = editingItem.id;
      if (editingItem.id) {
        await updateMenuItem(editingItem.id, editingItem as any);
        toast.success("Menu item updated");
      } else {
        const res = await createMenuItem(editingItem as any) as any;
        finalItemId = res.id;
        toast.success("Menu item created");
      }

      if (imageSrc && cropperRef.current && cropperRef.current.cropper) {
        const canvas = cropperRef.current.cropper.getCroppedCanvas();
        if (canvas) {
          canvas.toBlob(async (blob) => {
            if (blob && finalItemId) {
              await uploadMenuItemImage(finalItemId, blob);
              loadData();
            }
          }, 'image/jpeg', 0.9);
        }
      } else {
        loadData();
      }

      setIsDialogOpen(false);
    } catch (e) {
      toast.error("Failed to save menu item");
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this menu item?")) return;
    try {
      await deleteMenuItem(id);
      toast.success("Menu item deleted");
      loadData();
    } catch (e) {
      toast.error("Failed to delete menu item");
    }
  };

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Menu Management</h2>
          <p className="text-sm text-gray-500">Manage dishes, prices, and manual promotions.</p>
        </div>
        <Button onClick={() => { setImageSrc(null); setEditingItem({ is_available: true, price: 0 }); setIsDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Menu Item
        </Button>
      </div>

      <div className="flex gap-4 items-center">
        <Input 
          placeholder="Search menu items..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md bg-white shadow-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-12"><p className="text-gray-500 animate-pulse">Loading menu...</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredItems.map(item => (
            <Card key={item.id} className={`overflow-hidden transition-all shadow-sm hover:shadow-md ${!item.is_available ? 'opacity-60 grayscale' : ''}`}>
              <div className="h-32 bg-gray-100 relative">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <ImageIcon className="h-8 w-8 opacity-50" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  {item.is_popular && <span className="bg-orange-100 text-orange-700 p-1.5 rounded-full shadow-sm"><Star className="h-3.5 w-3.5" /></span>}
                  {item.is_promo && <span className="bg-pink-100 text-pink-700 p-1.5 rounded-full shadow-sm"><Tag className="h-3.5 w-3.5" /></span>}
                </div>
              </div>
              <CardContent className="p-4 bg-white">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 line-clamp-1">{item.name}</h3>
                    <p className="text-xs text-gray-500 font-medium">{item.category_name}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-4">
                  <span className="font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded-md text-sm">RM {item.price.toFixed(2)}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setImageSrc(null); setEditingItem(item); setIsDialogOpen(true); }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem?.id ? 'Edit Menu Item' : 'New Menu Item'}</DialogTitle>
            <DialogDescription>
              Set pricing, categories, and manually override promotions.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name *</Label>
              <Input value={editingItem?.name || ''} onChange={e => setEditingItem(prev => ({...prev, name: e.target.value}))} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Price (RM) *</Label>
                <Input type="number" step="0.01" value={editingItem?.price || ''} onChange={e => setEditingItem(prev => ({...prev, price: parseFloat(e.target.value)}))} />
              </div>
              <div className="grid gap-2">
                <Label>Category *</Label>
                <Select 
                  value={editingItem?.category_id?.toString()} 
                  onValueChange={v => setEditingItem(prev => ({...prev, category_id: parseInt(v)}))}
                >
                  <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Description</Label>
              <Input value={editingItem?.description || ''} onChange={e => setEditingItem(prev => ({...prev, description: e.target.value}))} />
            </div>

            <div className="grid gap-2">
              <Label>Menu Image</Label>
              {!imageSrc ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2">
                  {editingItem?.image_url && <img src={editingItem.image_url} alt="Current" className="h-24 object-contain mb-2 rounded shadow-sm" />}
                  <Input type="file" accept="image/*" onChange={onFileChange} className="max-w-[250px]" />
                  <p className="text-xs text-gray-500">Select a local image (HD supported) to replace the current one.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative h-[300px] w-full bg-black rounded-xl overflow-hidden shadow-inner">
                    <Cropper
                      ref={cropperRef}
                      src={imageSrc}
                      style={{ height: "100%", width: "100%" }}
                      aspectRatio={4 / 3}
                      guides={true}
                      viewMode={1}
                      background={false}
                      responsive={true}
                      checkOrientation={false} // https://github.com/fengyuanchen/cropperjs/issues/671
                    />
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.cropper.rotate(90)}>
                      <RotateCw className="h-4 w-4 mr-2" /> Rotate
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      const cropper = cropperRef.current?.cropper;
                      if (cropper) {
                         const currentScaleX = cropper.getData().scaleX || 1;
                         cropper.scaleX(currentScaleX === 1 ? -1 : 1);
                      }
                    }}>
                      <FlipHorizontal className="h-4 w-4 mr-2" /> Flip
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.cropper.zoom(0.1)}>
                      <ZoomIn className="h-4 w-4 mr-2" /> Zoom In
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.cropper.zoom(-0.1)}>
                      <ZoomOut className="h-4 w-4 mr-2" /> Zoom Out
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => setImageSrc(null)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Cancel Image
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100 mt-2">
              <h4 className="font-semibold text-sm text-gray-900 border-b pb-2">Manual Overrides</h4>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Available</Label>
                  <p className="text-xs text-gray-500">Is this item currently available?</p>
                </div>
                <Switch checked={editingItem?.is_available || false} onCheckedChange={c => setEditingItem(prev => ({...prev, is_available: c}))} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Mark as Popular</Label>
                  <p className="text-xs text-gray-500">Manually override AI recommendations.</p>
                </div>
                <Switch checked={editingItem?.is_popular || false} onCheckedChange={c => setEditingItem(prev => ({...prev, is_popular: c}))} />
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Active Promotion</Label>
                    <p className="text-xs text-gray-500">Highlight this item with a promo badge.</p>
                  </div>
                  <Switch checked={editingItem?.is_promo || false} onCheckedChange={c => setEditingItem(prev => ({...prev, is_promo: c}))} />
                </div>
                {editingItem?.is_promo && (
                  <div className="grid gap-2 pt-2 animate-in fade-in slide-in-from-top-2">
                    <Label>Promo Badge Label</Label>
                    <Input 
                      placeholder="e.g. 20% OFF or NEW" 
                      value={editingItem?.promo_label || ''} 
                      onChange={e => setEditingItem(prev => ({...prev, promo_label: e.target.value}))} 
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
