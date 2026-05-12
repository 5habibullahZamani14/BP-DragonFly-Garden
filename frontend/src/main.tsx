/*
 * main.tsx — React application entry point.
 *
 * This is the very first file that runs when the browser loads the app.
 * It mounts the React component tree into the <div id="root"> element
 * that lives in index.html.
 *
 * I wrap everything in AccessibilityProvider here (in addition to the
 * wrapper inside App.tsx) because main.tsx is the true root of the tree —
 * any component rendered above App would not have access to the provider
 * otherwise. The double-wrap does not cause a problem because React context
 * providers simply override each other at each nesting level.
 */

import { createRoot } from "react-dom/client";
import { AccessibilityProvider } from "./lib/useAccessibility";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <AccessibilityProvider>
    <App />
  </AccessibilityProvider>
);
