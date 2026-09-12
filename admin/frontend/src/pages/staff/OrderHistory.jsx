import { useState, useEffect, useCallback } from "react";
import api from "../../services/api";
import { useNavigate } from "react-router-dom";
import { Search, Calendar, FileText, Printer } from "lucide-react";
import { formatPHDateTime } from "../../utils/dateTime";

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

const PAYMENT_METHOD_LABELS = {
  gcash: "GCash",
  paymongo: "Online Payment",
  bank_transfer: "Bank Transfer",
};
const formatPaymentMethod = (value) => {
  const normalized = String(value || "").toLowerCase();
  return PAYMENT_METHOD_LABELS[normalized] || normalized.replace("_", " ");
};

const PAGE_SIZE = 20;

export default function OrderHistory() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/pos/orders", {
        params: {
          limit: PAGE_SIZE,
          page,
          search: search || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
        },
      });
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
      setTotal(Number(data?.total || 0));
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to load transaction history.",
      );
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, search, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
              fontWeight: 700,
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
            View past sales and print receipts.
          </p>
        </div>

        <div style={historySearchStyle}>
          <Search size={16} color="#71717a" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search order, customer, phone, or receipt"
            aria-label="Search transaction history"
            style={historySearchInputStyle}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setPage(1);
              }}
              style={btnClear}
            >
              Clear Search
            </button>
          )}
        </div>

        {/* 👉 Date Range Filter */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            background: "#ffffff",
            padding: "8px 14px",
            borderRadius: "0",
            border: "1px solid #dcdce0",
            boxShadow: "none",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={16} color="#71717a" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              style={dateInputStyle}
            />
            <span style={{ color: "#71717a", fontSize: 13, fontWeight: 600 }}>
              to
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              style={dateInputStyle}
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setPage(1);
              }}
              style={btnClear}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f4f4f5")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#ffffff")
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
              No transactions found for the current search or selected dates.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={thRowStyle}>
                  <th style={thStyle}>Date and Time</th>
                  <th style={thStyle}>Order Number</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Payment</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Receipt</th>
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
                        {formatPHDateTime(order.created_at, {
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
                          fontWeight: 600,
                          color: "#0a0a0a",
                        }}
                      >
                        {order.order_number}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: "#18181b" }}>
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
                        {formatPaymentMethod(order.payment_method)}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontWeight: 650,
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
                            borderRadius: 0,
                            fontSize: 10,
                            fontWeight: 600,
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
                              (e.currentTarget.style.background = "#f4f4f5")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "#ffffff")
                            }
                          >
                            <Printer size={14} /> View Receipt
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#a1a1aa",
                              fontWeight: 600,
                            }}
                          >
                            Not available
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

        {!loading && !error && totalPages > 1 && (
          <div style={paginationStyle}>
            <button
              type="button"
              style={paginationButtonStyle}
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span style={paginationTextStyle}>
              Page {page} of {totalPages} · {total} transactions
            </span>
            <button
              type="button"
              style={paginationButtonStyle}
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable Styles ──────────────────────────────────────────

const historySearchStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "#ffffff",
  padding: "8px 12px",
  border: "1px solid #dcdce0",
  minWidth: 300,
};

const historySearchInputStyle = {
  flex: 1,
  minWidth: 180,
  border: "none",
  outline: "none",
  fontSize: 13,
  color: "#18181b",
  background: "transparent",
};

const paginationStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 20px",
  borderTop: "1px solid #e4e4e7",
  background: "#fafafa",
};

const paginationButtonStyle = {
  background: "#ffffff",
  border: "1px solid #d4d4d8",
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const paginationTextStyle = {
  fontSize: 12,
  color: "#52525b",
  fontWeight: 600,
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #dcdce0",
  borderRadius: 0,
  boxShadow: "none",
  overflow: "hidden",
};

const dateInputStyle = {
  border: "1px solid #cfcfd3",
  padding: "8px 12px",
  borderRadius: "0",
  outline: "none",
  fontSize: "13px",
  color: "#18181b",
  background: "#fff",
};

const btnClear = {
  background: "#ffffff",
  border: "1px solid #111111",
  color: "#111111",
  padding: "8px 14px",
  borderRadius: "0",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.15s",
};

const btnReceipt = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#ffffff",
  border: "1px solid #111111",
  color: "#111111",
  padding: "8px 14px",
  borderRadius: "0",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.15s",
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
  fontWeight: 600,
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