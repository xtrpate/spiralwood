import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import "./orders.css";
import { PackageSearch, ShoppingBag } from "lucide-react";

const STATUS_META = {
  pending: {
    badge: "Pending",
    title: "Order received",
    short: "Waiting for confirmation",
    desc: "We received your order and it is waiting for confirmation.",
  },
  confirmed: {
    badge: "Confirmed",
    title: "Confirmed",
    short: "Preparing your order",
    desc: "Your order has been confirmed and is now being prepared.",
  },
  production: {
    badge: "Production",
    title: "In production",
    short: "Furniture is being prepared",
    desc: "Your furniture is currently being built or prepared.",
  },
  shipping: {
    badge: "Shipping",
    title: "Out for delivery",
    short: "On the way to your address",
    desc: "Your order is already on the way to your address.",
  },
  delivered: {
    badge: "Delivered",
    title: "Delivered",
    short: "Delivered to your address",
    desc: "Your order was marked as delivered.",
  },
  completed: {
    badge: "Completed",
    title: "Completed",
    short: "Order finished successfully",
    desc: "This order has been completed successfully.",
  },
  cancelled: {
    badge: "Cancelled",
    title: "Cancelled",
    short: "Order was cancelled",
    desc: "This order was cancelled and will no longer continue.",
  },
};

const PAY_STATUS_META = {
  unpaid: { label: "Unpaid" },
  partial: { label: "Payment review" },
  paid: { label: "Paid" },
};

const PAY_METHOD_LABELS = {
  cod: "Cash on delivery",
  cop: "Cash on pick-up",
  gcash: "GCash",
  bank_transfer: "Bank transfer",
  paymongo: "Online payment",
  cash: "Cash",
};

const TRACKING_STEPS = [
  {
    key: "pending",
    label: "Order received",
    desc: "We received your order and are waiting to confirm it.",
  },
  {
    key: "confirmed",
    label: "Confirmed",
    desc: "Your order has been reviewed and confirmed.",
  },
  {
    key: "production",
    label: "In production",
    desc: "Your furniture is now being prepared or built.",
  },
  {
    key: "shipping",
    label: "Out for delivery",
    desc: "Your order is on the way to your address.",
  },
  {
    key: "delivered",
    label: "Delivered",
    desc: "Your order has been delivered.",
  },
  {
    key: "completed",
    label: "Completed",
    desc: "Your order has been completed successfully.",
  },
];

const STEP_ORDER = [
  "pending",
  "confirmed",
  "production",
  "shipping",
  "delivered",
  "completed",
];

function getStepIndex(status) {
  return STEP_ORDER.indexOf(status);
}

