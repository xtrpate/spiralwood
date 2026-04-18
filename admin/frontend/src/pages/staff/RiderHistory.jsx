import { useState, useEffect } from "react";
import api from "../../services/api";

export default function RiderHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/pos/deliveries/history")
      .then((res) => setHistory(res.data))
      .catch((err) => console.error("Failed to load history", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: "24px" }}>Loading history...</div>;

  return (
    <div style={{ padding: "24px" }}>
      <h2 style={{ margin: "0 0 20px 0", fontSize: "24px", color: "#0f172a" }}>
        Delivery History
      </h2>

      {history.length === 0 ? (
        <div
          style={{
            padding: "20px",
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            color: "#64748b",
          }}
        >
          No completed or failed deliveries found.
        </div>
      ) : (
        <table
          style={{
            width: "100%",
            background: "#fff",
            borderRadius: "12px",
            overflow: "hidden",
            borderCollapse: "collapse",
          }}
        >
          <thead style={{ background: "#f8fafc", textAlign: "left" }}>
            <tr>
              <th
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Order #
              </th>
              <th
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Customer
              </th>
              <th
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Status
              </th>
              <th
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.delivery_id}>
                <td
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: "bold",
                  }}
                >
                  {h.order_number}
                </td>
                <td
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  {h.customer_name}
                </td>
                <td
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      background:
                        h.status === "delivered" ? "#ecfdf5" : "#fef2f2",
                      color: h.status === "delivered" ? "#15803d" : "#dc2626",
                    }}
                  >
                    {h.status.toUpperCase()}
                  </span>
                </td>
                <td
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #e5e7eb",
                    color: "#64748b",
                  }}
                >
                  {new Date(h.updated_at).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
