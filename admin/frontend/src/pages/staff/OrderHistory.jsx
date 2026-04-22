import { useState, useEffect, useCallback } from "react";
import api from "../../services/api";
import { useNavigate } from "react-router-dom";
import { Search, Calendar, FileText, Printer } from "lucide-react";

const getStatusStyle = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "completed" || s === "confirmed") {
    return {
      background: "#0a0a0a",
      color: "#ffffff",
      border: "1px solid #0a0a0a",
    };
  }
  return {
    background: "#f4f4f5",
    color: "#52525b",
    border: "1px solid #e4e4e7",
  };
};

export default function OrderHistory() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Build query string based on filters
      let query = `?limit=50`;
      if (dateFrom) query += `&from=${dateFrom}`;
      if (dateTo) query += `&to=${dateTo}`;

      const { data } = await api.get(`/pos/orders${query}`);
      setOrders(data.orders || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to load transaction history.",
      );
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", paddingBottom: 40 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              color: "#0a0a0a",
              letterSpacing: "-0.02em",
            }}
          >
            Transaction History
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "#52525b",
              lineHeight: 1.5,
            }}
          >
            Review past walk-in orders and reprint receipts.
          </p>
        </div>

        {/* 👉 Date Range Filter */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            background: "#ffffff",
            padding: "8px 14px",
            borderRadius: "12px",
            border: "1px solid #e4e4e7",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={16} color="#71717a" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={dateInputStyle}
            />
            <span style={{ color: "#71717a", fontSize: 13, fontWeight: 600 }}>
              to
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={dateInputStyle}
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              style={btnClear}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#fee2e2")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#fef2f2")
              }
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        {loading ? (
          <div
            style={{
              padding: "60px 40px",
              textAlign: "center",
              color: "#71717a",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Loading transactions...
          </div>
        ) : error ? (
          <div
            style={{
              padding: "60px 40px",
              textAlign: "center",
              color: "#dc2626",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        ) : orders.length === 0 ? (
          <div
            style={{
              padding: "80px 40px",
              textAlign: "center",
              color: "#71717a",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <FileText
              size={48}
              color="#d4d4d8"
              style={{ marginBottom: "16px" }}
            />
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "#52525b",
              }}
            >
              No transactions found for the selected dates.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={thRowStyle}>
                  <th style={thStyle}>Date & Time</th>
                  <th style={thStyle}>Order #</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Payment</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const statusStyle = getStatusStyle(order.status);
                  return (
                    <tr key={order.id} style={trStyle}>
                      <td
                        style={{
                          ...tdStyle,
                          color: "#52525b",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {new Date(order.created_at).toLocaleString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontWeight: 800,
                          color: "#0a0a0a",
                        }}
                      >
                        {order.order_number}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, color: "#18181b" }}>
                          {order.walkin_customer_name || "Walk-in Customer"}
                        </div>
                        {order.walkin_customer_phone && (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#71717a",
                              marginTop: 2,
                              fontWeight: 500,
                            }}
                          >
                            {order.walkin_customer_phone}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textTransform: "capitalize",
                          color: "#52525b",
                          fontWeight: 500,
                        }}
                      >
                        {String(order.payment_method).replace("_", " ")}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontWeight: 800,
                          color: "#0a0a0a",
                        }}
                      >
                        ₱
                        {Number(order.total).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...statusStyle,
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "1px",
                            display: "inline-block",
                          }}
                        >
                          {String(order.status).replace("_", " ")}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {order.receipt_number ? (
                          <button
                            style={btnReceipt}
                            onClick={() =>
                              navigate(`/staff/receipt/${order.receipt_id}`)
                            }
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = "#e4e4e7")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "#f4f4f5")
                            }
                          >
                            <Printer size={14} /> Receipt
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#a1a1aa",
                              fontWeight: 600,
                            }}
                          >
                            No Receipt
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable Styles ──────────────────────────────────────────

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  overflow: "hidden",
};

const dateInputStyle = {
  border: "1px solid #e4e4e7",
  padding: "8px 12px",
  borderRadius: "8px",
  outline: "none",
  fontSize: "13px",
  color: "#18181b",
  background: "#fff",
};

const btnClear = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  padding: "8px 14px",
  borderRadius: "8px",
  fontSize: "12px",
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const btnReceipt = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#f4f4f5",
  border: "1px solid #e4e4e7",
  color: "#18181b",
  padding: "8px 14px",
  borderRadius: "8px",
  fontSize: "12px",
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  minWidth: 800,
  textAlign: "left",
};

const thRowStyle = {
  background: "#fafafa",
  borderBottom: "1px solid #e4e4e7",
};

const thStyle = {
  padding: "14px 20px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const trStyle = {
  borderBottom: "1px solid #f4f4f5",
  background: "#ffffff",
  transition: "background 0.2s",
};

const tdStyle = {
  padding: "16px 20px",
  color: "#18181b",
  verticalAlign: "middle",
};
