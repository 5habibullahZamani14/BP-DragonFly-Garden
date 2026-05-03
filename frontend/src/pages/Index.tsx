import { useCallback, useEffect, useMemo, useState } from "react";
import { GardenAtmosphere } from "@/components/garden/GardenAtmosphere";
import { LandingView } from "@/components/garden/LandingView";
import { CustomerView } from "@/components/garden/CustomerView";
import { KitchenView } from "@/components/garden/KitchenView";
import { PaymentCounterView } from "@/components/garden/PaymentCounterView";
import { CheckCircle2, AlertTriangle } from "lucide-react";

const TABLE_QR_PATTERN = /^table-\d+$/;
const KITCHEN_QR_PATTERN = /^kitchen-crew-[a-z0-9_-]+$/i;
const PAYMENT_QR_PATTERN = /^payment-counter-[a-z0-9_-]+$/i;

type Role = "landing" | "customer" | "kitchen" | "payment";

const detectRole = (): { role: Role; qrCode: string } => {
  const params = new URLSearchParams(window.location.search);
  const qr = (params.get("qr") || "").trim().toLowerCase();
  if (KITCHEN_QR_PATTERN.test(qr)) return { role: "kitchen", qrCode: qr };
  if (PAYMENT_QR_PATTERN.test(qr)) return { role: "payment", qrCode: qr };
  if (TABLE_QR_PATTERN.test(qr)) return { role: "customer", qrCode: qr };
  // Friendly preview default: customer view, fake table-1, so the live preview is rich
  if (!qr) return { role: "customer", qrCode: "table-1" };
  return { role: "landing", qrCode: "" };
};

const Index = () => {
  // SEO
  useEffect(() => {
    document.title = "BP Dragonfly Garden — Farm-to-table ordering";
    const meta = document.querySelector('meta[name="description"]') || document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", "Order from your table at BP Dragonfly Garden — botanical farm-to-table cafe. Where nature, fun & memories grow.");
    if (!meta.parentElement) document.head.appendChild(meta);
  }, []);

  const initial = useMemo(detectRole, []);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string; key: number } | null>(null);

  const notify = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Allow quick role switch via ?view=kitchen or ?view=payment for preview demoing
  const view = new URLSearchParams(window.location.search).get("view");
  const role: Role = (view as Role) || initial.role;
  const qr = role === "kitchen" ? "kitchen-crew-demo" : role === "payment" ? "payment-counter-demo" : initial.qrCode;

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <GardenAtmosphere disableEffects={role === "payment"} />

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

      {role === "kitchen" && <KitchenView qrCode={qr} notify={notify} />}
      {role === "payment" && <PaymentCounterView qrCode={qr} notify={notify} />}
      {role === "customer" && <CustomerView qrCode={qr} notify={notify} />}
      {role === "landing" && <LandingView />}
    </main>
  );
};

export default Index;
