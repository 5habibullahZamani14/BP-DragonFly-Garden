import { useEffect, useRef, useState } from "react";
import { Settings, Plus, Minus, Globe, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useAccessibility, FontTheme } from "@/lib/useAccessibility";
import { useTranslation } from "react-i18next";

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
    label: "Baskerville",
    tagline: "Elegant serif — classic and refined",
    fontFamily: "'Baskervville', serif",
    headingFamily: "'Baskervville', serif",
  },
  {
    id: "font-2",
    label: "Merriweather",
    tagline: "Readable serif — designed for screen reading",
    fontFamily: "'Merriweather', serif",
    headingFamily: "'Merriweather', serif",
  },
  {
    id: "font-3",
    label: "Montserrat",
    tagline: "Modern sans-serif — clean and contemporary",
    fontFamily: "'Montserrat', sans-serif",
    headingFamily: "'Montserrat', sans-serif",
  },
];

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export const SettingsModal = ({ restrictLanguages = false }: { restrictLanguages?: boolean }) => {
  const { fontTheme, setFontTheme, uiScale, setUiScale, fontScale, setFontScale } = useAccessibility();
  const { t, i18n } = useTranslation();
  const [canInstall, setCanInstall] = useState(false);
  const [installStatus, setInstallStatus] = useState<"idle" | "installed" | "unsupported">("idle");
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const ALL_LANGUAGES = [
    { code: "en", label: "English" },
    { code: "zh", label: "中文" },
    { code: "ms", label: "Bahasa Melayu" },
    { code: "ar", label: "العربية" },
    { code: "fa", label: "فارسی" },
    { code: "hi", label: "हिन्दी" }
  ];

  const LANGUAGES = restrictLanguages 
    ? ALL_LANGUAGES.filter(lang => lang.code === "en" || lang.code === "zh")
    : ALL_LANGUAGES;

  const selectedFont = FONT_OPTIONS.find((f) => f.id === fontTheme) ?? FONT_OPTIONS[1];

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    if (isStandalone) {
      setInstallStatus("installed");
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
      setInstallStatus("idle");
    };

    const onAppInstalled = () => {
      deferredPromptRef.current = null;
      setCanInstall(false);
      setInstallStatus("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    if (typeof window !== "undefined" && !("standalone" in window.navigator) && !window.matchMedia("(display-mode: standalone)").matches) {
      setInstallStatus("unsupported");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const isSecureContext = typeof window !== "undefined" && window.isSecureContext;
  const showInstallUnavailableMessage = installStatus === "unsupported" && !isSecureContext;
  const showInstallSection = isSecureContext || installStatus === "installed";

  const handleInstallClick = async () => {
    if (!deferredPromptRef.current) {
      return;
    }

    deferredPromptRef.current.prompt();
    const choiceResult = await deferredPromptRef.current.userChoice;
    if (choiceResult.outcome === "accepted") {
      setInstallStatus("installed");
    }
    deferredPromptRef.current = null;
    setCanInstall(false);
  };

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
          aria-label="Settings"
          id="settings-modal-trigger"
        >
          <Settings className="h-5 w-5" />
        </button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] rounded-2xl p-0 overflow-hidden flex flex-col">
        {/* Header — stays fixed */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0" style={{ background: "var(--gradient-soft)" }}>
          <DialogHeader>
            <DialogTitle className="font-1 text-2xl">{t("settings.displayTitle")}</DialogTitle>
            <DialogDescription className="text-sm text-foreground/60 mt-1">
              {t("settings.displayDesc")}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="space-y-6 px-6 py-5 overflow-y-auto flex-1">

          {/* ── Language ────────────────────────────── */}
          <section aria-labelledby="language-heading">
            <h3 id="language-heading" className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground/50">
              <Globe className="h-3.5 w-3.5" />
              {t("settings.language")}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LANGUAGES.map((lang) => {
                const active = i18n.language === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => i18n.changeLanguage(lang.code)}
                    aria-pressed={active}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "border-primary bg-primary/5 text-primary shadow-sm"
                        : "border-border/50 text-foreground/70 hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Typography Mode ────────────────────────────── */}
          <section aria-labelledby="typography-heading">
            <h3 id="typography-heading" className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground/50">
              {t("settings.fontStyle")}
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {FONT_OPTIONS.map((opt, index) => {
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
                      {t(`settings.font${index + 1}Label`)}
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
                  {t("settings.dragonflyGarden")}
                </span>
                {t("settings.fontPreviewText")}
              </p>
              <p className="mt-2 text-[0.65rem] text-foreground/40 font-sans">
                {t(`settings.font${FONT_OPTIONS.findIndex(f => f.id === selectedFont.id) + 1}Desc`)}
              </p>
            </div>
          </section>

          {/* ── Interface Size ────────────────────────────── */}
          <section aria-labelledby="ui-size-heading">
            <div className="mb-3 flex items-center justify-between">
              <h3 id="ui-size-heading" className="text-xs font-bold uppercase tracking-widest text-foreground/50">
                {t("settings.interfaceSize")}
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
              <span>{t("settings.smaller")}</span>
              <span>{t("settings.default")}</span>
              <span>{t("settings.larger")}</span>
            </div>
          </section>

          {/* ── Text Size ─────────────────────────────────── */}
          <section aria-labelledby="text-size-heading">
            <div className="mb-3 flex items-center justify-between">
              <h3 id="text-size-heading" className="text-xs font-bold uppercase tracking-widest text-foreground/50">
                {t("settings.textSize")}
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
              <span>{t("settings.smaller")}</span>
              <span>{t("settings.default")}</span>
              <span>{t("settings.larger")}</span>
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
                {t("settings.sampleMenu")}
              </p>
            </div>
          </section>

          {showInstallSection && (
            <section aria-labelledby="install-heading">
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 id="install-heading" className="text-sm font-semibold text-foreground/80">Install this app</h3>
                    <p className="mt-1 text-xs text-foreground/60">Use it as a full app on your phone, tablet, or desktop.</p>
                  </div>
                  {installStatus === "installed" ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Installed</span>
                  ) : canInstall ? (
                    <button
                      type="button"
                      onClick={handleInstallClick}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Install app
                    </button>
                  ) : (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground/60">Not available</span>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Reset button */}
          <button
            onClick={() => { setUiScale(1); setFontScale(1); setFontTheme("font-3"); }}
            className="w-full rounded-xl border border-border/50 py-2 text-xs font-semibold text-foreground/50 transition hover:bg-muted/40 hover:text-foreground/70"
          >
            {t("settings.reset")}
          </button>

        </div>
      </DialogContent>
    </Dialog>
  );
};
