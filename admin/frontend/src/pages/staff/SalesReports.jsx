import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Printer } from "lucide-react";


const money = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const humanize = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

// WISDOM CASHIER SALES REPORTS UI WORDING V1
// WISDOM CASHIER SALES REPORT UI V2.1 ZERO RADIUS
// WISDOM CASHIER SALES REPORT WORDING POLISH V2.2
const processedByLabel = (value) => {
  const label = String(value || "").trim();
  if (!label) return "System";

  const normalized = label.toLowerCase();
  if (normalized.includes("paymongo") || normalized === "online payment") {
    return "Online Payment";
  }

  return label;
};

const paymentMethodLabel = (value) => {
  const method = String(value || "").toLowerCase();
  if (method === "paymongo") return "Online Payment";
  if (method === "gcash") return "GCash";
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "cod") return "COD";
  if (method === "cop") return "COP";
  return humanize(method);
};

const orderTypeLabel = (row = {}) => {
  const type = String(row.order_type || "").trim().toLowerCase();
  if (type === "blueprint") return "Blueprint";
  if (type === "standard") return "Standard";
  return humanize(type);
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
    payment: "all",
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
  const isCashierReport = data?.report_scope === "cashier";

  const chartData = useMemo(
    () =>
      (data?.summary || []).map((row) => ({
        ...row,
        formatted_period: formatPeriodLabel(row.period_label, filters.period),
      })),
    [data?.summary, filters.period],
  );

  const paymentMethodTotal = useMemo(
    () =>
      paymentBreakdown.reduce(
        (sum, row) => sum + Number(row.total_amount || 0),
        0,
      ),
    [paymentBreakdown],
  );

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={headerRow}>
        <div>
          <h1 style={pageTitle}>
            {isCashierReport ? "My Sales Report" : "Sales Report"}
          </h1>
          <p style={pageSubtitle}>
            {isCashierReport
              ? "Review only the verified payments and orders processed under your cashier account."
              : "Review verified payments, balances, and sales activity."}
          </p>
        </div>

      </div>

      <div style={noticeBox}>
        <strong>
          {isCashierReport ? "Your cashier transactions only." : "Verified payments only."}
        </strong>{" "}
        {isCashierReport
          ? "Only verified payments processed under your account are included. Blueprint down payments and remaining balances stay as separate transactions."
          : "Blueprint down payments and remaining balances are recorded as separate payment transactions."}
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
              <option value="online">Website Orders</option>
              <option value="walk_in">Walk-in Orders</option>
            </select>
          </FilterField>

          <FilterField label="Payment Type">
            <select
              style={input}
              value={filters.payment}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  payment: event.target.value,
                }))
              }
            >
              <option value="all">All Payments</option>
              <option value="cash">Cash</option>
              <option value="online">Online</option>
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

          <button style={buttonGhost} onClick={() => window.print()}>
            <Printer size={15} /> Print Report
          </button>
        </div>
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}
      {loading ? <div style={loadingBox}>Loading report...</div> : null}

      {!loading && data ? (
        <>
          <div style={metricGrid}>
            <MetricCard
              label="Order Value"
              value={money(totals.gross_order_value)}
              note={
                isCashierReport
                  ? "Full value of orders with payments you processed"
                  : "Total value of orders included in this report"
              }
            />
            <MetricCard
              label="Collected Payments"
              value={money(totals.actual_collected)}
              note={`${totals.collection_count || 0} verified payment${Number(totals.collection_count || 0) === 1 ? "" : "s"}`}
            />
            <MetricCard
              label="Remaining Balance"
              value={money(totals.outstanding_balance)}
              note="Unpaid balance on orders included in this report"
            />
            <MetricCard
              label="Orders Included"
              value={totals.total_orders || 0}
              note={
                isCashierReport
                  ? "Unique orders tied to your processed payments"
                  : "Orders included in the selected report period"
              }
            />
          </div>

          <div style={chartGrid}>
            <section style={card}>
              <SectionHeader
                title="Payment Activity"
                subtitle="Verified payments grouped by payment date"
              />
              <div style={{ padding: 18 }}>
                {chartData.length === 0 ? (
                  <div style={emptyChart}>No verified payments for this period.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="formatted_period" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value) => [money(value), "Collected Payments"]}
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: "#fff" }}
                      />
                      <Bar dataKey="total_sales" fill="#18181b" radius={[0, 0, 0, 0]} barSize={42} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section style={card}>
              <SectionHeader
                title="Payment Methods"
                subtitle="Verified payments grouped by payment method"
              />
              <div style={methodPanel}>
                {paymentBreakdown.length === 0 ? (
                  <div style={methodEmpty}>No verified payment data.</div>
                ) : (
                  paymentBreakdown.map((row) => {
                    const amount = Number(row.total_amount || 0);
                    const share =
                      paymentMethodTotal > 0
                        ? (amount / paymentMethodTotal) * 100
                        : 0;

                    return (
                      <div key={row.payment_method} style={methodBlock}>
                        <div style={methodRow}>
                          <div>
                            <strong style={methodName}>
                              {paymentMethodLabel(row.payment_method)}
                            </strong>
                            <div style={methodMeta}>
                              {row.count} verified payment{Number(row.count || 0) === 1 ? "" : "s"}
                            </div>
                          </div>
                          <strong style={methodAmount}>
                            {money(row.total_amount)}
                          </strong>
                        </div>
                        <div style={methodTrack}>
                          <div
                            style={{
                              ...methodFill,
                              width: `${Math.max(share, amount > 0 ? 3 : 0)}%`,
                            }}
                          />
                        </div>
                        <div style={methodShare}>
                          {share.toFixed(1)}% of collected payments
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <section style={card}>
            <SectionHeader
              title="Payment Transactions"
              subtitle={
                isCashierReport
                  ? "Verified payments processed under your cashier account during the selected period."
                  : "Verified payments recorded during the selected period."
              }
            />
            <div style={tableScroll}>
              <table style={table}>
                <thead>
                  <tr>
                    {["Date", "Receipt", "Order", "Customer", "Order Type", "Payment Method", "Amount Paid", "Order Total", "Total Paid", "Balance", "Status", "Processed By"].map((label) => (
                      <th key={label} style={th}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <EmptyRow colSpan={12} text="No verified payment transactions for this period." />
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
                        <td style={td}>{orderTypeLabel(row)}</td>
                        <td style={td}>{paymentMethodLabel(row.payment_method)}</td>
                        <td style={{ ...td, fontWeight: 900 }}>{money(row.amount)}</td>
                        <td style={td}>{money(row.order_total)}</td>
                        <td style={td}>{money(row.lifetime_collected)}</td>
                        <td style={td}>{money(row.remaining_balance)}</td>
                        <td style={td}>{humanize(row.payment_status)}</td>
                        <td style={td}>{processedByLabel(row.processed_by)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={card}>
            <SectionHeader
              title="Product Sales"
              subtitle="Custom furniture may be priced as one complete project instead of per item."
            />
            <div style={tableScroll}>
              <table style={table}>
                <thead>
                  <tr>
                    {["Product", "Units", "Order Value"].map((label) => (
                      <th key={label} style={th}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <EmptyRow colSpan={3} text="No product sales data for this period." />
                  ) : (
                    products.map((row, index) => {
                      const hasOrderValue =
                        Math.abs(Number(row.gross_order_value || 0)) > 0.009;

                      return (
                        <tr key={`${row.product_name}-${index}`} style={tr}>
                          <td style={{ ...td, fontWeight: 700 }}>
                            {row.product_name || "—"}
                          </td>
                          <td style={td}>
                            {Number(row.qty || 0).toLocaleString("en-PH")}
                          </td>
                          <td style={td}>
                            {hasOrderValue ? (
                              money(row.gross_order_value)
                            ) : (
                              <span style={pendingAllocation}>
                                Not separately priced
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
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

const pageTitle = { margin: 0, fontSize: 26, fontWeight: 900, color: "#0a0a0a", letterSpacing: "-0.02em" };
const pageSubtitle = { margin: "6px 0 0", fontSize: 12.5, color: "#6f6f75", lineHeight: 1.45 };
const headerRow = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 };
const buttonGhost = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1px solid #bfc1c5", background: "#fff", color: "#18181b", padding: "9px 13px", borderRadius: 0, fontWeight: 800, fontSize: 12, cursor: "pointer", minHeight: 38 };
const noticeBox = { padding: "11px 13px", marginBottom: 16, border: "1px solid #d8d8dc", borderLeft: "3px solid #18181b", background: "#fafafa", color: "#4d4d53", borderRadius: 0, fontSize: 11.5, lineHeight: 1.55 };
const filterCard = { background: "#fff", border: "1px solid #dcdde0", borderRadius: 0, padding: 16, marginBottom: 16 };
const filterGrid = { display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" };
const fieldWrap = { display: "flex", flexDirection: "column", gap: 6, minWidth: 145 };
const fieldLabel = { fontSize: 10.5, color: "#55565b", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".045em" };
const input = { border: "1px solid #cfd0d4", background: "#fff", borderRadius: 0, padding: "9px 10px", fontSize: 12, minHeight: 38, color: "#18181b" };
const buttonPrimary = { border: "1px solid #18181b", background: "#18181b", color: "#fff", padding: "10px 15px", borderRadius: 0, fontWeight: 800, fontSize: 12, cursor: "pointer", minHeight: 38 };
const errorBox = { padding: 13, borderRadius: 0, color: "#991b1b", background: "#fff5f5", border: "1px solid #efb7b7", marginBottom: 16, fontSize: 12 };
const loadingBox = { padding: 38, textAlign: "center", color: "#71717a", border: "1px solid #dcdde0", borderRadius: 0, background: "#fff" };
const metricGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 16 };
const metricCard = { background: "#fff", border: "1px solid #dcdde0", borderRadius: 0, padding: "15px 16px", minHeight: 110 };
const metricLabel = { fontSize: 10, fontWeight: 800, color: "#6f7076", textTransform: "uppercase", letterSpacing: ".05em" };
const metricValue = { fontSize: 23, fontWeight: 900, color: "#0a0a0a", marginTop: 8, letterSpacing: "-0.02em" };
const metricNote = { fontSize: 10.5, color: "#77787e", lineHeight: 1.45, marginTop: 7 };
const chartGrid = { display: "grid", gridTemplateColumns: "minmax(420px, 1.35fr) minmax(320px, .85fr)", gap: 14, marginBottom: 14 };
const card = { background: "#fff", border: "1px solid #dcdde0", borderRadius: 0, overflow: "hidden", marginBottom: 14 };
const sectionHeader = { padding: "14px 16px", borderBottom: "1px solid #dcdde0", background: "#fafafa" };
const sectionTitle = { margin: 0, fontSize: 14.5, fontWeight: 900, color: "#18181b" };
const sectionSubtitle = { margin: "4px 0 0", fontSize: 10.5, color: "#77787e", lineHeight: 1.4 };
const emptyChart = { height: 250, display: "flex", alignItems: "center", justifyContent: "center", color: "#77787e", fontSize: 11.5 };
const tooltipStyle = { background: "#18181b", border: "1px solid #18181b", borderRadius: 0, color: "#fff", fontSize: 11.5 };
const methodPanel = { padding: "16px" };
const methodBlock = { padding: "13px 0", borderBottom: "1px solid #ececee" };
const methodRow = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 };
const methodName = { fontSize: 12.5, color: "#18181b", fontWeight: 800 };
const methodAmount = { fontSize: 13.5, color: "#18181b", fontWeight: 900, whiteSpace: "nowrap" };
const methodMeta = { marginTop: 3, fontSize: 10, color: "#77787e" };
const methodTrack = { width: "100%", height: 7, marginTop: 10, background: "#ececee", overflow: "hidden" };
const methodFill = { height: "100%", background: "#18181b", borderRadius: 0 };
const methodShare = { marginTop: 5, fontSize: 9.5, color: "#8b8c91" };
const methodEmpty = { minHeight: 250, display: "flex", alignItems: "center", justifyContent: "center", color: "#77787e", fontSize: 11.5 };
const tableScroll = { overflowX: "auto" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 11.5 };
const th = { textAlign: "left", padding: "10px 11px", background: "#fafafa", borderBottom: "1px solid #dcdde0", color: "#55565b", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap", fontWeight: 800 };
const tr = { borderBottom: "1px solid #ececee" };
const td = { padding: "11px", verticalAlign: "top", color: "#3f3f46", whiteSpace: "nowrap" };
const mutedText = { marginTop: 3, fontSize: 9.5, color: "#77787e" };
const pendingAllocation = { color: "#77787e", fontSize: 10.5, fontStyle: "italic", whiteSpace: "nowrap" };
const emptyCell = { padding: 30, textAlign: "center", color: "#77787e" };
