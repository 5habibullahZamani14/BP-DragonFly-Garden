import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Leaf, Star, Plus, Minus, ShoppingBag, Check, Flame, X,
  Search, Home, UtensilsCrossed, Receipt, ArrowRight, Soup, Coffee, Salad, IceCream2, ChevronRight,
} from "lucide-react";
import { PetalButton } from "./PetalButton";
import { DragonflyMark } from "./GardenAtmosphere";
import { WingedAccent } from "./WingedAccent";
import butterflyHero from "@/assets/butterfly-hero.png";
import { fetchMenu, fetchTable, placeOrder, refreshOrder } from "@/lib/api";
import type { MenuItem, Order } from "@/lib/menu-data";

const formatRM = (v: number) => `RM ${(Number(v) || 0).toFixed(2)}`;
const ORDER_STAGES = ["queue", "preparing", "ready"] as const;
const STAGE_LABEL: Record<string, string> = { queue: "Received", preparing: "Cooking", ready: "Ready to serve" };

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
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableInfo, setTableInfo] = useState<{ id: number; table_number: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Active orders (in queue / preparing / ready-but-not-yet-viewed-and-cleared)
  const [orders, setOrders] = useState<Order[]>([]);
  // Compact history of completed orders the user has acknowledged
  const [history, setHistory] = useState<Order[]>([]);
  // Per-order: which stage was last "live" — used to trigger stage-confirm pop
  const prevStageRef = useRef<Record<number, string>>({});
  // Per-order: has the user already seen the celebration for the ready state?
  const [celebratedIds, setCelebratedIds] = useState<Set<number>>(new Set());
  const [cartOpen, setCartOpen] = useState(false);
  const [tab, setTab] = useState<"home" | "menu" | "orders">("home");
  // Direction of the last tab change — for swoosh-in animation
  const [tabDir, setTabDir] = useState<"right" | "left">("right");
  const tabOrder: Record<string, number> = { home: 0, menu: 1, orders: 2 };

  const heroRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);

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
      window.removeEventListener("scroll", dismiss, { capture: true } as any);
    };
  }, [query]);

  // Load menu + table
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [m, t] = await Promise.all([fetchMenu(), fetchTable(qrCode)]);
      if (!alive) return;
      setMenu(m);
      setTableInfo(t);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [qrCode]);

  // Poll all active (non-ready) orders
  useEffect(() => {
    const pending = orders.filter((o) => o.status !== "ready");
    if (pending.length === 0) return;
    const id = window.setInterval(async () => {
      const updated = await Promise.all(
        pending.map((o) => refreshOrder(qrCode, o.id).then((r) => r ?? o)),
      );
      setOrders((cur) =>
        cur.map((o) => updated.find((u) => u.id === o.id) || o),
      );
    }, 8000);
    return () => window.clearInterval(id);
  }, [orders, qrCode]);

  const switchTab = (next: "home" | "menu" | "orders") => {
    setTabDir(tabOrder[next] >= tabOrder[tab] ? "right" : "left");
    setTab(next);
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
    notify("success", `${item.name} added`);
  };
  const setQty = (id: number, q: number) => {
    if (q <= 0) return setCart((c) => c.filter((x) => x.id !== id));
    setCart((c) => c.map((x) => (x.id === id ? { ...x, quantity: q } : x)));
  };
  const setNote = (id: number, n: string) =>
    setCart((c) => c.map((x) => (x.id === id ? { ...x, notes: n } : x)));

  const submit = async () => {
    if (!tableInfo || cart.length === 0) return;
    setSubmitting(true);
    try {
      const order = await placeOrder(qrCode,
        { table_id: tableInfo.id, items: cart.map((c) => ({ menu_item_id: c.id, quantity: c.quantity, notes: c.notes })) },
        total, tableInfo.table_number);
      setOrders((cur) => [order, ...cur]);
      setCart([]);
      setCartOpen(false);
      notify("success", `Order #${order.id} sent to the kitchen`);
    } finally { setSubmitting(false); }
  };

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
        const prevIdx = ORDER_STAGES.indexOf(prev as any);
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

  // When user opens Orders Status, celebrate any newly-ready orders once,
  // then move them into history shortly after.
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
    const t = window.setTimeout(() => {
      setOrders((cur) => cur.filter((o) => !readyUnseen.find((r) => r.id === o.id)));
      setHistory((cur) => [...readyUnseen, ...cur]);
    }, 2600);
    return () => window.clearTimeout(t);
  }, [tab, orders, celebratedIds]);

  return (
    <div className="relative z-10 mx-auto w-full max-w-md pb-32" style={{ paddingTop: "var(--safe-top)" }}>
      {/* ============ TOP BAR (sticky, app-like) ============ */}
      <div className="sticky top-0 z-30 px-5 pt-4 pb-3 cream-frost">
        {/* Hero — blueprint layout: WELCOME text on top, big butterfly centered, search below */}
        <div className="flex flex-col items-center text-center">
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
            <WingedAccent
              seed={`spotlight-${spotlight.id}`}
              size="h-16 w-16"
              corner="tr"
              rotate={-25}
              offsetX={-90}
              offsetY={-25}
            />
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
          <ul className="space-y-3">
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
            <div className="mx-5 mb-8 space-y-4">
              <div className="flex items-end justify-between">
                <span className="eyebrow">In progress</span>
                <span className="text-xs text-foreground/50">{orders.length} active</span>
              </div>
              {orders.map((o) => {
                const ai = ORDER_STAGES.indexOf(o.status as any);
                const isReady = o.status === "ready";
                const justCelebrated = isReady && celebratedIds.has(o.id);
                return (
                  <section
                    key={o.id}
                    className={`relative rounded-[24px] glass-dark p-5 text-primary-foreground ${
                      justCelebrated ? "animate-ready-celebrate" : "animate-scale-in"
                    }`}
                  >
                    {/* Tiny confetti when ready */}
                    {justCelebrated && (
                      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]">
                        {[...Array(8)].map((_, i) => {
                          const angle = (i / 8) * Math.PI * 2;
                          const cx = Math.cos(angle) * 70;
                          const cy = Math.sin(angle) * 70;
                          return (
                            <span
                              key={i}
                              className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-accent animate-confetti"
                              style={{
                                ["--cx" as any]: `${cx}px`,
                                ["--cy" as any]: `${cy}px`,
                                animationDelay: `${i * 40}ms`,
                              }}
                            />
                          );
                        })}
                      </span>
                    )}
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="eyebrow !text-primary-foreground/60">Order</span>
                        <h2 className="mt-1 font-display text-2xl">#{o.id}</h2>
                        <p className="mt-1 text-[0.7rem] text-primary-foreground/50">
                          {o.items?.length || 0} item{(o.items?.length || 0) === 1 ? "" : "s"} · {formatRM(Number(o.total_price))}
                        </p>
                      </div>
                      <span className={`pill ${isReady ? "bg-leaf text-primary-foreground" : "bg-accent text-accent-foreground animate-pulse-ring"}`}>
                        {STAGE_LABEL[o.status] || o.status}
                      </span>
                    </div>

                    <div className="mt-5 flex items-center gap-1">
                      {ORDER_STAGES.map((s, i) => {
                        const done = ai > i;
                        const live = ai === i;
                        const justDone = recentlyCompleted[o.id] === s;
                        return (
                          <div key={s} className="flex flex-1 items-center gap-1">
                            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold transition-all
                              ${done ? "bg-leaf text-primary-foreground" : live ? "bg-accent text-accent-foreground scale-110" : "bg-primary-foreground/10 text-primary-foreground/40"}
                              ${justDone ? "animate-stage-confirm" : ""}`}>
                              {done ? <Check className="h-4 w-4" /> : i + 1}
                            </div>
                            {i < ORDER_STAGES.length - 1 && (
                              <div className={`h-0.5 flex-1 rounded-full transition-all ${done ? "bg-leaf" : "bg-primary-foreground/15"}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex justify-between text-[0.65rem] text-primary-foreground/60">
                      {ORDER_STAGES.map((s) => <span key={s}>{STAGE_LABEL[s]}</span>)}
                    </div>

                    {isReady && (
                      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-leaf/20 px-3 py-2 text-[0.78rem] font-medium text-primary-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-accent" />
                        Your order is ready — enjoy! 🌿
                      </div>
                    )}
                  </section>
                );
              })}
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
          className="btn-emerald fixed inset-x-4 z-40 mx-auto flex max-w-md items-center justify-between rounded-full px-5 py-3.5 animate-slide-down"
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
        className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-md grid-cols-3 items-start bg-background px-2 py-2"
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
          const badge = id === "orders" ? orders.length : 0;
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
          <div className="relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-[32px] bg-background p-5 shadow-2xl animate-slide-down">
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
              <PetalButton variant="emerald" size="lg" disabled={submitting || cart.length === 0 || !tableInfo} onClick={submit} className="w-full">
                {submitting ? "Sending order..." : "Submit order"}
              </PetalButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
