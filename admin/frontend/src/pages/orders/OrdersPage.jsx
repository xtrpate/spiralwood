import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";
import { Package2, Search } from "lucide-react";
import CustomerBlueprintViewer from "../customer/CustomerBlueprintViewer";
import "./OrdersPage.css";

const getStatusColor = (status) => {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (["delivered", "completed"].includes(s)) return "green";
  if (["pending"].includes(s)) return "yellow";
  if (["cancelled"].includes(s)) return "red";
  if (["confirmed", "contract_released", "production", "shipping"].includes(s))
    return "blue";
  return "gray";
};

const getPaymentColor = (status) => {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (["paid"].includes(s)) return "green";
  if (["unpaid", "rejected"].includes(s)) return "red";
  if (["pending", "partial"].includes(s)) return "yellow";
  return "gray";
};

const STATUS_STYLE = {
  pending: {
    bg: "#FAFAFA",
    color: "#52525B",
    border: "#D4D4D8",
    label: "Pending",
  },

  confirmed: {
    bg: "#EFF6FF",
    color: "#1D4ED8",
    border: "#BFDBFE",
    label: "Confirmed",
  },

  contract_released: {
    bg: "#EEF2FF",
    color: "#4338CA",
    border: "#C7D2FE",
    label: "Contract Released",
  },

  production: {
    bg: "#FEF3C7",
    color: "#B45309",
    border: "#FCD34D",
    label: "Production",
  },

  shipping: {
    bg: "#ECFEFF",
    color: "#0F766E",
    border: "#A5F3FC",
    label: "Shipping",
  },

  delivered: {
    bg: "#F3F4F6",
    color: "#374151",
    border: "#D1D5DB",
    label: "Delivered",
  },

  completed: {
    bg: "#ECFDF5",
    color: "#15803D",
    border: "#BBF7D0",
    label: "Completed",
  },

  cancelled: {
    bg: "#FEF2F2",
    color: "#B91C1C",
    border: "#FECACA",
    label: "Cancelled",
  },
};

const STATUS_ORDER = [
  "pending",
  "confirmed",
  "contract_released",
  "production",
  "shipping",
  "delivered",
  "completed",
  "cancelled",
];

const PAYMENT_STYLE = {
  unpaid: {
    bg: "#fef2f2",
    color: "#991b1b",
    border: "#fecaca",
    label: "Unpaid",
  },
  paid: { bg: "#18181b", color: "#ffffff", border: "#18181b", label: "Paid" },
  partial: {
    bg: "#ffffff",
    color: "#52525b",
    border: "#d4d4d8",
    label: "Partial",
  },
  pending: {
    bg: "#ffffff",
    color: "#52525b",
    border: "#d4d4d8",
    label: "Pending",
  },
  rejected: {
    bg: "#fef2f2",
    color: "#dc2626",
    border: "#fecaca",
    label: "Rejected",
  },
};

const normalize = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
};

