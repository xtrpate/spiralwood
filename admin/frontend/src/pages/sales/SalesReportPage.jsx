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
  const channel = String(value || "").trim().toLowerCase();
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

  const exportPDF = () => {
    if (!data) return;

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const footerY = pageHeight - 7;

    doc.setProperties({
      title: `Spiral Wood Services Sales Report - ${reportDateRangeLabel}`,
      subject: "Sales performance and collection report",
      author: "Spiral Wood Services",
      creator: "WISDOM",
    });

    const tableBase = {
      theme: "striped",
      margin: { left: marginX, right: marginX, bottom: 15 },
      styles: {
        font: "helvetica",
        fontSize: 7.6,
        cellPadding: 2.7,
        textColor: [45, 49, 55],
        lineColor: [225, 228, 232],
        lineWidth: 0.1,
        valign: "middle",
      },
      headStyles: {
        fillColor: [24, 24, 27],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        lineColor: [24, 24, 27],
      },
      alternateRowStyles: {
        fillColor: [248, 248, 249],
      },
    };

    const addPageFooter = () => {
      const pageCount = doc.internal.getNumberOfPages();
      const generatedLabel = pdfText(
        new Date().toLocaleString("en-PH", {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );

      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(225, 228, 232);
        doc.line(marginX, footerY - 4, pageWidth - marginX, footerY - 4);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.8);
        doc.setTextColor(120, 120, 120);
        doc.text(
          `Internal Sales Report | Generated ${generatedLabel}`,
          marginX,
          footerY,
        );
        doc.text(`Page ${page} of ${pageCount}`, pageWidth - marginX, footerY, {
          align: "right",
        });
      }
    };

    const addSectionTitle = (number, title, y) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(24, 24, 27);
      doc.text(`${number}. ${title.toUpperCase()}`, marginX, y);
      return y + 4;
    };

    const ensureSpace = (currentY, minimumHeight = 34) => {
      if (currentY + minimumHeight <= pageHeight - 17) return currentY;
      doc.addPage();
      return 17;
    };

    doc.setTextColor(17, 17, 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("SPIRAL WOOD SERVICES", marginX, 16);

    doc.setFontSize(11);
    doc.text("SALES PERFORMANCE REPORT", marginX, 23);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(82, 82, 91);
    doc.text(`Channel: ${pdfText(channelLabel)}`, marginX, 31);
    doc.text(`Period: ${pdfText(reportDateRangeLabel)}`, marginX + 72, 31);

    doc.setFontSize(7.2);
    doc.setTextColor(113, 113, 122);
    doc.text(
      "Scope: priced non-cancelled orders created in the selected period; collections are verified payments recorded in the selected period.",
      marginX,
      37,
    );

    doc.setDrawColor(24, 24, 27);
    doc.setLineWidth(0.4);
    doc.line(marginX, 41, pageWidth - marginX, 41);

    let currentY = addSectionTitle(1, "Financial Overview", 49);

    autoTable(doc, {
      ...tableBase,
      startY: currentY,
      head: [
        [
          "Order Value",
          "Verified Collections",
          "Balance Due",
          "Sales Orders",
          "Avg. Order Value",
        ],
      ],
      body: [
        [
          pdfMoney(summary.gross_order_value),
          pdfMoney(summary.actual_collected),
          pdfMoney(summary.outstanding_balance),
          count(summary.total_orders),
          pdfMoney(summary.avg_order_value),
        ],
      ],
      styles: {
        ...tableBase.styles,
        halign: "center",
        fontSize: 8,
        cellPadding: 3.3,
      },
      bodyStyles: {
        fontStyle: "bold",
        textColor: [24, 24, 27],
      },
    });

    currentY = doc.lastAutoTable.finalY + 9;
    currentY = ensureSpace(currentY, 38);
    currentY = addSectionTitle(2, "Sales by Channel", currentY);

    autoTable(doc, {
      ...tableBase,
      startY: currentY,
      head: [["Channel", "Sales Orders", "Order Value", "Share of Order Value"]],
      body: salesByChannel.map((row) => [
        salesChannelLabel(row.channel),
        count(row.order_count),
        pdfMoney(row.sales_revenue),
        percentage(row.sales_revenue, channelOrderValueTotal),
      ]),
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    currentY = doc.lastAutoTable.finalY + 9;
    currentY = ensureSpace(currentY, 55);
    currentY = addSectionTitle(3, "Top Products by Order Value", currentY);

    autoTable(doc, {
      ...tableBase,
      startY: currentY,
      head: [["Product", "Units Ordered", "Order Value", "Share of Order Value"]],
      body:
        visibleProducts.length > 0
          ? visibleProducts.map((row) => [
              pdfText(row.product_name || "-"),
              quantity(row.units_sold),
              pdfMoney(row.gross_order_value),
              percentage(row.gross_order_value, summary.gross_order_value),
            ])
          : [["No priced product sales for this period.", "", "", ""]],
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    currentY = doc.lastAutoTable.finalY + 9;
    currentY = ensureSpace(currentY, 42);
    currentY = addSectionTitle(4, "Payment Collections", currentY);

    autoTable(doc, {
      ...tableBase,
      startY: currentY,
      head: [
        [
          "Payment Method",
          "Verified Payments",
          "Collected Amount",
          "Share of Collections",
        ],
      ],
      body:
        paymentMethods.length > 0
          ? paymentMethods.map((row) => [
              pdfText(paymentMethodLabel(row.payment_method)),
              count(row.transaction_count),
              pdfMoney(row.total_amount),
              percentage(row.total_amount, collectionTotal),
            ])
          : [["No verified payments for this period.", "", "", ""]],
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    currentY = doc.lastAutoTable.finalY + 9;
    currentY = ensureSpace(currentY, 48);
    currentY = addSectionTitle(5, "Outstanding Balances", currentY);

    autoTable(doc, {
      ...tableBase,
      startY: currentY,
      head: [
        [
          "Order Number",
          "Customer",
          "Channel",
          "Order Type",
          "Order Value",
          "Paid to Date",
          "Balance Due",
          "Payment Status",
        ],
      ],
      body:
        outstandingOrders.length > 0
          ? outstandingOrders.map((row) => [
              pdfText(row.order_number || `#${row.id}`),
              pdfText(row.customer_name || "-"),
              salesChannelLabel(row.channel),
              humanize(row.order_type),
              pdfMoney(row.total_amount),
              pdfMoney(row.lifetime_collected),
              pdfMoney(row.remaining_balance),
              humanize(row.payment_status),
            ])
          : [
              [
                "No outstanding balances for the selected report scope.",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
              ],
            ],
      styles: {
        ...tableBase.styles,
        fontSize: 6.9,
        cellPadding: 2.3,
      },
      columnStyles: {
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
      },
    });

    addPageFooter();

    const safeChannel = channel || "all";
    const safePeriod = period || "report";

    doc.save(`wisdom_sales_report_${safeChannel}_${safePeriod}.pdf`);
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
