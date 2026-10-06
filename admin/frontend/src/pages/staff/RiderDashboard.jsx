// WISDOM RIDER DASHBOARD DELIVERIES FINAL V1
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { PH_TIME_ZONE, parseSystemDateTime } from "../../utils/dateTime";
import { getSocket, subscribeSocketReady } from "../../services/socket";
import "./RiderScreen.css";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const toDateKey = (value) => {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
};

const getPHDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : parseSystemDateTime(value);
  if (!date || Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const byType = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return byType.year && byType.month && byType.day
    ? `${byType.year}-${byType.month}-${byType.day}`
    : "";
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

const isBlueprintOrder = (orderType) => normalize(orderType) === "blueprint";

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
  const date = parseSystemDateTime(value);
  return date ? date.getTime() : 0;
};

const isSuccessfulDeliveryOutcome = (delivery = {}) => {
  const status = normalize(delivery.status);
  if (status === "delivered") return true;

  return (
    status === "completed" &&
    !normalize(delivery.notes).includes("failure reason:")
  );
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
  const [loadError, setLoadError] = useState("");

  const deliveriesRequestRef = useRef(0);

  const todayKey = getPHDateKey();
  const todayLabel = new Date().toLocaleDateString("en-PH", {
    timeZone: PH_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const loadDeliveries = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++deliveriesRequestRef.current;

    if (!silent) {
      setLoading(true);
      setLoadError("");
    }

    try {
      const res = await api.get("/pos/deliveries");

      if (requestId !== deliveriesRequestRef.current) return;
      if (!Array.isArray(res.data)) {
        throw new Error("Invalid rider deliveries response.");
      }

      setDeliveries(res.data);
      setLoadError("");
    } catch (err) {
      if (requestId !== deliveriesRequestRef.current) return;

      console.error("Failed to load rider dashboard data", err);

      if (!silent) {
        setLoadError(
          err?.response?.data?.message ||
            "Unable to load your deliveries. Please try again.",
        );
      }
    } finally {
      if (requestId === deliveriesRequestRef.current && !silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  useEffect(() => {
    const handleAssignmentChanged = () => {
      loadDeliveries({ silent: true });
    };

    const handleDeliveryUpdated = (payload) => {
      if (payload?.order_status_changed) {
        return;
      }

      loadDeliveries({ silent: true });
    };

    const handleOrderStatusUpdated = () => {
      loadDeliveries({ silent: true });
    };

    const handlePageShow = (event) => {
      // Reload when the browser restores this page from Back-Forward Cache.
      if (event.persisted) {
        loadDeliveries({ silent: true });
      }
    };

    const attachListener = (socket) => {
      if (!socket) return;

      socket.off("delivery:assigned", handleAssignmentChanged);
      socket.on("delivery:assigned", handleAssignmentChanged);

      socket.off("delivery:unassigned", handleAssignmentChanged);
      socket.on("delivery:unassigned", handleAssignmentChanged);

      socket.off("delivery:updated", handleDeliveryUpdated);
      socket.on("delivery:updated", handleDeliveryUpdated);

      socket.off("order:status_updated", handleOrderStatusUpdated);
      socket.on("order:status_updated", handleOrderStatusUpdated);
    };

    const socket = getSocket();

    if (socket) {
      attachListener(socket);
    }

    const unsubscribeReady = subscribeSocketReady((readySocket) => {
      attachListener(readySocket);
    });

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      const currentSocket = getSocket();

      if (currentSocket) {
        currentSocket.off("delivery:assigned", handleAssignmentChanged);
        currentSocket.off("delivery:unassigned", handleAssignmentChanged);
        currentSocket.off("delivery:updated", handleDeliveryUpdated);
        currentSocket.off("order:status_updated", handleOrderStatusUpdated);
      }

      window.removeEventListener("pageshow", handlePageShow);

      unsubscribeReady();
    };
  }, [loadDeliveries]);

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
        !currentDelivery || Number(delivery.id) !== Number(currentDelivery.id),
    )
    .slice(0, 4);

  const activeCount = inTransitDeliveries.length + scheduledDeliveries.length;

  const dueToday = [...inTransitDeliveries, ...scheduledDeliveries].filter(
    (delivery) => toDateKey(delivery.scheduled_date) === todayKey,
  ).length;

  const deliveredToday = deliveries.filter(
    (delivery) =>
      isSuccessfulDeliveryOutcome(delivery) &&
      getPHDateKey(delivery.delivered_date || delivery.updated_at) === todayKey,
  ).length;

  if (loading) {
    return (
      <div className="rider-page-shell">
        <div className="rider-v2-loading">Loading dashboard...</div>
      </div>
    );
  }

  const currentMapHref = currentDelivery ? getMapHref(currentDelivery) : null;

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

      {loadError ? (
        <div className="rider-load-error" role="alert">
          <span>{loadError}</span>
          <button
            type="button"
            className="rider-v2-btn rider-v2-btn-secondary"
            onClick={() => loadDeliveries()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="rider-v2-hero-grid">
        <section className="rider-card rider-v2-current">
          <div className="rider-v2-section-kicker">Current Delivery</div>

          {loadError ? (
            <div className="rider-v2-current-empty">
              <Clock3 size={24} strokeWidth={1.8} />
              <div>
                <strong>Delivery data unavailable</strong>
                <span>Retry to refresh your assigned deliveries.</span>
              </div>
            </div>
          ) : currentDelivery ? (
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
            <strong>{loadError ? "—" : activeCount}</strong>
          </div>
          <div className="rider-v2-today-row">
            <Clock3 size={17} strokeWidth={1.9} />
            <span>Due Today</span>
            <strong>{loadError ? "—" : dueToday}</strong>
          </div>
          <div className="rider-v2-today-row">
            <CheckCircle size={17} strokeWidth={1.9} />
            <span>Delivered</span>
            <strong>{loadError ? "—" : deliveredToday}</strong>
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

        {loadError ? (
          <div className="rider-v2-queue-empty">
            Delivery queue unavailable until retry succeeds.
          </div>
        ) : upNext.length === 0 ? (
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