function fmt(n) {
  return (
    "₱" +
    parseFloat(n || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateShort(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getItemSubtotal(item) {
  if (item?.subtotal != null) return Number(item.subtotal || 0);
  return Number(item?.quantity || 0) * Number(item?.unit_price || 0);
}

function TrackingList({ order }) {
  if (order.status === "cancelled") {
    return (
      <div className="tl-cancel-card">
        <div className="tl-cancel-badge">Cancelled</div>
        <div className="tl-cancel-title">This order was cancelled</div>

        {order.cancellation_reason && (
          <div className="tl-cancel-copy">
            Reason: {order.cancellation_reason}
          </div>
        )}

        {order.cancelled_at && (
          <div className="tl-cancel-copy">
            Cancelled on {fmtDate(order.cancelled_at)}
          </div>
        )}

        {order.refund_status && order.refund_status !== "none" && (
          <div className="tl-cancel-copy">
            Refund status:{" "}
            {order.refund_status === "pending" ? "Pending" : "Processed"}
          </div>
        )}
      </div>
    );
  }

  const currentIdx = getStepIndex(order.status);

  return (
    <div className="tl-clean">
      {TRACKING_STEPS.map((step, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        const isFuture = i > currentIdx;

        return (
          <div
            key={step.key}
            className={`tl-clean-item ${isDone ? "done" : ""} ${isActive ? "active" : ""} ${isFuture ? "future" : ""}`}
          >
            <div className="tl-clean-marker">
              <div className="tl-clean-dot">
                {isDone ? (
                  "✓"
                ) : isActive ? (
                  <span className="tl-clean-live" />
                ) : (
                  ""
                )}
              </div>
              {i < TRACKING_STEPS.length - 1 && (
                <div className={`tl-clean-line ${isDone ? "done" : ""}`} />
              )}
            </div>

            <div className="tl-clean-content">
              <div className="tl-clean-topline">
                <div className="tl-clean-title">{step.label}</div>
                <div className="tl-clean-state">
                  {isDone ? "Done" : isActive ? "Current" : "Next"}
                </div>
              </div>
              <div className="tl-clean-desc">{step.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderModal({
  orderId,
  onClose,
  onConfirmOrder,
  onCancelOrder,
  onReviewOrder,
}) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/customer/orders/${orderId}`)
      .then((r) => setOrder(r.data))
      .catch((err) => {
        console.error(
          "Failed to load customer order detail:",
          err?.response?.data || err,
        );
        setOrder(null);
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  const canPayNow =
    String(order?.status || "").toLowerCase() === "pending" &&
    String(order?.payment_method || "").toLowerCase() === "paymongo" &&
    String(order?.payment_status || "").toLowerCase() === "unpaid" &&
    order?.payment_url;

  const canCustomerConfirm =
    order?.status === "delivered" &&
    String(order?.payment_status || "").toLowerCase() === "paid";

  const sm = STATUS_META[order?.status] || {
    badge: order?.status || "Order",
    title: order?.status || "Order",
    short: "",
    desc: "",
  };

  const pm = PAY_STATUS_META[order?.payment_status] || {
    label: order?.payment_status || "—",
  };

  return (
    <div className="om-backdrop" onClick={onClose}>
      <div className="om-panel" onClick={(e) => e.stopPropagation()}>
        <button className="om-close" onClick={onClose}>
          ×
        </button>

        {loading ? (
          <div
            className="om-loading"
            style={{
              animation: "appt-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              padding: "32px",
              display: "block",
            }}
          >
            <div
              style={{
                height: "32px",
                width: "150px",
                background: "#f3f4f6",
                marginBottom: "8px",
                borderRadius: "4px",
              }}
            />
            <div
              style={{
                height: "16px",
                width: "100px",
                background: "#f3f4f6",
                marginBottom: "32px",
                borderRadius: "4px",
              }}
            />
            <div
              style={{
                height: "100px",
                width: "100%",
                background: "#f3f4f6",
                marginBottom: "24px",
                borderRadius: "8px",
              }}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr",
                gap: "24px",
              }}
            >
              <div
                style={{
                  height: "200px",
                  background: "#f3f4f6",
                  borderRadius: "8px",
                }}
              />
              <div
                style={{
                  height: "200px",
                  background: "#f3f4f6",
                  borderRadius: "8px",
                }}
              />
            </div>
            <style>{`@keyframes appt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }`}</style>
          </div>
        ) : !order ? (
          <div className="om-loading">
            <p>Could not load this order.</p>
          </div>
        ) : (
          <>
            <div className="om-header">
              <div className="om-header-left">
                <div className="om-order-num">{order.order_number}</div>
                <div className="om-order-date">
                  Placed on {fmtDateShort(order.created_at)}
                </div>
              </div>

              <div className="om-badges">
                <span className="om-badge om-badge-dark">{sm.badge}</span>
                <span className="om-badge om-badge-light">{pm.label}</span>
              </div>
            </div>

            <div className="om-status-card">
              <div className="om-section-kicker">Current status</div>
              <div className="om-status-title">{sm.title}</div>
              <div className="om-status-desc">{sm.desc}</div>

              {order.status === "delivered" && canCustomerConfirm && (
                <div className="om-inline-note om-inline-note-strong">
                  Your order has been delivered. You may now confirm receipt.
                </div>
              )}

              {order.status === "delivered" && !canCustomerConfirm && (
                <div className="om-inline-note">
                  Payment must be fully settled before this order can be marked
                  as completed.
                </div>
              )}
            </div>

            <div className="om-grid">
              <div className="om-main">
                <div className="om-section">
                  <div className="om-section-title">Order timeline</div>
                  <TrackingList order={order} />
                </div>

                <div className="om-section">
                  <div className="om-section-title">Items</div>
                  <div className="om-items">
                    {(order.items || []).map((item, i) => (
                      <div key={i} className="om-item">
                        <div className="om-item-img">
                          {item.image_url ? (
                            <img
                              src={buildAssetUrl(item.image_url)}
                              alt={item.product_name}
                            />
                          ) : (
                            <div className="om-item-img-placeholder">Item</div>
                          )}
                        </div>

                        <div className="om-item-info">
                          <div className="om-item-name">
                            {item.product_name}
                          </div>
                          <div className="om-item-qty">
                            Quantity: {item.quantity}
                          </div>
                        </div>

                        <div className="om-item-price">
                          <div className="om-item-unit">
                            {fmt(item.unit_price)} each
                          </div>
                          <div className="om-item-subtotal">
                            {fmt(getItemSubtotal(item))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <aside className="om-side">
                <div className="om-side-card">
                  <div className="om-section-title">Order summary</div>

                  <div className="om-total-row">
                    <span>Subtotal</span>
                    <span>{fmt(order.subtotal)}</span>
                  </div>

                  <div className="om-total-row om-total-final">
                    <span>Total</span>
                    <span>{fmt(order.total)}</span>
                  </div>
                </div>

                <div className="om-side-card">
                  <div className="om-section-title">Order details</div>

                  <div className="om-detail-list">
                    <div className="om-detail-row">
                      <span>Delivery address</span>
                      <strong>{order.delivery_address || "—"}</strong>
                    </div>

                    <div className="om-detail-row">
                      <span>Payment method</span>
                      <strong>
                        {PAY_METHOD_LABELS[
                          String(order.payment_method).toLowerCase()
                        ] ||
                          order.payment_method ||
                          "—"}
                      </strong>
                    </div>

                    <div className="om-detail-row">
                      <span>Payment status</span>
                      <strong>{pm.label}</strong>
                    </div>

                    <div className="om-detail-row">
                      <span>Order date</span>
                      <strong>{fmtDate(order.created_at)}</strong>
                    </div>
                  </div>

                  {order.notes && (
                    <div className="om-note-block">
                      <div className="om-note-label">Notes</div>
                      <div className="om-note-value">{order.notes}</div>
                    </div>
                  )}

                  {order.payment_proof && (
                    <a
                      href={buildAssetUrl(order.payment_proof)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="om-proof-link"
                    >
                      View payment proof
                    </a>
                  )}
                </div>

                {(order.status === "pending" || canCustomerConfirm) && (
                  <div className="om-side-card">
                    <div className="om-section-title">Available actions</div>

                    <div className="om-action-stack">
                      {canPayNow && (
                        <button
                          className="order-inline-btn order-inline-btn-primary om-action-btn"
                          onClick={() =>
                            window.location.assign(order.payment_url)
                          }
                          style={{
                            background: "#2563eb",
                            borderColor: "#2563eb",
                            color: "#ffffff",
                          }}
                        >
                          Pay Now
                        </button>
                      )}

                      {order.status === "pending" && (
                        <button
                          className="order-inline-btn order-inline-btn-outline om-action-btn"
                          onClick={() => onCancelOrder(order.id)}
                        >
                          Cancel order
                        </button>
                      )}

                      {canCustomerConfirm && (
                        <>
                          <button
                            className="order-inline-btn order-inline-btn-outline om-action-btn"
                            onClick={() => onReviewOrder(order.id)}
                          >
                            Review
                          </button>
                          <button
                            className="order-inline-btn order-inline-btn-primary om-action-btn"
                            onClick={() => onConfirmOrder(order.id)}
                          >
                            Confirm receipt
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [customRequestMap, setCustomRequestMap] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedOrderId, setFocusedOrderId] = useState(null);

  const fetchOrders = () => {
    setLoading(true);

    Promise.all([
      api.get("/customer/orders"),
      api.get("/customer/custom-orders").catch(() => ({ data: [] })),
    ])
      .then(([ordersRes, customOrdersRes]) => {
        const nextOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
        const nextCustomOrders = Array.isArray(customOrdersRes.data)
          ? customOrdersRes.data
          : [];

        const nextCustomRequestMap = nextCustomOrders.reduce((acc, item) => {
          const orderNumber = String(item?.order_number || "").trim();
          const numericId = Number(item?.id || 0);

          if (orderNumber && numericId > 0) {
            acc[orderNumber] = numericId;
          }

          return acc;
        }, {});

        setOrders(nextOrders);
        setCustomRequestMap(nextCustomRequestMap);
      })
      .catch((err) => {
        console.error(
          "Failed to load customer orders:",
          err?.response?.data || err,
        );
        setOrders([]);
        setCustomRequestMap({});
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const verifySuccess = searchParams.get("verify_success");
    const orderNumber = searchParams.get("order");

    if (verifySuccess === "true" && orderNumber) {
      setLoading(true);
      api
        .post("/customer/orders/verify-payment", {
          order_number: orderNumber,
        })
        .then(() => {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        })
        .catch((err) => console.error("Verification error:", err))
        .finally(() => {
          fetchOrders();
        });
    } else {
      fetchOrders();
    }
  }, []);

  const confirmOrderById = async (orderId) => {
    const ok = window.confirm(
      "Are you sure you want to confirm that you have received this order?",
    );
    if (!ok) return;

    try {
      await api.put(`/customer/orders/${orderId}/confirm`);
      setSelectedId(null);
      fetchOrders();
    } catch {
      alert("Failed to confirm the order. Please try again.");
    }
  };

  const reviewOrderById = () => {
    alert("Review feature coming soon!");
  };

  const cancelOrderById = async (orderId) => {
    const reason = window.prompt("Please provide a reason for cancellation:");
    if (reason === null) return;

    try {
      await api.put(`/customer/orders/${orderId}/cancel`, { reason });
      setSelectedId(null);
      fetchOrders();
      alert("Order has been cancelled.");
    } catch {
      alert("Failed to cancel the order. Please try again.");
    }
  };

  const handleOpenOrder = (order) => {
    const customRequestId =
      customRequestMap[String(order?.order_number || "").trim()];

    if (customRequestId) {
      navigate(`/custom-requests/${customRequestId}`);
      return;
    }

    setSelectedId(order.id);
  };

  // Notification double-click focus support: clears the status tab
  // filter so the record can't be hidden, locates it, scrolls it into
  // view, briefly highlights it, and opens it through the existing
  // handleOpenOrder logic (which itself correctly redirects to the
  // custom-request page for blueprint orders). Fails safely if the
  // order no longer exists — never guesses a record from message text.
  useEffect(() => {
    const focusId = searchParams.get("focus_order_id");
    if (!focusId || loading) return;

    const numericId = Number(focusId);
    const match = orders.find((o) => Number(o.id) === numericId);

    if (!match) {
      const next = new URLSearchParams(searchParams);
      next.delete("focus_order_id");
      setSearchParams(next, { replace: true });
      return;
    }

    setFilter("all");
    setFocusedOrderId(numericId);
    handleOpenOrder(match);

    const scrollTimer = setTimeout(() => {
      document
        .getElementById(`order-card-${numericId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);

    const highlightTimer = setTimeout(() => setFocusedOrderId(null), 4000);

    const next = new URLSearchParams(searchParams);
    next.delete("focus_order_id");
    setSearchParams(next, { replace: true });

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(highlightTimer);
    };
  }, [searchParams, loading, orders]);

  const STATUS_TABS = [
    { key: "all", label: "All orders" },
    { key: "pending", label: "Pending" },
    { key: "confirmed", label: "Confirmed" },
    { key: "production", label: "Production" },
    { key: "shipping", label: "Shipping" },
    { key: "delivered", label: "Delivered" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  const filtered = (
    filter === "all" ? [...orders] : orders.filter((o) => o.status === filter)
  ).sort((a, b) => {
    const dateDiff = new Date(b.created_at) - new Date(a.created_at);
    if (dateDiff !== 0) return dateDiff;
    return Number(b.id || 0) - Number(a.id || 0);
  });

  return (
    <div className="orders-page">
      <div className="orders-hero">
        <div>
          <h1>My orders</h1>
          <p>
            Review your order history and check the latest status of each order.
          </p>
        </div>

        <button
          className="orders-shop-btn"
          onClick={() => navigate("/catalog")}
        >
          Continue shopping
        </button>
      </div>

      <div className="orders-tabs">
        {STATUS_TABS.map((tab) => {
          const count = orders.filter((o) => o.status === tab.key).length;

          return (
            <button
              key={tab.key}
              className={`orders-tab ${filter === tab.key ? "active" : ""}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              {tab.key !== "all" && count > 0 && (
                <span className="orders-tab-count">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div
          style={{
            animation: "appt-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            marginTop: "24px",
          }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="order-card"
              style={{
                height: "180px",
                background: "#ffffff",
                borderColor: "#e5e7eb",
                marginBottom: "16px",
                padding: "24px",
              }}
            >
              <div
                style={{
                  height: "24px",
                  width: "200px",
                  background: "#f3f4f6",
                  marginBottom: "16px",
                }}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "16px",
                }}
              >
                <div style={{ height: "60px", background: "#f3f4f6" }} />
                <div style={{ height: "60px", background: "#f3f4f6" }} />
                <div style={{ height: "60px", background: "#f3f4f6" }} />
                <div style={{ height: "60px", background: "#f3f4f6" }} />
              </div>
            </div>
          ))}
          <style>{`@keyframes appt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div className="orders-empty-premium">
          <div className="orders-empty-icon-wrapper">
            <PackageSearch size={48} strokeWidth={1.5} />
          </div>
          <h2>
            {filter === "all" ? "No orders found" : `No ${filter} orders`}
          </h2>
          <p>
            {filter === "all"
              ? "You haven't placed any orders yet. Once you do, they will appear here so you can track their status and delivery."
              : `You currently don't have any orders in the "${filter}" status.`}
          </p>

          {filter === "all" && (
            <div className="orders-empty-actions">
              <button
                type="button"
                className="orders-primary-btn"
                onClick={() => navigate("/catalog")}
              >
                <ShoppingBag size={16} />
                Start Shopping
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="orders-list">
          {filtered.map((order) => {
            const sm = STATUS_META[order.status] || {
              badge: order.status,
              title: order.status,
              short: "",
              desc: "",
            };

            const pm = PAY_STATUS_META[order.payment_status] || {
              label: order.payment_status,
            };

            const canCustomerConfirm =
              order.status === "delivered" &&
              String(order.payment_status || "").toLowerCase() === "paid";

            const isCustomRequest =
              !!customRequestMap[String(order?.order_number || "").trim()];

            const canPayNow =
              String(order?.status || "").toLowerCase() === "pending" &&
              String(order.payment_method || "").toLowerCase() === "paymongo" &&
              String(order.payment_status || "").toLowerCase() === "unpaid" &&
              order.payment_url;

            return (
              <div
                key={order.id}
                id={`order-card-${order.id}`}
                className="order-card"
                onClick={() => handleOpenOrder(order)}
                style={
                  focusedOrderId === order.id
                    ? { boxShadow: "0 0 0 3px #0a0a0a" }
                    : undefined
                }
              >
                <div className="order-card-top">
                  <div>
                    <div className="order-card-num">{order.order_number}</div>
                    <div className="order-card-date">
                      Placed on {fmtDateShort(order.created_at)}
                    </div>
                  </div>

                  <div className="order-card-badges">
                    <span className="order-badge order-badge-dark">
                      {sm.badge}
                    </span>
                    <span className="order-badge order-badge-light">
                      {pm.label}
                    </span>
                  </div>
                </div>

                <div className="order-card-main">
                  <div className="order-card-status-panel">
                    <div className="order-card-status-label">
                      Current status
                    </div>
                    <div className="order-card-status-title">{sm.title}</div>
                    <div className="order-card-status-desc">{sm.desc}</div>
                  </div>

                  <div className="order-card-facts">
                    <div className="order-fact-card">
                      <div className="order-fact-label">Items</div>
                      <div className="order-fact-value">
                        {order.total_qty || 0} item
                        {(order.total_qty || 0) !== 1 ? "s" : ""}
                      </div>
                    </div>

                    <div className="order-fact-card">
                      <div className="order-fact-label">Payment method</div>
                      <div className="order-fact-value">
                        {PAY_METHOD_LABELS[
                          String(order.payment_method).toLowerCase()
                        ] ||
                          order.payment_method ||
                          "—"}
                      </div>
                    </div>

                    <div className="order-fact-card">
                      <div className="order-fact-label">Payment status</div>
                      <div className="order-fact-value">{pm.label}</div>
                    </div>

                    <div className="order-fact-card">
                      <div className="order-fact-label">Delivery address</div>
                      <div className="order-fact-value order-fact-value-address">
                        {order.delivery_address || "No delivery address yet"}
                      </div>
                    </div>
                  </div>

                  <div className="order-card-side">
                    <div className="order-total-box">
                      <div className="order-card-total-label">Total</div>
                      <div className="order-card-total">{fmt(order.total)}</div>
                    </div>

                    <div className="order-card-actions">
                      {canPayNow && (
                        <button
                          className="order-inline-btn order-inline-btn-primary"
                          onClick={(e) => {
                            e.stopPropagation(); // Prevents the modal from opening
                            window.location.assign(order.payment_url);
                          }}
                          style={{
                            background: "#2563eb",
                            borderColor: "#2563eb",
                            color: "#ffffff",
                          }}
                        >
                          Pay Now
                        </button>
                      )}

                      {order.status === "pending" && (
                        <button
                          className="order-inline-btn order-inline-btn-outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelOrderById(order.id);
                          }}
                        >
                          Cancel order
                        </button>
                      )}

                      {canCustomerConfirm && (
                        <button
                          className="order-inline-btn order-inline-btn-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmOrderById(order.id);
                          }}
                        >
                          Confirm receipt
                        </button>
                      )}

                      <button
                        className="order-inline-btn order-inline-btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenOrder(order);
                        }}
                      >
                        {isCustomRequest ? "View request" : "View order"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedId && (
        <OrderModal
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onConfirmOrder={confirmOrderById}
          onCancelOrder={cancelOrderById}
          onReviewOrder={reviewOrderById}
        />
      )}
    </div>
  );
}
