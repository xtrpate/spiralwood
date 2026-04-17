import { useState, useEffect, useCallback } from "react";
import api from "../../services/api";
import { useNavigate } from "react-router-dom";
import { Search, Calendar, FileText, Printer } from "lucide-react";

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
    <div>
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1>Transaction History</h1>
          <p>Review past walk-in orders and reprint receipts.</p>
        </div>

        {/* 👉 Date Range Filter */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            background: "#fff",
            padding: "10px 16px",
            borderRadius: "10px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <Calendar size={18} color="#64748b" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              border: "1px solid #e2e8f0",
              padding: "6px 10px",
              borderRadius: "6px",
              outline: "none",
            }}
          />
          <span style={{ color: "#64748b" }}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              border: "1px solid #e2e8f0",
              padding: "6px 10px",
              borderRadius: "6px",
              outline: "none",
            }}
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#c62828",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: "0", overflow: "hidden" }}>
        {loading ? (
          <div
            style={{ padding: "40px", textAlign: "center", color: "#64748b" }}
          >
            Loading transactions...
          </div>
        ) : error ? (
          <div
            style={{ padding: "40px", textAlign: "center", color: "#c62828" }}
          >
            {error}
          </div>
        ) : orders.length === 0 ? (
          <div
            style={{ padding: "60px 40px", textAlign: "center", color: "#888" }}
          >
            <FileText
              size={48}
              color="#e2e8f0"
              style={{ marginBottom: "16px" }}
            />
            <p>No transactions found for the selected dates.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Payment</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const isPaid =
                    order.status === "completed" ||
                    order.status === "confirmed";
                  return (
                    <tr key={order.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(order.created_at).toLocaleString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td style={{ fontWeight: "600", color: "#1a1a2e" }}>
                        {order.order_number}
                      </td>
                      <td>
                        <div style={{ fontWeight: "600" }}>
                          {order.walkin_customer_name}
                        </div>
                        {order.walkin_customer_phone && (
                          <div style={{ fontSize: "11px", color: "#64748b" }}>
                            {order.walkin_customer_phone}
                          </div>
                        )}
                      </td>
                      <td style={{ textTransform: "capitalize" }}>
                        {String(order.payment_method).replace("_", " ")}
                      </td>
                      <td style={{ fontWeight: "700", color: "#8B4513" }}>
                        ₱
                        {Number(order.total).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td>
                        <span
                          className={`badge ${isPaid ? "badge-green" : "badge-yellow"}`}
                        >
                          {String(order.status).replace("_", " ").toUpperCase()}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {order.receipt_number ? (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "6px 12px", fontSize: "12px" }}
                            onClick={() =>
                              navigate(`/staff/receipt/${order.id}`)
                            }
                          >
                            <Printer size={14} /> Receipt
                          </button>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#aaa" }}>
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
