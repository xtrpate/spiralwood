import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const TABS = [
  { key: "walkin", label: "POS / Walk-in" },
  { key: "online", label: "Online" },
  { key: "", label: "Combined" },
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
  if (method === "paymongo") return "PayMongo / Online";
  if (method === "gcash") return "GCash";
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "cod") return "COD";
  if (method === "cop") return "COP";
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

const badgeStyle = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (["paid", "completed", "delivered", "verified"].includes(normalized)) {
    return { background: "#18181b", color: "#fff", border: "#18181b" };
  }
  if (["cancelled", "rejected", "failed"].includes(normalized)) {
    return { background: "#fef2f2", color: "#991b1b", border: "#fecaca" };
  }
  return { background: "#f4f4f5", color: "#3f3f46", border: "#d4d4d8" };
};

function Badge({ value }) {
  const style = badgeStyle(value);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 800,
        textTransform: "capitalize",
        background: style.background,
        color: style.color,
        border: `1px solid ${style.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {humanize(value)}
    </span>
  );
}

function SummaryCard({ label, value, note }) {
  return (
    <div style={summaryCard}>
      <div style={summaryLabel}>{label}</div>
      <div style={summaryValue}>{value}</div>
      {note ? <div style={summaryNote}>{note}</div> : null}
    </div>
  );
}

export default function SalesReportPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const [tab, setTab] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (period === "custom" && (!from || !to || from > to)) return;

    setLoading(true);
    setError("");
    try {
      const params = { channel: tab };
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
  }, [from, period, tab, to]);

  useEffect(() => {
    if (period !== "custom") load();
  }, [load, period]);

  const summary = data?.summary || {};
  const collections = data?.collections || [];
  const orders = data?.orders || [];
  const paymentMethods = data?.payment_methods || [];
  const products = data?.products || [];

  const selectedPeriodLabel = useMemo(() => {
    if (period === "custom") return `${from || "—"} to ${to || "—"}`;
    return PERIODS.find((item) => item.value === period)?.label || period;
  }, [from, period, to]);

  const exportPDF = () => {
    if (!data) return;
    const doc = new jsPDF({ orientation: "landscape" });
    const reportLabel =
      TABS.find((item) => item.key === tab)?.label || "Combined";

    doc.setFontSize(16).setFont("helvetica", "bold");
    doc.text("Spiral Wood Services", 148, 14, { align: "center" });
    doc.setFontSize(12);
    doc.text(`Sales & Collections Report — ${reportLabel}`, 148, 22, {
      align: "center",
    });
    doc.setFontSize(9).setFont("helvetica", "normal");
    doc.text(`Period: ${selectedPeriodLabel}`, 14, 31);
    doc.text(`Generated: ${new Date().toLocaleString("en-PH")}`, 190, 31);

    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.text(`Gross Order Value: ${money(summary.gross_order_value)}`, 14, 40);
    doc.text(`Actual Collected: ${money(summary.actual_collected)}`, 75, 40);
    doc.text(`Outstanding: ${money(summary.outstanding_balance)}`, 135, 40);
    doc.text(`Estimated Order Profit: ${money(summary.total_profit)}`, 195, 40);

    autoTable(doc, {
      startY: 47,
      head: [
        [
          "Payment Date",
          "Receipt",
          "Order",
          "Customer",
          "Type",
          "Method",
          "Amount",
          "Status",
        ],
      ],
      body: collections.map((row) => [
        dateTime(row.payment_date),
        row.receipt_number || "—",
        row.order_number || `#${row.order_id}`,
        row.customer_name || "—",
        humanize(row.order_type),
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
          "Order",
          "Customer",
          "Order Total",
          "Collected in Period",
          "Lifetime Collected",
          "Remaining",
          "Payment",
        ],
      ],
      body: orders.map((row) => [
        row.order_number || `#${row.id}`,
        row.customer_name || "—",
        Number(row.total_amount || 0).toFixed(2),
        Number(row.collected_this_period || 0).toFixed(2),
        Number(row.lifetime_collected || 0).toFixed(2),
        Number(row.remaining_balance || 0).toFixed(2),
        humanize(row.payment_status),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [39, 39, 42] },
    });

    doc.save(`wisdom_sales_collections_${tab || "combined"}.pdf`);
  };

  return (
    <div id="print-area" style={{ paddingBottom: 40 }}>
      <div style={headerRow}>
        <div>
          <h1 style={pageTitle}>Sales & Collections</h1>
          <p style={pageSubtitle}>
            Actual Sales use verified payment transactions. Gross Order Value
            remains separate.
          </p>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8 }}>
          <button onClick={exportPDF} style={buttonGhost} disabled={!data}>
            Export PDF
          </button>
          <button onClick={() => window.print()} style={buttonGhost}>
            Print
          </button>
        </div>
      </div>

      <div style={noticeBox}>
        Blueprint down payments count only the verified amount collected.
        Remaining balances are added only when verified. Cancelled orders keep
        verified, non-refunded collections in this report.
      </div>

      <div className="no-print" style={tabBar}>
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{
              ...tabButton,
              ...(tab === item.key ? tabButtonActive : {}),
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="no-print" style={filterBar}>
        {PERIODS.map((item) => (
          <button
            key={item.value}
            onClick={() => setPeriod(item.value)}
            style={{
              ...pillButton,
              ...(period === item.value ? pillButtonActive : {}),
            }}
          >
            {item.label}
          </button>
        ))}
        {period === "custom" ? (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={input}
            />
            <span style={{ color: "#71717a", fontSize: 12 }}>to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={input}
            />
            <button
              onClick={load}
              style={buttonPrimary}
              disabled={!from || !to || from > to || loading}
            >
              Apply
            </button>
          </>
        ) : null}
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}
      {loading ? <div style={emptyState}>Loading report...</div> : null}

      {!loading && data ? (
        <>
          <div style={summaryGrid}>
            <SummaryCard
              label="Gross Order Value"
              value={money(summary.gross_order_value)}
              note="Non-cancelled orders created in the selected period"
            />
            <SummaryCard
              label="Actual Collected"
              value={money(summary.actual_collected)}
              note={`${summary.collection_count || 0} verified payment transaction(s)`}
            />
            <SummaryCard
              label="Outstanding"
              value={money(summary.outstanding_balance)}
              note="Unpaid balance of non-cancelled orders in the selected order period"
            />
            <SummaryCard
              label="Estimated Order Profit"
              value={money(summary.total_profit)}
              note="Estimate only; not realized accounting profit"
            />
            <SummaryCard
              label="Non-cancelled Orders"
              value={summary.total_orders || 0}
            />
            <SummaryCard
              label="Average Order Value"
              value={money(summary.avg_order_value)}
            />
          </div>

          <section style={card}>
            <SectionHeader
              title="Verified Collection Transactions"
              subtitle={`${collections.length} record(s) based on payment verification date`}
            />
            <div style={tableScroll}>
              <table style={table}>
                <thead>
                  <tr>
                    {[
                      "Payment Date",
                      "Receipt",
                      "Order",
                      "Customer",
                      "Order Type",
                      "Method",
                      "Amount",
                      "Processed By",
                      "Order Status",
                    ].map((label) => (
                      <th key={label} style={th}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {collections.length === 0 ? (
                    <EmptyRow
                      colSpan={9}
                      text="No verified collections for this period."
                    />
                  ) : (
                    collections.map((row) => (
                      <tr key={row.payment_transaction_id} style={tr}>
                        <td style={td}>{dateTime(row.payment_date)}</td>
                        <td style={td}>{row.receipt_number || "—"}</td>
                        <td style={{ ...td, fontWeight: 800 }}>
                          {row.order_number || `#${row.order_id}`}
                        </td>
                        <td style={td}>{row.customer_name || "—"}</td>
                        <td style={td}>{humanize(row.order_type)}</td>
                        <td style={td}>
                          {paymentMethodLabel(row.payment_method)}
                        </td>
                        <td style={{ ...td, fontWeight: 800 }}>
                          {money(row.amount)}
                        </td>
                        <td style={td}>{row.processed_by || "System"}</td>
                        <td style={td}>
                          <Badge value={row.order_status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={card}>
            <SectionHeader
              title="Order Value & Collection Status"
              subtitle="Shows non-cancelled orders in the order period and orders with verified collections in the payment period"
            />
            <div style={tableScroll}>
              <table style={table}>
                <thead>
                  <tr>
                    {[
                      "Order",
                      "Customer",
                      "Channel / Type",
                      "Order Total",
                      "Collected This Period",
                      "Lifetime Collected",
                      "Remaining",
                      "Methods",
                      "Payment",
                      "Order Status",
                      "Receipts",
                    ].map((label) => (
                      <th key={label} style={th}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <EmptyRow
                      colSpan={11}
                      text="No matching orders or collections."
                    />
                  ) : (
                    orders.map((row) => (
                      <tr key={row.id} style={tr}>
                        <td style={{ ...td, fontWeight: 800 }}>
                          {row.order_number || `#${row.id}`}
                        </td>
                        <td style={td}>{row.customer_name || "—"}</td>
                        <td style={td}>
                          {humanize(row.channel)} · {humanize(row.order_type)}
                        </td>
                        <td style={td}>{money(row.total_amount)}</td>
                        <td style={{ ...td, fontWeight: 800 }}>
                          {money(row.collected_this_period)}
                        </td>
                        <td style={td}>{money(row.lifetime_collected)}</td>
                        <td style={td}>{money(row.remaining_balance)}</td>
                        <td style={td}>
                          {row.collected_payment_methods
                            ? row.collected_payment_methods
                                .split(", ")
                                .map(paymentMethodLabel)
                                .join(", ")
                            : "—"}
                        </td>
                        <td style={td}>
                          <Badge value={row.payment_status} />
                        </td>
                        <td style={td}>
                          <Badge value={row.status} />
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {row.receipt_count || 0}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div style={twoColumnGrid}>
            <section style={card}>
              <SectionHeader title="Verified Collections by Payment Method" />
              <div style={{ padding: 18 }}>
                {paymentMethods.length === 0 ? (
                  <div style={smallEmpty}>
                    No verified payment methods for this period.
                  </div>
                ) : (
                  paymentMethods.map((row) => (
                    <div key={row.payment_method} style={breakdownRow}>
                      <div>
                        <div style={{ fontWeight: 800 }}>
                          {paymentMethodLabel(row.payment_method)}
                        </div>
                        <div style={breakdownMeta}>
                          {row.transaction_count} transaction(s)
                        </div>
                      </div>
                      <div style={{ fontWeight: 900 }}>
                        {money(row.total_amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section style={card}>
              <SectionHeader
                title="Gross Order Product Breakdown"
                subtitle="Order pipeline value, not partial-payment allocation"
              />
              <div style={tableScroll}>
                <table style={table}>
                  <thead>
                    <tr>
                      {[
                        "Product",
                        "Units",
                        "Gross Order Value",
                        "Estimated Profit",
                      ].map((label) => (
                        <th key={label} style={th}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <EmptyRow
                        colSpan={4}
                        text="No product order data for this period."
                      />
                    ) : (
                      products.map((row, index) => (
                        <tr key={`${row.product_name}-${index}`} style={tr}>
                          <td style={{ ...td, fontWeight: 700 }}>
                            {row.product_name || "—"}
                          </td>
                          <td style={td}>{quantity(row.units_sold)}</td>
                          <td style={td}>{money(row.gross_order_value)}</td>
                          <td style={td}>{money(row.estimated_profit)}</td>
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

function SectionHeader({ title, subtitle }) {
  return (
    <div style={sectionHeader}>
      <div>
        <h3 style={sectionTitle}>{title}</h3>
        {subtitle ? <p style={sectionSubtitle}>{subtitle}</p> : null}
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
};
const pageSubtitle = { margin: "6px 0 0", color: "#71717a", fontSize: 13 };
const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 16,
  flexWrap: "wrap",
};
const noticeBox = {
  padding: "12px 14px",
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1e3a8a",
  borderRadius: 10,
  fontSize: 12,
  lineHeight: 1.55,
  marginBottom: 18,
};
const tabBar = {
  display: "flex",
  gap: 4,
  borderBottom: "1px solid #d4d4d8",
  marginBottom: 16,
  flexWrap: "wrap",
};
const tabButton = {
  border: "none",
  background: "transparent",
  padding: "10px 16px",
  cursor: "pointer",
  color: "#71717a",
  fontWeight: 800,
  borderBottom: "2px solid transparent",
};
const tabButtonActive = { color: "#18181b", borderBottomColor: "#18181b" };
const filterBar = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 20,
};
const pillButton = {
  border: "1px solid #d4d4d8",
  background: "#fff",
  color: "#52525b",
  padding: "7px 13px",
  borderRadius: 999,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 12,
};
const pillButtonActive = {
  background: "#18181b",
  color: "#fff",
  borderColor: "#18181b",
};
const input = {
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
};
const buttonPrimary = {
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#fff",
  padding: "8px 14px",
  borderRadius: 8,
  fontWeight: 800,
  cursor: "pointer",
};
const buttonGhost = {
  border: "1px solid #d4d4d8",
  background: "#fff",
  color: "#18181b",
  padding: "8px 12px",
  borderRadius: 8,
  fontWeight: 800,
  cursor: "pointer",
};
const errorBox = {
  padding: 14,
  borderRadius: 10,
  color: "#991b1b",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  marginBottom: 16,
  fontSize: 13,
};
const emptyState = {
  padding: 40,
  textAlign: "center",
  color: "#71717a",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  background: "#fff",
};
const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
  marginBottom: 18,
};
const summaryCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 16,
};
const summaryLabel = {
  fontSize: 11,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};
const summaryValue = {
  fontSize: 22,
  fontWeight: 900,
  color: "#0a0a0a",
  marginTop: 7,
};
const summaryNote = {
  fontSize: 10,
  color: "#71717a",
  lineHeight: 1.45,
  marginTop: 6,
};
const card = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  overflow: "hidden",
  marginBottom: 18,
};
const sectionHeader = {
  padding: "16px 18px",
  borderBottom: "1px solid #e4e4e7",
  background: "#fafafa",
};
const sectionTitle = {
  margin: 0,
  fontSize: 15,
  fontWeight: 900,
  color: "#18181b",
};
const sectionSubtitle = { margin: "4px 0 0", fontSize: 11, color: "#71717a" };
const tableScroll = { overflowX: "auto" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const th = {
  textAlign: "left",
  padding: "10px 12px",
  background: "#fafafa",
  borderBottom: "1px solid #e4e4e7",
  color: "#52525b",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: ".03em",
  whiteSpace: "nowrap",
};
const tr = { borderBottom: "1px solid #f4f4f5" };
const td = {
  padding: "11px 12px",
  verticalAlign: "top",
  color: "#3f3f46",
  whiteSpace: "nowrap",
};
const emptyCell = { padding: 32, textAlign: "center", color: "#71717a" };
const twoColumnGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, .75fr) minmax(420px, 1.25fr)",
  gap: 18,
};
const breakdownRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 0",
  borderBottom: "1px solid #f4f4f5",
  gap: 12,
};
const breakdownMeta = { marginTop: 3, fontSize: 10, color: "#71717a" };
const smallEmpty = {
  color: "#71717a",
  fontSize: 12,
  padding: 12,
  textAlign: "center",
};
