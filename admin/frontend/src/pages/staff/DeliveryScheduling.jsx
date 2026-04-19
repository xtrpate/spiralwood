import { useState, useEffect, useCallback } from "react";
import api from "../../services/api";
import { Truck, Plus } from "lucide-react";

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

// Replaced colored badges with monochrome inline styles
const getStatusStyle = (s) => {
  switch (String(s || "").toLowerCase()) {
    case "scheduled":
      return {
        background: "#ffffff",
        color: "#52525b",
        border: "1px solid #d4d4d8",
      };
    case "in_transit":
      return {
        background: "#f4f4f5",
        color: "#18181b",
        border: "1px solid #e4e4e7",
      };
    case "delivered":
      return {
        background: "#0a0a0a",
        color: "#ffffff",
        border: "1px solid #0a0a0a",
      };
    case "failed":
      return {
        background: "#fef2f2",
        color: "#991b1b",
        border: "1px solid #fecaca",
      };
    default:
      return {
        background: "#fafafa",
        color: "#71717a",
        border: "1px solid #e4e4e7",
      };
  }
};

export default function DeliveryScheduling() {
  const [deliveries, setDeliveries] = useState([]);
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    order_id: "",
    driver_id: "",
    address: "",
    requested_date: "",
    scheduled_date: "",
    notes: "",
    reschedule_reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

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
    } else {
      const parsed = new Date(form.scheduled_date);
      if (Number.isNaN(parsed.getTime())) {
        nextErrors.scheduled_date = "Confirmed delivery schedule is invalid.";
      } else if (parsed.getTime() < now.getTime() - 60000) {
        nextErrors.scheduled_date =
          "Confirmed delivery schedule cannot be in the past.";
      }
    }

    if (
      form.requested_date &&
      form.scheduled_date &&
      form.requested_date !== form.scheduled_date &&
      !String(form.reschedule_reason || "").trim()
    ) {
      nextErrors.reschedule_reason =
        "Please provide a reason if the confirmed schedule differs from the requested schedule.";
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
        reschedule_reason: String(form.reschedule_reason || "").trim(),
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
        requested_date: "",
        scheduled_date: "",
        notes: "",
        reschedule_reason: "",
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

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", paddingBottom: 40 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
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
            Review requested delivery schedules, confirm or adjust them, and
            assign riders.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError("");
            setSuccess("");
            setShowForm((prev) => !prev);
          }}
          style={showForm ? btnGhost : btnPrimary}
        >
          <Plus size={16} />
          {showForm ? "Hide Delivery Form" : "Create Delivery Schedule"}
        </button>
      </div>

      {success && (
        <div
          style={{
            background: "#fafafa",
            color: "#18181b",
            padding: "14px 16px",
            borderRadius: 12,
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
            borderRadius: 12,
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
        <div style={{ ...cardStyle, marginBottom: 24, padding: 24 }}>
          <h3
            style={{
              margin: "0 0 20px",
              fontWeight: 800,
              fontSize: 16,
              color: "#0a0a0a",
              letterSpacing: "-0.01em",
            }}
          >
            New Delivery Schedule
          </h3>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              <div>
                <label style={labelStyle}>Order *</label>
                <select
                  value={form.order_id}
                  onChange={(e) => {
                    const nextOrderId = e.target.value;
                    const selectedOrder = eligibleOrders.find(
                      (order) => String(order.id) === String(nextOrderId),
                    );

                    const requestedDate = normalizeDateTimeInput(
                      getRequestedScheduleFromOrder(selectedOrder),
                    );

                    setForm((prev) => ({
                      ...prev,
                      order_id: nextOrderId,
                      address: selectedOrder?.delivery_address || prev.address,
                      requested_date: requestedDate,
                      scheduled_date: requestedDate || prev.scheduled_date,
                      reschedule_reason: "",
                    }));

                    setFieldErrors((prev) => ({
                      ...prev,
                      order_id: "",
                      address: "",
                      scheduled_date: "",
                      reschedule_reason: "",
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

              <div>
                <label style={labelStyle}>Assigned Delivery Rider *</label>
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

              <div>
                <label style={labelStyle}>Requested Delivery Date & Time</label>
                <input
                  type="datetime-local"
                  value={form.requested_date}
                  readOnly
                  placeholder="Cashier / customer requested schedule"
                  style={{
                    ...inputStyle,
                    background: "#fafafa",
                    color: "#71717a",
                  }}
                />
                <p
                  style={{
                    color: "#71717a",
                    fontSize: 12,
                    marginTop: 6,
                    fontWeight: 500,
                  }}
                >
                  This is the customer / cashier preferred schedule.
                </p>
              </div>

              <div>
                <label style={labelStyle}>Confirmed Delivery Schedule *</label>
                <input
                  type="datetime-local"
                  value={form.scheduled_date}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      scheduled_date: e.target.value,
                    }));
                    setFieldErrors((prev) => ({
                      ...prev,
                      scheduled_date: "",
                      reschedule_reason: "",
                    }));
                  }}
                  required
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
                <label style={labelStyle}>Delivery Address *</label>
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
                <label style={labelStyle}>Reason for Reschedule</label>
                <textarea
                  rows={2}
                  placeholder="Required only if the final schedule differs from the requested schedule."
                  value={form.reschedule_reason}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      reschedule_reason: e.target.value,
                    }));
                    setFieldErrors((prev) => ({
                      ...prev,
                      reschedule_reason: "",
                    }));
                  }}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    fontFamily: "inherit",
                    borderColor: fieldErrors.reschedule_reason
                      ? "#dc2626"
                      : "#e4e4e7",
                  }}
                />
                {fieldErrors.reschedule_reason && (
                  <p
                    style={{
                      color: "#dc2626",
                      fontSize: 12,
                      marginTop: 6,
                      fontWeight: 600,
                    }}
                  >
                    {fieldErrors.reschedule_reason}
                  </p>
                )}
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  rows={2}
                  placeholder="Any delivery instructions..."
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
                gap: 12,
                marginTop: 24,
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
                    requested_date: "",
                    scheduled_date: "",
                    notes: "",
                    reschedule_reason: "",
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
                {loading ? "Scheduling..." : "Schedule Delivery"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={cardStyle}>
        <div
          style={{ padding: "20px 24px", borderBottom: "1px solid #f4f4f5" }}
        >
          <h3
            style={{
              margin: 0,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 16,
              color: "#0a0a0a",
            }}
          >
            <Truck size={20} /> All Deliveries
          </h3>
        </div>

        {listLoading ? (
          <p
            style={{
              color: "#71717a",
              fontSize: 13,
              textAlign: "center",
              padding: 40,
              fontWeight: 600,
            }}
          >
            Loading deliveries...
          </p>
        ) : deliveries.length === 0 ? (
          <p
            style={{
              color: "#71717a",
              fontSize: 13,
              textAlign: "center",
              padding: 40,
              fontWeight: 600,
            }}
          >
            No deliveries scheduled.
          </p>
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
                  <th style={thStyle}>Order #</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Address</th>
                  <th style={thStyle}>Scheduled</th>
                  <th style={thStyle}>Driver</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                    <td style={{ padding: "16px 20px", color: "#18181b" }}>
                      <strong style={{ fontWeight: 800 }}>
                        {d.order_number}
                      </strong>
                    </td>
                    <td
                      style={{
                        padding: "16px 20px",
                        color: "#52525b",
                        fontWeight: 600,
                      }}
                    >
                      {d.customer_name || "—"}
                    </td>
                    <td
                      style={{
                        padding: "16px 20px",
                        color: "#18181b",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={d.address || ""}
                    >
                      {d.address}
                    </td>
                    <td
                      style={{
                        padding: "16px 20px",
                        fontSize: 12,
                        color: "#52525b",
                        fontWeight: 500,
                      }}
                    >
                      {formatDateTime(d.scheduled_date)}
                    </td>
                    <td
                      style={{
                        padding: "16px 20px",
                        color: "#18181b",
                        fontWeight: 600,
                      }}
                    >
                      {d.driver_name || (
                        <span style={{ color: "#a1a1aa" }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <span
                        style={{
                          ...getStatusStyle(d.status),
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        {String(d.status || "").replace("_", " ")}
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

// ── Reusable Styles ──────────────────────────────────────────

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  overflow: "hidden",
};

const labelStyle = {
  display: "block",
  marginBottom: 8,
  fontSize: 12,
  fontWeight: 800,
  color: "#18181b",
  letterSpacing: "1px",
  textTransform: "uppercase",
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  outline: "none",
  color: "#18181b",
  boxSizing: "border-box",
  background: "#fff",
};

const thStyle = {
  padding: "14px 20px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  borderBottom: "1px solid #e4e4e7",
};

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 20px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnGhost = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};
