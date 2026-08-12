import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../services/api";
import { Plus, Search, CalendarDays, Truck, CheckCircle2, CircleX, RotateCcw } from "lucide-react";

// WISDOM DELIVERY SCHEDULING PROFESSIONAL UI POLISH V1.0.1
// WISDOM DELIVERY SCHEDULING RESCHEDULE UI FIX V1.0.2
// WISDOM DELIVERY SCHEDULING MODAL FORM UI FIX V1.0.1
// WISDOM DELIVERY SCHEDULING FORM SIZE AND ORDER WIDTH FIX V1.0.1
// WISDOM FAILED DELIVERY RESCHEDULE FLOW V1.1.2

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

const normalizeDateTimeInput = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return raw.replace(" ", "T").slice(0, 16);
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getRequestedScheduleFromOrder = (order) =>
  order?.requested_delivery_date ||
  order?.preferred_delivery_date ||
  order?.delivery_requested_date ||
  order?.delivery_schedule ||
  order?.scheduled_date ||
  "";

const getDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatScheduleParts = (value) => {
  if (!value) return { date: "—", time: "" };

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: String(value), time: "" };
  }

  const dateText = date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const raw = String(value || "");
  const hasExplicitTime =
    /T\d{1,2}:\d{2}/.test(raw) ||
    /\s\d{1,2}:\d{2}/.test(raw);

  const timeText = hasExplicitTime
    ? date.toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return { date: dateText, time: timeText };
};

const normalizeStatus = (status) =>
  String(status || "")
    .trim()
    .toLowerCase();

const getDeliveryAttemptStatus = (delivery = {}) => {
  const status = normalizeStatus(delivery.status);
  const notes = String(delivery.notes || "")
    .trim()
    .toLowerCase();

  // Some older/admin receipt flows overwrote every attempt for an order
  // as delivered. Preserve a failed attempt when its own notes still
  // contain the rider's recorded failure reason.
  if (
    (status === "delivered" || status === "completed") &&
    notes.includes("failure reason:")
  ) {
    return "failed";
  }

  if (status === "completed") return "delivered";
  return status;
};

