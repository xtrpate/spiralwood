import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip as ChartTooltip,
  Legend,
} from "chart.js";
import { Printer } from "lucide-react";
import "./SalesReports.css";

const PAGE_SIZE = 20;

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTooltip,
  Legend,
);

const INITIAL_FILTERS = {
  source: "all",
  payment: "all",
  period: "daily",
  from: "",
  to: "",
};

const REPORT_PERIODS = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "yearly", label: "This Year" },
  { value: "custom", label: "Custom Range" },
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

  if (period === "monthly") {
    return date.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
    });
  }

  return date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
  });
};

const getPhilippineTodayKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const shiftPhilippineDateKey = (dateKey, days) => {
  const [year, month, day] = String(dateKey).split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return dateKey;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

const getNextMonthDateKey = (dateKey) => {
  const [year, month] = String(dateKey).split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return dateKey;
  }

  const nextMonth = new Date(Date.UTC(year, month, 1));

  return nextMonth.toISOString().slice(0, 10);
};

const getNextYearDateKey = (dateKey) => {
  const year = Number(String(dateKey).slice(0, 4));

  if (!Number.isInteger(year)) return dateKey;

  return `${year + 1}-01-01`;
};

const getChartRequest = (filters = {}) => {
  const period = String(filters.period || "daily").toLowerCase();

  /*
   * The report period determines the date range.
   * The chart uses a finer grouping:
   *
   * Daily       -> daily
   * Weekly      -> daily
   * Monthly     -> daily
   * Yearly      -> monthly
   * Custom      -> daily
   */
  const chartPeriod = period === "yearly" ? "monthly" : "daily";

  if (filters.from || filters.to) {
    return {
      period: chartPeriod,
      from: filters.from || undefined,
      to: filters.to || undefined,
    };
  }

  const today = getPhilippineTodayKey();

  if (period === "weekly") {
    const todayDate = new Date(`${today}T00:00:00+08:00`);
    const dayOfWeek = todayDate.getUTCDay();

    // Backend weekly reports start on Monday.
    const mondayOffset = (dayOfWeek + 6) % 7;
    const weekStart = shiftPhilippineDateKey(today, -mondayOffset);

    return {
      period: "daily",
      from: weekStart,
      to: shiftPhilippineDateKey(weekStart, 7),
    };
  }

  if (period === "monthly") {
    const monthStart = `${today.slice(0, 7)}-01`;

    return {
      period: "daily",
      from: monthStart,
      to: getNextMonthDateKey(monthStart),
    };
  }

  if (period === "yearly") {
    const yearStart = `${today.slice(0, 4)}-01-01`;

    return {
      period: "monthly",
      from: yearStart,
      to: getNextYearDateKey(yearStart),
    };
  }

  return {
    period: "daily",
    from: today,
    to: shiftPhilippineDateKey(today, 1),
  };
};

function MetricCard({ label, value, note }) {
  return (
    <div className="cashier-sales-metric-card" style={metricCard}>
      <div className="cashier-sales-metric-label" style={metricLabel}>
        {label}
      </div>
      <div className="cashier-sales-metric-value" style={metricValue}>
        {value}
      </div>
      {note ? (
        <div className="cashier-sales-metric-note" style={metricNote}>
          {note}
        </div>
      ) : null}
    </div>
  );
}

