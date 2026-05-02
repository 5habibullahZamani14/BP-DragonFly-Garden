import { useEffect, useState, type CSSProperties } from "react";

/** Floating dragonflies & drifting leaves & flowers — pure CSS, lightweight, decorative only. */
export const GardenAtmosphere = ({ disableEffects = false }: { disableEffects?: boolean }) => {
  const [leaves, setLeaves] = useState<{ id: number; left: number; delay: number; dur: number; hue: number }[]>([]);
  const [flowers, setFlowers] = useState<{ id: number; left: number; delay: number; dur: number; size: number; sway: number }[]>([]);

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
      {/* Soft sun-glow top right */}
      <div
        className="absolute -top-32 -right-32 h-80 w-80 rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(circle, hsl(38 90% 65%), transparent 70%)" }}
      />
      {/* Mossy bottom-left */}
      <div
        className="absolute -bottom-40 -left-32 h-96 w-96 rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(circle, hsl(152 45% 30%), transparent 70%)" }}
      />
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
                ['--sway' as string]: `${f.sway}px`,
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

/** Top-down dragonfly brand mark — used as an icon throughout the app. */
export const DragonflyMark = ({ className = "" }: { className?: string }) => (
  <img
    src={dragonflyTop}
    alt=""
    aria-hidden="true"
    className={`object-contain ${className}`}
    draggable={false}
  />
);

