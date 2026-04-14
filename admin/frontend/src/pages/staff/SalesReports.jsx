import { useState, useEffect, useCallback } from "react";
import api from "../../services/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Printer } from "lucide-react";

const PIE_COLORS = [
  "#8B4513",
  "#D2691E",
  "#1a1a2e",
  "#16213e",
  "#4a90d9",
  "#2e7d32",
];

const formatPeriodLabel = (value, periodType = "daily") => {
  if (!value) return "—";

  if (periodType === "weekly") {
    const text = String(value);

    if (/^\d{6}$/.test(text)) {
      const year = text.slice(0, 4);
      const week = text.slice(4);
      return `${year} - Week ${week}`;
    }
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    if (periodType === "daily") {
      return date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }

    if (periodType === "weekly") {
      return `Week of ${date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}`;
    }

    if (periodType === "monthly") {
      return date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
      });
    }
  }

  return String(value);
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function SalesReports() {
  const [data, setData] = useState(null);
  // 👉 NEW: Added 'source' to the default filters state
  const [filters, setFilters] = useState({
    source: "all",
    period: "daily",
    from: "",
    to: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams(filters).toString();
      const res = await api.get(`/pos/reports?${params}`);
      setData(res.data);
    } catch (err) {
      setData(null);
      setError(
        err.response?.data?.message || "Failed to load POS sales report."
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const money = (value) =>
    `₱${Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const humanize = (value) =>
    value
      ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "—";

  const badgeClass = (status) => {
    const map = {
      confirmed: "badge-blue",
      shipping: "badge-yellow",
      delivered: "badge-green",
      scheduled: "badge-blue",
      in_transit: "badge-yellow",
      failed: "badge-red",
      pending: "badge-yellow",
      done: "badge-green",
      cancelled: "badge-red",
      cash: "badge-green",
      gcash: "badge-blue",
      bank_transfer: "badge-brown",
      cod: "badge-yellow",
      cop: "badge-blue",
    };
    return map[status] || "badge-gray";
  };

  const summaryData = (data?.summary || []).map((item) => ({
    ...item,
    formatted_period: formatPeriodLabel(
      item.period_label || item.period,
      filters.period,
    ),
  }));

  return (
    <div>
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1>POS Sales Reports</h1>
          {/* 👉 NEW: Updated subtitle text */}
          <p>View and filter your complete transaction history</p>
        </div>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          <Printer size={16} /> Print Report
        </button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          {/* 👉 NEW: The Order Source Dropdown */}
          <div className="form-field" style={{ minWidth: 150 }}>
            <label>Order Source</label>
            <select
              value={filters.source}
              onChange={(e) =>
                setFilters({ ...filters, source: e.target.value })
              }
            >
              <option value="all">All Sources</option>
              <option value="online">Online (Website)</option>
              <option value="walk_in">Walk-in (POS)</option>
            </select>
          </div>

          <div className="form-field" style={{ minWidth: 150 }}>
            <label>Period</label>
            <select
              value={filters.period}
              onChange={(e) =>
                setFilters({ ...filters, period: e.target.value })
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div className="form-field">
            <label>From Date</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>

          <div className="form-field">
            <label>To Date</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={fetchReport}
            disabled={loading}
          >
            {loading ? "Loading..." : "Generate Report"}
          </button>
        </div>
      </div>

      {loading && (
        <div
          className="card"
          style={{ textAlign: "center", padding: 30, color: "#888" }}
        >
          Loading report...
        </div>
      )}

      {!loading && error && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            padding: 16,
            color: "#b42318",
            background: "#fff1f0",
            border: "1px solid #fecdca",
          }}
        >
          {error}
        </div>
      )}

      {!loading && data && (
        <>
          <div className="stat-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-icon brown" style={{ fontSize: 20 }}>
                🧾
              </div>
              <div>
                <div className="stat-value">{data.totals.total_orders}</div>
                <div className="stat-label">Total Orders</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green" style={{ fontSize: 20 }}>
                💰
              </div>
              <div>
                <div className="stat-value">
                  {money(data.totals.grand_total)}
                </div>
                <div className="stat-label">Grand Total</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon red" style={{ fontSize: 20 }}>
                🏷️
              </div>
              <div>
                <div className="stat-value">
                  {money(data.totals.total_discount)}
                </div>
                <div className="stat-label">Total Discounts</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon blue" style={{ fontSize: 20 }}>
                📈
              </div>
              <div>
                <div className="stat-value">
                  {money(data.totals.estimated_profit)}
                </div>
                <div className="stat-label">Estimated Profit</div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: 20,
              marginBottom: 20,
            }}
          >
            <div className="card">
              <h3 style={{ marginBottom: 16, fontWeight: 700, fontSize: 15 }}>
                Sales by Period
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={summaryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="formatted_period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [money(v), "Sales"]} />
                  <Bar
                    dataKey="total_sales"
                    fill="#8B4513"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 16, fontWeight: 700, fontSize: 15 }}>
                Payment Methods
              </h3>
              {data.payment_breakdown.length === 0 ? (
                <p style={{ color: "#aaa", fontSize: 13 }}>No data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.payment_breakdown}
                      dataKey="count"
                      nameKey="payment_method"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      label={({ payment_method }) => payment_method}
                    >
                      {data.payment_breakdown.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, item) => [
                        `${value} transactions`,
                        humanize(item?.payload?.payment_method),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
              marginBottom: 20,
            }}
          >
            <div className="card">
              <h3 style={{ marginBottom: 14, fontWeight: 700, fontSize: 15 }}>
                Top Products
              </h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_products.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          textAlign: "center",
                          color: "#aaa",
                          padding: 24,
                        }}
                      >
                        No product data found.
                      </td>
                    </tr>
                  ) : (
                    data.top_products.map((p, i) => (
                      <tr key={i}>
                        <td style={{ color: "#aaa", fontWeight: 700 }}>
                          {i + 1}
                        </td>
                        <td>{p.product_name}</td>
                        <td>{p.qty}</td>
                        <td>{money(p.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 14, fontWeight: 700, fontSize: 15 }}>
                Period Summary
              </h3>
              <div style={{ maxHeight: 250, overflowY: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Orders</th>
                      <th>Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.summary.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          style={{
                            textAlign: "center",
                            color: "#aaa",
                            padding: 24,
                          }}
                        >
                          No summary data found.
                        </td>
                      </tr>
                    ) : (
                      summaryData.map((s, i) => (
                        <tr key={i}>
                          <td>{s.formatted_period}</td>
                          <td>{s.order_count}</td>
                          <td>{money(s.total_sales)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 14, fontWeight: 700, fontSize: 15 }}>
              Transaction History
            </h3>

            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order #</th>
                    <th>Receipt #</th>
                    <th>Customer</th>
                    <th>Payment</th>
                    <th>Subtotal</th>
                    <th>Discount</th>
                    <th>Total</th>
                    <th>Cash Received</th>
                    <th>Change</th>
                    <th>Profit</th>
                    <th>Delivery</th>
                    <th>Appointment</th>
                    <th>Cashier</th>
                  </tr>
                </thead>
                <tbody>
                  {!data.transactions || data.transactions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={14}
                        style={{
                          textAlign: "center",
                          color: "#aaa",
                          padding: 30,
                        }}
                      >
                        No transactions found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    data.transactions.map((t) => (
                      <tr key={t.order_id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                          {formatDateTime(t.created_at)}
                        </td>
                        <td>
                          <strong>{t.order_number}</strong>
                        </td>
                        <td>{t.receipt_number || "—"}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {t.customer_name || "Walk-in Customer"}
                          </div>
                          <div style={{ fontSize: 11, color: "#888" }}>
                            {t.customer_phone || "No phone"}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge ${badgeClass(t.payment_method)}`}
                          >
                            {humanize(t.payment_method)}
                          </span>
                        </td>
                        <td>{money(t.subtotal)}</td>
                        <td style={{ color: "#2e7d32" }}>
                          {parseFloat(t.discount || 0) > 0
                            ? `-${money(t.discount)}`
                            : money(0)}
                        </td>
                        <td style={{ fontWeight: 700 }}>{money(t.total)}</td>
                        <td>
                          {t.payment_method === "cash"
                            ? money(t.cash_received)
                            : "—"}
                        </td>
                        <td>
                          {t.payment_method === "cash"
                            ? money(t.change_amount)
                            : "—"}
                        </td>
                        <td>{money(t.estimated_profit)}</td>
                        <td>
                          {t.delivery_status ? (
                            <span
                              className={`badge ${badgeClass(t.delivery_status)}`}
                            >
                              {humanize(t.delivery_status)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {t.appointment_status ? (
                            <span
                              className={`badge ${badgeClass(t.appointment_status)}`}
                            >
                              {humanize(t.appointment_status)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{t.processed_by || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