const safeParseOrderJson = (value, fallback = {}) => {
  try {
    if (!value) return fallback;
    if (typeof value === "object" && !Array.isArray(value)) return value;
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
};

const formatMoney = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getChannelMeta = (value) => {
  const key = normalize(value);
  return key === "online"
    ? { label: "Online", bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" }
    : { label: "Walk-in", bg: "#ffffff", color: "#52525b", border: "#d4d4d8" };
};

const isBlueprintOrder = (order) =>
  normalize(order?.order_type) === "blueprint";

const needsCustomRequestReview = (order) =>
  isBlueprintOrder(order) && normalize(order?.status) === "pending";

const getInitials = (name) => {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[words.length - 1][0] || ""}`.toUpperCase();
};

const OrderThumbnail = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  const resolved = buildAssetUrl(src);

  if (!resolved || failed) {
    return (
      <div className="orders-product-thumb orders-product-thumb-empty" aria-hidden="true">
        <Package2 size={18} strokeWidth={1.65} />
      </div>
    );
  }

  return (
    <img
      className="orders-product-thumb"
      src={resolved}
      alt={alt || "Order item"}
      onError={() => setFailed(true)}
    />
  );
};

// WISDOM PENDING ORDER DRAFT CACHE V1.0.6
const ORDER_DRAFT_PREVIEW_CACHE_PREFIX =
  "wisdom:pending-order-draft-preview:v1:";

const readOrderDraftPreviewCache = (orderId) => {
  if (!orderId || typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(
      `${ORDER_DRAFT_PREVIEW_CACHE_PREFIX}${orderId}`,
    );
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeOrderDraftPreviewCache = (orderId, preview) => {
  if (!orderId || !preview || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      `${ORDER_DRAFT_PREVIEW_CACHE_PREFIX}${orderId}`,
      JSON.stringify(preview),
    );
  } catch {
    // Non-critical display cache only.
  }
};

const buildOrderDraftPreview = (data, orderId, title) => {
  const customItems = Array.isArray(data?.custom_request_items)
    ? data.custom_request_items
    : Array.isArray(data?.items)
      ? data.items
      : [];

  const sourceItem = customItems.find(
    (item) =>
      item?.editor_snapshot &&
      Array.isArray(item.editor_snapshot.components) &&
      item.editor_snapshot.components.length > 0,
  );

  if (!sourceItem) return null;

  const editorSnapshot = sourceItem.editor_snapshot;
  const components = editorSnapshot.components;

  return {
    id: `order-draft-${orderId}`,
    title:
      sourceItem?.requested_base_blueprint_title ||
      sourceItem?.display_name ||
      sourceItem?.product_name ||
      title ||
      "Custom Furniture",
    thumbnail_url: null,
    components,
    design_data: {
      components,
      worldSize: editorSnapshot?.worldSize || null,
    },
    view_3d_data: {
      components,
      worldSize: editorSnapshot?.worldSize || null,
    },
  };
};

const OrderBlueprintPreview = ({
  blueprint,
  title,
  orderId = null,
  loadOrderDraft = false,
}) => {
  const [resolvedBlueprint, setResolvedBlueprint] = useState(
    () =>
      blueprint ||
      (loadOrderDraft
        ? readOrderDraftPreviewCache(orderId)
        : null),
  );

  useEffect(() => {
    setResolvedBlueprint(
      blueprint ||
        (loadOrderDraft
          ? readOrderDraftPreviewCache(orderId)
          : null),
    );
  }, [blueprint, loadOrderDraft, orderId]);

  useEffect(() => {
    if (!loadOrderDraft || !orderId || blueprint) return undefined;

    let active = true;

    api
      .get(`/orders/${orderId}`)
      .then(({ data }) => {
        if (!active) return;

        const draftPreview = buildOrderDraftPreview(data, orderId, title);
        if (draftPreview) {
          setResolvedBlueprint(draftPreview);
          writeOrderDraftPreviewCache(orderId, draftPreview);
        }
      })
      .catch(() => {
        // Keep a clean blank preview when no live furniture scene exists.
      });

    return () => {
      active = false;
    };
  }, [blueprint, loadOrderDraft, orderId, title]);

  return (
    <div
      className="orders-blueprint-preview"
      aria-label={title || "Furniture preview"}
    >
      {resolvedBlueprint ? (
        <CustomerBlueprintViewer
          blueprint={resolvedBlueprint}
          readOnly
          showHumanControls={false}
          compact
          compactHeight={58}
          defaultPreset="isometric"
          defaultShowHuman={false}
        />
      ) : null}
    </div>
  );
};

const CustomerAvatar = ({ src, name }) => {
  const [failed, setFailed] = useState(false);
  const resolved = buildAssetUrl(src);

  if (!resolved || failed) {
    return (
      <div className="orders-customer-avatar orders-customer-avatar-fallback" aria-hidden="true">
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      className="orders-customer-avatar"
      src={resolved}
      alt={`${name || "Customer"} profile`}
      onError={() => setFailed(true)}
    />
  );
};

export default function OrdersPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    channel: "",
    orderType: "",
    from: "",
    to: "",
    page: 1,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/orders", {
        params: { ...filters, limit: 20 },
      });

      setOrders(Array.isArray(data?.orders) ? data.orders : []);
      setTotal(Number(data?.total || 0));
      setSummary(data?.summary || null);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setF = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));

  const resetFilters = () =>
    setFilters({
      search: "",
      status: "",
      channel: "",
      orderType: "",
      from: "",
      to: "",
      page: 1,
    });

  const activeFilterCount = [
    "search",
    "status",
    "channel",
    "orderType",
    "from",
    "to",
  ].filter((key) => Boolean(filters[key])).length;

  const stats = useMemo(
    () => [
      {
        label: "Total Orders",
        value: Number(summary?.total_orders ?? total),
      },
      {
        label: "Needs Review",
        value: Number(summary?.needs_review || 0),
      },
      {
        label: "Custom Requests",
        value: Number(summary?.custom_requests || 0),
      },
      {
        label: "Quotation Required",
        value: Number(summary?.quote_needed || 0),
      },
      {
        label: "Paid Orders",
        value: Number(summary?.paid_orders || 0),
      },
      {
        label: "Online Orders",
        value: Number(summary?.online_orders || 0),
      },
      {
        label: "Pending Orders",
        value: Number(summary?.pending_orders || 0),
      },
      {
        label: "Completed Orders",
        value: Number(summary?.completed_orders || 0),
      },
    ],
    [summary, total],
  );

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div style={pageShell} className="orders-admin-v2">
      <div style={headerBlock} className="orders-header">
        <div>
          <h1 style={pageTitle}>Orders</h1>
          <p style={pageSubtitle}>
            Manage customer orders, payments, and fulfillment in one place.
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          style={{
            ...summaryPill,
            opacity: loading ? 0.7 : 1,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="orders-summary-grid">
        {stats.map((item) => (
          <div key={item.label} className="orders-summary-card">
            <div className="orders-summary-label">{item.label}</div>
            <div className="orders-summary-value">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="orders-toolbar no-print">
        <div className="orders-toolbar-row">
          <label className="orders-filter-field orders-filter-search">
            <span className="orders-filter-label">Search Orders</span>
            <div className="orders-search-control">
              <span className="orders-search-icon" aria-hidden="true"><Search size={16} strokeWidth={1.8} /></span>
              <input
                placeholder="Search by order ID, customer, phone, or email"
                value={filters.search}
                onChange={(e) => setF("search", e.target.value)}
              />
            </div>
          </label>

          <label className="orders-filter-field">
            <span className="orders-filter-label">Status</span>
            <select value={filters.status} onChange={(e) => setF("status", e.target.value)}>
              <option value="">All Statuses</option>
              {STATUS_ORDER.map((statusKey) => (
                <option key={statusKey} value={statusKey}>
                  {STATUS_STYLE[statusKey]?.label || statusKey}
                </option>
              ))}
            </select>
          </label>

          <label className="orders-filter-field">
            <span className="orders-filter-label">Channel</span>
            <select value={filters.channel} onChange={(e) => setF("channel", e.target.value)}>
              <option value="">All Channels</option>
              <option value="online">Online</option>
              <option value="walkin">Walk-in</option>
            </select>
          </label>

          <label className="orders-filter-field">
            <span className="orders-filter-label">Type</span>
            <select value={filters.orderType} onChange={(e) => setF("orderType", e.target.value)}>
              <option value="">All Types</option>
              <option value="standard">Standard</option>
              <option value="blueprint">Blueprint</option>
            </select>
          </label>

          <label className="orders-filter-field orders-filter-date">
            <span className="orders-filter-label">From</span>
            <input type="date" value={filters.from} onChange={(e) => setF("from", e.target.value)} />
          </label>

          <label className="orders-filter-field orders-filter-date">
            <span className="orders-filter-label">To</span>
            <input type="date" value={filters.to} onChange={(e) => setF("to", e.target.value)} />
          </label>

          {activeFilterCount > 0 && (
            <button type="button" onClick={resetFilters} className="orders-filter-reset">
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="orders-table-card">
        <div className="orders-section-head">
          <div>
            <h2>All Orders</h2>
            <p>Review order details, payment status, and required actions.</p>
          </div>
          <div className="orders-result-count">{total.toLocaleString()} orders</div>
        </div>

        <div className="orders-table-scroll">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Customer</th>
                <th>Order ID</th>
                <th className="orders-align-right">Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="orders-empty-cell">Loading orders...</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="orders-empty-cell">
                    <div className="orders-empty-state">
                      <div className="orders-empty-title">No orders found</div>
                      <div className="orders-empty-text">
                        Try changing the search or filters to find another order.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const normalizedStatus = normalize(order.status);
                  const statusTone =
                    STATUS_STYLE[normalizedStatus] || STATUS_STYLE.pending;
                  const paymentTone =
                    PAYMENT_STYLE[
                      normalize(order.payment_status_display || order.payment_status)
                    ] || { label: "Unknown" };
                  const channelMeta = getChannelMeta(order.channel || order.type);
                  const customRequest = isBlueprintOrder(order);
                  const quoteNeeded = needsCustomRequestReview(order);
                  const actionLabel =
                    quoteNeeded || normalizedStatus === "pending" ? "Review" : "Details";
                  const customerName =
                    order.customer_name || order.walkin_customer_name || "Walk-in customer";
                  const customerContact =
                    order.customer_phone ||
                    order.walkin_customer_phone ||
                    order.customer_email ||
                    "No contact details";
                  const itemName =
                    order.item_name ||
                    (customRequest ? "Custom Furniture" : "Order item");
                  const itemCount = Number(order.item_count || 0);
                  const draftCustomization = customRequest
                    ? safeParseOrderJson(
                        order.blueprint_item_customization_json,
                        {},
                      )
                    : {};
                  const draftEditorSnapshot = safeParseOrderJson(
                    draftCustomization?.editor_snapshot,
                    {},
                  );
                  const draftComponents = Array.isArray(
                    draftEditorSnapshot?.components,
                  )
                    ? draftEditorSnapshot.components
                    : [];

                  const linkedBlueprintPreview = order.blueprint_id
                    ? {
                        id: order.blueprint_id,
                        title: order.blueprint_title || itemName,
                        thumbnail_url: null,
                        design_data: order.blueprint_design_data || null,
                        view_3d_data: order.blueprint_view_3d_data || null,
                        components: Array.isArray(order.blueprint_components)
                          ? order.blueprint_components
                          : [],
                      }
                    : null;

                  const draftBlueprintPreview =
                    customRequest && draftComponents.length > 0
                      ? {
                          id: `order-draft-${order.id}`,
                          title:
                            draftCustomization?.base_blueprint_title ||
                            itemName ||
                            "Custom Furniture",
                          thumbnail_url: null,
                          components: draftComponents,
                          design_data: {
                            components: draftComponents,
                            worldSize: draftEditorSnapshot?.worldSize || null,
                          },
                          view_3d_data: {
                            components: draftComponents,
                            worldSize: draftEditorSnapshot?.worldSize || null,
                          },
                        }
                      : null;

                  const blueprintPreview =
                    linkedBlueprintPreview || draftBlueprintPreview;

                  return (
                    <tr
                      key={order.id}
                      className="orders-body-row"
                      onClick={() => navigate(`/admin/orders/${order.id}`)}
                    >
                      <td>
                        <div className="orders-product-cell">
                          {customRequest ? (
                            <OrderBlueprintPreview
                              blueprint={blueprintPreview || null}
                              title={itemName}
                              orderId={order.id}
                              loadOrderDraft={!blueprintPreview}
                            />
                          ) : (
                            <OrderThumbnail
                              src={order.thumbnail_url}
                              alt={itemName}
                            />
                          )}
                          <div className="orders-product-copy">
                            <div className="orders-product-name">{itemName}</div>
                            {itemCount > 0 && (
                              <div className="orders-product-meta">
                                {itemCount} {itemCount === 1 ? "item" : "items"}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="orders-customer-cell">
                          <CustomerAvatar
                            src={order.customer_profile_photo}
                            name={customerName}
                          />
                          <div className="orders-customer-copy">
                            <div className="orders-customer-name">{customerName}</div>
                            <div className="orders-customer-contact">{customerContact}</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="orders-order-number">
                          {order.order_number || `#${String(order.id).padStart(5, "0")}`}
                        </div>
                        <div className="orders-order-meta">
                          {formatDate(order.created_at)} · {channelMeta.label} · {customRequest ? "Blueprint" : "Standard"}
                        </div>
                      </td>

                      <td className="orders-align-right">
                        <div className="orders-amount">{formatMoney(order.total_amount)}</div>
                      </td>

                      <td>
                        <span
                          className={`orders-status orders-status-${getPaymentColor(
                            order.payment_status_display || order.payment_status,
                          )}`}
                        >
                          {paymentTone.label || "Unknown"}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`orders-status orders-status-${getStatusColor(order.status)}`}
                        >
                          {quoteNeeded ? "Pending Review" : statusTone.label}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={`orders-action-button ${
                            quoteNeeded || normalizedStatus === "pending"
                              ? "orders-action-primary"
                              : "orders-action-secondary"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/admin/orders/${order.id}`);
                          }}
                        >
                          {actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {total > 20 && (
          <div className="orders-pagination">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: prev.page - 1 }))
              }
            >
              Previous
            </button>

            <div className="orders-page-position">
              Page <strong>{filters.page}</strong> of {totalPages}
            </div>

            <button
              type="button"
              disabled={filters.page >= totalPages}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: prev.page + 1 }))
              }
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const pageShell = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const headerBlock = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  flexWrap: "wrap",
};

