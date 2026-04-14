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
    if (!form.driver_id) nextErrors.driver_id = "Please select a delivery rider.";

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
          (u) => u.role === "staff" && u.staff_type === "delivery_rider" && u.is_active,
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
        }`
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

  const statusColor = (s) =>
    (
      {
        scheduled: "badge-blue",
        in_transit: "badge-yellow",
        delivered: "badge-green",
        failed: "badge-red",
      }[s] || "badge-gray"
    );

  return (
    <div>
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1>Delivery Scheduling</h1>
          <p>Review requested delivery schedules, confirm or adjust them, and assign riders.</p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setError("");
            setSuccess("");
            setShowForm((prev) => !prev);
          }}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <Plus size={16} />
          {showForm ? "Hide Delivery Form" : "Create Delivery Schedule"}
        </button>
      </div>

      {success && (
        <div
          style={{
            background: "#e8f5e9",
            color: "#2e7d32",
            padding: "12px 16px",
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {success}
        </div>
      )}

      {error && (
        <div
          style={{
            background: "#fce4ec",
            color: "#c62828",
            padding: "12px 16px",
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16, fontWeight: 700 }}>
            New Delivery Schedule
          </h3>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Order *</label>
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
                >
                  <option value="">Select an order</option>
                  {eligibleOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.order_number} - {order.customer_name}
                    </option>
                  ))}
                </select>

                {fieldErrors.order_id && (
                  <p style={{ color: "#c62828", fontSize: 12, marginTop: 6 }}>
                    {fieldErrors.order_id}
                  </p>
                )}

                {eligibleOrders.length === 0 && (
                  <p style={{ color: "#888", fontSize: 13, marginTop: 8 }}>
                    No eligible orders available for delivery scheduling.
                  </p>
                )}
              </div>

              <div className="form-field">
                <label>Assigned Delivery Rider *</label>
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
                >
                  <option value="">Select a rider</option>
                  {riders.map((rider) => (
                    <option key={rider.id} value={rider.id}>
                      {rider.name}
                    </option>
                  ))}
                </select>

                {fieldErrors.driver_id && (
                  <p style={{ color: "#c62828", fontSize: 12, marginTop: 6 }}>
                    {fieldErrors.driver_id}
                  </p>
                )}
              </div>

              <div className="form-field">
                <label>Requested Delivery Date & Time</label>
                <input
                  type="datetime-local"
                  value={form.requested_date}
                  readOnly
                  placeholder="Cashier / customer requested schedule"
                  style={{
                    background: "#f8fafc",
                    color: "#475569",
                  }}
                />
                <p style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
                  This is the customer / cashier preferred schedule.
                </p>
              </div>

              <div className="form-field">
                <label>Confirmed Delivery Schedule *</label>
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
                />
                {fieldErrors.scheduled_date && (
                  <p style={{ color: "#c62828", fontSize: 12, marginTop: 6 }}>
                    {fieldErrors.scheduled_date}
                  </p>
                )}
              </div>

              <div className="form-field full">
                <label>Delivery Address *</label>
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
                />
                {fieldErrors.address && (
                  <p style={{ color: "#c62828", fontSize: 12, marginTop: 6 }}>
                    {fieldErrors.address}
                  </p>
                )}
              </div>

              <div className="form-field full">
                <label>Reason for Reschedule</label>
                <textarea
                  rows={2}
                  placeholder="Required only if the final schedule differs from the requested schedule."
                  value={form.reschedule_reason}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      reschedule_reason: e.target.value,
                    }));
                    setFieldErrors((prev) => ({ ...prev, reschedule_reason: "" }));
                  }}
                />
                {fieldErrors.reschedule_reason && (
                  <p style={{ color: "#c62828", fontSize: 12, marginTop: 6 }}>
                    {fieldErrors.reschedule_reason}
                  </p>
                )}
              </div>

              <div className="form-field full">
                <label>Notes</label>
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
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  loading ||
                  !form.order_id ||
                  !form.driver_id ||
                  eligibleOrders.length === 0
                }
              >
                {loading ? "Scheduling..." : "✓ Schedule Delivery"}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
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
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3
          style={{
            marginBottom: 16,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Truck size={18} /> All Deliveries
        </h3>

        {listLoading ? (
          <p style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 20 }}>
            Loading deliveries...
          </p>
        ) : deliveries.length === 0 ? (
          <p style={{ color: "#aaa", fontSize: 13, textAlign: "center", padding: 20 }}>
            No deliveries scheduled.
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Address</th>
                <th>Scheduled</th>
                <th>Driver</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.order_number}</strong>
                  </td>
                  <td>{d.customer_name || "—"}</td>
                  <td
                    style={{
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={d.address || ""}
                  >
                    {d.address}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {formatDateTime(d.scheduled_date)}
                  </td>
                  <td>
                    {d.driver_name || <span style={{ color: "#aaa" }}>Unassigned</span>}
                  </td>
                  <td>
                    <span className={`badge ${statusColor(d.status)}`}>
                      {String(d.status || "").replace("_", " ")}
                    </span>
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