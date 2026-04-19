// admin/frontend/src/pages/staff/Dashboard.jsx
import { useState, useEffect } from "react";
import api from "../../services/api";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ShoppingBag,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Clock,
} from "lucide-react";

// Converted generic classes to precise inline styles for the monochrome theme
const getOrderStatusStyle = (status) => {
  const key = String(status || "").toLowerCase();

  if (key === "completed" || key === "delivered")
    return {
      background: "#0a0a0a",
      color: "#ffffff",
      border: "1px solid #0a0a0a",
    };
  if (key === "confirmed")
    return {
      background: "#f4f4f5",
      color: "#18181b",
      border: "1px solid #e4e4e7",
    };
  if (key === "pending" || key === "shipping" || key === "production")
    return {
      background: "#ffffff",
      color: "#52525b",
      border: "1px solid #d4d4d8",
    };
  if (key === "cancelled")
    return {
      background: "#fef2f2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    };

  return {
    background: "#fafafa",
    color: "#71717a",
    border: "1px solid #e4e4e7",
  };
};

const getStockStatusStyle = (s) => {
  if (s === "in_stock")
    return {
      background: "#f4f4f5",
      color: "#18181b",
      border: "1px solid #e4e4e7",
    };
  if (s === "low_stock")
    return {
      background: "#ffffff",
      color: "#52525b",
      border: "1px solid #d4d4d8",
    };
  return {
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
  };
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        const res = await api.get("/pos/dashboard");
        if (isMounted) setData(res.data);
      } catch (err) {
        console.error(
          "Dashboard load error:",
          err.response?.data || err.message,
        );
        if (isMounted) setData(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading)
    return (
      <div
        style={{
          color: "#71717a",
          fontSize: 13,
          fontWeight: 600,
          padding: 40,
          textAlign: "center",
        }}
      >
        Loading dashboard...
      </div>
    );

  if (!data)
    return (
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: "#71717a", fontSize: 13, fontWeight: 600 }}>
          Failed to load dashboard.
        </p>
      </div>
    );

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", paddingBottom: 40 }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            color: "#0a0a0a",
            letterSpacing: "-0.02em",
          }}
        >
          POS Dashboard
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "#52525b",
            lineHeight: 1.5,
          }}
        >
          Today's overview —{" "}
          {new Date().toLocaleDateString("en-PH", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#f4f4f5",
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShoppingBag size={22} />
          </div>
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#0a0a0a",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {data.today?.order_count ?? 0}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#71717a",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginTop: 6,
              }}
            >
              Orders Today
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#18181b",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DollarSign size={22} />
          </div>
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#0a0a0a",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              ₱
              {parseFloat(data.today?.total_sales || 0).toLocaleString(
                "en-PH",
                {
                  minimumFractionDigits: 2,
                },
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#71717a",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginTop: 6,
              }}
            >
              Sales Today
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#f4f4f5",
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TrendingUp size={22} />
          </div>
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#0a0a0a",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              ₱
              {parseFloat(data.weekly_sales || 0).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
              })}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#71717a",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginTop: 6,
              }}
            >
              This Week
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: data.low_stock_alerts?.length ? "#fef2f2" : "#f4f4f5",
              color: data.low_stock_alerts?.length ? "#dc2626" : "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertTriangle size={22} />
          </div>
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: data.low_stock_alerts?.length ? "#dc2626" : "#0a0a0a",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {data.low_stock_alerts?.length ?? 0}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#71717a",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginTop: 6,
              }}
            >
              Low Stock Alerts
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e4e4e7",
            padding: "20px 24px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          <h3
            style={{
              margin: "0 0 20px",
              fontWeight: 800,
              fontSize: 16,
              color: "#0a0a0a",
            }}
          >
            Top Products Today
          </h3>
          {!data.top_products || data.top_products.length === 0 ? (
            <p
              style={{
                color: "#71717a",
                fontSize: 13,
                fontWeight: 500,
                margin: 0,
                textAlign: "center",
                padding: 40,
              }}
            >
              No sales recorded today.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.top_products}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e4e4e7"
                  vertical={false}
                />
                <XAxis
                  dataKey="product_name"
                  tick={{ fontSize: 11, fill: "#71717a" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#71717a" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => [`${v} units`, "Qty Sold"]}
                  contentStyle={{
                    background: "#18181b",
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  itemStyle={{ color: "#fff" }}
                />
                <Bar
                  dataKey="qty_sold"
                  fill="#18181b"
                  radius={[4, 4, 0, 0]}
                  barSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e4e4e7",
            padding: "0",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{ padding: "20px 24px", borderBottom: "1px solid #f4f4f5" }}
          >
            <h3
              style={{
                margin: 0,
                fontWeight: 800,
                fontSize: 16,
                color: "#0a0a0a",
              }}
            >
              Low Stock Alerts
            </h3>
          </div>

          {!data.low_stock_alerts || data.low_stock_alerts.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "#71717a",
                fontSize: 13,
                fontWeight: 500,
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              All products are well-stocked.
            </div>
          ) : (
            <div style={{ overflowX: "auto", flex: 1 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    <th
                      style={{
                        padding: "12px 24px",
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#71717a",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        borderBottom: "1px solid #e4e4e7",
                      }}
                    >
                      Product
                    </th>
                    <th
                      style={{
                        padding: "12px 24px",
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#71717a",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        borderBottom: "1px solid #e4e4e7",
                      }}
                    >
                      Stock
                    </th>
                    <th
                      style={{
                        padding: "12px 24px",
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#71717a",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        borderBottom: "1px solid #e4e4e7",
                      }}
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.low_stock_alerts.map((p) => (
                    <tr
                      key={p.id}
                      style={{ borderBottom: "1px solid #f4f4f5" }}
                    >
                      <td
                        style={{
                          padding: "14px 24px",
                          color: "#18181b",
                          fontWeight: 600,
                        }}
                      >
                        {p.name}
                      </td>
                      <td
                        style={{
                          padding: "14px 24px",
                          color: "#52525b",
                          fontWeight: 600,
                        }}
                      >
                        {p.stock}
                      </td>
                      <td style={{ padding: "14px 24px" }}>
                        <span
                          style={{
                            ...getStockStatusStyle(p.stock_status),
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "capitalize",
                            display: "inline-block",
                          }}
                        >
                          {String(p.stock_status || "").replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e4e4e7",
          padding: "0",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <div
          style={{ padding: "20px 24px", borderBottom: "1px solid #f4f4f5" }}
        >
          <h3
            style={{
              margin: 0,
              fontWeight: 800,
              fontSize: 16,
              color: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Clock size={18} /> Recent Orders Today
          </h3>
        </div>

        {!data.recent_orders || data.recent_orders.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "#71717a",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            No orders processed today.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th
                    style={{
                      padding: "14px 24px",
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#71717a",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      borderBottom: "1px solid #e4e4e7",
                    }}
                  >
                    Order #
                  </th>
                  <th
                    style={{
                      padding: "14px 24px",
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#71717a",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      borderBottom: "1px solid #e4e4e7",
                    }}
                  >
                    Customer
                  </th>
                  <th
                    style={{
                      padding: "14px 24px",
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#71717a",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      borderBottom: "1px solid #e4e4e7",
                    }}
                  >
                    Total
                  </th>
                  <th
                    style={{
                      padding: "14px 24px",
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#71717a",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      borderBottom: "1px solid #e4e4e7",
                    }}
                  >
                    Payment
                  </th>
                  <th
                    style={{
                      padding: "14px 24px",
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#71717a",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      borderBottom: "1px solid #e4e4e7",
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: "14px 24px",
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#71717a",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      borderBottom: "1px solid #e4e4e7",
                    }}
                  >
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recent_orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                    <td style={{ padding: "16px 24px", color: "#18181b" }}>
                      <strong style={{ fontWeight: 800 }}>
                        {o.order_number}
                      </strong>
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        color: "#18181b",
                        fontWeight: 600,
                      }}
                    >
                      {o.walkin_customer_name}
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        color: "#0a0a0a",
                        fontWeight: 800,
                      }}
                    >
                      ₱
                      {parseFloat(o.total || 0).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        color: "#52525b",
                        textTransform: "capitalize",
                        fontWeight: 500,
                      }}
                    >
                      {o.payment_method}
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <span
                        style={{
                          ...getOrderStatusStyle(o.status),
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "capitalize",
                          display: "inline-block",
                        }}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        color: "#71717a",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {new Date(o.created_at).toLocaleTimeString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
