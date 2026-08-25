import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import "./orders.css";
import { PackageSearch, ShoppingBag } from "lucide-react";
import CustomerBlueprintViewer from "./CustomerBlueprintViewer";

const STATUS_META = {
  pending: {
    badge: "Pending",
    title: "Order received",
    short: "Waiting for confirmation",
    desc: "Your order has been received and is awaiting confirmation.",
  },
  confirmed: {
    badge: "Confirmed",
    title: "Confirmed",
    short: "Preparing your order",
    desc: "Your order has been confirmed and is being prepared.",
  },
  production: {
    badge: "In Production",
    title: "In production",
    short: "Furniture is being prepared",
    desc: "Your furniture is currently being built or prepared.",
  },
  shipping: {
    badge: "Out for Delivery",
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

function OrderModal({ orderId, onClose, onConfirmOrder, onCancelOrder }) {
  const navigate = useNavigate();
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
                borderRadius: "0px",
              }}
            />
            <div
              style={{
                height: "16px",
                width: "100px",
                background: "#f3f4f6",
                marginBottom: "32px",
                borderRadius: "0px",
              }}
            />
            <div
              style={{
                height: "100px",
                width: "100%",
                background: "#f3f4f6",
                marginBottom: "24px",
                borderRadius: "0px",
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
                  borderRadius: "0px",
                }}
              />
              <div
                style={{
                  height: "200px",
                  background: "#f3f4f6",
                  borderRadius: "0px",
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
              <div className="om-section-kicker">Status</div>
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
                  <div className="om-section-title">Order Timeline</div>
                  <TrackingList order={order} />
                </div>

                <div className="om-section">
                  <div className="om-section-title">Items</div>
                  <div className="om-items">
                    {(order.items || []).map((item, i) => (
                      <div key={i} className="om-item">
                        <div className="om-item-img">
                          {order.blueprint_id &&
                          i === 0 &&
                          order.blueprint_detail_preview ? (
                            <div className="wisdom-order-blueprint-detail-live">
                              <CustomerBlueprintViewer
                                blueprint={{
                                  ...order.blueprint_detail_preview,
                                  thumbnail_url: null,
                                }}
                                readOnly
                                showHumanControls={false}
                                compact
                                compactHeight={96}
                                defaultPreset="isometric"
                                defaultShowHuman={false}
                              />
                            </div>
                          ) : item.image_url ? (
                            <img
                              src={buildAssetUrl(item.image_url)}
                              alt={item.product_name || "Order item"}
                            />
                          ) : order.blueprint_detail_preview?.thumbnail_url ? (
                            <img
                              src={buildAssetUrl(
                                order.blueprint_detail_preview.thumbnail_url,
                              )}
                              alt={
                                order.blueprint_detail_preview.title ||
                                "Blueprint preview"
                              }
                            />
                          ) : order.blueprint_detail_preview?.file_url &&
                            ["jpg", "jpeg", "png", "webp"].includes(
                              String(
                                order.blueprint_detail_preview.file_type || "",
                              ).toLowerCase(),
                            ) ? (
                            <img
                              src={buildAssetUrl(
                                order.blueprint_detail_preview.file_url,
                              )}
                              alt={
                                order.blueprint_detail_preview.title ||
                                "Imported blueprint preview"
                              }
                            />
                          ) : order.blueprint_id ? (
                            <div className="om-blueprint-placeholder">
                              <svg
                                viewBox="0 0 48 48"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <rect x="8" y="5" width="32" height="38" />
                                <path d="M14 14h20M14 20h20M14 26h9M27 26h7M14 32h20M18 10v28M31 10v28" />
                              </svg>
                              <span>Blueprint</span>
                            </div>
                          ) : (
                            <div className="om-item-img-placeholder">Item</div>
                          )}
                        </div>

                        <div className="om-item-info">
                          <div className="om-item-name">
                            {order.blueprint_id
                              ? order.blueprint_detail_preview?.title
                                ? `Custom Blueprint – ${order.blueprint_detail_preview.title}`
                                : "Custom Blueprint Order"
                              : item.product_name}
                          </div>
                          <div className="om-item-qty">Qty {item.quantity}</div>
                        </div>

                        <div className="om-item-price">
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
                  <div className="om-section-title">Order Summary</div>

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
                  <div className="om-section-title">Order Details</div>

                  <div className="om-detail-list">
                    <div className="om-detail-row">
                      <span>Delivery Address</span>
                      <strong>{order.delivery_address || "—"}</strong>
                    </div>

                    <div className="om-detail-row">
                      <span>Payment Method</span>
                      <strong>
                        {PAY_METHOD_LABELS[
                          String(order.payment_method).toLowerCase()
                        ] ||
                          order.payment_method ||
                          "—"}
                      </strong>
                    </div>

                    <div className="om-detail-row">
                      <span>Payment Status</span>
                      <strong>{pm.label}</strong>
                    </div>

                    <div className="om-detail-row">
                      <span>Order Date</span>
                      <strong>{fmtDate(order.created_at)}</strong>
                    </div>
                  </div>

                  {order.receipt?.id && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 14,
                        borderTop: "1px solid #e4e4e7",
                      }}
                    >
                      <div
                        className="om-detail-row"
                        style={{ marginBottom: 12 }}
                      >
                        <span>Receipt</span>
                        <strong>{order.receipt.receipt_number}</strong>
                      </div>

                      <button
                        type="button"
                        className="order-inline-btn order-inline-btn-primary om-action-btn"
                        style={{ width: "100%" }}
                        onClick={() =>
                          navigate(
                            `/orders/${order.id}/receipts/${order.receipt.id}`,
                          )
                        }
                      >
                        View Receipt
                      </button>
                    </div>
                  )}

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
                    <div className="om-section-title">Actions</div>

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
                          Cancel Order
                        </button>
                      )}

                      {canCustomerConfirm && (
                        <>
                          <button
                            className="order-inline-btn order-inline-btn-primary om-action-btn"
                            onClick={() => onConfirmOrder(order.id)}
                          >
                            Confirm Received
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

  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedOrderId, setFocusedOrderId] = useState(null);

  const fetchOrders = () => {
    setLoading(true);

    // WISDOM CUSTOMER ORDERS FAST LOAD V1
    // The main orders endpoint already includes order_type and order id,
    // so the page no longer waits for a second custom-orders request.
    api
      .get("/customer/orders")
      .then((ordersRes) => {
        const nextOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
        setOrders(nextOrders);
      })
      .catch((err) => {
        console.error(
          "Failed to load customer orders:",
          err?.response?.data || err,
        );
        setOrders([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const redirectParams = new URLSearchParams(window.location.search);
    const verifySuccess = redirectParams.get("verify_success");
    const orderNumber = redirectParams.get("order");

    if (verifySuccess === "true" && orderNumber) {
      setLoading(true);

      api
        .post("/customer/orders/verify-payment", {
          order_number: orderNumber,
        })
        .then(({ data }) => {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );

          if (data?.success && data?.payment_status === "paid") {
            try {
              const raw = sessionStorage.getItem(
                "wisdom_last_order_confirmation",
              );
              const confirmation = raw ? JSON.parse(raw) : {};

              sessionStorage.setItem(
                "wisdom_last_order_confirmation",
                JSON.stringify({
                  ...(confirmation && typeof confirmation === "object"
                    ? confirmation
                    : {}),
                  order_number:
                    data.order_number ||
                    confirmation?.order_number ||
                    orderNumber,
                  payment_method: "paymongo",
                  payment_status: "paid",
                  receipt_id: data.receipt_id || null,
                  receipt_number: data.receipt_number || null,
                }),
              );
            } catch {
              // Verification remains successful even if browser storage is unavailable.
            }

            navigate("/order-complete", { replace: true });
            return;
          }

          fetchOrders();
        })
        .catch((err) => {
          console.error("Verification error:", err);
          // Keep verify_success + order in the URL on failure so a refresh can
          // safely retry after a temporary backend/database issue is fixed.
          fetchOrders();
        });
    } else {
      fetchOrders();
    }
  }, []);

  const [orderToConfirm, setOrderToConfirm] = useState(null);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const confirmOrderById = (orderId) => {
    setOrderToConfirm(orderId);
  };

  const executeConfirmOrder = async () => {
    if (!orderToConfirm) return;
    try {
      await api.put(`/customer/orders/${orderToConfirm}/confirm`);
      setSelectedId(null);
      setOrderToConfirm(null);
      fetchOrders();
    } catch {
      alert("Failed to confirm the order. Please try again.");
    }
  };

  const cancelOrderById = (orderId) => {
    setOrderToCancel(orderId);
    setCancelReason("");
  };

  const executeCancelOrder = async () => {
    if (!orderToCancel) return;

    setIsCancelling(true);
    try {
      await api.put(`/customer/orders/${orderToCancel}/cancel`, {
        reason: cancelReason,
      });
      setSelectedId(null);
      setOrderToCancel(null);
      fetchOrders();
    } catch {
      alert("Failed to cancel the order. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleOpenOrder = (order) => {
    const isBlueprintRequest =
      String(order?.order_type || "")
        .trim()
        .toLowerCase() === "blueprint";

    if (isBlueprintRequest) {
      navigate(`/custom-requests/${order.id}`);
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
    { key: "all", label: "All" },
    { key: "pending", label: "To Confirm" },
    { key: "confirmed", label: "Confirmed" },
    { key: "production", label: "In Production" },
    { key: "shipping", label: "Out for Delivery" },
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
          <h1>My Orders</h1>
          <p>Track your orders, payments, and delivery status.</p>
        </div>

        <button
          className="orders-shop-btn"
          onClick={() => navigate("/catalog")}
        >
          Continue Shopping
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
        <div className="orders-skeleton-list">
          {[1, 2, 3].map((i) => (
            <div className="orders-skeleton-card" key={i}>
              {/* Header */}
              <div className="orders-skeleton-head">
                <div className="orders-skeleton-head-left">
                  <div className="orders-skeleton-line orders-skeleton-order-number" />
                  <div className="orders-skeleton-line orders-skeleton-date" />
                </div>

                <div className="orders-skeleton-badge" />
              </div>

              {/* Product */}
              <div className="orders-skeleton-items">
                <div className="orders-skeleton-item">
                  <div className="orders-skeleton-image" />

                  <div className="orders-skeleton-product">
                    <div className="orders-skeleton-line orders-skeleton-product-name" />
                  </div>

                  <div className="orders-skeleton-qty" />

                  <div className="orders-skeleton-price" />
                </div>
              </div>

              {/* Bottom */}
              <div className="orders-skeleton-bottom">
                <div className="orders-skeleton-status">
                  <div className="orders-skeleton-line orders-skeleton-status-title" />
                  <div className="orders-skeleton-line orders-skeleton-status-desc" />
                </div>

                <div className="orders-skeleton-bottom-right">
                  <div className="orders-skeleton-total">
                    <div className="orders-skeleton-total-label" />
                    <div className="orders-skeleton-total-value" />
                  </div>

                  <div className="orders-skeleton-action" />
                </div>
              </div>
            </div>
          ))}

          <style>{`
      @keyframes ordersSkeletonShimmer {
        0% {
          opacity: 0.55;
        }
        50% {
          opacity: 1;
        }
        100% {
          opacity: 0.55;
        }
      }
    `}</style>
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

            const canPayNow =
              String(order?.status || "").toLowerCase() === "pending" &&
              String(order.payment_method || "").toLowerCase() === "paymongo" &&
              String(order.payment_status || "").toLowerCase() === "unpaid" &&
              order.payment_url;

            return (
              <div
                key={order.id}
                id={`order-card-${order.id}`}
                className="order-card wisdom-order-card-exact"
                onClick={() => handleOpenOrder(order)}
                style={
                  focusedOrderId === order.id
                    ? { boxShadow: "0 0 0 2px #111111" }
                    : undefined
                }
              >
                <div className="wisdom-order-head">
                  <div>
                    <div className="order-card-num">{order.order_number}</div>
                    <div className="order-card-date">
                      Placed on {fmtDateShort(order.created_at)}
                    </div>
                  </div>

                  <span className="order-badge order-badge-dark">
                    {sm.badge}
                  </span>
                </div>

                <div className="wisdom-order-items">
                  {Array.isArray(order.items_preview) &&
                  order.items_preview.length > 0 ? (
                    <>
                      {order.items_preview.map((item, index) => (
                        <div
                          key={`${order.id}-item-${index}`}
                          className="wisdom-order-item"
                        >
                          <div className="wisdom-order-item-image">
                            {item.blueprint_preview ||
                            (order.blueprint_id &&
                              index === 0 &&
                              order.blueprint_preview) ? (
                              <div className="wisdom-order-blueprint-live">
                                <CustomerBlueprintViewer
                                  blueprint={{
                                    ...(item.blueprint_preview ||
                                      order.blueprint_preview),
                                    thumbnail_url: null,
                                  }}
                                  readOnly
                                  showHumanControls={false}
                                  compact
                                  compactHeight={64}
                                  defaultPreset="isometric"
                                  defaultShowHuman={false}
                                />
                              </div>
                            ) : item.image_url ? (
                              <img
                                src={buildAssetUrl(item.image_url)}
                                alt={item.product_name || "Order item"}
                              />
                            ) : order.blueprint_preview?.thumbnail_url ? (
                              <img
                                src={buildAssetUrl(
                                  order.blueprint_preview.thumbnail_url,
                                )}
                                alt={
                                  order.blueprint_preview.title ||
                                  "Blueprint preview"
                                }
                              />
                            ) : order.blueprint_preview?.file_url &&
                              ["jpg", "jpeg", "png", "webp"].includes(
                                String(
                                  order.blueprint_preview.file_type || "",
                                ).toLowerCase(),
                              ) ? (
                              <img
                                src={buildAssetUrl(
                                  order.blueprint_preview.file_url,
                                )}
                                alt={
                                  order.blueprint_preview.title ||
                                  "Imported blueprint preview"
                                }
                              />
                            ) : order.blueprint_id ? (
                              <div className="wisdom-order-blueprint-placeholder">
                                <svg
                                  viewBox="0 0 48 48"
                                  aria-hidden="true"
                                  focusable="false"
                                >
                                  <rect x="8" y="5" width="32" height="38" />
                                  <path d="M14 14h20M14 20h20M14 26h9M27 26h7M14 32h20M18 10v28M31 10v28" />
                                </svg>
                                <span>Blueprint</span>
                              </div>
                            ) : (
                              <div className="wisdom-order-item-placeholder">
                                Item
                              </div>
                            )}
                          </div>

                          <div className="wisdom-order-item-copy">
                            <div className="wisdom-order-item-name">
                              {item.is_custom_blueprint
                                ? item.blueprint_title
                                  ? `Custom Blueprint – ${item.blueprint_title}`
                                  : item.product_name ||
                                    "Custom Blueprint Order"
                                : order.blueprint_id
                                  ? order.blueprint_preview?.title
                                    ? `Custom Blueprint – ${order.blueprint_preview.title}`
                                    : "Custom Blueprint Order"
                                  : item.product_name || "Order item"}
                            </div>
                          </div>

                          <div className="wisdom-order-item-qty">
                            Qty {item.quantity || 0}
                          </div>

                          <div className="wisdom-order-item-price">
                            {fmt(
                              Number(item.unit_price || 0) *
                                Number(item.quantity || 0),
                            )}
                          </div>
                        </div>
                      ))}

                      {Number(order.item_count || 0) >
                        order.items_preview.length && (
                        <div className="wisdom-order-more">
                          +
                          {Number(order.item_count || 0) -
                            order.items_preview.length}{" "}
                          more item
                          {Number(order.item_count || 0) -
                            order.items_preview.length !==
                          1
                            ? "s"
                            : ""}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="wisdom-order-items-fallback">
                      {order.total_qty || 0} item
                      {(order.total_qty || 0) !== 1 ? "s" : ""} in this order
                    </div>
                  )}
                </div>

                <div className="wisdom-order-bottom">
                  <div className="wisdom-order-status">
                    <div className="wisdom-order-status-title">{sm.title}</div>
                    <div className="wisdom-order-status-desc">{sm.desc}</div>
                  </div>

                  <div className="wisdom-order-bottom-right">
                    <div className="wisdom-order-total">
                      <span>Total</span>
                      <strong>{fmt(order.total)}</strong>
                    </div>

                    <div className="wisdom-order-actions">
                      {canPayNow && (
                        <button
                          className="order-inline-btn order-inline-btn-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.assign(order.payment_url);
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
                          Cancel Order
                        </button>
                      )}

                      {canCustomerConfirm && (
                        <button
                          className="order-inline-btn order-inline-btn-outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmOrderById(order.id);
                          }}
                        >
                          Confirm Received
                        </button>
                      )}

                      <button
                        className="order-inline-btn order-inline-btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenOrder(order);
                        }}
                      >
                        View Details
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
        />
      )}

      {/* WISDOM CUSTOM CONFIRM RECEIVED MODAL */}
      {orderToConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10050,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(15, 23, 42, 0.35)",
            pointerEvents: "auto",
          }}
          onClick={() => setOrderToConfirm(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "390px",
              background: "#ffffff",
              border: "1px solid #d9d9dc",
              borderRadius: 6,
              boxShadow: "0 18px 46px rgba(0,0,0,0.18)",
              padding: "24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                margin: 0,
                color: "#111111",
                fontSize: "22px",
                fontWeight: 750,
                lineHeight: 1.2,
                letterSpacing: "-0.015em",
              }}
            >
              Confirm Received
            </h3>

            <p
              style={{
                margin: "8px 0 0",
                color: "#66666b",
                fontSize: "14px",
                fontWeight: 400,
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to confirm that you have received this
              order?
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
                marginTop: "22px",
              }}
            >
              <button
                type="button"
                onClick={() => setOrderToConfirm(null)}
                style={{
                  minWidth: "96px",
                  height: "40px",
                  padding: "0 14px",
                  border: "1px solid #bfc0c4",
                  borderRadius: 6,
                  background: "#ffffff",
                  color: "#111111",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 650,
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={executeConfirmOrder}
                style={{
                  minWidth: "96px",
                  height: "40px",
                  padding: "0 14px",
                  border: "1px solid #111111",
                  borderRadius: 6,
                  background: "#111111",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 650,
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WISDOM CUSTOM CANCEL ORDER MODAL */}
      {orderToCancel && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10050,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(15, 23, 42, 0.35)",
            pointerEvents: "auto",
          }}
          onClick={() => !isCancelling && setOrderToCancel(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "#ffffff",
              border: "1px solid #d9d9dc",
              borderRadius: 6,
              boxShadow: "0 18px 46px rgba(0,0,0,0.18)",
              padding: "24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                margin: 0,
                color: "#111111",
                fontSize: "22px",
                fontWeight: 750,
                lineHeight: 1.2,
                letterSpacing: "-0.015em",
              }}
            >
              Cancel Order
            </h3>

            <p
              style={{
                margin: "8px 0 16px",
                color: "#66666b",
                fontSize: "14px",
                fontWeight: 400,
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to cancel this order? You may optionally
              provide a reason below.
            </p>

            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)"
              style={{
                width: "100%",
                height: "90px",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "none",
                overflowY: "auto",
                boxSizing: "border-box",
                outline: "none",
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
                marginTop: "22px",
              }}
            >
              <button
                type="button"
                onClick={() => setOrderToCancel(null)}
                disabled={isCancelling}
                style={{
                  minWidth: "96px",
                  height: "40px",
                  padding: "0 14px",
                  border: "1px solid #bfc0c4",
                  borderRadius: 6,
                  background: "#ffffff",
                  color: "#111111",
                  cursor: isCancelling ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 650,
                  opacity: isCancelling ? 0.6 : 1,
                }}
              >
                Close
              </button>

              <button
                type="button"
                onClick={executeCancelOrder}
                disabled={isCancelling}
                style={{
                  minWidth: "96px",
                  height: "40px",
                  padding: "0 14px",
                  border: "1px solid #111111",
                  borderRadius: 6,
                  background: "#111111",
                  color: "#ffffff",
                  cursor: isCancelling ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 650,
                  opacity: isCancelling ? 0.6 : 1,
                }}
              >
                {isCancelling ? "Cancelling..." : "Cancel Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
