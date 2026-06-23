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
  Search, Home, UtensilsCrossed, Receipt, ArrowRight, Soup, Coffee, Salad, IceCream2, ChevronRight, Bell, Smile, MessageSquare
} from "lucide-react";
import { CustomerFeedbackPanel } from "./customer/CustomerFeedbackPanel";
import { PetalButton } from "./PetalButton";
import { DragonflyMark } from "./GardenAtmosphere";
import { WingedAccent } from "./WingedAccent";
import bpDragonflyGardenLogo from "@/assets/bp-dragonfly-garden-logo.png";
import {
  fetchMenu,
  fetchTable,
  fetchSettings,
  fetchCategories,
  placeOrder,
  refreshOrder,
  fetchActiveOrdersForTable,
  customerArchiveOrder,
  fetchCustomerArchivedOrders,
  fetchRecommendations,
  callStaff,
  fetchPatterns,
  fetchMyFeedback,
  type MenuItem,
  type Order,
  type Recommendation,
  type Category,
  type Pattern,
  type CustomerFeedback,
} from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { SettingsModal } from "./SettingsModal";
import { useTranslation } from "react-i18next";

const formatRM = (v: number) => `RM ${(Number(v) || 0).toFixed(2)}`;
const ORDER_STAGES = ["queue", "preparing", "ready"] as const;
const STAGE_LABEL: Record<string, string> = { queue: "customer.received", preparing: "customer.cooking", ready: "customer.ready" };
const orderStageIndex = (status: string) => ORDER_STAGES.findIndex((stage) => stage === status);
const TABS = ["home", "menu", "orders", "feedback"] as const;
type CustomerTab = typeof TABS[number];

type Notify = (kind: "success" | "error", text: string) => void;

interface Props { qrCode: string; notify: Notify; }

type SelectedOption = { groupId: number; groupName: string; optionId: number; optionLabel: string; priceDelta: number; };
type CartLine = {
  cartKey: string;    // unique key = itemId + sorted optionIds so same item with diff options = diff lines
  id: number;
  name: string;
  price: number;      // effective price = base + sum(priceDelta)
  quantity: number;
  notes: string;
  selectedOptions: SelectedOption[];
};
type CartSource = Pick<MenuItem, "id" | "name" | "price"> & { option_groups?: MenuItem["option_groups"] };
type OrderWithVat = Order & { total_with_vat?: number | string | null };


// Map category names to friendly icons (Grab-style)
const CAT_ICON: Record<string, typeof Soup> = {
  All: UtensilsCrossed,
  Mains: Soup,
  "Small Bites": Salad,
  "Enzyme Drinks": IceCream2,
  Beverages: Coffee,
};

