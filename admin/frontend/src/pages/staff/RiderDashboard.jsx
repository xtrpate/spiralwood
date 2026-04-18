import { useState, useEffect } from "react";
import api from "../../services/api";
import { Package, Truck, CheckCircle, MapPin } from "lucide-react";

export default function RiderDashboard() {
  const [stats, setStats] = useState(null);
  const [activeDeliveries, setActiveDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get formatted date like "Saturday, April 18, 2026"
  const todayDateString = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  useEffect(() => {
    // Fetch both the dashboard stats AND the active deliveries list at the same time
    Promise.all([
      api.get("/pos/deliveries/dashboard"),
      api.get("/pos/deliveries"), // Reusing your existing endpoint from DeliveryManagement
    ])
      .then(([statsRes, deliveriesRes]) => {
        setStats(statsRes.data);

        // Filter only active deliveries (scheduled or in_transit) for the table, max 5
        const active = (
          Array.isArray(deliveriesRes.data) ? deliveriesRes.data : []
        )
          .filter((d) => d.status === "scheduled" || d.status === "in_transit")
          .slice(0, 5);
        setActiveDeliveries(active);
      })
      .catch((err) => console.error("Failed to load rider dashboard data", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div style={{ padding: "24px" }}>Loading dashboard...</div>;

  return (
    <div
      style={{
        padding: "24px",
        maxWidth: "1400px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      {/* ── Header ── */}
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: "26px",
            color: "#0f172a",
            fontWeight: 800,
          }}
        >
          Rider Dashboard
        </h2>
        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "14px" }}>
          Today's overview — {todayDateString}
        </p>
      </div>

      {/* ── Summary Cards (Matching Cashier UI) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "20px",
        }}
      >
        {/* Card 1: Total Assigned */}
        <div style={statCard}>
          <div
            style={{ ...iconWrapper, background: "#fef3c7", color: "#d97706" }}
          >
            <Package size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div style={statNumber}>{stats?.total_deliveries || 0}</div>
            <div style={statLabel}>Total Assigned Today</div>
          </div>
        </div>

        {/* Card 2: In Transit / Pending */}
        <div style={statCard}>
          <div
            style={{ ...iconWrapper, background: "#eff6ff", color: "#2563eb" }}
          >
            <Truck size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div style={statNumber}>{stats?.pending_today || 0}</div>
            <div style={statLabel}>Pending / In Transit</div>
          </div>
        </div>

        {/* Card 3: Completed */}
        <div style={statCard}>
          <div
            style={{ ...iconWrapper, background: "#ecfdf5", color: "#16a34a" }}
          >
            <CheckCircle size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div style={statNumber}>{stats?.completed_today || 0}</div>
            <div style={statLabel}>Successfully Delivered</div>
          </div>
        </div>
      </div>

      {/* ── Today's Itinerary Table (Matching Cashier UI) ── */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e5e7eb",
          padding: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <MapPin size={20} color="#0f172a" />
          <h3
            style={{
              margin: 0,
              fontSize: "18px",
              color: "#0f172a",
              fontWeight: 700,
            }}
          >
            Active Deliveries Today
          </h3>
        </div>

        {activeDeliveries.length === 0 ? (
          <div style={{ color: "#64748b", padding: "10px 0" }}>
            No pending deliveries right now. You're all caught up!
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                whiteSpace: "nowrap",
              }}
            >
              <thead style={{ borderBottom: "1px solid #e5e7eb" }}>
                <tr>
                  <th style={thStyle}>Order #</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Destination</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeDeliveries.map((delivery) => (
                  <tr
                    key={delivery.id}
                    style={{ borderBottom: "1px solid #f1f5f9" }}
                  >
                    <td
                      style={{ ...tdStyle, fontWeight: 700, color: "#0f172a" }}
                    >
                      {delivery.order_number}
                    </td>
                    <td style={tdStyle}>{delivery.customer_name}</td>
                    <td
                      style={{
                        ...tdStyle,
                        color: "#64748b",
                        maxWidth: "300px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {delivery.address}
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
                            delivery.status === "in_transit"
                              ? "#fffbeb"
                              : "#eff6ff",
                          color:
                            delivery.status === "in_transit"
                              ? "#b45309"
                              : "#1d4ed8",
                        }}
                      >
                        {delivery.status.replace("_", " ")}
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
  );
}

// Reusable Styles matching the Cashier Dashboard Theme
const statCard = {
  background: "#ffffff",
  borderRadius: "16px",
  border: "1px solid #e5e7eb",
  padding: "24px",
  display: "flex",
  alignItems: "center",
  gap: "20px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
};

const iconWrapper = {
  width: "56px",
  height: "56px",
  borderRadius: "14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const statNumber = {
  fontSize: "28px",
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.2,
};

const statLabel = {
  fontSize: "14px",
  color: "#64748b",
  fontWeight: 500,
  marginTop: "2px",
};

const thStyle = {
  padding: "16px 12px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: "700",
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle = {
  padding: "16px 12px",
  fontSize: "14px",
  color: "#334155",
};
