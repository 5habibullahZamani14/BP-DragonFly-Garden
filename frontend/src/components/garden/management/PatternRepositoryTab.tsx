import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/LoadingSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Plus, Trash2, Edit2, ZoomIn, ZoomOut, RotateCw, FlipHorizontal, 
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown, X, Check, Settings2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  fetchPatterns, createPattern, updatePattern, deletePattern,
  updateMenuItem, fetchMenu, updateSetting,
  type Pattern, type MenuItem
} from "@/lib/api";
import Cropper, { ReactCropperElement } from "react-cropper";
import "cropperjs/dist/cropper.css";

type FadeDirection = 'none' | 'right-to-left' | 'left-to-right' | 'top-to-bottom' | 'bottom-to-top';

interface PatternEditorProps {
  pattern: Pattern;
  onSave: (pattern: Pattern) => void;
  onCancel: () => void;
}

function PatternEditor({ pattern, onSave, onCancel }: PatternEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(pattern.name);
  const [opacity, setOpacity] = useState(pattern.opacity ?? 0.4);
  const [zoom, setZoom] = useState(pattern.zoom ?? 1.0);
  const [rotation, setRotation] = useState(pattern.rotation ?? 0);
  const [flipHorizontal, setFlipHorizontal] = useState(!!pattern.flip_horizontal);
  const [flipVertical, setFlipVertical] = useState(!!pattern.flip_vertical);
  const [fadeDirection, setFadeDirection] = useState<FadeDirection>(pattern.fade_direction ?? 'none');
  const [fadeIntensity, setFadeIntensity] = useState(pattern.fade_intensity ?? 0.5);

  const handleSave = () => {
    onSave({
      ...pattern,
      name,
      opacity,
      zoom,
      rotation,
      flip_horizontal: flipHorizontal ? 1 : 0,
      flip_vertical: flipVertical ? 1 : 0,
      fade_direction: fadeDirection,
      fade_intensity: fadeIntensity
    });
  };

  const fadeDirections: { value: FadeDirection; icon: LucideIcon; label: string }[] = [
    { value: 'none', icon: X, label: t("m.pattern.none") },
    { value: 'right-to-left', icon: ArrowRight, label: '→' },
    { value: 'left-to-right', icon: ArrowLeft, label: '←' },
    { value: 'top-to-bottom', icon: ArrowDown, label: '↓' },
    { value: 'bottom-to-top', icon: ArrowUp, label: '↑' },
  ];

  return (
    <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
      <div className="grid gap-1">
        <Label>{t("m.pattern.name")}</Label>
        <Input value={name} onChange={e => setName(e.target.value)} className="px-4" />
      </div>

      {/* Live Preview + Opacity + Zoom Row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Live Preview - Left 50% */}
        <div className="grid gap-1">
          <Label>{t("m.pattern.livePreview")}</Label>
          <div className="relative h-28 w-full bg-gray-100 rounded-lg overflow-hidden border">
            <img
              src={pattern.image_url}
              alt={t("m.pattern.previewAlt")}
              className="w-full h-full object-cover"
              style={{
                opacity,
                transform: `scale(${zoom}) rotate(${rotation}deg) scaleX(${flipHorizontal ? -1 : 1}) scaleY(${flipVertical ? -1 : 1})`,
                mixBlendMode: 'multiply'
              }}
            />
            {fadeDirection !== 'none' && (
              <div className="absolute inset-0"
                style={{
                  background: `linear-gradient(${
                    fadeDirection === 'right-to-left' ? 'to left' :
                    fadeDirection === 'left-to-right' ? 'to right' :
                    fadeDirection === 'top-to-bottom' ? 'to bottom' :
                    'to top'
                  }, transparent, white)`,
                  opacity: fadeIntensity
                }}
              />
            )}
          </div>
        </div>

        {/* Opacity and Zoom - Right 50% */}
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>{t("m.pattern.opacity", { percent: Math.round(opacity * 100) })}</Label>
            <Input type="range" min="0" max="1" step="0.05" value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} />
          </div>

          <div className="grid gap-1">
            <Label>{t("m.pattern.zoom", { zoom: zoom.toFixed(1) })}</Label>
            <div className="flex gap-1 items-center">
              <Button size="sm" variant="outline" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className="px-2"><ZoomIn className="h-3 w-3" /></Button>
              <Input type="range" min="0.5" max="3" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} className="flex-1" />
              <Button size="sm" variant="outline" onClick={() => setZoom(Math.min(3, zoom + 0.1))} className="px-2"><ZoomOut className="h-3 w-3" /></Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label>{t("m.pattern.rotation", { degrees: rotation })}</Label>
          <div className="flex gap-1 items-center">
            <Button size="sm" variant="outline" onClick={() => setRotation(rotation - 90)} className="px-2"><RotateCw className="h-3 w-3" /></Button>
            <Input type="range" min="0" max="360" step="15" value={rotation} onChange={e => setRotation(parseFloat(e.target.value))} className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setRotation(rotation + 90)} className="px-2"><RotateCw className="h-3 w-3" /></Button>
          </div>
        </div>

        <div className="grid gap-1">
          <Label>{t("m.flip")}</Label>
          <div className="flex gap-2">
            <Button size="sm" variant={flipHorizontal ? "default" : "outline"} onClick={() => setFlipHorizontal(!flipHorizontal)} className="flex-1">
              <FlipHorizontal className="h-3 w-3 mr-1" /> {t("m.pattern.horizontal")}
            </Button>
            <Button size="sm" variant={flipVertical ? "default" : "outline"} onClick={() => setFlipVertical(!flipVertical)} className="flex-1">
              <FlipHorizontal className="h-3 w-3 mr-1 rotate-90" /> {t("m.pattern.vertical")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-1">
        <Label>{t("m.pattern.fadeDirection")}</Label>
        <div className="flex gap-2">
          {fadeDirections.map(dir => (
            <button
              key={dir.value}
              onClick={() => setFadeDirection(dir.value)}
              className={`p-2 rounded-lg border transition-all flex-1 ${
                fadeDirection === dir.value 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'bg-background hover:bg-muted border-border'
              }`}
              title={dir.label}
            >
              <dir.icon className="h-4 w-4 mx-auto" />
            </button>
          ))}
        </div>
      </div>

      {fadeDirection !== 'none' && (
        <div className="grid gap-1">
          <Label>{t("m.pattern.fadeIntensity", { percent: Math.round(fadeIntensity * 100) })}</Label>
          <Input type="range" min="0" max="1" step="0.1" value={fadeIntensity} onChange={e => setFadeIntensity(parseFloat(e.target.value))} />
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} className="flex-1"><Check className="h-4 w-4 mr-2" /> {t("m.save")}</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">{t("m.cancel")}</Button>
      </div>
    </div>
  );
}

