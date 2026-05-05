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
  const [fontTheme, setFontTheme] = useState<FontTheme>(() => {
    return (localStorage.getItem("a11y-font-theme") as FontTheme) || "font-3";
  });
  const [uiScale, setUiScale] = useState<number>(() => {
    return parseFloat(localStorage.getItem("a11y-ui-scale") || "1");
  });
  const [fontScale, setFontScale] = useState<number>(() => {
    return parseFloat(localStorage.getItem("a11y-font-scale") || "1");
  });

  useEffect(() => {
    localStorage.setItem("a11y-font-theme", fontTheme);
    
    let displayFont = "'Fraunces', serif";
    let sansFont = "'Lexend', sans-serif";
    let bodyWeight = "400";

    if (fontTheme === "font-1") {
      // Clarity — maximum readability
      displayFont = "'Inter', sans-serif";
      sansFont = "'Inter', sans-serif";
      bodyWeight = "400";
    } else if (fontTheme === "font-2") {
      // Classic — Fraunces + Lexend at normal weight (same feel as the default app)
      displayFont = "'Fraunces', serif";
      sansFont = "'Lexend', sans-serif";
      bodyWeight = "400";
    }
    // font-3 (Elegance) = Fraunces + Lexend at light weight (300) — thin, airy, luxury
    // displayFont and sansFont already set to Fraunces/Lexend above
    if (fontTheme === "font-3") {
      bodyWeight = "300";
    }

    document.documentElement.style.setProperty("--font-display", displayFont);
    document.documentElement.style.setProperty("--font-sans", sansFont);
    document.documentElement.style.setProperty("--body-weight", bodyWeight);
  }, [fontTheme]);

  useEffect(() => {
    localStorage.setItem("a11y-ui-scale", uiScale.toString());
    document.documentElement.style.setProperty("--ui-scale", uiScale.toString());
  }, [uiScale]);

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

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error("useAccessibility must be used within an AccessibilityProvider");
  }
  return context;
};
