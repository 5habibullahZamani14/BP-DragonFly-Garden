import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Clock, ChefHat, BellRing, ArrowRight, KeyRound, LogOut, Loader2 } from "lucide-react";
import { PetalButton } from "./PetalButton";
import { HelpModal, HelpSection } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";
import { fetchKitchenOrders, updateOrderStatus, fetchKitchenPasscode } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import type { Order } from "@/lib/menu-data";

const STAGES = ["queue", "preparing", "ready"] as const;
const NEXT: Record<string, string | null> = { queue: "preparing", preparing: "ready", ready: null };
const STAGE_META: Record<string, { label: string; icon: typeof Clock; tint: string }> = {
  queue: { label: "Queue", icon: Clock, tint: "text-berry" },
  preparing: { label: "Cooking", icon: ChefHat, tint: "text-accent" },
  ready: { label: "Ready", icon: BellRing, tint: "text-leaf" },
};

// Session duration: 7 days in milliseconds
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_PASSCODE = 'kitchen2024'; // used if API is unreachable

const formatRM = (v: number) => `RM ${(Number(v) || 0).toFixed(2)}`;

interface Props { qrCode: string; notify: (k: "success" | "error", t: string) => void; }

export const KitchenView = ({ qrCode, notify }: Props) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [kitchenPasscode, setKitchenPasscode] = useState(FALLBACK_PASSCODE);
  const [passcodeLoading, setPasscodeLoading] = useState(true);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<typeof STAGES[number]>("queue");

  // Load passcode from API on mount
  useEffect(() => {
    fetchKitchenPasscode()
      .then((p) => setKitchenPasscode(p))
      .catch(() => { /* keep fallback */ })
      .finally(() => setPasscodeLoading(false));
  }, []);

  // Restore session from localStorage (7-day expiry)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kitchenSession");
      if (saved) {
        const { expiry } = JSON.parse(saved);
        if (Date.now() < expiry) {
          setIsLoggedIn(true);
        } else {
          localStorage.removeItem("kitchenSession");
        }
      }
    } catch {
      localStorage.removeItem("kitchenSession");
    }
  }, []);

  const handleLogin = () => {
    if (passcodeInput === kitchenPasscode) {
      localStorage.setItem("kitchenSession", JSON.stringify({
        expiry: Date.now() + SESSION_DURATION_MS,
      }));
      setIsLoggedIn(true);
      setLoginError(false);
    } else {
      setLoginError(true);
      setPasscodeInput("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("kitchenSession");
    setIsLoggedIn(false);
    setPasscodeInput("");
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await fetchKitchenOrders(qrCode);
    setOrders(data);
    if (!silent) setLoading(false);
  }, [qrCode]);

  useEffect(() => {
    if (isLoggedIn) load();
  }, [load, isLoggedIn]);

  useWebSocket(["NEW_ORDER", "ORDER_STATUS_UPDATE"], () => {
    if (isLoggedIn) load(true);
  });

  const grouped = useMemo(() =>
    STAGES.map((s) => ({ status: s, orders: orders.filter((o) => o.status === s) })),
    [orders]);

  const advance = async (id: number, status: string) => {
    setUpdating(id);
    const o = await updateOrderStatus(qrCode, id, status);
    if (o) {
      setOrders((cur) => cur.map((x) => (x.id === id ? o : x)));
    } else {
      setOrders((cur) => cur.map((x) => (x.id === id ? { ...x, status: status as Order["status"] } : x)));
    }
    setUpdating(null);
  };

  // ─── Login screen ────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
        {/* Top bar with Settings + Help always accessible */}
        <div className="fixed top-4 left-4 right-4 flex justify-between items-center z-10">
          <SettingsModal />
          <HelpModal title="Kitchen Crew" sections={kitchenHelpSections} />
        </div>

        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="card-paper rounded-[28px] p-8 animate-fade-up">
            <div className="flex flex-col items-center gap-3 mb-8">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10">
                <ChefHat className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <h1 className="font-display text-2xl font-semibold">Kitchen Access</h1>
                <p className="mt-1 text-sm text-foreground/55">
                  Enter the kitchen passcode to continue.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="kitchen-passcode" className="text-xs font-semibold uppercase tracking-widest text-foreground/50">
                  Passcode
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                  <input
                    id="kitchen-passcode"
                    type="password"
                    value={passcodeInput}
                    onChange={(e) => { setPasscodeInput(e.target.value); setLoginError(false); }}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    placeholder="Enter passcode..."
                    className={`w-full rounded-xl border bg-background py-3 pl-10 pr-4 text-sm placeholder:text-foreground/35 focus:outline-none focus:ring-2 focus:ring-ring transition ${loginError ? "border-destructive focus:ring-destructive/50" : "border-border"}`}
                  />
                </div>
                {loginError && (
                  <p className="text-xs text-destructive font-medium">Incorrect passcode. Please try again.</p>
                )}
              </div>

              <PetalButton variant="emerald" size="lg" onClick={handleLogin} disabled={passcodeLoading} className="w-full">
                {passcodeLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...</> : <>Enter Kitchen Board</>}
              </PetalButton>
            </div>

            <p className="mt-5 text-center text-[0.65rem] text-foreground/35">
              Your session will be remembered for 7 days.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main kitchen board ───────────────────────────────────────────────────
  const visible = grouped.find((g) => g.status === activeTab)!;

  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl pb-16">
      <header className="relative px-5 pt-10 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <span className="eyebrow">Kitchen board</span>
            <h1 className="mt-2 font-display text-4xl font-semibold leading-[0.95]">
              Service<br />
              <span className="italic text-accent">in motion</span>
            </h1>
          </div>
          <div className="flex gap-2 items-center">
            <SettingsModal />
            <HelpModal title="Kitchen Crew" sections={kitchenHelpSections} />
            <button
              onClick={() => load()}
              className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-soft)] transition active:scale-90"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleLogout}
              title="Log out"
              className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground/60 shadow-[var(--shadow-soft)] transition hover:bg-muted/80 active:scale-90"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Stage tabs */}
      <div className="sticky top-0 z-20 px-5 pb-3 pt-2 backdrop-blur-md"
        style={{ background: "linear-gradient(hsl(var(--background)/0.95), hsl(var(--background)/0.7))" }}>
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/70 p-1.5">
          {grouped.map((g) => {
            const meta = STAGE_META[g.status];
            const Icon = meta.icon;
            const active = g.status === activeTab;
            return (
              <button
                key={g.status}
                onClick={() => setActiveTab(g.status)}
                className={`relative flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition ${
                  active ? "bg-background shadow-[var(--shadow-soft)]" : "text-foreground/60"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? meta.tint : ""}`} />
                <span className="uppercase tracking-wider">{meta.label}</span>
                <span className={`absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full px-1 text-[0.6rem] font-bold ${
                  g.orders.length > 0 ? "bg-berry text-berry-foreground" : "bg-muted text-foreground/40"
                }`}>
                  {g.orders.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tickets */}
      <div className="px-5 pt-4">
        {visible.orders.length === 0 ? (
          <div className="relative rounded-3xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-muted">
              {(() => { const Icon = STAGE_META[visible.status].icon; return <Icon className="h-6 w-6 text-foreground/40" />; })()}
            </div>
            <p className="font-display text-lg text-foreground/60">No orders here</p>
            <p className="mt-1 text-sm text-foreground/40">All caught up — beautiful.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.orders.map((o, idx) => {
              const meta = STAGE_META[o.status];
              const next = NEXT[o.status];
              return (
                <li
                  key={o.id}
                  className="overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-card)] animate-fade-up"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-center justify-between border-b border-border bg-primary/5 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`grid h-10 w-10 place-items-center rounded-full bg-background ${meta.tint}`}>
                        <meta.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[0.62rem] font-bold uppercase tracking-widest text-foreground/50">{o.table_number}</p>
                        <h3 className="font-display text-lg font-semibold leading-tight">Order #{o.id}</h3>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.62rem] uppercase tracking-widest text-foreground/40">Total</p>
                      <strong className="font-display text-lg">{formatRM(o.total_price)}</strong>
                    </div>
                  </div>

                  <ul className="divide-y divide-border/60 px-5 py-3">
                    {o.items.map((it) => (
                      <li key={it.id} className="flex items-start gap-3 py-2">
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/15 font-mono-cute text-sm font-semibold text-accent-foreground">
                          {it.quantity}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-tight">{it.item_name}</p>
                          {it.notes && (
                            <p className="mt-0.5 text-xs text-berry">↳ {it.notes}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {next && (
                    <div className="border-t border-border bg-background px-5 py-3">
                      <PetalButton
                        variant={next === "ready" ? "gold" : "emerald"}
                        size="md"
                        disabled={updating === o.id}
                        onClick={() => advance(o.id, next)}
                        className="w-full"
                      >
                        Mark as {next} <ArrowRight className="h-4 w-4" />
                      </PetalButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

const kitchenHelpSections: HelpSection[] = [
  {
    id: "access",
    title: "1. Accessing the Kitchen Board",
    content: (
      <div className="space-y-2">
        <p>The Kitchen Board is protected by a passcode. Enter the passcode provided by your manager to gain access.</p>
        <p><strong>Your session is remembered for 7 days.</strong> You will not need to enter the passcode again until the session expires or you manually log out using the logout button (↪ icon) in the top-right corner.</p>
      </div>
    )
  },
  {
    id: "overview",
    title: "2. Understanding the Kitchen Board",
    content: (
      <div className="space-y-2">
        <p>This is your digital order board. It updates automatically in real time so you never miss an incoming order. There are three stages:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Queue (Red):</strong> New orders sent by customers. They have not been started yet.</li>
          <li><strong>Cooking (Orange):</strong> Orders that a chef has claimed and is currently preparing.</li>
          <li><strong>Ready (Green):</strong> Completed orders waiting to be served by the Waiters.</li>
        </ul>
      </div>
    )
  },
  {
    id: "moving-orders",
    title: "3. How to Process an Order",
    content: (
      <div className="space-y-2">
        <p>When an order arrives in the <strong>Queue</strong>, follow these steps:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Read the ticket carefully. You will see the Table number, the items, quantities, and any specific notes/customisations requested by the customer.</li>
          <li>When you are ready to start cooking, click the <strong>Start Cooking</strong> button at the bottom of the ticket. This instantly moves the ticket to the "Cooking" tab.</li>
          <li>Once the food is fully prepared and ready to leave the kitchen, click <strong>Mark Ready</strong>. This alerts the service staff to come pick it up.</li>
        </ol>
      </div>
    )
  },
  {
    id: "auto-refresh",
    title: "4. Refreshing the Board",
    content: (
      <div className="space-y-2">
        <p>The kitchen board updates automatically in real time via a live connection. New orders appear instantly without you needing to touch the screen.</p>
        <p>If you ever feel something looks out of sync, tap the <strong>Refresh (circular arrow)</strong> button in the top-right corner to force an immediate reload.</p>
      </div>
    )
  },
  {
    id: "settings",
    title: "5. Display Settings",
    content: (
      <div className="space-y-2">
        <p>Tap the <strong>⚙️ Settings icon</strong> in the top-left corner to open Display Settings. From there you can:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Switch between three font styles (Clarity, Classic, Elegance).</li>
          <li>Adjust the overall Interface Size larger or smaller.</li>
          <li>Adjust the Text Size independently.</li>
        </ul>
        <p>All settings are saved automatically and will be remembered the next time you use the app.</p>
      </div>
    )
  },
];
