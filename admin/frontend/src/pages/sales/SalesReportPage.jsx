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
  const printProducts = data?.print_products || [];

  const productPerformance = useMemo(() => {
    const productMap = new Map();

    printProducts.forEach((row) => {
      const key = String(row.product_name || "—");

      const existing = productMap.get(key) || {
        product_name: key,
        unit_price: Number(row.unit_price || 0),
        units_sold: 0,
        sales_amount: 0,
      };

      existing.units_sold += Number(row.units_sold || 0);
      existing.sales_amount += Number(row.sales_amount || 0);

      if (Number(row.unit_price || 0) > 0) {
        existing.unit_price = Number(row.unit_price);
      }

      productMap.set(key, existing);
    });

    return Array.from(productMap.values()).sort(
      (a, b) => b.sales_amount - a.sales_amount,
    );
  }, [printProducts]);

  const visibleProducts = useMemo(
    () =>
      products
        .filter((row) => Number(row?.gross_order_value || 0) > 0)
        .slice(0, 10),
    [products],
  );

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

    const addPageFooter = () => {
      const pageCount = doc.internal.getNumberOfPages();

      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);

        doc.text(`Generated: ${new Date().toLocaleString("en-PH")}`, 14, 202);

        doc.text(`Page ${page} of ${pageCount}`, pageWidth - 14, 202, {
          align: "right",
        });
      }
    };

    // -------------------------------------------------------
    // HEADER
    // -------------------------------------------------------

    doc.setTextColor(17, 17, 17);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("SPIRAL WOOD SERVICES", pageWidth / 2, 15, {
      align: "center",
    });

    doc.setFontSize(12);
    doc.text("SALES REPORT", pageWidth / 2, 22, {
      align: "center",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    doc.text(`Sales Channel: ${channelLabel}`, 14, 31);

    doc.text(`Period: ${reportDateRangeLabel}`, 14, 36);

    // -------------------------------------------------------
    // 1. SALES SUMMARY
    // -------------------------------------------------------

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("1. SALES SUMMARY", 14, 47);

    autoTable(doc, {
      startY: 51,
      head: [["Channel", "Orders", "Sales Revenue"]],
      body: [
        ...salesByChannel.map((row) => [
          humanize(row.channel),
          quantity(row.order_count),
          money(row.sales_revenue),
        ]),
        [
          "COMBINED",
          quantity(summary.total_orders),
          money(summary.gross_order_value),
        ],
      ],
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [24, 24, 27],
        textColor: 255,
        fontStyle: "bold",
      },
      didParseCell: (hookData) => {
        if (
          hookData.section === "body" &&
          hookData.row.index === salesByChannel.length
        ) {
          hookData.cell.styles.fontStyle = "bold";
        }
      },
    });

    // -------------------------------------------------------
    // KEY FINANCIAL FIGURES
    // -------------------------------------------------------

    let currentY = doc.lastAutoTable.finalY + 8;

    autoTable(doc, {
      startY: currentY,
      head: [
        [
          "Total Sales",
          "Collected Payments",
          "Outstanding Balance",
          "Orders",
          "Average Order Value",
        ],
      ],
      body: [
        [
          money(summary.gross_order_value),
          money(summary.actual_collected),
          money(summary.outstanding_balance),
          quantity(summary.total_orders),
          money(summary.avg_order_value),
        ],
      ],
      styles: {
        fontSize: 8,
        cellPadding: 3,
        halign: "center",
      },
      headStyles: {
        fillColor: [39, 39, 42],
        textColor: 255,
        fontStyle: "bold",
      },
    });

    // -------------------------------------------------------
    // 2. PRODUCT SALES
    // -------------------------------------------------------

    currentY = doc.lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("2. PRODUCT SALES", 14, currentY);

    autoTable(doc, {
      startY: currentY + 4,
      head: [["Product", "Channel", "Unit Price", "Qty", "Sales Amount"]],
      body:
        printProducts.length > 0
          ? printProducts.map((row) => [
              row.product_name || "—",
              humanize(row.channel),
              money(row.unit_price),
              quantity(row.units_sold),
              money(row.sales_amount),
            ])
          : [["No product sales for this period.", "", "", "", ""]],
      styles: {
        fontSize: 7.5,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [39, 39, 42],
        textColor: 255,
        fontStyle: "bold",
      },
    });

    // -------------------------------------------------------
    // 3. PRODUCT PERFORMANCE
    // -------------------------------------------------------

    currentY = doc.lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("3. PRODUCT PERFORMANCE", 14, currentY);

    autoTable(doc, {
      startY: currentY + 4,
      head: [["Product", "Unit Price", "Total Qty", "Total Sales"]],
      body:
        productPerformance.length > 0
          ? productPerformance.map((row) => [
              row.product_name,
              money(row.unit_price),
              quantity(row.units_sold),
              money(row.sales_amount),
            ])
          : [["No product sales for this period.", "", "", ""]],
      styles: {
        fontSize: 7.5,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [39, 39, 42],
        textColor: 255,
        fontStyle: "bold",
      },
    });

    // -------------------------------------------------------
    // 4. PAYMENT SUMMARY
    // -------------------------------------------------------

    currentY = doc.lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("4. PAYMENT SUMMARY", 14, currentY);

    autoTable(doc, {
      startY: currentY + 4,
      head: [["Payment Method", "Transactions", "Collected Amount"]],
      body:
        paymentMethods.length > 0
          ? paymentMethods.map((row) => [
              paymentMethodLabel(row.payment_method),
              quantity(row.transaction_count),
              money(row.total_amount),
            ])
          : [["No verified payments", "", ""]],
      styles: {
        fontSize: 7.5,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [39, 39, 42],
        textColor: 255,
        fontStyle: "bold",
      },
    });

    // -------------------------------------------------------
    // 5. ORDER BALANCES
    // -------------------------------------------------------

    currentY = doc.lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("5. ORDER BALANCES", 14, currentY);

    autoTable(doc, {
      startY: currentY + 4,
      head: [
        [
          "Order ID",
          "Customer",
          "Channel",
          "Order Value",
          "Collected",
          "Balance",
          "Payment Status",
        ],
      ],
      body:
        orders.length > 0
          ? orders.map((row) => [
              row.order_number || `#${row.id}`,
              row.customer_name || "—",
              humanize(row.channel),
              money(row.total_amount),
              money(row.collected_this_period),
              money(row.remaining_balance),
              humanize(row.payment_status),
            ])
          : [["No matching orders.", "", "", "", "", "", ""]],
      styles: {
        fontSize: 7,
        cellPadding: 2.5,
      },
      headStyles: {
        fillColor: [39, 39, 42],
        textColor: 255,
        fontStyle: "bold",
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

      {/* PRINT-ONLY SALES REPORT */}
      <div className="sales-print-report">
        <div className="sales-print-header">
          <h1>SPIRAL WOOD SERVICES</h1>
          <h2>SALES REPORT</h2>

          <div className="sales-print-meta">
            <span>
              <strong>Sales Channel:</strong> {channelLabel}
            </span>

            <span>
              <strong>Period:</strong> {reportDateRangeLabel}
            </span>

            <span>
              <strong>Generated:</strong> {new Date().toLocaleString("en-PH")}
            </span>
          </div>
        </div>

        <section className="sales-print-section">
          <h3>1. Sales Summary</h3>

          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Orders</th>
                <th>Sales Revenue</th>
              </tr>
            </thead>

            <tbody>
              {salesByChannel.map((row) => (
                <tr key={row.channel}>
                  <td>{humanize(row.channel)}</td>
                  <td>{quantity(row.order_count)}</td>
                  <td>{money(row.sales_revenue)}</td>
                </tr>
              ))}

              <tr className="sales-print-total-row">
                <td>Combined</td>
                <td>{quantity(summary.total_orders)}</td>
                <td>{money(summary.gross_order_value)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>Financial Summary</h3>

          <table>
            <thead>
              <tr>
                <th>Total Sales</th>
                <th>Collected Payments</th>
                <th>Outstanding Balance</th>
                <th>Orders</th>
                <th>Average Order Value</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>{money(summary.gross_order_value)}</td>
                <td>{money(summary.actual_collected)}</td>
                <td>{money(summary.outstanding_balance)}</td>
                <td>{quantity(summary.total_orders)}</td>
                <td>{money(summary.avg_order_value)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>2. Product Sales</h3>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Channel</th>
                <th>Unit Price</th>
                <th>Qty</th>
                <th>Sales Amount</th>
              </tr>
            </thead>

            <tbody>
              {printProducts.length === 0 ? (
                <tr>
                  <td colSpan="5">No product sales for this period.</td>
                </tr>
              ) : (
                printProducts.map((row, index) => (
                  <tr
                    key={`${row.product_name}-${row.channel}-${row.unit_price}-${index}`}
                  >
                    <td>{row.product_name || "—"}</td>
                    <td>{humanize(row.channel)}</td>
                    <td>{money(row.unit_price)}</td>
                    <td>{quantity(row.units_sold)}</td>
                    <td>{money(row.sales_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>3. Product Performance</h3>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit Price</th>
                <th>Total Qty</th>
                <th>Total Sales</th>
              </tr>
            </thead>

            <tbody>
              {productPerformance.length === 0 ? (
                <tr>
                  <td colSpan="4">No product sales for this period.</td>
                </tr>
              ) : (
                productPerformance.map((row) => (
                  <tr key={row.product_name}>
                    <td>{row.product_name}</td>
                    <td>{money(row.unit_price)}</td>
                    <td>{quantity(row.units_sold)}</td>
                    <td>{money(row.sales_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>4. Payment Summary</h3>

          <table>
            <thead>
              <tr>
                <th>Payment Method</th>
                <th>Transactions</th>
                <th>Collected Amount</th>
              </tr>
            </thead>

            <tbody>
              {paymentMethods.length === 0 ? (
                <tr>
                  <td colSpan="3">No verified payments for this period.</td>
                </tr>
              ) : (
                paymentMethods.map((row) => (
                  <tr key={row.payment_method}>
                    <td>{paymentMethodLabel(row.payment_method)}</td>
                    <td>{quantity(row.transaction_count)}</td>
                    <td>{money(row.total_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>5. Order Balances</h3>

          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Channel</th>
                <th>Order Value</th>
                <th>Collected</th>
                <th>Balance</th>
                <th>Payment Status</th>
              </tr>
            </thead>

            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="7">No matching orders for this period.</td>
                </tr>
              ) : (
                orders.map((row) => (
                  <tr key={row.id}>
                    <td>{row.order_number || `#${row.id}`}</td>
                    <td>{row.customer_name || "—"}</td>
                    <td>{humanize(row.channel)}</td>
                    <td>{money(row.total_amount)}</td>
                    <td>{money(row.collected_this_period)}</td>
                    <td>{money(row.remaining_balance)}</td>
                    <td>{humanize(row.payment_status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <div className="sales-print-footer">
          Prepared by Sales Reporting System
        </div>
      </div>
    </div>
  );
}

// WISDOM SALES REPORT PROFESSIONAL UI V1
