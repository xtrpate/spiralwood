import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const PAGE_SIZE = 20;
const INITIAL_FILTERS = {
  source: "all",
  payment: "all",
  period: "daily",
  from: "",
  to: "",
};

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

const sourceFilterLabel = (value) => {
  const source = String(value || "all").toLowerCase();
  if (source === "online") return "Website Orders";
  if (source === "walk_in" || source === "walkin") return "Walk-in Orders";
  return "All Sources";
};

const paymentFilterLabel = (value) => {
  const payment = String(value || "all").toLowerCase();
  if (payment === "cash") return "Cash";
  if (payment === "online") return "Online";
  return "All Payments";
};

const reportRangeLabel = (filters = {}) => {
  if (filters.from && filters.to) return `${filters.from} to ${filters.to}`;
  if (filters.from) return `From ${filters.from}`;
  if (filters.to) return `Through ${filters.to}`;

  const period = String(filters.period || "daily").toLowerCase();
  if (period === "weekly") return "This week";
  if (period === "monthly") return "This month";
  if (period === "yearly") return "This year";
  return "Today";
};

const orderTypeLabel = (row = {}) => {
  const type = String(row.order_type || "")
    .trim()
    .toLowerCase();
  if (type === "blueprint") return "Blueprint";
  if (type === "standard") return "Standard";
  return humanize(type);
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
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

  if (period === "yearly") {
    return date.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
    });
  }

  if (period === "monthly") {
    return date.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
    });
  }

  if (period === "weekly") {
    return `Week of ${date.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
    })}`;
  }

  return date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
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
  const [draftFilters, setDraftFilters] = useState(() => ({
    ...INITIAL_FILTERS,
  }));
  const [appliedFilters, setAppliedFilters] = useState(() => ({
    ...INITIAL_FILTERS,
  }));
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSequenceRef = useRef(0);

  const loadReport = useCallback(async (filtersToApply, pageToLoad) => {
    const requestId = ++requestSequenceRef.current;
    setLoading(true);
    setError("");

    const params = {
      source: filtersToApply.source,
      payment: filtersToApply.payment,
      period: filtersToApply.period,
      page: pageToLoad,
      limit: PAGE_SIZE,
    };

    if (filtersToApply.from) params.from = filtersToApply.from;
    if (filtersToApply.to) params.to = filtersToApply.to;

    try {
      const response = await api.get("/pos/reports", { params });

      if (requestId !== requestSequenceRef.current) return;

      const responseTotalPages = Math.max(
        1,
        Number(response.data?.pagination?.total_pages || 1),
      );

      if (pageToLoad > responseTotalPages) {
        setPage(responseTotalPages);
        return;
      }

      setData(response.data);
    } catch (err) {
      if (requestId !== requestSequenceRef.current) return;

      setError(
        err.response?.data?.message || "Failed to load POS sales report.",
      );
    } finally {
      if (requestId === requestSequenceRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadReport(appliedFilters, page);

    return () => {
      requestSequenceRef.current += 1;
    };
  }, [appliedFilters, page, loadReport]);

  const hasInvalidRange = Boolean(
    draftFilters.from &&
      draftFilters.to &&
      draftFilters.from > draftFilters.to,
  );

  const handleGenerateReport = () => {
    if (hasInvalidRange) {
      setError("Start date cannot be after end date.");
      return;
    }

    setAppliedFilters({ ...draftFilters });
    setPage(1);
  };

  const totals = data?.totals || {};
  const transactions = data?.transactions || [];
  const paymentBreakdown = data?.payment_breakdown || [];
  const products = data?.top_products || [];
  const isCashierReport = data?.report_scope === "cashier";
  const displayFilters = data?.filters_applied || appliedFilters;
  const pagination = data?.pagination || {};
  const currentPage = Math.max(1, Number(pagination.page || page || 1));
  const totalPages = Math.max(1, Number(pagination.total_pages || 1));
  const totalTransactions = Math.max(
    0,
    Number(pagination.total ?? transactions.length),
  );
  const pageLimit = Math.max(1, Number(pagination.limit || PAGE_SIZE));
  const pageStart =
    totalTransactions === 0 ? 0 : (currentPage - 1) * pageLimit + 1;
  const pageEnd = Math.min(totalTransactions, currentPage * pageLimit);

  const handlePageChange = (nextPage) => {
    const boundedPage = Math.min(totalPages, Math.max(1, nextPage));
    if (loading || boundedPage === currentPage) return;

    setAppliedFilters({
      ...(data?.filters_applied || appliedFilters),
    });
    setPage(boundedPage);
  };

  const chartData = useMemo(
    () =>
      (data?.summary || []).map((row) => ({
        ...row,
        formatted_period: formatPeriodLabel(
          row.period_label,
          displayFilters.period,
        ),
      })),
    [data?.summary, displayFilters.period],
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
          {isCashierReport
            ? "Your cashier transactions only."
            : "Verified payments only."}
        </strong>{" "}
        {isCashierReport
          ? "Only verified payments processed under your account are included. Blueprint down payments and remaining balances stay as separate transactions."
          : "Blueprint down payments and remaining balances are recorded as separate payment transactions."}
      </div>

      <div style={filterCard}>
        <div style={filterGrid}>
          {/* WISDOM CASHIER C3 FORM SEMANTICS R3 */}
          <FilterField label="Order Source" htmlFor="sales-report-source">
            <select
              id="sales-report-source"
              name="sales_report_source"
              style={input}
              value={draftFilters.source}
              onChange={(event) =>
                setDraftFilters((current) => ({
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

          <FilterField
            label="Payment Type"
            htmlFor="sales-report-payment-type"
          >
            <select
              id="sales-report-payment-type"
              name="sales_report_payment_type"
              style={input}
              value={draftFilters.payment}
              onChange={(event) =>
                setDraftFilters((current) => ({
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

          <FilterField label="Period" htmlFor="sales-report-period">
            <select
              id="sales-report-period"
              name="sales_report_period"
              style={input}
              value={draftFilters.period}
              onChange={(event) =>
                setDraftFilters((current) => ({
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

          <FilterField label="From Date" htmlFor="sales-report-from-date">
            <input
              id="sales-report-from-date"
              name="sales_report_from_date"
              style={input}
              type="date"
              value={draftFilters.from}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
          </FilterField>

          <FilterField label="To Date" htmlFor="sales-report-to-date">
            <input
              id="sales-report-to-date"
              name="sales_report_to_date"
              style={input}
              type="date"
              value={draftFilters.to}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
            />
          </FilterField>

          <button
            type="button"
            style={buttonPrimary}
            onClick={handleGenerateReport}
            disabled={loading && !data}
          >
            {loading && !data ? "Loading..." : "Generate Report"}
          </button>

          <button
            type="button"
            style={buttonGhost}
            onClick={() => window.print()}
          >
            <Printer size={15} /> Print Current View
          </button>
        </div>
        <div style={filterHelp}>
          Date fields are optional. With no dates, Period uses the current
          day/week/month/year. With dates, Period controls chart grouping.
        </div>
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}
      {data ? (
        <div style={reportMeta}>
          <strong>Applied report:</strong>{" "}
          {sourceFilterLabel(displayFilters.source)}
          {" · "}
          {paymentFilterLabel(displayFilters.payment)}
          {" · "}
          {reportRangeLabel(displayFilters)}
          {" · Grouped "}
          {humanize(displayFilters.period).toLowerCase()}
          {" · Generated "}
          {formatDateTime(data.generated_at)}
        </div>
      ) : null}
      {loading && !data ? (
        <div style={loadingBox}>Loading report...</div>
      ) : null}
      {loading && data ? (
        <div style={updatingBox}>
          Updating report while the last valid result stays visible...
        </div>
      ) : null}

      {data ? (
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
              label="Current Remaining Balance"
              value={money(totals.outstanding_balance)}
              note="Current unpaid balance of included orders; not the historical balance at the end of the selected period"
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
                  <div style={emptyChart}>
                    No verified payments for this period.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={chartData}
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
                        formatter={(value) => [
                          money(value),
                          "Collected Payments",
                        ]}
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: "#fff" }}
                      />
                      <Bar
                        dataKey="total_sales"
                        fill="#18181b"
                        radius={[0, 0, 0, 0]}
                        barSize={42}
                      />
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
                              {row.count} verified payment
                              {Number(row.count || 0) === 1 ? "" : "s"}
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
                    {[
                      "Date",
                      "Receipt",
                      "Order",
                      "Customer",
                      "Order Type",
                      "Payment Method",
                      "Amount Paid",
                      "Order Total",
                      "Paid After Payment",
                      "Balance After Payment",
                      "Status After Payment",
                      "Processed By",
                    ].map((label) => (
                      <th key={label} style={th}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <EmptyRow
                      colSpan={12}
                      text="No verified payment transactions for this period."
                    />
                  ) : (
                    transactions.map((row) => (
                      <tr key={row.payment_transaction_id} style={tr}>
                        <td style={td}>{formatDateTime(row.payment_date)}</td>
                        <td style={td}>{row.receipt_number || "—"}</td>
                        <td style={{ ...td, fontWeight: 800 }}>
                          {row.order_number || `#${row.order_id}`}
                        </td>
                        <td style={td}>
                          <div style={{ fontWeight: 700 }}>
                            {row.customer_name || "—"}
                          </div>
                          <div style={mutedText}>
                            {row.customer_phone || ""}
                          </div>
                        </td>
                        <td style={td}>{orderTypeLabel(row)}</td>
                        <td style={td}>
                          {paymentMethodLabel(row.payment_method)}
                        </td>
                        <td style={{ ...td, fontWeight: 900 }}>
                          {money(row.amount)}
                        </td>
                        <td style={td}>{money(row.order_total)}</td>
                        <td style={td}>
                          {money(
                            row.total_paid_after ?? row.lifetime_collected,
                          )}
                        </td>
                        <td style={td}>{money(row.remaining_balance)}</td>
                        <td style={td}>{humanize(row.payment_status)}</td>
                        <td style={td}>{processedByLabel(row.processed_by)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalTransactions > 0 ? (
              <div style={paginationBar}>
                <div style={paginationText}>
                  Showing {pageStart}–{pageEnd} of {totalTransactions} transactions
                  {" · Page "}
                  {currentPage} of {totalPages}
                </div>
                <div style={paginationActions}>
                  <button
                    type="button"
                    style={paginationButton}
                    disabled={loading || currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    style={paginationButton}
                    disabled={loading || currentPage >= totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section style={card}>
            <SectionHeader
              title="Top Products by Included Order Value"
              subtitle="Top 20 item values from orders tied to the selected verified-payment scope. Custom furniture may be priced as one complete project instead of per item."
            />
            <div style={tableScroll}>
              <table style={table}>
                <thead>
                  <tr>
                    {["Product", "Units", "Order Value"].map((label) => (
                      <th key={label} style={th}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <EmptyRow
                      colSpan={3}
                      text="No product sales data for this period."
                    />
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

function FilterField({ label, htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} style={fieldWrap}>
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
      <td colSpan={colSpan} style={emptyCell}>
        {text}
      </td>
    </tr>
  );
}

const pageTitle = {
  margin: 0,
  fontSize: 26,
  fontWeight: 900,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};
const pageSubtitle = {
  margin: "6px 0 0",
  fontSize: 12.5,
  color: "#6f6f75",
  lineHeight: 1.45,
};
const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 16,
};
const buttonGhost = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: "1px solid #bfc1c5",
  background: "#fff",
  color: "#18181b",
  padding: "9px 13px",
  borderRadius: 0,
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  minHeight: 38,
};
const noticeBox = {
  padding: "11px 13px",
  marginBottom: 16,
  border: "1px solid #d8d8dc",
  borderLeft: "3px solid #18181b",
  background: "#fafafa",
  color: "#4d4d53",
  borderRadius: 0,
  fontSize: 11.5,
  lineHeight: 1.55,
};
const filterCard = {
  background: "#fff",
  border: "1px solid #dcdde0",
  borderRadius: 0,
  padding: 16,
  marginBottom: 16,
};
const filterGrid = {
  display: "flex",
  gap: 10,
  alignItems: "flex-end",
  flexWrap: "wrap",
};
const filterHelp = {
  marginTop: 10,
  fontSize: 10.5,
  color: "#77787e",
  lineHeight: 1.45,
};
const reportMeta = {
  padding: "9px 11px",
  marginBottom: 12,
  border: "1px solid #e2e2e5",
  background: "#fafafa",
  color: "#626269",
  fontSize: 10.5,
  lineHeight: 1.45,
};
const fieldWrap = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 145,
};
const fieldLabel = {
  fontSize: 10.5,
  color: "#55565b",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".045em",
};
const input = {
  border: "1px solid #cfd0d4",
  background: "#fff",
  borderRadius: 0,
  padding: "9px 10px",
  fontSize: 12,
  minHeight: 38,
  color: "#18181b",
};
const buttonPrimary = {
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#fff",
  padding: "10px 15px",
  borderRadius: 0,
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  minHeight: 38,
};
const errorBox = {
  padding: 13,
  borderRadius: 0,
  color: "#991b1b",
  background: "#fff5f5",
  border: "1px solid #efb7b7",
  marginBottom: 16,
  fontSize: 12,
};
const loadingBox = {
  padding: 38,
  textAlign: "center",
  color: "#71717a",
  border: "1px solid #dcdde0",
  borderRadius: 0,
  background: "#fff",
};
const updatingBox = {
  padding: "9px 11px",
  marginBottom: 12,
  color: "#55565b",
  border: "1px solid #dcdde0",
  background: "#fff",
  fontSize: 10.5,
};
const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
  marginBottom: 16,
};
const metricCard = {
  background: "#fff",
  border: "1px solid #dcdde0",
  borderRadius: 0,
  padding: "15px 16px",
  minHeight: 110,
};
const metricLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: "#6f7076",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};
const metricValue = {
  fontSize: 23,
  fontWeight: 900,
  color: "#0a0a0a",
  marginTop: 8,
  letterSpacing: "-0.02em",
};
const metricNote = {
  fontSize: 10.5,
  color: "#77787e",
  lineHeight: 1.45,
  marginTop: 7,
};
const chartGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(420px, 1.35fr) minmax(320px, .85fr)",
  gap: 14,
  marginBottom: 14,
};
const card = {
  background: "#fff",
  border: "1px solid #dcdde0",
  borderRadius: 0,
  overflow: "hidden",
  marginBottom: 14,
};
const sectionHeader = {
  padding: "14px 16px",
  borderBottom: "1px solid #dcdde0",
  background: "#fafafa",
};
const sectionTitle = {
  margin: 0,
  fontSize: 14.5,
  fontWeight: 900,
  color: "#18181b",
};
const sectionSubtitle = {
  margin: "4px 0 0",
  fontSize: 10.5,
  color: "#77787e",
  lineHeight: 1.4,
};
const emptyChart = {
  height: 250,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#77787e",
  fontSize: 11.5,
};
const tooltipStyle = {
  background: "#18181b",
  border: "1px solid #18181b",
  borderRadius: 0,
  color: "#fff",
  fontSize: 11.5,
};
const methodPanel = { padding: "16px" };
const methodBlock = { padding: "13px 0", borderBottom: "1px solid #ececee" };
const methodRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
};
const methodName = { fontSize: 12.5, color: "#18181b", fontWeight: 800 };
const methodAmount = {
  fontSize: 13.5,
  color: "#18181b",
  fontWeight: 900,
  whiteSpace: "nowrap",
};
const methodMeta = { marginTop: 3, fontSize: 10, color: "#77787e" };
const methodTrack = {
  width: "100%",
  height: 7,
  marginTop: 10,
  background: "#ececee",
  overflow: "hidden",
};
const methodFill = { height: "100%", background: "#18181b", borderRadius: 0 };
const methodShare = { marginTop: 5, fontSize: 9.5, color: "#8b8c91" };
const methodEmpty = {
  minHeight: 250,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#77787e",
  fontSize: 11.5,
};
const tableScroll = { overflowX: "auto" };
const paginationBar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "11px 12px",
  borderTop: "1px solid #ececee",
  background: "#fafafa",
  flexWrap: "wrap",
};
const paginationText = {
  color: "#66666c",
  fontSize: 10.5,
  lineHeight: 1.4,
};
const paginationActions = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};
const paginationButton = {
  minHeight: 36,
  padding: "7px 11px",
  border: "1px solid #cfd0d4",
  borderRadius: 0,
  background: "#fff",
  color: "#18181b",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};
const table = { width: "100%", borderCollapse: "collapse", fontSize: 11.5 };
const th = {
  textAlign: "left",
  padding: "10px 11px",
  background: "#fafafa",
  borderBottom: "1px solid #dcdde0",
  color: "#55565b",
  fontSize: 9.5,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  whiteSpace: "nowrap",
  fontWeight: 800,
};
const tr = { borderBottom: "1px solid #ececee" };
const td = {
  padding: "11px",
  verticalAlign: "top",
  color: "#3f3f46",
  whiteSpace: "nowrap",
};
const mutedText = { marginTop: 3, fontSize: 9.5, color: "#77787e" };
const pendingAllocation = {
  color: "#77787e",
  fontSize: 10.5,
  fontStyle: "italic",
  whiteSpace: "nowrap",
};
const emptyCell = { padding: 30, textAlign: "center", color: "#77787e" };
