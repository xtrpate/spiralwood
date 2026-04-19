import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";

const STATUS_STYLE = {
  pending: {
    bg: "#ffffff",
    color: "#52525b",
    border: "#d4d4d8",
    label: "Pending",
  },
  confirmed: {
    bg: "#f4f4f5",
    color: "#18181b",
    border: "#e4e4e7",
    label: "Confirmed",
  },
  contract_released: {
    bg: "#f4f4f5",
    color: "#18181b",
    border: "#e4e4e7",
    label: "Contract released",
  },
  production: {
    bg: "#f4f4f5",
    color: "#18181b",
    border: "#e4e4e7",
    label: "Production",
  },
  shipping: {
    bg: "#f4f4f5",
    color: "#18181b",
    border: "#e4e4e7",
    label: "Shipping",
  },
  delivered: {
    bg: "#18181b",
    color: "#ffffff",
    border: "#18181b",
    label: "Delivered",
  },
  completed: {
    bg: "#0a0a0a",
    color: "#ffffff",
    border: "#0a0a0a",
    label: "Completed",
  },
  cancelled: {
    bg: "#fef2f2",
    color: "#991b1b",
    border: "#fecaca",
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

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

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

export default function OrdersPage() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    channel: "",
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
      from: "",
      to: "",
      page: 1,
    });

  const activeFilterCount = [
    "search",
    "status",
    "channel",
    "from",
    "to",
  ].filter((key) => Boolean(filters[key])).length;

  const stats = useMemo(() => {
    const pending = orders.filter(
      (row) => normalize(row.status) === "pending",
    ).length;

    const paid = orders.filter(
      (row) =>
        normalize(row.payment_status_display || row.payment_status) === "paid",
    ).length;

    const readyForReview = orders.filter((row) => {
      const status = normalize(row.status);
      const payment = normalize(
        row.payment_status_display || row.payment_status,
      );
      return status === "pending" || payment === "pending";
    }).length;

    const online = orders.filter(
      (row) => normalize(row.channel || row.type) === "online",
    ).length;

    const customRequests = orders.filter((row) => isBlueprintOrder(row)).length;

    const quoteNeeded = orders.filter((row) =>
      needsCustomRequestReview(row),
    ).length;

    return [
      { label: "Total orders", value: total },
      { label: "Needs review", value: readyForReview },
      { label: "Custom requests", value: customRequests },
      { label: "Quote needed", value: quoteNeeded },
      { label: "Paid orders", value: paid },
      { label: "Online orders", value: online },
      { label: "Pending status", value: pending },
    ];
  }, [orders, total]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div style={pageShell}>
      <div style={headerBlock}>
        <div>
          <div style={eyebrow}>Sales & Orders</div>
          <h1 style={pageTitle}>Order Management</h1>
          <p style={pageSubtitle}>
            Keep the list focused on review, payment checks, quotation intake,
            and the next order step.
          </p>
        </div>

        <div style={summaryPill}>{total} total orders</div>
      </div>

      <div style={statsGrid}>
        {stats.map((item) => (
          <div key={item.label} style={statCard}>
            <div style={statLabel}>{item.label}</div>
            <div style={statValue}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={filterCard}>
        <div style={filterTopRow}>
          <input
            placeholder="Search order no., customer, phone, or email..."
            value={filters.search}
            onChange={(e) => setF("search", e.target.value)}
            style={{ ...inputBase, ...searchInput }}
          />

          <select
            value={filters.channel}
            onChange={(e) => setF("channel", e.target.value)}
            style={{ ...inputBase, minWidth: 150 }}
          >
            <option value="">All channels</option>
            <option value="online">Online</option>
            <option value="walkin">Walk-in (POS)</option>
          </select>

          <input
            type="date"
            value={filters.from}
            onChange={(e) => setF("from", e.target.value)}
            style={{ ...inputBase, minWidth: 150 }}
          />

          <input
            type="date"
            value={filters.to}
            onChange={(e) => setF("to", e.target.value)}
            style={{ ...inputBase, minWidth: 150 }}
          />

          <button onClick={resetFilters} style={btnGhost}>
            Reset
          </button>
        </div>

        <div style={statusRow}>
          <button
            type="button"
            onClick={() => setF("status", "")}
            style={{
              ...statusChip,
              background: filters.status ? "#f4f4f5" : "#18181b",
              color: filters.status ? "#52525b" : "#ffffff",
              borderColor: filters.status ? "#e4e4e7" : "#18181b",
            }}
          >
            All
          </button>

          {STATUS_ORDER.map((statusKey) => {
            const tone = STATUS_STYLE[statusKey];
            if (!tone) return null;

            const isActive = filters.status === statusKey;

            return (
              <button
                key={statusKey}
                type="button"
                onClick={() => setF("status", statusKey)}
                style={{
                  ...statusChip,
                  background: isActive ? "#18181b" : tone.bg,
                  color: isActive ? "#ffffff" : tone.color,
                  borderColor: isActive ? "#18181b" : tone.border,
                }}
              >
                {tone.label}
              </button>
            );
          })}

          <div style={filtersMeta}>
            {activeFilterCount > 0
              ? `${activeFilterCount} active filter(s)`
              : "No active filters"}
          </div>
        </div>
      </div>

      <div style={tableCard}>
        <div style={tableHeader}>
          <div>
            <h2 style={tableTitle}>Orders</h2>
            <p style={tableSubtitle}>
              Use the detail page for approvals, quotation review, payment
              checks, contract, and delivery actions.
            </p>
          </div>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr style={theadRow}>
                {[
                  "Order",
                  "Customer",
                  "Type",
                  "Channel",
                  "Amount",
                  "Payment",
                  "Status",
                  "Date",
                  "Action",
                ].map((label) => (
                  <th key={label} style={th}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={emptyCell}>
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} style={emptyCell}>
                    <div style={emptyState}>
                      <div style={emptyStateTitle}>No orders found</div>
                      <div style={emptyStateText}>
                        Try clearing the filters or check if there are new
                        orders waiting in another status.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const normalizedStatus = normalize(order.status);
                  const statusTone =
                    STATUS_STYLE[normalizedStatus] || STATUS_STYLE.pending;

                  const paymentTone = PAYMENT_STYLE[
                    normalize(
                      order.payment_status_display || order.payment_status,
                    )
                  ] || {
                    bg: "#f4f4f5",
                    color: "#52525b",
                    border: "#e4e4e7",
                    label: "Unknown",
                  };

                  const channelMeta = getChannelMeta(
                    order.channel || order.type,
                  );

                  const customRequest = isBlueprintOrder(order);
                  const quoteNeeded = needsCustomRequestReview(order);
                  const actionLabel = quoteNeeded
                    ? "Review Request"
                    : normalizedStatus === "pending"
                      ? "Review"
                      : "View";

                  return (
                    <tr key={order.id} style={tbodyRow}>
                      <td style={td}>
                        <button
                          onClick={() => navigate(`/admin/orders/${order.id}`)}
                          style={orderLink}
                        >
                          {order.order_number ||
                            `#${String(order.id).padStart(5, "0")}`}
                        </button>

                        <div style={secondaryText}>
                          {customRequest
                            ? "Customer custom blueprint request"
                            : "Standard order"}
                        </div>
                      </td>

                      <td style={td}>
                        <div style={primaryText}>
                          {order.customer_name || "Unknown customer"}
                        </div>
                        <div style={secondaryText}>
                          {order.customer_phone ||
                            order.customer_email ||
                            "No contact details"}
                        </div>
                      </td>

                      <td style={td}>
                        <div
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          <span style={softBadge}>
                            {customRequest ? "Blueprint" : "Standard"}
                          </span>

                          {quoteNeeded ? (
                            <span
                              style={{
                                ...softBadge,
                                background: "#fffbeb",
                                color: "#b45309",
                                border: "1px solid #fde68a",
                              }}
                            >
                              Quote Needed
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...softBadge,
                            background: channelMeta.bg,
                            color: channelMeta.color,
                            border: `1px solid ${channelMeta.border}`,
                          }}
                        >
                          {channelMeta.label}
                        </span>
                      </td>

                      <td style={{ ...td, fontWeight: 700, color: "#0a0a0a" }}>
                        {formatMoney(order.total_amount)}
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...softBadge,
                            background: paymentTone.bg,
                            color: paymentTone.color,
                            border: `1px solid ${paymentTone.border}`,
                          }}
                        >
                          {paymentTone.label || "Unknown"}
                        </span>
                      </td>

                      <td style={td}>
                        <div
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          <span
                            style={{
                              ...softBadge,
                              background: statusTone.bg,
                              color: statusTone.color,
                              border: `1px solid ${statusTone.border}`,
                            }}
                          >
                            {quoteNeeded ? "Pending Review" : statusTone.label}
                          </span>
                        </div>
                      </td>

                      <td
                        style={{
                          ...td,
                          color: "#71717a",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(order.created_at)}
                      </td>

                      <td style={td}>
                        <button
                          onClick={() => navigate(`/admin/orders/${order.id}`)}
                          style={
                            quoteNeeded || normalizedStatus === "pending"
                              ? btnPrimary
                              : btnView
                          }
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
          <div style={paginationBar}>
            <button
              disabled={filters.page <= 1}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: prev.page - 1 }))
              }
              style={{
                ...btnGhost,
                opacity: filters.page <= 1 ? 0.55 : 1,
                cursor: filters.page <= 1 ? "not-allowed" : "pointer",
              }}
            >
              Previous
            </button>

            <span style={paginationText}>
              Page {filters.page} of {totalPages}
            </span>

            <button
              disabled={filters.page >= totalPages}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: prev.page + 1 }))
              }
              style={{
                ...btnGhost,
                opacity: filters.page >= totalPages ? 0.55 : 1,
                cursor: filters.page >= totalPages ? "not-allowed" : "pointer",
              }}
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
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "16px 18px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const statLabel = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "#71717a",
  marginBottom: 8,
};

const statValue = {
  fontSize: 22,
  fontWeight: 800,
  color: "#0a0a0a",
  lineHeight: 1,
  letterSpacing: "-0.02em",
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
  color: "#18181b",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "underline",
};

const primaryText = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0a0a0a",
  lineHeight: 1.4,
};

const secondaryText = {
  marginTop: 4,
  fontSize: 11,
  color: "#71717a",
  lineHeight: 1.45,
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
