import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";
import {
  CalendarClock,
  Plus,
  UserCheck,
  CheckCircle2,
  Ban,
  Check,
} from "lucide-react";

const PURPOSE_LABELS = {
  consultation: "Consultation",
  site_measurement: "Site Measurement",
  installation: "Installation",
};

const STATUS_LABELS = {
  pending: "Pending Review",
  assigned: "Awaiting Staff Acceptance",
  confirmed: "Confirmed",
  done: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const statusColor = (status) =>
  (
    {
      pending: "badge-yellow",
      assigned: "badge-yellow",
      confirmed: "badge-blue",
      done: "badge-green",
      rejected: "badge-red",
      cancelled: "badge-red",
    }[String(status || "").toLowerCase()] || "badge-gray"
  );

const formatDateTime = (value) => {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const humanizePurpose = (value) => {
  if (!value) return "—";

  return (
    PURPOSE_LABELS[value] ||
    String(value)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
};

const parseNotes = (notes) => {
  const details = {
    projectDescription: "",
    contact: "",
    address: "",
    customerNotes: "",
    raw: "",
  };

  const lines = String(notes || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  details.raw = lines.join(" | ");

  lines.forEach((line) => {
    if (line.startsWith("Project Description:")) {
      details.projectDescription = line
        .replace("Project Description:", "")
        .trim();
    } else if (line.startsWith("Contact:")) {
      details.contact = line.replace("Contact:", "").trim();
    } else if (line.startsWith("Address:")) {
      details.address = line.replace("Address:", "").trim();
    } else if (line.startsWith("Customer Notes:")) {
      details.customerNotes = line.replace("Customer Notes:", "").trim();
    }
  });

  return details;
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d9d9d9",
  fontSize: 14,
  outline: "none",
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "#444",
};

const summaryCardStyle = {
  border: "1px solid #ececec",
  borderRadius: 16,
  background: "#fff",
  padding: "16px 18px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
};

const subTextStyle = {
  fontSize: 12,
  color: "#8a8f98",
  marginTop: 4,
  lineHeight: 1.45,
};

const sectionTitleStyle = {
  marginBottom: 4,
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const sectionHintStyle = {
  margin: "0 0 16px",
  color: "#667085",
  fontSize: 13,
  lineHeight: 1.5,
};

const emptyStateStyle = {
  color: "#98a2b3",
  fontSize: 13,
  textAlign: "center",
  padding: 22,
};

const formatRequestNumber = (id) =>
  id ? `APT-${String(id).padStart(4, "0")}` : "—";

const getStatusLabel = (status) =>
  STATUS_LABELS[String(status || "").toLowerCase()] || String(status || "—");

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={sectionTitleStyle}>
        <CalendarClock size={18} /> {title}
      </h3>
      {subtitle ? <p style={sectionHintStyle}>{subtitle}</p> : null}
      {children}
    </div>
  );
}

function SummaryCard({ label, count, hint }) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 28,
          fontWeight: 800,
          color: "#101828",
          lineHeight: 1,
        }}
      >
        {count}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#98a2b3" }}>{hint}</div>
    </div>
  );
}

