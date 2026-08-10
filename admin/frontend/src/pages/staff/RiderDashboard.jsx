// WISDOM RIDER DASHBOARD DELIVERIES FINAL V1
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle,
  Clock3,
  MapPin,
  Navigation,
  Package,
  Truck,
} from "lucide-react";
import api from "../../services/api";
import "./RiderScreen.css";

const normalize = (value) => String(value || "").trim().toLowerCase();

const toDateKey = (value) => {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
};

const getTodayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateOnly = (value) => {
  const key = toDateKey(value);
  if (!key) return "Not scheduled";

  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "Not scheduled";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const parseCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isBlueprintOrder = (orderType) =>
  normalize(orderType) === "blueprint";

const getMapHref = (delivery = {}) => {
  const lat = parseCoordinate(delivery.delivery_lat);
  const lng = parseCoordinate(delivery.delivery_lng);

  if (
    lat !== null &&
    lng !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  if (isBlueprintOrder(delivery.order_type)) return null;

  const address = String(delivery.address || "").trim();
  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;
};

const safeTime = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const currentDeliveryTime = (delivery = {}) =>
  Math.max(
    safeTime(delivery.updated_at),
    safeTime(delivery.assigned_at),
    safeTime(delivery.created_at),
    Number(delivery.id || 0),
  );

const assignedDeliveryTime = (delivery = {}) => {
  const assigned = safeTime(delivery.assigned_at);
  if (assigned) return assigned;

  const created = safeTime(delivery.created_at);
  if (created) return created;

  const updated = safeTime(delivery.updated_at);
  if (updated) return updated;

  return Number(delivery.id || 0);
};

const newestCurrentFirst = (a, b) =>
  currentDeliveryTime(b) - currentDeliveryTime(a) ||
  Number(b.id || 0) - Number(a.id || 0);

const newestAssignedFirst = (a, b) =>
  assignedDeliveryTime(b) - assignedDeliveryTime(a) ||
  Number(b.id || 0) - Number(a.id || 0);

const amountToCollectLabel = (delivery = {}) => {
  const balance = Number(delivery.payment_balance || 0);
  if (balance <= 0.009) return "None";

  const method = normalize(delivery.remaining_payment_method) || "cash";
  if (method === "paymongo") return "Online Payment";

  return formatMoney(balance);
};

export default function RiderDashboard() {
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  const todayKey = getTodayKey();
  const todayLabel = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  useEffect(() => {
    api
      .get("/pos/deliveries")
      .then((res) => {
        setDeliveries(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        console.error("Failed to load rider dashboard data", err);
        setDeliveries([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const inTransitDeliveries = useMemo(
    () =>
      deliveries
        .filter((delivery) => normalize(delivery.status) === "in_transit")
        .sort(newestCurrentFirst),
    [deliveries],
  );

  const scheduledDeliveries = useMemo(
    () =>
      deliveries
        .filter((delivery) => normalize(delivery.status) === "scheduled")
        .sort(newestAssignedFirst),
    [deliveries],
  );

  // Current Delivery is the most recently active In Transit job.
  // If none is active, the newest Scheduled job is shown as the next job.
  const currentDelivery =
    inTransitDeliveries[0] || scheduledDeliveries[0] || null;

  // Up Next behaves like a newest-assignment queue:
  // each new Scheduled assignment is inserted at the top.
  const upNext = scheduledDeliveries
    .filter(
      (delivery) =>
        !currentDelivery ||
        Number(delivery.id) !== Number(currentDelivery.id),
    )
    .slice(0, 4);

  const activeCount =
    inTransitDeliveries.length + scheduledDeliveries.length;

  const dueToday = [...inTransitDeliveries, ...scheduledDeliveries].filter(
    (delivery) => toDateKey(delivery.scheduled_date) === todayKey,
  ).length;

  const deliveredToday = deliveries.filter(
    (delivery) =>
      normalize(delivery.status) === "delivered" &&
      toDateKey(delivery.delivered_date || delivery.updated_at) === todayKey,
  ).length;

  if (loading) {
    return (
      <div className="rider-page-shell">
        <div className="rider-v2-loading">Loading dashboard...</div>
      </div>
    );
  }

  const currentMapHref = currentDelivery
    ? getMapHref(currentDelivery)
    : null;

  return (
    <div className="rider-page-shell rider-dashboard-v2">
      <header className="rider-v2-page-header">
        <div>
          <h2 className="rider-header-title">Driver Dashboard</h2>
          <p className="rider-header-subtitle">
            Your current delivery and next stops.
          </p>
        </div>
        <div className="rider-v2-date">{todayLabel}</div>
      </header>

      <div className="rider-v2-hero-grid">
        <section className="rider-card rider-v2-current">
          <div className="rider-v2-section-kicker">Current Delivery</div>

          {currentDelivery ? (
            <>
              <div className="rider-v2-current-top">
                <div>
                  <div className="rider-v2-order-number">
                    {currentDelivery.order_number || "Order"}
                  </div>
                  <div className="rider-v2-customer">
                    {currentDelivery.customer_name || "Customer"}
                  </div>
                </div>

                <span
                  className={`rider-v2-status ${
                    normalize(currentDelivery.status) === "in_transit"
                      ? "is-active"
                      : ""
                  }`}
                >
                  {normalize(currentDelivery.status) === "in_transit"
                    ? "In Transit"
                    : "Scheduled"}
                </span>
              </div>

              <div className="rider-v2-current-details">
                <div className="rider-v2-detail">
                  <MapPin size={16} strokeWidth={1.9} />
                  <div>
                    <span>Destination</span>
                    <strong>
                      {currentDelivery.address || "Address unavailable"}
                    </strong>
                  </div>
                </div>

                <div className="rider-v2-detail">
                  <Clock3 size={16} strokeWidth={1.9} />
                  <div>
                    <span>Schedule</span>
                    <strong>
                      {formatDateOnly(currentDelivery.scheduled_date)}
                    </strong>
                  </div>
                </div>

                <div className="rider-v2-detail">
                  <Package size={16} strokeWidth={1.9} />
                  <div>
                    <span>Amount to Collect</span>
                    <strong>{amountToCollectLabel(currentDelivery)}</strong>
                  </div>
                </div>
              </div>

              <div className="rider-v2-current-actions">
                {currentMapHref ? (
                  <a
                    className="rider-v2-btn rider-v2-btn-secondary"
                    href={currentMapHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Navigation size={15} strokeWidth={2} />
                    Open Map
                  </a>
                ) : null}

                <button
                  type="button"
                  className="rider-v2-btn rider-v2-btn-primary"
                  onClick={() =>
                    navigate(
                      `/staff/deliveries?focus_delivery_id=${currentDelivery.id}`,
                    )
                  }
                >
                  View Delivery
                </button>
              </div>
            </>
          ) : (
            <div className="rider-v2-current-empty">
              <CheckCircle size={24} strokeWidth={1.8} />
              <div>
                <strong>No active delivery</strong>
                <span>You have no delivery that needs action right now.</span>
              </div>
            </div>
          )}
        </section>

        <aside className="rider-card rider-v2-today">
          <div className="rider-v2-section-kicker">Today</div>

          <div className="rider-v2-today-row">
            <Truck size={17} strokeWidth={1.9} />
            <span>Active</span>
            <strong>{activeCount}</strong>
          </div>
          <div className="rider-v2-today-row">
            <Clock3 size={17} strokeWidth={1.9} />
            <span>Due Today</span>
            <strong>{dueToday}</strong>
          </div>
          <div className="rider-v2-today-row">
            <CheckCircle size={17} strokeWidth={1.9} />
            <span>Delivered</span>
            <strong>{deliveredToday}</strong>
          </div>
        </aside>
      </div>

      <section className="rider-card rider-v2-queue">
        <div className="rider-v2-queue-header">
          <div>
            <h3>Up Next</h3>
            <p>Newest assigned deliveries that have not started yet.</p>
          </div>
          <button
            type="button"
            className="rider-v2-text-action"
            onClick={() => navigate("/staff/deliveries")}
          >
            View all
          </button>
        </div>

        {upNext.length === 0 ? (
          <div className="rider-v2-queue-empty">
            No newly assigned deliveries.
          </div>
        ) : (
          <div className="rider-v2-queue-list">
            {upNext.map((delivery) => (
              <div
                className="rider-v2-queue-row rider-v3-queue-row"
                key={delivery.id}
              >
                <div className="rider-v2-queue-main">
                  <strong>{delivery.customer_name || "Customer"}</strong>
                  <span>{delivery.order_number || "Order"}</span>
                </div>
                <div className="rider-v2-queue-destination">
                  {delivery.address || "Address unavailable"}
                </div>
                <div className="rider-v2-queue-date">
                  {formatDateOnly(delivery.scheduled_date)}
                </div>
                <span className="rider-v2-status">Scheduled</span>
                <button
                  type="button"
                  className="rider-v2-row-action"
                  onClick={() =>
                    navigate(
                      `/staff/deliveries?focus_delivery_id=${delivery.id}`,
                    )
                  }
                >
                  View
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
