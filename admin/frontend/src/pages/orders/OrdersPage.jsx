import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";

const STATUS_STYLE = {
  pending: { bg: "#fef3c7", color: "#a16207", label: "Pending" },
  confirmed: { bg: "#dbeafe", color: "#1d4ed8", label: "Confirmed" },
  contract_released: {
    bg: "#ede9fe",
    color: "#6d28d9",
    label: "Contract released",
  },
  production: { bg: "#f3e8ff", color: "#7e22ce", label: "Production" },
  shipping: { bg: "#e0f2fe", color: "#0369a1", label: "Shipping" },
  delivered: { bg: "#dcfce7", color: "#15803d", label: "Delivered" },
  completed: { bg: "#dcfce7", color: "#166534", label: "Completed" },
  cancelled: { bg: "#fee2e2", color: "#dc2626", label: "Cancelled" },
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
  unpaid: { bg: "#fef2f2", color: "#dc2626", label: "Unpaid" },
  paid: { bg: "#ecfdf5", color: "#15803d", label: "Paid" },
  partial: { bg: "#fef3c7", color: "#b45309", label: "Partial" },
  pending: { bg: "#fef3c7", color: "#a16207", label: "Pending" },
  rejected: { bg: "#fee2e2", color: "#dc2626", label: "Rejected" },
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
    ? { label: "Online", bg: "#eff6ff", color: "#2563eb" }
    : { label: "Walk-in", bg: "#ecfdf5", color: "#15803d" };
};

const isBlueprintOrder = (order) => normalize(order?.order_type) === "blueprint";

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

    const quoteNeeded = orders.filter((row) => needsCustomRequestReview(row)).length;

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
              background: filters.status ? "#f8fafc" : "#0f172a",
              color: filters.status ? "#475569" : "#ffffff",
              borderColor: filters.status ? "#e2e8f0" : "#0f172a",
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
                  background: isActive ? tone.color : tone.bg,
                  color: isActive ? "#ffffff" : tone.color,
                  borderColor: isActive ? tone.color : "transparent",
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
                  ] || { bg: "#f8fafc", color: "#475569", label: "Unknown" };

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
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={softBadge}>
                            {customRequest ? "Blueprint" : "Standard"}
                          </span>

                          {quoteNeeded ? (
                            <span
                              style={{
                                ...softBadge,
                                background: "#fff7ed",
                                color: "#c2410c",
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
                          }}
                        >
                          {channelMeta.label}
                        </span>
                      </td>

                      <td style={{ ...td, fontWeight: 700, color: "#0f172a" }}>
                        {formatMoney(order.total_amount)}
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...softBadge,
                            background: paymentTone.bg,
                            color: paymentTone.color,
                          }}
                        >
                          {paymentTone.label || "Unknown"}
                        </span>
                      </td>

                      <td style={td}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span
                            style={{
                              ...softBadge,
                              background: statusTone.bg,
                              color: statusTone.color,
                            }}
                          >
                            {quoteNeeded ? "Pending Review" : statusTone.label}
                          </span>
                        </div>
                      </td>

                      <td
                        style={{
                          ...td,
                          color: "#64748b",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(order.created_at)}
                      </td>

                      <td style={td}>
                        <button
                          onClick={() => navigate(`/admin/orders/${order.id}`)}
                          style={quoteNeeded || normalizedStatus === "pending" ? btnPrimary : btnView}
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

const pageShell = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 12,
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
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
};

const pageTitle = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 700,
  color: "#0f172a",
};

const pageSubtitle = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.55,
  maxWidth: 620,
};

const summaryPill = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 600,
  color: "#0f172a",
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: "12px 14px",
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.028)",
};

const statLabel = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#94a3b8",
  marginBottom: 8,
};

const statValue = {
  fontSize: 20,
  fontWeight: 700,
  color: "#0f172a",
  lineHeight: 1,
};

const filterCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 12,
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.028)",
};

const filterTopRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 12,
};

const inputBase = {
  height: 38,
  padding: "0 14px",
  border: "1px solid #cfd9e5",
  borderRadius: 14,
  background: "#ffffff",
  color: "#0f172a",
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
  fontSize: 12,
  fontWeight: 600,
};

const filtersMeta = {
  marginLeft: "auto",
  fontSize: 12,
  color: "#94a3b8",
};

const tableCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.03)",
};

const tableHeader = {
  padding: "14px 16px 10px",
  borderBottom: "1px solid #eef2f7",
};

const tableTitle = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "#0f172a",
};

const tableSubtitle = {
  margin: "4px 0 0",
  fontSize: 12,
  color: "#64748b",
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
  background: "#f8fafc",
};

const th = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 10,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderBottom: "1px solid #edf2f7",
};

const tbodyRow = {
  background: "#ffffff",
};

const td = {
  padding: "12px 14px",
  color: "#334155",
  fontSize: 13,
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};

const orderLink = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#1d4ed8",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryText = {
  fontSize: 13,
  fontWeight: 600,
  color: "#0f172a",
  lineHeight: 1.4,
};

const secondaryText = {
  marginTop: 4,
  fontSize: 12,
  color: "#94a3b8",
  lineHeight: 1.45,
};

const softBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#f8fafc",
  color: "#475569",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const btnPrimary = {
  height: 34,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid #1d4ed8",
  background: "#1d4ed8",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnView = {
  height: 34,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid #d6e2ee",
  background: "#ffffff",
  color: "#334155",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost = {
  height: 38,
  padding: "0 14px",
  borderRadius: 14,
  border: "1px solid #d6e2ee",
  background: "#ffffff",
  color: "#334155",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const emptyCell = {
  padding: 28,
  textAlign: "center",
  color: "#64748b",
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
  fontWeight: 700,
  color: "#0f172a",
};

const emptyStateText = {
  fontSize: 13,
  lineHeight: 1.55,
  color: "#64748b",
};

const paginationBar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,
  padding: 16,
};

const paginationText = {
  fontSize: 12,
  color: "#64748b",
};