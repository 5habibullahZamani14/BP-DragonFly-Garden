import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const ORDER_STAGES = ["pending", "confirmed", "cooking", "ready", "completed"];
const STATUS_ACTIONS = {
  pending: ["confirmed"],
  confirmed: ["cooking", "ready"],
  cooking: ["ready"],
  ready: ["completed"],
  completed: []
};
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const formatCurrency = (value) => currencyFormatter.format(value);
const apiUrl = (path) => `${API_BASE}${path}`;

const getUrlContext = () => {
  const params = new URLSearchParams(window.location.search);

  return {
    view: params.get("view") === "kitchen" ? "kitchen" : "customer",
    tableId: params.get("table") || "1",
    qrCode: params.get("qr") || ""
  };
};

const setUrlContext = (updates) => {
  const url = new URL(window.location.href);

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(key);
      return;
    }

    url.searchParams.set(key, value);
  });

  window.history.replaceState({}, "", url);
};

function CustomerView({ notify }) {
  const initialContext = useMemo(() => getUrlContext(), []);
  const [menu, setMenu] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState([]);
  const [tableId, setTableId] = useState(initialContext.tableId);
  const [tableInfo, setTableInfo] = useState(null);
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
    if (!initialContext.qrCode) {
      return;
    }

    let cancelled = false;

    const resolveTable = async () => {
      try {
        const response = await fetch(apiUrl(`/tables/qr/${encodeURIComponent(initialContext.qrCode)}`));
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Table QR code is invalid");
        }

        if (!cancelled) {
          setTableInfo(data);
          setTableId(String(data.id));
          setUrlContext({ table: data.id, qr: data.qr_code });
        }
      } catch (error) {
        if (!cancelled) {
          notify("error", error.message);
        }
      }
    };

    resolveTable();

    return () => {
      cancelled = true;
    };
  }, [initialContext.qrCode, notify]);

  useEffect(() => {
    if (!activeOrder?.id || activeOrder.status === "completed") {
      return undefined;
    }

    const pollOrder = async () => {
      try {
        const response = await fetch(apiUrl(`/orders/${activeOrder.id}`));
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

  const categories = useMemo(() => ["All", ...new Set(menu.map((item) => item.category_name))], [menu]);
  const filteredMenu = useMemo(
    () => (selectedCategory === "All" ? menu : menu.filter((item) => item.category_name === selectedCategory)),
    [menu, selectedCategory]
  );
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);

  const addToCart = (item) => {
    setCart((currentCart) => {
      const existing = currentCart.find((cartItem) => cartItem.id === item.id);

      if (existing) {
        return currentCart.map((cartItem) =>
          cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
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
    if (cart.length === 0) {
      notify("error", "Add at least one item before checkout.");
      return;
    }

    setSubmittingOrder(true);

    try {
      const response = await fetch(apiUrl("/orders"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          table_id: Number(tableId),
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
          <label className="table-picker">
            <span>Table</span>
            <select
              value={tableId}
              onChange={(event) => {
                const value = event.target.value;
                setTableId(value);
                setUrlContext({ table: value, qr: tableInfo?.qr_code || null });
              }}
              disabled={Boolean(tableInfo)}
            >
              {[1, 2, 3, 4, 5].map((tableNumber) => (
                <option key={tableNumber} value={tableNumber}>
                  Table {tableNumber}
                </option>
              ))}
            </select>
          </label>

          {tableInfo ? <p className="table-lock">Locked from {tableInfo.table_number} QR</p> : null}
        </div>
      </section>

      {activeOrder ? (
        <section className="status-panel">
          <div className="status-panel__header">
            <div>
              <p className="section-label">Current order</p>
              <h2>Order #{activeOrder.id}</h2>
            </div>
            <p className={`status-badge status-badge--${activeOrder.status}`}>{activeOrder.status}</p>
          </div>

          <div className="status-track">
            {ORDER_STAGES.map((stage) => {
              const activeIndex = ORDER_STAGES.indexOf(activeOrder.status);
              const stageIndex = ORDER_STAGES.indexOf(stage);
              const state = activeIndex > stageIndex ? "done" : activeIndex === stageIndex ? "live" : "next";

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
                  <button type="button" className="action-button" onClick={() => addToCart(item)}>
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
            <p className="cart-count">{cart.reduce((count, item) => count + item.quantity, 0)} items</p>
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
                    <button type="button" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
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
              disabled={submittingOrder || cart.length === 0}
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

function KitchenView({ notify }) {
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const loadKitchenData = async ({ background = false } = {}) => {
    if (!background) {
      setLoading(true);
    }

    try {
      const [ordersResponse, tablesResponse] = await Promise.all([
        fetch(apiUrl("/orders/kitchen")),
        fetch(apiUrl("/tables"))
      ]);

      const [ordersData, tablesData] = await Promise.all([
        ordersResponse.json(),
        tablesResponse.json()
      ]);

      if (!ordersResponse.ok) {
        throw new Error(ordersData.error || "Unable to load kitchen orders");
      }

      if (!tablesResponse.ok) {
        throw new Error(tablesData.error || "Unable to load tables");
      }

      setOrders(ordersData);
      setTables(tablesData);
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
    return ORDER_STAGES.slice(0, 4).map((status) => ({
      status,
      orders: orders.filter((order) => order.status === status)
    }));
  }, [orders]);

  const updateStatus = async (orderId, status) => {
    setUpdatingOrderId(orderId);

    try {
      const response = await fetch(apiUrl(`/orders/${orderId}/status`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
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
            Watch incoming orders, advance each ticket, and print QR cards for table placement.
          </p>
        </div>

        <div className="hero-band__controls hero-band__controls--stack">
          <button type="button" className="action-button" onClick={loadKitchenData}>
            Refresh board
          </button>
          <a className="mode-link" href="/">
            Open customer view
          </a>
        </div>
      </section>

      <section className="kitchen-layout">
        <div className="kitchen-board">
          {loading && !hasLoadedOnce ? <p className="empty-state">Loading kitchen board...</p> : null}

          <div className="kitchen-columns">
            {groupedOrders.map((group) => (
              <section key={group.status} className="kitchen-column">
                <div className="kitchen-column__header">
                  <h2>{group.status}</h2>
                  <span>{group.orders.length}</span>
                </div>

                <div className="kitchen-column__body">
                  {group.orders.length === 0 ? <p className="empty-state">No orders</p> : null}

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
                            {status}
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

        <aside className="qr-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Table QR</p>
              <h2>Ready to print</h2>
            </div>
          </div>

          <div className="qr-grid">
            {tables.map((table) => (
              <article key={table.id} className="qr-card">
                <div className="qr-card__code" dangerouslySetInnerHTML={{ __html: table.qr_svg }} />
                <h3>{table.table_number}</h3>
                <a className="qr-link" href={table.ordering_url} target="_blank" rel="noreferrer">
                  Open ordering link
                </a>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}

function App() {
  const initialContext = useMemo(() => getUrlContext(), []);
  const [message, setMessage] = useState(null);

  const notify = (type, text) => {
    setMessage({ type, text });
  };

  return (
    <main className="app-shell">
      <header className="mode-bar">
        <a className={initialContext.view === "customer" ? "mode-link mode-link--active" : "mode-link"} href="/">
          Customer
        </a>
        <a
          className={initialContext.view === "kitchen" ? "mode-link mode-link--active" : "mode-link"}
          href="/?view=kitchen"
        >
          Kitchen
        </a>
      </header>

      {message ? (
        <section className={`message-strip message-strip--${message.type}`}>{message.text}</section>
      ) : null}

      {initialContext.view === "kitchen" ? <KitchenView notify={notify} /> : <CustomerView notify={notify} />}
    </main>
  );
}

export default App;
