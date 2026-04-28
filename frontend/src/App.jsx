import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

const ORDER_STAGES = ["queue", "preparing", "ready"];
const STATUS_ACTIONS = {
  queue: ["preparing"],
  preparing: ["ready"],
  ready: []
};

const TABLE_QR_PATTERN = /^table-\d+$/;
const KITCHEN_QR_PATTERN = /^kitchen-crew-[a-z0-9_-]+$/i;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const formatCurrency = (value) => currencyFormatter.format(value);
const apiUrl = (path, qrCode) => {
  const base = `${API_BASE}${path}`;
  if (!qrCode) {
    return base;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${base}${separator}qr_code=${encodeURIComponent(qrCode)}`;
};

const detectRoleFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const qrCode = (params.get("qr") || "").trim().toLowerCase();

  if (KITCHEN_QR_PATTERN.test(qrCode)) {
    return { role: "kitchen", qrCode };
  }

  if (TABLE_QR_PATTERN.test(qrCode)) {
    return { role: "customer", qrCode };
  }

  return { role: "landing", qrCode: "" };
};

function LandingView() {
  return (
    <section className="landing">
      <p className="eyebrow">Welcome</p>
      <h1>Restaurant Garden</h1>
      <p className="hero-copy">
        Please scan the QR code on your table to view the menu and place your order.
      </p>
      <p className="landing__hint">
        If you'd rather order in person, just press the bell on your table and a waiter will come over.
      </p>
    </section>
  );
}

function CustomerView({ qrCode, notify }) {
  const [menu, setMenu] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState([]);
  const [tableInfo, setTableInfo] = useState(null);
  const [tableError, setTableError] = useState(null);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadMenu = async () => {
      setLoadingMenu(true);

      try {
        const response = await fetch(apiUrl("/menu"));
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load menu");
        }

        if (!cancelled) {
          setMenu(data);
        }
      } catch (error) {
        if (!cancelled) {
          notify("error", error.message);
        }
      } finally {
        if (!cancelled) {
          setLoadingMenu(false);
        }
      }
    };

    loadMenu();

    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    let cancelled = false;

    const resolveTable = async () => {
      try {
        const response = await fetch(apiUrl(`/tables/qr/${encodeURIComponent(qrCode)}`));
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Table QR code is invalid");
        }

        if (!cancelled) {
          setTableInfo(data);
          setTableError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setTableError(error.message);
          notify("error", error.message);
        }
      }
    };

    resolveTable();

    return () => {
      cancelled = true;
    };
  }, [qrCode, notify]);

  useEffect(() => {
    if (!activeOrder?.id || activeOrder.status === "ready") {
      return undefined;
    }

    const pollOrder = async () => {
      try {
        const response = await fetch(apiUrl(`/orders/${activeOrder.id}`, qrCode));
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to refresh order status");
        }

        setActiveOrder(data);
      } catch (error) {
        notify("error", error.message);
      }
    };

    const intervalId = window.setInterval(pollOrder, 8000);
    return () => window.clearInterval(intervalId);
  }, [activeOrder, notify]);

  const categories = useMemo(
    () => ["All", ...new Set(menu.map((item) => item.category_name))],
    [menu]
  );
  const filteredMenu = useMemo(
    () =>
      selectedCategory === "All"
        ? menu
        : menu.filter((item) => item.category_name === selectedCategory),
    [menu, selectedCategory]
  );
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const addToCart = (item) => {
    setCart((currentCart) => {
      const existing = currentCart.find((cartItem) => cartItem.id === item.id);

      if (existing) {
        return currentCart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }

      return [
        ...currentCart,
        { id: item.id, name: item.name, price: item.price, quantity: 1, notes: "" }
      ];
    });
  };

  const updateQuantity = (id, quantity) => {
    if (quantity <= 0) {
      setCart((currentCart) => currentCart.filter((item) => item.id !== id));
      return;
    }

    setCart((currentCart) =>
      currentCart.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const updateNotes = (id, notes) => {
    setCart((currentCart) =>
      currentCart.map((item) => (item.id === id ? { ...item, notes } : item))
    );
  };

  const placeOrder = async () => {
    if (!tableInfo) {
      notify("error", "Table QR code has not been verified yet.");
      return;
    }

    if (cart.length === 0) {
      notify("error", "Add at least one item before checkout.");
      return;
    }

    setSubmittingOrder(true);

    try {
      const response = await fetch(apiUrl("/orders", qrCode), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_id: tableInfo.id,
          items: cart.map((item) => ({
            menu_item_id: item.id,
            quantity: item.quantity,
            notes: item.notes
          }))
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to place order");
      }

      setActiveOrder(data.order);
      setCart([]);
      notify("success", `Order #${data.order.id} sent to the kitchen.`);
    } catch (error) {
      notify("error", error.message);
    } finally {
      setSubmittingOrder(false);
    }
  };

  if (tableError && !tableInfo) {
    return (
      <section className="landing">
        <p className="eyebrow">Invalid QR code</p>
        <h1>We couldn't find your table</h1>
        <p className="hero-copy">{tableError}</p>
        <p className="landing__hint">Please scan the QR code on your table again, or ask a waiter for help.</p>
      </section>
    );
  }

  return (
    <>
      <section className="hero-band">
        <div>
          <p className="eyebrow">QR table ordering</p>
          <h1>Restaurant Garden</h1>
          <p className="hero-copy">
            Browse the live menu, send your order straight to the kitchen, and track it as it moves.
          </p>
        </div>

        <div className="hero-band__controls">
          <div className="table-lock-card">
            <span className="section-label">Table</span>
            <strong>{tableInfo ? tableInfo.table_number : "Verifying..."}</strong>
          </div>
        </div>
      </section>

      {activeOrder ? (
        <section className="status-panel">
          <div className="status-panel__header">
            <div>
              <p className="section-label">Current order</p>
              <h2>Order #{activeOrder.id}</h2>
            </div>
            <p className={`status-badge status-badge--${activeOrder.status}`}>
              {activeOrder.status}
            </p>
          </div>

          <div className="status-track">
            {ORDER_STAGES.map((stage) => {
              const activeIndex = ORDER_STAGES.indexOf(activeOrder.status);
              const stageIndex = ORDER_STAGES.indexOf(stage);
              const state =
                activeIndex > stageIndex
                  ? "done"
                  : activeIndex === stageIndex
                  ? "live"
                  : "next";

              return (
                <div key={stage} className={`status-step status-step--${state}`}>
                  <span>{stageIndex + 1}</span>
                  <strong>{stage}</strong>
                </div>
              );
            })}
          </div>

          <div className="status-panel__meta">
            <p>{activeOrder.table_number}</p>
            <p>{formatCurrency(activeOrder.total_price)}</p>
          </div>
        </section>
      ) : null}

      <section className="content-grid">
        <div className="menu-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Menu</p>
              <h2>Available dishes</h2>
            </div>
          </div>

          <div className="category-row">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={category === selectedCategory ? "chip chip--active" : "chip"}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {loadingMenu ? <p className="empty-state">Loading menu...</p> : null}

          <div className="menu-grid">
            {filteredMenu.map((item) => (
              <article key={item.id} className="menu-card">
                <div>
                  <p className="menu-card__category">{item.category_name}</p>
                  <h3>{item.name}</h3>
                  <p className="menu-card__description">
                    {item.description || "Chef special prepared fresh to order."}
                  </p>
                </div>

                <div className="menu-card__footer">
                  <strong>{formatCurrency(item.price)}</strong>
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => addToCart(item)}
                  >
                    Add
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="cart-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Checkout</p>
              <h2>Your cart</h2>
            </div>
            <p className="cart-count">
              {cart.reduce((count, item) => count + item.quantity, 0)} items
            </p>
          </div>

          {cart.length === 0 ? (
            <p className="empty-state">Choose a few dishes to start an order.</p>
          ) : (
            <div className="cart-list">
              {cart.map((item) => (
                <div key={item.id} className="cart-item">
                  <div className="cart-item__top">
                    <div>
                      <h3>{item.name}</h3>
                      <p>{formatCurrency(item.price)} each</p>
                    </div>
                    <strong>{formatCurrency(item.price * item.quantity)}</strong>
                  </div>

                  <div className="quantity-controls">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>

                  <label className="notes-field">
                    <span>Notes</span>
                    <input
                      type="text"
                      value={item.notes}
                      placeholder="No onions, extra sauce..."
                      onChange={(event) => updateNotes(item.id, event.target.value)}
                    />
                  </label>
                </div>
              ))}
            </div>
          )}

          <div className="cart-footer">
            <div className="summary-row">
              <span>Total</span>
              <strong>{formatCurrency(total)}</strong>
            </div>

            <button
              type="button"
              className="checkout-button"
              disabled={submittingOrder || cart.length === 0 || !tableInfo}
              onClick={placeOrder}
            >
              {submittingOrder ? "Sending order..." : "Submit order"}
            </button>
          </div>
        </aside>
      </section>
    </>
  );
}

function KitchenView({ qrCode, notify }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const loadKitchenData = async ({ background = false } = {}) => {
    if (!background) {
      setLoading(true);
    }

    try {
      const response = await fetch(apiUrl("/orders/kitchen", qrCode));
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load kitchen orders");
      }

      setOrders(data);
      setHasLoadedOnce(true);
    } catch (error) {
      notify("error", error.message);
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadKitchenData();
    const intervalId = window.setInterval(() => {
      loadKitchenData({ background: true });
    }, 7000);
    return () => window.clearInterval(intervalId);
  }, []);

  const groupedOrders = useMemo(() => {
    return ORDER_STAGES.map((status) => ({
      status,
      orders: orders.filter((order) => order.status === status)
    }));
  }, [orders]);

  const updateStatus = async (orderId, status) => {
    setUpdatingOrderId(orderId);

    try {
      const response = await fetch(apiUrl(`/orders/${orderId}/status`, qrCode), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update order status");
      }

      setOrders((currentOrders) =>
        currentOrders.map((order) => (order.id === orderId ? data.order : order))
      );
    } catch (error) {
      notify("error", error.message);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <>
      <section className="hero-band">
        <div>
          <p className="eyebrow">Kitchen board</p>
          <h1>Live service view</h1>
          <p className="hero-copy">
            Watch incoming orders and advance each ticket from queue to ready.
          </p>
        </div>

        <div className="hero-band__controls hero-band__controls--stack">
          <button type="button" className="action-button" onClick={() => loadKitchenData()}>
            Refresh board
          </button>
        </div>
      </section>

      <section className="kitchen-layout kitchen-layout--full">
        <div className="kitchen-board">
          {loading && !hasLoadedOnce ? (
            <p className="empty-state">Loading kitchen board...</p>
          ) : null}

          <div className="kitchen-columns">
            {groupedOrders.map((group) => (
              <section key={group.status} className="kitchen-column">
                <div className="kitchen-column__header">
                  <h2>{group.status}</h2>
                  <span>{group.orders.length}</span>
                </div>

                <div className="kitchen-column__body">
                  {group.orders.length === 0 ? (
                    <p className="empty-state">No orders</p>
                  ) : null}

                  {group.orders.map((order) => (
                    <article key={order.id} className="ticket-card">
                      <div className="ticket-card__header">
                        <div>
                          <p className="section-label">{order.table_number}</p>
                          <h3>Order #{order.id}</h3>
                        </div>
                        <strong>{formatCurrency(order.total_price)}</strong>
                      </div>

                      <div className="ticket-items">
                        {order.items.map((item) => (
                          <div key={item.id} className="ticket-item">
                            <div>
                              <strong>
                                {item.quantity} x {item.item_name}
                              </strong>
                              {item.notes ? <p>{item.notes}</p> : null}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="ticket-actions">
                        {STATUS_ACTIONS[order.status].map((status) => (
                          <button
                            key={status}
                            type="button"
                            className="chip chip--action"
                            disabled={updatingOrderId === order.id}
                            onClick={() => updateStatus(order.id, status)}
                          >
                            Mark {status}
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function App() {
  const initial = useMemo(() => detectRoleFromUrl(), []);
  const [message, setMessage] = useState(null);

  const notify = (type, text) => {
    setMessage({ type, text });
  };

  let body;
  if (initial.role === "kitchen") {
    body = <KitchenView qrCode={initial.qrCode} notify={notify} />;
  } else if (initial.role === "customer") {
    body = <CustomerView qrCode={initial.qrCode} notify={notify} />;
  } else {
    body = <LandingView />;
  }

  return (
    <main className="app-shell">
      {message ? (
        <section className={`message-strip message-strip--${message.type}`}>
          {message.text}
        </section>
      ) : null}

      {body}
    </main>
  );
}

export default App;
