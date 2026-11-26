/*
 * Index.tsx — Top-level page component and role dispatcher.
 *
 * Customer table ordering is intentionally the only entry path driven by a
 * table QR code. Staff and manager access is handled through dedicated login
 * screens that require username/password verification and a server-issued JWT.
 *
 * Role detection rules:
 *   - ?qr=table-<random secret> → customer session bootstrap
 *   - ?view=customer&table=<id> → existing HttpOnly table session
 *   - ?view=payment → payment counter login screen
 *   - ?view=manager → manager login screen
 *
 * Any legacy manager/payment QR strings are rejected so they cannot be used
 * as an authentication shortcut.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { GardenAtmosphere } from "@/components/garden/GardenAtmosphere";
import { ServerConnectionNotice } from "@/components/ServerConnectionNotice";
import {
  isServerConnectionOutage,
  useServerConnectionNotice,
} from "@/lib/useServerConnectionNotice";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

const LandingView = lazy(() => import("@/components/garden/LandingView").then(({ LandingView }) => ({ default: LandingView })));
const CustomerView = lazy(() => import("@/components/garden/CustomerView").then(({ CustomerView }) => ({ default: CustomerView })));
const PaymentCounterView = lazy(() => import("@/components/garden/PaymentCounterView").then(({ PaymentCounterView }) => ({ default: PaymentCounterView })));
const ManagementView = lazy(() => import("@/components/garden/ManagementView").then(({ ManagementView }) => ({ default: ManagementView })));

const TABLE_QR_PATTERN = /^table-[a-f0-9]{64}$/i;
const LEGACY_PRIVILEGED_QR_PATTERN = /^(payment-counter|manager)-[a-z0-9_-]+$/i;

type Role = "landing" | "customer" | "payment" | "manager";

const detectRole = (): { role: Role; qrCode: string; tableStorageKey: string } => {
  const params = new URLSearchParams(window.location.search);
  const view = (params.get("view") || "").trim().toLowerCase();
  const qr = (params.get("qr") || "").trim().toLowerCase();
  const tableId = Number(params.get("table"));
  const tableStorageKey = Number.isSafeInteger(tableId) && tableId > 0 ? `table-${tableId}` : "";

  if (view === "manager") return { role: "manager", qrCode: "", tableStorageKey: "" };
  if (view === "payment") return { role: "payment", qrCode: "", tableStorageKey: "" };

  if (LEGACY_PRIVILEGED_QR_PATTERN.test(qr)) {
    return { role: "landing", qrCode: "", tableStorageKey: "" };
  }

  if (TABLE_QR_PATTERN.test(qr)) {
    return { role: "customer", qrCode: qr, tableStorageKey: tableStorageKey || qr };
  }

  if (view === "customer" && tableStorageKey) {
    return { role: "customer", qrCode: tableStorageKey, tableStorageKey };
  }

  if (!qr && !view) {
    return { role: "landing", qrCode: "", tableStorageKey: "" };
  }

  return { role: "landing", qrCode: "", tableStorageKey: "" };
};

const Index = () => {
  /* Set the page title and meta description for SEO and browser tab readability. */
  useEffect(() => {
    document.title = "BP Dragonfly Garden";
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
  const connectionNotice = useServerConnectionNotice();

  const notify = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text, key: Date.now() });
  }, []);

  /* Auto-dismiss the toast after 2.8 seconds. */
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const role: Role = initial.role;
  const qr = initial.qrCode;
  const tableStorageKey = initial.tableStorageKey;

  if (isServerConnectionOutage(connectionNotice)) {
    return (
      <main className="relative min-h-screen overflow-x-clip">
        <ServerConnectionNotice kind={connectionNotice} />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-clip">
      <ServerConnectionNotice kind={connectionNotice} />

      {/*
       * GardenAtmosphere renders the floating leaf and flower particles in the
       * background. It is disabled for the staff views (payment and manager)
       * because those views need a clean, distraction-free interface.
       */}
      <GardenAtmosphere disableEffects={role === "payment" || role === "manager"} />

      {/* Toast banner — positioned at the top-centre of the screen. */}
      {toast && (
        <div
          key={toast.key}
          role="status"
          className={`fixed left-1/2 z-[60] -translate-x-1/2 animate-slide-down ${
            connectionNotice ? "top-40" : "top-4"
          }`}
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
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center" role="status">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="sr-only">Loading application view</span>
          </div>
        }
      >
        {role === "manager" && <ManagementView qrCode={qr} notify={notify} />}
        {role === "payment" && <PaymentCounterView qrCode={qr} notify={notify} />}
        {role === "customer" && <CustomerView qrCode={qr} tableStorageKey={tableStorageKey} notify={notify} />}
        {role === "landing" && <LandingView />}
      </Suspense>
    </main>
  );
};

export default Index;
