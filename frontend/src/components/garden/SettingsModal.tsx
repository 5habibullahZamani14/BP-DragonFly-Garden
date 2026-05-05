import { Settings2, Plus, Minus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useAccessibility, FontTheme } from "@/lib/useAccessibility";

export const SettingsModal = () => {
  const { fontTheme, setFontTheme, uiScale, setUiScale, fontScale, setFontScale } = useAccessibility();

  const handleUiScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUiScale(parseFloat(e.target.value));
  };

  const handleFontScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFontScale(parseFloat(e.target.value));
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button 
          className="grid h-10 w-10 place-items-center rounded-full bg-white/80 text-foreground/70 shadow-sm backdrop-blur transition-all hover:bg-white active:scale-95 border border-border/50"
          aria-label="Settings"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md w-[95vw] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Accessibility Settings</DialogTitle>
          <DialogDescription>
            Customize the look and feel of the application to suit your needs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-8 py-4">
          
          {/* Typography Mode */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Typography Mode</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => setFontTheme("font-1")}
                className={`flex flex-col items-center justify-center rounded-xl border p-3 transition-all ${fontTheme === "font-1" ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/60 hover:bg-muted/50'}`}
              >
                <span className="font-sans text-xl font-medium" style={{ fontFamily: "'Inter', sans-serif" }}>Aa</span>
                <span className="mt-1 text-[0.65rem] uppercase tracking-wider text-foreground/60">Readability</span>
              </button>
              <button
                onClick={() => setFontTheme("font-2")}
                className={`flex flex-col items-center justify-center rounded-xl border p-3 transition-all ${fontTheme === "font-2" ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/60 hover:bg-muted/50'}`}
              >
                <span className="font-display text-xl font-medium" style={{ fontFamily: "'Fraunces', serif" }}>Aa</span>
                <span className="mt-1 text-[0.65rem] uppercase tracking-wider text-foreground/60">Original</span>
              </button>
              <button
                onClick={() => setFontTheme("font-3")}
                className={`flex flex-col items-center justify-center rounded-xl border p-3 transition-all ${fontTheme === "font-3" ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/60 hover:bg-muted/50'}`}
              >
                <span className="font-display text-xl font-medium italic" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Aa</span>
                <span className="mt-1 text-[0.65rem] uppercase tracking-wider text-foreground/60">Elegance</span>
              </button>
            </div>
            <div className="mt-3 rounded-lg bg-muted/30 p-3 text-center border border-border/40">
              <p className="font-display text-sm text-foreground/80">The quick brown fox jumps over the lazy dog.</p>
            </div>
          </div>

          {/* UI Scaling */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Interface Size</h3>
              <span className="text-xs font-mono text-foreground/50">{Math.round(uiScale * 100)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setUiScale(Math.max(0.7, uiScale - 0.1))} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-foreground/70 active:scale-95"><Minus className="h-4 w-4" /></button>
              <input 
                type="range" 
                min="0.7" 
                max="1.5" 
                step="0.05" 
                value={uiScale} 
                onChange={handleUiScaleChange}
                className="flex-1 accent-primary"
              />
              <button onClick={() => setUiScale(Math.min(1.5, uiScale + 0.1))} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-foreground/70 active:scale-95"><Plus className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Font Scaling */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Text Size</h3>
              <span className="text-xs font-mono text-foreground/50">{Math.round(fontScale * 100)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setFontScale(Math.max(0.7, fontScale - 0.1))} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-foreground/70 active:scale-95"><Minus className="h-4 w-4" /></button>
              <input 
                type="range" 
                min="0.7" 
                max="1.5" 
                step="0.05" 
                value={fontScale} 
                onChange={handleFontScaleChange}
                className="flex-1 accent-primary"
              />
              <button onClick={() => setFontScale(Math.min(1.5, fontScale + 0.1))} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-foreground/70 active:scale-95"><Plus className="h-4 w-4" /></button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};
