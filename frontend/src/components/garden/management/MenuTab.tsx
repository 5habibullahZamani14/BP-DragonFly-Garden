import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  fetchMenu, fetchCategories,
  createMenuItem, updateMenuItem, deleteMenuItem, uploadMenuItemImage,
  fetchPatterns, uploadMenuItemPatternImage,
  createCategory, updateCategory, deleteCategory, reorderCategories,
  fetchAllModifierGroups, fetchItemModifiers,
  createGlobalModifierGroup, updateGlobalModifierGroup, deleteGlobalModifierGroup,
  createGlobalModifierOption, updateGlobalModifierOption, deleteGlobalModifierOption,
  assignModifierToItem, unassignModifierFromItem, setModifierDefault,
  type MenuItem, type Category, type Pattern, type GlobalModifierGroup, type GlobalModifierOption,
} from "@/lib/api";
import {
  Plus, Edit2, Trash2, Tag, Star, Image as ImageIcon,
  RotateCw, FlipHorizontal, ZoomIn, ZoomOut, Layers,
  Check, AlertTriangle, Pencil, GripVertical, Settings2, X, ChevronDown, ChevronRight, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import Cropper, { ReactCropperElement } from "react-cropper";
import "cropperjs/dist/cropper.css";
import { useWebSocket } from "@/lib/useWebSocket";
import { PatternRepositoryTab } from "./PatternRepositoryTab";

// ───────────────────────────────────────────────────────────────────────────────
// VariationsEditor — Global modifier tag library
// Applied groups show as full editable cards; the rest show as clickable chips.
// Long-press on any chip reveals a global-delete button for that group.
// ───────────────────────────────────────────────────────────────────────────────

function VariationsEditor({ itemId }: { itemId: number }) {
  // All global modifier groups (from DB)
  const [allGroups, setAllGroups] = useState<GlobalModifierGroup[]>([]);
  // The subset currently assigned to this item (from DB)
  const [assignedGroupIds, setAssignedGroupIds] = useState<Set<number>>(new Set());
  // Per-item default option: groupId -> optionId | null
  const [defaults, setDefaults] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(true);

  // Which chip is "long-pressed" (shows delete button)
  const [longPressedId, setLongPressedId] = useState<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline editing states for options within an applied group
  const [addingOptionGroupId, setAddingOptionGroupId] = useState<number | null>(null);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [newOptionDelta, setNewOptionDelta] = useState("0");
  const [editingOptionId, setEditingOptionId] = useState<number | null>(null);
  const [editOptionLabel, setEditOptionLabel] = useState("");
  const [editOptionDelta, setEditOptionDelta] = useState("0");

  // Inline group rename
  const [renamingGroupId, setRenamingGroupId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Create-new-group form
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupRequired, setNewGroupRequired] = useState(true);
  const [newGroupMulti, setNewGroupMulti] = useState(false);

  useEffect(() => { load(); }, [itemId]);

  const load = async () => {
    setLoading(true);
    try {
      const [all, assigned] = await Promise.all([
        fetchAllModifierGroups(),
        fetchItemModifiers(itemId),
      ]);
      setAllGroups(all);
      setAssignedGroupIds(new Set(assigned.map(g => g.id)));
      const defs: Record<number, number | null> = {};
      assigned.forEach(g => { defs[g.id] = (g as any).default_option_id ?? null; });
      setDefaults(defs);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  };

  // ── Chip long-press handlers ───────────────────────────────────────────────
  const handleChipPointerDown = (id: number) => {
    longPressTimer.current = setTimeout(() => setLongPressedId(id), 600);
  };
  const handleChipPointerUp = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // ── Assign / unassign ─────────────────────────────────────────────────────
  const handleToggleAssignment = async (group: GlobalModifierGroup) => {
    if (longPressedId === group.id) { setLongPressedId(null); return; } // was long-pressing
    const isAssigned = assignedGroupIds.has(group.id);
    try {
      if (isAssigned) {
        await unassignModifierFromItem(itemId, group.id);
        setAssignedGroupIds(p => { const s = new Set(p); s.delete(group.id); return s; });
        setDefaults(p => { const d = { ...p }; delete d[group.id]; return d; });
      } else {
        await assignModifierToItem(itemId, group.id);
        setAssignedGroupIds(p => new Set([...p, group.id]));
        setDefaults(p => ({ ...p, [group.id]: null }));
      }
    } catch { toast.error("Failed to update modifier assignment"); }
  };

  // ── Default option ────────────────────────────────────────────────────────
  const handleSetDefault = async (groupId: number, optionId: number) => {
    const current = defaults[groupId];
    const next = current === optionId ? null : optionId; // toggle off if already default
    try {
      await setModifierDefault(itemId, groupId, next);
      setDefaults(p => ({ ...p, [groupId]: next }));
    } catch { toast.error("Failed to set default"); }
  };

  // ── Global group toggle flags ──────────────────────────────────────────────
  const handleToggleRequired = async (group: GlobalModifierGroup) => {
    const v = !group.is_required;
    try {
      await updateGlobalModifierGroup(group.id, { is_required: v });
      setAllGroups(p => p.map(g => g.id === group.id ? { ...g, is_required: v } : g));
    } catch { toast.error("Failed to update"); }
  };
  const handleToggleMulti = async (group: GlobalModifierGroup) => {
    const v = !group.is_multi_select;
    try {
      await updateGlobalModifierGroup(group.id, { is_multi_select: v });
      setAllGroups(p => p.map(g => g.id === group.id ? { ...g, is_multi_select: v } : g));
    } catch { toast.error("Failed to update"); }
  };

  // ── Rename group ──────────────────────────────────────────────────────────
  const handleRenameGroup = async (groupId: number) => {
    if (!renameValue.trim()) return;
    try {
      await updateGlobalModifierGroup(groupId, { name: renameValue.trim() });
      setAllGroups(p => p.map(g => g.id === groupId ? { ...g, name: renameValue.trim() } : g));
      setRenamingGroupId(null);
    } catch { toast.error("Failed to rename"); }
  };

  // ── Global delete (from chip long-press) ─────────────────────────────────
  const handleGlobalDelete = async (groupId: number) => {
    if (!confirm("Delete this modifier globally? It will be removed from ALL menu items.")) return;
    try {
      await deleteGlobalModifierGroup(groupId);
      setAllGroups(p => p.filter(g => g.id !== groupId));
      setAssignedGroupIds(p => { const s = new Set(p); s.delete(groupId); return s; });
      setLongPressedId(null);
      toast.success("Modifier deleted globally");
    } catch { toast.error("Failed to delete modifier"); }
  };

  // ── Options CRUD ──────────────────────────────────────────────────────────
  const handleCreateOption = async (groupId: number) => {
    if (!newOptionLabel.trim()) return;
    try {
      const opt = await createGlobalModifierOption(groupId, { label: newOptionLabel.trim(), price_delta: parseFloat(newOptionDelta) || 0 });
      setAllGroups(p => p.map(g => g.id === groupId ? { ...g, options: [...g.options, opt] } : g));
      setNewOptionLabel(""); setNewOptionDelta("0"); setAddingOptionGroupId(null);
    } catch { toast.error("Failed to add option"); }
  };
  const handleUpdateOption = async (optionId: number, groupId: number) => {
    try {
      await updateGlobalModifierOption(optionId, { label: editOptionLabel.trim(), price_delta: parseFloat(editOptionDelta) || 0 });
      setAllGroups(p => p.map(g => g.id === groupId ? {
        ...g, options: g.options.map(o => o.id === optionId ? { ...o, label: editOptionLabel.trim(), price_delta: parseFloat(editOptionDelta) || 0 } : o)
      } : g));
      setEditingOptionId(null);
    } catch { toast.error("Failed to update option"); }
  };
  const handleDeleteOption = async (optionId: number, groupId: number) => {
    try {
      await deleteGlobalModifierOption(optionId);
      setAllGroups(p => p.map(g => g.id === groupId ? { ...g, options: g.options.filter(o => o.id !== optionId) } : g));
      // Clear default if it was this option
      if (defaults[groupId] === optionId) {
        await setModifierDefault(itemId, groupId, null).catch(() => null);
        setDefaults(p => ({ ...p, [groupId]: null }));
      }
    } catch { toast.error("Failed to delete option"); }
  };

  // ── Create new global group ───────────────────────────────────────────────
  const handleCreateGlobalGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const g = await createGlobalModifierGroup({ name: newGroupName.trim(), is_required: newGroupRequired, is_multi_select: newGroupMulti });
      // Immediately assign it to this item too
      await assignModifierToItem(itemId, g.id);
      setAllGroups(p => [...p, g]);
      setAssignedGroupIds(p => new Set([...p, g.id]));
      setDefaults(p => ({ ...p, [g.id]: null }));
      setNewGroupName(""); setShowNewGroupForm(false);
      toast.success(`"${g.name}" created and applied to this item`);
    } catch (e: any) {
      toast.error(e?.message?.includes('already exists') ? 'A modifier with that name already exists' : "Failed to create modifier");
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground animate-pulse py-2">Loading modifiers…</p>;

  const assignedGroups = allGroups.filter(g => assignedGroupIds.has(g.id));
  const libraryGroups  = allGroups.filter(g => !assignedGroupIds.has(g.id));

  return (
    <div className="space-y-4" onClick={() => { if (longPressedId !== null) setLongPressedId(null); }}>

      {/* ── Applied groups ─────────────────────────────────────────────── */}
      {assignedGroups.length === 0 && (
        <p className="text-sm text-muted-foreground italic py-1">No modifiers applied. Tap a tag below or create a new one.</p>
      )}

      {assignedGroups.map(group => (
        <div key={group.id} className="border rounded-xl overflow-hidden bg-card shadow-sm">
          {/* Header row */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
            {renamingGroupId === group.id ? (
              <div className="flex flex-1 gap-2 items-center">
                <Input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameGroup(group.id); if (e.key === 'Escape') setRenamingGroupId(null); }}
                  className="h-7 text-sm" />
                <Button size="sm" className="h-7 px-2" onClick={() => handleRenameGroup(group.id)}><Check className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRenamingGroupId(null)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ) : (
              <span className="font-semibold text-sm flex-1 truncate">{group.name}</span>
            )}
            <div className="flex items-center gap-1 shrink-0">
              {/* Required / Optional toggle */}
              <button onClick={() => handleToggleRequired(group)}
                className={`text-[0.62rem] px-1.5 py-0.5 rounded-full font-medium border transition-colors ${
                  group.is_required ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"}`}>
                {group.is_required ? "Required" : "Optional"}
              </button>
              {/* Multi / Single toggle */}
              <button onClick={() => handleToggleMulti(group)}
                className={`text-[0.62rem] px-1.5 py-0.5 rounded-full font-medium border transition-colors ${
                  group.is_multi_select ? "bg-accent/20 text-accent-foreground border-accent/40" : "bg-muted text-muted-foreground border-border"}`}>
                {group.is_multi_select ? "Multi" : "Single"}
              </button>
              {/* Rename */}
              {renamingGroupId !== group.id && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                  onClick={() => { setRenamingGroupId(group.id); setRenameValue(group.name); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              {/* Unassign from this item only */}
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                title="Remove from this item (keeps modifier in library)"
                onClick={() => handleToggleAssignment(group)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Options */}
          <div className="px-3 py-2 space-y-1.5">
            {group.options.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No options yet. Add one below.</p>
            )}
            {group.options.map(opt => (
              <div key={opt.id} className="flex items-center gap-2 py-0.5">
                {editingOptionId === opt.id ? (
                  <>
                    <Input autoFocus value={editOptionLabel} onChange={e => setEditOptionLabel(e.target.value)}
                      placeholder="Label" className="h-7 text-sm flex-1" />
                    <Input type="number" step="0.01" value={editOptionDelta}
                      onChange={e => setEditOptionDelta(e.target.value)}
                      placeholder="+RM" className="h-7 text-sm w-20" />
                    <Button size="sm" className="h-7 px-2" onClick={() => handleUpdateOption(opt.id, group.id)}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingOptionId(null)}><X className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                    {/* ★ Default star button */}
                    <button
                      title={defaults[group.id] === opt.id ? "Remove as default" : "Set as default for this item"}
                      onClick={() => handleSetDefault(group.id, opt.id)}
                      className={`shrink-0 transition-colors ${ defaults[group.id] === opt.id ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-300" }`}>
                      <Star className="h-3.5 w-3.5 fill-current" />
                    </button>
                    <span className="text-sm flex-1 truncate">{opt.label}</span>
                    <span className={`text-xs font-medium shrink-0 ${ opt.price_delta > 0 ? "text-emerald-600" : "text-muted-foreground" }`}>
                      {opt.price_delta > 0 ? `+RM ${opt.price_delta.toFixed(2)}` : "Free"}
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                      onClick={() => { setEditingOptionId(opt.id); setEditOptionLabel(opt.label); setEditOptionDelta(String(opt.price_delta)); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive"
                      onClick={() => handleDeleteOption(opt.id, group.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}

            {/* Add option inline */}
            {addingOptionGroupId === group.id ? (
              <div className="flex gap-2 mt-2 flex-wrap">
                <Input autoFocus placeholder="Option label (e.g. Large)" value={newOptionLabel}
                  onChange={e => setNewOptionLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateOption(group.id); if (e.key === 'Escape') setAddingOptionGroupId(null); }}
                  className="h-7 text-sm flex-1 min-w-[120px]" />
                <Input type="number" step="0.01" placeholder="+RM" value={newOptionDelta}
                  onChange={e => setNewOptionDelta(e.target.value)}
                  className="h-7 text-sm w-20" />
                <Button size="sm" className="h-7" onClick={() => handleCreateOption(group.id)} disabled={!newOptionLabel.trim()}>Add</Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setAddingOptionGroupId(null)}>Cancel</Button>
              </div>
            ) : (
              <button className="text-xs text-primary flex items-center gap-1 mt-1 hover:underline"
                onClick={() => { setAddingOptionGroupId(group.id); setNewOptionLabel(""); setNewOptionDelta("0"); }}>
                <Plus className="h-3 w-3" /> Add option
              </button>
            )}
          </div>
        </div>
      ))}

      {/* ── Library tag strip ──────────────────────────────────────────────── */}
      {(libraryGroups.length > 0 || showNewGroupForm) && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Modifier Library — tap to apply
          </p>
          <div className="flex flex-wrap gap-2">
            {libraryGroups.map(group => (
              <div key={group.id} className="relative">
                <button
                  onPointerDown={() => handleChipPointerDown(group.id)}
                  onPointerUp={handleChipPointerUp}
                  onPointerLeave={handleChipPointerUp}
                  onClick={() => handleToggleAssignment(group)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-all select-none ${
                    longPressedId === group.id
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border bg-muted/60 text-foreground/70 hover:border-primary hover:text-primary"
                  }`}>
                  <Plus className="h-3 w-3 shrink-0" />
                  {group.name}
                  <span className="text-[0.58rem] text-muted-foreground">{group.options.length} opts</span>
                </button>
                {/* Global delete button (shown on long-press) */}
                {longPressedId === group.id && (
                  <button
                    onClick={e => { e.stopPropagation(); handleGlobalDelete(group.id); }}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center shadow-md z-10 hover:bg-red-700"
                    title="Delete globally">
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Create new global group ────────────────────────────────────────── */}
      {showNewGroupForm ? (
        <div className="border rounded-xl p-3 space-y-2 bg-accent/5">
          <p className="text-xs font-semibold text-muted-foreground">New modifier group (added to library + applied here)</p>
          <Input autoFocus placeholder="Group name (e.g. Size, Ice Level, Add-ons)"
            value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateGlobalGroup(); if (e.key === 'Escape') setShowNewGroupForm(false); }}
            className="h-8" />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={newGroupRequired} onChange={e => setNewGroupRequired(e.target.checked)} className="accent-primary" />
              Required (customer must choose)
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={newGroupMulti} onChange={e => setNewGroupMulti(e.target.checked)} className="accent-primary" />
              Allow multiple selections
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreateGlobalGroup} disabled={!newGroupName.trim()}>Create &amp; Apply</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowNewGroupForm(false); setNewGroupName(""); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="gap-1.5 w-full mt-1"
          onClick={() => setShowNewGroupForm(true)}>
          <Plus className="h-4 w-4" /> Create New Modifier
        </Button>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SortableCategoryRow — each row in the Sections list; the element itself moves
// ─────────────────────────────────────────────────────────────────────────────

interface SortableRowProps {
  cat: Category;
  items: MenuItem[];
  categories: Category[];
  isRenaming: boolean;
  renameValue: string;
  isOpen: boolean;
  assignDraft: Record<number, Set<number>>;
  assignSaving: number | null;
  onRenameStart: (cat: Category) => void;
  onRenameChange: (v: string) => void;
  onRenameConfirm: (id: number) => void;
  onRenameCancel: () => void;
  onDeleteRequest: (cat: Category) => void;
  onToggleOpen: (id: number, open: boolean) => void;
  onItemToggle: (catId: number, itemId: number) => void;
  onSaveAssignments: (catId: number) => void;
}

function SortableCategoryRow({
  cat, items, categories, isRenaming, renameValue, isOpen,
  assignDraft, assignSaving, onRenameStart, onRenameChange, onRenameConfirm,
  onRenameCancel, onDeleteRequest, onToggleOpen, onItemToggle, onSaveAssignments,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    zIndex: isDragging ? 50 : undefined,
    position: "relative",
  };

  const catItems = items.filter(i => i.category_id === cat.id);
  const draft = assignDraft[cat.id];

  return (
    <div ref={setNodeRef} style={style}
      className={`border-b last:border-0 ${isDragging ? "shadow-xl bg-card rounded-xl ring-2 ring-primary/30" : ""}`}>
      <div className="flex items-center gap-2 px-4 py-1">
        {/* Drag grip */}
        <button
          {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing p-1.5 rounded hover:bg-muted text-muted-foreground touch-none shrink-0"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Name / rename */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex gap-2 items-center py-1">
              <Input autoFocus value={renameValue} onChange={e => onRenameChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onRenameConfirm(cat.id); if (e.key === "Escape") onRenameCancel(); }}
                className="h-7 text-sm max-w-[200px]" />
              <Button size="sm" className="h-7 px-3" onClick={() => onRenameConfirm(cat.id)}><Check className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onRenameCancel}>Cancel</Button>
            </div>
          ) : (
            <button
              className="flex items-center gap-3 w-full text-left py-3 group"
              onClick={() => onToggleOpen(cat.id, !isOpen)}
            >
              <span className="font-semibold truncate">{cat.name}</span>
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full shrink-0">{catItems.length} items</span>
              {isOpen
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
            </button>
          )}
        </div>

        {/* Action buttons */}
        {!isRenaming && (
          <div className="flex gap-1 shrink-0 ml-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => onRenameStart(cat)} title="Rename">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={() => onDeleteRequest(cat)} title="Delete section">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Item assignment panel */}
      {isOpen && !isRenaming && (
        <div className="px-6 pb-5 pt-2 border-t bg-muted/20 animate-in fade-in slide-in-from-top-1 duration-150">
          <p className="text-xs text-muted-foreground mb-3">
            Tick items that should belong to this section. Un-ticking moves them to the first other section.
          </p>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No menu items yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                {[...items].sort((a, b) => a.name.localeCompare(b.name)).map(item => {
                  const checked = draft ? draft.has(item.id) : item.category_id === cat.id;
                  return (
                    <label key={item.id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all select-none text-start ${
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                      <input type="checkbox" className="accent-primary h-4 w-4 shrink-0" checked={checked}
                        onChange={() => onItemToggle(cat.id, item.id)} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-[0.68rem] text-muted-foreground truncate">
                          {item.category_id !== cat.id
                            ? `In: ${categories.find(c => c.id === item.category_id)?.name ?? "?"}`
                            : "In this section"}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
              <Button className="mt-4" size="sm" disabled={assignSaving === cat.id}
                onClick={() => onSaveAssignments(cat.id)}>
                {assignSaving === cat.id ? "Saving…" : "Save assignments"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MenuTab — main component
// ─────────────────────────────────────────────────────────────────────────────

export function MenuTab() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ── Item dialog
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [variationsTab, setVariationsTab] = useState(false);
  const cropperRef = useRef<ReactCropperElement>(null);
  const patternInputRef = useRef<HTMLInputElement | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [showPatternRepository, setShowPatternRepository] = useState(false);

  const selectedPattern = patterns.find(p => p.id === editingItem?.pattern_id);
  const selectedPatternImage = editingItem?.pattern_image_url
    || selectedPattern?.image_url
    || editingItem?.default_pattern_image_url || null;

  // ── Sections state
  const [openSection, setOpenSection] = useState<number | null>(null);
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [assignDraft, setAssignDraft] = useState<Record<number, Set<number>>>({});
  const [assignSaving, setAssignSaving] = useState<number | null>(null);

  // ── DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { loadData(); loadPatterns(); }, []);
  useWebSocket(["MENU_UPDATE"], () => { loadData(); });

  const loadPatterns = async () => {
    try {
      const data = await fetchPatterns();
      setPatterns(data || []);
    } catch {
      toast.error(t("m.loadPatternsFailed"));
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [menuData, catData] = await Promise.all([fetchMenu(), fetchCategories()]);
      setItems(menuData);
      setCategories(catData);
    } catch { toast.error(t("m.loadMenuFailed")); }
    finally { setLoading(false); }
  };

  const sorted = [...categories].sort((a, b) => a.display_order - b.display_order);

  // ── DnD drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex(c => c.id === active.id);
    const newIndex = sorted.findIndex(c => c.id === over.id);
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    // Optimistic update
    setCategories(reordered.map((c, i) => ({ ...c, display_order: i })));
    try {
      await reorderCategories(reordered.map((c, i) => ({ id: c.id, display_order: i })));
    } catch {
      toast.error("Failed to reorder");
      loadData(); // Revert on failure
    }
  };

  // ── Section CRUD
  const handleCreateSection = async () => {
    if (!newSectionName.trim()) return;
    try {
      await createCategory(newSectionName.trim());
      setNewSectionName(""); setAddingSection(false);
      toast.success("Section created");
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.includes("409") ? "A section with that name already exists" : "Failed to create section");
    }
  };

  const handleRenameSection = async (id: number) => {
    if (!renameValue.trim()) return;
    try {
      await updateCategory(id, { name: renameValue.trim() });
      setRenamingId(null); setRenameValue("");
      toast.success("Section renamed");
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.includes("409") ? "A section with that name already exists" : "Failed to rename");
    }
  };

  const handleDeleteSection = async () => {
    if (!deletingCategory) return;
    try {
      await deleteCategory(deletingCategory.id);
      setDeletingCategory(null);
      toast.success("Section deleted. Items moved to the next available section.");
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.includes("400") ? "Cannot delete the only remaining section." : "Failed to delete section");
    }
  };

  // ── Item assignment
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
      const toAdd = items.filter(i => draft.has(i.id) && i.category_id !== catId);
      const toRemove = items.filter(i => !draft.has(i.id) && i.category_id === catId);
      const updates: Promise<unknown>[] = [
        ...toAdd.map(item => updateMenuItem(item.id, { category_id: catId })),
        ...toRemove.map(async item => {
          const fallback = categories.find(c => c.id !== catId);
          if (fallback) await updateMenuItem(item.id, { category_id: fallback.id });
        }),
      ];
      await Promise.all(updates);
      toast.success("Assignments saved");
      loadData();
    } catch { toast.error("Failed to save assignments"); }
    finally { setAssignSaving(null); }
  };

  // ── Menu item CRUD
  const handleUploadPatternFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!editingItem) return;

    try {
      if (editingItem.id) {
        const result = await uploadMenuItemPatternImage(editingItem.id, file, file.name);
        setEditingItem(p => ({ ...p, pattern_id: result.pattern_id, pattern_image_url: result.image_url }));
      } else {
        const result = await createPattern(file, file.name);
        if (result?.pattern) {
          setPatterns(prev => [result.pattern, ...prev]);
          setEditingItem(p => ({ ...p, pattern_id: result.pattern.id, pattern_image_url: result.pattern.image_url }));
        }
      }
      toast.success("Pattern uploaded");
    } catch {
      toast.error("Failed to upload pattern");
    } finally {
      if (patternInputRef.current) patternInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!editingItem?.name || !editingItem?.price || !editingItem?.category_id) {
      toast.error(t("m.fillRequired")); return;
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
      if (imageSrc && cropperRef.current?.cropper) {
        const canvas = cropperRef.current.cropper.getCroppedCanvas();
        if (canvas) {
          canvas.toBlob(async (blob) => {
            if (blob && finalItemId) { await uploadMenuItemImage(finalItemId, blob); loadData(); }
          }, "image/jpeg", 0.9);
        }
      } else { loadData(); }
      setIsDialogOpen(false);
    } catch { toast.error(t("m.saveFailed")); }
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
    try { await deleteMenuItem(id); toast.success(t("m.itemDeleted")); loadData(); }
    catch { toast.error(t("m.deleteFailed")); }
  };

  // Fallback section for the delete dialog
  const deleteFallback = deletingCategory
    ? sorted.find(c => c.id !== deletingCategory.id)
    : null;

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-8 animate-fade-up" dir={i18n.dir()}>

      {/* ══ PATTERN REPOSITORY ════════════════════════════════════════════════════════ */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div
          className="px-6 py-4 border-b bg-muted/30 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/40 transition-colors"
          onClick={() => setShowPatternRepository(!showPatternRepository)}
        >
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-lg leading-none">Pattern Repository</h3>
              <p className="text-sm text-muted-foreground mt-1">Upload, edit, and manage pattern overlays for menu cards</p>
            </div>
          </div>
          {showPatternRepository ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
        {showPatternRepository && (
          <div className="p-6 max-h-[400px] overflow-y-auto">
            <PatternRepositoryTab />
          </div>
        )}
      </div>

      {/* ══ SECTIONS ════════════════════════════════════════════════════════ */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-lg leading-none">Menu Sections</h3>
              <p className="text-sm text-muted-foreground mt-1">Drag to reorder · Click a section to assign items</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setAddingSection(v => !v)}>
            <Plus className="h-4 w-4" /> Add Section
          </Button>
        </div>

        {addingSection && (
          <div className="px-6 py-4 border-b bg-accent/5 flex gap-3 items-center">
            <Input autoFocus placeholder="New section name…" value={newSectionName}
              onChange={e => setNewSectionName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreateSection(); if (e.key === "Escape") setAddingSection(false); }}
              className="max-w-xs" />
            <Button size="sm" onClick={handleCreateSection} disabled={!newSectionName.trim()}>Create</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAddingSection(false); setNewSectionName(""); }}>Cancel</Button>
          </div>
        )}

        {loading ? (
          <div className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading sections…</div>
        ) : sorted.length === 0 ? (
          <div className="px-6 py-8 text-center text-muted-foreground">No sections yet.</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sorted.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {sorted.map(cat => (
                <SortableCategoryRow
                  key={cat.id}
                  cat={cat}
                  items={items}
                  categories={categories}
                  isRenaming={renamingId === cat.id}
                  renameValue={renameValue}
                  isOpen={openSection === cat.id}
                  assignDraft={assignDraft}
                  assignSaving={assignSaving}
                  onRenameStart={c => { setRenamingId(c.id); setRenameValue(c.name); }}
                  onRenameChange={setRenameValue}
                  onRenameConfirm={handleRenameSection}
                  onRenameCancel={() => setRenamingId(null)}
                  onDeleteRequest={setDeletingCategory}
                  onToggleOpen={(id, open) => {
                    if (open) initAssignDraft(id);
                    setOpenSection(open ? id : null);
                  }}
                  onItemToggle={toggleItemAssign}
                  onSaveAssignments={saveAssignments}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* ══ MENU ITEMS GRID ════════════════════════════════════════════════ */}
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t("m.menuMgmt")}</h2>
            <p className="text-sm text-gray-500">{t("m.menuMgmtDesc")}</p>
          </div>
          <Button onClick={() => { setImageSrc(null); setVariationsTab(false); setEditingItem({ is_available: true, price: 0, card_size: 'normal' }); setIsDialogOpen(true); }}>
            <Plus className="me-2 h-4 w-4" /> {t("m.addMenuItem")}
          </Button>
        </div>
        <Input placeholder={t("m.searchMenuItems")} value={search} onChange={e => setSearch(e.target.value)} className="max-w-md bg-white shadow-sm mb-4" />

        {loading ? (
          <div className="text-center py-12"><p className="text-gray-500 animate-pulse">{t("m.loadingMenu")}</p></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map(item => {
              const pattern = patterns.find(p => p.id === item.pattern_id);
              const patternImage = item.pattern_image_url || pattern?.image_url || item.default_pattern_image_url;
              return (
              <Card key={item.id} className={`overflow-hidden transition-all shadow-sm hover:shadow-md ${!item.is_available ? "opacity-60 grayscale" : ""} ${item.card_size === 'extra_large' ? 'col-span-full' : ''} relative`}>
                {patternImage && (
                  <div className="absolute inset-0 z-0 pointer-events-none">
                    <img src={patternImage}
                      alt="Pattern overlay"
                      className="h-full w-full object-cover"
                      style={{
                        opacity: pattern?.opacity ?? 0.4,
                        transform: `scale(${pattern?.zoom ?? 1}) rotate(${pattern?.rotation ?? 0}deg) scaleX(${pattern?.flip_horizontal ? -1 : 1}) scaleY(${pattern?.flip_vertical ? -1 : 1})`,
                        mixBlendMode: 'multiply'
                      }}
                    />
                    {pattern?.fade_direction && pattern.fade_direction !== 'none' && (
                      <div className="absolute inset-0"
                        style={{
                          background: `linear-gradient(${
                            pattern.fade_direction === 'right-to-left' ? 'to left' :
                            pattern.fade_direction === 'left-to-right' ? 'to right' :
                            pattern.fade_direction === 'top-to-bottom' ? 'to bottom' :
                            'to top'
                          }, transparent, white)`,
                          opacity: (pattern.fade_intensity ?? 0.5)
                        }}
                      />
                    )}
                  </div>
                )}
                {item.card_size === 'extra_large' ? (
                  <div className="flex flex-col sm:flex-row relative z-10">
                    <div className="w-full sm:w-1/2 h-64 bg-gray-100 relative overflow-hidden">
                      {item.image_url
                        ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-gray-400"><ImageIcon className="h-12 w-12 opacity-50" /></div>}
                    </div>
                    <CardContent className="p-6 w-full sm:w-1/2">
                      <div className="mb-2">
                        <h3 className="font-semibold text-gray-900 line-clamp-1">{item.name}</h3>
                        <p className="text-xs text-gray-500 font-medium">{item.category_name}</p>
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        <span className="font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded-md text-sm">RM {item.price.toFixed(2)}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                            onClick={() => { setImageSrc(null); setVariationsTab(false); setEditingItem(item); setIsDialogOpen(true); }}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </div>
                ) : (
                  <>
                    <div className={`${item.card_size === 'large' ? 'h-64' : 'h-32'} bg-gray-100 relative overflow-hidden relative z-10`}>
                      {item.image_url
                        ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-gray-400"><ImageIcon className="h-8 w-8 opacity-50" /></div>}
                      <div className="absolute top-2 end-2 flex gap-1">
                        {item.is_popular && <span className="bg-orange-100 text-orange-700 p-1.5 rounded-full shadow-sm"><Star className="h-3.5 w-3.5" /></span>}
                        {item.is_promo && <span className="bg-pink-100 text-pink-700 p-1.5 rounded-full shadow-sm"><Tag className="h-3.5 w-3.5" /></span>}
                        {item.option_groups && item.option_groups.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setImageSrc(null);
                              setEditingItem(item);
                              setVariationsTab(true);
                              setIsDialogOpen(true);
                            }}
                            className="bg-violet-100 text-violet-700 p-1.5 rounded-full shadow-sm hover:bg-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                            title={`${item.option_groups.length} variation group(s)`}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <CardContent className="p-4 bg-white relative z-10">
                      <div className="mb-2">
                        <h3 className="font-semibold text-gray-900 line-clamp-1">{item.name}</h3>
                        <p className="text-xs text-gray-500 font-medium">{item.category_name}</p>
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        <span className="font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded-md text-sm">RM {item.price.toFixed(2)}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                            onClick={() => { setImageSrc(null); setVariationsTab(false); setEditingItem(item); setIsDialogOpen(true); }}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </>
                )}
              </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ DELETE SECTION DIALOG ══════════════════════════════════════════ */}
      <Dialog open={!!deletingCategory} onOpenChange={open => { if (!open) setDeletingCategory(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Delete Section
            </DialogTitle>
            <DialogDescription className="pt-2">
              Are you sure you want to delete <strong>"{deletingCategory?.name}"</strong>?
              {deleteFallback ? (
                <> Items currently in this section will be moved to <strong>"{deleteFallback.name}"</strong> and can be reassigned afterwards.</>
              ) : (
                <> <span className="text-destructive font-medium">This is your only section and cannot be deleted.</span></>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletingCategory(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleteFallback} onClick={handleDeleteSection}>
              Delete Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ ITEM EDIT DIALOG ═══════════════════════════════════════════════ */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto" dir={i18n.dir()}>
          <DialogHeader>
            <DialogTitle>{editingItem?.id ? t("m.editMenuItem") : t("m.newMenuItem")}</DialogTitle>
            <DialogDescription>{t("m.menuDialogDesc")}</DialogDescription>
          </DialogHeader>

          {/* Tab bar inside dialog */}
          {editingItem?.id && (
            <div className="flex gap-1 bg-muted/50 rounded-lg p-1 mt-1">
              <button onClick={() => setVariationsTab(false)}
                className={`flex-1 text-sm rounded-md py-1.5 font-medium transition-colors ${!variationsTab ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                Details
              </button>
              <button onClick={() => setVariationsTab(true)}
                className={`flex-1 text-sm rounded-md py-1.5 font-medium transition-colors ${variationsTab ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                Variations
              </button>
            </div>
          )}

          {/* ── VARIATIONS TAB ── */}
          {variationsTab && editingItem?.id ? (
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Create option groups (e.g. "Size", "Ice Level") and the choices within them. Set a price delta if a choice changes the cost.
              </p>
              <VariationsEditor itemId={editingItem.id} />
            </div>
          ) : (
            /* ── DETAILS TAB ── */
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>{t("m.itemName")}</Label>
                <Input value={editingItem?.name || ""} onChange={e => setEditingItem(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>{t("m.price")}</Label>
                  <Input type="number" step="0.01" value={editingItem?.price || ""} onChange={e => setEditingItem(p => ({ ...p, price: parseFloat(e.target.value) }))} />
                </div>
                <div className="grid gap-2">
                  <Label>{t("m.category")}</Label>
                  <Select value={editingItem?.category_id?.toString()} onValueChange={v => setEditingItem(p => ({ ...p, category_id: parseInt(v) }))}>
                    <SelectTrigger><SelectValue placeholder={t("m.selectCategory")} /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>{t("m.description")}</Label>
                <Input value={editingItem?.description || ""} onChange={e => setEditingItem(p => ({ ...p, description: e.target.value }))} />
              </div>

              {/* Image */}
              <div className="grid gap-2">
                <Label>{t("m.menuImage")}</Label>
                {!imageSrc ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2">
                    {editingItem?.image_url && <img src={editingItem.image_url} alt="" className="h-24 object-contain mb-2 rounded shadow-sm" />}
                    <Input type="file" accept="image/*" onChange={onFileChange} className="max-w-[250px]" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative h-[260px] w-full bg-black rounded-xl overflow-hidden">
                      <Cropper ref={cropperRef} src={imageSrc} style={{ height: "100%", width: "100%" }}
                        aspectRatio={4 / 3} guides viewMode={1} background={false} responsive checkOrientation={false} />
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.cropper.rotate(90)}>
                        <RotateCw className="h-4 w-4 me-1" /> {t("m.rotate")}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        const c = cropperRef.current?.cropper;
                        if (c) c.scaleX((c.getData().scaleX || 1) === 1 ? -1 : 1);
                      }}><FlipHorizontal className="h-4 w-4 me-1" /> {t("m.flip")}</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.cropper.zoom(0.1)}>
                        <ZoomIn className="h-4 w-4 me-1" /> {t("m.zoomIn")}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.cropper.zoom(-0.1)}>
                        <ZoomOut className="h-4 w-4 me-1" /> {t("m.zoomOut")}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => setImageSrc(null)}>
                        <Trash2 className="h-4 w-4 me-1" /> {t("m.cancelImage")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Toggles */}
              <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100 text-start">
                <h4 className="font-semibold text-sm border-b pb-2">{t("m.manualOverrides")}</h4>
                <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                  <div className="flex-1 space-y-0.5">
                    <Label>{t("m.available")}</Label>
                    <p className="text-xs text-gray-500">{t("m.availableDesc")}</p>
                  </div>
                  <Switch checked={editingItem?.is_available || false} onCheckedChange={c => setEditingItem(p => ({ ...p, is_available: c }))} />
                </div>
                <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                  <div className="flex-1 space-y-0.5">
                    <Label>{t("m.markPopular")}</Label>
                    <p className="text-xs text-gray-500">{t("m.markPopularDesc")}</p>
                  </div>
                  <Switch checked={editingItem?.is_popular || false} onCheckedChange={c => setEditingItem(p => ({ ...p, is_popular: c }))} />
                </div>
                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                    <div className="flex-1 space-y-0.5">
                      <Label>{t("m.activePromo")}</Label>
                      <p className="text-xs text-gray-500">{t("m.activePromoDesc")}</p>
                    </div>
                    <Switch checked={editingItem?.is_promo || false} onCheckedChange={c => setEditingItem(p => ({ ...p, is_promo: c }))} />
                  </div>
                  {editingItem?.is_promo && (
                    <div className="grid gap-2 pt-1 animate-in fade-in slide-in-from-top-2">
                      <Label>{t("m.promoBadgeLabel")}</Label>
                      <Input placeholder={t("m.promoBadgePlaceholder")} value={editingItem?.promo_label || ""}
                        onChange={e => setEditingItem(p => ({ ...p, promo_label: e.target.value }))} />
                    </div>
                  )}
                  <div className="grid gap-2 pt-1">
                    <div>
                      <Label>Pattern overlay</Label>
                      <p className="text-xs text-muted-foreground mt-1">Select a pattern from the repository. Patterns can be edited (zoom, rotate, flip, opacity, fade effects) in the Pattern Repository tab.</p>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                        <div className="flex-1 min-w-0">
                          <Select value={editingItem?.pattern_id ? String(editingItem.pattern_id) : "none"}
                            onValueChange={value => setEditingItem(p => ({ ...p, pattern_id: value === "none" ? null : parseInt(value, 10) }))}>
                            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {patterns.map(pattern => (
                                <SelectItem key={pattern.id} value={String(pattern.id)}>{pattern.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setEditingItem(p => ({ ...p, pattern_id: null }))}>
                            Clear
                          </Button>
                        </div>
                      </div>
                      {selectedPatternImage ? (
                        <div className="flex items-center gap-3 rounded-xl border border-border p-3 bg-muted/60">
                          <div className="h-20 w-20 overflow-hidden rounded-xl bg-white shadow-sm">
                            <img src={selectedPatternImage} alt="Selected pattern" className="h-full w-full object-cover" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{editingItem?.pattern_id ? "Selected pattern" : "Default pattern fallback"}</p>
                            <p className="text-xs text-muted-foreground">This overlay will appear on the menu card.</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No pattern selected. If a default pattern is configured, it will be used on the card.</p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2 pt-1">
                    <Label>Card size</Label>
                    <Select value={editingItem?.card_size || "normal"} onValueChange={v => setEditingItem(p => ({ ...p, card_size: v as any }))}>
                      <SelectTrigger><SelectValue placeholder="Normal" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal — compact</SelectItem>
                        <SelectItem value="large">Large — taller</SelectItem>
                        <SelectItem value="extra_large">Extra Large — wide advertising</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Choose how this item appears on the customer-facing menu.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t("m.cancel")}</Button>
            <Button onClick={handleSave}>{t("m.saveItem")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
