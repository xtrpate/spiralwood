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

// Replaced generic classes with inline styles for the monochrome theme
const getStatusStyle = (status) => {
  const s = String(status || "").toLowerCase();
  switch (s) {
    case "pending":
    case "assigned":
      return {
        background: "#ffffff",
        color: "#52525b",
        border: "1px solid #d4d4d8",
      };
    case "confirmed":
      return {
        background: "#f4f4f5",
        color: "#18181b",
        border: "1px solid #e4e4e7",
      };
    case "done":
      return {
        background: "#0a0a0a",
        color: "#ffffff",
        border: "1px solid #0a0a0a",
      };
    case "rejected":
    case "cancelled":
      return {
        background: "#fef2f2",
        color: "#991b1b",
        border: "1px solid #fecaca",
      };
    default:
      return {
        background: "#f4f4f5",
        color: "#52525b",
        border: "1px solid #e4e4e7",
      };
  }
};

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
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  outline: "none",
  color: "#18181b",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  marginBottom: 8,
  fontSize: 12,
  fontWeight: 800,
  color: "#18181b",
  letterSpacing: "0.02em",
};

const summaryCardStyle = {
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  background: "#fff",
  padding: "16px 20px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const subTextStyle = {
  fontSize: 12,
  color: "#71717a",
  marginTop: 4,
  lineHeight: 1.45,
};

const sectionTitleStyle = {
  marginBottom: 6,
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "#0a0a0a",
  fontSize: 16,
  letterSpacing: "-0.01em",
};

const sectionHintStyle = {
  margin: "0 0 20px",
  color: "#52525b",
  fontSize: 13,
  lineHeight: 1.5,
};

const emptyStateStyle = {
  color: "#71717a",
  fontSize: 13,
  textAlign: "center",
  padding: 32,
  fontWeight: 600,
};

const formatRequestNumber = (id) =>
  id ? `APT-${String(id).padStart(4, "0")}` : "—";

const getStatusLabel = (status) =>
  STATUS_LABELS[String(status || "").toLowerCase()] || String(status || "—");

function SectionCard({ title, subtitle, children }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e4e4e7",
        padding: "24px",
        marginBottom: 20,
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      }}
    >
      <h3 style={sectionTitleStyle}>
        <CalendarClock size={20} /> {title}
      </h3>
      {subtitle ? <p style={sectionHintStyle}>{subtitle}</p> : null}
      {children}
    </div>
  );
}

function SummaryCard({ label, count, hint }) {
  return (
    <div style={summaryCardStyle}>
      <div
        style={{
          fontSize: 10,
          color: "#71717a",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 28,
          fontWeight: 800,
          color: "#0a0a0a",
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {count}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: "#a1a1aa",
          fontWeight: 500,
        }}
      >
        {hint}
      </div>
    </div>
  );
}

