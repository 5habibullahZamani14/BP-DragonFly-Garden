/*
 * WingedAccent.tsx — Decorative insect perched on card corners.
 *
 * This component places a small dragonfly or butterfly image on the top
 * corner of a card or button to give the UI its characteristic garden feel.
 * The parent element must have position: relative (or absolute/fixed) for
 * the absolute positioning to work correctly.
 *
 * The creature to show, which corner to use, and whether to mirror the image
 * are all derived deterministically from the seed string using a simple hash
 * function. This means the same menu item always shows the same creature in
 * the same corner, giving the layout a consistent but varied look — without
 * needing to hardcode a creature for each item.
 *
 * The hash function is a variant of FNV-1a (Fowler-Noll-Vo), which produces
 * a well-distributed 32-bit integer from any string input. Using Math.imul
 * keeps the multiplication within 32-bit integer bounds in JavaScript.
 *
 * Corner placement rules:
 *   A creature whose PNG faces LEFT is placed on the TOP-RIGHT corner so it
 *   appears to look inward toward the card content. A creature facing RIGHT
 *   is placed on the TOP-LEFT. Mirroring flips the facing direction, so the
 *   corner assignment is derived from the final (post-mirror) facing.
 *
 * The wing-flap animation plays continuously but at a slow duty cycle so the
 * creature appears still most of the time, then briefly flutters. The
 * animationDelay is derived from the hash so multiple instances do not all
 * flap in synchrony.
 */

import dragonflySide from "@/assets/dragonfly-side.png";
import dragonflySide2 from "@/assets/dragonfly-side-2.png";
import dragonflyPerched from "@/assets/dragonfly-perched.png";
import butterflySide from "@/assets/butterfly-side.png";

/* Four creature assets — 3 dragonflies and 1 butterfly. */
const ASSETS: { src: string; naturalFacing: "left" | "right" }[] = [
  { src: dragonflySide, naturalFacing: "left" },
  { src: dragonflySide2, naturalFacing: "left" },
  { src: dragonflyPerched, naturalFacing: "right" },
  { src: butterflySide, naturalFacing: "left" },
];

/* FNV-1a hash — maps any string to a stable unsigned 32-bit integer. */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

interface WingedAccentProps {
  /** Stable seed — controls which creature, corner, flip, and rotation are chosen. */
  seed: string;
  /** Tailwind size classes, default h-20 w-20. */
  size?: string;
  /** Override the seed-chosen corner. Only top corners are supported. */
  corner?: "tl" | "tr";
  /** Override the seed-chosen horizontal flip. */
  flip?: boolean;
  /** Override the seed-derived rotation (in degrees). */
  rotate?: number;
  /** Horizontal offset in px on top of the corner anchor (negative = left). */
  offsetX?: number;
  /** Vertical offset in px on top of the corner anchor (negative = up). */
  offsetY?: number;
  className?: string;
}

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

  /* Determine mirroring, then derive the final facing direction. */
  const mirror = flip ?? ((h >> 5) & 1) === 1;
  const finalFacing: "left" | "right" =
    mirror ? (naturalFacing === "left" ? "right" : "left") : naturalFacing;

  /* A left-facing creature looks inward from the top-right; right-facing from top-left. */
  const pickedCorner = corner ?? (finalFacing === "left" ? "tr" : "tl");
  const scaleX = mirror ? -1 : 1;

  /* Tiny rotation jitter (−3° to +3°) makes the perch look more natural. */
  const rot = rotate ?? ((h >> 7) % 7) - 3;

  /* Stagger the flap animation so multiple instances on screen do not sync. */
  const delay = ((h >> 11) % 14000) / 1000;

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
