import dragonflySide from "@/assets/dragonfly-side.png";
import dragonflySide2 from "@/assets/dragonfly-side-2.png";
import dragonflyPerched from "@/assets/dragonfly-perched.png";
import butterflySide from "@/assets/butterfly-side.png";

// 4 side-view creatures — 3 dragonflies + 1 butterfly. They perch on the
// top-left or top-right corner of orderable item cards with feet on the rim.
// `naturalFacing` records which way the source PNG faces so we can pick the
// correct corner (a left-facing bug sits on the top-right, vice versa).
const ASSETS: { src: string; naturalFacing: "left" | "right" }[] = [
  { src: dragonflySide, naturalFacing: "left" },
  { src: dragonflySide2, naturalFacing: "left" },
  { src: dragonflyPerched, naturalFacing: "right" },
  { src: butterflySide, naturalFacing: "left" },
];

// Tiny deterministic PRNG so each placement looks consistent across re-renders
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

interface WingedAccentProps {
  /** Stable seed — controls which creature, corner, flip, rotation. */
  seed: string;
  /** Tailwind size, default h-20 w-20. */
  size?: string;
  /** Force a specific corner. Otherwise chosen from seed. Only top corners are supported. */
  corner?: "tl" | "tr";
  /** Force flip (mirror). Otherwise chosen from seed. */
  flip?: boolean;
  /** Override the seed-derived rotation (in degrees). */
  rotate?: number;
  /** Horizontal offset in px applied on top of the corner anchor (negative = left). */
  offsetX?: number;
  /** Vertical offset in px applied on top of the corner anchor (negative = up). */
  offsetY?: number;
  className?: string;
}

/**
 * A small dragonfly/butterfly perched on the corner of a card or button.
 * Stays still ~90% of the time then briefly flutters its wings.
 * Parent must be `position: relative` (or similar).
 */
export const WingedAccent = ({
  seed,
  size = "h-20 w-20",
  corner,
  flip,
  rotate,
  offsetX = 0,
  offsetY = 0,
  className = "",
}: WingedAccentProps) => {
  const h = hash(seed);
  const { src: asset, naturalFacing } = ASSETS[h % ASSETS.length];

  // Rule: a creature facing LEFT sits on the TOP-RIGHT (looks inward), and
  // one facing RIGHT sits on the TOP-LEFT. Decide whether to mirror, then
  // derive the corner from the resulting facing direction.
  const mirror = flip ?? ((h >> 5) & 1) === 1;
  const finalFacing: "left" | "right" =
    mirror ? (naturalFacing === "left" ? "right" : "left") : naturalFacing;
  const pickedCorner = corner ?? (finalFacing === "left" ? "tr" : "tl");
  // scaleX value: -1 if we're mirroring relative to the source PNG.
  const scaleX = mirror ? -1 : 1;

  // Tiny natural rotation jitter (-3..3deg)
  const rot = rotate ?? ((h >> 7) % 7) - 3;
  // Stagger flap delay so multiple instances don't sync
  const delay = ((h >> 11) % 14000) / 1000;

  // Perched positioning: the bug's belly/legs hover just above the card edge.
  const cornerClass = {
    tl: "-left-2 -top-9",
    tr: "-right-2 -top-9",
  }[pickedCorner];

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute z-10 ${cornerClass} ${size} ${className}`}
      style={{
        transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rot}deg) scaleX(${scaleX})`,
        transformOrigin: "50% 100%",
      }}
    >
      <img
        src={asset}
        alt=""
        draggable={false}
        className="h-full w-full object-contain animate-wing-flap drop-shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
        style={{ animationDelay: `${delay}s` }}
      />
    </span>
  );
};
