import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import * as XLSX from "xlsx-js-style";
import "./SalesReportPage.css";

const CHANNELS = [
  { key: "", label: "All Channels" },
  { key: "online", label: "Online" },
  { key: "walkin", label: "Walk-in" },
];

const PAYMENT_TYPES = [
  { key: "", label: "All Payments" },
  { key: "cash", label: "Cash" },
  { key: "online", label: "Online" },
];

const PERIODS = [
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

const quantity = (value) =>
  Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 4 });

const count = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    maximumFractionDigits: 0,
  });

const pdfMoney = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const percentage = (value, total) => {
  const numerator = Number(value || 0);
  const denominator = Number(total || 0);

  if (denominator <= 0) return "0.0%";

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
};

const pdfText = (value) =>
  String(value ?? "-")
    .replace(/[–—]/g, "-")
    .replace(/₱/g, "PHP ");

const humanize = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const paymentMethodLabel = (value) => {
  const method = String(value || "").toLowerCase();
  if (method === "paymongo") return "Online Payment";
  if (method === "gcash") return "GCash";
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "cod") return "Cash on Delivery";
  if (method === "cop") return "Cash on Pickup";
  return humanize(method);
};

const salesChannelLabel = (value) => {
  const channel = String(value || "")
    .trim()
    .toLowerCase();
  if (channel === "online") return "Online";
  if (channel === "walkin") return "Walk-in";
  return humanize(value);
};

const dateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toYMD = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDateOnly = (value) => {
  if (!value) return "—";

  const [year, month, day] = String(value).split("-").map(Number);

  if (!year || !month || !day) return String(value);

  return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

function Badge({ value }) {
  const normalized = String(value || "pending")
    .toLowerCase()
    .replace(/\s+/g, "-");

  return (
    <span className={`sales-status sales-status-${normalized}`}>
      {humanize(value)}
    </span>
  );
}

function SummaryCard({ label, value, note }) {
  return (
    <div className="sales-summary-card">
      <div className="sales-summary-label">{label}</div>
      <div className="sales-summary-value">{value}</div>
      {note ? <div className="sales-summary-note">{note}</div> : null}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="sales-section-head">
      <div>
        <h2 className="sales-section-title">{title}</h2>
        {subtitle ? <p className="sales-section-subtitle">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="sales-empty-cell">
        {text}
      </td>
    </tr>
  );
}

export default function SalesReportPage() {
  const navigate = useNavigate();

  const [channel, setChannel] = useState("");
  const [payment, setPayment] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState("filtered");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const load = useCallback(async () => {
    if (period === "custom" && (!from || !to || from > to)) return;

    setLoading(true);
    setError("");

    try {
      const params = { channel, payment };

      if (period === "custom") {
        params.from = from;
        params.to = to;
      } else {
        params.period = period;
      }

      const response = await api.get("/sales/report", { params });
      setData(response.data);
    } catch (err) {
      setData(null);
      setError(
        err.response?.data?.message || "Failed to load the sales report.",
      );
    } finally {
      setLoading(false);
    }
  }, [channel, from, payment, period, to]);

  useEffect(() => {
    if (period !== "custom") load();
  }, [load, period]);

  const summary = data?.summary || {};
  const collections = data?.collections || [];
  const orders = data?.orders || [];
  const paymentMethods = data?.payment_methods || [];
  const products = data?.products || [];

  const salesByChannel = data?.sales_by_channel || [];

  const visibleProducts = useMemo(
    () =>
      products
        .filter((row) => Number(row?.gross_order_value || 0) > 0)
        .slice(0, 10),
    [products],
  );

  const outstandingOrders = useMemo(
    () =>
      orders
        .filter((row) => Number(row?.remaining_balance || 0) > 0)
        .sort(
          (a, b) =>
            Number(b?.remaining_balance || 0) -
            Number(a?.remaining_balance || 0),
        ),
    [orders],
  );

  const channelOrderValueTotal = useMemo(
    () =>
      salesByChannel.reduce(
        (sum, row) => sum + Number(row?.sales_revenue || 0),
        0,
      ),
    [salesByChannel],
  );

  const collectionTotal = Number(summary.actual_collected || 0);

  const reportDateRangeLabel = useMemo(() => {
    if (period === "custom") {
      if (!from || !to) return "Custom Range";
      return `${formatDateOnly(from)} – ${formatDateOnly(to)}`;
    }

    const now = new Date();

    if (period === "daily") {
      const today = toYMD(now);
      return formatDateOnly(today);
    }

    if (period === "weekly") {
      const start = new Date(now);
      const day = start.getDay();
      const diff = day === 0 ? -6 : 1 - day;

      start.setDate(start.getDate() + diff);

      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      return `${formatDateOnly(toYMD(start))} – ${formatDateOnly(toYMD(end))}`;
    }

    if (period === "yearly") {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);

      return `${formatDateOnly(toYMD(start))} – ${formatDateOnly(toYMD(end))}`;
    }

    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return `${formatDateOnly(toYMD(start))} – ${formatDateOnly(toYMD(end))}`;
  }, [from, period, to]);

  const channelLabel =
    CHANNELS.find((item) => item.key === channel)?.label || "All Channels";
  const paymentLabel =
    PAYMENT_TYPES.find((item) => item.key === payment)?.label || "All Payments";

  const exportExcel = async () => {
    if (!data) return;
    setExporting(true);

    try {
      let exportData = data;
      let periodLabel = reportDateRangeLabel;

      if (exportScope === "all") {
        const response = await api.get("/sales/report", {
          params: {
            period: "all",
            channel: channel,
            payment: payment,
          },
        });
        exportData = response.data;
        periodLabel = "All Time (Complete History)";
      }

      // Isolate the data variables so we format the correct target data
      const exSummary = exportData?.summary || {};
      const exSalesByChannel = exportData?.sales_by_channel || [];
      const exPaymentMethods = exportData?.payment_methods || [];
      const exVisibleProducts = (exportData?.products || [])
        .filter((row) => Number(row?.gross_order_value || 0) > 0)
        .slice(0, 10);
      const exOutstandingOrders = (exportData?.orders || [])
        .filter((row) => Number(row?.remaining_balance || 0) > 0)
        .sort(
          (a, b) =>
            Number(b?.remaining_balance || 0) -
            Number(a?.remaining_balance || 0),
        );
      const exChannelTotal = exSalesByChannel.reduce(
        (sum, row) => sum + Number(row?.sales_revenue || 0),
        0,
      );
      const exCollectionTotal = Number(exSummary.actual_collected || 0);

      // Create a new Excel workbook
      const wb = XLSX.utils.book_new();
      const excelData = [];

      const titleStyle = { font: { bold: true, color: { rgb: "000000" } } };

      const tableHeaderStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "000000" } },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } },
        },
      };

      const cellStyleLight = {
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } },
        },
      };

      const cellStyleDark = {
        fill: { fgColor: { rgb: "F3F4F6" } },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } },
        },
      };

      const t = (text) => ({ v: text, s: titleStyle });
      const th = (text) => ({ v: text, s: tableHeaderStyle });
      const c = (val, rowIndex) => ({
        v: val ?? "",
        s: rowIndex % 2 === 0 ? cellStyleLight : cellStyleDark,
      });

      // 1. Report Metadata
      excelData.push([t("SPIRAL WOOD SERVICES - SALES PERFORMANCE REPORT")]);
      excelData.push([
        { v: "Channel:", s: titleStyle },
        exportScope === "all" ? "All Channels" : channelLabel,
      ]);
      excelData.push([
        { v: "Payment:", s: titleStyle },
        exportScope === "all" ? "All Payments" : paymentLabel,
      ]);
      excelData.push([{ v: "Period:", s: titleStyle }, periodLabel]);
      excelData.push([
        { v: "Generated:", s: titleStyle },
        new Date().toLocaleString("en-PH"),
      ]);
      excelData.push([]);

      // 2. Financial Overview
      excelData.push([t("1. FINANCIAL OVERVIEW")]);
      excelData.push(
        [
          "Order Value",
          "Verified Collections",
          "Balance Due",
          "Sales Orders",
          "Avg. Order Value",
        ].map(th),
      );
      excelData.push(
        [
          Number(exSummary.gross_order_value || 0),
          Number(exSummary.actual_collected || 0),
          Number(exSummary.outstanding_balance || 0),
          Number(exSummary.total_orders || 0),
          Number(exSummary.avg_order_value || 0),
        ].map((val) => c(val, 0)),
      );
      excelData.push([]);

      // 3. Sales by Channel
      excelData.push([t("2. SALES BY CHANNEL")]);
      excelData.push(
        ["Channel", "Sales Orders", "Order Value", "Share of Order Value"].map(
          th,
        ),
      );
      if (exSalesByChannel.length > 0) {
        exSalesByChannel.forEach((row, idx) => {
          excelData.push(
            [
              salesChannelLabel(row.channel),
              Number(row.order_count || 0),
              Number(row.sales_revenue || 0),
              percentage(row.sales_revenue, exChannelTotal),
            ].map((val) => c(val, idx)),
          );
        });
      } else {
        excelData.push([
          c("No channel data for this period", 0),
          c("", 0),
          c("", 0),
          c("", 0),
        ]);
      }
      excelData.push([]);

      // 4. Top Products
      excelData.push([t("3. TOP PRODUCTS BY ORDER VALUE")]);
      excelData.push(
        ["Product", "Units Ordered", "Order Value", "Share of Order Value"].map(
          th,
        ),
      );
      if (exVisibleProducts.length > 0) {
        exVisibleProducts.forEach((row, idx) => {
          excelData.push(
            [
              row.product_name || "—",
              Number(row.units_sold || 0),
              Number(row.gross_order_value || 0),
              percentage(row.gross_order_value, exSummary.gross_order_value),
            ].map((val) => c(val, idx)),
          );
        });
      } else {
        excelData.push([
          c("No product data for this period", 0),
          c("", 0),
          c("", 0),
          c("", 0),
        ]);
      }
      excelData.push([]);

      // 5. Payment Collections
      excelData.push([t("4. PAYMENT COLLECTIONS")]);
      excelData.push(
        [
          "Payment Method",
          "Verified Payments",
          "Collected Amount",
          "Share of Collections",
        ].map(th),
      );
      if (exPaymentMethods.length > 0) {
        exPaymentMethods.forEach((row, idx) => {
          excelData.push(
            [
              paymentMethodLabel(row.payment_method),
              Number(row.transaction_count || 0),
              Number(row.total_amount || 0),
              percentage(row.total_amount, exCollectionTotal),
            ].map((val) => c(val, idx)),
          );
        });
      } else {
        excelData.push([
          c("No payment data for this period", 0),
          c("", 0),
          c("", 0),
          c("", 0),
        ]);
      }
      excelData.push([]);

      // 6. Outstanding Balances
      excelData.push([t("5. OUTSTANDING BALANCES")]);
      excelData.push(
        [
          "Order Number",
          "Customer",
          "Channel",
          "Order Type",
          "Order Value",
          "Paid to Date",
          "Balance Due",
          "Payment Status",
        ].map(th),
      );
      if (exOutstandingOrders.length > 0) {
        exOutstandingOrders.forEach((row, idx) => {
          excelData.push(
            [
              row.order_number || `#${row.id}`,
              row.customer_name || "—",
              salesChannelLabel(row.channel),
              humanize(row.order_type),
              Number(row.total_amount || 0),
              Number(row.lifetime_collected || 0),
              Number(row.remaining_balance || 0),
              humanize(row.payment_status),
            ].map((val) => c(val, idx)),
          );
        });
      } else {
        excelData.push([
          c("No outstanding balances for this period", 0),
          c("", 0),
          c("", 0),
          c("", 0),
          c("", 0),
          c("", 0),
          c("", 0),
          c("", 0),
        ]);
      }

      const ws = XLSX.utils.aoa_to_sheet(excelData);

      const colWidths = [];
      excelData.forEach((row) => {
        row.forEach((cell, colIndex) => {
          const cellValue = cell && cell.v ? String(cell.v) : "";
          const textLength = cellValue.length;
          if (
            !colWidths[colIndex] ||
            colWidths[colIndex].wch < textLength + 3
          ) {
            colWidths[colIndex] = { wch: textLength + 3 };
          }
        });
      });

      ws["!cols"] = colWidths.map((col) => ({
        wch: Math.min(Math.max(col.wch, 12), 65),
      }));

      XLSX.utils.book_append_sheet(wb, ws, "Sales Report");

      const safeChannel = exportScope === "all" ? "all" : channel || "all";
      const safePeriod =
        exportScope === "all" ? "lifetime" : period || "report";
      XLSX.writeFile(
        wb,
        `wisdom_sales_report_${safeChannel}_${safePeriod}.xlsx`,
      );

      setExportOpen(false);
      toast.success("Sales report downloaded successfully.");
    } catch (err) {
      toast.error("Failed to generate the export file.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div id="print-area" className="sales-admin-v3">
      <div className="sales-page-header">
        <div>
          <h1>Sales Report</h1>
          <p>
            Review priced sales orders, verified collections, outstanding
            balances, and product performance.
          </p>
        </div>

        <div className="sales-header-actions no-print">
          <button
            type="button"
            className="sales-button sales-button-primary"
            onClick={() => setExportOpen(true)}
            disabled={!data}
          >
            Export Report
          </button>
          <button
            type="button"
            className="sales-button sales-button-secondary"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>
      </div>

      <div className="sales-toolbar no-print">
        <div className="sales-toolbar-row">
          <label className="sales-filter-field">
            <span className="sales-filter-label">Sales Channel</span>
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              {CHANNELS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="sales-filter-field">
            <span className="sales-filter-label">Payment Type</span>
            <select
              value={payment}
              onChange={(event) => setPayment(event.target.value)}
            >
              {PAYMENT_TYPES.map((item) => (
                <option key={item.key || "all"} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="sales-filter-field">
            <span className="sales-filter-label">Report Period</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              {PERIODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {period === "custom" ? (
            <>
              <label className="sales-filter-field">
                <span className="sales-filter-label">From Date</span>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>

              <label className="sales-filter-field">
                <span className="sales-filter-label">To Date</span>
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>

              <button
                type="button"
                className="sales-button sales-button-primary sales-custom-apply"
                onClick={load}
                disabled={!from || !to || from > to || loading}
              >
                Apply Date Range
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <div className="sales-error">{error}</div> : null}
      {loading ? <div className="sales-loading">Loading report...</div> : null}

      {!loading && data ? (
        <>
          <div className="sales-summary-grid">
            <SummaryCard
              label="Order Value"
              value={money(summary.gross_order_value)}
              note="Priced, non-cancelled orders in this period"
            />
            <SummaryCard
              label="Verified Collections"
              value={money(summary.actual_collected)}
              note={`${count(summary.collection_count)} verified payment${
                Number(summary.collection_count || 0) === 1 ? "" : "s"
              } in this period`}
            />
            <SummaryCard
              label="Balance Due"
              value={money(summary.outstanding_balance)}
              note="Current unpaid balance on included sales orders"
            />
            <SummaryCard
              label="Sales Orders"
              value={count(summary.total_orders)}
              note="Priced, non-cancelled orders"
            />
            <SummaryCard
              label="Avg. Order Value"
              value={money(summary.avg_order_value)}
              note="Average value of included sales orders"
            />
          </div>

          <section className="sales-card sales-table-card">
            <SectionHeader
              title="Verified Payments"
              subtitle={`${count(collections.length)} verified payment${
                collections.length === 1 ? "" : "s"
              } recorded in the selected period`}
            />

            <div className="sales-table-scroll sales-table-scroll-payments">
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Payment Date</th>
                    <th>Receipt Number</th>
                    <th>Order Number</th>
                    <th>Customer</th>
                    <th>Payment Method</th>
                    <th className="sales-align-right">Amount</th>
                    <th>Order Status</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.length === 0 ? (
                    <EmptyRow
                      colSpan={7}
                      text="No verified payments for this period."
                    />
                  ) : (
                    collections.map((row) => (
                      <tr
                        key={row.payment_transaction_id}
                        className="sales-body-row sales-clickable-row"
                        onClick={() =>
                          navigate(`/admin/orders/${row.order_id}`)
                        }
                      >
                        <td>{dateTime(row.payment_date)}</td>
                        <td>{row.receipt_number || "—"}</td>
                        <td className="sales-key-text">
                          {row.order_number || `#${row.order_id}`}
                        </td>
                        <td>{row.customer_name || "—"}</td>
                        <td>{paymentMethodLabel(row.payment_method)}</td>
                        <td className="sales-align-right sales-key-amount">
                          {money(row.amount)}
                        </td>
                        <td>
                          <Badge value={row.order_status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sales-card sales-table-card">
            <SectionHeader
              title="Order Financial Status"
              subtitle="Order value, total verified payments to date, current balance, and status"
            />

            <div className="sales-table-scroll sales-table-scroll-orders">
              <table className="sales-table sales-orders-table">
                <thead>
                  <tr>
                    <th>Order Number</th>
                    <th>Customer</th>
                    <th>Channel</th>
                    <th>Order Type</th>
                    <th className="sales-align-right">Order Value</th>
                    <th className="sales-align-right">Paid to Date</th>
                    <th className="sales-align-right">Balance Due</th>
                    <th>Payment Status</th>
                    <th>Order Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <EmptyRow
                      colSpan={9}
                      text="No matching priced sales orders for this period."
                    />
                  ) : (
                    orders.map((row) => (
                      <tr
                        key={row.id}
                        className="sales-body-row sales-clickable-row"
                        onClick={() => navigate(`/admin/orders/${row.id}`)}
                      >
                        <td className="sales-key-text">
                          {row.order_number || `#${row.id}`}
                        </td>
                        <td>{row.customer_name || "—"}</td>
                        <td>{salesChannelLabel(row.channel)}</td>
                        <td>{humanize(row.order_type)}</td>
                        <td className="sales-align-right">
                          {money(row.total_amount)}
                        </td>
                        <td className="sales-align-right sales-key-amount">
                          {money(row.lifetime_collected)}
                        </td>
                        <td className="sales-align-right">
                          {money(row.remaining_balance)}
                        </td>
                        <td>
                          <Badge value={row.payment_status} />
                        </td>
                        <td>
                          <Badge value={row.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="sales-bottom-grid">
            <section className="sales-card sales-channel-card">
              <SectionHeader
                title="Sales by Channel"
                subtitle="Priced sales orders by sales channel"
              />

              <div className="sales-channel-list">
                {salesByChannel.map((row) => (
                  <div key={row.channel} className="sales-channel-row">
                    <div>
                      <div className="sales-channel-name">
                        {salesChannelLabel(row.channel)}
                      </div>
                      <div className="sales-channel-meta">
                        {count(row.order_count)} sales order
                        {Number(row.order_count || 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="sales-channel-amount">
                      {money(row.sales_revenue)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="sales-card sales-payment-method-card">
              <SectionHeader
                title="Collection Breakdown"
                subtitle="Verified collections by payment method"
              />

              <div className="sales-payment-method-list">
                {paymentMethods.length === 0 ? (
                  <div className="sales-small-empty">
                    No verified payments for this period.
                  </div>
                ) : (
                  paymentMethods.map((row) => (
                    <div
                      key={row.payment_method}
                      className="sales-payment-method-row"
                    >
                      <div>
                        <div className="sales-payment-method-name">
                          {paymentMethodLabel(row.payment_method)}
                        </div>
                        <div className="sales-payment-method-meta">
                          {count(row.transaction_count)} verified payment
                          {Number(row.transaction_count || 0) === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="sales-payment-method-amount">
                        {money(row.total_amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="sales-card sales-top-products-card">
              <SectionHeader
                title="Top Products by Order Value"
                subtitle="Highest-value products from priced sales orders"
              />

              <div className="sales-table-scroll sales-table-scroll-products">
                <table className="sales-table sales-products-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="sales-align-right">Units Ordered</th>
                      <th className="sales-align-right">Order Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.length === 0 ? (
                      <EmptyRow
                        colSpan={3}
                        text="No priced product sales for this period."
                      />
                    ) : (
                      visibleProducts.map((row, index) => (
                        <tr key={`${row.product_name}-${index}`}>
                          <td className="sales-product-name">
                            {row.product_name || "—"}
                          </td>
                          <td className="sales-align-right">
                            {quantity(row.units_sold)}
                          </td>
                          <td className="sales-align-right sales-key-amount">
                            {money(row.gross_order_value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      ) : null}

      {exportOpen && (
        <div className="sales-modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-sales-title"
            className="sales-dialog"
          >
            <div className="sales-dialog-eyebrow">Sales Report</div>
            <h2 id="export-sales-title" className="sales-dialog-title">
              Export sales report
            </h2>
            <p className="sales-dialog-text">
              Create an Excel report of your sales performance based on your
              currently selected filters.
            </p>

            <div className="sales-export-scope-list">
              <button
                type="button"
                onClick={() => setExportScope("filtered")}
                className={`sales-export-scope-option ${exportScope === "filtered" ? "sales-export-scope-selected" : ""}`}
                disabled={exporting}
              >
                <span className="sales-export-scope-title">
                  Current filters
                </span>
                <span className="sales-export-scope-meta">
                  {count(summary.total_orders)} sales orders ·{" "}
                  {reportDateRangeLabel}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExportScope("all")}
                className={`sales-export-scope-option ${exportScope === "all" ? "sales-export-scope-selected" : ""}`}
                disabled={exporting}
              >
                <span className="sales-export-scope-title">All sales</span>
                <span className="sales-export-scope-meta">
                  Entire sales history
                </span>
              </button>
            </div>

            <div className="sales-export-contents">
              <div className="sales-export-contents-label">
                Included in Excel
              </div>
              <div className="sales-export-contents-text">
                Financial overview, sales by channel, top products, payment
                collections, and outstanding balances.
              </div>
            </div>

            <div className="sales-dialog-actions">
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="sales-button sales-button-secondary"
                disabled={exporting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={exportExcel}
                className="sales-button sales-button-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
                disabled={exporting}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M12 18v-6" />
                  <path d="m9 15 3 3 3-3" />
                </svg>
                {exporting ? "Preparing..." : "Export Excel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT-ONLY SALES REPORT */}
      <div className="sales-print-report">
        <div className="sales-print-header">
          <h1>SPIRAL WOOD SERVICES</h1>
          <h2>SALES PERFORMANCE REPORT</h2>

          <div className="sales-print-meta">
            <span>
              <strong>Channel:</strong> {channelLabel}
            </span>
            <span>
              <strong>Period:</strong> {reportDateRangeLabel}
            </span>
            <span>
              <strong>Generated:</strong> {new Date().toLocaleString("en-PH")}
            </span>
          </div>

          <p className="sales-print-scope">
            Priced non-cancelled orders created in the selected period.
            Collections are verified payments recorded in the selected period.
          </p>
        </div>

        <section className="sales-print-section">
          <h3>1. Financial Overview</h3>
          <table>
            <thead>
              <tr>
                <th>Order Value</th>
                <th>Verified Collections</th>
                <th>Balance Due</th>
                <th>Sales Orders</th>
                <th>Avg. Order Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{money(summary.gross_order_value)}</td>
                <td>{money(summary.actual_collected)}</td>
                <td>{money(summary.outstanding_balance)}</td>
                <td>{count(summary.total_orders)}</td>
                <td>{money(summary.avg_order_value)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>2. Sales by Channel</h3>
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Sales Orders</th>
                <th>Order Value</th>
                <th>Share of Order Value</th>
              </tr>
            </thead>
            <tbody>
              {salesByChannel.map((row) => (
                <tr key={row.channel}>
                  <td>{salesChannelLabel(row.channel)}</td>
                  <td>{count(row.order_count)}</td>
                  <td>{money(row.sales_revenue)}</td>
                  <td>
                    {percentage(row.sales_revenue, channelOrderValueTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>3. Top Products by Order Value</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Units Ordered</th>
                <th>Order Value</th>
                <th>Share of Order Value</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.length === 0 ? (
                <tr>
                  <td colSpan="4">No priced product sales for this period.</td>
                </tr>
              ) : (
                visibleProducts.map((row, index) => (
                  <tr key={`${row.product_name}-${index}`}>
                    <td>{row.product_name || "—"}</td>
                    <td>{quantity(row.units_sold)}</td>
                    <td>{money(row.gross_order_value)}</td>
                    <td>
                      {percentage(
                        row.gross_order_value,
                        summary.gross_order_value,
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>4. Payment Collections</h3>
          <table>
            <thead>
              <tr>
                <th>Payment Method</th>
                <th>Verified Payments</th>
                <th>Collected Amount</th>
                <th>Share of Collections</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.length === 0 ? (
                <tr>
                  <td colSpan="4">No verified payments for this period.</td>
                </tr>
              ) : (
                paymentMethods.map((row) => (
                  <tr key={row.payment_method}>
                    <td>{paymentMethodLabel(row.payment_method)}</td>
                    <td>{count(row.transaction_count)}</td>
                    <td>{money(row.total_amount)}</td>
                    <td>{percentage(row.total_amount, collectionTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>5. Outstanding Balances</h3>
          <table>
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Customer</th>
                <th>Channel</th>
                <th>Order Type</th>
                <th>Order Value</th>
                <th>Paid to Date</th>
                <th>Balance Due</th>
                <th>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {outstandingOrders.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    No outstanding balances for the selected report scope.
                  </td>
                </tr>
              ) : (
                outstandingOrders.map((row) => (
                  <tr key={row.id}>
                    <td>{row.order_number || `#${row.id}`}</td>
                    <td>{row.customer_name || "—"}</td>
                    <td>{salesChannelLabel(row.channel)}</td>
                    <td>{humanize(row.order_type)}</td>
                    <td>{money(row.total_amount)}</td>
                    <td>{money(row.lifetime_collected)}</td>
                    <td>{money(row.remaining_balance)}</td>
                    <td>{humanize(row.payment_status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <div className="sales-print-footer">
          Internal sales report · Spiral Wood Services
        </div>
      </div>
    </div>
  );
}

// WISDOM SALES REPORT PROFESSIONAL MANAGEMENT REPORT V2
