import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Clock, ChefHat, BellRing, ArrowRight } from "lucide-react";
import { PetalButton } from "./PetalButton";
import { HelpModal, HelpSection } from "./HelpModal";
import { fetchKitchenOrders, updateOrderStatus } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import type { Order } from "@/lib/menu-data";

const STAGES = ["queue", "preparing", "ready"] as const;
const NEXT: Record<string, string | null> = { queue: "preparing", preparing: "ready", ready: null };
const STAGE_META: Record<string, { label: string; icon: typeof Clock; tint: string }> = {
  queue: { label: "Queue", icon: Clock, tint: "text-berry" },
  preparing: { label: "Cooking", icon: ChefHat, tint: "text-accent" },
  ready: { label: "Ready", icon: BellRing, tint: "text-leaf" },
};

const formatRM = (v: number) => `RM ${(Number(v) || 0).toFixed(2)}`;

interface Props { qrCode: string; notify: (k: "success" | "error", t: string) => void; }

export const KitchenView = ({ qrCode, notify }: Props) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<typeof STAGES[number]>("queue");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await fetchKitchenOrders(qrCode);
    setOrders(data);
    if (!silent) setLoading(false);
  }, [qrCode]);

  useEffect(() => {
    load();
  }, [load]);

  useWebSocket(["NEW_ORDER", "ORDER_STATUS_UPDATE"], (event) => {
    // We could optimize by checking event payload, but a full fresh load ensures perfect sync
    load(true);
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
      // optimistic for mock
      setOrders((cur) => cur.map((x) => (x.id === id ? { ...x, status: status as Order["status"] } : x)));
    }
    setUpdating(null);
  };

  const visible = grouped.find((g) => g.status === activeTab)!;

  return (
    <div className="relative z-10 mx-auto w-full max-w-2xl pb-16">
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
            <HelpModal title="Kitchen Crew" sections={kitchenHelpSections} />
            <button
              onClick={() => load()}
              className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-soft)] transition active:scale-90"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
          <ul className="space-y-3">
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
    id: "overview",
    title: "1. Understanding the Kitchen Board",
    content: (
      <div className="space-y-2">
        <p>This is your digital order board. It updates automatically every 7 seconds so you never miss an incoming order. There are three stages:</p>
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
    title: "2. How to Process an Order",
    content: (
      <div className="space-y-2">
        <p>When an order arrives in the <strong>Queue</strong>, follow these steps:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Read the ticket carefully. You will see the Table number, the items, quantities, and any specific notes/customizations requested by the customer.</li>
          <li>When you are ready to start cooking, click the <strong>Start Cooking</strong> button at the bottom of the ticket. This instantly moves the ticket to the "Cooking" tab so other chefs know it is being handled.</li>
          <li>Once the food is fully prepared, plated, and ready to leave the kitchen, click <strong>Mark Ready</strong>. This alerts the service staff to come pick it up.</li>
        </ol>
      </div>
    )
  },
  {
    id: "auto-refresh",
    title: "3. Refreshing the Board",
    content: (
      <div className="space-y-2">
        <p>The kitchen board uses an auto-refresh system to pull in new orders without you having to touch the screen with messy hands.</p>
        <p>However, if you feel you might have missed a sudden rush of orders or if your internet connection hiccuped, you can manually force an instant refresh by clicking the <strong>Refresh (Circular Arrow)</strong> button next to the "i" info icon in the top right corner.</p>
      </div>
    )
  }
];
