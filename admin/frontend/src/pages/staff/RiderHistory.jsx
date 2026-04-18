import { useState, useEffect, useMemo } from "react";
import api from "../../services/api";
import { Calendar } from "lucide-react"; // Import a nice calendar icon

export default function RiderHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Date filter state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    api
      .get("/pos/deliveries/history")
      .then((res) => setHistory(res.data))
      .catch((err) => console.error("Failed to load history", err))
      .finally(() => setLoading(false));
  }, []);

  // Filter the history based on the selected dates
  const filteredHistory = useMemo(() => {
    return history.filter((h) => {
      if (!startDate && !endDate) return true;

      const itemDate = new Date(h.updated_at);
      itemDate.setHours(0, 0, 0, 0);

      if (startDate) {
        const sDate = new Date(startDate);
        sDate.setHours(0, 0, 0, 0);
        if (itemDate < sDate) return false;
      }
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(0, 0, 0, 0);
        if (itemDate > eDate) return false;
      }
      return true;
    });
  }, [history, startDate, endDate]);

  if (loading) return <div style={{ padding: "24px" }}>Loading history...</div>;

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* ── Header & Date Filter ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h2
            style={{ margin: "0 0 4px 0", fontSize: "24px", color: "#0f172a" }}
          >
            Delivery History
          </h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
            Review past deliveries and customer details.
          </p>
        </div>

        {/* Date Range Picker matching the Cashier UI */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "#ffffff",
            padding: "8px 16px",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <Calendar size={16} color="#64748b" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              border: "none",
              outline: "none",
              color: "#334155",
              fontSize: "14px",
            }}
          />
          <span style={{ color: "#94a3b8", fontSize: "14px" }}>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              border: "none",
              outline: "none",
              color: "#334155",
              fontSize: "14px",
            }}
          />
        </div>
      </div>

      {/* ── Data Table ── */}
      {filteredHistory.length === 0 ? (
        <div
          style={{
            padding: "24px",
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            color: "#64748b",
            textAlign: "center",
          }}
        >
          No completed or failed deliveries found for this date range.
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              whiteSpace: "nowrap",
            }}
          >
            <thead
              style={{
                background: "#f8fafc",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <tr>
                <th style={thStyle}>Date & Time</th>
                <th style={thStyle}>Order #</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Payment</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((h) => (
                <tr
                  key={h.delivery_id}
                  style={{ borderBottom: "1px solid #f1f5f9" }}
                >
                  <td style={tdStyle}>
                    {new Date(h.updated_at).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    <div
                      style={{
                        color: "#64748b",
                        fontSize: "12px",
                        marginTop: "2px",
                      }}
                    >
                      {new Date(h.updated_at).toLocaleTimeString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>

                  <td
                    style={{ ...tdStyle, fontWeight: "700", color: "#0f172a" }}
                  >
                    {h.order_number}
                  </td>

                  <td style={tdStyle}>
                    <div style={{ fontWeight: "600", color: "#334155" }}>
                      {h.customer_name}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        maxWidth: "200px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {h.address || "No address provided"}
                    </div>
                  </td>

                  <td
                    style={{ ...tdStyle, fontWeight: "700", color: "#b45309" }}
                  >
                    ₱
                    {Number(h.total || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </td>

                  <td style={tdStyle}>
                    <span
                      style={{ color: "#475569", textTransform: "capitalize" }}
                    >
                      {h.payment_status || "Pending"}
                    </span>
                  </td>

                  <td style={tdStyle}>
                    <span
                      style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        fontSize: "11px",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        background:
                          h.status === "delivered" ? "#ecfdf5" : "#fef2f2",
                        color: h.status === "delivered" ? "#15803d" : "#dc2626",
                        border: `1px solid ${h.status === "delivered" ? "#bbf7d0" : "#fecaca"}`,
                      }}
                    >
                      {h.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Reusable styles to keep the JSX clean
const thStyle = {
  padding: "16px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: "700",
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle = {
  padding: "16px",
  fontSize: "14px",
  color: "#334155",
  verticalAlign: "middle",
};
