import { QrCode, Leaf, Sparkles } from "lucide-react";
import butterflyHero from "@/assets/butterfly-hero.png";

export const LandingView = () => (
  <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
    {/* Hero butterfly — no halo, no shape, just the creature */}
    <img
      src={butterflyHero}
      alt="Golden butterfly with outstretched wings"
      className="mb-6 h-56 w-72 animate-wing-flap object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,0.18)]"
    />

    <span className="eyebrow">Welcome to the farm</span>
    <h1 className="mt-3 font-display text-[3rem] font-bold leading-[0.92] tracking-tight text-balance">
      BP <span className="italic text-accent">Dragonfly</span>
      <br />Garden
    </h1>
    <p className="mt-4 max-w-xs text-foreground/60 text-balance leading-relaxed">
      Where nature, fun &amp; memories grow.
    </p>

    {/* Premium QR card with gilded border */}
      <div className="relative mt-10 w-full max-w-sm">
        <div className="relative rounded-[28px] bg-card p-6 shadow-[var(--shadow-deep)]"
          style={{ background: "linear-gradient(145deg, hsl(var(--card)), hsl(var(--secondary)))" }}>
        {/* Sparkles */}
        {[...Array(4)].map((_, i) => (
          <span key={i} className="sparkle" style={{
            top: `${20 + (i * 23) % 60}%`, left: `${10 + (i * 31) % 80}%`,
            animationDelay: `${i * 0.6}s`,
          }} />
        ))}
        <div className="relative">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl text-primary-foreground shadow-[var(--shadow-deep)]"
            style={{ background: "var(--gradient-emerald)" }}>
            <QrCode className="h-7 w-7" />
          </div>
          <h2 className="font-display text-2xl font-bold">Scan your table</h2>
          <p className="mt-2 text-sm text-foreground/60 leading-relaxed">
            Point your camera at the QR code on your table to view our menu and start ordering.
          </p>

          <div className="mt-5 flex items-center justify-center gap-2 rounded-full bg-background/80 px-4 py-2 text-xs text-foreground/60">
            <Leaf className="h-3.5 w-3.5 text-leaf" />
            Or wave to a farm crew member — we'll come to you.
          </div>
        </div>
      </div>
    </div>

    <p className="mt-8 inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.3em] text-foreground/30">
      <Sparkles className="h-3 w-3" /> Est. in the heart of the garden
    </p>
  </div>
);
