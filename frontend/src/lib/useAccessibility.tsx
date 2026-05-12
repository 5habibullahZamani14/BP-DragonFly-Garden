/*
 * useAccessibility.tsx — Global accessibility context and provider.
 *
 * This context provides font theme and scale controls that persist across
 * page reloads. The settings are stored in localStorage and applied as CSS
 * custom properties on the <html> element so every component in the tree
 * inherits them without needing to read from context directly.
 *
 * Three settings are managed here:
 *
 *   fontTheme   — Controls which font pair is used across the app.
 *                 "font-1" (Clarity): Inter for both display and body —
 *                   maximum readability, ideal for users who find serif fonts
 *                   harder to read.
 *                 "font-2" (Classic): Fraunces (display) + Lexend (body) at
 *                   normal weight — the default garden aesthetic.
 *                 "font-3" (Elegance): Same pair at weight 300 — thinner,
 *                   airier, luxury feel. This is the app's default.
 *
 *   uiScale     — A multiplier applied to the --ui-scale CSS property, which
 *                 scales interactive element sizes (buttons, cards). Range 0.8–1.4.
 *
 *   fontScale   — A multiplier applied to --font-scale, which scales all text
 *                 sizes. Range 0.8–1.4. Separate from uiScale so users can
 *                 increase text size without inflating the whole layout.
 *
 * All three settings are applied immediately when changed via useEffect hooks
 * that write CSS custom properties to document.documentElement. Components
 * that use these properties in their CSS (e.g. `font-size: calc(1rem * var(--font-scale))`)
 * update automatically without any re-render.
 */

import React, { createContext, useContext, useEffect, useState } from "react";

export type FontTheme = "font-1" | "font-2" | "font-3";

interface AccessibilityContextType {
  fontTheme: FontTheme;
  setFontTheme: (theme: FontTheme) => void;
  uiScale: number;
  setUiScale: (scale: number) => void;
  fontScale: number;
  setFontScale: (scale: number) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /* Initialise from localStorage so the user's last preference is restored on load. */
  const [fontTheme, setFontTheme] = useState<FontTheme>(() => {
    return (localStorage.getItem("a11y-font-theme") as FontTheme) || "font-3";
  });
  const [uiScale, setUiScale] = useState<number>(() => {
    return parseFloat(localStorage.getItem("a11y-ui-scale") || "1");
  });
  const [fontScale, setFontScale] = useState<number>(() => {
    return parseFloat(localStorage.getItem("a11y-font-scale") || "1");
  });

  /* Apply font theme changes to CSS variables and persist to localStorage. */
  useEffect(() => {
    localStorage.setItem("a11y-font-theme", fontTheme);

    let displayFont = "'Fraunces', serif";
    let sansFont = "'Lexend', sans-serif";
    let bodyWeight = "400";

    if (fontTheme === "font-1") {
      /* Clarity mode: single sans-serif font for everything. */
      displayFont = "'Inter', sans-serif";
      sansFont = "'Inter', sans-serif";
      bodyWeight = "400";
    } else if (fontTheme === "font-2") {
      /* Classic mode: Fraunces + Lexend at regular weight. */
      displayFont = "'Fraunces', serif";
      sansFont = "'Lexend', sans-serif";
      bodyWeight = "400";
    }
    /* Elegance (font-3): same fonts as Classic but at weight 300 for a lighter feel. */
    if (fontTheme === "font-3") {
      bodyWeight = "300";
    }

    document.documentElement.style.setProperty("--font-display", displayFont);
    document.documentElement.style.setProperty("--font-sans", sansFont);
    document.documentElement.style.setProperty("--body-weight", bodyWeight);
  }, [fontTheme]);

  /* Apply UI scale and persist. */
  useEffect(() => {
    localStorage.setItem("a11y-ui-scale", uiScale.toString());
    document.documentElement.style.setProperty("--ui-scale", uiScale.toString());
  }, [uiScale]);

  /* Apply font scale and persist. */
  useEffect(() => {
    localStorage.setItem("a11y-font-scale", fontScale.toString());
    document.documentElement.style.setProperty("--font-scale", fontScale.toString());
  }, [fontScale]);

  return (
    <AccessibilityContext.Provider
      value={{
        fontTheme,
        setFontTheme,
        uiScale,
        setUiScale,
        fontScale,
        setFontScale,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
};

/*
 * useAccessibility is the consumer hook. Any component that needs to read or
 * change accessibility settings imports this and calls it inside the component.
 * It throws if called outside the AccessibilityProvider tree.
 */
export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error("useAccessibility must be used within an AccessibilityProvider");
  }
  return context;
};
