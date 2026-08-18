import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import api from "../../services/api";
import { useNavigate } from "react-router-dom";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Title,
  Tooltip,
  Legend,
);

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "last7", label: "Last 7 Days" },
  { key: "month", label: "This Month" },
  { key: "last30", label: "Last 30 Days" },
  { key: "year", label: "This Year" },
  { key: "last12m", label: "Last 12 Months" },
  { key: "custom", label: "Custom Range" },
];

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const num = new Intl.NumberFormat("en-PH");

function formatChartLabel(value, chartMode) {
  if (!value) return "—";

  if (chartMode === "monthly") {
    const [year, month] = String(value).split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString("en-PH", {
      month: "short",
      year: "numeric",
    });
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value) {
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
}

function parseDashboardDate(value) {
  if (!value) return null;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDashboardDateRange(fromValue, toValue) {
  const start = parseDashboardDate(fromValue);
  const end = parseDashboardDate(toValue);

  if (!start || !end) return "";

  const sameYear = start.getFullYear() === end.getFullYear();

  const startLabel = start.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });

  const endLabel = end.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return `${startLabel} - ${endLabel}`;
}

function truncate(text, max = 28) {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function getPercent(value, total) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, (Number(value || 0) / Number(total)) * 100));
}

function MetricCard({ title, value, meta, tone = "neutral", onClick }) {
  const className = [
    "metric-card",
    `metric-card--${tone}`,
    onClick ? "metric-card--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div className="metric-card__title">{title}</div>
      <div className="metric-card__value">{value}</div>
      {meta ? <div className="metric-card__meta">{meta}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function MiniStat({ label, value }) {
  return (
    <div className="mini-stat">
      <div className="mini-stat__label">{label}</div>
      <div className="mini-stat__value">{value}</div>
    </div>
  );
}

function ProgressRow({ label, value, total, color = "#18181b" }) {
  const percent = getPercent(value, total);

  return (
    <div className="progress-row">
      <div className="progress-row__top">
        <span>{label}</span>
        <strong>{num.format(Number(value || 0))}</strong>
      </div>

      <div className="progress-row__track">
        <div
          className="progress-row__fill"
          style={{
            width: `${percent}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = String(status || "unknown")
    .trim()
    .toLowerCase();

  const meta = {
    paid: ["#f0fdf4", "#15803d", "#bbf7d0"],
    completed: ["#f0fdf4", "#15803d", "#bbf7d0"],
    delivered: ["#f0fdf4", "#15803d", "#bbf7d0"],
    pending: ["#fffbeb", "#a16207", "#fde68a"],
    unpaid: ["#fffbeb", "#a16207", "#fde68a"],
    partial: ["#eff6ff", "#1d4ed8", "#bfdbfe"],
    confirmed: ["#eff6ff", "#1d4ed8", "#bfdbfe"],
    contract_released: ["#eff6ff", "#1d4ed8", "#bfdbfe"],
    production: ["#f5f3ff", "#6d28d9", "#ddd6fe"],
    shipping: ["#fff7ed", "#c2410c", "#fed7aa"],
    cancelled: ["#fef2f2", "#b91c1c", "#fecaca"],
  }[normalized] || ["#f4f4f5", "#52525b", "#e4e4e7"];

  const label = normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <span
      className="dash-badge"
      style={{
        background: meta[0],
        color: meta[1],
        borderColor: meta[2],
      }}
    >
      {label}
    </span>
  );
}

function ChannelBadge({ channel }) {
  return (
    <span
      className="dash-badge"
      style={{
        background: "#f4f4f5",
        color: "#18181b",
        borderColor: "#e4e4e7",
      }}
    >
      {channel || "—"}
    </span>
  );
}

function TypeBadge({ type }) {
  return (
    <span
      className="dash-badge"
      style={{
        background: type === "blueprint" ? "#18181b" : "#f4f4f5",
        color: type === "blueprint" ? "#ffffff" : "#18181b",
        borderColor: type === "blueprint" ? "#18181b" : "#e4e4e7",
      }}
    >
      {type || "standard"}
    </span>
  );
}

export default function DashboardPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [preset, setPreset] = useState("last30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const loadDashboard = useCallback(
    async ({
      presetArg = "last30",
      fromArg = "",
      toArg = "",
      silent = false,
    } = {}) => {
      try {
        setFetchError("");

        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const params =
          presetArg === "custom"
            ? { from: fromArg, to: toArg }
            : { preset: presetArg };

        const res = await api.get("/dashboard", { params });
        setData(res.data);
      } catch (err) {
        const message =
          err.response?.data?.message ||
          "Failed to load dashboard. Check your server connection.";
        setFetchError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadDashboard({ presetArg: "last30" });
  }, [loadDashboard]);

  const handlePresetChange = (key) => {
    setPreset(key);
    setFetchError("");
    setRangeError("");

    if (key !== "custom") {
      setFrom("");
      setTo("");
      loadDashboard({
        presetArg: key,
        fromArg: "",
        toArg: "",
        silent: true,
      });
    }
  };

  const handleApplyCustom = () => {
    if (!from || !to) {
      setRangeError("Please select both start and end dates.");
      return;
    }

    if (from > to) {
      setRangeError("Start date must be before end date.");
      return;
    }

    setRangeError("");
    setPreset("custom");

    loadDashboard({
      presetArg: "custom",
      fromArg: from,
      toArg: to,
      silent: true,
    });
  };

  const handleRefresh = () => {
    loadDashboard({
      presetArg: preset,
      fromArg: from,
      toArg: to,
      silent: true,
    });
  };

  const activeLabel =
    PRESETS.find((item) => item.key === preset)?.label || "Custom Range";

  const inventory = data?.inventory || {};
  const orders = data?.orders || {};
  const currentOps = data?.currentOps || {};
  const sales = data?.sales || {};
  const payments = data?.payments || {};
  const blueprint = data?.blueprint || {};
  const salesChart = Array.isArray(data?.salesChart) ? data.salesChart : [];
  const topProducts = Array.isArray(data?.topProducts) ? data.topProducts : [];
  const recentOrders = Array.isArray(data?.recentOrders)
    ? data.recentOrders
    : [];
  const dateRange = data?.dateRange || null;
  const chartMode = data?.chartMode || "daily";
  const dashboardFontFamily = useMemo(() => {
    if (typeof window === "undefined") return "sans-serif";
    return window.getComputedStyle(document.body).fontFamily || "sans-serif";
  }, []);

  const totalOrders = Number(orders.total_orders || 0);
  const periodCompleted = Number(orders.completed_orders || 0);
  const periodPending = Number(orders.pending_orders || 0);

  const currentTotalOrders = Number(currentOps.total_orders || 0);
  const currentPending = Number(currentOps.pending_orders || 0);
  const currentConfirmed = Number(currentOps.confirmed_orders || 0);
  const currentProduction = Number(currentOps.production_orders || 0);
  const currentShipping = Number(currentOps.shipping_orders || 0);
  const currentDelivered = Number(currentOps.delivered_orders || 0);
  const currentCompleted = Number(currentOps.completed_orders || 0);
  const currentCancelled = Number(currentOps.cancelled_orders || 0);
  const currentOpenOrders = Number(currentOps.open_orders || 0);
  const deliveredUnpaid = Number(currentOps.delivered_unpaid_orders || 0);

  const onlineOrders = Number(sales.online_orders || 0);
  const walkinOrders = Number(sales.walkin_orders || 0);
  const totalChannelOrders = onlineOrders + walkinOrders;

  const lowStockTotal =
    Number(inventory.low_stock_count || 0) +
    Number(inventory.raw_low_stock || 0);

  const outOfStockTotal =
    Number(inventory.out_of_stock_count || 0) +
    Number(inventory.raw_out_of_stock || 0);

  const stockAlerts = Number(inventory.alert_total || 0);
  const pendingReviews = Number(payments.pending_reviews || 0);

  const activeBlueprintJobs =
    Number(blueprint.contract_released || 0) +
    Number(blueprint.in_production || 0) +
    Number(blueprint.ready_for_dispatch || 0);

  const chartLabels = useMemo(
    () => salesChart.map((row) => formatChartLabel(row.date, chartMode)),
    [salesChart, chartMode],
  );

  const salesLineData = useMemo(
    () => ({
      labels: chartLabels,
      datasets: [
        {
          label: "Online Sales",
          data: salesChart.map((row) => Number(row.online_sales || 0)),
          borderColor: "#18181b",
          backgroundColor: (context) => {
            const { chart } = context;
            const { ctx, chartArea } = chart;

            if (!chartArea) {
              return "rgba(24, 24, 27, 0.08)";
            }

            const gradient = ctx.createLinearGradient(
              0,
              chartArea.top,
              0,
              chartArea.bottom,
            );
            gradient.addColorStop(0, "rgba(24, 24, 27, 0.15)");
            gradient.addColorStop(0.55, "rgba(24, 24, 27, 0.055)");
            gradient.addColorStop(1, "rgba(24, 24, 27, 0.006)");
            return gradient;
          },
          fill: "origin",
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
          label: "Walk-in Sales",
          data: salesChart.map((row) => Number(row.walkin_sales || 0)),
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
    [salesChart, chartLabels],
  );

  const topProductsData = useMemo(
    () => ({
      labels: topProducts
        .slice(0, 5)
        .map((item) => truncate(item.product_name, 31)),
      datasets: [
        {
          label: "Units Sold",
          data: topProducts
            .slice(0, 5)
            .map((item) => Number(item.units_sold || 0)),
          backgroundColor: "#18181b",
          borderRadius: 0,
          borderSkipped: false,
          barThickness: 12,
        },
      ],
    }),
    [topProducts],
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
            font: {
              size: 10.5,
              weight: 500,
              family: dashboardFontFamily,
            },
            padding: 18,
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
            family: dashboardFontFamily,
          },
          bodyFont: {
            size: 11,
            weight: 400,
            family: dashboardFontFamily,
          },
          callbacks: {
            labelColor: (context) => ({
              borderColor: context.dataset.borderColor,
              backgroundColor: context.dataset.borderColor,
            }),
            label: (context) =>
              `${context.dataset.label}: ${peso.format(context.parsed.y || 0)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#71717a",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: chartMode === "monthly" ? 12 : 7,
            padding: 8,
            font: {
              size: 10.5,
              weight: 400,
              family: dashboardFontFamily,
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

              return `₱${num.format(amount)}`;
            },
            font: {
              size: 10.5,
              weight: 400,
              family: dashboardFontFamily,
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
    [chartMode, dashboardFontFamily],
  );

  const barOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#18181b",
          padding: 10,
          titleFont: { size: 11, weight: 700, family: dashboardFontFamily },
          bodyFont: { size: 11, family: dashboardFontFamily },
          callbacks: {
            title: (items) => {
              const index = items?.[0]?.dataIndex;
              return (
                topProducts[index]?.product_name || items?.[0]?.label || ""
              );
            },
            label: (ctx) => ` ${num.format(ctx.parsed.x || 0)} units`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: "#71717a",
            precision: 0,
            font: { size: 11, family: dashboardFontFamily },
          },
          grid: {
            color: "#f4f4f5",
          },
          border: { display: false },
        },
        y: {
          ticks: {
            color: "#18181b",
            padding: 7,
            font: { size: 10.5, weight: 500, family: dashboardFontFamily },
          },
          grid: { display: false },
          border: { display: false },
        },
      },
    }),
    [dashboardFontFamily, topProducts],
  );

  if (loading && !data) {
    return (
      <div className="dash-loading-wrap">
        <style>{dashboardCss}</style>
        <div className="dash-spinner" />
        <div className="dash-loading-text">Loading dashboard...</div>
      </div>
    );
  }

  if (!data && fetchError) {
    return (
      <div className="dash-error-page">
        <style>{dashboardCss}</style>
        <div className="dash-error-card">
          <div className="dash-error-title">Dashboard Error</div>
          <div className="dash-error-message">{fetchError}</div>
          <button
            className="dash-btn dash-btn-primary"
            onClick={() =>
              loadDashboard({ presetArg: preset, fromArg: from, toArg: to })
            }
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-shell">
      <style>{dashboardCss}</style>

      <section className="dash-page-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">
            Overview of sales, orders, inventory, and production activity.
          </p>
        </div>

        <button
          className="dash-btn dash-btn-secondary"
          onClick={handleRefresh}
          disabled={refreshing}
          type="button"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </section>

      <section className="dash-toolbar">
        <div className="dash-field dash-field--period">
          <label htmlFor="dash-period">Period</label>
          <select
            id="dash-period"
            value={preset}
            onChange={(event) => handlePresetChange(event.target.value)}
          >
            {PRESETS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {preset === "custom" ? (
          <>
            <div className="dash-field">
              <label htmlFor="dash-from">From</label>
              <input
                id="dash-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>

            <div className="dash-field">
              <label htmlFor="dash-to">To</label>
              <input
                id="dash-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>

            <button
              className="dash-btn dash-btn-primary dash-apply-button"
              onClick={handleApplyCustom}
              type="button"
            >
              Apply
            </button>
          </>
        ) : null}

        <div className="dash-period-summary">
          <span>{activeLabel}</span>
          {dateRange?.from && dateRange?.to ? (
            <small>
              {formatDashboardDateRange(dateRange.from, dateRange.to)}
            </small>
          ) : null}
        </div>
      </section>

      {rangeError ? (
        <div className="dash-inline-error">{rangeError}</div>
      ) : null}

      {fetchError ? (
        <div className="dash-inline-alert">
          <strong>Dashboard could not refresh.</strong> {fetchError}
        </div>
      ) : null}

      <section className="metric-grid metric-grid--five">
        <MetricCard
          title="Sales"
          value={peso.format(Number(sales.total_revenue || 0))}
          meta={`Profit ${peso.format(Number(sales.total_profit || 0))}`}
          onClick={() => navigate("/admin/sales")}
        />

        <MetricCard
          title="Orders"
          value={num.format(totalOrders)}
          meta={`${num.format(periodCompleted)} completed`}
          onClick={() => navigate("/admin/orders")}
        />

        <MetricCard
          title="Open orders"
          value={num.format(currentOpenOrders)}
          meta={`${num.format(currentPending)} pending`}
          onClick={() => navigate("/admin/orders")}
        />

        <MetricCard
          title="Payment reviews"
          value={num.format(pendingReviews)}
          meta={`${num.format(deliveredUnpaid)} delivered unpaid`}
          tone={
            pendingReviews > 0 || deliveredUnpaid > 0 ? "warning" : "neutral"
          }
          onClick={() => navigate("/admin/orders")}
        />

        <MetricCard
          title="Inventory alerts"
          value={num.format(stockAlerts)}
          meta={
            <>
              <span>{num.format(lowStockTotal)} low stock</span>
              <span className="metric-card__separator">•</span>
              <span>{num.format(outOfStockTotal)} out of stock</span>
            </>
          }
          tone={
            outOfStockTotal > 0
              ? "danger"
              : lowStockTotal > 0
                ? "warning"
                : "neutral"
          }
          onClick={() => navigate("/admin/inventory/build")}
        />
      </section>

      <section className="dashboard-grid dashboard-grid--main">
        <div className="dash-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Sales trend</h2>
              <p className="card-description">
                Online and walk-in sales for the selected period.
              </p>
            </div>

            <button
              type="button"
              className="dash-link-button"
              onClick={() => navigate("/admin/sales")}
            >
              View sales report
            </button>
          </div>

          <div className="dash-chart-area dash-chart-area--sales">
            {salesChart.length === 0 ? (
              <div className="dash-empty-state">
                <div className="dash-empty-title">No sales recorded</div>
                <div className="dash-empty-text">
                  No sales were recorded in the selected period.
                </div>
              </div>
            ) : (
              <Line data={salesLineData} options={lineOptions} />
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Order status</h2>
              <p className="card-description">
                Orders created in the selected period.
              </p>
            </div>

            <button
              type="button"
              className="dash-link-button"
              onClick={() => navigate("/admin/orders")}
            >
              View orders
            </button>
          </div>

          <div className="progress-list progress-list--orders">
            <ProgressRow
              label="Pending"
              value={currentPending}
              total={currentTotalOrders}
              color="#d97706"
            />
            <ProgressRow
              label="Confirmed"
              value={currentConfirmed}
              total={currentTotalOrders}
              color="#2563eb"
            />
            <ProgressRow
              label="In production"
              value={currentProduction}
              total={currentTotalOrders}
              color="#7c3aed"
            />
            <ProgressRow
              label="Shipping"
              value={currentShipping}
              total={currentTotalOrders}
              color="#ea580c"
            />
            <ProgressRow
              label="Delivered"
              value={currentDelivered}
              total={currentTotalOrders}
              color="#16a34a"
            />
            <ProgressRow
              label="Completed"
              value={currentCompleted}
              total={currentTotalOrders}
              color="#15803d"
            />
            <ProgressRow
              label="Cancelled"
              value={currentCancelled}
              total={currentTotalOrders}
              color="#dc2626"
            />
          </div>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid--triple">
        <div className="dash-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Inventory attention</h2>
              <p className="card-description">
                Current stock issues that need review.
              </p>
            </div>
          </div>

          <div className="inventory-attention">
            <div className="inventory-attention__row">
              <div>
                <strong>Finished products</strong>
                <span>Ready-made inventory</span>
              </div>
              <div className="inventory-attention__counts">
                <span className="stock-count stock-count--low">
                  Low {num.format(Number(inventory.low_stock_count || 0))}
                </span>
                <span className="stock-count stock-count--out">
                  Out {num.format(Number(inventory.out_of_stock_count || 0))}
                </span>
              </div>
            </div>

            <div className="inventory-attention__row">
              <div>
                <strong>Raw materials</strong>
                <span>Production inventory</span>
              </div>
              <div className="inventory-attention__counts">
                <span className="stock-count stock-count--low">
                  Low {num.format(Number(inventory.raw_low_stock || 0))}
                </span>
                <span className="stock-count stock-count--out">
                  Out {num.format(Number(inventory.raw_out_of_stock || 0))}
                </span>
              </div>
            </div>

            <div className="card-button-row">
              <button
                type="button"
                className="dash-btn dash-btn-secondary"
                onClick={() => navigate("/admin/products")}
              >
                Products
              </button>
              <button
                type="button"
                className="dash-btn dash-btn-secondary"
                onClick={() => navigate("/admin/inventory/raw")}
              >
                Raw materials
              </button>
            </div>
          </div>
        </div>

        <div className="dash-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Custom orders</h2>
              <p className="card-description">
                Blueprint orders moving through approval and production.
              </p>
            </div>

            <button
              type="button"
              className="dash-link-button"
              onClick={() => navigate("/admin/blueprints")}
            >
              View blueprints
            </button>
          </div>

          <div className="compact-summary">
            <div>
              <span>Total orders</span>
              <strong>
                {num.format(Number(blueprint.total_blueprint_orders || 0))}
              </strong>
            </div>
            <div>
              <span>Active jobs</span>
              <strong>{num.format(activeBlueprintJobs)}</strong>
            </div>
          </div>

          <div className="progress-list progress-list--compact">
            <ProgressRow
              label="Pending review"
              value={Number(blueprint.pending_custom_review || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              color="#d97706"
            />
            <ProgressRow
              label="Confirmed"
              value={Number(blueprint.quotation_approved || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              color="#2563eb"
            />
            <ProgressRow
              label="Contract released"
              value={Number(blueprint.contract_released || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              color="#7c3aed"
            />
            <ProgressRow
              label="In production"
              value={Number(blueprint.in_production || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              color="#6d28d9"
            />
            <ProgressRow
              label="Ready for dispatch"
              value={Number(blueprint.ready_for_dispatch || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              color="#ea580c"
            />
            <ProgressRow
              label="Completed"
              value={Number(blueprint.completed_blueprint_orders || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              color="#15803d"
            />
          </div>
        </div>

        <div className="dash-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Top products</h2>
              <p className="card-description">
                Best-selling products by units sold.
              </p>
            </div>
          </div>

          <div className="dash-chart-area dash-chart-area--products">
            {topProducts.length === 0 ? (
              <div className="dash-empty-state">
                <div className="dash-empty-title">No product sales</div>
                <div className="dash-empty-text">
                  Product rankings will appear after sales are recorded.
                </div>
              </div>
            ) : (
              <Bar data={topProductsData} options={barOptions} />
            )}
          </div>
        </div>
      </section>

      <section className="dash-card">
        <div className="card-header card-header--table">
          <div>
            <h2 className="card-title">Recent orders</h2>
            <p className="card-description">
              Latest orders in the selected period.
            </p>
          </div>

          <div className="card-header__actions">
            <span className="dash-table-count">
              {num.format(Math.min(recentOrders.length, 8))} shown
            </span>
            <button
              type="button"
              className="dash-link-button"
              onClick={() => navigate("/admin/orders")}
            >
              View all orders
            </button>
          </div>
        </div>

        {recentOrders.length === 0 ? (
          <div className="dash-empty-state dash-empty-state--table">
            <div className="dash-empty-title">No recent orders</div>
            <div className="dash-empty-text">
              Try another period to review order activity.
            </div>
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.slice(0, 8).map((order) => (
                  <tr key={order.id}>
                    <td className="dash-strong">#{order.id}</td>
                    <td>{order.customer_name || "Walk-in"}</td>
                    <td className="dash-amount">
                      {peso.format(Number(order.total_amount || 0))}
                    </td>
                    <td>
                      <StatusBadge status={order.payment_status} />
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td>{formatDateTime(order.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const dashboardCss = `
  .dash-shell {
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: #18181b;
    font-family: inherit;
    font-variant-numeric: tabular-nums;
  }

  .dash-page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 4px 0 2px;
  }

  .dash-title {
    margin: 0;
    color: #18181b;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .dash-subtitle {
    margin: 4px 0 0;
    color: #71717a;
    font-size: 12.5px;
    font-weight: 400;
    line-height: 1.5;
  }

  .dash-toolbar,
  .dash-card,
  .metric-card {
    background: #ffffff;
    border: 1px solid #e4e4e7;
    border-radius: 0;
    box-shadow: none;
  }

  .dash-toolbar {
    min-height: 64px;
    padding: 10px 12px;
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }

  .dash-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 150px;
  }

  .dash-field--period {
    min-width: 170px;
  }

  .dash-field label {
    color: #71717a;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .dash-field input,
  .dash-field select {
    height: 34px;
    min-width: 150px;
    padding: 0 10px;
    border: 1px solid #d4d4d8;
    border-radius: 0;
    outline: none;
    background: #ffffff;
    color: #18181b;
    font: inherit;
    font-size: 12px;
    font-weight: 400;
  }

  .dash-field input:focus,
  .dash-field select:focus {
    border-color: #18181b;
  }

  .dash-period-summary {
    margin-left: auto;
    min-height: 34px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-end;
    gap: 1px;
    color: #18181b;
  }

  .dash-period-summary span {
    font-size: 11.5px;
    font-weight: 600;
  }

  .dash-period-summary small {
    color: #71717a;
    font-size: 10.5px;
    font-weight: 400;
  }

  .dash-btn,
  .dash-link-button {
    border-radius: 0;
    box-shadow: none;
    font: inherit;
    cursor: pointer;
  }

  .dash-btn {
    height: 34px;
    padding: 0 12px;
    border: 1px solid #d4d4d8;
    font-size: 11.5px;
    font-weight: 600;
  }

  .dash-btn-primary {
    border-color: #18181b;
    background: #18181b;
    color: #ffffff;
  }

  .dash-btn-secondary {
    background: #ffffff;
    color: #18181b;
  }

  .dash-btn:hover:not(:disabled),
  .dash-link-button:hover {
    background: #f4f4f5;
  }

  .dash-btn-primary:hover:not(:disabled) {
    background: #27272a;
  }

  .dash-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .dash-apply-button {
    align-self: flex-end;
  }

  .dash-link-button {
    height: 30px;
    min-height: 30px;
    padding: 0 10px;
    border: 1px solid #d4d4d8;
    background: #ffffff;
    color: #18181b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .dash-inline-error,
  .dash-inline-alert {
    padding: 9px 11px;
    border-radius: 0;
    font-size: 11.5px;
  }

  .dash-inline-error {
    border: 1px solid #fde68a;
    background: #fffbeb;
    color: #a16207;
  }

  .dash-inline-alert {
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #b91c1c;
  }

  .metric-grid {
    display: grid;
    gap: 8px;
  }

  .metric-grid--five {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .metric-card {
    width: 100%;
    min-height: 88px;
    padding: 12px 14px;
    text-align: left;
    color: #18181b;
  }

  button.metric-card {
    cursor: pointer;
    font: inherit;
  }

  .metric-card--clickable:hover {
    background: #fafafa;
    border-color: #d4d4d8;
  }

  .metric-card--warning {
    border-top: 2px solid #d97706;
  }

  .metric-card--danger {
    border-top: 2px solid #dc2626;
  }

  .metric-card__title {
    margin-bottom: 8px;
    color: #71717a;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .metric-card__value {
    color: #18181b;
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .metric-card__meta {
    margin-top: 7px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    color: #71717a;
    font-size: 10.5px;
    font-weight: 400;
    line-height: 1.35;
  }

  .metric-card__separator {
    color: #a1a1aa;
  }

  .dashboard-grid {
    display: grid;
    gap: 12px;
  }

  .dashboard-grid--main {
    grid-template-columns: minmax(0, 1.75fr) minmax(300px, 0.85fr);
  }

  .dashboard-grid--triple {
    grid-template-columns:
      minmax(0, 0.95fr)
      minmax(0, 1.05fr)
      minmax(0, 1.12fr);
  }

  .dash-card {
    min-width: 0;
    overflow: hidden;
  }

  .card-header {
    min-height: 62px;
    padding: 13px 14px 10px;
    border-bottom: 1px solid #ededf0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .card-header--table {
    align-items: center;
  }

  .card-header__actions,
  .card-button-row {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .card-title {
    margin: 0;
    color: #18181b;
    font-size: 15.5px;
    font-weight: 700;
    line-height: 1.3;
  }

  .card-description {
    margin: 3px 0 0;
    color: #71717a;
    font-size: 11.5px;
    font-weight: 400;
    line-height: 1.4;
  }

  .dash-chart-area {
    position: relative;
    min-height: 250px;
    padding: 12px 14px 14px;
  }

  .dash-chart-area--sales {
    height: 278px;
  }

  .dash-chart-area--products {
    height: 258px;
  }

  .progress-list {
    padding: 13px 14px 15px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .progress-list--orders {
    min-height: 278px;
    padding-top: 11px;
    padding-bottom: 11px;
    justify-content: center;
    gap: 8px;
  }

  .progress-list--compact {
    padding-top: 11px;
    gap: 8px;
  }

  .progress-row__top {
    margin-bottom: 5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #52525b;
    font-size: 11px;
    font-weight: 400;
  }

  .progress-row__top strong {
    color: #18181b;
    font-size: 11px;
    font-weight: 600;
  }

  .progress-row__track {
    height: 5px;
    overflow: hidden;
    background: #f1f1f3;
    border-radius: 0;
  }

  .progress-row__fill {
    height: 100%;
    border-radius: 0;
  }

  .inventory-attention {
    padding: 4px 14px 14px;
  }

  .inventory-attention__row {
    min-height: 66px;
    padding: 10px 0;
    border-bottom: 1px solid #ededf0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .inventory-attention__row > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .inventory-attention__row strong {
    color: #18181b;
    font-size: 12px;
    font-weight: 600;
  }

  .inventory-attention__row > div:first-child span {
    color: #71717a;
    font-size: 10.5px;
    font-weight: 400;
  }

  .inventory-attention__counts {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stock-count {
    min-width: 42px;
    min-height: 22px;
    padding: 0 7px;
    border: 1px solid;
    border-radius: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10.5px;
    font-weight: 500;
    white-space: nowrap;
  }

  .stock-count--low {
    border-color: #fde68a;
    background: #fffbeb;
    color: #a16207;
  }

  .stock-count--out {
    border-color: #fecaca;
    background: #fef2f2;
    color: #b91c1c;
  }

  .card-button-row {
    padding-top: 12px;
  }

  .compact-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-bottom: 1px solid #ededf0;
  }

  .compact-summary > div {
    padding: 11px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .compact-summary > div + div {
    border-left: 1px solid #ededf0;
  }

  .compact-summary span {
    color: #71717a;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .compact-summary strong {
    color: #18181b;
    font-size: 20px;
    font-weight: 700;
    line-height: 1;
  }

  .dash-empty-state {
    min-height: 170px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .dash-empty-state--table {
    min-height: 130px;
  }

  .dash-empty-title {
    margin-bottom: 4px;
    color: #18181b;
    font-size: 12.5px;
    font-weight: 600;
  }

  .dash-empty-text {
    max-width: 380px;
    color: #71717a;
    font-size: 11px;
    font-weight: 400;
    line-height: 1.45;
  }

  .dash-table-count {
    color: #71717a;
    font-size: 10.5px;
    font-weight: 400;
    white-space: nowrap;
  }

  .dash-table-wrap {
    max-height: 340px;
    overflow: auto;
  }

  .dash-table {
    width: 100%;
    border-collapse: collapse;
  }

  .dash-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .dash-table thead th {
    padding: 9px 12px;
    border-bottom: 1px solid #e4e4e7;
    background: #fafafa;
    color: #71717a;
    text-align: left;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .dash-table tbody td {
    padding: 8px 12px;
    border-bottom: 1px solid #ededf0;
    color: #3f3f46;
    font-size: 11.5px;
    font-weight: 400;
    vertical-align: middle;
    white-space: nowrap;
  }

  .dash-table tbody tr:hover {
    background: #fafafa;
  }

  .dash-strong,
  .dash-amount {
    color: #18181b !important;
    font-weight: 600 !important;
  }

  .dash-badge {
    min-height: 24px;
    padding: 0 8px;
    border: 1px solid;
    border-radius: 0;
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  .dash-loading-wrap,
  .dash-error-page {
    min-height: 280px;
    padding: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dash-loading-wrap {
    flex-direction: column;
    gap: 10px;
    color: #71717a;
    font-size: 12px;
  }

  .dash-spinner {
    width: 22px;
    height: 22px;
    border: 2px solid #e4e4e7;
    border-top-color: #18181b;
    border-radius: 50%;
    animation: dash-spin 0.9s linear infinite;
  }

  .dash-error-card {
    width: min(520px, 100%);
    padding: 18px;
    border: 1px solid #fecaca;
    border-radius: 0;
    background: #ffffff;
  }

  .dash-error-title {
    margin-bottom: 5px;
    color: #b91c1c;
    font-size: 15px;
    font-weight: 700;
  }

  .dash-error-message {
    margin-bottom: 12px;
    color: #52525b;
    font-size: 11.5px;
    line-height: 1.45;
  }

  @keyframes dash-spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 1280px) {
    .metric-grid--five {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .dashboard-grid--triple {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 980px) {
    .dashboard-grid--main,
    .dashboard-grid--triple {
      grid-template-columns: 1fr;
    }

    .metric-grid--five {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dash-toolbar {
      align-items: stretch;
      flex-wrap: wrap;
    }

    .dash-period-summary {
      width: 100%;
      margin-left: 0;
      align-items: flex-start;
    }
  }

  @media (max-width: 620px) {
    .dash-page-header {
      flex-direction: column;
    }

    .metric-grid--five {
      grid-template-columns: 1fr;
    }

    .dash-field,
    .dash-field--period,
    .dash-field input,
    .dash-field select {
      width: 100%;
      min-width: 0;
    }

    .card-header {
      flex-direction: column;
    }

    .card-header__actions {
      width: 100%;
      justify-content: space-between;
    }

    .inventory-attention__row {
      align-items: flex-start;
      flex-direction: column;
    }

    .dash-chart-area--sales {
      height: 260px;
    }
  }
`;
