import { useState, useEffect } from "react";
import api from "../../services/api";
import { Package, CheckCircle, Clock } from "lucide-react";

export default function RiderDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/pos/deliveries/dashboard")
      .then((res) => setStats(res.data))
      .catch((err) => console.error("Failed to load rider stats", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div style={{ padding: "24px" }}>Loading dashboard...</div>;

  return (
    <div
      style={{
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: "24px", color: "#0f172a" }}>
          Rider Dashboard
        </h2>
        <p style={{ margin: "4px 0 0", color: "#64748b" }}>
          Your delivery overview for today.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "16px",
        }}
      >
        <div
          style={{
            padding: "20px",
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              padding: "12px",
              background: "#eff6ff",
              color: "#1d4ed8",
              borderRadius: "50%",
            }}
          >
            <Package size={24} />
          </div>
          <div>
            <div style={{ fontSize: "24px", fontWeight: "bold" }}>
              {stats?.total_deliveries || 0}
            </div>
            <div style={{ fontSize: "14px", color: "#64748b" }}>
              Total Assigned Today
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "20px",
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              padding: "12px",
              background: "#fffbeb",
              color: "#b45309",
              borderRadius: "50%",
            }}
          >
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: "24px", fontWeight: "bold" }}>
              {stats?.pending_today || 0}
            </div>
            <div style={{ fontSize: "14px", color: "#64748b" }}>
              Pending / In Transit
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "20px",
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              padding: "12px",
              background: "#ecfdf5",
              color: "#15803d",
              borderRadius: "50%",
            }}
          >
            <CheckCircle size={24} />
          </div>
          <div>
            <div style={{ fontSize: "24px", fontWeight: "bold" }}>
              {stats?.completed_today || 0}
            </div>
            <div style={{ fontSize: "14px", color: "#64748b" }}>
              Successfully Delivered
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
