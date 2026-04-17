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

const orderStatusBadge = (status) => {
  const key = String(status || "").toLowerCase();

  if (key === "completed" || key === "delivered") return "badge-green";
  if (key === "confirmed") return "badge-blue";
  if (key === "pending" || key === "shipping" || key === "production")
    return "badge-yellow";
  if (key === "cancelled") return "badge-red";
  return "badge-gray";
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
    return <div className="loading-screen">Loading dashboard...</div>;

  if (!data)
    return (
      <div className="page-header">
        <p>Failed to load dashboard.</p>
      </div>
    );

  const statusColor = (s) => {
    if (s === "in_stock") return "badge-green";
    if (s === "low_stock") return "badge-yellow";
    return "badge-red";
  };

  return (
    <div>
      <div className="page-header">
        <h1>POS Dashboard</h1>
        <p>
          Today's overview —{" "}
          {new Date().toLocaleDateString("en-PH", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon brown">
            <ShoppingBag size={22} />
          </div>
          <div>
            <div className="stat-value">{data.today?.order_count ?? 0}</div>
            <div className="stat-label">Orders Today</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <DollarSign size={22} />
          </div>
          <div>
            <div className="stat-value">
              ₱
              {parseFloat(data.today?.total_sales || 0).toLocaleString(
                "en-PH",
                {
                  minimumFractionDigits: 2,
                },
              )}
            </div>
            <div className="stat-label">Sales Today</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="stat-value">
              ₱
              {parseFloat(data.weekly_sales || 0).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
              })}
            </div>
            <div className="stat-label">This Week</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon red">
            <AlertTriangle size={22} />
          </div>
          <div>
            <div className="stat-value">
              {data.low_stock_alerts?.length ?? 0}
            </div>
            <div className="stat-label">Low Stock Alerts</div>
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
        <div className="card">
          <h3 style={{ marginBottom: 16, fontWeight: 700, fontSize: 15 }}>
            Top Products Today
          </h3>
          {!data.top_products || data.top_products.length === 0 ? (
            <p style={{ color: "#aaa", fontSize: 13 }}>
              No sales recorded today.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.top_products}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="product_name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v} units`, "Qty Sold"]} />
                <Bar dataKey="qty_sold" fill="#8B4513" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16, fontWeight: 700, fontSize: 15 }}>
            Low Stock Alerts
          </h3>
          {!data.low_stock_alerts || data.low_stock_alerts.length === 0 ? (
            <p style={{ color: "#aaa", fontSize: 13 }}>
              All products are well-stocked.
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.low_stock_alerts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.stock}</td>
                    <td>
                      <span className={`badge ${statusColor(p.stock_status)}`}>
                        {String(p.stock_status || "").replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h3
          style={{
            marginBottom: 16,
            fontWeight: 700,
            fontSize: 15,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Clock size={16} /> Recent Orders Today
        </h3>

        {!data.recent_orders || data.recent_orders.length === 0 ? (
          <p style={{ color: "#aaa", fontSize: 13 }}>
            No orders processed today.
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.order_number}</strong>
                  </td>
                  <td>{o.walkin_customer_name}</td>
                  <td>
                    ₱
                    {parseFloat(o.total || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td style={{ textTransform: "capitalize" }}>
                    {o.payment_method}
                  </td>
                  <td>
                    <span className={`badge ${orderStatusBadge(o.status)}`}>
                      {o.status}
                    </span>
                  </td>
                  <td style={{ color: "#888", fontSize: 12 }}>
                    {new Date(o.created_at).toLocaleTimeString("en-PH", {
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
    </div>
  );
}
