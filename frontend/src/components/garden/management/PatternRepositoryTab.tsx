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
import { toast } from "sonner";
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

  const fadeDirections: { value: FadeDirection; icon: any; label: string }[] = [
    { value: 'none', icon: X, label: 'None' },
    { value: 'right-to-left', icon: ArrowRight, label: '→' },
    { value: 'left-to-right', icon: ArrowLeft, label: '←' },
    { value: 'top-to-bottom', icon: ArrowDown, label: '↓' },
    { value: 'bottom-to-top', icon: ArrowUp, label: '↑' },
  ];

  return (
    <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
      <div className="grid gap-1">
        <Label>Pattern Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} className="px-4" />
      </div>

      {/* Live Preview + Opacity + Zoom Row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Live Preview - Left 50% */}
        <div className="grid gap-1">
          <Label>Live Preview</Label>
          <div className="relative h-28 w-full bg-gray-100 rounded-lg overflow-hidden border">
            <img
              src={pattern.image_url}
              alt="Pattern preview"
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
            <Label>Opacity ({Math.round(opacity * 100)}%)</Label>
            <Input type="range" min="0" max="1" step="0.05" value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} />
          </div>

          <div className="grid gap-1">
            <Label>Zoom ({zoom.toFixed(1)}x)</Label>
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
          <Label>Rotation ({rotation}°)</Label>
          <div className="flex gap-1 items-center">
            <Button size="sm" variant="outline" onClick={() => setRotation(rotation - 90)} className="px-2"><RotateCw className="h-3 w-3" /></Button>
            <Input type="range" min="0" max="360" step="15" value={rotation} onChange={e => setRotation(parseFloat(e.target.value))} className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setRotation(rotation + 90)} className="px-2"><RotateCw className="h-3 w-3" /></Button>
          </div>
        </div>

        <div className="grid gap-1">
          <Label>Flip</Label>
          <div className="flex gap-2">
            <Button size="sm" variant={flipHorizontal ? "default" : "outline"} onClick={() => setFlipHorizontal(!flipHorizontal)} className="flex-1">
              <FlipHorizontal className="h-3 w-3 mr-1" /> H
            </Button>
            <Button size="sm" variant={flipVertical ? "default" : "outline"} onClick={() => setFlipVertical(!flipVertical)} className="flex-1">
              <FlipHorizontal className="h-3 w-3 mr-1 rotate-90" /> V
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-1">
        <Label>Fade Direction</Label>
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
          <Label>Fade Intensity ({Math.round(fadeIntensity * 100)}%)</Label>
          <Input type="range" min="0" max="1" step="0.1" value={fadeIntensity} onChange={e => setFadeIntensity(parseFloat(e.target.value))} />
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} className="flex-1"><Check className="h-4 w-4 mr-2" /> Save</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}

export function PatternRepositoryTab() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
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
  }, []);

  const loadPatterns = async () => {
    setLoading(true);
    try {
      const data = await fetchPatterns();
      setPatterns(data || []);
    } catch {
      toast.error("Failed to load patterns");
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
      toast.error("Please provide a name and image");
      return;
    }

    try {
      const canvas = cropperRef.current?.cropper.getCroppedCanvas();
      if (!canvas) {
        toast.error("Failed to process image");
        return;
      }

      canvas.toBlob(async (blob) => {
        if (blob) {
          const result = await createPattern(blob, newPatternName.trim());
          if (result?.pattern) {
            toast.success("Pattern uploaded successfully");
            setUploadDialogOpen(false);
            setImageSrc(null);
            setNewPatternName("");
            loadPatterns();
          }
        }
      }, "image/jpeg", 0.9);
    } catch {
      toast.error("Failed to upload pattern");
    }
  };

  const handleEditPattern = (pattern: Pattern) => {
    setEditingPattern(pattern);
    setIsEditorOpen(true);
  };

  const handleSavePattern = async (updatedPattern: Pattern) => {
    try {
      await updatePattern(updatedPattern.id, updatedPattern);
      toast.success("Pattern updated successfully");
      setIsEditorOpen(false);
      loadPatterns();
    } catch {
      toast.error("Failed to update pattern");
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
      toast.success("Pattern deleted successfully");
      loadPatterns();
    } catch {
      toast.error("Failed to delete pattern");
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
      toast.success("Pattern applied to all items");
    } catch {
      toast.error("Failed to apply pattern to all items");
    } finally {
      setApplyAllConfirmOpen(false);
      setPatternToApplyAll(null);
    }
  };

  const handleSetAsDefault = async (patternId: number) => {
    try {
      await updateSetting("default_pattern_id", patternId);
      toast.success("Default pattern set successfully");
    } catch {
      toast.error("Failed to set default pattern");
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
          <h2 className="text-2xl font-bold">Pattern Repository</h2>
          <p className="text-sm text-muted-foreground">Upload, edit, and manage pattern overlays for menu cards</p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Upload Pattern
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
                  <Edit2 className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleApplyToAll(pattern.id)}>
                  <Settings2 className="h-3 w-3 mr-1" /> Apply All
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleSetAsDefault(pattern.id)}>
                  Default
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
          <p>No patterns uploaded yet.</p>
          <Button onClick={() => setUploadDialogOpen(true)} className="mt-4">
            <Plus className="h-4 w-4 mr-2" /> Upload Your First Pattern
          </Button>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Upload New Pattern</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Pattern Name</Label>
              <Input value={newPatternName} onChange={e => setNewPatternName(e.target.value)} placeholder="e.g., Floral, Geometric, etc." />
            </div>
            <div className="grid gap-2">
              <Label>Pattern Image</Label>
              {!imageSrc ? (
                <Input type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} />
              ) : (
                <div className="space-y-3">
                  <div className="relative h-[300px] w-full bg-black rounded-xl overflow-hidden">
                    <Cropper ref={cropperRef} src={imageSrc} style={{ height: "100%", width: "100%" }}
                      aspectRatio={NaN} guides viewMode={1} background={false} responsive checkOrientation={false} />
                  </div>
                  <Button variant="outline" onClick={() => setImageSrc(null)}>Cancel</Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUploadPattern} disabled={!imageSrc || !newPatternName.trim()}>Upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[910px] max-h-[90vh] p-6">
          <DialogHeader>
            <DialogTitle>Edit Pattern</DialogTitle>
            <DialogDescription>Adjust the pattern overlay settings for menu cards</DialogDescription>
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
            <DialogTitle>Delete Pattern</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this pattern? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeletePattern}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply to All Confirmation Dialog */}
      <Dialog open={applyAllConfirmOpen} onOpenChange={setApplyAllConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Pattern to All Items</DialogTitle>
            <DialogDescription>
              Are you sure you want to apply this pattern to all menu items? This will overwrite existing patterns on all items.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyAllConfirmOpen(false)}>Cancel</Button>
            <Button onClick={confirmApplyToAll}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
