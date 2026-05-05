import { Settings2, Plus, Minus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useAccessibility, FontTheme } from "@/lib/useAccessibility";

// Font definitions with their actual CSS font stacks and display metadata
const FONT_OPTIONS: {
  id: FontTheme;
  label: string;
  tagline: string;
  fontFamily: string;
  headingFamily: string;
  sampleStyle?: React.CSSProperties;
}[] = [
  {
    id: "font-1",
    label: "Clarity",
    tagline: "Ultimate readability — clean, open, effortless for all ages",
    fontFamily: "'Inter', sans-serif",
    headingFamily: "'Inter', sans-serif",
  },
  {
    id: "font-2",
    label: "Botanical",
    tagline: "The original garden feel — warm, organic, friendly",
    fontFamily: "'Lexend', sans-serif",
    headingFamily: "'Fraunces', serif",
  },
  {
    id: "font-3",
    label: "Elegance",
    tagline: "Refined luxury — timeless, sophisticated, classy",
    fontFamily: "'Cormorant Garamond', serif",
    headingFamily: "'Cormorant Garamond', serif",
    sampleStyle: { fontStyle: "italic", letterSpacing: "0.01em" },
  },
];

export const SettingsModal = () => {
  const { fontTheme, setFontTheme, uiScale, setUiScale, fontScale, setFontScale } = useAccessibility();

  const selectedFont = FONT_OPTIONS.find((f) => f.id === fontTheme) ?? FONT_OPTIONS[1];

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
          className="grid h-10 w-10 place-items-center rounded-full bg-white/80 text-foreground/70 shadow-sm backdrop-blur transition-all hover:bg-white hover:shadow-md active:scale-95 border border-border/50"
          aria-label="Accessibility Settings"
          id="settings-modal-trigger"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-lg rounded-2xl p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50" style={{ background: "var(--gradient-soft)" }}>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Display Settings</DialogTitle>
            <DialogDescription className="text-sm text-foreground/60 mt-1">
              Personalise how the app looks and feels for you.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 py-5">

          {/* ── Typography Mode ────────────────────────────── */}
          <section aria-labelledby="typography-heading">
            <h3 id="typography-heading" className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground/50">
              Font Style
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {FONT_OPTIONS.map((opt) => {
                const active = fontTheme === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setFontTheme(opt.id)}
                    aria-pressed={active}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-3 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border/50 hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    {/* Big sample glyph rendered in the actual font */}
                    <span
                      className="text-3xl font-semibold leading-none"
                      style={{ fontFamily: opt.headingFamily, ...(opt.sampleStyle ?? {}) }}
                      aria-hidden
                    >
                      Aa
                    </span>
                    <span className="text-[0.62rem] font-bold uppercase tracking-wider text-foreground/70 leading-none">
                      {opt.label}
                    </span>
                    {active && (
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Live preview card — rendered in the selected font */}
            <div
              className="mt-3 rounded-xl bg-muted/30 border border-border/40 px-4 py-3"
              aria-live="polite"
              aria-label="Font preview"
            >
              <p
                className="text-sm leading-relaxed text-foreground/80"
                style={{ fontFamily: selectedFont.fontFamily, ...(selectedFont.sampleStyle ?? {}) }}
              >
                <span
                  className="font-semibold text-base block mb-0.5"
                  style={{ fontFamily: selectedFont.headingFamily }}
                >
                  Dragonfly Garden
                </span>
                The quick brown fox jumps over the lazy dog. Fresh from the farm, served with love.
              </p>
              <p className="mt-2 text-[0.65rem] text-foreground/40 font-sans">
                {selectedFont.tagline}
              </p>
            </div>
          </section>

          {/* ── Interface Size ────────────────────────────── */}
          <section aria-labelledby="ui-size-heading">
            <div className="mb-3 flex items-center justify-between">
              <h3 id="ui-size-heading" className="text-xs font-bold uppercase tracking-widest text-foreground/50">
                Interface Size
              </h3>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground/60 tabular-nums">
                {Math.round(uiScale * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setUiScale(Math.max(0.75, parseFloat((uiScale - 0.05).toFixed(2))))}
                aria-label="Decrease interface size"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground/70 transition-all hover:bg-muted/80 active:scale-90"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="range"
                min="0.75"
                max="1.5"
                step="0.05"
                value={uiScale}
                onChange={handleUiScaleChange}
                className="flex-1 accent-primary h-2 cursor-pointer"
                aria-label="Interface size slider"
              />
              <button
                onClick={() => setUiScale(Math.min(1.5, parseFloat((uiScale + 0.05).toFixed(2))))}
                aria-label="Increase interface size"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground/70 transition-all hover:bg-muted/80 active:scale-90"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1.5 flex justify-between text-[0.6rem] text-foreground/35 px-1">
              <span>Smaller</span>
              <span>Default</span>
              <span>Larger</span>
            </div>
          </section>

          {/* ── Text Size ─────────────────────────────────── */}
          <section aria-labelledby="text-size-heading">
            <div className="mb-3 flex items-center justify-between">
              <h3 id="text-size-heading" className="text-xs font-bold uppercase tracking-widest text-foreground/50">
                Text Size
              </h3>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground/60 tabular-nums">
                {Math.round(fontScale * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFontScale(Math.max(0.75, parseFloat((fontScale - 0.05).toFixed(2))))}
                aria-label="Decrease text size"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground/70 transition-all hover:bg-muted/80 active:scale-90"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="range"
                min="0.75"
                max="1.5"
                step="0.05"
                value={fontScale}
                onChange={handleFontScaleChange}
                className="flex-1 accent-primary h-2 cursor-pointer"
                aria-label="Text size slider"
              />
              <button
                onClick={() => setFontScale(Math.min(1.5, parseFloat((fontScale + 0.05).toFixed(2))))}
                aria-label="Increase text size"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground/70 transition-all hover:bg-muted/80 active:scale-90"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1.5 flex justify-between text-[0.6rem] text-foreground/35 px-1">
              <span>Smaller</span>
              <span>Default</span>
              <span>Larger</span>
            </div>

            {/* Live text-size preview */}
            <div className="mt-3 rounded-xl bg-muted/30 border border-border/40 px-4 py-3">
              <p
                className="leading-relaxed text-foreground/70"
                style={{
                  fontFamily: selectedFont.fontFamily,
                  fontSize: `calc(0.9rem * ${fontScale})`,
                }}
              >
                Sample menu item — <strong>RM 18.00</strong>
              </p>
            </div>
          </section>

          {/* Reset button */}
          <button
            onClick={() => { setUiScale(1); setFontScale(1); setFontTheme("font-2"); }}
            className="w-full rounded-xl border border-border/50 py-2 text-xs font-semibold text-foreground/50 transition hover:bg-muted/40 hover:text-foreground/70"
          >
            Reset to defaults
          </button>

        </div>
      </DialogContent>
    </Dialog>
  );
};
