// src/pages/sales/SalesReportPage.jsx – Sales Reports (POS / Online / Combined)
import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const TABS = [
  { key: "walkin", label: "🏪 POS / Walk-in Report" },
  { key: "online", label: "🌐 Online Sales Report" },
  { key: "", label: "📊 Combined Report" },
];

const PERIODS = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "yearly", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

const STATUS_STYLE = {
  pending: { bg: "#fef9c3", color: "#854d0e" },
  confirmed: { bg: "#dbeafe", color: "#1e40af" },
  contract_released: { bg: "#ede9fe", color: "#6d28d9" },
  production: { bg: "#e9d5ff", color: "#6b21a8" },
  shipping: { bg: "#e0f2fe", color: "#075985" },
  delivered: { bg: "#dcfce7", color: "#15803d" },
  completed: { bg: "#d1fae5", color: "#065f46" },
  cancelled: { bg: "#fee2e2", color: "#991b1b" },
};

const formatStatusLabel = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatChannelLabel = (value) =>
  String(value || "").toLowerCase() === "online" ? "Online" : "Walk-in";

const formatMoney = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function SalesReportPage() {
  const [tab, setTab] = useState(""); // '' = combined
  const [period, setPeriod] = useState("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { channel: tab };

      if (period === "custom" && from && to) {
        params.from = from;
        params.to = to;
      } else if (period !== "custom") {
        params.period = period;
      }

      const { data: res } = await api.get("/sales/report", { params });
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [tab, period, from, to]);

  useEffect(() => {
    if (period === "custom") return;
    load();
  }, [load, period]);

  const handleApplyCustomRange = () => {
    if (!from || !to) return;
    if (from > to) return;
    load();
  };

  const exportPDF = () => {
    if (!data) return;

    const doc = new jsPDF({ orientation: "landscape" });
    const tabLabel =
      TABS.find((t) => t.key === tab)?.label || "Combined Report";
    const cleanTabLabel = tabLabel.replace(/[🏪🌐📊]/g, "").trim();
    const dateStr =
      period === "custom"
        ? `${from} to ${to}`
        : PERIODS.find((p) => p.value === period)?.label || "";

    doc.setFontSize(16).setFont("helvetica", "bold");
    doc.text("Spiral Wood Services", 148, 14, { align: "center" });

    doc.setFontSize(11).setFont("helvetica", "normal");
    doc.text("8 Sitio Laot, Prenza 1, Marilao, Bulacan", 148, 20, {
      align: "center",
    });

    doc.setFontSize(13).setFont("helvetica", "bold");
    doc.text(`SALES REPORT — ${cleanTabLabel}`, 148, 28, {
      align: "center",
    });

    doc.setFontSize(10).setFont("helvetica", "normal");
    doc.text(
      `Period: ${dateStr}    |    Generated: ${new Date().toLocaleString("en-PH")}`,
      148,
      34,
      { align: "center" },
    );

    const s = data.summary || {};
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text(`Total Orders: ${s.total_orders || 0}`, 14, 44);
    doc.text(`Total Revenue: ${formatMoney(s.total_revenue)}`, 60, 44);
    doc.text(`Total Profit: ${formatMoney(s.total_profit)}`, 120, 44);
    doc.text(
      `Avg Order Value: ${formatMoney(s.avg_order_value)}`,
      190,
      44,
    );

    autoTable(doc, {
      startY: 50,
      head: [
        [
          "Order ID",
          "Customer",
          "Phone",
          "Channel",
          "Payment",
          "Amount (₱)",
          "Profit (₱)",
          "Status",
          "Delivery",
          "Date",
        ],
      ],
      body: (data.orders || []).map((o) => [
        `#${String(o.id).padStart(5, "0")}`,
        o.customer_name || "—",
        o.customer_phone || "—",
        formatChannelLabel(o.channel),
        o.payment_method?.replace(/_/g, " ") || "—",
        Number(o.total_amount || 0).toFixed(2),
        Number(o.total_profit || 0).toFixed(2),
        formatStatusLabel(o.status),
        o.delivery_status || "—",
        new Date(o.created_at).toLocaleDateString("en-PH"),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    if (data.products?.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [["Product", "Units Sold", "Revenue (₱)", "Profit (₱)"]],
        body: data.products.slice(0, 20).map((p) => [
          p.product_name,
          p.units_sold,
          Number(p.revenue || 0).toFixed(2),
          Number(p.profit || 0).toFixed(2),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129] },
        tableWidth: 120,
        margin: { left: 14 },
      });
    }

    const finalY = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(10).setFont("helvetica", "normal");
    doc.text("Prepared by:", 14, finalY);
    doc.text("___________________________", 14, finalY + 16);
    doc.text("Authorized Signatory / Owner", 14, finalY + 22);

    doc.save(
      `wisdom_sales_report_${tab || "combined"}_${dateStr.replace(/\s+/g, "_")}.pdf`,
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const s = data?.summary;

  return (
    <div id="print-area">
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1 style={pageTitle}>Sales Reports</h1>

        <div className="no-print" style={{ display: "flex", gap: 8 }}>
          <button onClick={exportPDF} style={btnGhost}>
            📄 Export PDF
          </button>
          <button onClick={handlePrint} style={btnGhost}>
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="no-print"
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "2px solid #e2e8f0",
          marginBottom: 20,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "9px 20px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
              color: tab === t.key ? "#1e40af" : "#64748b",
              borderBottom:
                tab === t.key ? "2px solid #1e40af" : "2px solid transparent",
              marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div
        className="no-print"
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 20,
          alignItems: "center",
        }}
      >
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            style={{
              padding: "6px 16px",
              border: "1px solid",
              borderRadius: 20,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              background: period === p.value ? "#1e40af" : "#fff",
              color: period === p.value ? "#fff" : "#374151",
              borderColor: period === p.value ? "#1e40af" : "#d1d5db",
            }}
          >
            {p.label}
          </button>
        ))}

        {period === "custom" && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={inputSm}
            />
            <span style={{ color: "#64748b", fontSize: 13 }}>to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={inputSm}
            />
            <button
              onClick={handleApplyCustomRange}
              style={btnPrimary}
              disabled={!from || !to || from > to}
            >
              Apply
            </button>

            {from && to && from > to && (
              <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>
                End date must be later than or equal to the start date.
              </span>
            )}
          </>
        )}
      </div>

      {/* KPI Summary */}
      {s && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <KpiCard
            label="Total Orders"
            value={s.total_orders}
            color="#3b82f6"
            icon="🛒"
          />
          <KpiCard
            label="Total Revenue"
            value={formatMoney(s.total_revenue)}
            color="#10b981"
            icon="💰"
          />
          <KpiCard
            label="Total Profit"
            value={formatMoney(s.total_profit)}
            color="#8b5cf6"
            icon="📈"
          />
          <KpiCard
            label="Avg Order Value"
            value={formatMoney(s.avg_order_value)}
            color="#f59e0b"
            icon="🧾"
          />

          {tab === "" && (
            <>
              <KpiCard
                label="Online Orders"
                value={s.online_count}
                color="#06b6d4"
                icon="🌐"
              />
              <KpiCard
                label="Walk-in Orders"
                value={s.walkin_count}
                color="#84cc16"
                icon="🏪"
              />
            </>
          )}
        </div>
      )}

      {loading ? (
        <div style={center}>Loading report...</div>
      ) : !data ? null : (
        <>
          {/* Orders Table */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={sectionTitle}>
                {tab === "walkin"
                  ? "POS Transactions"
                  : tab === "online"
                    ? "Online Orders"
                    : "All Transactions"}
              </h3>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {data.orders.length} records
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "Order ID",
                      "Customer",
                      "Channel",
                      "Payment",
                      "Amount",
                      "Profit",
                      "Status",
                      "Delivery",
                      "Receipt",
                      "Date",
                    ].map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {data.orders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        style={{
                          textAlign: "center",
                          padding: 32,
                          color: "#94a3b8",
                        }}
                      >
                        No records for this period.
                      </td>
                    </tr>
                  ) : (
                    data.orders.map((o) => {
                      const statusKey = String(o.status || "").toLowerCase();
                      const ss = STATUS_STYLE[statusKey] || {
                        bg: "#f1f5f9",
                        color: "#475569",
                      };

                      return (
                        <tr
                          key={o.id}
                          style={{ borderBottom: "1px solid #f1f5f9" }}
                        >
                          <td style={td}>
                            <span style={{ fontWeight: 600, color: "#1e40af" }}>
                              #{String(o.id).padStart(5, "0")}
                            </span>
                          </td>

                          <td style={td}>
                            <div style={{ fontWeight: 500 }}>
                              {o.customer_name}
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>
                              {o.customer_phone || ""}
                            </div>
                          </td>

                          <td style={td}>
                            <span
                              style={{
                                background:
                                  String(o.channel || "").toLowerCase() ===
                                  "online"
                                    ? "#dbeafe"
                                    : "#dcfce7",
                                color:
                                  String(o.channel || "").toLowerCase() ===
                                  "online"
                                    ? "#1e40af"
                                    : "#166534",
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {formatChannelLabel(o.channel)}
                            </span>
                          </td>

                          <td style={{ ...td, fontSize: 12 }}>
                            {o.payment_method?.replace(/_/g, " ") || "—"}
                          </td>

                          <td style={{ ...td, fontWeight: 600 }}>
                            {formatMoney(o.total_amount)}
                          </td>

                          <td style={{ ...td, color: "#065f46", fontWeight: 600 }}>
                            {formatMoney(o.total_profit)}
                          </td>

                          <td style={td}>
                            <span
                              style={{
                                background: ss.bg,
                                color: ss.color,
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {formatStatusLabel(o.status)}
                            </span>
                          </td>

                          <td style={td}>
                            {o.delivery_status ? (
                              <span style={{ fontSize: 12, color: "#64748b" }}>
                                {o.delivery_status}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td style={td}>
                            {o.receipt_number ? (
                              <span style={{ fontSize: 11, color: "#1e40af" }}>
                                {o.receipt_number}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td style={{ ...td, fontSize: 12, color: "#64748b" }}>
                            {new Date(o.created_at).toLocaleDateString("en-PH")}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {data.orders.length > 0 && (
                  <tfoot>
                    <tr
                      style={{
                        background: "#f0f4f8",
                        borderTop: "2px solid #e2e8f0",
                      }}
                    >
                      <td
                        colSpan={4}
                        style={{ ...td, fontWeight: 700, textAlign: "right" }}
                      >
                        TOTALS
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: "#1e40af" }}>
                        {formatMoney(s.total_revenue)}
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: "#065f46" }}>
                        {formatMoney(s.total_profit)}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Top Products Breakdown */}
          {data.products?.length > 0 && (
            <div style={card}>
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                <h3 style={sectionTitle}>Product Sales Breakdown</h3>
              </div>

              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "#",
                      "Product Name",
                      "Units Sold",
                      "Revenue (₱)",
                      "Profit (₱)",
                      "Revenue Share",
                    ].map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {data.products.map((p, i) => {
                    const share =
                      Number(s.total_revenue) > 0
                        ? ((Number(p.revenue || 0) / Number(s.total_revenue)) * 100).toFixed(1)
                        : "0.0";

                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td
                          style={{
                            ...td,
                            color: "#94a3b8",
                            fontWeight: 600,
                            width: 32,
                          }}
                        >
                          {i + 1}
                        </td>

                        <td style={{ ...td, fontWeight: 500 }}>
                          {p.product_name}
                        </td>

                        <td style={td}>{p.units_sold}</td>

                        <td style={{ ...td, fontWeight: 600 }}>
                          {formatMoney(p.revenue)}
                        </td>

                        <td style={{ ...td, color: "#065f46", fontWeight: 600 }}>
                          {formatMoney(p.profit)}
                        </td>

                        <td style={td}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                flex: 1,
                                background: "#e2e8f0",
                                borderRadius: 4,
                                height: 8,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${share}%`,
                                  background: "#3b82f6",
                                  height: "100%",
                                  borderRadius: 4,
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: 12,
                                color: "#64748b",
                                width: 36,
                              }}
                            >
                              {share}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 12mm;
          }

          body * {
            visibility: hidden !important;
          }

          #print-area,
          #print-area * {
            visibility: visible !important;
          }

          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: #fff;
          }

          .no-print {
            display: none !important;
          }

          button {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function KpiCard({ label, value, color, icon }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "18px 20px",
        borderLeft: `4px solid ${color}`,
        boxShadow: "0 1px 6px rgba(0,0,0,.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              color: "#64748b",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#1e2a38",
              margin: "6px 0 0",
            }}
          >
            {value}
          </p>
        </div>
        <span style={{ fontSize: 24 }}>{icon}</span>
      </div>
    </div>
  );
}

const pageTitle = {
  fontSize: 22,
  fontWeight: 700,
  color: "#1e2a38",
  margin: 0,
};

const sectionTitle = {
  fontSize: 15,
  fontWeight: 600,
  color: "#1e2a38",
  margin: 0,
};

const card = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,.08)",
  overflow: "hidden",
};

const th = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
};

const td = {
  padding: "10px 14px",
  color: "#374151",
  verticalAlign: "middle",
};

const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 200,
  color: "#64748b",
};

const inputSm = {
  padding: "7px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
};

const btnPrimary = {
  padding: "7px 18px",
  background: "#1e40af",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

const btnGhost = {
  padding: "7px 14px",
  background: "#f1f5f9",
  color: "#374151",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};