export default function AppointmentScheduling() {
  const { user } = useAuthStore();

  const isAdmin = user?.role === "admin";
  const isIndoorStaff =
    user?.role === "staff" && user?.staff_type === "indoor";

  const [appointments, setAppointments] = useState([]);
  const [providers, setProviders] = useState([]);
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    order_id: "",
    customer_id: "",
    provider_id: "",
    purpose: "installation",
    scheduled_date: "",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getProviderId = useCallback((appointment) => {
    return Number(
      appointment?.provider_id ??
        appointment?.assigned_to ??
        appointment?.assigned_provider_id ??
        0,
    );
  }, []);

  const isAssignedToCurrentIndoorStaff = useCallback(
    (appointment) => getProviderId(appointment) === Number(user?.id || 0),
    [getProviderId, user?.id],
  );

  const fetchAppointments = useCallback(async () => {
    try {
      const res = await api.get("/pos/appointments");
      const list = Array.isArray(res.data) ? res.data : [];

      setAppointments(list);
      setAssignmentDrafts((prev) => {
        const next = { ...prev };

        list.forEach((item) => {
          if (next[item.id] === undefined) {
            next[item.id] = String(
              item.provider_id ?? item.assigned_to ?? "",
            );
          }
        });

        return next;
      });
    } catch (err) {
      console.error("Failed to fetch appointments:", err);
      setAppointments([]);
    }
  }, []);

  const fetchProviders = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const res = await api.get("/users");
      const list = Array.isArray(res.data) ? res.data : [];
      setProviders(
        list.filter(
          (p) =>
            p.role === "staff" &&
            p.staff_type === "indoor" &&
            (p.is_active === undefined || p.is_active),
        ),
      );
    } catch (err) {
      console.error("Failed to fetch providers:", err);
      setProviders([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchAppointments();
    fetchProviders();
  }, [fetchAppointments, fetchProviders]);

  const adminNewRequests = useMemo(
    () =>
      appointments.filter(
        (a) => String(a.status || "").toLowerCase() === "pending",
      ),
    [appointments],
  );

  const adminAwaitingAcceptance = useMemo(
    () =>
      appointments.filter(
        (a) => String(a.status || "").toLowerCase() === "assigned",
      ),
    [appointments],
  );

  const adminConfirmedAppointments = useMemo(
    () =>
      appointments.filter(
        (a) => String(a.status || "").toLowerCase() === "confirmed",
      ),
    [appointments],
  );

  const adminClosedAppointments = useMemo(
    () =>
      appointments.filter((a) =>
        ["done", "rejected", "cancelled"].includes(
          String(a.status || "").toLowerCase(),
        ),
      ),
    [appointments],
  );

  const staffNewAssignments = useMemo(() => {
    if (!isIndoorStaff) return [];

    return appointments.filter(
      (a) =>
        String(a.status || "").toLowerCase() === "assigned" &&
        isAssignedToCurrentIndoorStaff(a),
    );
  }, [appointments, isIndoorStaff, isAssignedToCurrentIndoorStaff]);

  const staffConfirmedAppointments = useMemo(() => {
    if (!isIndoorStaff) return [];

    return appointments.filter(
      (a) =>
        String(a.status || "").toLowerCase() === "confirmed" &&
        isAssignedToCurrentIndoorStaff(a),
    );
  }, [appointments, isIndoorStaff, isAssignedToCurrentIndoorStaff]);

  const staffClosedAppointments = useMemo(() => {
    if (!isIndoorStaff) return [];

    return appointments.filter(
      (a) =>
        ["done", "cancelled", "rejected"].includes(
          String(a.status || "").toLowerCase(),
        ) && isAssignedToCurrentIndoorStaff(a),
    );
  }, [appointments, isIndoorStaff, isAssignedToCurrentIndoorStaff]);

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        order_id: form.order_id || undefined,
        customer_id: form.customer_id || undefined,
        provider_id: form.provider_id || undefined,
        purpose: form.purpose,
        scheduled_date: form.scheduled_date,
        preferred_date: form.scheduled_date,
        notes: form.notes.trim() || undefined,
      };

      await api.post("/pos/appointments", payload);

      setSuccess(
        form.provider_id
          ? "Manual appointment request saved and assigned. Waiting for indoor staff acceptance."
          : "Manual appointment request created successfully.",
      );

      setForm({
        order_id: "",
        customer_id: "",
        provider_id: "",
        purpose: "installation",
        scheduled_date: "",
        notes: "",
      });

      setShowForm(false);
      fetchAppointments();
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to create appointment request.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (appointmentId, payload, okMessage) => {
    setActionLoadingId(appointmentId);
    setError("");
    setSuccess("");

    try {
      const res = await api.patch(`/pos/appointments/${appointmentId}`, payload);
      setSuccess(okMessage || res.data?.message || "Appointment updated.");
      fetchAppointments();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update appointment.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAssignProvider = async (appointment) => {
    const selectedProviderId =
      assignmentDrafts[appointment.id] ||
      String(appointment.provider_id || appointment.assigned_to || "");

    if (!selectedProviderId) {
      setError("Select an indoor staff member first before assigning.");
      return;
    }

    await handleAction(
      appointment.id,
      { provider_id: Number(selectedProviderId) },
      "Appointment assigned to indoor staff. Waiting for staff acceptance.",
    );
  };

  const getDetails = (appointment) => parseNotes(appointment.notes);

  const getContact = (appointment) => {
    const details = getDetails(appointment);
    return details.contact || appointment.customer_phone || "No contact";
  };

  const getAddress = (appointment) => {
    const details = getDetails(appointment);

    const noteAddress = String(details.address || "").trim();
    const orderAddress = String(appointment.order_delivery_address || "").trim();
    const customerAddress = String(appointment.customer_address || "").trim();

    return noteAddress || orderAddress || customerAddress || "No address provided";
  };

  const getScope = (appointment) => {
    const details = getDetails(appointment);

    if (details.projectDescription) return details.projectDescription;
    if (details.customerNotes) return details.customerNotes;
    if (details.raw) return details.raw;

    return "No additional scope details";
  };

  const getRequestedBy = (appointment) => {
    if (appointment.request_owner_name) return appointment.request_owner_name;
    if (appointment.handled_by_name) return appointment.handled_by_name;

    if (Number(appointment.customer_id || 0) > 0) {
      return "Customer Portal";
    }

    if (Number(appointment.order_id || 0) > 0) {
      return "POS / Walk-in";
    }

    return "Manual Request";
  };

  const getAssignedStaff = (appointment) =>
    appointment.provider_name || "Not assigned";

  const renderRequestRefCell = (appointment) => (
    <td>
      <div style={{ fontWeight: 700 }}>{formatRequestNumber(appointment.id)}</div>
      <div style={subTextStyle}>
        Order: {appointment.order_number || "—"}
      </div>
    </td>
  );

  const renderCustomerCell = (appointment) => (
    <td>
      <div style={{ fontWeight: 700 }}>
        {appointment.customer_name || "Unlinked Customer"}
      </div>
      <div style={subTextStyle}>{getContact(appointment)}</div>
    </td>
  );

  const renderServiceCell = (appointment) => (
    <td style={{ minWidth: 190 }}>
      <div style={{ fontWeight: 700 }}>{humanizePurpose(appointment.purpose)}</div>
      <div style={subTextStyle}>{getScope(appointment)}</div>
    </td>
  );

  const renderPreferredScheduleCell = (appointment) => (
    <td>
      <div style={{ fontWeight: 600 }}>
        {formatDateTime(appointment.preferred_date || appointment.scheduled_date)}
      </div>
      <div style={subTextStyle}>Preferred schedule</div>
    </td>
  );

  const renderConfirmedScheduleCell = (appointment) => (
    <td>
      <div style={{ fontWeight: 600 }}>
        {formatDateTime(appointment.scheduled_date || appointment.preferred_date)}
      </div>
      <div style={subTextStyle}>Confirmed / working schedule</div>
    </td>
  );

  const renderAddressCell = (appointment) => (
    <td style={{ minWidth: 220 }}>
      <div style={{ fontWeight: 600 }}>{getAddress(appointment)}</div>
      <div style={subTextStyle}>Service location</div>
    </td>
  );

  const renderRequestedByCell = (appointment) => (
    <td>
      <div style={{ fontWeight: 600 }}>{getRequestedBy(appointment)}</div>
      <div style={subTextStyle}>Request source / dispatcher</div>
    </td>
  );

  const renderAssignedStaffCell = (appointment) => (
    <td>
      <div style={{ fontWeight: 600 }}>{getAssignedStaff(appointment)}</div>
      <div style={subTextStyle}>Assigned indoor staff</div>
    </td>
  );

  const renderStatusCell = (appointment) => (
    <td>
      <span
        className={`badge ${statusColor(appointment.status)}`}
        style={{ whiteSpace: "nowrap" }}
      >
        {getStatusLabel(appointment.status)}
      </span>
    </td>
  );

  const adminSummary = [
    {
      label: "New Requests",
      count: adminNewRequests.length,
      hint: "Waiting for admin review",
    },
    {
      label: "Awaiting Acceptance",
      count: adminAwaitingAcceptance.length,
      hint: "Assigned to staff but not yet accepted",
    },
    {
      label: "Confirmed",
      count: adminConfirmedAppointments.length,
      hint: "Operational appointments in progress",
    },
    {
      label: "Closed",
      count: adminClosedAppointments.length,
      hint: "Completed, rejected, or cancelled",
    },
  ];

  const staffSummary = [
    {
      label: "New Assignments",
      count: staffNewAssignments.length,
      hint: "Waiting for your acceptance",
    },
    {
      label: "Confirmed Schedule",
      count: staffConfirmedAppointments.length,
      hint: "Appointments you are actively handling",
    },
    {
      label: "Closed History",
      count: staffClosedAppointments.length,
      hint: "Completed or cancelled records",
    },
  ];

  return (
    <div className="page-content">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontWeight: 900 }}>
            {isAdmin ? "Appointment Dispatch & Triage" : "My Field Appointments"}
          </h2>
          <p style={{ margin: "6px 0 0", color: "#667085", fontSize: 14 }}>
            {isAdmin
              ? "Review incoming appointment requests, assign indoor staff, track staff acceptance, and monitor confirmed or closed appointments."
              : "Review your assigned appointments, accept new work, and update completion status for confirmed field schedules."}
          </p>
        </div>

        {isAdmin && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowForm((prev) => !prev);
              setError("");
              setSuccess("");
            }}
          >
            <Plus size={16} />
            {showForm ? "Close Manual Form" : "Create Manual Appointment"}
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isAdmin
            ? "repeat(auto-fit, minmax(220px, 1fr))"
            : "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        {(isAdmin ? adminSummary : staffSummary).map((item) => (
          <SummaryCard
            key={item.label}
            label={item.label}
            count={item.count}
            hint={item.hint}
          />
        ))}
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 12,
            background: "#fff1f0",
            color: "#b42318",
            border: "1px solid #fecdca",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 12,
            background: "#ecfdf3",
            color: "#027a48",
            border: "1px solid #abefc6",
            fontSize: 14,
          }}
        >
          {success}
        </div>
      ) : null}

      {isAdmin && showForm && (
        <SectionCard
          title="Create Manual Appointment Request"
          subtitle="Use this form only for walk-in, phone, or manually encoded requests that still need dispatch handling."
        >
          <form onSubmit={handleManualSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              <div>
                <label style={labelStyle}>Linked Order ID (optional)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  value={form.order_id}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, order_id: e.target.value }))
                  }
                />
              </div>

              <div>
                <label style={labelStyle}>Linked Customer ID (optional)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  value={form.customer_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      customer_id: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label style={labelStyle}>Assign Indoor Staff (optional)</label>
                <select
                  style={inputStyle}
                  value={form.provider_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      provider_id: e.target.value,
                    }))
                  }
                >
                  <option value="">Not assigned yet</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Service Type</label>
                <select
                  style={inputStyle}
                  value={form.purpose}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, purpose: e.target.value }))
                  }
                >
                  <option value="installation">Installation</option>
                  <option value="consultation">Consultation</option>
                  <option value="site_measurement">Site Measurement</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Preferred / Planned Schedule</label>
                <input
                  style={inputStyle}
                  type="datetime-local"
                  value={form.scheduled_date}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      scheduled_date: e.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={labelStyle}>Scope / Notes</label>
              <textarea
                style={{
                  ...inputStyle,
                  minHeight: 110,
                  resize: "vertical",
                }}
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Project description, address, contact number, customer notes, or dispatch remarks"
              />
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #eaecf0",
                fontSize: 13,
                color: "#667085",
                lineHeight: 1.55,
              }}
            >
              <strong>Workflow note:</strong> assigning an indoor staff here only
              creates an <strong>Awaiting Staff Acceptance</strong> record. The
              assigned indoor staff must still accept the appointment before it
              becomes <strong>Confirmed</strong>.
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn btn-primary"
                type="submit"
                disabled={loading}
              >
                <Plus size={16} />
                {loading ? "Saving..." : "Save Manual Request"}
              </button>

              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowForm(false)}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {isAdmin && (
        <>
          <SectionCard
            title="New Appointment Requests"
            subtitle="Fresh requests waiting for admin review and staff assignment."
          >
            {adminNewRequests.length === 0 ? (
              <p style={emptyStateStyle}>No new appointment requests.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Customer</th>
                    <th>Service Type</th>
                    <th>Preferred Schedule</th>
                    <th>Location / Address</th>
                    <th>Requested By</th>
                    <th>Assign Indoor Staff</th>
                    <th>Dispatch Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminNewRequests.map((a) => (
                    <tr key={a.id}>
                      {renderRequestRefCell(a)}
                      {renderCustomerCell(a)}
                      {renderServiceCell(a)}
                      {renderPreferredScheduleCell(a)}
                      {renderAddressCell(a)}
                      {renderRequestedByCell(a)}

                      <td style={{ minWidth: 210 }}>
                        <select
                          style={inputStyle}
                          value={assignmentDrafts[a.id] ?? ""}
                          onChange={(e) =>
                            setAssignmentDrafts((prev) => ({
                              ...prev,
                              [a.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select indoor staff</option>
                          {providers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button
                            className="btn btn-secondary"
                            disabled={actionLoadingId === a.id}
                            onClick={() => handleAssignProvider(a)}
                          >
                            <UserCheck size={14} /> Assign
                          </button>

                          <button
                            className="btn btn-danger"
                            disabled={actionLoadingId === a.id}
                            onClick={() =>
                              handleAction(
                                a.id,
                                { status: "rejected" },
                                "Appointment request rejected.",
                              )
                            }
                          >
                            <Ban size={14} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard
            title="Awaiting Staff Acceptance"
            subtitle="Requests already assigned to indoor staff but not yet accepted."
          >
            {adminAwaitingAcceptance.length === 0 ? (
              <p style={emptyStateStyle}>
                No appointments are waiting for staff acceptance.
              </p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Customer</th>
                    <th>Service Type</th>
                    <th>Proposed Schedule</th>
                    <th>Assigned Indoor Staff</th>
                    <th>Status</th>
                    <th>Dispatch Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminAwaitingAcceptance.map((a) => (
                    <tr key={a.id}>
                      {renderRequestRefCell(a)}
                      {renderCustomerCell(a)}
                      {renderServiceCell(a)}
                      {renderConfirmedScheduleCell(a)}
                      {renderAssignedStaffCell(a)}
                      {renderStatusCell(a)}

                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button
                            className="btn btn-secondary"
                            disabled={actionLoadingId === a.id}
                            onClick={() => handleAssignProvider(a)}
                          >
                            <UserCheck size={14} /> Reassign
                          </button>

                          <button
                            className="btn btn-danger"
                            disabled={actionLoadingId === a.id}
                            onClick={() =>
                              handleAction(
                                a.id,
                                { status: "rejected" },
                                "Appointment request rejected.",
                              )
                            }
                          >
                            <Ban size={14} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard
            title="Confirmed Appointments"
            subtitle="Appointments already accepted by indoor staff and currently active in operations."
          >
            {adminConfirmedAppointments.length === 0 ? (
              <p style={emptyStateStyle}>No confirmed appointments yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Customer</th>
                    <th>Service Type</th>
                    <th>Confirmed Schedule</th>
                    <th>Location / Address</th>
                    <th>Assigned Indoor Staff</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminConfirmedAppointments.map((a) => (
                    <tr key={a.id}>
                      {renderRequestRefCell(a)}
                      {renderCustomerCell(a)}
                      {renderServiceCell(a)}
                      {renderConfirmedScheduleCell(a)}
                      {renderAddressCell(a)}
                      {renderAssignedStaffCell(a)}
                      {renderStatusCell(a)}

                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button
                            className="btn btn-danger"
                            disabled={actionLoadingId === a.id}
                            onClick={() =>
                              handleAction(
                                a.id,
                                { status: "cancelled" },
                                "Confirmed appointment cancelled.",
                              )
                            }
                          >
                            <Ban size={14} /> Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard
            title="Closed Appointment History"
            subtitle="Completed, rejected, and cancelled appointment records for audit and review."
          >
            {adminClosedAppointments.length === 0 ? (
              <p style={emptyStateStyle}>No closed appointment history yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Customer</th>
                    <th>Service Type</th>
                    <th>Final Schedule</th>
                    <th>Assigned Indoor Staff</th>
                    <th>Status</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {adminClosedAppointments.map((a) => (
                    <tr key={a.id}>
                      {renderRequestRefCell(a)}
                      {renderCustomerCell(a)}
                      {renderServiceCell(a)}
                      {renderConfirmedScheduleCell(a)}
                      {renderAssignedStaffCell(a)}
                      {renderStatusCell(a)}
                      <td>{formatDateTime(a.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </>
      )}

      {isIndoorStaff && (
        <>
          <SectionCard
            title="New Assignments"
            subtitle="Appointments assigned to you and waiting for your acceptance."
          >
            {staffNewAssignments.length === 0 ? (
              <p style={emptyStateStyle}>No new assigned appointments.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Customer</th>
                    <th>Service Type</th>
                    <th>Proposed Schedule</th>
                    <th>Location / Address</th>
                    <th>Assigned By</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffNewAssignments.map((a) => (
                    <tr key={a.id}>
                      {renderRequestRefCell(a)}
                      {renderCustomerCell(a)}
                      {renderServiceCell(a)}
                      {renderConfirmedScheduleCell(a)}
                      {renderAddressCell(a)}
                      {renderRequestedByCell(a)}
                      {renderStatusCell(a)}

                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button
                            className="btn btn-primary"
                            disabled={actionLoadingId === a.id}
                            onClick={() =>
                              handleAction(
                                a.id,
                                { status: "confirmed" },
                                "Appointment accepted and confirmed.",
                              )
                            }
                          >
                            <CheckCircle2 size={14} /> Accept
                          </button>

                          <button
                            className="btn btn-danger"
                            disabled={actionLoadingId === a.id}
                            onClick={() =>
                              handleAction(
                                a.id,
                                { status: "pending", provider_id: null },
                                "Appointment returned to admin for reassignment.",
                              )
                            }
                          >
                            <Ban size={14} /> Return to Admin
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard
            title="Confirmed Schedule"
            subtitle="Appointments you already accepted and are currently responsible for handling."
          >
            {staffConfirmedAppointments.length === 0 ? (
              <p style={emptyStateStyle}>No confirmed appointments yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Customer</th>
                    <th>Service Type</th>
                    <th>Confirmed Schedule</th>
                    <th>Location / Address</th>
                    <th>Customer Contact</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffConfirmedAppointments.map((a) => (
                    <tr key={a.id}>
                      {renderRequestRefCell(a)}
                      {renderCustomerCell(a)}
                      {renderServiceCell(a)}
                      {renderConfirmedScheduleCell(a)}
                      {renderAddressCell(a)}

                      <td>
                        <div style={{ fontWeight: 600 }}>{getContact(a)}</div>
                        <div style={subTextStyle}>{a.customer_name || "Customer"}</div>
                      </td>

                      {renderStatusCell(a)}

                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button
                            className="btn btn-secondary"
                            disabled={actionLoadingId === a.id}
                            onClick={() =>
                              handleAction(
                                a.id,
                                { status: "done" },
                                "Appointment marked as completed.",
                              )
                            }
                          >
                            <Check size={14} /> Mark Done
                          </button>

                          <button
                            className="btn btn-danger"
                            disabled={actionLoadingId === a.id}
                            onClick={() =>
                              handleAction(
                                a.id,
                                { status: "cancelled" },
                                "Appointment cancelled.",
                              )
                            }
                          >
                            <Ban size={14} /> Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard
            title="Completed / Closed History"
            subtitle="Your completed or cancelled field appointments for reference."
          >
            {staffClosedAppointments.length === 0 ? (
              <p style={emptyStateStyle}>No closed appointment history yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Customer</th>
                    <th>Service Type</th>
                    <th>Schedule</th>
                    <th>Location / Address</th>
                    <th>Status</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {staffClosedAppointments.map((a) => (
                    <tr key={a.id}>
                      {renderRequestRefCell(a)}
                      {renderCustomerCell(a)}
                      {renderServiceCell(a)}
                      {renderConfirmedScheduleCell(a)}
                      {renderAddressCell(a)}
                      {renderStatusCell(a)}
                      <td>{formatDateTime(a.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}