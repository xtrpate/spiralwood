import { useState, useEffect } from "react";
import api from "../../services/api";
import { Package, Truck, CheckCircle, MapPin } from "lucide-react";
import "./RiderScreen.css";

const parseMapCoordinate = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const getBlueprintMapsHref = (lat, lng) => {
  const latitude = parseMapCoordinate(lat);
  const longitude = parseMapCoordinate(lng);
  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    return null;
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
};

const getStandardMapsHref = (lat, lng, address) => {
  const coordinateHref = getBlueprintMapsHref(lat, lng);
  if (coordinateHref) return coordinateHref;
  const trimmedAddress = String(address || "").trim();
  return trimmedAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedAddress)}`
    : null;
};

const isBlueprintOrderType = (orderType) =>
  String(orderType || "")
    .trim()
    .toLowerCase() === "blueprint";

const getGoogleMapsHref = (lat, lng, address, orderType) =>
  isBlueprintOrderType(orderType)
    ? getBlueprintMapsHref(lat, lng)
    : getStandardMapsHref(lat, lng, address);

export default function RiderDashboard() {
  const [stats, setStats] = useState(null);
  const [activeDeliveries, setActiveDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  const todayDateString = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  useEffect(() => {
    Promise.all([
      api.get("/pos/deliveries/dashboard"),
      api.get("/pos/deliveries"),
    ])
      .then(([statsRes, deliveriesRes]) => {
        setStats(statsRes.data);
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
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: "#71717a",
          fontWeight: 600,
        }}
      >
        Loading dashboard...
      </div>
    );

  return (
    <div className="rider-page-shell">
      <div>
        <h2 className="rider-header-title">Driver Dashboard</h2>
        <p className="rider-header-subtitle">
          Today's overview — {todayDateString}
        </p>
      </div>

      <div className="rider-stats-grid">
        <div className="rider-stat-card">
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f4f4f5",
              color: "#18181b",
            }}
          >
            <Package size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#0a0a0a",
                lineHeight: 1,
              }}
            >
              {stats?.total_deliveries || 0}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#71717a",
                fontWeight: 800,
                marginTop: 6,
                textTransform: "uppercase",
              }}
            >
              Total Assigned Today
            </div>
          </div>
        </div>

        <div className="rider-stat-card">
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#18181b",
              color: "#ffffff",
            }}
          >
            <Truck size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#0a0a0a",
                lineHeight: 1,
              }}
            >
              {stats?.pending_today || 0}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#71717a",
                fontWeight: 800,
                marginTop: 6,
                textTransform: "uppercase",
              }}
            >
              Pending / In Transit
            </div>
          </div>
        </div>

        <div className="rider-stat-card">
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f4f4f5",
              color: "#18181b",
            }}
          >
            <CheckCircle size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#0a0a0a",
                lineHeight: 1,
              }}
            >
              {stats?.completed_today || 0}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#71717a",
                fontWeight: 800,
                marginTop: 6,
                textTransform: "uppercase",
              }}
            >
              Successfully Delivered
            </div>
          </div>
        </div>
      </div>

      <div className="rider-card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "20px 24px",
            borderBottom: "1px solid #f4f4f5",
            background: "#fafafa",
          }}
        >
          <MapPin size={20} color="#0a0a0a" />
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              color: "#0a0a0a",
              fontWeight: 800,
            }}
          >
            Active Deliveries Today
          </h3>
        </div>

        {activeDeliveries.length === 0 ? (
          <div
            style={{
              color: "#71717a",
              padding: 40,
              textAlign: "center",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            No pending deliveries right now. You're all caught up!
          </div>
        ) : (
          <table className="rider-table rider-mobile-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Destination</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeDeliveries.map((delivery) => {
                const mapsHref = getGoogleMapsHref(
                  delivery.delivery_lat,
                  delivery.delivery_lng,
                  delivery.address,
                  delivery.order_type,
                );
                const isBlueprintDelivery = isBlueprintOrderType(
                  delivery.order_type,
                );
                return (
                  <tr key={delivery.id}>
                    {/* 👉 ADDED data-label attributes for mobile cards */}
                    <td
                      data-label="Order #"
                      style={{ fontWeight: 800, color: "#0a0a0a" }}
                    >
                      {delivery.order_number}
                    </td>
                    <td data-label="Customer" style={{ fontWeight: 600 }}>
                      {delivery.customer_name}
                    </td>
                    <td
                      data-label="Destination"
                      style={{ color: "#52525b", maxWidth: 300 }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          justifyContent: "flex-end",
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={delivery.address}
                        >
                          {delivery.address}
                        </span>
                        {mapsHref ? (
                          <a
                            href={mapsHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in Google Maps"
                          >
                            <MapPin size={14} color="#2563eb" />
                          </a>
                        ) : isBlueprintDelivery ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              color: "#a1a1aa",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            <MapPin size={14} color="#a1a1aa" /> Location pin
                            unavailable
                          </span>
                        ) : (
                          <span title="Location unavailable">
                            <MapPin size={14} color="#d4d4d8" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Status">
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          background:
                            delivery.status === "in_transit"
                              ? "#18181b"
                              : "#f4f4f5",
                          color:
                            delivery.status === "in_transit"
                              ? "#ffffff"
                              : "#18181b",
                        }}
                      >
                        {delivery.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
