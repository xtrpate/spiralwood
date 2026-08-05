import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Printer } from "lucide-react";

const PIE_COLORS = [
  "#18181b",
  "#3f3f46",
  "#71717a",
  "#a1a1aa",
  "#d4d4d8",
  "#e4e4e7",
];

const money = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const humanize = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const paymentMethodLabel = (value) => {
  const method = String(value || "").toLowerCase();
  if (method === "paymongo") return "PayMongo / Online";
  if (method === "gcash") return "GCash";
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "cod") return "COD";
  if (method === "cop") return "COP";
  return humanize(method);
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatPeriodLabel = (value, period) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  if (period === "yearly") return String(date.getFullYear());
  if (period === "monthly") {
    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
    });
  }
  if (period === "weekly") {
    return `Week of ${date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    })}`;
  }
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
};

function MetricCard({ label, value, note }) {
  return (
    <div style={metricCard}>
      <div style={metricLabel}>{label}</div>
      <div style={metricValue}>{value}</div>
      {note ? <div style={metricNote}>{note}</div> : null}
    </div>
  );
}

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
      const params = { ...filters };
      if (!filters.from || !filters.to) {
        delete params.from;
        delete params.to;
      }
      const response = await api.get("/pos/reports", { params });
      setData(response.data);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.message || "Failed to load POS sales report.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const totals = data?.totals || {};
  const transactions = data?.transactions || [];
  const paymentBreakdown = data?.payment_breakdown || [];
  const products = data?.top_products || [];

  const chartData = useMemo(
    () =>
      (data?.summary || []).map((row) => ({
        ...row,
        formatted_period: formatPeriodLabel(row.period_label, filters.period),
      })),
    [data?.summary, filters.period],
  );

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={headerRow}>
        <div>
          <h1 style={pageTitle}>POS Sales & Collections</h1>
          <p style={pageSubtitle}>
            Actual Sales include verified payment transactions only.
          </p>
        </div>
        <button style={buttonGhost} onClick={() => window.print()}>
          <Printer size={16} /> Print Report
        </button>
      </div>

      <div style={noticeBox}>
        Blueprint 30% payments and remaining-balance payments appear as separate verified collections. COD/COP collections appear only after payment verification, not when the unpaid order is created.
      </div>

      <div style={filterCard}>
        <div style={filterGrid}>
          <FilterField label="Order Source">
            <select
              style={input}
              value={filters.source}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  source: event.target.value,
                }))
              }
            >
              <option value="all">All Sources</option>
              <option value="online">Online / Website</option>
              <option value="walk_in">Walk-in / POS</option>
            </select>
          </FilterField>

          <FilterField label="Period">
            <select
              style={input}
              value={filters.period}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  period: event.target.value,
                }))
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </FilterField>

          <FilterField label="From Date">
            <input
              style={input}
              type="date"
              value={filters.from}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
          </FilterField>

          <FilterField label="To Date">
            <input
              style={input}
              type="date"
              value={filters.to}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
            />
          </FilterField>

          <button
            style={buttonPrimary}
            onClick={fetchReport}
            disabled={loading || Boolean(filters.from && filters.to && filters.from > filters.to)}
          >
            {loading ? "Loading..." : "Generate Report"}
          </button>
        </div>
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}
      {loading ? <div style={loadingBox}>Loading report...</div> : null}

      {!loading && data ? (
        <>
          <div style={metricGrid}>
            <MetricCard
              label="Gross Order Value"
              value={money(totals.gross_order_value)}
              note="Non-cancelled orders created in the selected order period"
            />
            <MetricCard
              label="Actual Collected"
              value={money(totals.actual_collected)}
              note={`${totals.collection_count || 0} verified collection(s)`}
            />
            <MetricCard
              label="Outstanding"
              value={money(totals.outstanding_balance)}
              note="Remaining balance of non-cancelled orders in the selected order period"
            />
            <MetricCard label="Non-cancelled Orders" value={totals.total_orders || 0} />
            <MetricCard
              label="Estimated Order Profit"
              value={money(totals.estimated_profit)}
              note="Estimate only, not realized accounting profit"
            />
          </div>

          <div style={chartGrid}>
            <section style={card}>
              <SectionHeader
                title="Actual Collections by Period"
                subtitle="Grouped by payment verification date"
              />
              <div style={{ padding: 18 }}>
                {chartData.length === 0 ? (
                  <div style={emptyChart}>No verified collections for this period.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="formatted_period" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value) => [money(value), "Verified Collections"]}
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: "#fff" }}
                      />
                      <Bar dataKey="total_sales" fill="#18181b" radius={[4, 4, 0, 0]} barSize={42} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section style={card}>
              <SectionHeader title="Verified Collections by Method" />
              <div style={{ padding: 18 }}>
                {paymentBreakdown.length === 0 ? (
                  <div style={emptyChart}>No verified payment data.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={paymentBreakdown}
                        dataKey="total_amount"
                        nameKey="payment_method"
                        cx="50%"
                        cy="50%"
                        outerRadius={84}
                        label={({ payment_method }) => paymentMethodLabel(payment_method)}
                      >
                        {paymentBreakdown.map((row, index) => (
                          <Cell key={`${row.payment_method}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="#fff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, item) => [
                          money(value),
                          paymentMethodLabel(item?.payload?.payment_method),
                        ]}
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: "#fff" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {paymentBreakdown.map((row) => (
                  <div key={row.payment_method} style={methodRow}>
                    <div>
                      <strong>{paymentMethodLabel(row.payment_method)}</strong>
                      <div style={methodMeta}>{row.count} transaction(s)</div>
                    </div>
                    <strong>{money(row.total_amount)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section style={card}>
            <SectionHeader
              title="Verified Collection Transactions"
              subtitle="Each row is one verified payment. Blueprint down payment and remaining balance are separate rows."
            />
            <div style={tableScroll}>
              <table style={table}>
                <thead>
                  <tr>
                    {["Payment Date", "Receipt", "Order", "Customer", "Source / Type", "Method", "Amount", "Order Total", "Lifetime Collected", "Remaining", "Payment Status", "Processed By"].map((label) => (
                      <th key={label} style={th}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <EmptyRow colSpan={12} text="No verified collection transactions for this period." />
                  ) : (
                    transactions.map((row) => (
                      <tr key={row.payment_transaction_id} style={tr}>
                        <td style={td}>{formatDateTime(row.payment_date)}</td>
                        <td style={td}>{row.receipt_number || "—"}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{row.order_number || `#${row.order_id}`}</td>
                        <td style={td}>
                          <div style={{ fontWeight: 700 }}>{row.customer_name || "—"}</div>
                          <div style={mutedText}>{row.customer_phone || ""}</div>
                        </td>
                        <td style={td}>{humanize(row.type)} · {humanize(row.order_type)}</td>
                        <td style={td}>{paymentMethodLabel(row.payment_method)}</td>
                        <td style={{ ...td, fontWeight: 900 }}>{money(row.amount)}</td>
                        <td style={td}>{money(row.order_total)}</td>
                        <td style={td}>{money(row.lifetime_collected)}</td>
                        <td style={td}>{money(row.remaining_balance)}</td>
                        <td style={td}>{humanize(row.payment_status)}</td>
                        <td style={td}>{row.processed_by || "System"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={card}>
            <SectionHeader
              title="Gross Order Product Breakdown"
              subtitle="Order pipeline value. Partial blueprint payments are not allocated artificially across products."
            />
            <div style={tableScroll}>
              <table style={table}>
                <thead>
                  <tr>
                    {["Product", "Units", "Gross Order Value", "Estimated Profit"].map((label) => (
                      <th key={label} style={th}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <EmptyRow colSpan={4} text="No product order data for this period." />
                  ) : (
                    products.map((row, index) => (
                      <tr key={`${row.product_name}-${index}`} style={tr}>
                        <td style={{ ...td, fontWeight: 700 }}>{row.product_name || "—"}</td>
                        <td style={td}>{Number(row.qty || 0).toLocaleString("en-PH")}</td>
                        <td style={td}>{money(row.gross_order_value)}</td>
                        <td style={td}>{money(row.estimated_profit)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function FilterField({ label, children }) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={sectionHeader}>
      <h3 style={sectionTitle}>{title}</h3>
      {subtitle ? <p style={sectionSubtitle}>{subtitle}</p> : null}
    </div>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} style={emptyCell}>{text}</td>
    </tr>
  );
}

const pageTitle = { margin: 0, fontSize: 25, fontWeight: 900, color: "#0a0a0a" };
const pageSubtitle = { margin: "6px 0 0", fontSize: 13, color: "#71717a" };
const headerRow = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 };
const buttonGhost = { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #d4d4d8", background: "#fff", color: "#18181b", padding: "9px 13px", borderRadius: 8, fontWeight: 800, cursor: "pointer" };
const noticeBox = { padding: "12px 14px", marginBottom: 18, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1e3a8a", borderRadius: 10, fontSize: 12, lineHeight: 1.55 };
const filterCard = { background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12, padding: 18, marginBottom: 18 };
const filterGrid = { display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" };
const fieldWrap = { display: "flex", flexDirection: "column", gap: 6, minWidth: 145 };
const fieldLabel = { fontSize: 11, color: "#52525b", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".03em" };
const input = { border: "1px solid #d4d4d8", background: "#fff", borderRadius: 8, padding: "9px 10px", fontSize: 12, minHeight: 38 };
const buttonPrimary = { border: "1px solid #18181b", background: "#18181b", color: "#fff", padding: "10px 14px", borderRadius: 8, fontWeight: 800, cursor: "pointer", minHeight: 38 };
const errorBox = { padding: 14, borderRadius: 10, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", marginBottom: 16 };
const loadingBox = { padding: 38, textAlign: "center", color: "#71717a", border: "1px solid #e4e4e7", borderRadius: 12, background: "#fff" };
const metricGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 18 };
const metricCard = { background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12, padding: 16 };
const metricLabel = { fontSize: 10, fontWeight: 800, color: "#71717a", textTransform: "uppercase", letterSpacing: ".04em" };
const metricValue = { fontSize: 22, fontWeight: 900, color: "#0a0a0a", marginTop: 7 };
const metricNote = { fontSize: 10, color: "#71717a", lineHeight: 1.45, marginTop: 6 };
const chartGrid = { display: "grid", gridTemplateColumns: "minmax(420px, 1.4fr) minmax(320px, .9fr)", gap: 18, marginBottom: 18 };
const card = { background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12, overflow: "hidden", marginBottom: 18 };
const sectionHeader = { padding: "16px 18px", borderBottom: "1px solid #e4e4e7", background: "#fafafa" };
const sectionTitle = { margin: 0, fontSize: 15, fontWeight: 900, color: "#18181b" };
const sectionSubtitle = { margin: "4px 0 0", fontSize: 11, color: "#71717a" };
const emptyChart = { height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a", fontSize: 12 };
const tooltipStyle = { background: "#18181b", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 };
const methodRow = { display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #f4f4f5" };
const methodMeta = { marginTop: 3, fontSize: 10, color: "#71717a" };
const tableScroll = { overflowX: "auto" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const th = { textAlign: "left", padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid #e4e4e7", color: "#52525b", fontSize: 10, textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" };
const tr = { borderBottom: "1px solid #f4f4f5" };
const td = { padding: "11px 12px", verticalAlign: "top", color: "#3f3f46", whiteSpace: "nowrap" };
const mutedText = { marginTop: 3, fontSize: 10, color: "#71717a" };
const emptyCell = { padding: 32, textAlign: "center", color: "#71717a" };
