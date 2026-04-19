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

// Sleek grayscale palette for the Pie Chart
const PIE_COLORS = [
  "#18181b",
  "#3f3f46",
  "#71717a",
  "#a1a1aa",
  "#d4d4d8",
  "#f4f4f5",
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

const getBadgeStyle = (status) => {
  const s = String(status || "").toLowerCase();
  if (["failed", "cancelled"].includes(s))
    return {
      background: "#fef2f2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    };
  if (["delivered", "done", "confirmed"].includes(s))
    return {
      background: "#0a0a0a",
      color: "#ffffff",
      border: "1px solid #0a0a0a",
    };
  if (["cash", "gcash", "bank_transfer", "cod", "cop"].includes(s))
    return {
      background: "#f4f4f5",
      color: "#18181b",
      border: "1px solid #e4e4e7",
    };

  return {
    background: "#ffffff",
    color: "#52525b",
    border: "1px solid #d4d4d8",
  };
};

export default function SalesReports() {
  const [data, setData] = useState(null);
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
        err.response?.data?.message || "Failed to load POS sales report.",
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

  const summaryData = (data?.summary || []).map((item) => ({
    ...item,
    formatted_period: formatPeriodLabel(
      item.period_label || item.period,
      filters.period,
    ),
  }));

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", paddingBottom: 40 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              color: "#0a0a0a",
              letterSpacing: "-0.02em",
            }}
          >
            POS Sales Reports
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "#52525b",
              lineHeight: 1.5,
            }}
          >
            View and filter your complete transaction history
          </p>
        </div>
        <button
          style={btnGhost}
          onClick={() => window.print()}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#e4e4e7")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#f4f4f5")}
        >
          <Printer size={16} /> Print Report
        </button>
      </div>

      <div style={{ ...cardStyle, marginBottom: 24, padding: "20px 24px" }}>
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minWidth: 150,
            }}
          >
            <label style={labelStyle}>Order Source</label>
            <select
              style={inputStyle}
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

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minWidth: 150,
            }}
          >
            <label style={labelStyle}>Period</label>
            <select
              style={inputStyle}
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

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={labelStyle}>From Date</label>
            <input
              style={inputStyle}
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={labelStyle}>To Date</label>
            <input
              style={inputStyle}
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>

          <button
            style={{ ...btnPrimary, height: 42 }}
            onClick={fetchReport}
            disabled={loading}
          >
            {loading ? "Loading..." : "Generate Report"}
          </button>
        </div>
      </div>

      {loading && (
        <div
          style={{
            ...cardStyle,
            textAlign: "center",
            padding: 40,
            color: "#71717a",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Loading report...
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            marginBottom: 20,
            padding: "14px 16px",
            color: "#991b1b",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {!loading && data && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div style={statCardStyle}>
              <div style={iconWrapperStyle}>🧾</div>
              <div>
                <div style={statValueStyle}>{data.totals.total_orders}</div>
                <div style={statLabelStyle}>Total Orders</div>
              </div>
            </div>

            <div style={statCardStyle}>
              <div
                style={{
                  ...iconWrapperStyle,
                  background: "#18181b",
                  color: "#fff",
                }}
              >
                💰
              </div>
              <div>
                <div style={statValueStyle}>
                  {money(data.totals.grand_total)}
                </div>
                <div style={statLabelStyle}>Grand Total</div>
              </div>
            </div>

            <div style={statCardStyle}>
              <div
                style={{
                  ...iconWrapperStyle,
                  background: "#fef2f2",
                  color: "#dc2626",
                }}
              >
                🏷️
              </div>
              <div>
                <div style={{ ...statValueStyle, color: "#dc2626" }}>
                  {money(data.totals.total_discount)}
                </div>
                <div style={statLabelStyle}>Total Discounts</div>
              </div>
            </div>

            <div style={statCardStyle}>
              <div style={iconWrapperStyle}>📈</div>
              <div>
                <div style={statValueStyle}>
                  {money(data.totals.estimated_profit)}
                </div>
                <div style={statLabelStyle}>Estimated Profit</div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: 20,
              marginBottom: 24,
            }}
          >
            <div style={{ ...cardStyle, padding: "24px" }}>
              <h3 style={sectionTitleStyle}>Sales by Period</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={summaryData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e4e4e7"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="formatted_period"
                    tick={{ fontSize: 11, fill: "#71717a" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#71717a" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [money(v), "Sales"]}
                    contentStyle={{
                      background: "#18181b",
                      border: "none",
                      borderRadius: 8,
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                    itemStyle={{ color: "#fff" }}
                  />
                  <Bar
                    dataKey="total_sales"
                    fill="#18181b"
                    radius={[4, 4, 0, 0]}
                    barSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ ...cardStyle, padding: "24px" }}>
              <h3 style={sectionTitleStyle}>Payment Methods</h3>
              {data.payment_breakdown.length === 0 ? (
                <div
                  style={{
                    height: 260,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#71717a",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  No payment data available.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={data.payment_breakdown}
                      dataKey="count"
                      nameKey="payment_method"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      label={({ payment_method }) => humanize(payment_method)}
                      labelLine={{ stroke: "#a1a1aa" }}
                    >
                      {data.payment_breakdown.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, item) => [
                        `${value} transactions`,
                        humanize(item?.payload?.payment_method),
                      ]}
                      contentStyle={{
                        background: "#18181b",
                        border: "none",
                        borderRadius: 8,
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                      itemStyle={{ color: "#fff" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.5fr",
              gap: 20,
              marginBottom: 24,
            }}
          >
            <div style={{ ...cardStyle, padding: 0 }}>
              <div
                style={{
                  padding: "20px 24px",
                  borderBottom: "1px solid #f4f4f5",
                  background: "#fafafa",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#0a0a0a",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Top Products
                </h3>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Product</th>
                      <th style={thStyle}>Qty</th>
                      <th style={thStyle}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_products.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          style={{
                            textAlign: "center",
                            color: "#71717a",
                            padding: 30,
                            fontSize: 13,
                            fontWeight: 500,
                          }}
                        >
                          No product data found.
                        </td>
                      </tr>
                    ) : (
                      data.top_products.map((p, i) => (
                        <tr key={i} style={trStyle}>
                          <td
                            style={{
                              ...tdStyle,
                              color: "#71717a",
                              fontWeight: 700,
                            }}
                          >
                            {i + 1}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>
                            {p.product_name}
                          </td>
                          <td style={tdStyle}>{p.qty}</td>
                          <td
                            style={{
                              ...tdStyle,
                              fontWeight: 700,
                              color: "#0a0a0a",
                            }}
                          >
                            {money(p.revenue)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 0 }}>
              <div
                style={{
                  padding: "20px 24px",
                  borderBottom: "1px solid #f4f4f5",
                  background: "#fafafa",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#0a0a0a",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Period Summary
                </h3>
              </div>
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                <table style={tableStyle}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Period</th>
                      <th style={thStyle}>Orders</th>
                      <th style={thStyle}>Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.summary.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          style={{
                            textAlign: "center",
                            color: "#71717a",
                            padding: 30,
                            fontSize: 13,
                            fontWeight: 500,
                          }}
                        >
                          No summary data found.
                        </td>
                      </tr>
                    ) : (
                      summaryData.map((s, i) => (
                        <tr key={i} style={trStyle}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>
                            {s.formatted_period}
                          </td>
                          <td style={tdStyle}>{s.order_count}</td>
                          <td
                            style={{
                              ...tdStyle,
                              fontWeight: 700,
                              color: "#0a0a0a",
                            }}
                          >
                            {money(s.total_sales)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 0 }}>
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #f4f4f5",
                background: "#fafafa",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 800,
                  color: "#0a0a0a",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Transaction History
              </h3>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ ...tableStyle, minWidth: 1200 }}>
                <thead>
                  <tr style={thRowStyle}>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Order #</th>
                    <th style={thStyle}>Receipt #</th>
                    <th style={thStyle}>Customer</th>
                    <th style={thStyle}>Payment</th>
                    <th style={thStyle}>Subtotal</th>
                    <th style={thStyle}>Discount</th>
                    <th style={thStyle}>Total</th>
                    <th style={thStyle}>Cash Received</th>
                    <th style={thStyle}>Change</th>
                    <th style={thStyle}>Profit</th>
                    <th style={thStyle}>Delivery</th>
                    <th style={thStyle}>Appointment</th>
                    <th style={thStyle}>Cashier</th>
                  </tr>
                </thead>
                <tbody>
                  {!data.transactions || data.transactions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={14}
                        style={{
                          textAlign: "center",
                          color: "#71717a",
                          padding: 40,
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        No transactions found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    data.transactions.map((t) => {
                      const deliveryStyle = getBadgeStyle(t.delivery_status);
                      const appointmentStyle = getBadgeStyle(
                        t.appointment_status,
                      );
                      const paymentStyle = getBadgeStyle(t.payment_method);

                      return (
                        <tr key={t.order_id} style={trStyle}>
                          <td
                            style={{
                              ...tdStyle,
                              whiteSpace: "nowrap",
                              fontSize: 12,
                              color: "#52525b",
                            }}
                          >
                            {formatDateTime(t.created_at)}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontWeight: 800,
                              color: "#0a0a0a",
                            }}
                          >
                            {t.order_number}
                          </td>
                          <td style={tdStyle}>{t.receipt_number || "—"}</td>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600, color: "#18181b" }}>
                              {t.customer_name || "Walk-in Customer"}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#71717a",
                                marginTop: 2,
                              }}
                            >
                              {t.customer_phone || "No phone"}
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                ...paymentStyle,
                                padding: "4px 10px",
                                borderRadius: 999,
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {humanize(t.payment_method)}
                            </span>
                          </td>
                          <td style={tdStyle}>{money(t.subtotal)}</td>
                          <td
                            style={{
                              ...tdStyle,
                              color: "#dc2626",
                              fontWeight: 600,
                            }}
                          >
                            {parseFloat(t.discount || 0) > 0
                              ? `-${money(t.discount)}`
                              : money(0)}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontWeight: 800,
                              color: "#0a0a0a",
                            }}
                          >
                            {money(t.total)}
                          </td>
                          <td style={tdStyle}>
                            {t.payment_method === "cash"
                              ? money(t.cash_received)
                              : "—"}
                          </td>
                          <td style={tdStyle}>
                            {t.payment_method === "cash"
                              ? money(t.change_amount)
                              : "—"}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontWeight: 600,
                              color: "#059669",
                            }}
                          >
                            {money(t.estimated_profit)}
                          </td>
                          <td style={tdStyle}>
                            {t.delivery_status ? (
                              <span
                                style={{
                                  ...deliveryStyle,
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {humanize(t.delivery_status)}
                              </span>
                            ) : (
                              <span style={{ color: "#a1a1aa" }}>—</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {t.appointment_status ? (
                              <span
                                style={{
                                  ...appointmentStyle,
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {humanize(t.appointment_status)}
                              </span>
                            ) : (
                              <span style={{ color: "#a1a1aa" }}>—</span>
                            )}
                          </td>
                          <td style={tdStyle}>{t.processed_by || "—"}</td>
                        </tr>
                      );
                    })
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

// ── Reusable Styles ──────────────────────────────────────────

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 800,
  color: "#18181b",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const inputStyle = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  color: "#18181b",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 20px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnGhost = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const statCardStyle = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: "20px 24px",
  display: "flex",
  alignItems: "center",
  gap: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const iconWrapperStyle = {
  width: 44,
  height: 44,
  borderRadius: 12,
  background: "#f4f4f5",
  color: "#18181b",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 20,
};

const statValueStyle = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
  lineHeight: 1,
};

const statLabelStyle = {
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginTop: 6,
};

const sectionTitleStyle = {
  margin: "0 0 20px",
  fontSize: 18,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.01em",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  textAlign: "left",
};

const thRowStyle = {
  background: "#fafafa",
  borderBottom: "1px solid #e4e4e7",
};

const thStyle = {
  padding: "14px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const trStyle = {
  borderBottom: "1px solid #f4f4f5",
  background: "#ffffff",
  transition: "background 0.2s",
};

const tdStyle = {
  padding: "16px",
  color: "#18181b",
  verticalAlign: "middle",
};
