import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, ChefHat, BellRing, KeyRound, LogOut, Loader2, Archive, ChevronDown, ChevronUp } from "lucide-react";
import { PetalButton } from "./PetalButton";
import { HelpModal, HelpSection } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";
import { fetchKitchenOrders, updateItemStatus, fetchKitchenPasscode, kitchenArchiveOrder, fetchKitchenArchivedOrders } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import type { Order } from "@/lib/menu-data";

const STAGES = ["queue", "preparing", "ready"] as const;
const STAGE_META: Record<string, { label: string; icon: typeof Clock; tint: string }> = {
  queue:    { label: "Queue",   icon: Clock,    tint: "text-berry" },
  preparing:{ label: "Cooking", icon: ChefHat,  tint: "text-accent" },
  ready:    { label: "Ready",   icon: BellRing, tint: "text-leaf" },
};

const ARCHIVE_SECS = 60; // ready orders auto-archive after 60 seconds

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_PASSCODE = 'kitchen2024';
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
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);

  // ── Archive system ────────────────────────────────────────────────────────
  const [archiveCountdowns, setArchiveCountdowns] = useState<Record<number, number>>({});
  const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const archiveIntervalsRef = useRef<Record<number, ReturnType<typeof setInterval>>>({});

  // Start a 60-second countdown for a ready order
  const startArchiveCountdown = useCallback((orderId: number) => {
    if (archiveIntervalsRef.current[orderId]) return; // already ticking
    setArchiveCountdowns(c => ({ ...c, [orderId]: ARCHIVE_SECS }));
    archiveIntervalsRef.current[orderId] = setInterval(() => {
      setArchiveCountdowns(c => {
        const next = (c[orderId] ?? 1) - 1;
        if (next <= 0) {
          clearInterval(archiveIntervalsRef.current[orderId]);
          delete archiveIntervalsRef.current[orderId];
          // Auto-archive
          kitchenArchiveOrder(qrCode, orderId).then(updated => {
            if (updated) {
              setOrders(cur => cur.filter(o => o.id !== orderId));
              setArchivedOrders(cur => [updated, ...cur]);
            }
          });
          const { [orderId]: _, ...rest } = c;
          return rest;
        }
        return { ...c, [orderId]: next };
      });
    }, 1000);
  }, [qrCode]);

  // Clear countdowns for orders that are no longer in ready state
  const cleanupCountdowns = useCallback((readyIds: Set<number>) => {
    Object.keys(archiveIntervalsRef.current).forEach(k => {
      const id = Number(k);
      if (!readyIds.has(id)) {
        clearInterval(archiveIntervalsRef.current[id]);
        delete archiveIntervalsRef.current[id];
        setArchiveCountdowns(c => { const { [id]: _, ...rest } = c; return rest; });
      }
    });
  }, []);

  // Load passcode
  useEffect(() => {
    fetchKitchenPasscode()
      .then(p => setKitchenPasscode(p))
      .catch(() => {})
      .finally(() => setPasscodeLoading(false));
  }, []);

  // Restore session
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kitchenSession");
      if (saved) {
        const { expiry } = JSON.parse(saved);
        if (Date.now() < expiry) setIsLoggedIn(true);
        else localStorage.removeItem("kitchenSession");
      }
    } catch { localStorage.removeItem("kitchenSession"); }
  }, []);

  const handleLogin = () => {
    if (passcodeInput === kitchenPasscode) {
      localStorage.setItem("kitchenSession", JSON.stringify({ expiry: Date.now() + SESSION_DURATION_MS }));
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

  // On login: load orders AND today's kitchen archive
  useEffect(() => {
    if (!isLoggedIn) return;
    load();
    fetchKitchenArchivedOrders(qrCode).then(setArchivedOrders).catch(() => {});
  }, [load, isLoggedIn, qrCode]);

  useWebSocket(["NEW_ORDER", "ORDER_STATUS_UPDATE", "ITEM_STATUS_UPDATE"], () => {
    if (isLoggedIn) load(true);
  });

  // Start countdowns for every ready order that doesn't have one yet
  useEffect(() => {
    const readyIds = new Set(orders.filter(o => o.status === "ready").map(o => o.id));
    readyIds.forEach(id => startArchiveCountdown(id));
    cleanupCountdowns(readyIds);
  }, [orders, startArchiveCountdown, cleanupCountdowns]);

  // Clear ALL intervals when component unmounts (prevents memory leaks)
  useEffect(() => {
    return () => {
      Object.values(archiveIntervalsRef.current).forEach(clearInterval);
      archiveIntervalsRef.current = {};
    };
  }, []);

  const grouped = useMemo(() =>
    STAGES.map(s => ({ status: s, orders: orders.filter(o => o.status === s) })),
    [orders]);

  const advanceItem = async (orderId: number, itemId: number, currentItemStatus: string) => {
    const next = currentItemStatus === "queue" ? "preparing" : "ready";
    const key = `${orderId}-${itemId}`;
    setUpdatingItem(key);
    try {
      const updated = await updateItemStatus(qrCode, orderId, itemId, next);
      if (updated) setOrders(cur => cur.map(x => x.id === orderId ? updated : x));
    } finally {
      setUpdatingItem(null);
    }
  };

  const manualArchive = async (orderId: number) => {
    // Cancel any running countdown
    if (archiveIntervalsRef.current[orderId]) {
      clearInterval(archiveIntervalsRef.current[orderId]);
      delete archiveIntervalsRef.current[orderId];
      setArchiveCountdowns(c => { const { [orderId]: _, ...rest } = c; return rest; });
    }
    const updated = await kitchenArchiveOrder(qrCode, orderId);
    if (updated) {
      setOrders(cur => cur.filter(o => o.id !== orderId));
      setArchivedOrders(cur => [updated, ...cur]);
    }
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
  return (
    <div className="relative z-10 mx-auto w-full max-w-[1600px] pb-16">
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
              onClick={handleLogout}
              title="Log out"
              className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground/60 shadow-[var(--shadow-soft)] transition hover:bg-muted/80 active:scale-90"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Three-column board ──────────────────────────────────────────── */}
      <div className="px-5 grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
        {grouped.map((g) => {
          const meta = STAGE_META[g.status];
          const Icon = meta.icon;
          const colAccent = g.status === 'queue' ? 'border-berry/40' : g.status === 'preparing' ? 'border-accent/40' : 'border-leaf/40';
          const headerBg = g.status === 'queue' ? 'bg-berry/8' : g.status === 'preparing' ? 'bg-accent/8' : 'bg-leaf/8';
          // FIFO: sort by created_at ascending (earliest first)
          const fifo = [...g.orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return (
            <div key={g.status} className={`flex flex-col rounded-3xl border-2 ${colAccent} overflow-hidden bg-card/60 shadow-[var(--shadow-card)]`}>
              {/* Column header */}
              <div className={`sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 ${headerBg} backdrop-blur-md border-b border-border/40`}>
                <div className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 ${meta.tint}`} />
                  <span className="font-display text-base font-semibold">{meta.label}</span>
                </div>
                <span className={`grid h-6 min-w-[1.5rem] place-items-center rounded-full px-2 text-xs font-bold ${
                  g.orders.length > 0 ? 'bg-berry text-berry-foreground' : 'bg-muted text-foreground/40'
                }`}>
                  {g.orders.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-4 p-4">
                {fifo.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted">
                      <Icon className="h-5 w-5 text-foreground/30" />
                    </div>
                    <p className="text-sm text-foreground/40">All clear</p>
                  </div>
                ) : (
                  fifo.map((o, idx) => {
                    const countdown = archiveCountdowns[o.id];
                    const isReady = o.status === 'ready';
                    return (
                      <div
                        key={o.id}
                        className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-soft)] animate-fade-up border border-border/40"
                        style={{ animationDelay: `${idx * 40}ms` }}
                      >
                        {/* Card header */}
                        <div className="flex items-center justify-between border-b border-border/50 bg-primary/5 px-4 py-2.5">
                          <div>
                            <p className="text-[0.6rem] font-bold uppercase tracking-widest text-foreground/50">{o.table_number}</p>
                            <p className="font-display text-base font-semibold leading-tight">#{o.id}</p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <strong className="font-display text-base">{formatRM(o.total_price)}</strong>
                            {isReady && countdown !== undefined && (
                              <span className="text-[0.6rem] text-foreground/50">archiving in <strong>{countdown}s</strong></span>
                            )}
                            {isReady && (
                              <button
                                onClick={() => manualArchive(o.id)}
                                className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-leaf/10 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-leaf hover:bg-leaf/20 transition"
                              >
                                <Archive className="h-2.5 w-2.5" /> Archive now
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Items */}
                        <ul className="divide-y divide-border/40 px-4 py-2">
                          {o.items.map((it) => {
                            const iKey = `${o.id}-${it.id}`;
                            const isBusy = updatingItem === iKey;
                            const itemReady = it.item_status === 'ready';
                            const itemCooking = it.item_status === 'preparing';
                            return (
                              <li key={it.id} className="flex flex-col gap-1.5 py-2.5">
                                <div className="flex items-start gap-2.5">
                                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/15 font-mono-cute text-sm font-semibold text-accent-foreground">
                                    {it.quantity}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium leading-snug">{it.item_name}</p>
                                    {it.notes && <p className="mt-0.5 text-xs text-berry">↳ {it.notes}</p>}
                                  </div>
                                </div>
                                {/* Status + advance button on its own row for easy tapping */}
                                <div className="flex items-center gap-2 pl-9">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide ${
                                    itemReady   ? 'bg-leaf/15 text-leaf' :
                                    itemCooking ? 'bg-accent/20 text-amber-700' :
                                    'bg-berry/10 text-berry'
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${
                                      itemReady ? 'bg-leaf' : itemCooking ? 'bg-accent' : 'bg-berry'
                                    }`} />
                                    {itemReady ? 'Ready' : itemCooking ? 'Cooking' : 'Queue'}
                                  </span>
                                  {!itemReady && (
                                    <button
                                      onClick={() => advanceItem(o.id, it.id!, it.item_status || 'queue')}
                                      disabled={isBusy}
                                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide transition disabled:opacity-40 ${
                                        itemCooking
                                          ? 'bg-leaf/15 text-leaf hover:bg-leaf/25'
                                          : 'bg-primary/10 text-primary hover:bg-primary/20'
                                      }`}
                                    >
                                      {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : `→ ${itemCooking ? 'Ready' : 'Cooking'}`}
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Kitchen archive section (today only, toggleable) ─────────────── */}
      {archivedOrders.length > 0 && (
        <div className="mx-auto mt-8 px-5 pb-10">
          <button
            onClick={() => setShowArchive(v => !v)}
            className="flex w-full items-center justify-between rounded-2xl bg-muted/60 px-5 py-3 text-sm font-semibold text-foreground/60 hover:bg-muted transition"
          >
            <span className="flex items-center gap-2">
              <Archive className="h-4 w-4" />
              Today's completed orders ({archivedOrders.length})
            </span>
            {showArchive ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showArchive && (
            <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {archivedOrders.map(o => (
                <li key={o.id} className="rounded-2xl border border-border/50 bg-card/60 px-5 py-4 opacity-70">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[0.6rem] font-bold uppercase tracking-widest text-foreground/40">{o.table_number}</p>
                      <p className="font-display text-base font-semibold">Order #{o.id}</p>
                    </div>
                    <span className="text-sm font-bold text-foreground/60">{formatRM(o.total_price)}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {o.items.map(it => (
                      <li key={it.id} className="flex gap-2 text-xs text-foreground/60">
                        <span className="font-bold">{it.quantity}×</span>
                        <span>{it.item_name}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
