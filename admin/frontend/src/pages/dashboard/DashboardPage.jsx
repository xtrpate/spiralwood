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
import { useNavigate } from "react-router-dom";

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

function truncate(text, max = 28) {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function getPercent(value, total) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, (Number(value || 0) / Number(total)) * 100));
}

function MetricCard({ tone, eyebrow, title, value, meta }) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__eyebrow">{eyebrow}</div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__title">{title}</div>
      <div className="metric-card__meta">{meta}</div>
    </div>
  );
}

function MiniStat({ label, value, tone = "slate" }) {
  return (
    <div className={`mini-stat mini-stat--${tone}`}>
      <div className="mini-stat__label">{label}</div>
      <div className="mini-stat__value">{value}</div>
    </div>
  );
}

function ProgressRow({ label, value, total, tone }) {
  const percent = getPercent(value, total);

  return (
    <div className="progress-row">
      <div className="progress-row__top">
        <span>{label}</span>
        <strong>{num.format(Number(value || 0))}</strong>
      </div>
      <div className="progress-row__track">
        <div
          className={`progress-row__fill progress-row__fill--${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: ["#fff7ed", "#c2410c", "#fdba74"],
    confirmed: ["#eff6ff", "#1d4ed8", "#93c5fd"],
    contract_released: ["#f5f3ff", "#7c3aed", "#c4b5fd"],
    production: ["#faf5ff", "#7e22ce", "#d8b4fe"],
    shipping: ["#ecfeff", "#0f766e", "#99f6e4"],
    delivered: ["#f0fdf4", "#15803d", "#86efac"],
    completed: ["#ecfdf5", "#047857", "#6ee7b7"],
    cancelled: ["#fef2f2", "#b91c1c", "#fca5a5"],
    paid: ["#ecfdf5", "#047857", "#6ee7b7"],
    partial: ["#fff7ed", "#c2410c", "#fdba74"],
    unpaid: ["#f8fafc", "#475569", "#cbd5e1"],
  };

  const [bg, color, border] = map[status] || ["#f8fafc", "#475569", "#cbd5e1"];

  return (
    <span
      className="dash-badge"
      style={{
        background: bg,
        color,
        borderColor: border,
      }}
    >
      {String(status || "unknown").replace(/_/g, " ")}
    </span>
  );
}

function ChannelBadge({ channel }) {
  const isOnline = channel === "online";

  return (
    <span
      className="dash-badge"
      style={{
        background: isOnline ? "#eff6ff" : "#f0fdf4",
        color: isOnline ? "#1d4ed8" : "#15803d",
        borderColor: isOnline ? "#93c5fd" : "#86efac",
      }}
    >
      {channel || "—"}
    </span>
  );
}

function TypeBadge({ type }) {
  const isBlueprint = type === "blueprint";

  return (
    <span
      className="dash-badge"
      style={{
        background: isBlueprint ? "#f5f3ff" : "#f8fafc",
        color: isBlueprint ? "#7c3aed" : "#475569",
        borderColor: isBlueprint ? "#c4b5fd" : "#cbd5e1",
      }}
    >
      {type || "standard"}
    </span>
  );
}

export default function DashboardPage() {
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
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.08)",
          fill: true,
          tension: 0.36,
          borderWidth: 2,
          pointRadius: chartMode === "monthly" ? 2.5 : 1.8,
          pointHoverRadius: 4,
          pointBackgroundColor: "#2563eb",
        },
        {
          label: "Walk-in Sales",
          data: salesChart.map((row) => Number(row.walkin_sales || 0)),
          borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,0.08)",
          fill: true,
          tension: 0.36,
          borderWidth: 2,
          pointRadius: chartMode === "monthly" ? 2.5 : 1.8,
          pointHoverRadius: 4,
          pointBackgroundColor: "#10b981",
        },
      ],
    }),
    [salesChart, chartLabels, chartMode],
  );

  const topProductsData = useMemo(
    () => ({
      labels: topProducts
        .slice(0, 8)
        .map((item) => truncate(item.product_name, 24)),
      datasets: [
        {
          label: "Units Sold",
          data: topProducts
            .slice(0, 8)
            .map((item) => Number(item.units_sold || 0)),
          backgroundColor: "#4f46e5",
          borderRadius: 10,
          borderSkipped: false,
          barThickness: 14,
        },
      ],
    }),
    [topProducts],
  );

  const lineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            color: "#334155",
            font: { size: 11, weight: 600 },
            padding: 16,
          },
        },
        tooltip: {
          backgroundColor: "#0f172a",
          padding: 10,
          titleFont: { size: 11, weight: 700 },
          bodyFont: { size: 11 },
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${peso.format(ctx.parsed.y || 0)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#64748b",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: chartMode === "monthly" ? 12 : 8,
            font: { size: 11 },
          },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#64748b",
            callback: (value) => peso.format(value),
            font: { size: 11 },
          },
          grid: {
            color: "rgba(148,163,184,0.12)",
          },
          border: { display: false },
        },
      },
    }),
    [chartMode],
  );

  const barOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          padding: 10,
          titleFont: { size: 11, weight: 700 },
          bodyFont: { size: 11 },
          callbacks: {
            label: (ctx) => ` ${num.format(ctx.parsed.x || 0)} units`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: "#64748b",
            precision: 0,
            font: { size: 11 },
          },
          grid: {
            color: "rgba(148,163,184,0.12)",
          },
          border: { display: false },
        },
        y: {
          ticks: {
            color: "#334155",
            font: { size: 11, weight: 600 },
          },
          grid: { display: false },
          border: { display: false },
        },
      },
    }),
    [],
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

      <section className="hero-panel hero-panel--compact">
        <div className="hero-panel__left">
          <div className="hero-panel__eyebrow">Management Cockpit</div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">
            Monitor sales, stock levels, fulfillment progress, and custom order
            activity from one view.
          </p>

          <div className="hero-period-row">
            <span className="hero-period-chip">{activeLabel}</span>
            {dateRange?.from && dateRange?.to ? (
              <span className="hero-period-text">
                {dateRange.from} → {dateRange.to}
              </span>
            ) : null}
          </div>
        </div>

        <div className="hero-panel__right">
          <button
            className="dash-btn dash-btn-ghost"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      <section className="dash-filter-card">
        <div className="section-kicker">Date Filters</div>

        <div className="dash-pill-row">
          {PRESETS.map((item) => (
            <button
              key={item.key}
              className={`dash-pill ${preset === item.key ? "active" : ""}`}
              onClick={() => handlePresetChange(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="dash-custom-row">
            <div className="dash-field">
              <label htmlFor="dash-from">From</label>
              <input
                id="dash-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>

            <div className="dash-field">
              <label htmlFor="dash-to">To</label>
              <input
                id="dash-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <div className="dash-custom-actions">
              <button
                className="dash-btn dash-btn-primary"
                onClick={handleApplyCustom}
                type="button"
              >
                Apply Range
              </button>
            </div>
          </div>
        )}

        {rangeError ? (
          <div className="dash-inline-error">{rangeError}</div>
        ) : null}
      </section>

      {fetchError ? (
        <div className="dash-inline-alert">
          <strong>Unable to refresh dashboard.</strong> {fetchError}
        </div>
      ) : null}

      <section className="metric-grid metric-grid--six">
        <MetricCard
          tone="blue"
          eyebrow="Selected Range"
          value={peso.format(Number(sales.total_revenue || 0))}
          title="Net Sales"
          meta={`Profit ${peso.format(Number(sales.total_profit || 0))} · Avg Order ${peso.format(
            Number(sales.avg_order_value || 0),
          )}`}
        />

        <MetricCard
          tone="violet"
          eyebrow="Current Queue"
          value={num.format(currentOpenOrders)}
          title="Open Orders"
          meta={`${num.format(currentPending)} pending · ${num.format(
            currentProduction,
          )} in production`}
        />

        <MetricCard
          tone="amber"
          eyebrow="Current Queue"
          value={num.format(pendingReviews)}
          title="Pending Payment Review"
          meta={`${num.format(deliveredUnpaid)} delivered but unpaid`}
        />

        <MetricCard
          tone="red"
          eyebrow="Inventory Alerts"
          value={num.format(stockAlerts)}
          title="Low / Out of Stock"
          meta={`${num.format(lowStockTotal)} low · ${num.format(
            outOfStockTotal,
          )} critical`}
        />

        <MetricCard
          tone="cyan"
          eyebrow="Custom Operations"
          value={num.format(activeBlueprintJobs)}
          title="Active Blueprint Jobs"
          meta={`${num.format(
            Number(blueprint.pending_custom_review || 0),
          )} pending review · ${num.format(
            Number(blueprint.quotation_waiting || 0),
          )} waiting customer`}
        />

        <MetricCard
          tone="slate"
          eyebrow="Channel Mix"
          value={`${num.format(onlineOrders)} / ${num.format(walkinOrders)}`}
          title="Online vs Walk-in"
          meta={`${num.format(totalChannelOrders)} orders in selected range`}
        />
      </section>

      <section className="dashboard-grid dashboard-grid--main">
        <div className="dash-card">
          <div className="card-header">
            <div>
              <div className="section-kicker">Sales & Orders</div>
              <h3
                className="card-title clickable-title"
                onClick={() => navigate("/admin/reports")}
              >
                Sales Trend <span className="link-arrow">→</span>
              </h3>
              <p className="card-description">
                Revenue movement and order volume in the selected date range.
              </p>
            </div>
          </div>

          <div className="mini-stat-grid mini-stat-grid--four">
            <MiniStat
              label="Revenue"
              value={peso.format(Number(sales.total_revenue || 0))}
              tone="blue"
            />
            <MiniStat
              label="Profit"
              value={peso.format(Number(sales.total_profit || 0))}
              tone="green"
            />
            <MiniStat
              label="Avg Order"
              value={peso.format(Number(sales.avg_order_value || 0))}
              tone="violet"
            />
            <MiniStat
              label="Orders"
              value={num.format(totalOrders)}
              tone="amber"
            />
          </div>

          <div className="dash-chart-area dash-chart-area--large">
            {salesChart.length === 0 ? (
              <div className="dash-empty-state">
                <div className="dash-empty-title">No sales data found</div>
                <div className="dash-empty-text">
                  There are no recorded sales for the selected period.
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
              <div className="section-kicker">Operations</div>
              <h3
                className="card-title clickable-title"
                onClick={() => navigate("/admin/orders")}
              >
                Fulfillment Pipeline <span className="link-arrow">→</span>
              </h3>
              <p className="card-description">
                Current order flow and stages that need admin attention.
              </p>
            </div>
          </div>

          <div className="fulfillment-summary">
            <div className="fulfillment-summary__main">
              <span>Current Open Orders</span>
              <strong>{num.format(currentOpenOrders)}</strong>
            </div>
            <div className="fulfillment-summary__side">
              <span>Completion Rate</span>
              <strong>
                {currentTotalOrders
                  ? `${Math.round((currentCompleted / currentTotalOrders) * 100)}%`
                  : "0%"}
              </strong>
            </div>
          </div>

          <div className="progress-list">
            <ProgressRow
              label="Pending"
              value={currentPending}
              total={currentTotalOrders}
              tone="amber"
            />
            <ProgressRow
              label="Confirmed"
              value={currentConfirmed}
              total={currentTotalOrders}
              tone="blue"
            />
            <ProgressRow
              label="In Production"
              value={currentProduction}
              total={currentTotalOrders}
              tone="violet"
            />
            <ProgressRow
              label="Shipping"
              value={currentShipping}
              total={currentTotalOrders}
              tone="cyan"
            />
            <ProgressRow
              label="Delivered"
              value={currentDelivered}
              total={currentTotalOrders}
              tone="green"
            />
            <ProgressRow
              label="Completed"
              value={currentCompleted}
              total={currentTotalOrders}
              tone="green-strong"
            />
            <ProgressRow
              label="Cancelled"
              value={currentCancelled}
              total={currentTotalOrders}
              tone="red"
            />
          </div>

          <div className="ops-footnote-grid">
            <div className="ops-footnote ops-footnote--warning">
              <span>Payment Review Queue</span>
              <strong>{num.format(pendingReviews)}</strong>
            </div>
            <div className="ops-footnote ops-footnote--danger">
              <span>Delivered but Unpaid</span>
              <strong>{num.format(deliveredUnpaid)}</strong>
            </div>
            <div className="ops-footnote ops-footnote--info">
              <span>Orders in Selected Range</span>
              <strong>{num.format(totalOrders)}</strong>
            </div>
            <div className="ops-footnote ops-footnote--success">
              <span>Completed in Selected Range</span>
              <strong>{num.format(periodCompleted)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid--triple">
        <div className="dash-card">
          <div className="card-header">
            <div>
              <div className="section-kicker">Inventory Control</div>
              <h3
                className="card-title clickable-title"
                onClick={() => navigate("/admin/products")}
              >
                Stock Overview <span className="link-arrow">→</span>
              </h3>
              <p className="card-description">
                Current stock alerts and selected-range stock movement.
              </p>
            </div>
          </div>

          <div className="inventory-panel">
            <div className="inventory-panel__grid inventory-panel__grid--triple">
              <MiniStat
                label="Products"
                value={num.format(Number(inventory.total_products || 0))}
                tone="blue"
              />
              <MiniStat
                label="Raw Materials"
                value={num.format(Number(inventory.total_raw_materials || 0))}
                tone="slate"
              />
              <MiniStat
                label="Stock In"
                value={num.format(Number(inventory.stock_in_total || 0))}
                tone="green"
              />
              <MiniStat
                label="Stock Out"
                value={num.format(Number(inventory.stock_out_total || 0))}
                tone="cyan"
              />
              <MiniStat
                label="Low Stock"
                value={num.format(lowStockTotal)}
                tone="amber"
              />
              <MiniStat
                label="Critical Level"
                value={num.format(outOfStockTotal)}
                tone="red"
              />
            </div>

            <div className="inventory-note">
              <div className="inventory-note__title">Priority Note</div>
              <div className="inventory-note__text">
                {outOfStockTotal > 0
                  ? `${num.format(outOfStockTotal)} items are already at critical level. Prioritize restocking before new commitments are accepted.`
                  : lowStockTotal > 0
                    ? `${num.format(lowStockTotal)} items are already low stock. Review reorder needs soon.`
                    : "No critical inventory alert detected in the current snapshot."}
              </div>
            </div>
          </div>
        </div>

        <div className="dash-card">
          <div className="card-header">
            <div>
              <div className="section-kicker">Blueprint / Custom</div>
              <h3
                className="card-title clickable-title"
                onClick={() => navigate("/admin/orders")}
              >
                Custom Pipeline <span className="link-arrow">→</span>
              </h3>
              <p className="card-description">
                Current flow of blueprint and customization requests.
              </p>
            </div>
          </div>

          <div className="fulfillment-summary">
            <div className="fulfillment-summary__main">
              <span>Total Blueprint Orders</span>
              <strong>
                {num.format(Number(blueprint.total_blueprint_orders || 0))}
              </strong>
            </div>
            <div className="fulfillment-summary__side">
              <span>Active Jobs</span>
              <strong>{num.format(activeBlueprintJobs)}</strong>
            </div>
          </div>

          <div className="progress-list">
            <ProgressRow
              label="Pending Review"
              value={Number(blueprint.pending_custom_review || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              tone="amber"
            />
            <ProgressRow
              label="Estimate Drafting"
              value={Number(blueprint.estimate_drafting || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              tone="slate"
            />
            <ProgressRow
              label="Quotation Waiting"
              value={Number(blueprint.quotation_waiting || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              tone="blue"
            />
            <ProgressRow
              label="Quotation Approved"
              value={Number(blueprint.quotation_approved || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              tone="green"
            />
            <ProgressRow
              label="Contract Released"
              value={Number(blueprint.contract_released || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              tone="violet"
            />
            <ProgressRow
              label="In Production"
              value={Number(blueprint.in_production || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              tone="violet-strong"
            />
            <ProgressRow
              label="Ready for Dispatch"
              value={Number(blueprint.ready_for_dispatch || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              tone="cyan"
            />
            <ProgressRow
              label="Completed"
              value={Number(blueprint.completed_blueprint_orders || 0)}
              total={Number(blueprint.total_blueprint_orders || 0)}
              tone="green-strong"
            />
          </div>
        </div>

        <div className="dash-card">
          <div className="card-header">
            <div>
              <div className="section-kicker">Product Performance</div>
              <h3 className="card-title">Top Products</h3>
              <p className="card-description">
                Best-selling items ranked by units sold in the selected range.
              </p>
            </div>
          </div>

          <div className="dash-chart-area">
            {topProducts.length === 0 ? (
              <div className="dash-empty-state">
                <div className="dash-empty-title">No product data found</div>
                <div className="dash-empty-text">
                  Product sales will appear here once orders are recorded.
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
            <div className="section-kicker">Activity</div>
            <h3 className="card-title">Recent Orders</h3>
            <p className="card-description">
              Latest transactions within the selected range.
            </p>
          </div>

          <span className="dash-table-count">
            {num.format(recentOrders.length)} orders
          </span>
        </div>

        {recentOrders.length === 0 ? (
          <div className="dash-empty-state dash-empty-state--table">
            <div className="dash-empty-title">No orders in this range</div>
            <div className="dash-empty-text">
              Try a wider date range to view more order activity.
            </div>
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Channel</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date &amp; Time</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="dash-strong">#{order.id}</td>
                    <td>{order.customer_name || "Walk-in"}</td>
                    <td>
                      <TypeBadge type={order.order_type} />
                    </td>
                    <td>
                      <ChannelBadge channel={order.channel} />
                    </td>
                    <td className="dash-strong">
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
    gap: 16px;
    color: #0f172a;
  }

  .hero-panel,
  .dash-filter-card,
  .dash-card,
  .metric-card {
    background:
      linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(251,253,255,0.98) 100%);
    border: 1px solid #e7edf5;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
  }

  .hero-panel {
    border-radius: 20px;
    padding: 18px 20px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    position: relative;
    overflow: hidden;
  }

  .hero-panel--compact::after {
    content: '';
    position: absolute;
    top: -54px;
    right: -54px;
    width: 150px;
    height: 150px;
    background: radial-gradient(circle, rgba(37, 99, 235, 0.12) 0%, rgba(37, 99, 235, 0) 70%);
    pointer-events: none;
  }

  .hero-panel__left,
  .hero-panel__right {
    position: relative;
    z-index: 1;
  }

  .hero-panel__eyebrow,
  .section-kicker {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 8px;
  }

  .dash-title {
    margin: 0;
    font-size: 24px;
    line-height: 1.12;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
  }

  .dash-subtitle {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 13px;
    max-width: 720px;
  }

  .hero-period-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 12px;
  }

  .hero-period-chip {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 800;
    border: 1px solid #bfdbfe;
  }

  .hero-period-text {
    font-size: 12px;
    color: #64748b;
    font-weight: 600;
  }

  .dash-filter-card,
  .dash-card {
    border-radius: 20px;
  }

  .dash-filter-card {
    padding: 16px 18px;
  }

  .dash-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .dash-pill {
    border: 1px solid #dbe4ee;
    background: #ffffff;
    color: #334155;
    border-radius: 999px;
    padding: 8px 13px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .dash-pill:hover {
    border-color: #93c5fd;
    color: #1d4ed8;
    transform: translateY(-1px);
  }

  .dash-pill.active {
    background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
    border-color: #2563eb;
    color: #ffffff;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.2);
  }

  .dash-custom-row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 12px;
    margin-top: 14px;
  }

  .dash-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 180px;
  }

  .dash-field label {
    font-size: 11px;
    font-weight: 700;
    color: #475569;
  }

  .dash-field input {
    height: 38px;
    border: 1px solid #dbe4ee;
    border-radius: 11px;
    padding: 0 12px;
    font-size: 12px;
    color: #0f172a;
    outline: none;
    background: #ffffff;
  }

  .dash-field input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.14);
  }

  .dash-custom-actions {
    display: flex;
    align-items: end;
  }

  .dash-btn {
    height: 38px;
    border: 1px solid transparent;
    border-radius: 12px;
    padding: 0 15px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .dash-btn:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .dash-btn-primary {
    background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
    color: #ffffff;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
  }

  .dash-btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .dash-btn-ghost {
    background: #ffffff;
    border-color: #dbe4ee;
    color: #334155;
  }

  .dash-btn-ghost:hover:not(:disabled) {
    border-color: #93c5fd;
    color: #1d4ed8;
  }

  .dash-inline-error {
    margin-top: 12px;
    color: #b91c1c;
    font-size: 12px;
    font-weight: 600;
  }

  .dash-inline-alert {
    border: 1px solid #fecaca;
    background: #fff1f2;
    color: #9f1239;
    border-radius: 16px;
    padding: 12px 14px;
    font-size: 12px;
  }

  .metric-grid {
    display: grid;
    gap: 14px;
  }

  .metric-grid--six {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .metric-card {
    border-radius: 18px;
    padding: 16px;
    position: relative;
    overflow: hidden;
  }

  .metric-card::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
  }

  .metric-card--blue::before {
    background: #2563eb;
  }

  .metric-card--violet::before {
    background: #7c3aed;
  }

  .metric-card--amber::before {
    background: #d97706;
  }

  .metric-card--red::before {
    background: #dc2626;
  }

  .metric-card--cyan::before {
    background: #0891b2;
  }

  .metric-card--slate::before {
    background: #475569;
  }

  .metric-card__eyebrow {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #64748b;
    margin-bottom: 10px;
  }

  .metric-card__value {
    font-size: 22px;
    line-height: 1.08;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0f172a;
    margin-bottom: 8px;
  }

  .metric-card__title {
    font-size: 13px;
    font-weight: 700;
    color: #334155;
    margin-bottom: 6px;
  }

  .metric-card__meta {
    font-size: 11px;
    line-height: 1.45;
    color: #64748b;
  }

  .dashboard-grid {
    display: grid;
    gap: 16px;
  }

  .dashboard-grid--main {
    grid-template-columns: minmax(0, 1.7fr) minmax(340px, 1fr);
  }

  .dashboard-grid--triple {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 18px 0;
  }

  .card-header--table {
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 1px solid #eef2f7;
  }

  .card-title {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.01em;
  }

  .clickable-title {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: color 0.2s ease;
  }

  .clickable-title:hover {
    color: #2563eb; /* Changes to blue on hover */
  }

  .link-arrow {
    font-size: 16px;
    opacity: 0;
    transform: translateX(-4px);
    transition: all 0.2s ease;
    color: #2563eb;
  }

  .clickable-title:hover .link-arrow {
    opacity: 1;
    transform: translateX(0);
  }

  .card-description {
    margin: 4px 0 0;
    font-size: 12px;
    color: #64748b;
  }

  .mini-stat-grid {
    display: grid;
    gap: 10px;
    padding: 14px 18px 0;
  }

  .mini-stat-grid--four {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .mini-stat {
    border-radius: 14px;
    padding: 12px 13px;
    border: 1px solid #e8eef5;
    background: #fbfdff;
  }

  .mini-stat--blue {
    background: #f8fbff;
  }

  .mini-stat--green {
    background: #f7fdf9;
  }

  .mini-stat--violet {
    background: #fbf9ff;
  }

  .mini-stat--amber {
    background: #fffaf5;
  }

  .mini-stat--red {
    background: #fff8f8;
  }

  .mini-stat--cyan {
    background: #f4fbfd;
  }

  .mini-stat--slate {
    background: #f8fafc;
  }

  .mini-stat__label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 7px;
  }

  .mini-stat__value {
    font-size: 16px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.01em;
  }

  .dash-chart-area {
    height: 300px;
    padding: 10px 18px 18px;
  }

  .dash-chart-area--large {
    height: 340px;
  }

  .fulfillment-summary {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    margin: 14px 18px 0;
    padding: 14px;
    border: 1px solid #e8eef5;
    border-radius: 16px;
    background: linear-gradient(180deg, #fbfdff 0%, #f8fbff 100%);
  }

  .fulfillment-summary__main,
  .fulfillment-summary__side {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .fulfillment-summary__main span,
  .fulfillment-summary__side span {
    font-size: 11px;
    color: #64748b;
    font-weight: 700;
  }

  .fulfillment-summary__main strong,
  .fulfillment-summary__side strong {
    font-size: 20px;
    line-height: 1.1;
    color: #0f172a;
    font-weight: 800;
  }

  .progress-list {
    padding: 16px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .progress-row__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: #475569;
    margin-bottom: 7px;
  }

  .progress-row__top strong {
    color: #0f172a;
    font-size: 12px;
  }

  .progress-row__track {
    height: 9px;
    border-radius: 999px;
    background: #edf2f7;
    overflow: hidden;
  }

  .progress-row__fill {
    height: 100%;
    border-radius: 999px;
  }

  .progress-row__fill--green {
    background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
  }

  .progress-row__fill--green-strong {
    background: linear-gradient(90deg, #059669 0%, #10b981 100%);
  }

  .progress-row__fill--amber {
    background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
  }

  .progress-row__fill--violet {
    background: linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%);
  }

  .progress-row__fill--violet-strong {
    background: linear-gradient(90deg, #7c3aed 0%, #8b5cf6 100%);
  }

  .progress-row__fill--blue {
    background: linear-gradient(90deg, #2563eb 0%, #60a5fa 100%);
  }

  .progress-row__fill--cyan {
    background: linear-gradient(90deg, #0891b2 0%, #22d3ee 100%);
  }

  .progress-row__fill--red {
    background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
  }

  .progress-row__fill--slate {
    background: linear-gradient(90deg, #64748b 0%, #94a3b8 100%);
  }

  .ops-footnote-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 0 18px 18px;
  }

  .ops-footnote {
    border-radius: 14px;
    padding: 12px 13px;
    border: 1px solid #e8eef5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .ops-footnote span {
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
  }

  .ops-footnote strong {
    font-size: 16px;
    font-weight: 800;
    color: #0f172a;
  }

  .ops-footnote--warning {
    background: #fffaf5;
  }

  .ops-footnote--danger {
    background: #fff8f8;
  }

  .ops-footnote--info {
    background: #f8fbff;
  }

  .ops-footnote--success {
    background: #f7fdf9;
  }

  .inventory-panel {
    padding: 14px 18px 18px;
  }

  .inventory-panel__grid {
    display: grid;
    gap: 10px;
  }

  .inventory-panel__grid--triple {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .inventory-note {
    margin-top: 12px;
    border-radius: 16px;
    padding: 14px;
    border: 1px solid #ede7d7;
    background: linear-gradient(180deg, #fffdfa 0%, #fff9ef 100%);
  }

  .inventory-note__title {
    font-size: 12px;
    font-weight: 800;
    color: #8a5a12;
    margin-bottom: 6px;
  }

  .inventory-note__text {
    font-size: 12px;
    line-height: 1.55;
    color: #6b7280;
  }

  .dash-empty-state {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    text-align: center;
    color: #64748b;
    padding: 20px;
  }

  .dash-empty-state--table {
    min-height: 180px;
  }

  .dash-empty-title {
    font-size: 14px;
    font-weight: 800;
    color: #334155;
    margin-bottom: 6px;
  }

  .dash-empty-text {
    font-size: 12px;
    max-width: 420px;
  }

  .dash-table-count {
    font-size: 11px;
    font-weight: 800;
    color: #64748b;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 7px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .dash-table-wrap {
    overflow-x: auto;
  }

  .dash-table {
    width: 100%;
    border-collapse: collapse;
  }

  .dash-table thead th {
    text-align: left;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
    background: #f8fafc;
    padding: 13px 16px;
    border-bottom: 1px solid #eef2f7;
    white-space: nowrap;
  }

  .dash-table tbody td {
    padding: 14px 16px;
    font-size: 12px;
    color: #334155;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
    white-space: nowrap;
  }

  .dash-table tbody tr:hover {
    background: #fafcff;
  }

  .dash-strong {
    font-weight: 800;
    color: #0f172a;
  }

  .dash-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid;
    font-size: 10px;
    font-weight: 800;
    text-transform: capitalize;
    white-space: nowrap;
  }

  .dash-loading-wrap,
  .dash-error-page {
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }

  .dash-loading-wrap {
    flex-direction: column;
    gap: 12px;
    color: #64748b;
    font-size: 13px;
  }

  .dash-spinner {
    width: 24px;
    height: 24px;
    border: 3px solid #dbe4ee;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: dash-spin 0.9s linear infinite;
  }

  .dash-error-card {
    max-width: 560px;
    width: 100%;
    background: #ffffff;
    border: 1px solid #fecaca;
    border-radius: 18px;
    padding: 24px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
  }

  .dash-error-title {
    font-size: 17px;
    font-weight: 800;
    color: #991b1b;
    margin-bottom: 10px;
  }

  .dash-error-message {
    color: #7f1d1d;
    font-size: 13px;
    margin-bottom: 18px;
  }

  @keyframes dash-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 1400px) {
    .metric-grid--six {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .dashboard-grid--triple {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 1200px) {
    .dashboard-grid--main {
      grid-template-columns: 1fr;
    }

    .mini-stat-grid--four,
    .inventory-panel__grid--triple {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 768px) {
    .dash-title {
      font-size: 22px;
    }

    .metric-grid--six,
    .mini-stat-grid--four,
    .inventory-panel__grid--triple,
    .ops-footnote-grid {
      grid-template-columns: 1fr;
    }

    .card-header--table,
    .hero-panel {
      align-items: flex-start;
      flex-direction: column;
    }

    .dash-chart-area,
    .dash-chart-area--large {
      height: 300px;
    }
  }
`;