export default function SalesReports() {
  const [data, setData] = useState(null);
  const [chartSummary, setChartSummary] = useState([]);
  const [search, setSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState(() => ({
    ...INITIAL_FILTERS,
  }));
  const [appliedFilters, setAppliedFilters] = useState(null);
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
      period:
        filtersToApply.period === "custom" ? "daily" : filtersToApply.period,
      page: pageToLoad,
      limit: PAGE_SIZE,
    };

    if (filtersToApply.from) params.from = filtersToApply.from;
    if (filtersToApply.to) params.to = filtersToApply.to;

    try {
      const chartRequest = getChartRequest(filtersToApply);

      const chartParams = {
        source: filtersToApply.source,
        payment: filtersToApply.payment,
        period: chartRequest.period,
        page: 1,
        limit: 200,
      };

      if (chartRequest.from) {
        chartParams.from = chartRequest.from;
      }

      if (chartRequest.to) {
        chartParams.to = chartRequest.to;
      }

      const [response, chartResponse] = await Promise.all([
        api.get("/pos/reports", { params }),
        api.get("/pos/reports", { params: chartParams }),
      ]);

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
      setChartSummary(chartResponse.data?.transactions || []);
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
    if (!appliedFilters) return;

    loadReport(appliedFilters, page);

    return () => {
      requestSequenceRef.current += 1;
    };
  }, [appliedFilters, page, loadReport]);

  const hasInvalidRange = Boolean(
    draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to,
  );

  useEffect(() => {
    if (hasInvalidRange) {
      setError("Start date cannot be after end date.");
      return;
    }

    if (
      draftFilters.period === "custom" &&
      (!draftFilters.from || !draftFilters.to)
    ) {
      return;
    }

    setError("");
    setAppliedFilters({ ...draftFilters });
    setPage(1);
  }, [
    draftFilters.source,
    draftFilters.payment,
    draftFilters.period,
    draftFilters.from,
    draftFilters.to,
    hasInvalidRange,
  ]);

  const totals = data?.totals || {};
  const transactions = data?.transactions || [];
  const paymentBreakdown = data?.payment_breakdown || [];
  const products = data?.top_products || [];
  const isCashierReport = data?.report_scope === "cashier";
  const displayFilters =
    appliedFilters || data?.filters_applied || INITIAL_FILTERS;
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

  const chartGrouping =
    String(displayFilters.period || "daily").toLowerCase() === "yearly"
      ? "monthly"
      : "daily";

  const chartData = useMemo(() => {
    const buckets = new Map();

    chartSummary.forEach((row) => {
      const paymentDate = new Date(row.payment_date);

      if (Number.isNaN(paymentDate.getTime())) return;

      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(paymentDate);

      const year = parts.find((part) => part.type === "year")?.value;
      const month = parts.find((part) => part.type === "month")?.value;
      const day = parts.find((part) => part.type === "day")?.value;

      if (!year || !month || !day) return;

      const dateKey = `${year}-${month}-${day}`;

      const bucketKey =
        chartGrouping === "monthly" ? `${year}-${month}-01` : dateKey;

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          period_label: bucketKey,
          online_sales: 0,
          walkin_sales: 0,
          total_sales: 0,
        });
      }

      const bucket = buckets.get(bucketKey);
      const amount = Number(row.amount || 0);
      const orderSource = String(row.type || "").toLowerCase();

      bucket.total_sales += amount;

      if (orderSource === "online") {
        bucket.online_sales += amount;
      } else {
        bucket.walkin_sales += amount;
      }
    });

    return Array.from(buckets.values())
      .sort((a, b) =>
        String(a.period_label).localeCompare(String(b.period_label)),
      )
      .map((row) => ({
        ...row,
        formatted_period: formatPeriodLabel(row.period_label, chartGrouping),
      }));
  }, [chartSummary, chartGrouping]);

  const salesLineData = useMemo(
    () => ({
      labels: chartData.map((row) => row.formatted_period),
      datasets: [
        {
          label: "Online Collections",
          data: chartData.map((row) => row.online_sales),
          borderColor: "#18181b",
          backgroundColor: "transparent",
          fill: false,
          cubicInterpolationMode: "monotone",
          tension: 0.24,
          borderWidth: 2.25,
          borderCapStyle: "round",
          borderJoinStyle: "round",
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 12,
          pointBorderWidth: 2,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#18181b",
        },
        {
          label: "Walk-in Collections",
          data: chartData.map((row) => row.walkin_sales),
          borderColor: "#9ca3af",
          backgroundColor: "transparent",
          borderDash: [6, 5],
          fill: false,
          cubicInterpolationMode: "monotone",
          tension: 0.24,
          borderWidth: 1.75,
          borderCapStyle: "round",
          borderJoinStyle: "round",
          pointRadius: 0,
          pointHoverRadius: 3.5,
          pointHitRadius: 12,
          pointBorderWidth: 2,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#9ca3af",
        },
      ],
    }),
    [chartData],
  );

  const lineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      normalized: true,

      animation: {
        duration: 320,
        easing: "easeOutQuart",
      },

      interaction: {
        mode: "index",
        intersect: false,
        axis: "x",
      },

      layout: {
        padding: {
          top: 2,
          right: 4,
          bottom: 0,
          left: 2,
        },
      },

      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: {
            usePointStyle: true,
            pointStyle: "line",
            boxWidth: 24,
            boxHeight: 8,
            color: "#3f3f46",
            padding: 18,
            font: {
              size: 10.5,
              weight: 500,
            },
          },
        },

        tooltip: {
          backgroundColor: "#ffffff",
          titleColor: "#18181b",
          bodyColor: "#3f3f46",
          borderColor: "#d4d4d8",
          borderWidth: 1,
          cornerRadius: 0,
          padding: 10,
          caretPadding: 8,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          boxPadding: 5,

          titleFont: {
            size: 11,
            weight: 600,
          },

          bodyFont: {
            size: 11,
            weight: 400,
          },

          callbacks: {
            labelColor: (context) => ({
              borderColor: context.dataset.borderColor,
              backgroundColor: context.dataset.borderColor,
            }),

            label: (context) =>
              `${context.dataset.label}: ${money(context.parsed.y || 0)}`,
          },
        },
      },

      scales: {
        x: {
          ticks: {
            color: "#71717a",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: chartGrouping === "monthly" ? 12 : 7,
            padding: 8,
            font: {
              size: 10.5,
              weight: 400,
            },
          },

          grid: {
            display: false,
          },

          border: {
            display: false,
          },
        },

        y: {
          beginAtZero: true,
          grace: "6%",

          ticks: {
            color: "#71717a",
            padding: 8,
            maxTicksLimit: 6,

            callback: (value) => {
              const amount = Number(value || 0);
              const absolute = Math.abs(amount);

              if (absolute >= 1000000) {
                const compact = amount / 1000000;
                const digits = Math.abs(compact) >= 10 ? 0 : 1;

                return `₱${compact.toFixed(digits).replace(/\.0$/, "")}M`;
              }

              if (absolute >= 1000) {
                return `₱${Math.round(amount / 1000)}k`;
              }

              return `₱${Number(amount).toLocaleString("en-PH")}`;
            },

            font: {
              size: 10.5,
              weight: 400,
            },
          },

          grid: {
            color: "rgba(24, 24, 27, 0.065)",
            drawTicks: false,
            lineWidth: 1,
          },

          border: {
            display: false,
          },
        },
      },
    }),
    [chartGrouping],
  );

  const searchQuery = search.trim().toLowerCase();

  const matchesSearch = (...values) => {
    if (!searchQuery) return true;

    return values.some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(searchQuery),
    );
  };

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((row) =>
        matchesSearch(
          formatDateTime(row.payment_date),
          row.receipt_number,
          row.order_number,
          row.order_id,
          row.customer_name,
          row.customer_phone,
          orderTypeLabel(row),
          paymentMethodLabel(row.payment_method),
          row.amount,
          row.order_total,
          row.total_paid_after,
          row.lifetime_collected,
          row.remaining_balance,
          humanize(row.payment_status),
          processedByLabel(row.processed_by),
        ),
      ),
    [transactions, searchQuery],
  );

  const filteredPaymentBreakdown = useMemo(
    () =>
      paymentBreakdown.filter((row) =>
        matchesSearch(
          paymentMethodLabel(row.payment_method),
          row.payment_method,
          row.count,
          row.total_amount,
        ),
      ),
    [paymentBreakdown, searchQuery],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter((row) =>
        matchesSearch(row.product_name, row.qty, row.gross_order_value),
      ),
    [products, searchQuery],
  );

  const paymentMethodTotal = useMemo(
    () =>
      filteredPaymentBreakdown.reduce(
        (sum, row) => sum + Number(row.total_amount || 0),
        0,
      ),
    [filteredPaymentBreakdown],
  );

  return (
    <div
      className="cashier-sales-report-page"
      style={{
        paddingBottom: 40,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      <div className="cashier-sales-header">
        <div>
          <h1 className="cashier-sales-title">My Sales Report</h1>

          <p className="cashier-sales-subtitle">
            Review only the verified payments and orders processed under your
            cashier account.
          </p>
        </div>

        <div className="cashier-sales-header-actions no-print">
          <button
            type="button"
            className="cashier-sales-action"
            onClick={() => window.print()}
            disabled={!data || loading}
            title={
              loading
                ? "Wait for the current report update to finish before printing."
                : undefined
            }
          >
            <Printer size={14} />
            Print
          </button>
        </div>
      </div>

      <div className="cashier-sales-summary-meta">
        <span>
          <strong>Scope:</strong> My Sales Report
        </span>

        <span>
          <strong>Cashier:</strong>{" "}
          {data?.report_owner?.name || "Current Cashier"}
        </span>

        <span>
          <strong>Report:</strong> {sourceFilterLabel(displayFilters.source)}
          {" · "}
          {paymentFilterLabel(displayFilters.payment)}
          {" · "}
          {reportRangeLabel(displayFilters)}
        </span>

        {data?.generated_at ? (
          <span>
            <strong>Generated:</strong> {formatDateTime(data.generated_at)}
          </span>
        ) : null}
      </div>

      <div className="cashier-sales-filter-card no-print">
        <div className="cashier-sales-filter-grid">
          <label
            className="cashier-sales-search-field"
            htmlFor="sales-report-search"
            style={{
              ...fieldWrap,
              flex: "1 1 320px",
              minWidth: 320,
            }}
          >
            <span
              style={{
                ...fieldLabel,
              }}
            >
              Search Records
            </span>

            <input
              id="sales-report-search"
              name="sales_report_search"
              type="search"
              className="cashier-sales-input"
              style={{
                ...input,
                width: "100%",
                boxSizing: "border-box",
              }}
              maxLength={100}
              value={search}
              placeholder="Search orders, customers, payments..."
              aria-label="Search sales report records"
              onChange={(event) => {
                setSearch(event.target.value.slice(0, 100));
              }}
            />
          </label>

          <FilterField label="Order Source" htmlFor="sales-report-source">
            <select
              id="sales-report-source"
              name="sales_report_source"
              className="cashier-sales-input"
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

          <FilterField label="Payment Type" htmlFor="sales-report-payment-type">
            <select
              id="sales-report-payment-type"
              name="sales_report_payment_type"
              className="cashier-sales-input"
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

          <FilterField label="Report Period" htmlFor="sales-report-period">
            <select
              id="sales-report-period"
              name="sales_report_period"
              className="cashier-sales-input"
              value={draftFilters.period}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  period: event.target.value,
                  ...(event.target.value !== "custom"
                    ? { from: "", to: "" }
                    : {}),
                }))
              }
            >
              {REPORT_PERIODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </FilterField>

          {draftFilters.period === "custom" ? (
            <>
              <FilterField label="From Date" htmlFor="sales-report-from-date">
                <input
                  id="sales-report-from-date"
                  name="sales_report_from_date"
                  className="cashier-sales-input"
                  type="date"
                  value={draftFilters.from}
                  max={draftFilters.to || undefined}
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
                  className="cashier-sales-input"
                  type="date"
                  min={draftFilters.from || undefined}
                  value={draftFilters.to}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                />
              </FilterField>
            </>
          ) : null}
        </div>
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}
      {data ? (
        <div className="cashier-sales-report-meta" style={reportMeta}>
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
          <div className="cashier-sales-metric-grid" style={metricGrid}>
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

          <div className="cashier-sales-chart-grid" style={chartGrid}>
            <section className="cashier-sales-card" style={card}>
              <SectionHeader
                title="Collection Trend"
                subtitle="Verified online and walk-in payments for the selected period."
              />

              <div
                className="cashier-sales-chart-body"
                style={{
                  padding: "18px 18px 14px",
                  minHeight: 300,
                }}
              >
                {chartData.length === 0 ? (
                  <div style={emptyChart}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#18181b",
                        marginBottom: 4,
                      }}
                    >
                      No verified collections
                    </div>

                    <div>
                      No verified payments were recorded in the selected period.
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: 280,
                    }}
                  >
                    <Line data={salesLineData} options={lineOptions} />
                  </div>
                )}
              </div>
            </section>

            <section className="cashier-sales-card" style={card}>
              <SectionHeader
                title="Payment Methods"
                subtitle="Verified payments grouped by payment method"
              />
              <div className="cashier-sales-method-panel" style={methodPanel}>
                {filteredPaymentBreakdown.length === 0 ? (
                  <div style={methodEmpty}>No verified payment data.</div>
                ) : (
                  filteredPaymentBreakdown.map((row) => {
                    const amount = Number(row.total_amount || 0);
                    const share =
                      paymentMethodTotal > 0
                        ? (amount / paymentMethodTotal) * 100
                        : 0;

                    return (
                      <div
                        key={row.payment_method}
                        className="cashier-sales-method-block"
                        style={methodBlock}
                      >
                        <div
                          className="cashier-sales-method-row"
                          style={methodRow}
                        >
                          <div>
                            <strong style={methodName}>
                              {paymentMethodLabel(row.payment_method)}
                            </strong>
                            <div style={methodMeta}>
                              {row.count} verified payment
                              {Number(row.count || 0) === 1 ? "" : "s"}
                            </div>
                          </div>
                          <strong
                            className="cashier-sales-method-amount"
                            style={methodAmount}
                          >
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

          <section className="cashier-sales-card" style={card}>
            <SectionHeader
              title="Payment Transactions"
              subtitle={
                isCashierReport
                  ? "Verified payments processed under your cashier account during the selected period."
                  : "Verified payments recorded during the selected period."
              }
            />
            <div className="cashier-sales-desktop-table" style={tableScroll}>
              <table className="cashier-sales-table" style={table}>
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
                      text={
                        searchQuery
                          ? "No payment transactions match your search."
                          : "No verified payment transactions for this period."
                      }
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
            <div
              className="cashier-sales-mobile-transaction-list"
              aria-label="Payment transactions"
            >
              {transactions.length === 0 ? (
                <div className="cashier-sales-mobile-empty">
                  No verified payment transactions for this period.
                </div>
              ) : (
                transactions.map((row) => (
                  <article
                    key={"mobile-" + row.payment_transaction_id}
                    className="cashier-sales-mobile-transaction-card"
                  >
                    <div className="cashier-sales-mobile-transaction-header">
                      <div className="cashier-sales-mobile-transaction-heading">
                        <strong>
                          {row.order_number || "#" + row.order_id}
                        </strong>
                        <span>{formatDateTime(row.payment_date)}</span>
                      </div>
                      <div className="cashier-sales-mobile-transaction-summary">
                        <span className="cashier-sales-mobile-summary-label">
                          Amount Paid
                        </span>
                        <strong>{money(row.amount)}</strong>
                      </div>
                    </div>

                    <div className="cashier-sales-mobile-customer">
                      <strong>{row.customer_name || "—"}</strong>
                      {row.customer_phone ? (
                        <span>{row.customer_phone}</span>
                      ) : null}
                    </div>

                    <dl className="cashier-sales-mobile-details">
                      <div>
                        <dt>Receipt</dt>
                        <dd>{row.receipt_number || "—"}</dd>
                      </div>
                      <div>
                        <dt>Order Type</dt>
                        <dd>{orderTypeLabel(row)}</dd>
                      </div>
                      <div>
                        <dt>Payment Method</dt>
                        <dd>{paymentMethodLabel(row.payment_method)}</dd>
                      </div>
                      <div>
                        <dt>Order Total</dt>
                        <dd>{money(row.order_total)}</dd>
                      </div>
                      <div>
                        <dt>Paid After Payment</dt>
                        <dd>
                          {money(
                            row.total_paid_after ?? row.lifetime_collected,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Balance After Payment</dt>
                        <dd>{money(row.remaining_balance)}</dd>
                      </div>
                      <div>
                        <dt>Status After Payment</dt>
                        <dd>{humanize(row.payment_status)}</dd>
                      </div>
                      <div>
                        <dt>Processed By</dt>
                        <dd>{processedByLabel(row.processed_by)}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              )}
            </div>
            {totalTransactions > 0 ? (
              <div className="cashier-sales-pagination" style={paginationBar}>
                <div
                  className="cashier-sales-pagination-text"
                  style={paginationText}
                >
                  Showing {pageStart}–{pageEnd} of {totalTransactions}{" "}
                  transactions
                  {" · Page "}
                  {currentPage} of {totalPages}
                </div>
                <div
                  className="cashier-sales-pagination-actions"
                  style={paginationActions}
                >
                  <button
                    type="button"
                    className="cashier-sales-pagination-button"
                    style={paginationButton}
                    disabled={loading || currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="cashier-sales-pagination-button"
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

          <section className="cashier-sales-card" style={card}>
            <SectionHeader
              title="Top Products by Included Order Value"
              subtitle="Top 20 item values from orders tied to the selected verified-payment scope. Custom furniture may be priced as one complete project instead of per item."
            />
            <div className="cashier-sales-desktop-table" style={tableScroll}>
              <table className="cashier-sales-table" style={table}>
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
                    <tr>
                      <td colSpan={3} style={emptyCell}>
                        {searchQuery
                          ? "No products match your search."
                          : "No product sales data for this period."}
                      </td>
                    </tr>
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
            <div
              className="cashier-sales-mobile-product-list"
              aria-label="Top products by included order value"
            >
              {filteredProducts.length === 0 ? (
                <div className="cashier-sales-mobile-empty">
                  No product sales data for this period.
                </div>
              ) : (
                filteredProducts.map((row, index) => {
                  const hasOrderValue =
                    Math.abs(Number(row.gross_order_value || 0)) > 0.009;

                  return (
                    <article
                      key={"mobile-product-" + row.product_name + "-" + index}
                      className="cashier-sales-mobile-product-card"
                    >
                      <strong className="cashier-sales-mobile-product-name">
                        {row.product_name || "—"}
                      </strong>
                      <div className="cashier-sales-mobile-product-meta">
                        <div>
                          <span>Units</span>
                          <strong>
                            {Number(row.qty || 0).toLocaleString("en-PH")}
                          </strong>
                        </div>
                        <div>
                          <span>Included Order Value</span>
                          <strong>
                            {hasOrderValue
                              ? money(row.gross_order_value)
                              : "Not separately priced"}
                          </strong>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </>
      ) : null}

      {data ? (
        <div className="cashier-sales-print-report" aria-hidden="true">
          <header className="cashier-sales-print-header">
            <h1>SPIRAL WOOD SERVICES</h1>
            <h2>{isCashierReport ? "CASHIER SALES REPORT" : "SALES REPORT"}</h2>

            <div className="cashier-sales-print-meta-grid">
              {isCashierReport ? (
                <div>
                  <span>Cashier</span>
                  <strong>
                    {data?.report_owner?.name || "Current cashier"}
                  </strong>
                </div>
              ) : (
                <div>
                  <span>Scope</span>
                  <strong>Authorized report scope</strong>
                </div>
              )}
              <div>
                <span>Order Source</span>
                <strong>{sourceFilterLabel(displayFilters.source)}</strong>
              </div>
              <div>
                <span>Payment Type</span>
                <strong>{paymentFilterLabel(displayFilters.payment)}</strong>
              </div>
              <div>
                <span>Report Range</span>
                <strong>{reportRangeLabel(displayFilters)}</strong>
              </div>
              <div>
                <span>Grouping</span>
                <strong>{humanize(displayFilters.period)}</strong>
              </div>
              <div>
                <span>Generated</span>
                <strong>{formatDateTime(data.generated_at)}</strong>
              </div>
            </div>

            <p className="cashier-sales-print-scope-note">
              {isCashierReport
                ? "Only verified payments processed under this cashier account are included. Blueprint down payments and remaining balances remain separate payment transactions."
                : "Only verified payments in the applied report scope are included. Blueprint down payments and remaining balances remain separate payment transactions."}
            </p>
          </header>

          <section className="cashier-sales-print-section cashier-sales-print-summary-section">
            <h3>1. Report Summary</h3>
            <div className="cashier-sales-print-summary-grid">
              <div>
                <span>Order Value</span>
                <strong>{money(totals.gross_order_value)}</strong>
              </div>
              <div>
                <span>Collected Payments</span>
                <strong>{money(totals.actual_collected)}</strong>
              </div>
              <div>
                <span>Current Remaining Balance</span>
                <strong>{money(totals.outstanding_balance)}</strong>
              </div>
              <div>
                <span>Orders Included</span>
                <strong>{totals.total_orders || 0}</strong>
              </div>
              <div>
                <span>Verified Payments</span>
                <strong>{totals.collection_count || 0}</strong>
              </div>
            </div>
            <p className="cashier-sales-print-footnote">
              Current Remaining Balance is the current unpaid balance of
              included orders when this report was generated. It is not the
              historical balance at the end of the selected report period.
            </p>
          </section>

          <section className="cashier-sales-print-section cashier-sales-print-method-section">
            <h3>2. Payment Methods</h3>
            <table className="cashier-sales-print-table">
              <thead>
                <tr>
                  <th>Payment Method</th>
                  <th>Verified Payments</th>
                  <th>Collected Amount</th>
                  <th>Share of Collections</th>
                </tr>
              </thead>
              <tbody>
                {paymentBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No verified payment data.</td>
                  </tr>
                ) : (
                  filteredPaymentBreakdown.map((row) => {
                    const amount = Number(row.total_amount || 0);
                    const share =
                      paymentMethodTotal > 0
                        ? (amount / paymentMethodTotal) * 100
                        : 0;

                    return (
                      <tr key={"print-method-" + row.payment_method}>
                        <td>{paymentMethodLabel(row.payment_method)}</td>
                        <td>{row.count || 0}</td>
                        <td>{money(row.total_amount)}</td>
                        <td>{share.toFixed(1)}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>

          <section className="cashier-sales-print-section cashier-sales-print-transactions-section">
            <h3>3. Payment Transactions</h3>
            <div className="cashier-sales-print-transaction-scope">
              <strong>
                Showing {pageStart}-{pageEnd} of {totalTransactions}{" "}
                transactions
                {" - Page "}
                {currentPage} of {totalPages}
              </strong>
              <span>
                Summary figures and payment-method totals cover the complete
                applied report scope. Transaction details below contain the
                current page only.
              </span>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="cashier-sales-print-empty">
                No verified payment transactions for this period.
              </div>
            ) : (
              <div className="cashier-sales-print-transaction-list">
                {filteredTransactions.map((row) => (
                  <article
                    key={"print-" + row.payment_transaction_id}
                    className="cashier-sales-print-transaction"
                  >
                    <div className="cashier-sales-print-transaction-grid cashier-sales-print-transaction-primary">
                      <div className="cashier-sales-print-field">
                        <span>Date</span>
                        <strong>{formatDateTime(row.payment_date)}</strong>
                      </div>
                      <div className="cashier-sales-print-field">
                        <span>Receipt</span>
                        <strong>{row.receipt_number || "—"}</strong>
                      </div>
                      <div className="cashier-sales-print-field">
                        <span>Order</span>
                        <strong>
                          {row.order_number || "#" + row.order_id}
                        </strong>
                      </div>
                      <div className="cashier-sales-print-field">
                        <span>Customer</span>
                        <strong>{row.customer_name || "—"}</strong>
                      </div>
                    </div>

                    <div className="cashier-sales-print-transaction-grid">
                      <div className="cashier-sales-print-field">
                        <span>Order Type</span>
                        <strong>{orderTypeLabel(row)}</strong>
                      </div>
                      <div className="cashier-sales-print-field">
                        <span>Payment Method</span>
                        <strong>
                          {paymentMethodLabel(row.payment_method)}
                        </strong>
                      </div>
                      <div className="cashier-sales-print-field">
                        <span>Processed By</span>
                        <strong>{processedByLabel(row.processed_by)}</strong>
                      </div>
                      <div className="cashier-sales-print-field cashier-sales-print-amount-field">
                        <span>Amount Paid</span>
                        <strong>{money(row.amount)}</strong>
                      </div>
                    </div>

                    <div className="cashier-sales-print-transaction-grid cashier-sales-print-financial-grid">
                      <div className="cashier-sales-print-field">
                        <span>Order Total</span>
                        <strong>{money(row.order_total)}</strong>
                      </div>
                      <div className="cashier-sales-print-field">
                        <span>Paid After Payment</span>
                        <strong>
                          {money(
                            row.total_paid_after ?? row.lifetime_collected,
                          )}
                        </strong>
                      </div>
                      <div className="cashier-sales-print-field">
                        <span>Balance After Payment</span>
                        <strong>{money(row.remaining_balance)}</strong>
                      </div>
                      <div className="cashier-sales-print-field">
                        <span>Status After Payment</span>
                        <strong>{humanize(row.payment_status)}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="cashier-sales-print-section cashier-sales-print-products-section">
            <h3>4. Top Products by Included Order Value</h3>
            <p className="cashier-sales-print-section-note">
              Top 20 item values from orders tied to the selected
              verified-payment scope. Custom furniture may be priced as one
              complete project instead of per item.
            </p>
            <table className="cashier-sales-print-table cashier-sales-print-products-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Units</th>
                  <th>Included Order Value</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No product sales data for this period.</td>
                  </tr>
                ) : (
                  products.map((row, index) => {
                    const hasOrderValue =
                      Math.abs(Number(row.gross_order_value || 0)) > 0.009;

                    return (
                      <tr
                        key={"print-product-" + row.product_name + "-" + index}
                      >
                        <td>{row.product_name || "—"}</td>
                        <td>{Number(row.qty || 0).toLocaleString("en-PH")}</td>
                        <td>
                          {hasOrderValue
                            ? money(row.gross_order_value)
                            : "Not separately priced"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>

          <footer className="cashier-sales-print-footer">
            Internal report - Spiral Wood Services - Printed from the current
            report view
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function FilterField({ label, htmlFor, children }) {
  return (
    <label className="cashier-sales-filter-field" htmlFor={htmlFor}>
      <span className="cashier-sales-filter-label">{label}</span>
      {children}
    </label>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="cashier-sales-section-header">
      <div>
        <h2 className="cashier-sales-section-title">{title}</h2>
        {subtitle ? (
          <p className="cashier-sales-section-subtitle">{subtitle}</p>
        ) : null}
      </div>
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
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 16,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
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
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, .85fr)",
  gap: 14,
  marginBottom: 14,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
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