export const CustomerView = ({ qrCode, notify }: Props) => {
  const { t, i18n } = useTranslation();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
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
  // Direction of the last tab change — for swoosh-in animation (nav clicks only)
  const [tabDir, setTabDir] = useState<"right" | "left">("right");
  const [swoosh, setSwoosh] = useState<"right" | "left" | null>(null);
  const tabOrder: Record<string, number> = { home: 0, menu: 1, feedback: 2, orders: 3 };
  const tabRef = useRef<CustomerTab>(tab);
  tabRef.current = tab;
  /** Blocks scroll-spy from overriding tab during explicit Menu navigation (e.g. from Orders). */
  const scrollSyncSuppressedRef = useRef(false);

  const heroRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const confirmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingCartRef = useRef<CartLine[] | null>(null); // ref-backed copy of pendingCart — avoids stale closure

  // ── Confirmation countdown (8 s before order actually sent) ────────────
  const [pendingCart, setPendingCart] = useState<CartLine[] | null>(null);
  const [confirmCountdown, setConfirmCountdown] = useState(8);
  const [submitCooldown, setSubmitCooldown] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  
  // ── Upselling ───────────────────────────────────────────────────────────
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
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
  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  // ── Option selection bottom sheet ───────────────────────────────────────
  const [optionSheetItem, setOptionSheetItem] = useState<CartSource | null>(null);
  // Tracks pending selections while sheet is open: groupId → Set of optionIds
  const [pendingSelections, setPendingSelections] = useState<Record<number, Set<number>>>({});


  // Tax settings from backend
  const [taxSettings, setTaxSettings] = useState({ sstEnabled: true, sstRate: 0.06, scEnabled: true, scRate: 0.10 });

  // Categories fetched from API (ordered by display_order)
  const [categoriesFromApi, setCategoriesFromApi] = useState<Category[]>([]);

  // Feedback responses tracking
  const [feedbackList, setFeedbackList] = useState<CustomerFeedback[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(true);
  const [seenFeedbackReplies, setSeenFeedbackReplies] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`dfg_seen_feedback_replies_${qrCode}`) || "[]");
    } catch {
      return [];
    }
  });

  const loadFeedbackList = useCallback(async () => {
    try {
      const refsStr = sessionStorage.getItem(`dfg_feedback_refs_${qrCode}`);
      const refs = refsStr ? JSON.parse(refsStr) : [];
      if (!refs.length) {
        setFeedbackList([]);
        setLoadingFeedback(false);
        return;
      }
      const list = await fetchMyFeedback(qrCode, refs);
      setFeedbackList(list);
    } catch (e) {
      console.error("Failed to load feedback replies", e);
      setFeedbackList([]);
    } finally {
      setLoadingFeedback(false);
    }
  }, [qrCode]);

  const hasUnseenFeedbackResponse = useMemo(() => {
    return feedbackList.some(
      (fb) => fb.manager_response && !seenFeedbackReplies.includes(fb.id)
    );
  }, [feedbackList, seenFeedbackReplies]);

  useEffect(() => {
    sessionStorage.setItem(`dfg_archived_${qrCode}`, JSON.stringify(archivedOrders));
  }, [archivedOrders, qrCode]);
  useEffect(() => {
    sessionStorage.setItem(`dfg_show_archived_${qrCode}`, String(showArchived));
  }, [showArchived, qrCode]);

  // Dismiss search when tapping outside the search bar / results (not on scroll — that cleared the query while typing)
  useEffect(() => {
    if (!query.trim()) return;
    const dismiss = (e: Event) => {
      const el = searchWrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [query]);

  // Load recommendations when cart opens or changes
  useEffect(() => {
    if (!cartOpen || cart.length === 0) return;
    
    let alive = true;
    const fetchRecs = async () => {
      setRecsLoading(true);
      try {
        const cartIds = cart.map(c => c.id);
        const recs = await fetchRecommendations(cartIds);
        if (alive) setRecommendations(recs);
      } catch (err) {
        // gracefully ignore failure
      } finally {
        if (alive) setRecsLoading(false);
      }
    };
    
    fetchRecs();
    return () => { alive = false; };
  }, [cartOpen, cart.length, qrCode]);

  // Mark manager responses as seen when the user visits the feedback tab
  useEffect(() => {
    if (tab === "feedback" && feedbackList.length > 0) {
      const respondedIds = feedbackList
        .filter((fb) => fb.manager_response)
        .map((fb) => fb.id);
      
      const newSeenIds = respondedIds.filter(id => !seenFeedbackReplies.includes(id));
      if (newSeenIds.length > 0) {
        const updated = [...seenFeedbackReplies, ...newSeenIds];
        setSeenFeedbackReplies(updated);
        localStorage.setItem(`dfg_seen_feedback_replies_${qrCode}`, JSON.stringify(updated));
      }
    }
  }, [tab, feedbackList, qrCode, seenFeedbackReplies]);

  // Load menu + table + tax settings + categories + patterns, then restore any active orders from the DB
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [m, t, settings, cats, p] = await Promise.all([fetchMenu(), fetchTable(qrCode), fetchSettings(), fetchCategories(), fetchPatterns()]);
        if (!alive) return;
        setMenu(m);
        setTableInfo(t);
        setCategoriesFromApi(cats.sort((a, b) => a.display_order - b.display_order));
        setPatterns(p || []);
        // Load tax settings
        const sstEnabled = settings?.sst_enabled !== false && settings?.sst_enabled !== 'false';
        const scEnabled = settings?.service_charge_enabled !== false && settings?.service_charge_enabled !== 'false';
        const sstRate = sstEnabled ? parseFloat(String(settings?.sst_rate ?? 0.06)) : 0;
        const scRate = scEnabled ? parseFloat(String(settings?.service_charge_rate ?? 0.10)) : 0;
        if (alive) setTaxSettings({ sstEnabled, sstRate, scEnabled, scRate });
        // Re-hydrate active orders so they survive a refresh
        try {
          const active = await fetchActiveOrdersForTable(t.id, qrCode);
          if (alive && active.length > 0) {
            setOrders(active);
            active.forEach(o => { prevStageRef.current[o.id] = o.status; });
          }
        } catch { /* non-critical: orders panel just starts empty */ }
        // Fetch user's feedback history/replies
        if (alive) {
          loadFeedbackList();
        }
      } catch (err) {
        if (alive) notify("error", t("customer.failedLoadMenu"));
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
  useWebSocket(["ORDER_STATUS_UPDATE", "ITEM_STATUS_UPDATE", "NEW_PAYMENT", "FEEDBACK_RESPONSE"], (event) => {
    if (event.type === "FEEDBACK_RESPONSE") {
      loadFeedbackList();
      return;
    }
    const updatedOrder = event.payload as Order | null;
    if (!updatedOrder?.id) return;
    
    setOrders((cur) => {
      // If the backend marked it as archived (e.g., fully paid), remove from active orders
      if (updatedOrder.customer_archived_at) {
        if (cur.some(o => o.id === updatedOrder.id)) {
          setArchivedOrders(prev => {
            if (prev.some(a => a.id === updatedOrder.id)) return prev;
            return [updatedOrder, ...prev];
          });
        }
        return cur.filter(o => o.id !== updatedOrder.id);
      }
      
      // Only update if this order belongs to our current active session
      if (cur.some(o => o.id === updatedOrder.id)) {
        return cur.map((o) => o.id === updatedOrder.id ? updatedOrder : o);
      }
      return cur;
    });
  });

  const switchTab = (next: CustomerTab, animate = true) => {
    const prev = tabRef.current;
    if (prev === next) return;
    const dir = tabOrder[next] >= tabOrder[prev] ? "right" : "left";
    setTabDir(dir);
    setTab(next);
    tabRef.current = next;
    sessionStorage.setItem(`dfg_tab_${qrCode}`, next);
    if (animate) {
      setSwoosh(dir);
      window.setTimeout(() => setSwoosh(null), 450);
    }
  };

  // Keep sidebar tab in sync with scroll position (home + menu share one scroll area)
  useEffect(() => {
    if (tab === "orders" || tab === "feedback") return;

    const scrollEl = document.getElementById("main-scroll");
    if (!scrollEl) return;

    const syncTabFromScroll = () => {
      if (tabRef.current === "orders" || tabRef.current === "feedback" || scrollSyncSuppressedRef.current) return;

      const menuEl = document.getElementById("menu-anchor");
      if (!menuEl) return;

      const viewportTop = scrollEl.getBoundingClientRect().top;
      const menuTop = menuEl.getBoundingClientRect().top;
      const threshold = viewportTop + scrollEl.clientHeight * 0.32;
      const nextTab: CustomerTab = menuTop <= threshold ? "menu" : "home";
      switchTab(nextTab, false);
    };

    scrollEl.addEventListener("scroll", syncTabFromScroll, { passive: true });
    syncTabFromScroll();
    return () => scrollEl.removeEventListener("scroll", syncTabFromScroll);
  }, [qrCode, tab]);

  // Subtle parallax on hero — translate only, never fade out (full opacity always)
  useEffect(() => {
    const onScroll = () => {
      if (!heroRef.current) return;
      const el = document.getElementById("main-scroll");
      const y = Math.min(el?.scrollTop ?? 0, 280);
      heroRef.current.style.setProperty("--py", `${y * 0.25}px`);
    };
    const el = document.getElementById("main-scroll");
    el?.addEventListener("scroll", onScroll, { passive: true });
    return () => el?.removeEventListener("scroll", onScroll);
  }, []);

  // Compact sticky header after scrolling past the crest
  useEffect(() => {
    const el = document.getElementById("main-scroll");
    if (!el) return;
    const onScroll = () => setHeaderCollapsed(el.scrollTop > 40);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const tableGreeting = useMemo(() => {
    if (!tableInfo) {
      return { line: t("customer.toTheGarden") };
    }
    if (/(takeaway|counter|to[- ]?go)/i.test(tableInfo.table_number)) {
      return {
        line: (
          <>
            {t("customer.placing")}{" "}
            <span className="text-primary italic">{t("customer.takeawayOrder")}</span>
          </>
        ),
      };
    }
    const num = tableInfo.table_number.replace(/^table-?/i, "").trim();
    return {
      line: (
        <>
          {t("customer.atTable")}{" "}
          <span className="text-primary italic">{num}</span>
        </>
      ),
    };
  }, [tableInfo, t]);

  // Categories for the sidebar: from API (already ordered), fallback to deriving from menu
  const categories = useMemo(() => {
    if (categoriesFromApi.length > 0) {
      // Only include categories that actually have visible items
      const namesWithItems = new Set(menu.map(i => i.category_name));
      return ["All", ...categoriesFromApi.filter(c => namesWithItems.has(c.name)).map(c => c.name)];
    }
    return ["All", ...Array.from(new Set(menu.map(i => i.category_name)))];
  }, [menu, categoriesFromApi]);

  const categoryLabel = (name: string) => {
    const keys: Record<string, string> = {
      All: "customer.catAll",
      Mains: "customer.catMains",
      "Small Bites": "customer.catSmallBites",
      "Enzyme Drinks": "customer.catEnzymeDrinks",
      Beverages: "customer.catBeverages",
      "Pre-Order Specials": "customer.catPreOrderSpecials",
      "Herbal Tea": "customer.catHerbalTea",
    };
    return keys[name] ? t(keys[name]) : name;
  };
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

  // Build a cartKey from item id + sorted selected option ids
  const buildCartKey = (itemId: number, opts: SelectedOption[]) =>
    [itemId, ...opts.map(o => o.optionId).sort()].join("-");

  const addToCart = (item: CartSource, selectedOptions: SelectedOption[] = []) => {
    const effectivePrice = item.price + selectedOptions.reduce((s, o) => s + o.priceDelta, 0);
    const cartKey = buildCartKey(item.id, selectedOptions);
    setCart((c) => {
      const ex = c.find((x) => x.cartKey === cartKey);
      if (ex) return c.map((x) => (x.cartKey === cartKey ? { ...x, quantity: x.quantity + 1 } : x));
      return [...c, { cartKey, id: item.id, name: item.name, price: effectivePrice, quantity: 1, notes: "", selectedOptions }];
    });
  };

  // Called when the customer taps the + button on a menu card
  const handleAddPress = (item: CartSource) => {
    const groups = item.option_groups ?? [];
    if (groups.length === 0) {
      addToCart(item);
      return;
    }
    // Pre-populate with any manager-set defaults before opening the sheet
    const initialSelections: Record<number, Set<number>> = {};
    for (const g of groups) {
      const defaultId = (g as any).default_option_id;
      if (defaultId != null && g.options.some(o => o.id === defaultId)) {
        initialSelections[g.id] = new Set([defaultId]);
      }
    }
    setPendingSelections(initialSelections);
    setOptionSheetItem(item);
  };

  // Confirm selections from the bottom sheet
  const handleSheetConfirm = () => {
    if (!optionSheetItem) return;
    const groups = optionSheetItem.option_groups ?? [];
    // Validate all required groups have a selection
    const missing = groups.filter(g => g.is_required && !(pendingSelections[g.id]?.size ?? 0));
    if (missing.length > 0) {
      notify("error", `Please choose: ${missing.map(g => g.name).join(", ")}`);
      return;
    }
    const selectedOptions: SelectedOption[] = [];
    for (const g of groups) {
      const selected = pendingSelections[g.id];
      if (!selected) continue;
      for (const optId of selected) {
        const opt = g.options.find(o => o.id === optId);
        if (opt) selectedOptions.push({ groupId: g.id, groupName: g.name, optionId: opt.id, optionLabel: opt.label, priceDelta: opt.price_delta });
      }
    }
    addToCart(optionSheetItem, selectedOptions);
    setOptionSheetItem(null);
  };

  const togglePendingOption = (groupId: number, optionId: number, isMulti: boolean) => {
    setPendingSelections(prev => {
      const next = { ...prev };
      if (!isMulti) {
        // single-select: replace
        next[groupId] = new Set([optionId]);
      } else {
        // multi-select: toggle
        const s = new Set(prev[groupId] ?? []);
        if (s.has(optionId)) s.delete(optionId); else s.add(optionId);
        next[groupId] = s;
      }
      return next;
    });
  };


  const setQty = (cartKey: string, q: number) => {
    if (q <= 0) return setCart((c) => c.filter((x) => x.cartKey !== cartKey));
    setCart((c) => c.map((x) => (x.cartKey === cartKey ? { ...x, quantity: q } : x)));
  };
  const setNote = (cartKey: string, n: string) =>
    setCart((c) => c.map((x) => (x.cartKey === cartKey ? { ...x, notes: n } : x)));


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
        items: snapshot.map(c => ({
          menu_item_id: c.id,
          quantity: c.quantity,
          notes: c.notes,
          options: c.selectedOptions,
        }))
      });

      setOrders(cur => {
        if (cur.some(o => o.id === order.id)) {
          return cur.map(o => o.id === order.id ? order : o);
        }
        return [order, ...cur];
      });
      prevStageRef.current[order.id] = order.status;
      setCart([]);
      switchTab("orders");
      // 3-sec cooldown
      setSubmitCooldown(true);
      setTimeout(() => setSubmitCooldown(false), 3000);
    } catch {
      notify("error", t("customer.failedSendOrder"));
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



  const scrollToMenu = (opts?: { skipTabSwitch?: boolean }) => {
    scrollSyncSuppressedRef.current = true;
    if (!opts?.skipTabSwitch) switchTab("menu");

    let attempts = 0;
    const runScroll = () => {
      const scrollEl = document.getElementById("main-scroll");
      const menuEl = document.getElementById("menu-anchor");
      const stickyHeader = document.getElementById("customer-sticky-header");
      if (!scrollEl || !menuEl) {
        if (attempts++ < 24) requestAnimationFrame(runScroll);
        else scrollSyncSuppressedRef.current = false;
        return;
      }

      const containerTop = scrollEl.getBoundingClientRect().top;
      const menuTop = menuEl.getBoundingClientRect().top;
      const headerOffset = (stickyHeader?.offsetHeight ?? 0) + 12;
      const targetTop = scrollEl.scrollTop + (menuTop - containerTop) - headerOffset;
      scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    };

    requestAnimationFrame(() => requestAnimationFrame(runScroll));
    window.setTimeout(() => {
      scrollSyncSuppressedRef.current = false;
    }, 700);
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return menu.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  }, [menu, query]);
  const showSearch = query.trim().length > 0;

  // Order tracking has been disabled as per business requirements.
  // The system relies on physical printed tickets for order fulfillment.

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground animate-fade-in" dir={i18n.dir()}>
      <aside className="basis-1/5 sm:basis-[23%] md:basis-1/5 lg:basis-[11%] xl:basis-[10%] max-w-[5rem] sm:max-w-[7rem] md:max-w-none h-full border-e border-border/60 bg-card/30 flex flex-col shrink-0 overflow-y-auto px-1.5 pt-[max(0.75rem,var(--safe-top))] pb-[max(0.75rem,var(--safe-bottom))] sm:px-2 sm:pt-4 sm:pb-4 md:pt-5 md:pb-5 shadow-[var(--shadow-soft)] z-50 no-scrollbar">
        <nav className="flex flex-col gap-1 sm:gap-1.5">
          {([
            { id: "home", label: t("customer.home"), icon: Home },
            { id: "menu", label: t("customer.menu"), icon: UtensilsCrossed },
            { id: "orders", label: t("customer.orders"), icon: Receipt },
            { id: "feedback", label: t("customer.feedback.tab"), icon: MessageSquare },
          ] as const).map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const badge = id === "orders" ? orders.filter(o => o.status === "ready" && !celebratedIds.has(o.id)).length : 0;
            return (
              <button
                key={id}
                onClick={() => {
                  if (id === "menu") {
                    scrollToMenu();
                    return;
                  }
                  switchTab(id);
                  if (id === "home" || id === "orders" || id === "feedback") document.getElementById("main-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`relative flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[0.55rem] font-semibold transition-all sm:gap-1.5 sm:rounded-2xl sm:py-2 sm:text-[0.6rem] md:py-2.5 md:text-[0.65rem] ${
                  active ? "bg-primary text-primary-foreground shadow-md scale-[1.02]" : "text-foreground/50 hover:bg-muted/50 hover:text-foreground/80"
                }`}
              >
                <span className="relative grid place-items-center">
                  <Icon className={`relative h-4 w-4 transition-transform duration-300 sm:h-5 sm:w-5 md:h-[1.35rem] md:w-[1.35rem] ${active ? "scale-110" : ""}`} strokeWidth={active ? 2.4 : 2} />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1 grid h-4 w-4 place-items-center rounded-full bg-berry text-[0.55rem] font-bold text-berry-foreground shadow-sm animate-pulse-soft">
                      {badge}
                    </span>
                  )}
                  {id === "feedback" && hasUnseenFeedbackResponse && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-berry border-2 border-card shadow-sm animate-pulse-soft animate-duration-1000" />
                  )}
                </span>
                <span className="w-full min-w-0 px-0.5 text-center leading-snug break-words hyphens-auto">{label}</span>
              </button>
            );
          })}

          <button
            onClick={async () => {
              if (!tableInfo) return;
              try {
                await callStaff(tableInfo.id);
                notify("success", t("customer.staffNotified"));
              } catch (e) {
                notify("error", t("customer.failedNotifyStaff"));
              }
            }}
            className="relative mt-1 flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[0.55rem] font-semibold transition-all text-accent hover:bg-accent/10 active:scale-95 sm:mt-1.5 sm:gap-1.5 sm:rounded-2xl sm:py-2 sm:text-[0.6rem] md:py-2.5 md:text-[0.65rem]"
          >
            <span className="relative grid place-items-center bg-accent text-accent-foreground p-1 rounded-lg shadow-sm sm:p-1.5 sm:rounded-xl">
              <Smile className="relative h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.4} />
            </span>
            <span className="w-full min-w-0 px-0.5 text-center leading-snug break-words hyphens-auto">{t("customer.callStaff")}</span>
          </button>
        </nav>

        <div className="mt-3 flex flex-col gap-1 animate-fade-in sm:mt-4 sm:gap-1.5 md:mt-5">
          <div className="w-7 h-[2px] bg-border/60 mx-auto mb-1.5 rounded-full sm:mb-2" />

          {categories.map((c) => {
            const Icon = CAT_ICON[c] || UtensilsCrossed;
            const active = c === category;
            return (
              <button
                key={c}
                onClick={() => {
                  setCategory(c);
                  scrollToMenu();
                }}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[0.54rem] transition-all sm:gap-1.5 sm:rounded-2xl sm:py-1.5 sm:text-[0.6rem] md:text-[0.65rem] ${
                  active ? "bg-accent/15 text-accent font-bold ring-1 ring-accent/30" : "text-foreground/60 hover:bg-muted/50 font-medium"
                }`}
              >
                <div className={`grid place-items-center rounded-lg p-1 sm:rounded-xl sm:p-1.5 ${active ? 'bg-accent text-accent-foreground shadow-sm scale-110 transition-transform' : 'bg-muted/50 text-foreground/50'}`}>
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-[1.1rem] md:w-[1.1rem]" strokeWidth={active ? 2.5 : 2} />
                </div>
                <span className="w-full min-w-0 px-0.5 text-center leading-snug break-words hyphens-auto">{categoryLabel(c)}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 flex-1 h-full relative flex flex-col bg-background/50">
        <main id="main-scroll" className={`min-w-0 flex-1 overflow-y-auto relative no-scrollbar ${cart.length > 0 && !cartOpen && tab !== "orders" && tab !== "feedback" ? "pb-40" : "pb-8"}`}>

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
            <span className="absolute inset-0 flex items-center justify-center font-1 text-3xl font-bold">{confirmCountdown}</span>
          </div>
          <h2 className="font-1 text-2xl font-semibold mb-1">{t("customer.confirmOrder")}</h2>
          <p className="text-sm text-foreground/55 mb-6 text-center">{t("customer.confirmDesc1")}<br/>{t("customer.confirmDesc2")}</p>
          {/* Mini receipt preview */}
          <div className="w-full max-w-xs rounded-2xl border border-border bg-card/80 px-4 py-3 mb-6 space-y-1.5 max-h-52 overflow-y-auto">
            {pendingCart.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold truncate">{item.quantity}× {item.name}</span>
                <span className="shrink-0 text-foreground/60">{formatRM(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="border-t border-border/60 pt-1.5 flex justify-between font-bold">
              <span>{t("customer.total")}</span>
              <span>{formatRM(pendingCart.reduce((s, i) => s + i.price * i.quantity, 0))}</span>
            </div>
          </div>
          <button
            onClick={cancelConfirmation}
            className="w-full max-w-xs rounded-2xl border-2 border-destructive/60 py-3 text-sm font-bold text-destructive transition hover:bg-destructive/5 active:scale-95"
          >
            {t("customer.cancelGoBack")}
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
              <h2 className="font-1 text-xl font-bold text-primary-foreground leading-snug">{t("customer.dupTitle")}</h2>
              <p className="mt-1 text-sm text-primary-foreground/75">{t("customer.dupDesc")}</p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-2.5">
              <button
                onClick={() => { setShowDuplicateWarning(false); beginCountdown(); }}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition active:scale-95"
                style={{ background: "var(--gradient-hero)" }}
              >
                {t("customer.dupYes")}
              </button>
              <button
                onClick={() => setShowDuplicateWarning(false)}
                className="w-full rounded-2xl border-2 border-border py-3 text-sm font-semibold text-foreground/70 transition hover:bg-black/5 active:scale-95"
              >
                {t("customer.dupCancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ TOP BAR (sticky, app-like) ============ */}
      {tab !== "orders" && tab !== "feedback" && (
      <div
        id="customer-sticky-header"
        className={`sticky top-0 z-30 px-5 cream-frost transition-[padding] duration-300 ${
          headerCollapsed ? "pt-2 pb-2" : "pt-4 pb-3"
        }`}
      >
        <div className={`absolute left-5 z-40 transition-[top] duration-300 ${headerCollapsed ? "top-2" : "top-4"}`}>
          <SettingsModal />
        </div>

        {/* Expanded crest — logo beside welcome (pl clears settings button) */}
        <div
          className={`flex items-center justify-start gap-3 overflow-hidden ps-[3.25rem] transition-all duration-300 ${
            headerCollapsed
              ? "pointer-events-none max-h-0 opacity-0"
              : "mt-2 max-h-20 opacity-100"
          }`}
          aria-hidden={headerCollapsed}
        >
          <img
            src={bpDragonflyGardenLogo}
            alt=""
            className="h-11 w-11 shrink-0 object-contain"
          />
          <div className="min-w-0 text-start">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.28em] text-foreground/55">
              {t("customer.welcome")}
            </p>
            <p
              className="mt-0.5 font-1 text-lg font-semibold leading-tight"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 50' }}
            >
              {tableGreeting.line}
            </p>
          </div>
        </div>

        {/* Collapsed mini row — shows while scrolling */}
        <div
          className={`flex items-center justify-start gap-2 ps-[3.25rem] transition-all duration-300 ${
            headerCollapsed ? "mt-1 max-h-14 opacity-100" : "max-h-0 overflow-hidden opacity-0"
          }`}
          aria-hidden={!headerCollapsed}
        >
          <img
            src={bpDragonflyGardenLogo}
            alt=""
            className="h-8 w-8 shrink-0 object-contain"
          />
          <div className="min-w-0 leading-tight">
            <p className="text-[0.55rem] font-bold uppercase tracking-[0.24em] text-foreground/55">
              {t("customer.welcome")}
            </p>
            <p className="truncate font-1 text-sm font-semibold">{tableGreeting.line}</p>
          </div>
        </div>

        {/* Search */}
        <div
          className={`relative transition-[margin] duration-300 ${headerCollapsed ? "mt-1.5" : "mt-2.5"}`}
          ref={searchWrapRef}
        >
          <div
            className={`flex items-center gap-2 rounded-full px-4 transition-all focus-within:ring-2 focus-within:ring-accent/60 ${
              headerCollapsed ? "py-2" : "py-2.5"
            }`}
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
              placeholder={t("customer.searchMenu")}
              className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-foreground/40 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-foreground/40 hover:text-foreground/70 transition-colors"
                aria-label={t("customer.clearSearch")}
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
                    ? `${searchResults.length} ${t("customer.resultsFor")} "${query}"`
                    : `${t("customer.noMatchesFor")} "${query}"`}
                </p>
              </div>

              {searchResults.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-muted">
                    <Leaf className="h-4 w-4 text-foreground/40" />
                  </div>
                  <p className="font-1 text-sm text-foreground/70">
                    {t("customer.notOnMenu")}
                  </p>
                  <p className="mt-1 text-xs text-foreground/40">
                    {t("customer.tryBrowseMenu")}
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
                        <p className="truncate font-1 text-sm font-semibold leading-tight">
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
                        <Plus className="h-3.5 w-3.5" /> {t("customer.order")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ============ HOME / MENU SCREEN ============ */}
      {tab !== "orders" && tab !== "feedback" && (
      <div className={swoosh === "right" ? "animate-swoosh-in-right" : swoosh === "left" ? "animate-swoosh-in-left" : undefined}>
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
          <Leaf className="h-3 w-3 text-accent-soft" /> {t("customer.farmToTable")}
        </span>

        <h1 className="mt-3 font-1 text-[2.3rem] font-bold leading-[0.95] tracking-tight text-balance"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50' }}>
          {t("customer.goodnessOf")}<br />
          <span className="italic" style={{
            background: "linear-gradient(135deg, hsl(40 95% 78%) 0%, hsl(36 95% 65%) 50%, hsl(28 90% 55%) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}>{t("customer.nature")}</span>, {t("customer.servedFresh")}.
        </h1>
        <p className="mt-2.5 max-w-[16rem] text-[0.85rem] leading-snug text-primary-foreground/80">
          {t("customer.browseSub")}
        </p>

        <button
          onClick={scrollToMenu}
          className="btn-gold mt-4 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[1rem]"
        >
          {t("customer.exploreMenu")} <ArrowRight className="h-4 w-4" />
        </button>
      </header>

      {/* Active order tracker now lives on the dedicated Orders Status screen. */}

      {/* ============ SPOTLIGHT (chef's favourite) ============ */}
      {spotlight && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">{t("customer.thisWeek")}</span>
              <h2 className="mt-1">{t("customer.chefsFav")}</h2>
            </div>
          </div>
          <section className="relative mx-5 mb-7 rounded-[28px] text-primary-foreground animate-fade-up"
            style={{ background: "var(--gradient-spotlight)", boxShadow: "var(--shadow-deep)" }}>
            {/* shimmer */}
            <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
              <span className="absolute -top-4 -left-4 h-32 w-1/2 bg-white/10 blur-2xl"
                style={{ animation: "shimmer-sweep 3.4s ease-in-out infinite" }} />
            </span>

            <div className="flex items-start gap-4 p-5">
              {spotlight.image_url && (
                <div className="relative h-28 w-28 shrink-0 rounded-2xl ring-2 ring-accent/60 shadow-2xl">
                  <img src={spotlight.image_url} alt={spotlight.name} className="h-full w-full object-cover rounded-2xl" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/95 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-accent-foreground">
                  <Flame className="h-3 w-3" /> {t("customer.popular")}
                </span>
                <h3 className="mt-2 font-1 text-2xl font-bold leading-[1.05] text-balance">{spotlight.name}</h3>
                <p className="mt-1.5 line-clamp-2 text-[0.78rem] text-primary-foreground/75">
                  {spotlight.description}
                </p>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <span className="font-1 text-2xl font-bold text-accent">{formatRM(spotlight.price)}</span>
                    <span className="text-[0.65rem] text-primary-foreground/50 line-through ml-2">RM {(spotlight.price * 1.2).toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => handleAddPress(spotlight)}
                    className="grid h-10 w-10 place-items-center rounded-full bg-white text-berry shadow-lg active:scale-90"
                    aria-label={t("customer.add")}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ============ PROMOS (peek carousel) ============ */}
      {promos.length > 0 && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">{t("customer.todayOffers")}</span>
              <h2 className="mt-1">{t("customer.hotDeals")}</h2>
            </div>
            <span className="text-xs text-foreground/50">{promos.length} {t("customer.live")}</span>
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
                      {p.promo_label === "PRE-ORDER 3 DAYS" ? t("customer.preOrder3Days") : p.promo_label || t("customer.promoFallback")}
                    </span>
                    <h3 className="mt-2 font-1 text-xl font-bold leading-tight text-balance">{p.name}</h3>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[0.6rem] uppercase tracking-widest opacity-70">{t("customer.from")}</p>
                      <p className="font-1 text-xl font-bold">{formatRM(p.price)}</p>
                    </div>
                    <button
                      onClick={() => handleAddPress(p)}
                      className="grid h-10 w-10 place-items-center rounded-full bg-white text-berry shadow-lg active:scale-90"
                      aria-label={t("customer.add")}
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
              <span className="eyebrow">{t("customer.pickedForYou")}</span>
              <h2 className="mt-1">{t("customer.recommended")}</h2>
            </div>
            <button onClick={scrollToMenu}>{t("customer.viewAll")} <ChevronRight className="h-3 w-3" /></button>
          </div>
          <div className="mb-8 flex snap-x-mandatory gap-3 overflow-x-auto px-5 pb-3 no-scrollbar">
            {recommended.map((item) => (
              <article
                key={`rec-${item.id}`}
                className="snap-start group relative flex w-44 shrink-0 flex-col rounded-[20px] bg-card shadow-[var(--shadow-soft)] transition-all active:scale-[0.98]"
              >
                {/* winged accent removed per request */}
                <div className="relative aspect-[4/3] overflow-hidden rounded-t-[20px]">
                  <img src={item.image_url ?? undefined} alt={item.name} loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  {item.is_popular && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded-md bg-accent px-1.5 py-0.5 text-[0.58rem] font-extrabold uppercase text-accent-foreground shadow">
                      <Star className="h-2.5 w-2.5 fill-current" /> {t("customer.top")}
                    </span>
                  )}
                  <button
                    onClick={() => handleAddPress(item)}
                    className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition active:scale-90"
                    aria-label={t("customer.add")}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-2.5">
                  <h3 className="font-1 text-sm font-semibold leading-tight line-clamp-1">{item.name}</h3>
                  <p className="mt-0.5 text-[0.65rem] text-foreground/50 line-clamp-1">{categoryLabel(item.category_name)}</p>
                  <p className="mt-1 font-1 text-base font-bold text-primary">{formatRM(item.price)}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* ============ FULL MENU ============ */}
      <div id="menu-anchor" className="scroll-mt-40 px-5">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <span className="eyebrow">{t("customer.farmMenu")}</span>
            <h2 className="mt-1 font-1 text-[1.6rem] font-bold leading-tight">{t("customer.allGoodness")}</h2>
          </div>
          <span className="text-xs font-medium text-foreground/50">{filtered.length} {t("customer.items")}</span>
        </div>

        {/* Sticky category icons removed and relocated to Sidebar */}

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
            <Search className="mx-auto mb-2 h-8 w-8 text-foreground/30" />
            <p className="font-1 text-lg text-foreground/60">{t("customer.noMatches")}</p>
            <p className="mt-1 text-sm text-foreground/40">{t("customer.tryDifferentSearch")}</p>
          </div>
        ) : category === "All" ? (
          /* ── GROUPED VIEW: show section headings when "All" is selected ── */
          <div className="space-y-8">
            {(() => {
              // Build an ordered list of category names that have visible items
              const orderedCatNames = categoriesFromApi.length > 0
                ? categoriesFromApi.map(c => c.name).filter(name => filtered.some(i => i.category_name === name))
                : Array.from(new Set(filtered.map(i => i.category_name)));
              // Items with no matched category go last under their own name
              const seenCats = new Set(orderedCatNames);
              filtered.forEach(i => { if (!seenCats.has(i.category_name)) orderedCatNames.push(i.category_name); });

              return orderedCatNames.map(catName => {
                const sectionItems = filtered.filter(i => i.category_name === catName);
                if (sectionItems.length === 0) return null;
                return (
                  <div key={catName}>
                    {/* Section heading */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex flex-col">
                        <h3 className="font-1 text-[1.1rem] font-bold leading-tight">{categoryLabel(catName)}</h3>
                        <div className="h-0.5 w-10 bg-accent/60 rounded-full mt-1" />
                      </div>
                      <span className="text-xs text-foreground/40 font-medium">{sectionItems.length} {t("customer.items")}</span>
                    </div>
                    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {sectionItems.map((item, idx) => {
                        const pattern = patterns.find(p => p.id === item.pattern_id);
                        const patternImage = item.pattern_image_url || pattern?.image_url || item.default_pattern_image_url;
                        return (
                        <li
                          key={item.id}
                          className={`group card-luxe flex gap-3 p-3 transition-all active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] ${item.is_sold_out ? 'opacity-50 grayscale' : ''} relative`}
                          style={{ animation: `fade-up 0.5s var(--ease-out) ${Math.min(idx * 30, 400)}ms both` }}
                        >
                          {patternImage && (
                            <div className="absolute inset-0 z-0 pointer-events-none">
                              <img
                                src={patternImage}
                                alt="Pattern overlay"
                                className="h-full w-full object-cover"
                                style={{
                                  opacity: pattern?.opacity ?? 0.4,
                                  transform: `scale(${pattern?.zoom ?? 1}) rotate(${pattern?.rotation ?? 0}deg) scaleX(${pattern?.flip_horizontal ? -1 : 1}) scaleY(${pattern?.flip_vertical ? -1 : 1})`,
                                  mixBlendMode: 'multiply'
                                }}
                              />
                              {pattern?.fade_direction && pattern.fade_direction !== 'none' && (
                                <div className="absolute inset-0"
                                  style={{
                                    background: `linear-gradient(${
                                      pattern.fade_direction === 'right-to-left' ? 'to left' :
                                      pattern.fade_direction === 'left-to-right' ? 'to right' :
                                      pattern.fade_direction === 'top-to-bottom' ? 'to bottom' :
                                      'to top'
                                    }, transparent, white)`,
                                    opacity: (pattern.fade_intensity ?? 0.5)
                                  }}
                                />
                              )}
                            </div>
                          )}
                          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-primary/5 relative z-10">
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
                          <div className="flex min-w-0 flex-1 flex-col relative z-10">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-1 text-[1rem] font-semibold leading-tight">
                                {item.name}
                                {item.is_promo && <span className="ml-1.5 align-middle tag-new">{t("customer.new")}</span>}
                              </h3>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-[0.75rem] leading-snug text-foreground/55">
                              {item.description || t("customer.descriptionFallback")}
                            </p>
                            <div className="mt-auto flex items-end justify-between pt-2">
                              <p className="font-1 text-base font-bold text-primary">{formatRM(item.price)}</p>
                              <button
                                disabled={item.is_sold_out}
                                onClick={() => handleAddPress(item)}
                                className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold shadow-[var(--shadow-soft)] transition active:scale-90 ${item.is_sold_out ? 'bg-muted text-foreground/50 pointer-events-none' : 'bg-primary text-primary-foreground hover:bg-primary-glow'}`}
                              >
                                {item.is_sold_out ? t("customer.soldOut") : <><Plus className="h-3.5 w-3.5" /> {t("customer.add")}</>}
                              </button>
                            </div>
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          /* ── FLAT VIEW: a specific category is selected ── */
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((item, idx) => {
              const pattern = patterns.find(p => p.id === item.pattern_id);
              const patternImage = item.pattern_image_url || pattern?.image_url || item.default_pattern_image_url;
              return (
              <li
                key={item.id}
                className={`group card-luxe flex gap-3 p-3 transition-all active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] ${item.is_sold_out ? 'opacity-50 grayscale' : ''} relative`}
                style={{ animation: `fade-up 0.5s var(--ease-out) ${Math.min(idx * 30, 400)}ms both` }}
              >
                {patternImage && (
                  <div className="absolute inset-0 z-0 pointer-events-none">
                    <img
                      src={patternImage}
                      alt="Pattern overlay"
                      className="h-full w-full object-cover"
                      style={{
                        opacity: pattern?.opacity ?? 0.4,
                        transform: `scale(${pattern?.zoom ?? 1}) rotate(${pattern?.rotation ?? 0}deg) scaleX(${pattern?.flip_horizontal ? -1 : 1}) scaleY(${pattern?.flip_vertical ? -1 : 1})`,
                        mixBlendMode: 'multiply'
                      }}
                    />
                    {pattern?.fade_direction && pattern.fade_direction !== 'none' && (
                      <div className="absolute inset-0"
                        style={{
                          background: `linear-gradient(${
                            pattern.fade_direction === 'right-to-left' ? 'to left' :
                            pattern.fade_direction === 'left-to-right' ? 'to right' :
                            pattern.fade_direction === 'top-to-bottom' ? 'to bottom' :
                            'to top'
                          }, transparent, white)`,
                          opacity: (pattern.fade_intensity ?? 0.5)
                        }}
                      />
                    )}
                  </div>
                )}
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-primary/5 relative z-10">
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
                <div className="flex min-w-0 flex-1 flex-col relative z-10">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-1 text-[1rem] font-semibold leading-tight">
                      {item.name}
                      {item.is_promo && <span className="ml-1.5 align-middle tag-new">{t("customer.new")}</span>}
                    </h3>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[0.75rem] leading-snug text-foreground/55">
                    {item.description || t("customer.descriptionFallback")}
                  </p>
                  <div className="mt-auto flex items-end justify-between pt-2">
                    <div>
                      <p className="text-[0.58rem] font-medium uppercase tracking-widest text-foreground/40">{categoryLabel(item.category_name)}</p>
                      <p className="font-1 text-base font-bold text-primary">{formatRM(item.price)}</p>
                    </div>
                    <button
                      disabled={item.is_sold_out}
                      onClick={() => handleAddPress(item)}
                      className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold shadow-[var(--shadow-soft)] transition active:scale-90 ${item.is_sold_out ? 'bg-muted text-foreground/50 pointer-events-none' : 'bg-primary text-primary-foreground hover:bg-primary-glow'}`}
                    >
                      {item.is_sold_out ? t("customer.soldOut") : <><Plus className="h-3.5 w-3.5" /> {t("customer.add")}</>}
                    </button>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}

        {/* End plate */}
        <div className="relative mt-8 flex flex-col items-center gap-2 py-6">
          <DragonflyMark className="h-10 w-10 opacity-40" />
          <p className="font-1 text-sm italic text-foreground/40">{t("customer.endOfGarden")}</p>
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
              <Receipt className="h-3 w-3 text-accent-soft" /> {t("customer.liveTracking")}
            </span>
            <h1 className="mt-3 font-1 text-[2rem] font-bold leading-[0.95] tracking-tight">
              <span className="italic text-accent">{t("customer.yourOrders")}</span>
            </h1>
            <p className="mt-2 max-w-[18rem] text-[0.85rem] leading-snug text-primary-foreground/80">
              {t("customer.followPlates")}
            </p>
          </header>

          {/* Active orders */}
          {orders.length === 0 ? (
            <section className="mx-5 mb-8 rounded-[24px] border border-dashed border-border bg-card/60 px-6 py-12 text-center animate-fade-up">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-primary/10">
                <Soup className="h-6 w-6 text-primary" />
              </div>
              <h2 className="font-1 text-xl font-semibold">{t("customer.noOrdersYet")}</h2>
              <p className="mt-1.5 text-sm text-foreground/55">
                {t("customer.onceYouSend")}
              </p>
              <button
                onClick={scrollToMenu}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[var(--shadow-soft)] transition active:scale-95"
              >
                {t("customer.browseMenu")} <ArrowRight className="h-4 w-4" />
              </button>
            </section>
          ) : (
            <div className="mx-5 mb-8 space-y-6">
              <div className="flex items-end justify-between">
                <span className="eyebrow">{t("customer.inProgress")}</span>
                <span className="text-xs text-foreground/50">{t("customer.ordersActiveCount", { count: orders.length })}</span>
              </div>
              {orders.map((o) => {
                const RC = "hsl(44,70%,97%)";
                const timeStr = o.created_at
                  ? new Date(o.created_at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })
                  : null;
                return (
                  <div key={o.id} className="relative animate-scale-in">
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
                            <p className="text-[0.58rem] font-bold uppercase tracking-[0.22em] opacity-40">{t("customer.ticket")}</p>
                            <h2 className="font-1 text-[2.2rem] font-bold leading-none tracking-tight" style={{ color:"hsl(140,30%,18%)" }}>#{o.daily_ticket_number || o.id}</h2>
                            <p className="text-[0.7rem] opacity-50 mt-0.5">{o.table_number}{timeStr && ` · ${timeStr}`}</p>
                          </div>
                          <div>
                            {/* Dismiss button removed as per requirement - system handles archiving */}
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
                                      {item.options_json && (() => {
                                        try {
                                          const opts = JSON.parse(item.options_json);
                                          if (Array.isArray(opts) && opts.length > 0) {
                                            return (
                                              <ul className="text-[0.68rem] opacity-50 mt-0.5 list-disc pl-3.5 space-y-0.5">
                                                {opts.map((opt: any, index: number) => {
                                                  const priceSuffix = opt.delta > 0 ? ` (+${formatRM(opt.delta)})` : "";
                                                  return (
                                                    <li key={index}>
                                                      {opt.option}{priceSuffix}
                                                    </li>
                                                  );
                                                })}
                                              </ul>
                                            );
                                          }
                                        } catch (e) {
                                          return null;
                                        }
                                        return null;
                                      })()}
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

                        <div className="border-t border-dashed mb-3 mt-3" style={{ borderColor:"hsl(40,20%,68%)" }}/>
                        
                        {(() => {
                          const subtotal = Number(o.total_price);
                          // Use rates stamped on the order (from when it was created)
                          const scRate = Number(o.service_charge_rate ?? taxSettings.scRate);
                          const sstRate = Number(o.vat_rate ?? taxSettings.sstRate);
                          const sc = subtotal * scRate;
                          const sst = (subtotal + sc) * sstRate;
                          const rawTotal = subtotal + sc + sst;
                          const finalTotal = Math.round(rawTotal * 20) / 20;
                          const rounding = finalTotal - rawTotal;
                          
                          return (
                            <div className="flex flex-col gap-1 mb-2 text-sm" style={{ color:"hsl(140,20%,35%)" }}>
                              <div className="flex justify-between"><span className="opacity-75">{t("customer.subtotal")}</span><span className="font-semibold">{formatRM(subtotal)}</span></div>
                              {scRate > 0 && <div className="flex justify-between"><span className="opacity-75">{t("customer.serviceCharge")} ({Math.round(scRate * 100)}%)</span><span className="font-semibold">{formatRM(sc)}</span></div>}
                              {sstRate > 0 && <div className="flex justify-between"><span className="opacity-75">{t("customer.sst")} ({Math.round(sstRate * 100)}%)</span><span className="font-semibold">{formatRM(sst)}</span></div>}
                              {Math.abs(rounding) > 0.001 && (
                                <div className="flex justify-between"><span className="opacity-75">{t("customer.rounding")}</span><span className="font-semibold">{formatRM(rounding)}</span></div>
                              )}
                              <div className="border-t border-dashed my-2" style={{ borderColor:"hsl(40,20%,68%)" }}/>
                              <div className="flex items-center justify-between">
                                <span className="text-[0.65rem] font-bold uppercase tracking-[0.22em] opacity-60">{t("customer.total")}</span>
                                <span className="font-1 text-2xl font-bold" style={{ color:"hsl(140,30%,18%)" }}>{formatRM(finalTotal)}</span>
                              </div>
                            </div>
                          );
                        })()}
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
                <span className="eyebrow flex-1">{t("customer.archivedTickets")}</span>
                <span className="text-[0.65rem] text-foreground/40">{archivedOrders.length} · {showArchived ? t("customer.archivedHide") : t("customer.archivedShow")}</span>
              </button>
              {showArchived && (
                <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/70">
                  {archivedOrders.map(o => (
                    <li key={`arch-${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground/70">{t("customer.ticketLabel", { number: o.daily_ticket_number || o.id })}</p>
                        <p className="text-foreground/40 truncate">{(o.items||[]).map(i=>`${i.quantity}× ${i.item_name}`).join(", ")}</p>
                      </div>
                      <span className="shrink-0 font-1 text-foreground/55">
                        {(() => {
                          const st = Number(o.total_price);
                          const rT = st + (st * 0.10) + (st * 1.10 * 0.06);
                          return formatRM(Math.round(rT * 20) / 20);
                        })()}
                      </span>
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
                <span className="eyebrow">{t("customer.history")}</span>
                <span className="text-[0.65rem] text-foreground/40">{history.length} past</span>
              </div>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/70">
                {history.map((o) => (
                  <li key={`hist-${o.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Check className="h-3.5 w-3.5 shrink-0 text-leaf" />
                      <span className="truncate font-medium text-foreground/70">{t("customer.ticketLabel", { number: o.daily_ticket_number || o.id })}</span>
                      <span className="truncate text-foreground/40">· {t((o.items?.length || 0) === 1 ? "customer.historyItemCount_one" : "customer.historyItemCount_other", { count: o.items?.length || 0 })}</span>
                    </div>
                    <span className="shrink-0 font-1 text-foreground/55">{formatRM(Number((o as OrderWithVat).total_with_vat || o.total_price * 1.166))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* End plate */}
          <div className="relative mt-4 flex flex-col items-center gap-2 py-6">
            <DragonflyMark className="h-9 w-9 opacity-40" />
            <p className="font-1 text-xs italic text-foreground/40">{t("customer.endOfOrders")}</p>
          </div>
        </div>
      )}

      {tab === "feedback" && (
        <CustomerFeedbackPanel
          qrCode={qrCode}
          tableId={tableInfo?.id ?? null}
          orders={orders}
          notify={notify}
          onSuccess={() => setTab("home")}
          myFeedback={feedbackList}
          loadingMine={loadingFeedback}
          onRefreshFeedback={loadFeedbackList}
        />
      )}

      {/* ============ CART SHEET ============ */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog">
          <div className="absolute inset-0 bg-primary/40 backdrop-blur-sm animate-fade-up" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-t-[32px] bg-background p-5 shadow-2xl animate-slide-down md:rounded-[32px] md:mb-4">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-foreground/15" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <span className="eyebrow">{t("customer.checkout")}</span>
                <h2 className="mt-1 font-1 text-2xl font-semibold">{t("customer.yourCart")}</h2>
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
                      <h3 className="font-1 text-base font-semibold leading-tight">{c.name}</h3>
                      <p className="text-xs text-foreground/50">{formatRM(c.price)} {t("customer.priceEach")}</p>
                      {/* Selected options */}
                      {c.selectedOptions.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.selectedOptions.map((o, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-primary/8 px-2 py-0.5 text-[0.62rem] font-medium text-primary border border-primary/20">
                              {o.optionLabel}{o.priceDelta > 0 ? ` +RM ${o.priceDelta.toFixed(2)}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <strong className="font-1 text-base">{formatRM(c.price * c.quantity)}</strong>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-muted p-1">
                      <button onClick={() => setQty(c.cartKey, c.quantity - 1)} className="grid h-8 w-8 place-items-center rounded-full bg-background shadow-sm active:scale-90">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center font-semibold">{c.quantity}</span>
                      <button onClick={() => setQty(c.cartKey, c.quantity + 1)} className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground active:scale-90">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      value={c.notes}
                      onChange={(e) => setNote(c.cartKey, e.target.value)}
                      placeholder={t("customer.anyNotes")}
                      className="min-w-0 flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </li>

              ))}
            </ul>

            {/* Upselling Section */}
            {recommendations.length > 0 && !recsLoading && (
              <div className="mt-6 mb-2">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <h3 className="font-1 text-sm font-semibold">{t("customer.perfectPairings")}</h3>
                  {recommendations[0]?.is_fallback && <span className="text-xs text-foreground/40 ml-auto italic">{t("customer.popularChoices")}</span>}
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x-mandatory no-scrollbar -mx-2 px-2">
                  {recommendations.map(rec => (
                    <div key={`rec-${rec.id}`} className="snap-start shrink-0 w-36 rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col">
                      <div className="h-20 w-full bg-muted overflow-hidden relative">
                        {rec.image_url ? (
                          <img src={rec.image_url} alt={rec.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/5 text-primary/30"><Leaf className="h-6 w-6"/></div>
                        )}
                        {!rec.is_fallback && (
                          <div className="absolute top-1 left-1 bg-white/90 backdrop-blur rounded text-[0.55rem] font-bold px-1 py-0.5 text-accent-foreground shadow-sm">
                            {t("customer.oftenBoughtTogether")}
                          </div>
                        )}
                      </div>
                      <div className="p-2 flex flex-col flex-1">
                        <p className="font-1 text-xs font-semibold leading-tight line-clamp-2">{rec.name}</p>
                        <div className="mt-auto pt-2 flex items-center justify-between">
                          <span className="text-xs font-bold text-primary">{formatRM(rec.price)}</span>
                          <button 
                            onClick={() => addToCart(rec)}
                            className="bg-primary text-white grid place-items-center h-6 w-6 rounded-full active:scale-90"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="sticky bottom-0 mt-5 -mx-5 -mb-5 rounded-b-[32px] bg-background/95 px-5 pb-6 pt-4 backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-foreground/60">{t("customer.total")}</span>
                <strong className="font-1 text-2xl font-semibold">{formatRM(total)}</strong>
              </div>
              <PetalButton variant="emerald" size="lg" disabled={submitting || cart.length === 0 || !tableInfo || submitCooldown || !!pendingCart} onClick={startConfirmation} className="w-full">
                {submitCooldown ? t("customer.orderSent") : submitting ? t("customer.sending") : t("customer.sendOrder")}
              </PetalButton>
            </div>
          </div>
        </div>
      )}
        </main>
        {/* Floating cart summary */}
        {cart.length > 0 && !cartOpen && tab !== "orders" && tab !== "feedback" && (
          <div className="absolute bottom-[max(1rem,var(--safe-bottom))] left-3 right-3 z-50 mx-auto max-w-sm pointer-events-none">
            <div
              className="absolute -inset-1 rounded-[1.4rem] opacity-90 blur-lg animate-pulse"
              style={{ background: "linear-gradient(90deg, #a855f7, #ec4899, #fbbf24)" }}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="pointer-events-auto relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-[1.25rem] border-[3px] border-white px-4 py-4 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.35)_inset,0_20px_40px_-12px_rgba(109,40,217,0.65),0_8px_24px_rgba(236,72,153,0.45)] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(125deg, #4c1d95 0%, #be185d 48%, #ea580c 100%)",
              }}
            >
              <span
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{ background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.55) 50%, transparent 60%)" }}
                aria-hidden
              />
              <span className="relative flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/95 text-violet-700 shadow-lg ring-2 ring-white/90">
                  <ShoppingBag className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <span className="flex min-w-0 flex-col items-start leading-tight">
                  <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-amber-200/95">
                    {t("customer.viewCart")}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-md bg-black/25 px-2 py-0.5 text-sm font-black tabular-nums">
                      {cart.reduce((a, b) => a + b.quantity, 0)}
                    </span>
                    <span className="truncate text-sm font-semibold text-white/90">{t("customer.items")}</span>
                  </span>
                </span>
              </span>
              <span className="relative shrink-0 rounded-xl bg-white px-3 py-2 font-1 text-lg font-black text-violet-900 shadow-md ring-2 ring-amber-300/80">
                {formatRM(total)}
              </span>
            </button>
          </div>
        )}
      </div>
      {/* ── OPTION SELECTION BOTTOM SHEET ─────────────────────────────── */}
      {optionSheetItem && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOptionSheetItem(null); }}
        >
          <div
            className="w-full max-w-lg rounded-t-[32px] bg-background overflow-hidden"
            style={{ boxShadow: "0 -8px 40px rgba(0,0,0,0.25)", maxHeight: "88dvh", display: "flex", flexDirection: "column" }}
          >
            {/* Sheet handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="px-5 pb-3 pt-2 shrink-0 border-b">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-1 text-xl font-bold leading-tight truncate">{optionSheetItem.name}</h2>
                  <p className="text-sm text-foreground/55 mt-0.5">
                    {t("customer.from")} <span className="font-semibold text-primary">{formatRM(optionSheetItem.price)}</span>
                    {Object.values(pendingSelections).some(s => s.size > 0) && (
                      <span className="text-foreground/40 ml-1">
                        + {formatRM(Object.entries(pendingSelections).reduce((sum, [gidStr, sel]) => {
                          const g = (optionSheetItem.option_groups ?? []).find(g => g.id === parseInt(gidStr));
                          if (!g) return sum;
                          return sum + [...sel].reduce((s, oid) => s + (g.options.find(o => o.id === oid)?.price_delta ?? 0), 0);
                        }, 0))}
                      </span>
                    )}
                  </p>
                </div>
                <button onClick={() => setOptionSheetItem(null)} className="p-2 rounded-full hover:bg-muted transition shrink-0">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Option groups - scrollable */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {(optionSheetItem.option_groups ?? []).map(group => (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-sm">{group.name}</span>
                    {group.is_required
                      ? <span className="text-[0.6rem] font-bold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Required</span>
                      : <span className="text-[0.6rem] font-medium text-muted-foreground">Optional</span>
                    }
                  </div>
                  <div className="space-y-2">
                    {group.options.map(opt => {
                      const selected = pendingSelections[group.id]?.has(opt.id) ?? false;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => togglePendingOption(group.id, opt.id, group.is_multi_select)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                            selected
                              ? "border-primary bg-primary/8 shadow-sm"
                              : "border-border bg-card hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                              selected ? "border-primary bg-primary" : "border-border"
                            }`}>
                              {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                            </div>
                            <span className="text-sm font-medium">{opt.label}</span>
                          </div>
                          {opt.price_delta > 0 && (
                            <span className="text-sm font-semibold text-primary shrink-0 ml-2">+{formatRM(opt.price_delta)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 border-t shrink-0">
              <button
                onClick={handleSheetConfirm}
                className="w-full rounded-2xl py-4 text-base font-bold text-white transition active:scale-[0.98]"
                style={{ background: "var(--gradient-hero)" }}
              >
                {t("customer.addToOrder")} · {formatRM(
                  optionSheetItem.price + Object.entries(pendingSelections).reduce((sum, [gidStr, sel]) => {
                    const g = (optionSheetItem.option_groups ?? []).find(g => g.id === parseInt(gidStr));
                    if (!g) return sum;
                    return sum + [...sel].reduce((s, oid) => s + (g.options.find(o => o.id === oid)?.price_delta ?? 0), 0);
                  }, 0)
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