const formatStatusLabel = (status) => {
  const normalized = normalizeStatus(status);
  if (!normalized) return "Unknown";
  if (normalized === "in_transit") return "In transit";
  if (normalized === "completed") return "Delivered";

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const deliveryStatusRank = (status) => {
  switch (normalizeStatus(status)) {
    case "in_transit":
      return 1;
    case "scheduled":
      return 2;
    case "failed":
      return 3;
    case "delivered":
    case "completed":
      return 4;
    default:
      return 5;
  }
};

const sortDeliveries = (a, b) => {
  const rankA = deliveryStatusRank(getDeliveryAttemptStatus(a));
  const rankB = deliveryStatusRank(getDeliveryAttemptStatus(b));

  if (rankA !== rankB) return rankA - rankB;

  const dateA = new Date(a.scheduled_date || 0).getTime();
  const dateB = new Date(b.scheduled_date || 0).getTime();
  return dateB - dateA;
};

const getStatusStyle = (status) => {
  switch (normalizeStatus(status)) {
    case "scheduled":
      return {
        background: "#eff6ff",
        color: "#1d4ed8",
        border: "1px solid #bfdbfe",
      };
    case "in_transit":
      return {
        background: "#fff7ed",
        color: "#c2410c",
        border: "1px solid #fed7aa",
      };
    case "delivered":
    case "completed":
      return {
        background: "#f0fdf4",
        color: "#15803d",
        border: "1px solid #bbf7d0",
      };
    case "failed":
      return {
        background: "#fef2f2",
        color: "#b91c1c",
        border: "1px solid #fecaca",
      };
    default:
      return {
        background: "#fafafa",
        color: "#52525b",
        border: "1px solid #e4e4e7",
      };
  }
};

export default function DeliveryScheduling() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const todayLocal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const [deliveries, setDeliveries] = useState([]);
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    order_id: "",
    driver_id: "",
    address: "",
    scheduled_date: "",
    notes: "",
  });
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({
    driver_id: "",
    scheduled_date: "",
    reason: "",
    notes: "",
  });
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleFieldErrors, setRescheduleFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedDeliveryId, setFocusedDeliveryId] = useState(null);
  const [deliverySearch, setDeliverySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riderFilter, setRiderFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const riderFilterOptions = useMemo(() => {
    const names = new Set();

    deliveries.forEach((delivery) => {
      const name = String(delivery.driver_name || "").trim();
      if (name) names.add(name);
    });

    return [...names].sort((a, b) => a.localeCompare(b));
  }, [deliveries]);

  const latestDeliveryIdByOrder = useMemo(() => {
    const latest = new Map();

    deliveries.forEach((delivery) => {
      const orderKey = String(delivery.order_id || "");
      const deliveryId = Number(delivery.id);
      if (!orderKey || !Number.isInteger(deliveryId)) return;

      const currentId = Number(latest.get(orderKey) || 0);
      if (deliveryId > currentId) latest.set(orderKey, deliveryId);
    });

    return latest;
  }, [deliveries]);

  const statusCounts = useMemo(() => {
    const counts = {
      scheduled: 0,
      inTransit: 0,
      delivered: 0,
      failed: 0,
    };

    deliveries.forEach((delivery) => {
      const status = getDeliveryAttemptStatus(delivery);

      if (status === "scheduled") counts.scheduled += 1;
      if (status === "in_transit") counts.inTransit += 1;
      if (status === "delivered" || status === "completed") {
        counts.delivered += 1;
      }
      if (status === "failed") counts.failed += 1;
    });

    return counts;
  }, [deliveries]);

  const filteredDeliveries = useMemo(() => {
    const query = deliverySearch.trim().toLowerCase();

    return deliveries
      .filter((delivery) => {
        const status = getDeliveryAttemptStatus(delivery);

        const matchesSearch =
          !query ||
          [
            delivery.order_number,
            delivery.customer_name,
            delivery.address,
            delivery.driver_name,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(query),
          );

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "delivered"
            ? status === "delivered" || status === "completed"
            : status === statusFilter);

        const matchesRider =
          riderFilter === "all" ||
          String(delivery.driver_name || "") === riderFilter;

        const matchesDate =
          !dateFilter || getDateKey(delivery.scheduled_date) === dateFilter;

        return matchesSearch && matchesStatus && matchesRider && matchesDate;
      })
      .sort(sortDeliveries);
  }, [
    deliveries,
    deliverySearch,
    statusFilter,
    riderFilter,
    dateFilter,
  ]);

  const hasDeliveryFilters =
    Boolean(deliverySearch.trim()) ||
    statusFilter !== "all" ||
    riderFilter !== "all" ||
    Boolean(dateFilter);

  const validateForm = () => {
    const nextErrors = {};
    const now = new Date();

    if (!form.order_id) nextErrors.order_id = "Please select an order.";
    if (!form.driver_id)
      nextErrors.driver_id = "Please select a delivery rider.";

    if (!String(form.address || "").trim()) {
      nextErrors.address = "Delivery address is required.";
    }

    if (!form.scheduled_date) {
      nextErrors.scheduled_date = "Confirmed delivery schedule is required.";
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.scheduled_date)) {
      nextErrors.scheduled_date = "Confirmed delivery schedule is invalid.";
    } else {
      if (form.scheduled_date < todayLocal) {
        nextErrors.scheduled_date =
          "Confirmed delivery schedule cannot be in the past.";
      }
    }


    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const fetchDeliveries = useCallback(async () => {
    setListLoading(true);

    try {
      const res = await api.get("/pos/deliveries");
      setDeliveries(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load deliveries.");
      setDeliveries([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const fetchEligibleOrders = useCallback(async () => {
    try {
      const res = await api.get("/pos/deliverable-orders");
      setEligibleOrders(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load deliverable orders:", err);
      setEligibleOrders([]);
    }
  }, []);

  const fetchRiders = useCallback(async () => {
    try {
      const res = await api.get("/users");
      const list = Array.isArray(res.data) ? res.data : [];
      setRiders(
        list.filter(
          (u) =>
            u.role === "staff" &&
            u.staff_type === "delivery_rider" &&
            u.is_active,
        ),
      );
    } catch (err) {
      console.error("Failed to load riders:", err);
      setRiders([]);
    }
  }, []);

  useEffect(() => {
    fetchDeliveries();
    fetchEligibleOrders();
    fetchRiders();
  }, [fetchDeliveries, fetchEligibleOrders, fetchRiders]);

  // Notification double-click focus support. Clear presentation
  // filters first so the requested delivery is guaranteed to be visible,
  // then scroll to and briefly highlight the exact delivery record.
  useEffect(() => {
    const focusId = searchParams.get("focus_delivery_id");
    if (!focusId || listLoading) return;

    const numericId = Number(focusId);
    const match = deliveries.find((d) => Number(d.id) === numericId);

    if (!match) {
      const next = new URLSearchParams(searchParams);
      next.delete("focus_delivery_id");
      setSearchParams(next, { replace: true });
      return;
    }

    setDeliverySearch("");
    setStatusFilter("all");
    setRiderFilter("all");
    setDateFilter("");
    setFocusedDeliveryId(numericId);

    const scrollTimer = setTimeout(() => {
      document
        .getElementById(`delivery-row-${numericId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);

    const highlightTimer = setTimeout(() => setFocusedDeliveryId(null), 4000);

    const next = new URLSearchParams(searchParams);
    next.delete("focus_delivery_id");
    setSearchParams(next, { replace: true });

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(highlightTimer);
    };
  }, [searchParams, listLoading, deliveries]);

  const closeScheduleModal = () => {
    if (loading) return;

    setForm({
      order_id: "",
      driver_id: "",
      address: "",
      scheduled_date: "",
      notes: "",
    });
    setError("");
    setSuccess("");
    setFieldErrors({});
    setShowForm(false);
  };

  useEffect(() => {
    if (!showForm && !rescheduleTarget) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showForm, rescheduleTarget]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const payload = {
        order_id: form.order_id,
        driver_id: form.driver_id,
        address: String(form.address || "").trim(),
        scheduled_date: form.scheduled_date,
        notes: String(form.notes || "").trim(),
      };

      const res = await api.post("/pos/deliveries", payload);

      setSuccess(
        `Delivery scheduled successfully!${
          res.data?.assigned_driver?.name
            ? ` Assigned to: ${res.data.assigned_driver.name}`
            : ""
        }`,
      );

      setForm({
        order_id: "",
        driver_id: "",
        address: "",
        scheduled_date: "",
        notes: "",
      });
      setFieldErrors({});
      setError("");
      setShowForm(false);
      await Promise.all([fetchDeliveries(), fetchEligibleOrders()]);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to schedule delivery.");
    } finally {
      setLoading(false);
    }
  };

  const openRescheduleModal = (delivery) => {
    const orderKey = String(delivery?.order_id || "");
    const latestId = Number(latestDeliveryIdByOrder.get(orderKey) || 0);

    if (
      normalizeStatus(delivery?.status) !== "failed" ||
      Number(delivery?.id) !== latestId
    ) {
      setError("Only the latest failed delivery attempt can be rescheduled.");
      return;
    }

    setError("");
    setSuccess("");
    setRescheduleError("");
    setRescheduleFieldErrors({});
    setRescheduleTarget(delivery);
    setRescheduleForm({
      driver_id: delivery?.driver_id ? String(delivery.driver_id) : "",
      scheduled_date: "",
      reason: "",
      notes: "",
    });
  };

  const closeRescheduleModal = () => {
    if (rescheduleLoading) return;

    setRescheduleTarget(null);
    setRescheduleForm({
      driver_id: "",
      scheduled_date: "",
      reason: "",
      notes: "",
    });
    setRescheduleError("");
    setRescheduleFieldErrors({});
  };

  const validateRescheduleForm = () => {
    const nextErrors = {};

    if (!rescheduleForm.driver_id) {
      nextErrors.driver_id = "Please select a delivery rider.";
    }

    if (!rescheduleForm.scheduled_date) {
      nextErrors.scheduled_date = "New delivery date is required.";
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(rescheduleForm.scheduled_date)) {
      nextErrors.scheduled_date = "New delivery date is invalid.";
    } else if (rescheduleForm.scheduled_date < todayLocal) {
      nextErrors.scheduled_date = "New delivery date cannot be in the past.";
    }

    const reason = String(rescheduleForm.reason || "").trim();
    if (!reason) {
      nextErrors.reason = "Reschedule reason is required.";
    } else if (reason.length > 500) {
      nextErrors.reason = "Reschedule reason must be 500 characters or fewer.";
    }

    setRescheduleFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleRescheduleSubmit = async (event) => {
    event.preventDefault();
    setRescheduleError("");

    if (!rescheduleTarget || !validateRescheduleForm()) return;

    const sourceDeliveryId = Number(rescheduleTarget.id);
    if (!Number.isInteger(sourceDeliveryId) || sourceDeliveryId <= 0) {
      setRescheduleError("Invalid failed delivery record.");
      return;
    }

    setRescheduleLoading(true);

    try {
      const response = await api.post(
        `/pos/deliveries/${sourceDeliveryId}/reschedule`,
        {
          driver_id: rescheduleForm.driver_id,
          scheduled_date: rescheduleForm.scheduled_date,
          reschedule_reason: String(rescheduleForm.reason || "").trim(),
          notes: String(rescheduleForm.notes || "").trim(),
        },
      );

      setRescheduleTarget(null);
      setRescheduleForm({
        driver_id: "",
        scheduled_date: "",
        reason: "",
        notes: "",
      });
      setRescheduleFieldErrors({});
      setRescheduleError("");
      setSuccess(
        `Delivery rescheduled successfully${
          response.data?.assigned_driver?.name
            ? ` and assigned to ${response.data.assigned_driver.name}.`
            : "."
        }`,
      );

      await Promise.all([fetchDeliveries(), fetchEligibleOrders()]);
    } catch (err) {
      setRescheduleError(
        err.response?.data?.message || "Failed to reschedule delivery.",
      );
    } finally {
      setRescheduleLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", paddingBottom: 40 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 14,
              }}
            >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "#0a0a0a",
              letterSpacing: "-0.02em",
            }}
          >
            Delivery Scheduling
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "#52525b",
              lineHeight: 1.5,
            }}
          >
            Schedule deliveries, assign riders, and track delivery progress.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError("");
            setSuccess("");
            setShowForm(true);
          }}
          style={btnPrimary}
        >
          <Plus size={16} />
          Schedule delivery
        </button>
      </div>

      {success && (
        <div
          style={{
            background: "#fafafa",
            color: "#18181b",
            padding: "14px 16px",
            borderRadius: 2,
            border: "1px solid #e4e4e7",
            marginBottom: 20,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      )}

      {error && (
        <div
          style={{
            background: "#fef2f2",
            color: "#991b1b",
            padding: "14px 16px",
            borderRadius: 2,
            border: "1px solid #fecaca",
            marginBottom: 20,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {showForm && (
        <div
          style={deliveryModalBackdropStyle}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeScheduleModal();
            }
          }}
        >
          <div
            style={deliveryModalStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-schedule-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div style={deliveryModalHeaderStyle}>
              <div>
                <h2
                  id="delivery-schedule-modal-title"
                  style={deliveryModalTitleStyle}
                >
                  Schedule delivery
                </h2>
                <p style={deliveryModalSubtitleStyle}>
                  Select an order, assign a rider, and confirm the delivery date.
                </p>
              </div>

              <button
                type="button"
                style={deliveryModalCloseStyle}
                onClick={closeScheduleModal}
                disabled={loading}
                aria-label="Close schedule delivery"
              >
                ×
              </button>
            </div>

            {error ? (
              <div style={deliveryModalErrorStyle}>{error}</div>
            ) : null}

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                }}
              >
                <label style={labelStyle}>
                  Order <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <select
                  value={form.order_id}
                  title={
                    form.order_id
                      ? (() => {
                          const selectedOrder = eligibleOrders.find(
                            (order) =>
                              String(order.id) === String(form.order_id),
                          );
                          return selectedOrder
                            ? `${selectedOrder.order_number} - ${selectedOrder.customer_name || ""}`
                            : "";
                        })()
                      : ""
                  }
                  onChange={(e) => {
                    const nextOrderId = e.target.value;
                    const selectedOrder = eligibleOrders.find(
                      (order) => String(order.id) === String(nextOrderId),
                    );

                    const requestedDate = normalizeDateTimeInput(
                      getRequestedScheduleFromOrder(selectedOrder),
                    );
                    const requestedDateOnly = requestedDate
                      ? requestedDate.slice(0, 10)
                      : "";

                    setForm((prev) => ({
                      ...prev,
                      order_id: nextOrderId,
                      address: selectedOrder?.delivery_address || prev.address,
                      scheduled_date: requestedDateOnly || prev.scheduled_date,
                    }));

                    setFieldErrors((prev) => ({
                      ...prev,
                      order_id: "",
                      address: "",
                      scheduled_date: "",
                    }));
                  }}
                  required
                  style={{
                    ...inputStyle,
                    borderColor: fieldErrors.order_id ? "#dc2626" : "#e4e4e7",
                  }}
                >
                  <option value="">Select an order</option>
                  {eligibleOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.order_number} - {order.customer_name}
                    </option>
                  ))}
                </select>

                {fieldErrors.order_id && (
                  <p
                    style={{
                      color: "#dc2626",
                      fontSize: 12,
                      marginTop: 6,
                      fontWeight: 600,
                    }}
                  >
                    {fieldErrors.order_id}
                  </p>
                )}

                {eligibleOrders.length === 0 && (
                  <p
                    style={{
                      color: "#71717a",
                      fontSize: 12,
                      marginTop: 8,
                      fontWeight: 500,
                    }}
                  >
                    No eligible orders available for delivery scheduling.
                  </p>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                }}
              >
                <label style={labelStyle}>
                  Rider{" "}
                  <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <select
                  value={form.driver_id}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      driver_id: e.target.value,
                    }));
                    setFieldErrors((prev) => ({ ...prev, driver_id: "" }));
                  }}
                  required
                  style={{
                    ...inputStyle,
                    borderColor: fieldErrors.driver_id ? "#dc2626" : "#e4e4e7",
                  }}
                >
                  <option value="">Select a rider</option>
                  {riders.map((rider) => (
                    <option key={rider.id} value={rider.id}>
                      {rider.name}
                    </option>
                  ))}
                </select>

                {fieldErrors.driver_id && (
                  <p
                    style={{
                      color: "#dc2626",
                      fontSize: 12,
                      marginTop: 6,
                      fontWeight: 600,
                    }}
                  >
                    {fieldErrors.driver_id}
                  </p>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                }}
              >
                <label style={labelStyle}>
                  Delivery date{" "}
                  <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      scheduled_date: e.target.value,
                    }));
                    setFieldErrors((prev) => ({
                      ...prev,
                      scheduled_date: "",
                    }));
                  }}
                  required
                  min={todayLocal}
                  style={{
                    ...inputStyle,
                    borderColor: fieldErrors.scheduled_date
                      ? "#dc2626"
                      : "#e4e4e7",
                  }}
                />

                {fieldErrors.scheduled_date && (
                  <p
                    style={{
                      color: "#dc2626",
                      fontSize: 12,
                      marginTop: 6,
                      fontWeight: 600,
                    }}
                  >
                    {fieldErrors.scheduled_date}
                  </p>
                )}
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>
                  Delivery address <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }));
                    setFieldErrors((prev) => ({ ...prev, address: "" }));
                  }}
                  placeholder="Delivery address"
                  required
                  style={{
                    ...inputStyle,
                    borderColor: fieldErrors.address ? "#dc2626" : "#e4e4e7",
                  }}
                />
                {fieldErrors.address && (
                  <p
                    style={{
                      color: "#dc2626",
                      fontSize: 12,
                      marginTop: 6,
                      fontWeight: 600,
                    }}
                  >
                    {fieldErrors.address}
                  </p>
                )}
              </div>


              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  rows={2}
                  placeholder="Add delivery instructions (optional)"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 4,
                paddingTop: 16,
                borderTop: "1px solid #ececef",
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setForm({
                    order_id: "",
                    driver_id: "",
                    address: "",
                    scheduled_date: "",
                    notes: "",
                  });
                  setError("");
                  setSuccess("");
                  setShowForm(false);
                }}
                style={btnGhost}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  loading ||
                  !form.order_id ||
                  !form.driver_id ||
                  eligibleOrders.length === 0
                }
                style={
                  loading ||
                  !form.order_id ||
                  !form.driver_id ||
                  eligibleOrders.length === 0
                    ? { ...btnPrimary, opacity: 0.6, cursor: "not-allowed" }
                    : btnPrimary
                }
              >
                {loading ? "Scheduling..." : "Schedule delivery"}
              </button>
            </div>
          </form>
        </div>
        </div>
      )}

      {rescheduleTarget && (
        <div
          style={deliveryModalBackdropStyle}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeRescheduleModal();
            }
          }}
        >
          <div
            style={deliveryModalStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-reschedule-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div style={deliveryModalHeaderStyle}>
              <div>
                <h2
                  id="delivery-reschedule-modal-title"
                  style={deliveryModalTitleStyle}
                >
                  Reschedule delivery
                </h2>
                <p style={deliveryModalSubtitleStyle}>
                  Create a new delivery attempt after the latest failed delivery.
                </p>
              </div>

              <button
                type="button"
                style={deliveryModalCloseStyle}
                onClick={closeRescheduleModal}
                disabled={rescheduleLoading}
                aria-label="Close reschedule delivery"
              >
                &times;
              </button>
            </div>

            {rescheduleError ? (
              <div style={deliveryModalErrorStyle}>{rescheduleError}</div>
            ) : null}

            <form onSubmit={handleRescheduleSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 12,
                }}
              >
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Order</label>
                  <input
                    type="text"
                    readOnly
                    value={`${rescheduleTarget.order_number || "-"} - ${
                      rescheduleTarget.customer_name || "-"
                    }`}
                    style={{ ...inputStyle, background: "#f4f4f5" }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Previous delivery date</label>
                  <input
                    type="text"
                    readOnly
                    value={formatScheduleParts(rescheduleTarget.scheduled_date).date}
                    style={{ ...inputStyle, background: "#f4f4f5" }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>
                    New delivery date <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="date"
                    min={todayLocal}
                    value={rescheduleForm.scheduled_date}
                    onChange={(event) => {
                      setRescheduleForm((prev) => ({
                        ...prev,
                        scheduled_date: event.target.value,
                      }));
                      setRescheduleFieldErrors((prev) => ({
                        ...prev,
                        scheduled_date: "",
                      }));
                    }}
                    style={{
                      ...inputStyle,
                      borderColor: rescheduleFieldErrors.scheduled_date
                        ? "#dc2626"
                        : "#d9dce1",
                    }}
                  />
                  {rescheduleFieldErrors.scheduled_date ? (
                    <p style={{ color: "#dc2626", fontSize: 11, margin: "6px 0 0" }}>
                      {rescheduleFieldErrors.scheduled_date}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label style={labelStyle}>
                    Rider <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <select
                    value={rescheduleForm.driver_id}
                    onChange={(event) => {
                      setRescheduleForm((prev) => ({
                        ...prev,
                        driver_id: event.target.value,
                      }));
                      setRescheduleFieldErrors((prev) => ({
                        ...prev,
                        driver_id: "",
                      }));
                    }}
                    style={{
                      ...inputStyle,
                      borderColor: rescheduleFieldErrors.driver_id
                        ? "#dc2626"
                        : "#d9dce1",
                    }}
                  >
                    <option value="">Select a rider</option>
                    {riders.map((rider) => (
                      <option key={rider.id} value={rider.id}>
                        {rider.name}
                      </option>
                    ))}
                  </select>
                  {rescheduleFieldErrors.driver_id ? (
                    <p style={{ color: "#dc2626", fontSize: 11, margin: "6px 0 0" }}>
                      {rescheduleFieldErrors.driver_id}
                    </p>
                  ) : null}
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>
                    Reschedule reason <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="Briefly explain why another delivery attempt is needed"
                    value={rescheduleForm.reason}
                    onChange={(event) => {
                      setRescheduleForm((prev) => ({
                        ...prev,
                        reason: event.target.value,
                      }));
                      setRescheduleFieldErrors((prev) => ({
                        ...prev,
                        reason: "",
                      }));
                    }}
                    style={{
                      ...inputStyle,
                      resize: "vertical",
                      fontFamily: "inherit",
                      borderColor: rescheduleFieldErrors.reason
                        ? "#dc2626"
                        : "#d9dce1",
                    }}
                  />
                  {rescheduleFieldErrors.reason ? (
                    <p style={{ color: "#dc2626", fontSize: 11, margin: "6px 0 0" }}>
                      {rescheduleFieldErrors.reason}
                    </p>
                  ) : null}
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Add delivery instructions (optional)"
                    value={rescheduleForm.notes}
                    onChange={(event) =>
                      setRescheduleForm((prev) => ({
                        ...prev,
                        notes: event.target.value,
                      }))
                    }
                    style={{
                      ...inputStyle,
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: "1px solid #ececef",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={closeRescheduleModal}
                  disabled={rescheduleLoading}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduleLoading}
                  style={
                    rescheduleLoading
                      ? { ...btnPrimary, opacity: 0.6, cursor: "not-allowed" }
                      : btnPrimary
                  }
                >
                  {rescheduleLoading ? "Rescheduling..." : "Reschedule delivery"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={summaryGridStyle}>
        <SummaryCard
          label="Scheduled"
          value={statusCounts.scheduled}
          Icon={CalendarDays}
          iconColor="#2563eb"
        />
        <SummaryCard
          label="In transit"
          value={statusCounts.inTransit}
          Icon={Truck}
          iconColor="#c2410c"
        />
        <SummaryCard
          label="Delivered"
          value={statusCounts.delivered}
          Icon={CheckCircle2}
          iconColor="#15803d"
        />
        <SummaryCard
          label="Failed"
          value={statusCounts.failed}
          Icon={CircleX}
          iconColor="#b91c1c"
        />
      </div>

      <div style={toolbarStyle}>
        <div style={filterGridStyle}>
          <div style={{ ...filterFieldStyle, minWidth: 0 }}>
            <label style={filterLabelStyle}>Search</label>
            <div style={searchWrapStyle}>
              <Search
                size={14}
                strokeWidth={1.7}
                aria-hidden="true"
                style={{ color: "#71717a", flexShrink: 0 }}
              />
              <input
                type="search"
                value={deliverySearch}
                onChange={(e) => setDeliverySearch(e.target.value)}
                placeholder="Search order, customer, address, or rider"
                style={searchInputStyle}
              />
            </div>
          </div>

          <div style={filterFieldStyle}>
            <label style={filterLabelStyle}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={filterControlStyle}
            >
              <option value="all">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_transit">In transit</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div style={filterFieldStyle}>
            <label style={filterLabelStyle}>Rider</label>
            <select
              value={riderFilter}
              onChange={(e) => setRiderFilter(e.target.value)}
              style={filterControlStyle}
            >
              <option value="all">All riders</option>
              {riderFilterOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div style={filterFieldStyle}>
            <label style={filterLabelStyle}>Delivery date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={filterControlStyle}
            />
          </div>

          <div style={{ ...filterFieldStyle, justifyContent: "flex-end" }}>
            <span style={{ ...filterLabelStyle, visibility: "hidden" }}>
              Reset
            </span>
            <button
              type="button"
              onClick={() => {
                setDeliverySearch("");
                setStatusFilter("all");
                setRiderFilter("all");
                setDateFilter("");
              }}
              disabled={!hasDeliveryFilters}
              style={{
                ...resetFilterButtonStyle,
                opacity: hasDeliveryFilters ? 1 : 0.5,
                cursor: hasDeliveryFilters ? "pointer" : "default",
              }}
            >
              <RotateCcw size={14} strokeWidth={1.7} aria-hidden="true" />
              Reset filters
            </button>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        {listLoading ? (
          <p style={emptyStateStyle}>Loading deliveries...</p>
        ) : deliveries.length === 0 ? (
          <p style={emptyStateStyle}>No deliveries scheduled.</p>
        ) : filteredDeliveries.length === 0 ? (
          <p style={emptyStateStyle}>No deliveries match these filters.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={thStyle}>Order</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Delivery address</th>
                  <th style={thStyle}>Scheduled date</th>
                  <th style={thStyle}>Rider</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeliveries.map((delivery) => {
                  const schedule = formatScheduleParts(
                    delivery.scheduled_date,
                  );
                  const displayStatus = getDeliveryAttemptStatus(delivery);
                  const canReschedule =
                    normalizeStatus(delivery.status) === "failed" &&
                    Number(latestDeliveryIdByOrder.get(String(delivery.order_id))) ===
                      Number(delivery.id);

                  return (
                    <tr
                      key={delivery.id}
                      id={`delivery-row-${delivery.id}`}
                      style={{
                        borderBottom: "1px solid #eeeeef",
                        ...(focusedDeliveryId === delivery.id
                          ? { boxShadow: "inset 0 0 0 2px #18181b" }
                          : null),
                      }}
                    >
                      <td style={tdStyle}>
                        <span style={orderNumberStyle}>
                          {delivery.order_number || "—"}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <span style={customerStyle}>
                          {delivery.customer_name || "—"}
                        </span>
                      </td>

                      <td style={{ ...tdStyle, maxWidth: 280 }}>
                        <span
                          title={delivery.address || ""}
                          style={addressStyle}
                        >
                          {delivery.address || "—"}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={scheduleDateStyle}>{schedule.date}</div>
                        {schedule.time ? (
                          <div style={scheduleTimeStyle}>{schedule.time}</div>
                        ) : null}
                      </td>

                      <td style={tdStyle}>
                        <span style={riderStyle}>
                          {delivery.driver_name || "Unassigned"}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            ...getStatusStyle(displayStatus),
                            ...statusBadgeStyle,
                          }}
                        >
                          {formatStatusLabel(displayStatus)}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        {canReschedule ? (
                          <button
                            type="button"
                            onClick={() => openRescheduleModal(delivery)}
                            style={{
                              ...btnGhost,
                              minHeight: 30,
                              padding: "5px 9px",
                              fontSize: 11,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" />
                            Reschedule
                          </button>
                        ) : (
                          <span style={{ color: "#a1a1aa" }}>&mdash;</span>
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

function SummaryCard({ label, value, Icon, iconColor }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>
        {Number(value || 0).toLocaleString("en-PH")}
      </div>

      {Icon ? (
        <Icon
          size={19}
          strokeWidth={1.65}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 13,
            right: 14,
            color: iconColor || "#71717a",
          }}
        />
      ) : null}
    </div>
  );
}

// ── Reusable Styles ──────────────────────────────────────────

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #dedfe3",
  borderRadius: 2,
  boxShadow: "none",
  overflow: "hidden",
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "#27272a",
  letterSpacing: 0,
  textTransform: "none",
  whiteSpace: "nowrap",
};

const inputStyle = {
  width: "100%",
  minHeight: 36,
  padding: "7px 10px",
  borderRadius: 2,
  border: "1px solid #d9dce1",
  fontSize: 12,
  outline: "none",
  color: "#27272a",
  boxSizing: "border-box",
  background: "#fff",
};

const thStyle = {
  padding: "12px 16px",
  fontSize: 10,
  fontWeight: 600,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1.1px",
  borderBottom: "1px solid #dedfe3",
  whiteSpace: "nowrap",
};

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  minHeight: 36,
  padding: "8px 14px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 2,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  transition: "background 0.2s",
};

const btnGhost = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  minHeight: 36,
  padding: "8px 14px",
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d9dce1",
  borderRadius: 2,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  transition: "background 0.2s",
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const summaryCardStyle = {
  minHeight: 76,
  padding: "13px 14px",
  background: "#ffffff",
  border: "1px solid #dedfe3",
  borderRadius: 2,
  boxShadow: "none",
  boxSizing: "border-box",
  position: "relative",
};

const summaryLabelStyle = {
  fontSize: 10,
  fontWeight: 500,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1.2px",
  marginBottom: 7,
};

const summaryValueStyle = {
  fontSize: 21,
  lineHeight: 1,
  fontWeight: 600,
  color: "#18181b",
  fontVariantNumeric: "tabular-nums",
};

const toolbarStyle = {
  padding: "12px",
  marginBottom: 12,
  background: "#ffffff",
  border: "1px solid #dedfe3",
  borderRadius: 2,
};

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(300px, 1.8fr) minmax(135px, 0.7fr) minmax(155px, 0.8fr) minmax(150px, 0.75fr) auto",
  gap: 10,
  alignItems: "end",
};

const filterFieldStyle = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const filterLabelStyle = {
  marginBottom: 5,
  fontSize: 10,
  fontWeight: 600,
  color: "#52525b",
  letterSpacing: "0.7px",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const searchWrapStyle = {
  height: 36,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 11px",
  background: "#ffffff",
  border: "1px solid #d9dce1",
  borderRadius: 2,
  boxSizing: "border-box",
};

const searchInputStyle = {
  width: "100%",
  minWidth: 0,
  height: "100%",
  padding: 0,
  border: 0,
  outline: "none",
  background: "transparent",
  color: "#27272a",
  fontSize: 12,
  fontFamily: "inherit",
};

const filterControlStyle = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  border: "1px solid #d9dce1",
  borderRadius: 2,
  background: "#ffffff",
  color: "#27272a",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const resetFilterButtonStyle = {
  height: 36,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d9dce1",
  borderRadius: 2,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const emptyStateStyle = {
  margin: 0,
  padding: "42px 20px",
  textAlign: "center",
  color: "#71717a",
  fontSize: 13,
  fontWeight: 400,
};

const tableStyle = {
  width: "100%",
  minWidth: 1080,
  borderCollapse: "collapse",
  tableLayout: "fixed",
  fontSize: 12,
  textAlign: "left",
};

const tdStyle = {
  padding: "13px 16px",
  color: "#3f3f46",
  verticalAlign: "middle",
  lineHeight: 1.35,
};

const orderNumberStyle = {
  color: "#18181b",
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
};

const customerStyle = {
  color: "#27272a",
  fontWeight: 500,
};

const addressStyle = {
  color: "#52525b",
  fontWeight: 400,
  lineHeight: 1.35,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const scheduleDateStyle = {
  color: "#27272a",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const scheduleTimeStyle = {
  marginTop: 2,
  color: "#71717a",
  fontSize: 11,
  fontWeight: 400,
  whiteSpace: "nowrap",
};

const riderStyle = {
  color: "#27272a",
  fontWeight: 500,
};

const statusBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 23,
  padding: "2px 8px",
  borderRadius: 2,
  fontSize: 11,
  fontWeight: 500,
  whiteSpace: "nowrap",
};


// WISDOM DELIVERY SCHEDULING MODAL FORM UI FIX V1.0.1 STYLES

const deliveryModalBackdropStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1300,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "rgba(24, 24, 27, 0.48)",
};

const deliveryModalStyle = {
  width: "min(640px, calc(100vw - 32px))",
  maxHeight: "calc(100vh - 48px)",
  overflowY: "auto",
  padding: 22,
  background: "#ffffff",
  border: "1px solid #d7d9dd",
  borderRadius: 2,
  boxShadow: "none",
  boxSizing: "border-box",
};

const deliveryModalHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 18,
  marginBottom: 18,
};

const deliveryModalTitleStyle = {
  margin: 0,
  color: "#18181b",
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.25,
};

const deliveryModalSubtitleStyle = {
  margin: "6px 0 0",
  color: "#71717a",
  fontSize: 11.5,
  fontWeight: 400,
  lineHeight: 1.5,
};

const deliveryModalCloseStyle = {
  width: 28,
  height: 28,
  padding: 0,
  flex: "0 0 auto",
  color: "#71717a",
  background: "transparent",
  border: 0,
  borderRadius: 2,
  cursor: "pointer",
  fontSize: 20,
  fontWeight: 400,
  lineHeight: 1,
};

const deliveryModalErrorStyle = {
  marginBottom: 14,
  padding: "9px 11px",
  color: "#b91c1c",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 2,
  fontSize: 11.5,
  fontWeight: 500,
  lineHeight: 1.4,
};
