/**
 * 1 … 5 rating scale — neumorphic 3D stars (recessed slots + puffy selected).
 */

import { useId, useMemo } from "react";

const SCALE = [1, 2, 3, 4, 5] as const;

/** Build a symmetric super-puffy star with soft rounded points (5 tips). */
const buildPuffyStarPath = (
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points = 5,
): string => {
  const verts: { x: number; y: number }[] = [];
  const start = -Math.PI / 2;
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const a = start + i * step;
    const r = i % 2 === 0 ? outerR : innerR;
    verts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  const n = verts.length;
  const smooth = 0.25;
  let d = `M ${verts[0].x.toFixed(2)} ${verts[0].y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = verts[(i - 1 + n) % n];
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];
    const p3 = verts[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) * smooth;
    const cp1y = p1.y + (p2.y - p0.y) * smooth;
    const cp2x = p2.x - (p3.x - p1.x) * smooth;
    const cp2y = p2.y - (p3.y - p1.y) * smooth;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return `${d} Z`;
};

const STAR_CX = 12;
const STAR_CY = 12;
const STAR_OUTER_R = 8;
const STAR_INNER_R = 6.05;
const STAR_PATH = buildPuffyStarPath(STAR_CX, STAR_CY, STAR_OUTER_R, STAR_INNER_R);
const STAR_CENTER = { cx: STAR_CX, cy: STAR_CY };
const STAR_TIP_RADIUS = STAR_OUTER_R;
const STAR_DISPLAY_SCALE = 1.04;
const STAR_CLIP_TRANSFORM = `translate(${STAR_CX} ${STAR_CY}) scale(${STAR_DISPLAY_SCALE}) translate(${-STAR_CX} ${-STAR_CY})`;

type StarTone = "darkRed" | "red" | "orange" | "darkYellow" | "gold";

const DARK_RED = "#8B0000";
const RED = "#FF0000";
const ORANGE = "#FF8C00";
const DARK_YELLOW = "#FFD700";
const GOLD = "#FFD700";

const TRACK_BG = "hsl(42 18% 91%)";
const TRACK_INSET =
  "inset 3px 3px 7px rgba(158, 152, 142, 0.55), inset -3px -3px 7px rgba(255, 255, 255, 0.92)";

const intensityFromValue = (value: number | null) => {
  if (value == null) return 0;
  return value / 5;
};

const isStarFilled = (n: number, value: number | null) => {
  if (value == null) return false;
  return n <= value;
};

const getStarTone = (n: number, value: number | null): StarTone => {
  if (value == null || n > value) return "gold";
  if (value === 1) return "darkRed";
  if (value === 2) return "red";
  if (value === 3) return "orange";
  if (value === 4) return "darkYellow";
  return "gold";
};

const createSeededRandom = (seed: number) => {
  let state = Math.abs(seed) % 2147483647 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const puffyPalettes: Record<
  StarTone,
  { light: string; mid: string; dark: string; glitter: string; halo: string; haloOpacity: number }
> = {
  darkRed: {
    light: "#a52a2a",
    mid: DARK_RED,
    dark: "#5c0000",
    glitter: "#ffcccc",
    halo: "#4a0000",
    haloOpacity: 0.38,
  },
  red: {
    light: "#ff5a5a",
    mid: RED,
    dark: "#a30009",
    glitter: "#ffe8e8",
    halo: "#990008",
    haloOpacity: 0.38,
  },
  orange: {
    light: "#ffb347",
    mid: ORANGE,
    dark: "#cc7000",
    glitter: "#fff0cc",
    halo: "#cc7000",
    haloOpacity: 0.35,
  },
  darkYellow: {
    light: "#ffeb3b",
    mid: DARK_YELLOW,
    dark: "#ccac00",
    glitter: "#fffde7",
    halo: "#ccac00",
    haloOpacity: 0.33,
  },
  gold: {
    light: "#fff9c4",
    mid: "#ffd700",
    dark: "#c17900",
    glitter: "#fffde7",
    halo: "#b8860b",
    haloOpacity: 0.32,
  },
};

type GlitterSpot = {
  cx: number;
  cy: number;
  r: number;
  delay: number;
  dur: number;
  driftX: number;
  driftY: number;
};

const buildGlitterSpots = (tone: StarTone, intensity: number, slotSeed: number): GlitterSpot[] => {
  const rand = createSeededRandom(slotSeed * 7919 + (tone === "darkRed" || tone === "red" ? 104729 : 524287));
  const count = Math.floor(5 + intensity * 11);
  /** At max rating, glitters span center → tips; scales with value/5 */
  const maxRadius = 2.2 + intensity * (STAR_TIP_RADIUS - 0.8);

  return Array.from({ length: count }, () => {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * maxRadius;
    return {
      cx: STAR_CENTER.cx + Math.cos(angle) * dist,
      cy: STAR_CENTER.cy + Math.sin(angle) * dist,
      r: 0.16 + rand() * 0.32 + intensity * 0.1,
      delay: rand() * 6,
      dur: 4.5 + rand() * 5.5,
      driftX: (rand() - 0.5) * 0.6,
      driftY: (rand() - 0.5) * 0.6,
    };
  });
};

const StarGlitter = ({
  tone,
  intensity,
  slotSeed,
}: {
  tone: StarTone;
  intensity: number;
  slotSeed: number;
}) => {
  const color = puffyPalettes[tone].glitter;
  const spots = useMemo(
    () => buildGlitterSpots(tone, intensity, slotSeed),
    [tone, intensity, slotSeed],
  );

  if (intensity < 0.08) return null;

  return (
    <g aria-hidden>
      {spots.map((s, i) => (
        <circle
          key={i}
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill={color}
          opacity={0.3 + intensity * 0.4}
        >
          <animate
            attributeName="opacity"
            values="0.1;0.7;0.15;0.6;0.1"
            dur={`${s.dur}s`}
            begin={`${s.delay}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="cx"
            values={`${s.cx};${s.cx + s.driftX};${s.cx - s.driftX * 0.5};${s.cx}`}
            dur={`${s.dur * 1.3}s`}
            begin={`${s.delay * 0.7}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values={`${s.cy};${s.cy + s.driftY};${s.cy - s.driftY * 0.6};${s.cy}`}
            dur={`${s.dur * 1.1}s`}
            begin={`${s.delay * 1.1}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </g>
  );
};

