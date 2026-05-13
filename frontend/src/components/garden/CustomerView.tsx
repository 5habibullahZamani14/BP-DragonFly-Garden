/*
 * CustomerView.tsx — The primary guest interface for the garden cafe.
 *
 * I built this component to be the heartbeat of the customer experience.
 * It handles the full journey from arriving (table detection) and browsing
 * the menu to placing orders and tracking them in real-time.
 *
 * High-level architecture:
 *
 *   1. State & Persistence: I use a mix of local state for the UI and
 *      sessionStorage for the cart and order history. This ensures that
 *      if a guest accidentally refreshes the page or their phone locks,
 *      their cart and tracking status are preserved.
 *
 *   2. Role Detection: The component relies on the qrCode prop to identify
 *      which table the customer is sitting at. It fetches the table info
 *      on mount to personalize the "Welcome" message.
 *
 *   3. Real-time Updates: I integrated the useWebSocket hook to listen for
 *      ORDER_STATUS_UPDATE and ITEM_STATUS_UPDATE events. This means when
 *      the kitchen starts cooking or finishes a dish, the guest's progress
 *      tracker updates instantly without them needing to refresh.
 *
 *   4. Order Confirmation: To prevent accidental orders, I implemented a
 *      two-phase system. When "Send Order" is tapped, a circular countdown
 *      starts. The guest has 8 seconds to cancel before the order is
 *      atomically sent to the backend.
 *
 *   5. Receipt UI: The order tracking uses a "zig-zag" receipt design with
 *      SVG-masked perforations to give it a physical feel that matches
 *      the garden's rustic aesthetic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Leaf, Star, Plus, Minus, ShoppingBag, Check, Flame, X,
  Search, Home, UtensilsCrossed, Receipt, ArrowRight, Soup, Coffee, Salad, IceCream2, ChevronRight,
} from "lucide-react";
import { PetalButton } from "./PetalButton";
import { DragonflyMark } from "./GardenAtmosphere";
import { WingedAccent } from "./WingedAccent";
import butterflyHero from "@/assets/butterfly-hero.png";
import { fetchMenu, fetchTable, placeOrder, refreshOrder, fetchActiveOrdersForTable, customerArchiveOrder, fetchCustomerArchivedOrders } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { SettingsModal } from "./SettingsModal";
import type { MenuItem, Order } from "@/lib/menu-data";

const formatRM = (v: number) => `RM ${(Number(v) || 0).toFixed(2)}`;
const ORDER_STAGES = ["queue", "preparing", "ready"] as const;
const STAGE_LABEL: Record<string, string> = { queue: "Received", preparing: "Cooking", ready: "Ready to serve" };
const orderStageIndex = (status: string) => ORDER_STAGES.findIndex((stage) => stage === status);
const TABS = ["home", "menu", "orders"] as const;
type CustomerTab = typeof TABS[number];

type Notify = (kind: "success" | "error", text: string) => void;

interface Props { qrCode: string; notify: Notify; }

type CartLine = { id: number; name: string; price: number; quantity: number; notes: string };

// Map category names to friendly icons (Grab-style)
const CAT_ICON: Record<string, typeof Soup> = {
  All: UtensilsCrossed,
  Mains: Soup,
  "Small Bites": Salad,
  "Enzyme Drinks": IceCream2,
  Beverages: Coffee,
};

export const CustomerView = ({ qrCode, notify }: Props) => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(`dfg_cart_${qrCode}`) || '[]'); }
    catch { return []; }
  });
  const [tableInfo, setTableInfo] = useState<{ id: number; table_number: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Active orders (in queue / preparing / ready-but-not-yet-viewed-and-cleared)
  const [orders, setOrders] = useState<Order[]>([]);
  // Compact history of completed orders the user has acknowledged
  const [history, setHistory] = useState<Order[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(`dfg_history_${qrCode}`) || '[]'); }
    catch { return []; }
  });
  // Per-order: which stage was last "live" — used to trigger stage-confirm pop
  const prevStageRef = useRef<Record<number, string>>({});
  // Per-order: has the user already seen the celebration for the ready state?
  const [celebratedIds, setCelebratedIds] = useState<Set<number>>(() => {
    try { return new Set<number>(JSON.parse(sessionStorage.getItem(`dfg_celebrated_${qrCode}`) || '[]')); }
    catch { return new Set(); }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [tab, setTab] = useState<CustomerTab>(() => {
    try {
      const s = sessionStorage.getItem(`dfg_tab_${qrCode}`);
      return TABS.includes(s as CustomerTab) ? s as CustomerTab : "home";
    } catch { return "home"; }
  });
  // Direction of the last tab change — for swoosh-in animation
  const [tabDir, setTabDir] = useState<"right" | "left">("right");
  const tabOrder: Record<string, number> = { home: 0, menu: 1, orders: 2 };

  const heroRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const confirmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingCartRef = useRef<CartLine[] | null>(null); // ref-backed copy of pendingCart — avoids stale closure

  // ── Confirmation countdown (8 s before order actually sent) ────────────
  const [pendingCart, setPendingCart] = useState<CartLine[] | null>(null);
  const [confirmCountdown, setConfirmCountdown] = useState(8);
  const [submitCooldown, setSubmitCooldown] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  // ── Archive countdown (20 s after ready order is seen) ──────────────────
  const [archiveCountdowns, setArchiveCountdowns] = useState<Record<number, number>>({});
  const [keptOrderIds, setKeptOrderIds] = useState<Set<number>>(new Set());
  const [archivedOrders, setArchivedOrders] = useState<Order[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(`dfg_archived_${qrCode}`) || '[]'); }
    catch { return []; }
  });
  const [showArchived, setShowArchived] = useState(() => {
    try { return sessionStorage.getItem(`dfg_show_archived_${qrCode}`) === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    sessionStorage.setItem(`dfg_archived_${qrCode}`, JSON.stringify(archivedOrders));
  }, [archivedOrders, qrCode]);
  useEffect(() => {
    sessionStorage.setItem(`dfg_show_archived_${qrCode}`, String(showArchived));
  }, [showArchived, qrCode]);

  // Dismiss search popup when user interacts anywhere outside the search bar / popup
  useEffect(() => {
    if (!query.trim()) return;
    const dismiss = (e: Event) => {
      const el = searchWrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setQuery("");
      }
    };
    // Capture so it fires before child handlers, including scroll/touch/wheel
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("touchstart", dismiss, true);
    window.addEventListener("wheel", dismiss, { passive: true });
    window.addEventListener("scroll", dismiss, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("touchstart", dismiss, true);
      window.removeEventListener("wheel", dismiss);
      window.removeEventListener("scroll", dismiss, { capture: true });
    };
  }, [query]);

  // Load menu + table, then restore any active orders from the DB
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [m, t] = await Promise.all([fetchMenu(), fetchTable(qrCode)]);
        if (!alive) return;
        setMenu(m);
        setTableInfo(t);
        // Re-hydrate active orders so they survive a refresh
        try {
          const active = await fetchActiveOrdersForTable(t.id, qrCode);
          if (alive && active.length > 0) {
            setOrders(active);
            active.forEach(o => { prevStageRef.current[o.id] = o.status; });
          }
        } catch { /* non-critical: orders panel just starts empty */ }
      } catch (err) {
        if (alive) notify("error", "Failed to load menu. Please refresh.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [notify, qrCode]);

  // Persist cart / history / celebratedIds to sessionStorage
  useEffect(() => { sessionStorage.setItem(`dfg_cart_${qrCode}`, JSON.stringify(cart)); }, [cart, qrCode]);
  useEffect(() => { sessionStorage.setItem(`dfg_history_${qrCode}`, JSON.stringify(history)); }, [history, qrCode]);
  useEffect(() => { sessionStorage.setItem(`dfg_celebrated_${qrCode}`, JSON.stringify([...celebratedIds])); }, [celebratedIds, qrCode]);

  // Real-time WebSocket listener for order updates
  // ITEM_STATUS_UPDATE fires when kitchen advances an individual item (queue→preparing→ready)
  // ORDER_STATUS_UPDATE fires when the whole order status changes (e.g. direct status patch)
  useWebSocket(["ORDER_STATUS_UPDATE", "ITEM_STATUS_UPDATE"], (event) => {
    const updatedOrder = event.payload as Order | null;
    if (!updatedOrder?.id) return;
    
    setOrders((cur) => {
      // Only update if this order belongs to our current active session
      if (cur.some(o => o.id === updatedOrder.id)) {
        return cur.map((o) => o.id === updatedOrder.id ? updatedOrder : o);
      }
      return cur;
    });
  });

  const switchTab = (next: "home" | "menu" | "orders") => {
    setTabDir(tabOrder[next] >= tabOrder[tab] ? "right" : "left");
    setTab(next);
    sessionStorage.setItem(`dfg_tab_${qrCode}`, next);
  };

  // Subtle parallax on hero — translate only, never fade out (full opacity always)
  useEffect(() => {
    const onScroll = () => {
      if (!heroRef.current) return;
      const y = Math.min(window.scrollY, 280);
      heroRef.current.style.setProperty("--py", `${y * 0.25}px`);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const categories = useMemo(() => ["All", ...Array.from(new Set(menu.map((i) => i.category_name)))], [menu]);
  const filtered = useMemo(() => {
    let list = category === "All" ? menu : menu.filter((i) => i.category_name === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    return list;
  }, [menu, category, query]);
  const spotlight = useMemo(() => menu.find((i) => i.is_popular) || null, [menu]);
  const promos = useMemo(() => menu.filter((i) => i.is_promo), [menu]);
  const recommended = useMemo(() => menu.filter((i) => i.image_url).slice(0, 6), [menu]);
  const cartCount = cart.reduce((n, c) => n + c.quantity, 0);
  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  const addToCart = (item: MenuItem) => {
    setCart((c) => {
      const ex = c.find((x) => x.id === item.id);
      if (ex) return c.map((x) => (x.id === item.id ? { ...x, quantity: x.quantity + 1 } : x));
      return [...c, { id: item.id, name: item.name, price: item.price, quantity: 1, notes: "" }];
    });
  };
  const setQty = (id: number, q: number) => {
    if (q <= 0) return setCart((c) => c.filter((x) => x.id !== id));
    setCart((c) => c.map((x) => (x.id === id ? { ...x, quantity: q } : x)));
  };
  const setNote = (id: number, n: string) =>
    setCart((c) => c.map((x) => (x.id === id ? { ...x, notes: n } : x)));

  // Start the actual countdown (extracted so it can be called after duplicate-warning dismiss)
  const beginCountdown = () => {
    const snapshot = [...cart]; // capture immediately — don't rely on state for async use
    setPendingCart(snapshot);
    pendingCartRef.current = snapshot;
    setConfirmCountdown(8);
    setCartOpen(false);
    confirmIntervalRef.current = setInterval(() => {
      setConfirmCountdown(prev => {
        if (prev <= 1) {
          clearInterval(confirmIntervalRef.current!);
          confirmIntervalRef.current = null;
          confirmOrder();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Phase 1: customer taps "Send Order"
  const startConfirmation = () => {
    if (!tableInfo || cart.length === 0 || submitCooldown || pendingCart) return;
    // Show in-app warning if an order is still in progress
    if (orders.length > 0 && orders.some(o => o.status !== "ready")) {
      setShowDuplicateWarning(true);
      return;
    }
    beginCountdown();
  };

  // Phase 2: actually place the order (called when countdown hits 0)
  const confirmOrder = async () => {
    const snapshot = pendingCartRef.current; // always fresh — avoids stale closure
    pendingCartRef.current = null;
    setPendingCart(null);
    if (!snapshot || !tableInfo) return;
    setSubmitting(true);
    try {
      const order = await placeOrder(qrCode, {
        table_id: tableInfo.id,
        items: snapshot.map(c => ({ menu_item_id: c.id, quantity: c.quantity, notes: c.notes }))
      });
      setOrders(cur => [order, ...cur]);
      prevStageRef.current[order.id] = order.status;
      setCart([]);
      switchTab("orders");
      // 3-sec cooldown
      setSubmitCooldown(true);
      setTimeout(() => setSubmitCooldown(false), 3000);
    } catch {
      notify("error", "Network issue — order failed to send.");
      pendingCartRef.current = snapshot; // restore so user can retry
      setPendingCart(snapshot);
    } finally { setSubmitting(false); }
  };

  // Cancel during countdown — return to cart
  const cancelConfirmation = () => {
    if (confirmIntervalRef.current) { clearInterval(confirmIntervalRef.current); confirmIntervalRef.current = null; }
    pendingCartRef.current = null;
    setPendingCart(null);
    setConfirmCountdown(8);
    setCartOpen(true);
  };

  // Archive a ready order after the user confirms (or countdown runs out)
  const archiveOrder = useCallback(async (orderId: number) => {
    try {
      await customerArchiveOrder(qrCode, orderId);
    } catch { /* non-critical */ }
    setOrders(cur => cur.filter(o => o.id !== orderId));
    const archived = orders.find(o => o.id === orderId);
    if (archived) setArchivedOrders(cur => [{ ...archived, customer_archived_at: new Date().toISOString() }, ...cur]);
    // Clean up countdown state
    setArchiveCountdowns(cur => { const n = { ...cur }; delete n[orderId]; return n; });
    setKeptOrderIds(cur => { const n = new Set(cur); n.delete(orderId); return n; });
  }, [orders, qrCode]);



  const scrollToMenu = () => {
    switchTab("menu");
    document.getElementById("menu-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return menu.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  }, [menu, query]);
  const showSearch = query.trim().length > 0;

  // Track stage transitions: show a quick confirm pop on the step that *just* completed.
  const [recentlyCompleted, setRecentlyCompleted] = useState<Record<number, string>>({});
  useEffect(() => {
    const next: Record<number, string> = {};
    let changed = false;
    orders.forEach((o) => {
      const prev = prevStageRef.current[o.id];
      if (prev && prev !== o.status) {
        const prevIdx = orderStageIndex(prev);
        if (prevIdx >= 0) {
          next[o.id] = prev;
          changed = true;
          window.setTimeout(() => {
            setRecentlyCompleted((cur) => {
              if (cur[o.id] !== prev) return cur;
              const { [o.id]: _omit, ...rest } = cur;
              return rest;
            });
          }, 1200);
        }
      }
      prevStageRef.current[o.id] = o.status;
    });
    if (changed) setRecentlyCompleted((cur) => ({ ...cur, ...next }));
  }, [orders]);

  // When user opens Orders Status, celebrate newly-ready orders once,
  // then start the 20-second archive countdown.
  useEffect(() => {
    if (tab !== "orders") return;
    const readyUnseen = orders.filter(
      (o) => o.status === "ready" && !celebratedIds.has(o.id),
    );
    if (readyUnseen.length === 0) return;
    setCelebratedIds((cur) => {
      const n = new Set(cur);
      readyUnseen.forEach((o) => n.add(o.id));
      return n;
    });
    // Start 20-second archive countdown for each newly-seen ready order
    setArchiveCountdowns((cur) => {
      const n = { ...cur };
      readyUnseen.forEach((o) => { if (!(o.id in n) && !keptOrderIds.has(o.id)) n[o.id] = 20; });
      return n;
    });
  }, [tab, orders, celebratedIds, keptOrderIds]);

  // Tick archive countdowns every second
  useEffect(() => {
    const tick = setInterval(() => {
      setArchiveCountdowns((cur) => {
        const n = { ...cur };
        let changed = false;
        Object.keys(n).forEach((k) => {
          const id = Number(k);
          if (keptOrderIds.has(id)) return; // paused
          if (n[id] > 0) { n[id]--; changed = true; }
          if (n[id] <= 0) {
            // Auto-archive
            archiveOrder(id);
            delete n[id];
            changed = true;
          }
        });
        return changed ? n : cur;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [archiveOrder, keptOrderIds]);


  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl pb-32" style={{ paddingTop: "var(--safe-top)" }}>

      {/* ══ 8-SECOND CONFIRMATION OVERLAY ═════════════════════════════════ */}
      {pendingCart && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md animate-fade-up px-6">
          {/* Countdown ring */}
          <div className="relative mb-6">
            <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
              <circle cx="48" cy="48" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="6"/>
              <circle
                cx="48" cy="48" r="42" fill="none"
                stroke="hsl(var(--accent))" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 42}
                strokeDashoffset={2 * Math.PI * 42 * (1 - confirmCountdown / 8)}
                style={{ transition: "stroke-dashoffset 0.9s linear" }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-display text-3xl font-bold">{confirmCountdown}</span>
          </div>
          <h2 className="font-display text-2xl font-semibold mb-1">Confirm your order?</h2>
          <p className="text-sm text-foreground/55 mb-6 text-center">Sending automatically when timer runs out.<br/>Tap <strong>Cancel</strong> to go back and edit.</p>
          {/* Mini receipt preview */}
          <div className="w-full max-w-xs rounded-2xl border border-border bg-card/80 px-4 py-3 mb-6 space-y-1.5 max-h-52 overflow-y-auto">
            {pendingCart.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold truncate">{item.quantity}× {item.name}</span>
                <span className="shrink-0 text-foreground/60">{formatRM(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="border-t border-border/60 pt-1.5 flex justify-between font-bold">
              <span>Total</span>
              <span>{formatRM(pendingCart.reduce((s, i) => s + i.price * i.quantity, 0))}</span>
            </div>
          </div>
          <button
            onClick={cancelConfirmation}
            className="w-full max-w-xs rounded-2xl border-2 border-destructive/60 py-3 text-sm font-bold text-destructive transition hover:bg-destructive/5 active:scale-95"
          >
            Cancel — go back to cart
          </button>
        </div>
      )}

      {/* ══ DUPLICATE ORDER WARNING DIALOG ══════════════════════════════════ */}
      {showDuplicateWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-5" style={{ background: "rgba(0,0,0,0.60)" }}>
          <div className="w-full max-w-sm rounded-[28px] overflow-hidden animate-fade-up" style={{ background: "hsl(44,70%,97%)", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
            <div className="px-6 pt-6 pb-4" style={{ background: "var(--gradient-hero)" }}>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 mb-3">
                <span className="text-2xl">⚠️</span>
              </div>
              <h2 className="font-display text-xl font-bold text-primary-foreground leading-snug">Order already in progress</h2>
              <p className="mt-1 text-sm text-primary-foreground/75">Your kitchen is still working on a previous order. Are you sure you want to send another one right now?</p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-2.5">
              <button
                onClick={() => { setShowDuplicateWarning(false); beginCountdown(); }}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition active:scale-95"
                style={{ background: "var(--gradient-hero)" }}
              >
                Yes, send another order
              </button>
              <button
                onClick={() => setShowDuplicateWarning(false)}
                className="w-full rounded-2xl border-2 border-border py-3 text-sm font-semibold text-foreground/70 transition hover:bg-black/5 active:scale-95"
              >
                Cancel — keep waiting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ TOP BAR (sticky, app-like) ============ */}

      <div className="sticky top-0 z-30 px-5 pt-4 pb-3 cream-frost">
        <div className="absolute top-4 left-5">
          <SettingsModal />
        </div>
        {/* Hero ??" blueprint layout: WELCOME text on top, big butterfly centered, search below */}
        <div className="flex flex-col items-center text-center mt-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.36em] text-foreground/55">Welcome</p>
          <p className="mt-1.5 font-display text-xl font-semibold" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 50' }}>
            {tableInfo ? <>at <span className="text-primary italic">Table {tableInfo.table_number.replace(/^table-?/i, "")}</span></> : "to the garden"}
          </p>
          <img
            src={butterflyHero}
            alt="Golden butterfly"
            className="mt-2 h-32 w-56 animate-wing-flap object-contain drop-shadow-[0_18px_24px_rgba(120,80,20,0.22)]"
          />
        </div>

        {/* Search */}
        <div className="relative mt-3" ref={searchWrapRef}>
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2.5 transition-all focus-within:ring-2 focus-within:ring-accent/60"
            style={{
              background: "linear-gradient(180deg, hsl(44 75% 98%) 0%, hsl(42 60% 95%) 100%)",
              boxShadow: "var(--shadow-soft), inset 0 1px 0 hsl(40 90% 96% / 0.9)",
              border: "1px solid hsl(40 35% 78% / 0.7)",
            }}
          >
            <Search className="h-4 w-4 text-primary/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the farm menu..."
              className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-foreground/40 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-foreground/40 hover:text-foreground/70 transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Search results popup — live as you type */}
          {showSearch && (
            <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[var(--shadow-deep)] animate-scale-in">
              <div className="border-b border-border/60 px-4 py-2.5">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-foreground/50">
                  {searchResults.length > 0
                    ? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"} for "${query}"`
                    : `No matches for "${query}"`}
                </p>
              </div>

              {searchResults.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-muted">
                    <Leaf className="h-4 w-4 text-foreground/40" />
                  </div>
                  <p className="font-display text-sm text-foreground/70">
                    Sorry, that's not on the farm menu today.
                  </p>
                  <p className="mt-1 text-xs text-foreground/40">
                    Try a different dish or browse the full menu below.
                  </p>
                </div>
              ) : (
                <ul className="max-h-[60vh] divide-y divide-border/60 overflow-y-auto">
                  {searchResults.map((item) => (
                    <li
                      key={`search-${item.id}`}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Leaf className="h-4 w-4 text-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-semibold leading-tight">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[0.7rem] text-foreground/50">
                          {item.category_name} · {formatRM(item.price)}
                        </p>
                      </div>
                      <button
                        onClick={() => addToCart(item)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-[var(--shadow-soft)] transition active:scale-95"
                      >
                        <Plus className="h-3.5 w-3.5" /> Order
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ============ HOME / MENU SCREEN ============ */}
      {tab !== "orders" && (
      <div key={`home-${tab}`} className={tabDir === "right" ? "animate-swoosh-in-right" : "animate-swoosh-in-left"}>
      {/* ============ HERO (app banner) ============ */}
      <header
        ref={heroRef}
        className="relative mx-5 mt-3 mb-6 rounded-[28px] p-5 text-primary-foreground"
        style={{
          background: "var(--gradient-hero)",
          boxShadow: "var(--shadow-deep)",
          transform: "translateY(calc(var(--py,0px) * -0.3))",
        }}
      >
        {/* sparkles */}
        {[...Array(5)].map((_, i) => (
          <span key={i} className="sparkle" style={{
            top: `${15 + (i * 17) % 70}%`, left: `${10 + (i * 23) % 75}%`,
            animationDelay: `${i * 0.5}s`,
          }} />
        ))}

        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] backdrop-blur">
          <Leaf className="h-3 w-3 text-accent-soft" /> Farm-to-table
        </span>

        <h1 className="mt-3 font-display text-[2.3rem] font-bold leading-[0.95] tracking-tight text-balance"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50' }}>
          Goodness of<br />
          <span className="italic" style={{
            background: "linear-gradient(135deg, hsl(40 95% 78%) 0%, hsl(36 95% 65%) 50%, hsl(28 90% 55%) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}>nature</span>, served fresh.
        </h1>
        <p className="mt-2.5 max-w-[16rem] text-[0.85rem] leading-snug text-primary-foreground/80">
          Browse the farm menu, order from your table — your dish, growing to life.
        </p>

        <button
          onClick={scrollToMenu}
          className="btn-gold mt-4 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[1rem]"
        >
          Explore menu <ArrowRight className="h-4 w-4" />
        </button>
      </header>

      {/* Active order tracker now lives on the dedicated Orders Status screen. */}

      {/* ============ SPOTLIGHT (chef's favourite) ============ */}
      {spotlight && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">This week</span>
              <h2 className="mt-1">Chef's favourite</h2>
            </div>
            <button onClick={() => addToCart(spotlight)}>
              Add <Plus className="h-3 w-3" />
            </button>
          </div>
          <section className="relative mx-5 mb-7 rounded-[28px] text-primary-foreground animate-fade-up"
            style={{ background: "var(--gradient-spotlight)", boxShadow: "var(--shadow-deep)" }}>
            {/* shimmer */}
            <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
              <span className="absolute -top-4 -left-4 h-32 w-1/2 bg-white/10 blur-2xl"
                style={{ animation: "shimmer-sweep 3.4s ease-in-out infinite" }} />
            </span>

            <div className="relative grid grid-cols-[1fr_auto] gap-4 p-5">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/95 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-accent-foreground">
                  <Flame className="h-3 w-3" /> Popular
                </span>
                <h3 className="mt-2 font-display text-2xl font-bold leading-[1.05] text-balance">{spotlight.name}</h3>
                <p className="mt-1.5 line-clamp-2 text-[0.78rem] text-primary-foreground/75">
                  {spotlight.description}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="font-display text-2xl font-bold text-accent">{formatRM(spotlight.price)}</span>
                  <span className="text-[0.65rem] text-primary-foreground/50 line-through">RM {(spotlight.price * 1.2).toFixed(2)}</span>
                </div>
              </div>
              {spotlight.image_url && (
                <div className="relative h-28 w-28 shrink-0 self-center overflow-hidden rounded-2xl ring-2 ring-accent/60 shadow-2xl">
                  <img src={spotlight.image_url} alt={spotlight.name} className="h-full w-full object-cover" />
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* ============ PROMOS (peek carousel) ============ */}
      {promos.length > 0 && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">Today's offers</span>
              <h2 className="mt-1">Hot deals 🔥</h2>
            </div>
            <span className="text-xs text-foreground/50">{promos.length} live</span>
          </div>
          <div className="mb-7 -mx-0 flex snap-x-mandatory gap-3 overflow-x-auto px-5 pb-3 no-scrollbar">
            {promos.map((p) => (
              <article
                key={p.id}
                className="snap-start relative flex w-[78%] shrink-0 rounded-[22px] text-primary-foreground shadow-[var(--shadow-pop)]"
                style={{ background: "var(--gradient-berry)" }}
              >
                {/* winged accent removed per request */}
                {p.image_url && (
                  <img src={p.image_url} alt="" className="absolute inset-0 h-full w-full rounded-[22px] object-cover opacity-50 mix-blend-overlay" />
                )}
                <div className="relative flex flex-1 flex-col justify-between p-4">
                  <div>
                    <span className="inline-block rounded-md bg-white/95 px-1.5 py-0.5 text-[0.58rem] font-extrabold uppercase tracking-widest text-berry">
                      {p.promo_label || "Promo"}
                    </span>
                    <h3 className="mt-2 font-display text-xl font-bold leading-tight text-balance">{p.name}</h3>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[0.6rem] uppercase tracking-widest opacity-70">From</p>
                      <p className="font-display text-xl font-bold">{formatRM(p.price)}</p>
                    </div>
                    <button
                      onClick={() => addToCart(p)}
                      className="grid h-10 w-10 place-items-center rounded-full bg-white text-berry shadow-lg active:scale-90"
                      aria-label="Add"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* ============ RECOMMENDED (peek horizontal cards) ============ */}
      {recommended.length > 0 && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">Picked for you</span>
              <h2 className="mt-1">Recommended</h2>
            </div>
            <button onClick={scrollToMenu}>View all <ChevronRight className="h-3 w-3" /></button>
          </div>
          <div className="mb-8 flex snap-x-mandatory gap-3 overflow-x-auto px-5 pb-3 no-scrollbar">
            {recommended.map((item) => (
              <article
                key={`rec-${item.id}`}
                className="snap-start group relative flex w-44 shrink-0 flex-col rounded-[20px] bg-card shadow-[var(--shadow-soft)] transition-all active:scale-[0.98]"
              >
                {/* winged accent removed per request */}
                <div className="relative aspect-[4/3] overflow-hidden rounded-t-[20px]">
                  <img src={item.image_url} alt={item.name} loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  {item.is_popular && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded-md bg-accent px-1.5 py-0.5 text-[0.58rem] font-extrabold uppercase text-accent-foreground shadow">
                      <Star className="h-2.5 w-2.5 fill-current" /> Top
                    </span>
                  )}
                  <button
                    onClick={() => addToCart(item)}
                    className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition active:scale-90"
                    aria-label="Add"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-2.5">
                  <h3 className="font-display text-sm font-semibold leading-tight line-clamp-1">{item.name}</h3>
                  <p className="mt-0.5 text-[0.65rem] text-foreground/50 line-clamp-1">{item.category_name}</p>
                  <p className="mt-1 font-display text-base font-bold text-primary">{formatRM(item.price)}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* ============ FULL MENU ============ */}
      <div id="menu-anchor" className="px-5">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <span className="eyebrow">Farm menu</span>
            <h2 className="mt-1 font-display text-[1.6rem] font-bold leading-tight">All goodness</h2>
          </div>
          <span className="text-xs font-medium text-foreground/50">{filtered.length} items</span>
        </div>

        {/* Sticky category icons (Grab-style, moved from top of page) */}
        <div className="sticky top-[7.5rem] z-20 -mx-5 mb-4 px-5 pt-5 pb-3 cream-frost">
          <div className="flex gap-3 overflow-x-auto overflow-y-visible no-scrollbar -mt-1 pt-1">
            {categories.map((c) => {
              const Icon = CAT_ICON[c] || UtensilsCrossed;
              const active = c === category;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className="flex shrink-0 flex-col items-center gap-1.5 w-16"
                >
                  <span className={`cat-icon ${active ? "cat-icon-active" : ""}`}>
                    <Icon className={`h-6 w-6 ${active ? "" : "text-primary"}`} />
                  </span>
                  <span className={`text-[0.62rem] font-semibold leading-tight text-center ${active ? "text-primary" : "text-foreground/60"}`}>
                    {c}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
            <Search className="mx-auto mb-2 h-8 w-8 text-foreground/30" />
            <p className="font-display text-lg text-foreground/60">No matches</p>
            <p className="mt-1 text-sm text-foreground/40">Try a different search or category.</p>
          </div>
        ) : (
          /* Refined "row" cards inspired by Foodpanda/KFC menu lists */
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((item, idx) => (
              <li
                key={item.id}
                className="group card-luxe flex gap-3 p-3 transition-all active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]"
                style={{ animation: `fade-up 0.5s var(--ease-out) ${Math.min(idx * 30, 400)}ms both` }}
              >
                {/* winged accent removed per request */}
                {/* image */}
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-primary/5">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center"
                      style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.08), hsl(var(--accent)/0.18))" }}>
                      <Leaf className="h-7 w-7 text-leaf/60" />
                    </div>
                  )}
                  {item.is_popular && (
                    <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-foreground shadow">
                      <Star className="h-2.5 w-2.5 fill-current" />
                    </span>
                  )}
                </div>

                {/* content */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-[1rem] font-semibold leading-tight">
                      {item.name}
                      {item.is_promo && <span className="ml-1.5 align-middle tag-new">New</span>}
                    </h3>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[0.75rem] leading-snug text-foreground/55">
                    {item.description || "Fresh from the farm."}
                  </p>
                  <div className="mt-auto flex items-end justify-between pt-2">
                    <div>
                      <p className="text-[0.58rem] font-medium uppercase tracking-widest text-foreground/40">{item.category_name}</p>
                      <p className="font-display text-base font-bold text-primary">{formatRM(item.price)}</p>
                    </div>
                    <button
                      onClick={() => addToCart(item)}
                      className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-[var(--shadow-soft)] transition active:scale-90 hover:bg-primary-glow"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* End plate */}
        <div className="relative mt-8 flex flex-col items-center gap-2 py-6">
          <DragonflyMark className="h-10 w-10 opacity-40" />
          <p className="font-display text-sm italic text-foreground/40">— end of the garden —</p>
        </div>
      </div>
      </div>
      )}

      {/* ============ ORDERS STATUS SCREEN ============ */}
      {tab === "orders" && (
        <div key="orders-screen" className={tabDir === "right" ? "animate-swoosh-in-right" : "animate-swoosh-in-left"}>
          {/* Page header — matches home tone */}
          <header
            className="relative mx-5 mt-3 mb-6 rounded-[28px] p-5 text-primary-foreground"
            style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-deep)" }}
          >
            {[...Array(4)].map((_, i) => (
              <span key={i} className="sparkle" style={{
                top: `${20 + (i * 19) % 60}%`, left: `${15 + (i * 27) % 70}%`,
                animationDelay: `${i * 0.6}s`,
              }} />
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] backdrop-blur">
              <Receipt className="h-3 w-3 text-accent-soft" /> Live tracking
            </span>
            <h1 className="mt-3 font-display text-[2rem] font-bold leading-[0.95] tracking-tight">
              Your <span className="italic text-accent">orders</span>
            </h1>
            <p className="mt-2 max-w-[18rem] text-[0.85rem] leading-snug text-primary-foreground/80">
              Follow each plate from the kitchen all the way to your table.
            </p>
          </header>

          {/* Active orders */}
          {orders.length === 0 ? (
            <section className="mx-5 mb-8 rounded-[24px] border border-dashed border-border bg-card/60 px-6 py-12 text-center animate-fade-up">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-primary/10">
                <Soup className="h-6 w-6 text-primary" />
              </div>
              <h2 className="font-display text-xl font-semibold">No orders yet</h2>
              <p className="mt-1.5 text-sm text-foreground/55">
                Once you send something to the kitchen, you'll see it growing here in real time.
              </p>
              <button
                onClick={() => { switchTab("menu"); requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("menu-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" }))); }}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[var(--shadow-soft)] transition active:scale-95"
              >
                Browse the menu <ArrowRight className="h-4 w-4" />
              </button>
            </section>
          ) : (
            <div className="mx-5 mb-8 space-y-6">
              <div className="flex items-end justify-between">
                <span className="eyebrow">In progress</span>
                <span className="text-xs text-foreground/50">{orders.length} active</span>
              </div>
              {orders.map((o) => {
                const ai = orderStageIndex(o.status);
                const isReady = o.status === "ready";
                const justCelebrated = isReady && celebratedIds.has(o.id);
                const RC = "hsl(44,70%,97%)";
                const RS = "hsl(44,35%,91%)";
                const timeStr = o.created_at
                  ? new Date(o.created_at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })
                  : null;
                const archiveSecs = archiveCountdowns[o.id];
                const isKept = keptOrderIds.has(o.id);
                return (
                  <div key={o.id} className={`relative ${justCelebrated ? "animate-ready-celebrate" : "animate-scale-in"}`}>
                    {justCelebrated && (
                      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden z-10">
                        {[...Array(8)].map((_, i) => {
                          const angle = (i / 8) * Math.PI * 2;
                          return (
                            <span key={i} className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-accent animate-confetti"
                              style={{ "--cx": `${Math.cos(angle) * 80}px`, "--cy": `${Math.sin(angle) * 80}px`, animationDelay: `${i * 40}ms` } as React.CSSProperties & Record<"--cx"|"--cy",string>}/>
                          );
                        })}
                      </span>
                    )}

                    <div style={{ filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.14))" }}>

                      {/* ── ZIGZAG top edge — fixed 16 px teeth, count auto-adjusts ── */}
                      <svg width="100%" height="10" style={{ display: "block" }}>
                        <defs>
                          <pattern id={`zz-${o.id}`} x="0" y="0" width="16" height="10" patternUnits="userSpaceOnUse">
                            <polygon points="0,10 8,0 16,10" fill={RC}/>
                          </pattern>
                        </defs>
                        <rect width="100%" height="10" fill={`url(#zz-${o.id})`}/>
                      </svg>

                      {/* ── Receipt body ── */}
                      <div style={{ background: RC }} className="px-5 pt-1 pb-4">
                        {/* Header: order # + status pill + archive countdown */}
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <p className="text-[0.58rem] font-bold uppercase tracking-[0.22em] opacity-40">Order</p>
                            <h2 className="font-display text-[2.2rem] font-bold leading-none tracking-tight" style={{ color:"hsl(140,30%,18%)" }}>#{o.id}</h2>
                            <p className="text-[0.7rem] opacity-50 mt-0.5">{o.table_number}{timeStr && ` · ${timeStr}`}</p>
                          </div>
                          <div>
                            <button
                              onClick={() => archiveOrder(o.id)}
                              className="text-[0.6rem] font-bold px-3 py-1 rounded-full bg-black/5 text-foreground/50 hover:bg-black/10 transition flex items-center gap-1"
                            >
                              <X className="h-3 w-3" /> Dismiss
                            </button>
                          </div>
                        </div>

                        <div className="border-t-2 mb-4" style={{ borderColor:"hsl(40,20%,68%)" }}/>

                        {/* Items with per-item status */}
                        <div className="space-y-3 mb-4">
                          {(o.items || []).map(item => {
                            const iReady = item.item_status === "ready";
                            const iCook  = item.item_status === "preparing";
                            return (
                              <div key={item.id}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex gap-2.5 min-w-0">
                                    <span className="text-xs font-extrabold shrink-0 w-5 mt-px" style={{ color:"hsl(140,30%,28%)" }}>{item.quantity}×</span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold leading-snug">{item.item_name}</p>
                                      {item.notes && <p className="text-[0.68rem] opacity-40 italic mt-0.5">"{item.notes}"</p>}
                                    </div>
                                  </div>
                                  {item.price_at_order_time != null && (
                                    <span className="text-sm font-bold shrink-0" style={{ color:"hsl(140,30%,22%)" }}>
                                      {formatRM(item.price_at_order_time * item.quantity)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="border-t border-dashed mb-4" style={{ borderColor:"hsl(40,20%,68%)" }}/>
                        <div className="flex items-center justify-between">
                          <span className="text-[0.65rem] font-bold uppercase tracking-[0.22em] opacity-50">Total</span>
                          <span className="font-display text-2xl font-bold" style={{ color:"hsl(140,30%,18%)" }}>{formatRM(Number(o.total_price))}</span>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Archived orders section (toggleable, off by default) ─────── */}
          {archivedOrders.length > 0 && (
            <div className="mx-5 mb-8">
              <button
                onClick={() => setShowArchived(v => !v)}
                className="flex items-center gap-2 w-full text-left mb-2"
              >
                <span className="eyebrow flex-1">Archived tickets</span>
                <span className="text-[0.65rem] text-foreground/40">{archivedOrders.length} · {showArchived ? "hide ▲" : "show ▼"}</span>
              </button>
              {showArchived && (
                <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/70">
                  {archivedOrders.map(o => (
                    <li key={`arch-${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground/70">Order #{o.id}</p>
                        <p className="text-foreground/40 truncate">{(o.items||[]).map(i=>`${i.quantity}× ${i.item_name}`).join(", ")}</p>
                      </div>
                      <span className="shrink-0 font-display text-foreground/55">{formatRM(Number(o.total_price))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}


          {/* History — compact, low-key */}
          {history.length > 0 && (
            <div className="mx-5 mb-8">
              <div className="mb-2 flex items-end justify-between">
                <span className="eyebrow">History</span>
                <span className="text-[0.65rem] text-foreground/40">{history.length} past</span>
              </div>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/70">
                {history.map((o) => (
                  <li key={`hist-${o.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Check className="h-3.5 w-3.5 shrink-0 text-leaf" />
                      <span className="truncate font-medium text-foreground/70">Order #{o.id}</span>
                      <span className="truncate text-foreground/40">· {(o.items?.length || 0)} item{(o.items?.length || 0) === 1 ? "" : "s"}</span>
                    </div>
                    <span className="shrink-0 font-display text-foreground/55">{formatRM(Number(o.total_price))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* End plate */}
          <div className="relative mt-4 flex flex-col items-center gap-2 py-6">
            <DragonflyMark className="h-9 w-9 opacity-40" />
            <p className="font-display text-xs italic text-foreground/40">— end of orders —</p>
          </div>
        </div>
      )}

      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="btn-emerald fixed inset-x-4 z-40 mx-auto flex max-w-2xl items-center justify-between rounded-full px-5 py-3.5 animate-slide-down"
          style={{ bottom: "calc(4.5rem + var(--safe-bottom))" }}
        >
          <span className="flex items-center gap-3">
            <span className="relative grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground">
              <ShoppingBag className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-berry text-[0.6rem] font-bold text-berry-foreground">
                {cartCount}
              </span>
            </span>
            <span className="font-semibold">View cart</span>
          </span>
          <span className="font-display text-lg font-semibold">{formatRM(total)}</span>
        </button>
      )}

      {/* ============ BOTTOM NAV (mobile-app feel) ============ */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-2xl grid-cols-3 items-start bg-background px-2 py-2 md:rounded-t-3xl md:border md:border-border/60 md:shadow-2xl"
        style={{ paddingBottom: "calc(0.5rem + var(--safe-bottom))" }}
      >
        {/* hairline gold divider on top of nav */}
        <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 hairline-gold" />
        {([
          { id: "home", label: "Home", icon: Home },
          { id: "menu", label: "Menu", icon: UtensilsCrossed },
          { id: "orders", label: "Orders Status", icon: Receipt },
        ] as const).map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          const badge = id === "orders" ? orders.filter(o => o.status === "ready" && !celebratedIds.has(o.id)).length : 0;
          return (
            <button
              key={id}
              onClick={() => {
                switchTab(id);
                if (id === "menu") scrollToMenu();
                if (id === "home" || id === "orders") window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`relative mx-auto flex w-full flex-col items-center justify-start gap-1 px-1 pt-2 pb-1 text-[0.62rem] font-semibold transition-all ${
                active ? "text-primary" : "text-foreground/45 hover:text-foreground/65"
              }`}
            >
              <span className="relative grid place-items-center">
                {/* soft golden glow behind active icon */}
                {active && (
                  <span aria-hidden className="absolute inset-0 -m-1.5 rounded-full"
                    style={{
                      background: "radial-gradient(circle, hsl(var(--accent) / 0.30) 0%, transparent 70%)",
                    }} />
                )}
                <Icon className={`relative h-[1.35rem] w-[1.35rem] transition-transform duration-300 ${active ? "scale-110" : ""}`}
                  strokeWidth={active ? 2.4 : 2} />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-berry px-1 text-[0.55rem] font-bold text-berry-foreground shadow-[0_2px_6px_-1px_hsl(348_70%_40%/0.5)]">
                    {badge}
                  </span>
                )}
              </span>
              <span className="leading-none tracking-wide">{label}</span>
              {active && (
                <span className="absolute bottom-0 h-[3px] w-6 rounded-full"
                  style={{ background: "var(--gradient-gold)", boxShadow: "0 0 8px hsl(var(--accent) / 0.6)" }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* ============ CART SHEET ============ */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog">
          <div className="absolute inset-0 bg-primary/40 backdrop-blur-sm animate-fade-up" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-t-[32px] bg-background p-5 shadow-2xl animate-slide-down md:rounded-[32px] md:mb-4">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-foreground/15" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <span className="eyebrow">Checkout</span>
                <h2 className="mt-1 font-display text-2xl font-semibold">Your cart</h2>
              </div>
              <button onClick={() => setCartOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="space-y-3">
              {cart.map((c) => (
                <li key={c.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-semibold leading-tight">{c.name}</h3>
                      <p className="text-xs text-foreground/50">{formatRM(c.price)} each</p>
                    </div>
                    <strong className="font-display text-base">{formatRM(c.price * c.quantity)}</strong>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-muted p-1">
                      <button onClick={() => setQty(c.id, c.quantity - 1)} className="grid h-8 w-8 place-items-center rounded-full bg-background shadow-sm active:scale-90">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center font-semibold">{c.quantity}</span>
                      <button onClick={() => setQty(c.id, c.quantity + 1)} className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground active:scale-90">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      value={c.notes}
                      onChange={(e) => setNote(c.id, e.target.value)}
                      placeholder="Any notes?"
                      className="min-w-0 flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="sticky bottom-0 mt-5 -mx-5 -mb-5 rounded-b-[32px] bg-background/95 px-5 pb-6 pt-4 backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-foreground/60">Total</span>
                <strong className="font-display text-2xl font-semibold">{formatRM(total)}</strong>
              </div>
              <PetalButton variant="emerald" size="lg" disabled={submitting || cart.length === 0 || !tableInfo || submitCooldown || !!pendingCart} onClick={startConfirmation} className="w-full">
                {submitCooldown ? "Order sent ✓" : submitting ? "Sending..." : "Send order →"}
              </PetalButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
