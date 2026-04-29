import { useRef, useState, useEffect } from "react";

let sharedAudioCtx = null;

const getAudioCtx = () => {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioCtx = new Ctx();
    } catch (err) {
      return null;
    }
  }
  return sharedAudioCtx;
};

const playTone = (frequency, duration, volume) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(frequency, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.55), now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
};

const prefersReducedMotion = () => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const PALETTES = {
  sunflower: ["#f4b84b", "#f7d27a", "#fff5d4", "#ffe7a3", "#ffc566"],
  sage:      ["#5a8f3a", "#a3c66f", "#d8ecb3", "#f4b84b", "#fff5d4"],
  warmGold:  ["#f4d169", "#fff5d4", "#ffd9b3", "#a3c66f", "#ffe07a"],
  blossom:   ["#f4b84b", "#ffb3b3", "#fff5d4", "#a3c66f", "#ffd9e0"],
};

const derivePalette = (className) => {
  const c = className || "";
  if (c.includes("spotlight-card__cta")) return PALETTES.warmGold;
  if (c.includes("promo-pill")) return PALETTES.blossom;
  if (c.includes("checkout-button")) return PALETTES.sunflower;
  if (c.includes("chip--active") || c.includes("chip--action")) return PALETTES.sunflower;
  if (c.includes("action-button")) return PALETTES.sunflower;
  if (c.includes("chip")) return PALETTES.sage;
  return PALETTES.sage;
};

const SPARK_COUNT = 16;

const makeBurst = (palette) => {
  const particles = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 24 + Math.random() * 42;
    const size = 5 + Math.random() * 9;
    const delay = Math.random() * 110;
    const duration = 480 + Math.random() * 340;
    const drift = (Math.random() - 0.5) * 26;
    const lift = -(Math.random() * 12);
    const color = palette[Math.floor(Math.random() * palette.length)];
    particles.push({
      key: i,
      tx: Math.cos(angle) * distance,
      ty: Math.sin(angle) * distance,
      drift,
      lift,
      size,
      delay,
      duration,
      color,
    });
  }
  return particles;
};

export default function ReactiveButton({
  className = "",
  children,
  onClick,
  disabled,
  type = "button",
  palette,
  ...rest
}) {
  const btnRef = useRef(null);
  const releaseTimerRef = useRef(null);
  const [bursts, setBursts] = useState([]);
  const burstIdRef = useRef(0);

  const effectivePalette = palette || derivePalette(className);

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
      }
    };
  }, []);

  const setPressed = (on) => {
    const el = btnRef.current;
    if (!el) return;
    if (on) {
      el.classList.add("rx-pressed");
    } else {
      el.classList.remove("rx-pressed");
    }
  };

  const handlePointerDown = (event) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    setPressed(true);
    playTone(360, 0.05, 0.10);
  };

  const handleRelease = (didActivate) => {
    if (disabled) return;
    const el = btnRef.current;
    const wasPressed = el?.classList.contains("rx-pressed");
    setPressed(false);
    if (!wasPressed || !didActivate) return;

    if (!prefersReducedMotion() && el) {
      el.classList.add("rx-released");
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = setTimeout(() => {
        el.classList.remove("rx-released");
      }, 520);

      const id = ++burstIdRef.current;
      const particles = makeBurst(effectivePalette);
      setBursts((current) => [...current, { id, particles }]);
      setTimeout(() => {
        setBursts((current) => current.filter((b) => b.id !== id));
      }, 950);
    }

    playTone(820, 0.09, 0.14);
  };

  return (
    <button
      ref={btnRef}
      type={type}
      disabled={disabled}
      className={`rx-button ${className}`.trim()}
      onPointerDown={handlePointerDown}
      onPointerUp={() => handleRelease(true)}
      onPointerLeave={() => handleRelease(false)}
      onPointerCancel={() => handleRelease(false)}
      onClick={onClick}
      {...rest}
    >
      {children}
      {bursts.map((burst) => (
        <span key={burst.id} className="rx-burst" aria-hidden="true">
          {burst.particles.map((p) => (
            <span
              key={p.key}
              className="rx-bubble"
              style={{
                "--tx": `${p.tx.toFixed(1)}px`,
                "--ty": `${p.ty.toFixed(1)}px`,
                "--drift": `${p.drift.toFixed(1)}px`,
                "--lift": `${p.lift.toFixed(1)}px`,
                "--size": `${p.size.toFixed(1)}px`,
                "--bcolor": p.color,
                animationDelay: `${p.delay.toFixed(0)}ms`,
                animationDuration: `${p.duration.toFixed(0)}ms`,
              }}
            />
          ))}
        </span>
      ))}
    </button>
  );
}
