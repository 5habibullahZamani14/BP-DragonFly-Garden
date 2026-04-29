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

export default function ReactiveButton({
  className = "",
  children,
  onClick,
  disabled,
  type = "button",
  ...rest
}) {
  const btnRef = useRef(null);
  const releaseTimerRef = useRef(null);
  const [bursts, setBursts] = useState([]);
  const burstIdRef = useRef(0);

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
      setBursts((current) => [...current, id]);
      setTimeout(() => {
        setBursts((current) => current.filter((x) => x !== id));
      }, 700);
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
      {bursts.map((id) => (
        <span key={id} className="rx-burst" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span />
        </span>
      ))}
    </button>
  );
}
