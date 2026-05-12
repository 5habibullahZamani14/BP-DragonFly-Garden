/*
 * Index.tsx — Top-level page component and role dispatcher.
 *
 * This is the single page in the application. Instead of having separate
 * routes for each role (customer, kitchen, payment, manager), I put all
 * role-based rendering here because the URL never changes after the initial
 * QR scan — the role is embedded in the query string, not the path.
 *
 * How role detection works:
 *   The detectRole function reads the ?qr= query parameter and matches it
 *   against four regex patterns. Each pattern corresponds to one role:
 *
 *     table-N          → customer (N is the table number, e.g. table-3)
 *     kitchen-crew-*   → kitchen
 *     payment-counter-*→ payment
 *     manager-*        → manager
 *
 *   If the QR code is missing entirely (e.g. someone just navigates to /),
 *   the app defaults to the customer view with a fake table-1 QR so the
 *   live preview in development shows something meaningful.
 *   If the QR code is present but does not match any pattern, the landing
 *   view is shown — a simple "please scan your table QR" instruction screen.
 *
 * The ?view= override parameter lets developers switch views in the browser
 * without needing to generate real QR codes, which is useful for demoing.
 *
 * Toast notifications:
 *   I implemented a lightweight custom toast system here (the toast state
 *   and notify callback) rather than importing a library, because I only
 *   need a simple success/error banner at the top of the screen. The Sonner
 *   library is used by Shadcn components internally, but for the main view
 *   transitions and order confirmations I wanted full control over the styling.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { GardenAtmosphere } from "@/components/garden/GardenAtmosphere";
import { LandingView } from "@/components/garden/LandingView";
import { CustomerView } from "@/components/garden/CustomerView";
import { KitchenView } from "@/components/garden/KitchenView";
import { PaymentCounterView } from "@/components/garden/PaymentCounterView";
import { ManagementView } from "@/components/garden/ManagementView";
import { CheckCircle2, AlertTriangle } from "lucide-react";

/* QR code patterns — must match the patterns used in the backend middleware. */
const TABLE_QR_PATTERN = /^table-\d+$/;
const KITCHEN_QR_PATTERN = /^kitchen-crew-[a-z0-9_-]+$/i;
const PAYMENT_QR_PATTERN = /^payment-counter-[a-z0-9_-]+$/i;
const MANAGER_QR_PATTERN = /^manager-[a-z0-9_-]+$/i;

type Role = "landing" | "customer" | "kitchen" | "payment" | "manager";

/*
 * detectRole reads the current URL and returns the role and QR code string.
 * It is memoised via useMemo in the component so it only runs once on mount,
 * not on every re-render.
 */
const detectRole = (): { role: Role; qrCode: string } => {
  const params = new URLSearchParams(window.location.search);
  const qr = (params.get("qr") || "").trim().toLowerCase();
  if (MANAGER_QR_PATTERN.test(qr)) return { role: "manager", qrCode: qr };
  if (KITCHEN_QR_PATTERN.test(qr)) return { role: "kitchen", qrCode: qr };
  if (PAYMENT_QR_PATTERN.test(qr)) return { role: "payment", qrCode: qr };
  if (TABLE_QR_PATTERN.test(qr)) return { role: "customer", qrCode: qr };
  /* Default to customer preview if no QR is present (development convenience). */
  if (!qr) return { role: "customer", qrCode: "table-1" };
  return { role: "landing", qrCode: "" };
};

const Index = () => {
  /* Set the page title and meta description for SEO and browser tab readability. */
  useEffect(() => {
    document.title = "BP Dragonfly Garden — Farm-to-table ordering";
    const meta = document.querySelector('meta[name="description"]') || document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", "Order from your table at BP Dragonfly Garden — botanical farm-to-table cafe. Where nature, fun & memories grow.");
    if (!meta.parentElement) document.head.appendChild(meta);
  }, []);

  const initial = useMemo(detectRole, []);

  /*
   * The toast state drives a small banner shown at the top of the screen.
   * The key field forces React to re-mount the element (resetting its CSS
   * animation) even if two consecutive toasts have the same message.
   */
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string; key: number } | null>(null);

  const notify = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text, key: Date.now() });
  }, []);

  /* Auto-dismiss the toast after 2.8 seconds. */
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  /*
   * The ?view= override bypasses QR detection — useful during development
   * to quickly switch between views without needing physical QR codes.
   */
  const view = new URLSearchParams(window.location.search).get("view");
  const role: Role = (view as Role) || initial.role;
  const qr = role === "manager" ? "manager-demo" : role === "kitchen" ? "kitchen-crew-demo" : role === "payment" ? "payment-counter-demo" : initial.qrCode;

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/*
       * GardenAtmosphere renders the floating leaf and flower particles in the
       * background. It is disabled for the staff views (kitchen, payment,
       * manager) because those views need a clean, distraction-free interface.
       */}
      <GardenAtmosphere disableEffects={role === "payment" || role === "manager" || role === "kitchen"} />

      {/* Toast banner — positioned at the top-centre of the screen. */}
      {toast && (
        <div
          key={toast.key}
          role="status"
          className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 animate-slide-down"
        >
          <div className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-deep)] backdrop-blur ${
            toast.kind === "success"
              ? "bg-primary/95 text-primary-foreground"
              : "bg-berry/95 text-berry-foreground"
          }`}>
            {toast.kind === "success" ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <AlertTriangle className="h-4 w-4" />}
            {toast.text}
          </div>
        </div>
      )}

      {/* Render exactly one view based on the detected role. */}
      {role === "manager" && <ManagementView qrCode={qr} notify={notify} />}
      {role === "kitchen" && <KitchenView qrCode={qr} notify={notify} />}
      {role === "payment" && <PaymentCounterView qrCode={qr} notify={notify} />}
      {role === "customer" && <CustomerView qrCode={qr} notify={notify} />}
      {role === "landing" && <LandingView />}
    </main>
  );
};

export default Index;
