/*
 * GardenAtmosphere.tsx — Decorative background animations and brand mark.
 *
 * This file exports two components:
 *
 *   GardenAtmosphere — The full-screen animated background layer. It renders
 *     soft glowing blobs (sun and moss), drifting leaves, and falling flowers.
 *     All elements are purely decorative, marked aria-hidden, and use
 *     pointer-events: none so they never interfere with interaction.
 *     The leaf and flower arrays are generated once on mount (in useEffect)
 *     with randomised positions, speeds, and sizes. I store them in state
 *     rather than computing them at render time so they stay stable across
 *     re-renders without causing layout thrash.
 *     The disableEffects prop lets staff views (kitchen, payment, manager)
 *     opt out of the particle animations — the glow blobs still show but
 *     the moving elements are suppressed for a cleaner working interface.
 *
 *   DragonflyMark — A small dragonfly image used as a brand icon throughout
 *     the app (navigation headers, loading states). It is marked aria-hidden
 *     because it is always accompanied by visible text labelling the context.
 */

import { useEffect, useState, type CSSProperties } from "react";

export const GardenAtmosphere = ({ disableEffects = false }: { disableEffects?: boolean }) => {
  const [leaves, setLeaves] = useState<{ id: number; left: number; delay: number; dur: number; hue: number }[]>([]);
  const [flowers, setFlowers] = useState<{ id: number; left: number; delay: number; dur: number; size: number; sway: number }[]>([]);

  /* Generate random particle data once on mount. */
  useEffect(() => {
    const arr = Array.from({ length: 7 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 14,
      dur: (18 + Math.random() * 14) / 0.7,
      hue: 80 + Math.random() * 40,
    }));
    setLeaves(arr);

    const flowerArr = Array.from({ length: 6 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 18,
      dur: (22 + Math.random() * 16) / 0.7,
      size: 14 + Math.random() * 14,
      sway: 6 + Math.random() * 8,
    }));
    setFlowers(flowerArr);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Warm sun-glow in the top-right corner — always visible. */}
      <div
        className="absolute -top-32 -right-32 h-80 w-80 rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(circle, hsl(38 90% 65%), transparent 70%)" }}
      />
      {/* Cool mossy glow in the bottom-left — always visible. */}
      <div
        className="absolute -bottom-40 -left-32 h-96 w-96 rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(circle, hsl(152 45% 30%), transparent 70%)" }}
      />

      {/* Drifting leaves — disabled for staff views. */}
      {!disableEffects && leaves.map((l) => (
        <svg
          key={l.id}
          viewBox="0 0 24 24"
          className="absolute -top-10 h-4 w-4 opacity-60"
          style={{
            left: `${l.left}%`,
            color: `hsl(${l.hue} 40% 40%)`,
            animation: `leaf-drift ${l.dur}s linear ${l.delay}s infinite`,
          }}
        >
          <path
            fill="currentColor"
            d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"
          />
        </svg>
      ))}

      {/* Falling flowers — disabled for staff views. */}
      {!disableEffects && flowers.map((f) => (
        <div
          key={`f-${f.id}`}
          className="absolute -top-12"
          style={{
            left: `${f.left}%`,
            animation: `flower-fall ${f.dur}s linear ${f.delay}s infinite`,
          }}
        >
          <div
            style={
              {
                animation: `flower-sway ${3 + (f.id % 3)}s ease-in-out infinite alternate`,
                ["--sway" as string]: `${f.sway}px`,
              } as CSSProperties
            }
          >
            <svg
              viewBox="0 0 40 40"
              width={f.size}
              height={f.size}
              className="opacity-80 drop-shadow-[0_2px_4px_rgba(80,60,30,0.25)]"
              style={{ animation: `flower-spin ${10 + (f.id % 5) * 2}s linear infinite` }}
            >
              <g>
                {/* Five petals rotated 72° apart form a simple daisy shape. */}
                {[0, 72, 144, 216, 288].map((deg) => (
                  <ellipse
                    key={deg}
                    cx="20"
                    cy="12"
                    rx="5.2"
                    ry="8.5"
                    transform={`rotate(${deg} 20 20)`}
                    fill="hsl(50 40% 97%)"
                    stroke="hsl(45 25% 80%)"
                    strokeWidth="0.4"
                    opacity="0.95"
                  />
                ))}
                <circle cx="20" cy="20" r="2.6" fill="hsl(45 90% 65%)" />
                <circle cx="20" cy="20" r="1.2" fill="hsl(35 85% 55%)" />
              </g>
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
};

import dragonflyTop from "@/assets/dragonfly-top.png";

/*
 * DragonflyMark renders the top-down dragonfly PNG as a brand icon.
 * It is always aria-hidden because it appears alongside visible text
 * and has no standalone meaning that needs to be conveyed to screen readers.
 */
export const DragonflyMark = ({ className = "" }: { className?: string }) => (
  <img
    src={dragonflyTop}
    alt=""
    aria-hidden="true"
    className={`object-contain ${className}`}
    draggable={false}
  />
);
