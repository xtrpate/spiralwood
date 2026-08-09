import { useState, useEffect, useMemo } from "react";
import api from "../../services/api";
import { Calendar, MapPin } from "lucide-react";
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

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function RiderHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    api
      .get("/pos/deliveries/history")
      .then((res) => setHistory(res.data))
      .catch((err) => console.error("Failed to load history", err))
      .finally(() => setLoading(false));
  }, []);

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
        Loading history...
      </div>
    );

  return (
    <div className="rider-page-shell">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h2 className="rider-header-title">Delivery History</h2>
          <p className="rider-header-subtitle">
            Review past deliveries and customer details.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "#ffffff",
            padding: "8px 14px",
            borderRadius: 12,
            border: "1px solid #e4e4e7",
            flexWrap: "wrap",
          }}
        >
          <Calendar size={16} color="#71717a" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              border: "1px solid #e4e4e7",
              borderRadius: 8,
              padding: "6px 10px",
              outline: "none",
              color: "#18181b",
              fontSize: 13,
            }}
          />
          <span style={{ color: "#71717a", fontSize: 13, fontWeight: 600 }}>
            to
          </span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              border: "1px solid #e4e4e7",
              borderRadius: 8,
              padding: "6px 10px",
              outline: "none",
              color: "#18181b",
              fontSize: 13,
            }}
          />
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div
          style={{
            padding: 40,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e4e4e7",
            color: "#71717a",
            textAlign: "center",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          No completed or failed deliveries found for this date range.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {filteredHistory.map((h) => {
            const mapsHref = getGoogleMapsHref(
              h.delivery_lat,
              h.delivery_lng,
              h.address,
              h.order_type,
            );
            const isBlueprintDelivery = isBlueprintOrderType(h.order_type);
            return (
              <div
                key={h.delivery_id}
                className="rider-card"
                style={{
                  padding: "16px",
                  border: `2px solid ${h.status === "delivered" ? "#0a0a0a" : "#ef4444"}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "12px",
                    marginBottom: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: 800,
                        color: "#0a0a0a",
                        marginBottom: "4px",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {h.order_number}
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#52525b",
                        fontWeight: 600,
                      }}
                    >
                      {h.customer_name}
                    </div>
                  </div>

                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      background:
                        h.status === "delivered" ? "#0a0a0a" : "#fef2f2",
                      color: h.status === "delivered" ? "#ffffff" : "#991b1b",
                      border: `1px solid ${h.status === "delivered" ? "#0a0a0a" : "#fecaca"}`,
                    }}
                  >
                    {h.status}
                  </span>
                </div>

                <div className="rider-details-grid">
                  <InfoCard
                    label="Date & Time"
                    value={formatDateTime(h.updated_at)}
                  />
                  <InfoCard
                    label="Address"
                    value={
                      <>
                        {h.address || "—"}
                        {mapsHref ? (
                          <a
                            href={mapsHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "block",
                              marginTop: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#2563eb",
                            }}
                          >
                            Open in Google Maps ↗
                          </a>
                        ) : isBlueprintDelivery ? (
                          <span
                            style={{
                              display: "block",
                              marginTop: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#a1a1aa",
                            }}
                          >
                            Location pin unavailable
                          </span>
                        ) : null}
                      </>
                    }
                  />
                  <InfoCard
                    label="Total"
                    value={`₱${Number(h.total || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}`}
                  />
                  <InfoCard
                    label="Payment"
                    value={
                      <span style={{ textTransform: "capitalize" }}>
                        {h.payment_status || "Pending"}
                      </span>
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div
      className="rider-card"
      style={{ padding: "12px", background: "#fafafa" }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 800,
          color: "#71717a",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: "6px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "14px",
          fontWeight: 700,
          color: "#18181b",
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}
