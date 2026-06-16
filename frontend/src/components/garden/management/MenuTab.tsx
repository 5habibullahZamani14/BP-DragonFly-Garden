import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  fetchMenu, fetchCategories,
  createMenuItem, updateMenuItem, deleteMenuItem, uploadMenuItemImage,
  createCategory, updateCategory, deleteCategory, reorderCategories,
  type MenuItem, type Category,
} from "@/lib/api";
import { Plus, Edit2, Trash2, Tag, Star, Image as ImageIcon, RotateCw, FlipHorizontal, ZoomIn, ZoomOut, ChevronUp, ChevronDown, Layers, Check, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import Cropper, { ReactCropperElement } from "react-cropper";
import "cropperjs/dist/cropper.css";
import { useRef } from "react";
import { useWebSocket } from "@/lib/useWebSocket";

export function MenuTab() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ── Menu item dialog
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const cropperRef = useRef<ReactCropperElement>(null);

  // ── Sections (category) state
  const [activeSection, setActiveSection] = useState<string | undefined>(undefined);
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  // Item assignment per category: categoryId -> Set of item ids to be in it
  const [assignDraft, setAssignDraft] = useState<Record<number, Set<number>>>({});
  const [assignSaving, setAssignSaving] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useWebSocket(["MENU_UPDATE"], () => {
    loadData();
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [menuData, catData] = await Promise.all([fetchMenu(), fetchCategories()]);
      setItems(menuData);
      setCategories(catData);
    } catch (e) {
      toast.error(t("m.loadMenuFailed"));
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Sections handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateSection = async () => {
    if (!newSectionName.trim()) return;
    try {
      await createCategory(newSectionName.trim());
      setNewSectionName("");
      setAddingSection(false);
      toast.success("Section created");
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create section";
      toast.error(msg.includes("409") ? "A section with that name already exists" : msg);
    }
  };

  const handleRenameSection = async (id: number) => {
    if (!renameValue.trim()) return;
    try {
      await updateCategory(id, { name: renameValue.trim() });
      setRenamingId(null);
      setRenameValue("");
      toast.success("Section renamed");
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to rename";
      toast.error(msg.includes("409") ? "A section with that name already exists" : msg);
    }
  };

  const handleDeleteSection = async () => {
    if (!deletingCategory) return;
    try {
      await deleteCategory(deletingCategory.id);
      setDeletingCategory(null);
      toast.success("Section deleted. Items moved to Uncategorised.");
      loadData();
    } catch {
      toast.error("Failed to delete section");
    }
  };

  const handleMoveSection = async (index: number, dir: "up" | "down") => {
    const sorted = [...categories].sort((a, b) => a.display_order - b.display_order);
    const swapIdx = dir === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const newOrder = sorted.map((c, i) => {
      if (i === index) return { id: c.id, display_order: sorted[swapIdx].display_order };
      if (i === swapIdx) return { id: c.id, display_order: sorted[index].display_order };
      return { id: c.id, display_order: c.display_order };
    });
    try {
      await reorderCategories(newOrder);
      loadData();
    } catch {
      toast.error("Failed to reorder");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Item assignment handlers
  // ─────────────────────────────────────────────────────────────────────────

  /** When a category accordion opens, initialise the draft with its current items. */
  const initAssignDraft = (catId: number) => {
    const current = new Set(items.filter(i => i.category_id === catId).map(i => i.id));
    setAssignDraft(prev => ({ ...prev, [catId]: current }));
  };

  const toggleItemAssign = (catId: number, itemId: number) => {
    setAssignDraft(prev => {
      const next = new Set(prev[catId] ?? []);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return { ...prev, [catId]: next };
    });
  };

  const saveAssignments = async (catId: number) => {
    setAssignSaving(catId);
    const draft = assignDraft[catId] ?? new Set<number>();
    try {
      // Find items that need to be moved INTO this category
      const toAdd = items.filter(i => draft.has(i.id) && i.category_id !== catId);
      // Find items that need to be moved OUT (back to their previous category — we can't know
      // the old one, so we just ensure they're not in this category by assigning Uncategorised
      // if needed. Actually: we only control what goes in. Items ticked → move to this category.
      // Items un-ticked that were previously in this category → we need a destination.
      // Simplest: if unticked from this category, move to "Uncategorised" only if they have no other destination.)
      const toRemove = items.filter(i => !draft.has(i.id) && i.category_id === catId);

      // Apply moves in parallel
      const updates: Promise<unknown>[] = [
        ...toAdd.map(item => updateMenuItem(item.id, { category_id: catId })),
        ...toRemove.map(async item => {
          // Find first available category that is not this one
          const fallback = categories.find(c => c.id !== catId);
          if (fallback) await updateMenuItem(item.id, { category_id: fallback.id });
        }),
      ];
      await Promise.all(updates);
      toast.success("Assignments saved");
      loadData();
    } catch {
      toast.error("Failed to save assignments");
    } finally {
      setAssignSaving(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Menu item handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!editingItem?.name || !editingItem?.price || !editingItem?.category_id) {
      toast.error(t("m.fillRequired"));
      return;
    }
    try {
      let finalItemId = editingItem.id;
      if (editingItem.id) {
        await updateMenuItem(editingItem.id, editingItem as any);
        toast.success(t("m.itemUpdated"));
      } else {
        const res = await createMenuItem(editingItem as any) as any;
        finalItemId = res.id;
        toast.success(t("m.itemCreated"));
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
      toast.error(t("m.saveFailed"));
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.onload = () => { setImageSrc(reader.result as string); };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("m.confirmDelete"))) return;
    try {
      await deleteMenuItem(id);
      toast.success(t("m.itemDeleted"));
      loadData();
    } catch (e) {
      toast.error(t("m.deleteFailed"));
    }
  };

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...categories].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="space-y-8 animate-fade-up" dir={i18n.dir()}>

      {/* ══ SECTIONS MANAGEMENT ══════════════════════════════════════════════ */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-lg leading-none">Menu Sections</h3>
              <p className="text-sm text-muted-foreground mt-1">Create, rename, reorder sections and assign items to them</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => setAddingSection(v => !v)}
          >
            <Plus className="h-4 w-4" /> Add Section
          </Button>
        </div>

        {/* Add new section inline form */}
        {addingSection && (
          <div className="px-6 py-4 border-b bg-accent/5 flex gap-3 items-center">
            <Input
              autoFocus
              placeholder="New section name…"
              value={newSectionName}
              onChange={e => setNewSectionName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreateSection(); if (e.key === "Escape") setAddingSection(false); }}
              className="max-w-xs"
            />
            <Button size="sm" onClick={handleCreateSection} disabled={!newSectionName.trim()}>Create</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAddingSection(false); setNewSectionName(""); }}>Cancel</Button>
          </div>
        )}

        {loading ? (
          <div className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading sections…</div>
        ) : sorted.length === 0 ? (
          <div className="px-6 py-8 text-center text-muted-foreground">No sections yet. Click "Add Section" to create one.</div>
        ) : (
          <Accordion
            type="single"
            collapsible
            value={activeSection}
            onValueChange={v => {
              setActiveSection(v);
              if (v) {
                const cat = categories.find(c => String(c.id) === v);
                if (cat) initAssignDraft(cat.id);
              }
            }}
          >
            {sorted.map((cat, index) => {
              const catItems = items.filter(i => i.category_id === cat.id);
              const draft = assignDraft[cat.id];
              return (
                <AccordionItem key={cat.id} value={String(cat.id)} className="border-b last:border-0">
                  <div className="flex items-center gap-2 px-4 py-1">
                    {/* Reorder arrows */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => handleMoveSection(index, "up")}
                        aria-label="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                        disabled={index === sorted.length - 1}
                        onClick={() => handleMoveSection(index, "down")}
                        aria-label="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Category name / rename */}
                    <div className="flex-1 min-w-0">
                      {renamingId === cat.id ? (
                        <div className="flex gap-2 items-center">
                          <Input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleRenameSection(cat.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            className="h-7 text-sm max-w-[200px]"
                          />
                          <Button size="sm" className="h-7 px-3" onClick={() => handleRenameSection(cat.id)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRenamingId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <AccordionTrigger className="py-3 hover:no-underline [&>svg]:hidden w-full text-left">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-semibold truncate">{cat.name}</span>
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full shrink-0">{catItems.length} items</span>
                          </div>
                        </AccordionTrigger>
                      )}
                    </div>

                    {/* Action buttons */}
                    {renamingId !== cat.id && (
                      <div className="flex gap-1 shrink-0 ml-2">
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => { setRenamingId(cat.id); setRenameValue(cat.name); }}
                          title="Rename"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeletingCategory(cat)}
                          title="Delete section"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Item assignment panel */}
                  <AccordionContent className="px-6 pb-5 pt-1 border-t bg-muted/20">
                    <p className="text-xs text-muted-foreground mb-3">
                      Tick the items that should belong to this section. Un-ticking will move items to the nearest other section.
                    </p>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No menu items yet.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                          {[...items].sort((a, b) => a.name.localeCompare(b.name)).map(item => {
                            const checked = draft ? draft.has(item.id) : item.category_id === cat.id;
                            return (
                              <label
                                key={item.id}
                                className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all select-none ${
                                  checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="accent-primary h-4 w-4 shrink-0"
                                  checked={checked}
                                  onChange={() => toggleItemAssign(cat.id, item.id)}
                                />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{item.name}</p>
                                  <p className="text-[0.68rem] text-muted-foreground truncate">
                                    {item.category_id !== cat.id
                                      ? `Currently in: ${categories.find(c => c.id === item.category_id)?.name ?? "?"}`
                                      : "In this section"}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                        <Button
                          className="mt-4"
                          size="sm"
                          disabled={assignSaving === cat.id}
                          onClick={() => saveAssignments(cat.id)}
                        >
                          {assignSaving === cat.id ? "Saving…" : "Save assignments"}
                        </Button>
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>

      {/* ══ MENU ITEMS GRID ══════════════════════════════════════════════════ */}
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t("m.menuMgmt")}</h2>
            <p className="text-sm text-gray-500">{t("m.menuMgmtDesc")}</p>
          </div>
          <Button onClick={() => { setImageSrc(null); setEditingItem({ is_available: true, price: 0 }); setIsDialogOpen(true); }}>
            <Plus className="me-2 h-4 w-4" /> {t("m.addMenuItem")}
          </Button>
        </div>

        <div className="flex gap-4 items-center mb-4">
          <Input
            placeholder={t("m.searchMenuItems")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md bg-white shadow-sm"
          />
        </div>

        {loading ? (
          <div className="text-center py-12"><p className="text-gray-500 animate-pulse">{t("m.loadingMenu")}</p></div>
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
                  <div className="absolute top-2 end-2 flex gap-1">
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
      </div>

      {/* ══ DELETE SECTION CONFIRMATION DIALOG ═══════════════════════════════ */}
      <Dialog open={!!deletingCategory} onOpenChange={open => { if (!open) setDeletingCategory(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Delete Section
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{deletingCategory?.name}"</strong>?
              <br /><br />
              The items inside this section will <strong>not</strong> be deleted. They will be moved to <strong>"Uncategorised"</strong> so you can reassign them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletingCategory(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSection}>Delete Section</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ MENU ITEM EDIT DIALOG ════════════════════════════════════════════ */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" dir={i18n.dir()}>
          <DialogHeader>
            <DialogTitle>{editingItem?.id ? t("m.editMenuItem") : t("m.newMenuItem")}</DialogTitle>
            <DialogDescription>{t("m.menuDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("m.itemName")}</Label>
              <Input value={editingItem?.name || ''} onChange={e => setEditingItem(prev => ({...prev, name: e.target.value}))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("m.price")}</Label>
                <Input type="number" step="0.01" value={editingItem?.price || ''} onChange={e => setEditingItem(prev => ({...prev, price: parseFloat(e.target.value)}))} />
              </div>
              <div className="grid gap-2">
                <Label>{t("m.category")}</Label>
                <Select
                  value={editingItem?.category_id?.toString()}
                  onValueChange={v => setEditingItem(prev => ({...prev, category_id: parseInt(v)}))}
                >
                  <SelectTrigger><SelectValue placeholder={t("m.selectCategory")} /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("m.description")}</Label>
              <Input value={editingItem?.description || ''} onChange={e => setEditingItem(prev => ({...prev, description: e.target.value}))} />
            </div>

            <div className="grid gap-2">
              <div className="flex flex-col gap-1">
                <Label>{t("m.menuImage")}</Label>
                <p className="text-[0.7rem] text-gray-500 leading-tight text-start">{t("m.menuImageHelp")}</p>
              </div>
              {!imageSrc ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 mt-1">
                  {editingItem?.image_url && <img src={editingItem.image_url} alt={t("m.currentImage")} className="h-24 object-contain mb-2 rounded shadow-sm" />}
                  <Input type="file" accept="image/*" onChange={onFileChange} className="max-w-[250px]" />
                  <p className="text-xs text-gray-500">{t("m.selectImageDevice")}</p>
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
                      checkOrientation={false}
                    />
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.cropper.rotate(90)}>
                      <RotateCw className="h-4 w-4 me-2" /> {t("m.rotate")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      const cropper = cropperRef.current?.cropper;
                      if (cropper) {
                        const currentScaleX = cropper.getData().scaleX || 1;
                        cropper.scaleX(currentScaleX === 1 ? -1 : 1);
                      }
                    }}>
                      <FlipHorizontal className="h-4 w-4 me-2" /> {t("m.flip")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.cropper.zoom(0.1)}>
                      <ZoomIn className="h-4 w-4 me-2" /> {t("m.zoomIn")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.cropper.zoom(-0.1)}>
                      <ZoomOut className="h-4 w-4 me-2" /> {t("m.zoomOut")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => setImageSrc(null)}>
                      <Trash2 className="h-4 w-4 me-2" /> {t("m.cancelImage")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100 mt-2 text-start">
              <h4 className="font-semibold text-sm text-gray-900 border-b pb-2">{t("m.manualOverrides")}</h4>

              <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <Label>{t("m.available")}</Label>
                  <p className="text-xs text-gray-500">{t("m.availableDesc")}</p>
                </div>
                <Switch className="shrink-0" checked={editingItem?.is_available || false} onCheckedChange={c => setEditingItem(prev => ({...prev, is_available: c}))} />
              </div>

              <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <Label>{t("m.markPopular")}</Label>
                  <p className="text-xs text-gray-500">{t("m.markPopularDesc")}</p>
                </div>
                <Switch className="shrink-0" checked={editingItem?.is_popular || false} onCheckedChange={c => setEditingItem(prev => ({...prev, is_popular: c}))} />
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Label>{t("m.activePromo")}</Label>
                    <p className="text-xs text-gray-500">{t("m.activePromoDesc")}</p>
                  </div>
                  <Switch className="shrink-0" checked={editingItem?.is_promo || false} onCheckedChange={c => setEditingItem(prev => ({...prev, is_promo: c}))} />
                </div>
                {editingItem?.is_promo && (
                  <div className="grid gap-2 pt-2 animate-in fade-in slide-in-from-top-2">
                    <Label>{t("m.promoBadgeLabel")}</Label>
                    <Input
                      placeholder={t("m.promoBadgePlaceholder")}
                      value={editingItem?.promo_label || ''}
                      onChange={e => setEditingItem(prev => ({...prev, promo_label: e.target.value}))}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t("m.cancel")}</Button>
            <Button onClick={handleSave}>{t("m.saveItem")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