export default function AppointmentScheduling() {
  const { user } = useAuthStore();

  const isAdmin = user?.role === "admin";
  const isIndoorStaff = user?.role === "staff" && user?.staff_type === "indoor";

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
            next[item.id] = String(item.provider_id ?? item.assigned_to ?? "");
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
      const res = await api.patch(
        `/pos/appointments/${appointmentId}`,
        payload,
      );
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
    const orderAddress = String(
      appointment.order_delivery_address || "",
    ).trim();
    const customerAddress = String(appointment.customer_address || "").trim();

    return (
      noteAddress || orderAddress || customerAddress || "No address provided"
    );
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
    <td style={tdStyle}>
      <div style={{ fontWeight: 800, color: "#0a0a0a" }}>
        {formatRequestNumber(appointment.id)}
      </div>
      <div style={subTextStyle}>Order: {appointment.order_number || "—"}</div>
    </td>
  );

  const renderCustomerCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 700, color: "#18181b" }}>
        {appointment.customer_name || "Unlinked Customer"}
      </div>
      <div style={subTextStyle}>{getContact(appointment)}</div>
    </td>
  );

  const renderServiceCell = (appointment) => (
    <td style={{ ...tdStyle, minWidth: 190 }}>
      <div style={{ fontWeight: 700, color: "#18181b" }}>
        {humanizePurpose(appointment.purpose)}
      </div>
      <div style={subTextStyle}>{getScope(appointment)}</div>
    </td>
  );

  const renderPreferredScheduleCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 600, color: "#18181b" }}>
        {formatDateTime(
          appointment.preferred_date || appointment.scheduled_date,
        )}
      </div>
      <div style={subTextStyle}>Preferred schedule</div>
    </td>
  );

  const renderConfirmedScheduleCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 600, color: "#18181b" }}>
        {formatDateTime(
          appointment.scheduled_date || appointment.preferred_date,
        )}
      </div>
      <div style={subTextStyle}>Confirmed / working schedule</div>
    </td>
  );

  const renderAddressCell = (appointment) => (
    <td style={{ ...tdStyle, minWidth: 220 }}>
      <div style={{ fontWeight: 600, color: "#18181b" }}>
        {getAddress(appointment)}
      </div>
      <div style={subTextStyle}>Service location</div>
    </td>
  );

  const renderRequestedByCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 600, color: "#18181b" }}>
        {getRequestedBy(appointment)}
      </div>
      <div style={subTextStyle}>Request source / dispatcher</div>
    </td>
  );

  const renderAssignedStaffCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 600, color: "#18181b" }}>
        {getAssignedStaff(appointment)}
      </div>
      <div style={subTextStyle}>Assigned indoor staff</div>
    </td>
  );

  const renderStatusCell = (appointment) => {
    const style = getStatusStyle(appointment.status);
    return (
      <td style={tdStyle}>
        <span
          style={{
            ...style,
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {getStatusLabel(appointment.status)}
        </span>
      </td>
    );
  };

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
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontWeight: 800,
              fontSize: 24,
              color: "#0a0a0a",
              letterSpacing: "-0.02em",
            }}
          >
            {isAdmin
              ? "Appointment Dispatch & Triage"
              : "My Field Appointments"}
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              color: "#52525b",
              fontSize: 13,
              lineHeight: 1.5,
              maxWidth: 720,
            }}
          >
            {isAdmin
              ? "Review incoming appointment requests, assign indoor staff, track staff acceptance, and monitor confirmed or closed appointments."
              : "Review your assigned appointments, accept new work, and update completion status for confirmed field schedules."}
          </p>
        </div>

        {isAdmin && (
          <button
            style={showForm ? btnGhost : btnPrimary}
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
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
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
            marginBottom: 20,
            padding: "14px 16px",
            borderRadius: 12,
            background: "#fef2f2",
            color: "#991b1b",
            border: "1px solid #fecaca",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          style={{
            marginBottom: 20,
            padding: "14px 16px",
            borderRadius: 12,
            background: "#fafafa",
            color: "#18181b",
            border: "1px solid #e4e4e7",
            fontSize: 13,
            fontWeight: 600,
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

            <div style={{ marginTop: 20 }}>
              <label style={labelStyle}>Scope / Notes</label>
              <textarea
                style={{
                  ...inputStyle,
                  minHeight: 120,
                  resize: "vertical",
                  fontFamily: "inherit",
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
                marginTop: 20,
                padding: "14px 16px",
                borderRadius: 12,
                background: "#fafafa",
                border: "1px solid #e4e4e7",
                fontSize: 12,
                color: "#52525b",
                lineHeight: 1.55,
              }}
            >
              <strong style={{ color: "#18181b" }}>Workflow note:</strong>{" "}
              assigning an indoor staff here only creates an{" "}
              <strong>Awaiting Staff Acceptance</strong> record. The assigned
              indoor staff must still accept the appointment before it becomes{" "}
              <strong>Confirmed</strong>.
            </div>

            <div
              style={{
                marginTop: 24,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <button
                style={btnGhost}
                type="button"
                onClick={() => setShowForm(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button style={btnPrimary} type="submit" disabled={loading}>
                <Plus size={16} />
                {loading ? "Saving..." : "Save Manual Request"}
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
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request #</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service Type</th>
                      <th style={thStyle}>Preferred Schedule</th>
                      <th style={thStyle}>Location / Address</th>
                      <th style={thStyle}>Requested By</th>
                      <th style={thStyle}>Assign Indoor Staff</th>
                      <th style={thStyle}>Dispatch Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminNewRequests.map((a) => (
                      <tr key={a.id} style={trStyle}>
                        {renderRequestRefCell(a)}
                        {renderCustomerCell(a)}
                        {renderServiceCell(a)}
                        {renderPreferredScheduleCell(a)}
                        {renderAddressCell(a)}
                        {renderRequestedByCell(a)}

                        <td style={{ ...tdStyle, minWidth: 210 }}>
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

                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <button
                              style={btnGhost}
                              disabled={actionLoadingId === a.id}
                              onClick={() => handleAssignProvider(a)}
                            >
                              <UserCheck size={14} /> Assign
                            </button>

                            <button
                              style={btnDanger}
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
              </div>
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
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request #</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service Type</th>
                      <th style={thStyle}>Proposed Schedule</th>
                      <th style={thStyle}>Assigned Indoor Staff</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Dispatch Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAwaitingAcceptance.map((a) => (
                      <tr key={a.id} style={trStyle}>
                        {renderRequestRefCell(a)}
                        {renderCustomerCell(a)}
                        {renderServiceCell(a)}
                        {renderConfirmedScheduleCell(a)}
                        {renderAssignedStaffCell(a)}
                        {renderStatusCell(a)}

                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <button
                              style={btnGhost}
                              disabled={actionLoadingId === a.id}
                              onClick={() => handleAssignProvider(a)}
                            >
                              <UserCheck size={14} /> Reassign
                            </button>

                            <button
                              style={btnDanger}
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
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Confirmed Appointments"
            subtitle="Appointments already accepted by indoor staff and currently active in operations."
          >
            {adminConfirmedAppointments.length === 0 ? (
              <p style={emptyStateStyle}>No confirmed appointments yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request #</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service Type</th>
                      <th style={thStyle}>Confirmed Schedule</th>
                      <th style={thStyle}>Location / Address</th>
                      <th style={thStyle}>Assigned Indoor Staff</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminConfirmedAppointments.map((a) => (
                      <tr key={a.id} style={trStyle}>
                        {renderRequestRefCell(a)}
                        {renderCustomerCell(a)}
                        {renderServiceCell(a)}
                        {renderConfirmedScheduleCell(a)}
                        {renderAddressCell(a)}
                        {renderAssignedStaffCell(a)}
                        {renderStatusCell(a)}

                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <button
                              style={btnDanger}
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
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Closed Appointment History"
            subtitle="Completed, rejected, and cancelled appointment records for audit and review."
          >
            {adminClosedAppointments.length === 0 ? (
              <p style={emptyStateStyle}>No closed appointment history yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request #</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service Type</th>
                      <th style={thStyle}>Final Schedule</th>
                      <th style={thStyle}>Assigned Indoor Staff</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminClosedAppointments.map((a) => (
                      <tr key={a.id} style={trStyle}>
                        {renderRequestRefCell(a)}
                        {renderCustomerCell(a)}
                        {renderServiceCell(a)}
                        {renderConfirmedScheduleCell(a)}
                        {renderAssignedStaffCell(a)}
                        {renderStatusCell(a)}
                        <td
                          style={{ ...tdStyle, color: "#71717a", fontSize: 12 }}
                        >
                          {formatDateTime(a.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request #</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service Type</th>
                      <th style={thStyle}>Proposed Schedule</th>
                      <th style={thStyle}>Location / Address</th>
                      <th style={thStyle}>Assigned By</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffNewAssignments.map((a) => (
                      <tr key={a.id} style={trStyle}>
                        {renderRequestRefCell(a)}
                        {renderCustomerCell(a)}
                        {renderServiceCell(a)}
                        {renderConfirmedScheduleCell(a)}
                        {renderAddressCell(a)}
                        {renderRequestedByCell(a)}
                        {renderStatusCell(a)}

                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <button
                              style={btnPrimary}
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
                              style={btnDanger}
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
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Confirmed Schedule"
            subtitle="Appointments you already accepted and are currently responsible for handling."
          >
            {staffConfirmedAppointments.length === 0 ? (
              <p style={emptyStateStyle}>No confirmed appointments yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request #</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service Type</th>
                      <th style={thStyle}>Confirmed Schedule</th>
                      <th style={thStyle}>Location / Address</th>
                      <th style={thStyle}>Customer Contact</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffConfirmedAppointments.map((a) => (
                      <tr key={a.id} style={trStyle}>
                        {renderRequestRefCell(a)}
                        {renderCustomerCell(a)}
                        {renderServiceCell(a)}
                        {renderConfirmedScheduleCell(a)}
                        {renderAddressCell(a)}

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{getContact(a)}</div>
                          <div style={subTextStyle}>
                            {a.customer_name || "Customer"}
                          </div>
                        </td>

                        {renderStatusCell(a)}

                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <button
                              style={btnPrimary}
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
                              style={btnDanger}
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
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Completed / Closed History"
            subtitle="Your completed or cancelled field appointments for reference."
          >
            {staffClosedAppointments.length === 0 ? (
              <p style={emptyStateStyle}>No closed appointment history yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request #</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service Type</th>
                      <th style={thStyle}>Schedule</th>
                      <th style={thStyle}>Location / Address</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffClosedAppointments.map((a) => (
                      <tr key={a.id} style={trStyle}>
                        {renderRequestRefCell(a)}
                        {renderCustomerCell(a)}
                        {renderServiceCell(a)}
                        {renderConfirmedScheduleCell(a)}
                        {renderAddressCell(a)}
                        {renderStatusCell(a)}
                        <td
                          style={{ ...tdStyle, color: "#71717a", fontSize: 12 }}
                        >
                          {formatDateTime(a.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ── Reusable Inline Styles ───────────────────────────────────────────────

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 16px",
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
  padding: "9px 14px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnDanger = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 14px",
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  minWidth: 800,
};

const thRowStyle = {
  background: "#fafafa",
  borderBottom: "1px solid #e4e4e7",
};

const thStyle = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const trStyle = {
  borderBottom: "1px solid #f4f4f5",
  background: "#ffffff",
};

const tdStyle = {
  padding: "16px",
  color: "#18181b",
  verticalAlign: "middle",
};