/** Recessed neumorphic star mold (empty slot) */
export const RecessedStar = ({ size = 34 }: { size?: number }) => {
  const uid = useId().replace(/:/g, "");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0 pointer-events-none"
      aria-hidden
    >
      <defs>
        <filter id={`${uid}-inset`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.8" result="blur" />
          <feOffset in="blur" dx="1.2" dy="2" result="offBlur" />
          <feFlood floodColor="#9e978d" floodOpacity="0.85" result="shadowColor" />
          <feComposite in="shadowColor" in2="offBlur" operator="in" result="innerShadow" />
          <feOffset in="SourceAlpha" dx="-0.8" dy="-1" result="off2" />
          <feGaussianBlur in="off2" stdDeviation="0.8" result="blur2" />
          <feFlood floodColor="#ffffff" floodOpacity="0.65" result="hiColor" />
          <feComposite in="hiColor" in2="blur2" operator="in" result="innerHi" />
          <feMerge>
            <feMergeNode in="innerShadow" />
            <feMergeNode in="innerHi" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`${uid}-base`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ebe7e2" />
          <stop offset="100%" stopColor="#d8d3cc" />
        </linearGradient>
      </defs>
      <path d={STAR_PATH} fill={`url(#${uid}-base)`} filter={`url(#${uid}-inset)`} />
    </svg>
  );
};

