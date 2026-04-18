import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import "./orders.css";

const STATUS_META = {
  pending: { label: "Pending" },
  confirmed: { label: "Confirmed" },
  production: { label: "Production" },
  shipping: { label: "Shipping" },
  delivered: { label: "Delivered" },
  completed: { label: "Completed" },
  cancelled: { label: "Cancelled" },
};

const PAY_STATUS_META = {
  unpaid: { label: "Unpaid" },
  partial: { label: "Proof submitted" },
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
    label: "Order placed",
    desc: "Your order has been received and is awaiting confirmation.",
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
    desc: "Your order is on the way.",
  },
  {
    key: "delivered",
    label: "Delivered",
    desc: "Your order has been delivered.",
  },
  {
    key: "completed",
    label: "Completed",
    desc: "The order has been completed successfully.",
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
    parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })
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
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TrackingTimeline({ order }) {
  const isCancelled = order.status === "cancelled";
  const currentIdx = getStepIndex(order.status);

  if (isCancelled) {
    return (
      <div className="tl-cancelled">
        <div className="tl-cancelled-mark">Cancelled</div>
        <div className="tl-cancelled-title">This order was cancelled</div>

        {order.cancellation_reason && (
          <div className="tl-cancelled-reason">
            Reason: {order.cancellation_reason}
          </div>
        )}

        {order.cancelled_at && (
          <div className="tl-cancelled-date">
            Cancelled on {fmtDate(order.cancelled_at)}
          </div>
        )}

        {order.refund_status && order.refund_status !== "none" && (
          <div className="tl-refund-note">
            Refund:{" "}
            {order.refund_status === "pending" ? "Pending" : "Processed"}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tl-wrap">
      {TRACKING_STEPS.map((step, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        const isFuture = i > currentIdx;

        return (
          <div
            key={step.key}
            className={`tl-step ${isDone ? "done" : ""} ${isActive ? "active" : ""} ${isFuture ? "future" : ""}`}
          >
            {i < TRACKING_STEPS.length - 1 && (
              <div className={`tl-line ${isDone || isActive ? "filled" : ""}`} />
            )}

            <div className="tl-circle">
              {isDone ? (
                <span className="tl-check">✓</span>
              ) : isActive ? (
                <span className="tl-active-dot" />
              ) : (
                <span className="tl-num">{i + 1}</span>
              )}
            </div>

            <div className="tl-content">
              <div className="tl-step-label">{step.label}</div>
              {isActive && <div className="tl-step-desc">{step.desc}</div>}
              {isDone && <div className="tl-step-done-label">Completed</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderModal({ orderId, onClose }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("tracking");

  const canCustomerConfirm =
    order?.status === "delivered" &&
    String(order?.payment_status || "").toLowerCase() === "paid";

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

  return (
    <div className="om-backdrop" onClick={onClose}>
      <div className="om-panel" onClick={(e) => e.stopPropagation()}>
        <button className="om-close" onClick={onClose}>
          ×
        </button>

        {loading ? (
          <div className="om-loading">
            <div className="om-spinner" />
            <p>Loading…</p>
          </div>
        ) : !order ? (
          <div className="om-loading">
            <p>Could not load order.</p>
          </div>
        ) : (
          <>
            <div className="om-header">
              <div>
                <div className="om-order-num">{order.order_number}</div>
                <div className="om-order-date">
                  Placed {fmtDateShort(order.created_at)}
                </div>
              </div>

              <div className="om-badges">
                <span className="om-badge om-badge-dark">
                  {STATUS_META[order.status]?.label || order.status}
                </span>
                <span className="om-badge om-badge-light">
                  {PAY_STATUS_META[order.payment_status]?.label ||
                    order.payment_status}
                </span>
              </div>
            </div>

            <div className="om-tabs">
              <button
                className={`om-tab ${tab === "tracking" ? "active" : ""}`}
                onClick={() => setTab("tracking")}
              >
                Tracking
              </button>
              <button
                className={`om-tab ${tab === "details" ? "active" : ""}`}
                onClick={() => setTab("details")}
              >
                Details
              </button>
            </div>

            {tab === "tracking" && (
              <div className="om-tab-body">
                <TrackingTimeline order={order} />

                {!["completed", "cancelled", "delivered"].includes(
                  order.status,
                ) && (
                  <div className="om-note-box">
                    <div className="om-note-title">Order updates</div>
                    <div className="om-note-desc">
                      You will receive updates as your order progresses.
                    </div>
                  </div>
                )}

                {order.status === "delivered" && canCustomerConfirm && (
                  <div className="om-note-box om-note-box-strong">
                    <div className="om-note-title">Order delivered</div>
                    <div className="om-note-desc">
                      You may now confirm receipt of this order.
                    </div>
                  </div>
                )}

                {order.status === "delivered" && !canCustomerConfirm && (
                  <div className="om-note-box">
                    <div className="om-note-title">Payment required</div>
                    <div className="om-note-desc">
                      This order cannot be completed yet because payment is not
                      fully settled.
                    </div>
                  </div>
                )}

                {order.status === "completed" && (
                  <div className="om-note-box om-note-box-strong">
                    <div className="om-note-title">Order completed</div>
                    <div className="om-note-desc">
                      Thank you for your purchase.
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "details" && (
              <div className="om-tab-body">
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
                          {item.variation_id && (
                            <div className="om-item-var">
                              Variation #{item.variation_id}
                            </div>
                          )}
                          <div className="om-item-qty">
                            Qty: {item.quantity}
                          </div>
                        </div>

                        <div className="om-item-price">
                          <div className="om-item-unit">
                            {fmt(item.unit_price)} each
                          </div>
                          <div className="om-item-subtotal">
                            {fmt(item.subtotal)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="om-section om-totals">
                  <div className="om-total-row">
                    <span>Subtotal</span>
                    <span>{fmt(order.subtotal)}</span>
                  </div>
                  <div className="om-total-row om-total-final">
                    <span>Total</span>
                    <span>{fmt(order.total)}</span>
                  </div>
                </div>

                <div className="om-section om-meta-grid">
                  <div className="om-meta-block">
                    <div className="om-meta-label">Delivery address</div>
                    <div className="om-meta-value">
                      {order.delivery_address || "—"}
                    </div>
                  </div>

                  <div className="om-meta-block">
                    <div className="om-meta-label">Payment method</div>
                    <div className="om-meta-value">
                      {PAY_METHOD_LABELS[order.payment_method] ||
                        order.payment_method}
                    </div>
                  </div>

                  <div className="om-meta-block">
                    <div className="om-meta-label">Order date</div>
                    <div className="om-meta-value">
                      {fmtDate(order.created_at)}
                    </div>
                  </div>

                  <div className="om-meta-block">
                    <div className="om-meta-label">Payment status</div>
                    <div className="om-meta-value">
                      {PAY_STATUS_META[order.payment_status]?.label ||
                        order.payment_status}
                    </div>
                  </div>

                  {order.notes && (
                    <div className="om-meta-block om-meta-full">
                      <div className="om-meta-label">Notes</div>
                      <div className="om-meta-value">{order.notes}</div>
                    </div>
                  )}
                </div>

                {order.payment_proof && (
                  <div className="om-section">
                    <div className="om-meta-label">Proof of payment</div>
                    <a
                      href={buildAssetUrl(order.payment_proof)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="om-proof-link"
                    >
                      View payment proof
                    </a>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [customRequestMap, setCustomRequestMap] = useState({});

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

  const handleConfirmOrder = async (e, orderId) => {
    e.stopPropagation();
    if (
      window.confirm(
        "Are you sure you want to confirm that you have received this order?",
      )
    ) {
      try {
        await api.put(`/customer/orders/${orderId}/confirm`);
        fetchOrders();
      } catch {
        alert("Failed to confirm the order. Please try again.");
      }
    }
  };

  const handleReviewOrder = (e) => {
    e.stopPropagation();
    alert("Review feature coming soon!");
  };

  const handleCancelOrder = async (e, orderId) => {
    e.stopPropagation();
    const reason = window.prompt("Please provide a reason for cancellation:");

    if (reason !== null) {
      try {
        await api.put(`/customer/orders/${orderId}/cancel`, { reason });
        fetchOrders();
        alert("Order has been cancelled.");
      } catch {
        alert("Failed to cancel the order. Please try again.");
      }
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

  const CUSTOM_SORT_ORDER = {
    delivered: 1,
    shipping: 2,
    production: 3,
    confirmed: 4,
    pending: 5,
    completed: 6,
    cancelled: 7,
  };

  const filtered = (
    filter === "all" ? [...orders] : orders.filter((o) => o.status === filter)
  ).sort((a, b) => {
    const rankA = CUSTOM_SORT_ORDER[a.status] || 99;
    const rankB = CUSTOM_SORT_ORDER[b.status] || 99;

    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <div className="orders-page">
      <div className="orders-hero">
        <div>
          <h1>My orders</h1>
          <p>Track your orders from placement to delivery.</p>
        </div>

        <button className="orders-shop-btn" onClick={() => navigate("/catalog")}>
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
        <div className="orders-empty">
          <div className="orders-spinner" />
          <p>Loading your orders…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="orders-empty">
          <div className="orders-empty-icon">No orders</div>
          <h3>{filter === "all" ? "No orders yet" : `No ${filter} orders`}</h3>
          <p>
            {filter === "all"
              ? "Start shopping and your orders will appear here."
              : `You do not have any ${filter} orders right now.`}
          </p>

          {filter === "all" && (
            <button
              className="orders-shop-btn"
              onClick={() => navigate("/catalog")}
            >
              Browse products
            </button>
          )}
        </div>
      ) : (
        <div className="orders-list">
          {filtered.map((order) => {
            const sm = STATUS_META[order.status] || {
              label: order.status,
            };

            const pm = PAY_STATUS_META[order.payment_status] || {
              label: order.payment_status,
            };

            const stepIdx = getStepIndex(order.status);
            const progressPct =
              order.status === "cancelled"
                ? 0
                : Math.round(((stepIdx + 1) / STEP_ORDER.length) * 100);

            const canCustomerConfirm =
              order.status === "delivered" &&
              String(order.payment_status || "").toLowerCase() === "paid";

            return (
              <div
                key={order.id}
                className="order-card"
                onClick={() => handleOpenOrder(order)}
              >
                <div className="order-card-top">
                  <div className="order-card-num">{order.order_number}</div>

                  <div className="order-card-badges">
                    <span className="order-badge order-badge-dark">
                      {sm.label}
                    </span>
                    <span className="order-badge order-badge-light">
                      {pm.label}
                    </span>
                  </div>
                </div>

                {order.status !== "cancelled" && (
                  <div className="order-progress-wrap">
                    <div className="order-progress-bar">
                      <div
                        className="order-progress-fill"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    <div className="order-progress-steps">
                      {TRACKING_STEPS.map((step, i) => (
                        <div
                          key={step.key}
                          className={`order-progress-dot ${i <= stepIdx ? "done" : ""} ${i === stepIdx ? "active" : ""}`}
                          title={step.label}
                        />
                      ))}
                    </div>

                    <div className="order-progress-labels">
                      <span>Order placed</span>
                      <span>Completed</span>
                    </div>
                  </div>
                )}

                <div className="order-card-meta">
                  <span>{fmtDateShort(order.created_at)}</span>
                  <span>
                    {order.total_qty || 0} item
                    {(order.total_qty || 0) !== 1 ? "s" : ""}
                  </span>
                  <span>
                    {PAY_METHOD_LABELS[order.payment_method] ||
                      order.payment_method}
                  </span>
                </div>

                {order.delivery_address && (
                  <div className="order-card-address">
                    {order.delivery_address}
                  </div>
                )}

                <div className="order-card-footer">
                  <span className="order-card-total">{fmt(order.total)}</span>

                  <div className="order-card-actions">
                    {order.status === "pending" && (
                      <button
                        className="order-inline-btn order-inline-btn-danger"
                        onClick={(e) => handleCancelOrder(e, order.id)}
                      >
                        Cancel order
                      </button>
                    )}

                    {canCustomerConfirm ? (
                      <>
                        <button
                          className="order-inline-btn order-inline-btn-outline"
                          onClick={(e) => handleReviewOrder(e, order.id)}
                        >
                          Review
                        </button>
                        <button
                          className="order-inline-btn order-inline-btn-primary"
                          onClick={(e) => handleConfirmOrder(e, order.id)}
                        >
                          Confirm receipt
                        </button>
                      </>
                    ) : (
                      <span className="order-card-view">
                        {customRequestMap[String(order?.order_number || "").trim()]
                          ? "View request"
                          : "View order"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedId && (
        <OrderModal orderId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}