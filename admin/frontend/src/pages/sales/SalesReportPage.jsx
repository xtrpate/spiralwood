import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./SalesReportPage.css";

const CHANNELS = [
  { key: "", label: "All Channels" },
  { key: "online", label: "Online" },
  { key: "walkin", label: "Walk-in" },
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
  const [period, setPeriod] = useState("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const load = useCallback(async () => {
    if (period === "custom" && (!from || !to || from > to)) return;

    setLoading(true);
    setError("");

    try {
      const params = { channel };

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
  }, [channel, from, period, to]);

  useEffect(() => {
    if (period !== "custom") load();
  }, [load, period]);

  const summary = data?.summary || {};
  const collections = data?.collections || [];
  const orders = data?.orders || [];
  const paymentMethods = data?.payment_methods || [];
  const products = data?.products || [];

  const visibleProducts = useMemo(
    () =>
      products
        .filter((row) => Number(row?.gross_order_value || 0) > 0)
        .slice(0, 10),
    [products],
  );

  const selectedPeriodLabel = useMemo(() => {
    if (period === "custom") return `${from || "—"} to ${to || "—"}`;
    return PERIODS.find((item) => item.value === period)?.label || period;
  }, [from, period, to]);

  const channelLabel =
    CHANNELS.find((item) => item.key === channel)?.label || "All Channels";

  const exportPDF = () => {
    if (!data) return;

    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFontSize(16).setFont("helvetica", "bold");
    doc.text("Spiral Wood Services", 148, 14, { align: "center" });

    doc.setFontSize(12);
    doc.text(`Sales Report — ${channelLabel}`, 148, 22, { align: "center" });

    doc.setFontSize(9).setFont("helvetica", "normal");
    doc.text(`Period: ${selectedPeriodLabel}`, 14, 31);
    doc.text(`Generated: ${new Date().toLocaleString("en-PH")}`, 190, 31);

    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.text(`Order Value: ${money(summary.gross_order_value)}`, 14, 40);
    doc.text(`Collected Payments: ${money(summary.actual_collected)}`, 66, 40);
    doc.text(
      `Outstanding Balance: ${money(summary.outstanding_balance)}`,
      132,
      40,
    );
    doc.text(`Orders: ${summary.total_orders || 0}`, 210, 40);
    doc.text(`Average Order Value: ${money(summary.avg_order_value)}`, 240, 40);

    autoTable(doc, {
      startY: 47,
      head: [
        [
          "Payment Date",
          "Receipt",
          "Order ID",
          "Customer",
          "Payment Method",
          "Amount",
          "Order Status",
        ],
      ],
      body: collections.map((row) => [
        dateTime(row.payment_date),
        row.receipt_number || "—",
        row.order_number || `#${row.order_id}`,
        row.customer_name || "—",
        paymentMethodLabel(row.payment_method),
        Number(row.amount || 0).toFixed(2),
        humanize(row.order_status),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [24, 24, 27] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [
        [
          "Order ID",
          "Customer",
          "Sales Type",
          "Order Value",
          "Collected",
          "Balance",
          "Payment Status",
          "Order Status",
        ],
      ],
      body: orders.map((row) => [
        row.order_number || `#${row.id}`,
        row.customer_name || "—",
        `${humanize(row.channel)} · ${humanize(row.order_type)}`,
        Number(row.total_amount || 0).toFixed(2),
        Number(row.collected_this_period || 0).toFixed(2),
        Number(row.remaining_balance || 0).toFixed(2),
        humanize(row.payment_status),
        humanize(row.status),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [39, 39, 42] },
    });

    if (visibleProducts.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [["Product", "Units", "Order Value"]],
        body: visibleProducts.map((row) => [
          row.product_name || "—",
          quantity(row.units_sold),
          Number(row.gross_order_value || 0).toFixed(2),
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [39, 39, 42] },
      });
    }

    doc.save(`wisdom_sales_report_${channel || "all"}.pdf`);
  };

  return (
    <div id="print-area" className="sales-admin-v3">
      <div className="sales-page-header">
        <div>
          <h1>Sales Report</h1>
          <p>
            Review order value, collected payments, balances, and sales
            performance.
          </p>
        </div>

        <div className="sales-header-actions no-print">
          <button
            type="button"
            className="sales-button sales-button-primary"
            onClick={exportPDF}
            disabled={!data}
          >
            Export PDF
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
              note="Non-cancelled orders in this period"
            />
            <SummaryCard
              label="Collected Payments"
              value={money(summary.actual_collected)}
              note={`${summary.collection_count || 0} verified payment${
                Number(summary.collection_count || 0) === 1 ? "" : "s"
              }`}
            />
            <SummaryCard
              label="Outstanding Balance"
              value={money(summary.outstanding_balance)}
              note="Remaining unpaid amount"
            />
            <SummaryCard
              label="Orders"
              value={summary.total_orders || 0}
              note="Non-cancelled orders"
            />
            <SummaryCard
              label="Average Order Value"
              value={money(summary.avg_order_value)}
              note="Average value per order"
            />
          </div>

          <section className="sales-card sales-table-card">
            <SectionHeader
              title="Recent Payments"
              subtitle={`${collections.length} verified payment${
                collections.length === 1 ? "" : "s"
              } in the selected period`}
            />

            <div className="sales-table-scroll sales-table-scroll-payments">
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Payment Date</th>
                    <th>Receipt</th>
                    <th>Order ID</th>
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
              title="Orders and Balances"
              subtitle="Order values, payments collected in this report period, and current remaining balances"
            />

            <div className="sales-table-scroll sales-table-scroll-orders">
              <table className="sales-table sales-orders-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Sales Type</th>
                    <th className="sales-align-right">Order Value</th>
                    <th className="sales-align-right">Collected</th>
                    <th className="sales-align-right">Balance</th>
                    <th>Payment Status</th>
                    <th>Order Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <EmptyRow
                      colSpan={8}
                      text="No matching orders for this period."
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
                        <td>
                          {humanize(row.channel)} · {humanize(row.order_type)}
                        </td>
                        <td className="sales-align-right">
                          {money(row.total_amount)}
                        </td>
                        <td className="sales-align-right sales-key-amount">
                          {money(row.collected_this_period)}
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
            <section className="sales-card sales-payment-method-card">
              <SectionHeader
                title="Payments by Method"
                subtitle="Verified payments in the selected period"
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
                          {row.transaction_count} payment
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
                title="Top Products"
                subtitle="Highest order value in the selected period"
              />

              <div className="sales-table-scroll sales-table-scroll-products">
                <table className="sales-table sales-products-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="sales-align-right">Units</th>
                      <th className="sales-align-right">Order Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.length === 0 ? (
                      <EmptyRow
                        colSpan={3}
                        text="No product order value for this period."
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
                          <td className="sales-align-right">
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
    </div>
  );
}

// WISDOM SALES REPORT PROFESSIONAL UI V1