const eyebrow = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "#71717a",
  marginBottom: 8,
};

const pageTitle = {
  margin: 0,
  fontSize: 24,
  lineHeight: 1.1,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};

const pageSubtitle = {
  margin: "8px 0 0",
  color: "#52525b",
  fontSize: 13,
  lineHeight: 1.55,
  maxWidth: 620,
};

const summaryPill = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 700,
  color: "#18181b",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  cursor: "pointer",
  transition: "all 0.2s",
  outline: "none",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
};

const statCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 14,
  padding: "18px 20px",
  minHeight: 94,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
};

const statLabel = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "#71717a",
};

const statValue = {
  fontSize: 34,
  fontWeight: 800,
  color: "#111827",
  lineHeight: 1,
  marginTop: 12,
};

const filterCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const filterTopRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 16,
};

const inputBase = {
  height: 38,
  padding: "0 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  background: "#ffffff",
  color: "#18181b",
  fontSize: 13,
  fontWeight: 500,
  outline: "none",
};

const searchInput = {
  flex: "1 1 420px",
  minWidth: 280,
};

const statusRow = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const statusChip = {
  padding: "6px 14px",
  borderRadius: 999,
  border: "1px solid transparent",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  transition: "all 0.15s ease",
};

const filtersMeta = {
  marginLeft: "auto",
  fontSize: 12,
  color: "#71717a",
  fontWeight: 500,
};

const tableCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const tableHeader = {
  padding: "20px 20px 14px",
  borderBottom: "1px solid #e4e4e7",
};

const tableTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.01em",
};

const tableSubtitle = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#52525b",
  lineHeight: 1.5,
};

const tableWrap = {
  width: "100%",
  overflowX: "auto",
};

const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 920,
};

const theadRow = {
  background: "#fafafa",
};

const th = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  borderBottom: "1px solid #e4e4e7",
};

const tbodyRow = {
  background: "#ffffff",
};

const td = {
  padding: "16px 16px",
  color: "#18181b",
  fontSize: 13,
  borderBottom: "1px solid #f4f4f5",
  verticalAlign: "middle",
};

const orderLink = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#111827",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  letterSpacing: "-0.01em",
};
const primaryText = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0a0a0a",
  lineHeight: 1.4,
};

const secondaryText = {
  marginTop: 6,
  fontSize: 11,
  color: "#6B7280",
  lineHeight: 1.5,
  fontWeight: 500,
};

const softBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#f4f4f5",
  color: "#52525b",
  border: "1px solid #e4e4e7",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const btnPrimary = {
  height: 36,
  padding: "0 16px",
  borderRadius: 8,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const btnView = {
  height: 36,
  padding: "0 16px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#f4f4f5",
  color: "#18181b",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const btnGhost = {
  height: 38,
  padding: "0 16px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#f4f4f5",
  color: "#18181b",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.2s",
};

const emptyCell = {
  padding: 32,
  textAlign: "center",
  color: "#71717a",
  fontSize: 13,
};

const emptyState = {
  display: "inline-flex",
  flexDirection: "column",
  gap: 6,
  maxWidth: 420,
};

const emptyStateTitle = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0a0a0a",
};

const emptyStateText = {
  fontSize: 13,
  lineHeight: 1.55,
  color: "#52525b",
};

const paginationBar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 12,
  padding: "16px 20px",
  background: "#fafafa",
};

const paginationText = {
  fontSize: 13,
  fontWeight: 600,
  color: "#71717a",
};