export function PatternRepositoryTab({ refreshVersion = 0 }: { refreshVersion?: number }) {
  const { t } = useTranslation();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedPatternsRef = useRef(false);
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [newPatternName, setNewPatternName] = useState("");
  const cropperRef = useRef<ReactCropperElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [patternToDelete, setPatternToDelete] = useState<number | null>(null);
  const [applyAllConfirmOpen, setApplyAllConfirmOpen] = useState(false);
  const [patternToApplyAll, setPatternToApplyAll] = useState<number | null>(null);

  useEffect(() => {
    loadPatterns();
    loadMenuItems();
  }, [refreshVersion]);

  const loadPatterns = async () => {
    if (!hasLoadedPatternsRef.current) setLoading(true);
    try {
      const data = await fetchPatterns();
      setPatterns(data || []);
      hasLoadedPatternsRef.current = true;
    } catch {
      toast.error(t("m.pattern.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const loadMenuItems = async () => {
    try {
      const data = await fetchMenu();
      setMenuItems(data || []);
    } catch {
      // Non-critical
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.onload = () => { setImageSrc(reader.result as string); };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleUploadPattern = async () => {
    if (!imageSrc || !newPatternName.trim()) {
      toast.error(t("m.pattern.nameAndImageRequired"));
      return;
    }

    try {
      const canvas = cropperRef.current?.cropper.getCroppedCanvas();
      if (!canvas) {
        toast.error(t("m.pattern.processImageFailed"));
        return;
      }

      canvas.toBlob(async (blob) => {
        if (blob) {
          const result = await createPattern(blob, newPatternName.trim());
          if (result?.pattern) {
            toast.success(t("m.pattern.uploaded"));
            setUploadDialogOpen(false);
            setImageSrc(null);
            setNewPatternName("");
            loadPatterns();
          }
        }
      }, "image/jpeg", 0.9);
    } catch {
      toast.error(t("m.pattern.uploadFailed"));
    }
  };

  const handleEditPattern = (pattern: Pattern) => {
    setEditingPattern(pattern);
    setIsEditorOpen(true);
  };

  const handleSavePattern = async (updatedPattern: Pattern) => {
    try {
      await updatePattern(updatedPattern.id, updatedPattern);
      toast.success(t("m.pattern.updated"));
      setIsEditorOpen(false);
      loadPatterns();
    } catch {
      toast.error(t("m.pattern.updateFailed"));
    }
  };

  const handleDeletePattern = async (id: number) => {
    setPatternToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDeletePattern = async () => {
    if (patternToDelete === null) return;
    try {
      await deletePattern(patternToDelete);
      toast.success(t("m.pattern.deleted"));
      loadPatterns();
    } catch {
      toast.error(t("m.pattern.deleteFailed"));
    } finally {
      setDeleteConfirmOpen(false);
      setPatternToDelete(null);
    }
  };

  const handleApplyToAll = async (patternId: number) => {
    setPatternToApplyAll(patternId);
    setApplyAllConfirmOpen(true);
  };

  const confirmApplyToAll = async () => {
    if (patternToApplyAll === null) return;
    try {
      await Promise.all(menuItems.map(item =>
        updateMenuItem(item.id, { pattern_id: patternToApplyAll })
      ));
      toast.success(t("m.pattern.appliedToAll"));
    } catch {
      toast.error(t("m.pattern.applyToAllFailed"));
    } finally {
      setApplyAllConfirmOpen(false);
      setPatternToApplyAll(null);
    }
  };

  const handleSetAsDefault = async (patternId: number) => {
    try {
      await updateSetting("default_pattern_id", patternId);
      toast.success(t("m.pattern.defaultSet"));
    } catch {
      toast.error(t("m.pattern.defaultSetFailed"));
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-5 w-96 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("m.pattern.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("m.pattern.description")}</p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> {t("m.pattern.upload")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {patterns.map(pattern => (
          <Card key={pattern.id} className="overflow-hidden">
            <div className="h-32 bg-muted relative">
              <img 
                src={pattern.image_url} 
                alt={pattern.name}
                className="w-full h-full object-cover"
                style={{
                  opacity: pattern.opacity ?? 0.4,
                  transform: `scale(${pattern.zoom ?? 1}) rotate(${pattern.rotation ?? 0}deg) scaleX(${pattern.flip_horizontal ? -1 : 1}) scaleY(${pattern.flip_vertical ? -1 : 1})`
                }}
              />
            </div>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">{pattern.name}</h3>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => handleEditPattern(pattern)}>
                  <Edit2 className="h-3 w-3 mr-1" /> {t("m.edit")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleApplyToAll(pattern.id)}>
                  <Settings2 className="h-3 w-3 mr-1" /> {t("m.pattern.applyAll")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleSetAsDefault(pattern.id)}>
                  {t("m.pattern.default")}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDeletePattern(pattern.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {patterns.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("m.pattern.empty")}</p>
          <Button onClick={() => setUploadDialogOpen(true)} className="mt-4">
            <Plus className="h-4 w-4 mr-2" /> {t("m.pattern.uploadFirst")}
          </Button>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t("m.pattern.uploadNew")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("m.pattern.name")}</Label>
              <Input value={newPatternName} onChange={e => setNewPatternName(e.target.value)} placeholder={t("m.pattern.nameExample")} />
            </div>
            <div className="grid gap-2">
              <Label>{t("m.pattern.image")}</Label>
              {!imageSrc ? (
                <Input type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} />
              ) : (
                <div className="space-y-3">
                  <div className="relative h-[300px] w-full bg-black rounded-xl overflow-hidden">
                    <Cropper ref={cropperRef} src={imageSrc} style={{ height: "100%", width: "100%" }}
                      aspectRatio={NaN} guides viewMode={1} background={false} responsive checkOrientation={false} />
                  </div>
                  <Button variant="outline" onClick={() => setImageSrc(null)}>{t("m.cancel")}</Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>{t("m.cancel")}</Button>
            <Button onClick={handleUploadPattern} disabled={!imageSrc || !newPatternName.trim()}>{t("m.pattern.upload")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[910px] max-h-[90vh] p-6">
          <DialogHeader>
            <DialogTitle>{t("m.pattern.editTitle")}</DialogTitle>
            <DialogDescription>{t("m.pattern.editDescription")}</DialogDescription>
          </DialogHeader>
          {editingPattern && (
            <PatternEditor pattern={editingPattern} onSave={handleSavePattern} onCancel={() => setIsEditorOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("m.pattern.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("m.pattern.deleteConfirmation")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>{t("m.cancel")}</Button>
            <Button variant="destructive" onClick={confirmDeletePattern}>{t("m.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply to All Confirmation Dialog */}
      <Dialog open={applyAllConfirmOpen} onOpenChange={setApplyAllConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("m.pattern.applyAllTitle")}</DialogTitle>
            <DialogDescription>
              {t("m.pattern.applyAllConfirmation")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyAllConfirmOpen(false)}>{t("m.cancel")}</Button>
            <Button onClick={confirmApplyToAll}>{t("m.apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