/** Puffy 3D raised star */
const PuffyStar = ({
  tone,
  intensity,
  size = 40,
  slotSeed,
}: {
  tone: StarTone;
  intensity: number;
  size?: number;
  slotSeed: number;
}) => {
  const uid = useId().replace(/:/g, "");
  const p = puffyPalettes[tone];
  const t = intensity;
  const orbR = 3.4 + t * 0.6;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0 pointer-events-none overflow-visible"
      aria-hidden
    >
      <defs>
        <clipPath id={`${uid}-clip`}>
          <path d={STAR_PATH} transform={STAR_CLIP_TRANSFORM} />
        </clipPath>
        <radialGradient id={`${uid}-body`} cx="50%" cy="46%" r="72%">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.9} />
          <stop offset="28%" stopColor={p.light} />
          <stop offset="58%" stopColor={p.mid} />
          <stop offset="100%" stopColor={p.dark} />
        </radialGradient>
        {/* Soft halo behind star — no downward offset */}
        <filter id={`${uid}-halo`} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="blur" />
          <feFlood floodColor={p.halo} floodOpacity={p.haloOpacity} result="flood" />
          <feComposite in="flood" in2="blur" operator="in" result="glow" />
          <feGaussianBlur in="glow" stdDeviation="1.2" result="softGlow" />
          <feMerge>
            <feMergeNode in="softGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`${uid}-orb`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.75} />
          <stop offset="55%" stopColor="#fff" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
      </defs>
      <path
        d={STAR_PATH}
        transform={STAR_CLIP_TRANSFORM}
        fill={`url(#${uid}-body)`}
        filter={`url(#${uid}-halo)`}
      />
      <g clipPath={`url(#${uid}-clip)`}>
        <circle
          cx={STAR_CENTER.cx}
          cy={STAR_CENTER.cy}
          r={orbR}
          fill={`url(#${uid}-orb)`}
        >
          <animate
            attributeName="opacity"
            values="0.85;1;0.88"
            dur={`${5.5 + (slotSeed % 5)}s`}
            begin={`${(slotSeed % 3) * 0.8}s`}
            repeatCount="indefinite"
          />
        </circle>
        <StarGlitter tone={tone} intensity={t} slotSeed={slotSeed} />
      </g>
    </svg>
  );
};

const StarSlotButton = ({
  n,
  value,
  readOnly,
  onPick,
  starSize,
  puffySize,
  intensity,
}: {
  n: number;
  value: number | null;
  readOnly: boolean;
  onPick: (n: number) => void;
  starSize: number;
  puffySize: number;
  intensity: number;
}) => {
  const filled = isStarFilled(n, value);
  const tone: StarTone = getStarTone(n, value);
  const label = `Rate ${n} star${n !== 1 ? 's' : ''}`;

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => onPick(n)}
      aria-label={label}
      aria-pressed={value === n}
      className={`flex flex-1 items-center justify-center rounded-lg py-0.5 transition ${
        readOnly ? "cursor-default" : "cursor-pointer hover:opacity-90 active:scale-95"
      }`}
    >
      {!filled ? (
        <RecessedStar size={starSize} />
      ) : (
        <PuffyStar tone={tone} intensity={intensity} size={puffySize} slotSeed={n} />
      )}
    </button>
  );
};

export const FeedbackRatingScale = ({
  value,
  onChange,
  readOnly = false,
  compact = false,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  readOnly?: boolean;
  compact?: boolean;
}) => {
  const intensity = intensityFromValue(value);
  const starSize = compact ? 28 : 34;
  const puffySize = compact ? 34 : 42;

  const handlePick = (n: number) => {
    if (readOnly || !onChange) return;
    // Re-clicking the same value clears the rating
    if (value === n) {
      onChange(null);
    } else {
      onChange(n);
    }
  };

  return (
    <div className="w-full">
      <div
        className="flex items-center justify-center rounded-full px-2 py-2"
        style={{
          background: TRACK_BG,
          boxShadow: TRACK_INSET,
          gap: "0.28rem",
        }}
      >
        {SCALE.map((n) => (
          <StarSlotButton
            key={n}
            n={n}
            value={value}
            readOnly={readOnly}
            onPick={handlePick}
            starSize={starSize}
            puffySize={puffySize}
            intensity={intensity}
          />
        ))}
      </div>
    </div>
  );
};

export const SelectedRatingStars = ({
  value,
  compact = true,
}: {
  value: number | null;
  compact?: boolean;
}) => {
  if (value == null) {
    return <span className="text-foreground/40">—</span>;
  }
  return <FeedbackRatingScale value={value} readOnly compact={compact} />;
};
