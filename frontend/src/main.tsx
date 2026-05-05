import { createRoot } from "react-dom/client";
import { AccessibilityProvider } from "./lib/useAccessibility";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <AccessibilityProvider>
    <App />
  </AccessibilityProvider>
);
