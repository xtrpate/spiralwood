import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";
import {
  Plus,
  Search,
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
  awaiting_staff_acceptance: "Awaiting Staff Acceptance",
  confirmed: "Confirmed",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

// Replaced generic classes with inline styles for the monochrome theme
const getStatusStyle = (status) => {
  const s = String(status || "").toLowerCase();
  switch (s) {
    case "pending":
    case "awaiting_staff_acceptance":
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
    case "completed":
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

const getMinDateYMD = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

const toYMD = (dateObj) => {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(dateObj.getDate()).padStart(2, "0")}`;
};

const getStartOfWeek = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);

  return new Date(date.setDate(diff));
};

const TIME_SLOTS = ["09:00", "11:00", "13:00", "15:00"];

const formatTimeForDisplay = (time) => {
  const [h, m] = time.split(":");
  const hr = Number(h);

  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
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
  minHeight: 36,
  padding: "8px 11px",
  borderRadius: 0,
  border: "1px solid #d4d4d8",
  background: "#ffffff",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
  outline: "none",
  color: "#18181b",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 600,
  color: "#3f3f46",
  letterSpacing: 0,
};

const subTextStyle = {
  marginTop: 2,
  color: "#71717a",
  fontSize: 10.5,
  fontWeight: 400,
  lineHeight: 1.35,
};

const sectionTitleStyle = {
  marginBottom: 5,
  color: "#18181b",
  fontSize: 15.5,
  fontWeight: 700,
  lineHeight: 1.3,
  letterSpacing: "-0.015em",
};

const sectionHintStyle = {
  margin: "0 0 15px",
  color: "#71717a",
  fontSize: 11.5,
  fontWeight: 400,
  lineHeight: 1.45,
};

const emptyStateStyle = {
  color: "#71717a",
  fontSize: 11.5,
  textAlign: "center",
  padding: "40px 20px",
  fontWeight: 400,
};

const formatRequestNumber = (id) =>
  id ? `APT-${String(id).padStart(4, "0")}` : "—";

const getStatusLabel = (status) =>
  STATUS_LABELS[String(status || "").toLowerCase()] || String(status || "—");

function SectionCard({ title, subtitle, children, id }) {
  return (
    <section
      id={id}
      style={{
        background: "#ffffff",
        borderRadius: 0,
        border: "1px solid #dddddf",
        padding: "20px",
        marginBottom: 16,
        boxShadow: "none",
        scrollMarginTop: "64px",
      }}
    >
      <h3 style={sectionTitleStyle}>{title}</h3>
      {subtitle ? <p style={sectionHintStyle}>{subtitle}</p> : null}
      {children}
    </section>
  );
}
// WISDOM INDOOR APPOINTMENTS UI V1
const getIndoorStatusLabel = (status) => {
  const key = String(status || "").toLowerCase();

  if (key === "awaiting_staff_acceptance") return "Awaiting Acceptance";
  if (key === "confirmed") return "Confirmed";
  if (key === "completed") return "Completed";
  if (key === "cancelled") return "Cancelled";
  if (key === "rejected") return "Rejected";

  return getStatusLabel(status);
};

const cleanIndoorWorkNote = (value) =>
  String(value || "")
    .replace(/^(?:work\s+note|notes?|note)\s*:\s*/i, "")
    .trim();

function IndoorSummaryCard({ label, count, hint, emphasized = false }) {
  return (
    <div style={indoorSummaryCardStyle}>
      <div
        style={{
          fontSize: 25,
          fontWeight: 800,
          color: "#18181b",
          lineHeight: 1,
          letterSpacing: "-0.025em",
        }}
      >
        {count}
      </div>
      <div style={indoorSummaryLabelStyle}>{label}</div>
      <div style={indoorSummaryHintStyle}>{hint}</div>
      {emphasized ? <div style={indoorSummaryAccentStyle} /> : null}
    </div>
  );
}

function IndoorStatusBadge({ status }) {
  const base = getStatusStyle(status);

  return (
    <span
      style={{
        ...base,
        minHeight: 24,
        padding: "4px 8px",
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 0,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {getIndoorStatusLabel(status)}
    </span>
  );
}

function IndoorInfo({ label, value, important = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={indoorInfoLabelStyle}>{label}</div>
      <div
        style={{
          ...indoorInfoValueStyle,
          fontWeight: important ? 650 : 500,
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function IndoorAppointmentSection({ title, subtitle, children }) {
  return (
    <section style={indoorSectionStyle}>
      <div style={indoorSectionHeaderStyle}>
        <div>
          <h3 style={indoorSectionTitleStyle}>{title}</h3>
          <p style={indoorSectionSubtitleStyle}>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

const indoorPageHeaderStyle = {
  marginBottom: 18,
};

const indoorPageTitleStyle = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  lineHeight: 1.15,
  letterSpacing: "-0.025em",
};

const indoorPageSubtitleStyle = {
  margin: "6px 0 0",
  color: "#696a70",
  fontSize: 12.5,
  fontWeight: 400,
  lineHeight: 1.5,
};

const indoorSummaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const indoorSummaryCardStyle = {
  position: "relative",
  minHeight: 84,
  padding: "15px 17px",
  boxSizing: "border-box",
  background: "#ffffff",
  border: "1px solid #dcdde1",
  borderRadius: 0,
  overflow: "hidden",
};

const indoorSummaryLabelStyle = {
  marginTop: 7,
  color: "#5d5e63",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.075em",
  textTransform: "uppercase",
};

const indoorSummaryHintStyle = {
  marginTop: 5,
  color: "#919297",
  fontSize: 9.5,
  fontWeight: 400,
  lineHeight: 1.35,
};

const indoorSummaryAccentStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  height: 2,
  background: "#18181b",
};

const indoorSectionStyle = {
  marginBottom: 14,
  background: "#ffffff",
  border: "1px solid #dcdde1",
  borderRadius: 0,
  overflow: "hidden",
};

const indoorSectionHeaderStyle = {
  minHeight: 60,
  padding: "13px 16px",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  borderBottom: "1px solid #e5e5e8",
};

const indoorSectionTitleStyle = {
  margin: 0,
  color: "#18181b",
  fontSize: 14,
  fontWeight: 700,
};

const indoorSectionSubtitleStyle = {
  margin: "4px 0 0",
  color: "#7d7e83",
  fontSize: 10.5,
  fontWeight: 400,
  lineHeight: 1.4,
};

const indoorAppointmentListStyle = {
  display: "grid",
};

const indoorAppointmentCardStyle = {
  padding: 0,
  borderBottom: "1px solid #e8e8eb",
  background: "#ffffff",
  borderRadius: 0,
};

const indoorAppointmentHeaderStyle = {
  padding: "14px 16px 0",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
};

const indoorAppointmentRefStyle = {
  color: "#111113",
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: "0.015em",
};

const indoorCustomerStyle = {
  marginTop: 4,
  color: "#3f3f46",
  fontSize: 11.5,
  fontWeight: 600,
};

const indoorInfoGridStyle = {
  marginTop: 14,
  padding: "0 16px 14px",
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(130px, 1fr))",
  gap: 16,
};

const indoorInfoLabelStyle = {
  marginBottom: 4,
  color: "#818287",
  fontSize: 8.5,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
};

const indoorInfoValueStyle = {
  color: "#2b2b2f",
  fontSize: 10.5,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const indoorScopeStyle = {
  margin: "0 16px 14px",
  padding: "9px 10px",
  border: "1px solid #e0e0e3",
  borderRadius: 0,
  background: "#fafafa",
  color: "#55565b",
  fontSize: 10.5,
  fontWeight: 400,
  lineHeight: 1.45,
};

const indoorActionsStyle = {
  marginTop: 0,
  padding: "10px 16px",
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 7,
  flexWrap: "wrap",
  borderTop: "1px solid #e7e7ea",
  background: "#fafafa",
};

const indoorButtonBase = {
  minHeight: 34,
  padding: "7px 11px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 0,
  fontSize: 10.5,
  fontWeight: 650,
};

const indoorPrimaryButton = {
  ...indoorButtonBase,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  cursor: "pointer",
};

const indoorSecondaryButton = {
  ...indoorButtonBase,
  border: "1px solid #18181b",
  background: "#ffffff",
  color: "#18181b",
  cursor: "pointer",
};

const indoorDangerButton = {
  ...indoorButtonBase,
  border: "1px solid #d8a3a3",
  background: "#ffffff",
  color: "#991b1b",
  cursor: "pointer",
};

const indoorDisabledButton = {
  ...indoorButtonBase,
  border: "1px solid #dedee2",
  background: "#f3f3f5",
  color: "#a0a1a6",
  cursor: "not-allowed",
};

const indoorEmptyStyle = {
  padding: 28,
  color: "#77787e",
  textAlign: "center",
  fontSize: 11.5,
  fontWeight: 500,
};

const indoorHistoryTableStyle = {
  width: "100%",
  minWidth: 900,
  borderCollapse: "collapse",
  fontSize: 11,
};

const indoorHistoryHeadStyle = {
  background: "#fafafa",
  borderBottom: "1px solid #e4e4e7",
};

const indoorHistoryThStyle = {
  padding: "10px 12px",
  color: "#77787e",
  fontSize: 8.5,
  fontWeight: 700,
  letterSpacing: "0.075em",
  textAlign: "left",
  textTransform: "uppercase",
};

const indoorHistoryTdStyle = {
  padding: "12px",
  color: "#3f3f46",
  fontSize: 10.5,
  fontWeight: 400,
  verticalAlign: "middle",
  borderBottom: "1px solid #ededf0",
};

export default function AppointmentScheduling() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const { user } = useAuthStore();

  const isAdmin = user?.role === "admin";
  const isIndoorStaff = user?.role === "staff" && user?.staff_type === "indoor";

  const [appointments, setAppointments] = useState([]);
  const [assignedStaff, setAssignedStaff] = useState([]);
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedAppointmentId, setFocusedAppointmentId] = useState(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminServiceFilter, setAdminServiceFilter] = useState("all");
  const [adminActiveTab, setAdminActiveTab] = useState("new");

  const [form, setForm] = useState({
    order_id: "",
    customer_id: "",
    assigned_staff_id: "",
    purpose: "installation",
    scheduled_date: "",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // for calendar schedule
  const [weekStart, setWeekStart] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getStartOfWeek(tomorrow);
  });

  const [bookedSlots, setBookedSlots] = useState({});

  const [loadingSlots, setLoadingSlots] = useState(false);

  const getAssignStaffId = useCallback((appointment) => {
    return Number(
      appointment?.assigned_staff_id ??
        appointment?.assigned_to ??
        appointment?.assigned_provider_id ??
        0,
    );
  }, []);

  const isAssignedToCurrentIndoorStaff = useCallback(
    (appointment) => getAssignStaffId(appointment) === Number(user?.id || 0),
    [getAssignStaffId, user?.id],
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
              item.assigned_staff_id ?? item.assigned_to ?? "",
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

  const fetchAssignStaff = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const res = await api.get("/users");
      const list = Array.isArray(res.data) ? res.data : [];
      setAssignedStaff(
        list.filter(
          (p) =>
            p.role === "staff" &&
            p.staff_type === "indoor" &&
            (p.is_active === undefined || p.is_active),
        ),
      );
    } catch (err) {
      console.error("Failed to fetch assigned staff:", err);
      setAssignedStaff([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchAppointments();
    fetchAssignStaff();
  }, [fetchAppointments, fetchAssignStaff]);

  // Notification double-click focus support (forward compatibility —
  // no active notification creation point produces focus_appointment_id
  // today, but the page is wired so it works the moment one does).
  // Every bucket renders unconditionally on this page (no tab/filter
  // hides a row), so we only need to locate the appointment across all
  // buckets, scroll it into view, and briefly highlight it. Fails
  // safely if the appointment no longer exists.
  useEffect(() => {
    const focusId = searchParams.get("focus_appointment_id");
    if (!focusId || loading) return;

    const numericId = Number(focusId);
    const match = appointments.find((a) => Number(a.id) === numericId);

    if (!match) {
      const next = new URLSearchParams(searchParams);
      next.delete("focus_appointment_id");
      setSearchParams(next, { replace: true });
      return;
    }

    if (isAdmin) {
      const status = String(match.status || "").toLowerCase();

      if (status === "pending") {
        setAdminActiveTab("new");
      } else if (status === "awaiting_staff_acceptance") {
        setAdminActiveTab("awaiting");
      } else if (status === "confirmed") {
        setAdminActiveTab("confirmed");
      } else if (["completed", "rejected", "cancelled"].includes(status)) {
        setAdminActiveTab("history");
      }
    }

    setFocusedAppointmentId(numericId);

    const scrollTimer = setTimeout(() => {
      document
        .getElementById(`appointment-row-${numericId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 90);

    const highlightTimer = setTimeout(
      () => setFocusedAppointmentId(null),
      4000,
    );

    const next = new URLSearchParams(searchParams);
    next.delete("focus_appointment_id");
    setSearchParams(next, { replace: true });

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(highlightTimer);
    };
  }, [searchParams, loading, appointments, isAdmin]);

  useEffect(() => {
    const fetchWeeklyAvailability = async () => {
      setLoadingSlots(true);

      try {
        const days = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          return toYMD(d);
        });

        const responses = await Promise.all(
          days.map((date) =>
            api.get(`/pos/appointments/availability?date=${date}`),
          ),
        );

        const booked = {};

        days.forEach((date, index) => {
          booked[date] = responses[index].data.booked || [];
        });

        setBookedSlots(booked);
      } catch (err) {
        console.error(err);
        setBookedSlots({});
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchWeeklyAvailability();
  }, [weekStart]);

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
        (a) =>
          String(a.status || "").toLowerCase() === "awaiting_staff_acceptance",
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
        ["completed", "rejected", "cancelled"].includes(
          String(a.status || "").toLowerCase(),
        ),
      ),
    [appointments],
  );

  const staffNewAssignments = useMemo(() => {
    if (!isIndoorStaff) return [];

    return appointments.filter(
      (a) =>
        String(a.status || "").toLowerCase() === "awaiting_staff_acceptance" &&
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
        ["completed", "cancelled", "rejected"].includes(
          String(a.status || "").toLowerCase(),
        ) && isAssignedToCurrentIndoorStaff(a),
    );
  }, [appointments, isIndoorStaff, isAssignedToCurrentIndoorStaff]);

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // week calendar navigation
  const nextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
  };

  const prevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);

    setWeekStart(prev);
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        order_id: form.order_id || null,
        customer_id: form.customer_id || null,
        assigned_staff_id: form.assigned_staff_id || null,
        purpose: form.purpose,
        scheduled_date: form.scheduled_date,
        preferred_date: form.scheduled_date,
        notes: form.notes.trim() || null,
      };

      await api.post("/pos/appointments", payload);

      setSuccess(
        form.assigned_staff_id
          ? "Manual appointment request saved and assigned. Waiting for indoor staff acceptance."
          : "Manual appointment request created successfully.",
      );

      setForm({
        order_id: "",
        customer_id: "",
        assigned_staff_id: "",
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

  const handleAssignStaff = async (appointment) => {
    const selectedProviderId =
      assignmentDrafts[appointment.id] ||
      String(appointment.assigned_staff_id || appointment.assigned_to || "");

    if (!selectedProviderId) {
      setError("Select an indoor staff member first before assigning.");
      return;
    }

    await handleAction(
      appointment.id,
      { assigned_staff_id: Number(selectedProviderId) },
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
    if (appointment.reviewed_by_name) return appointment.reviewed_by_name;

    if (Number(appointment.customer_id || 0) > 0) {
      return "Customer Portal";
    }

    if (Number(appointment.order_id || 0) > 0) {
      return "Walk-in POS";
    }

    return "Manual Request";
  };

  const getAssignedStaff = (appointment) =>
    appointment.assigned_staff_name || "Not assigned";

  const matchesAdminFilters = (appointment) => {
    if (
      adminServiceFilter !== "all" &&
      String(appointment.purpose || "").toLowerCase() !== adminServiceFilter
    ) {
      return false;
    }

    const keyword = adminSearch.trim().toLowerCase();
    if (!keyword) return true;

    return [
      formatRequestNumber(appointment.id),
      appointment.order_number,
      appointment.customer_name,
      getContact(appointment),
      humanizePurpose(appointment.purpose),
      getScope(appointment),
      getAddress(appointment),
      getRequestedBy(appointment),
      getAssignedStaff(appointment),
    ].some((value) => String(value || "").toLowerCase().includes(keyword));
  };

  const filteredAdminNewRequests = adminNewRequests.filter(matchesAdminFilters);
  const filteredAdminAwaitingAcceptance =
    adminAwaitingAcceptance.filter(matchesAdminFilters);
  const filteredAdminConfirmedAppointments =
    adminConfirmedAppointments.filter(matchesAdminFilters);
  const filteredAdminClosedAppointments =
    adminClosedAppointments.filter(matchesAdminFilters);

  const adminFilteredCount =
    adminActiveTab === "new"
      ? filteredAdminNewRequests.length
      : adminActiveTab === "awaiting"
        ? filteredAdminAwaitingAcceptance.length
        : adminActiveTab === "confirmed"
          ? filteredAdminConfirmedAppointments.length
          : adminActiveTab === "history"
            ? filteredAdminClosedAppointments.length
            : 0;

  const hasAdminFilters =
    Boolean(adminSearch.trim()) || adminServiceFilter !== "all";

  const renderRequestRefCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 700, color: "#18181b" }}>
        {formatRequestNumber(appointment.id)}
      </div>
      {appointment.order_number ? (
        <div style={subTextStyle}>{appointment.order_number}</div>
      ) : null}
    </td>
  );
  const renderCustomerCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 600, color: "#18181b" }}>
        {appointment.customer_name || "Customer"}
      </div>
      <div style={subTextStyle}>{getContact(appointment)}</div>
    </td>
  );
  const renderServiceCell = (appointment) => {
    const scope = getScope(appointment);

    return (
      <td style={{ ...tdStyle, minWidth: 180 }}>
        <div style={{ fontWeight: 600, color: "#18181b" }}>
          {humanizePurpose(appointment.purpose)}
        </div>
        {scope && scope !== "No additional scope details" ? (
          <div style={subTextStyle}>{scope}</div>
        ) : null}
      </td>
    );
  };
  const renderPreferredScheduleCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 400, color: "#3f3f46" }}>
        {formatDateTime(
          appointment.preferred_date || appointment.scheduled_date,
        )}
      </div>
    </td>
  );
  const renderConfirmedScheduleCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 400, color: "#3f3f46" }}>
        {formatDateTime(
          appointment.scheduled_date || appointment.preferred_date,
        )}
      </div>
    </td>
  );
  const renderAddressCell = (appointment) => (
    <td style={{ ...tdStyle, minWidth: 190 }}>
      <div style={{ fontWeight: 400, color: "#3f3f46" }}>
        {getAddress(appointment)}
      </div>
    </td>
  );
  const renderRequestedByCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 400, color: "#3f3f46" }}>
        {getRequestedBy(appointment)}
      </div>
    </td>
  );
  const renderAssignedStaffCell = (appointment) => (
    <td style={tdStyle}>
      <div style={{ fontWeight: 500, color: "#3f3f46" }}>
        {getAssignedStaff(appointment)}
      </div>
    </td>
  );
  const renderStatusCell = (appointment) => {
    const style = getStatusStyle(appointment.status);

    return (
      <td style={tdStyle}>
        <span
          style={{
            ...style,
            minHeight: 24,
            padding: "0 8px",
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 0,
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {getStatusLabel(appointment.status)}
        </span>
      </td>
    );
  };
  const staffSummary = [
    {
      label: "New Assignments",
      count: staffNewAssignments.length,
      hint: "Waiting for your acceptance",
    },
    {
      label: "Active Appointments",
      count: staffConfirmedAppointments.length,
      hint: "Appointments you are handling",
    },
    {
      label: "History",
      count: staffClosedAppointments.length,
      hint: "Completed and closed records",
    },
  ];

  return (
    <div
      style={
        isAdmin
          ? adminPageStyle
          : { fontFamily: "'Inter', sans-serif" }
      }
    >
      {isAdmin ? (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 14,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontWeight: 700,
                  fontSize: 24,
                  lineHeight: 1.2,
                  color: "#18181b",
                  letterSpacing: "-0.02em",
                }}
              >
                Appointments
              </h2>
              <p
                style={{
                  margin: "6px 0 0",
                  color: "#71717a",
                  fontSize: 13,
                  fontWeight: 400,
                  lineHeight: 1.5,
                  maxWidth: 720,
                }}
              >
                Review requests, assign staff, and track appointment status.
              </p>
            </div>

            <button
              type="button"
              style={btnPrimary}
              onClick={() => {
                setShowForm(true);
                setError("");
                setSuccess("");
              }}
            >
              <Plus size={16} />
              New appointment
            </button>
          </div>

          <div
            style={adminTabsStyle}
            role="tablist"
            aria-label="Appointment views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={adminActiveTab === "new"}
              style={
                adminActiveTab === "new"
                  ? adminTabButtonActiveStyle
                  : adminTabButtonStyle
              }
              onClick={() => setAdminActiveTab("new")}
            >
              New Requests
              <span style={adminTabCountStyle}>{adminNewRequests.length.toLocaleString("en-PH")}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={adminActiveTab === "awaiting"}
              style={
                adminActiveTab === "awaiting"
                  ? adminTabButtonActiveStyle
                  : adminTabButtonStyle
              }
              onClick={() => setAdminActiveTab("awaiting")}
            >
              Awaiting Staff
              <span style={adminTabCountStyle}>
                {adminAwaitingAcceptance.length.toLocaleString("en-PH")}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={adminActiveTab === "confirmed"}
              style={
                adminActiveTab === "confirmed"
                  ? adminTabButtonActiveStyle
                  : adminTabButtonStyle
              }
              onClick={() => setAdminActiveTab("confirmed")}
            >
              Confirmed
              <span style={adminTabCountStyle}>
                {adminConfirmedAppointments.length.toLocaleString("en-PH")}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={adminActiveTab === "calendar"}
              style={
                adminActiveTab === "calendar"
                  ? adminTabButtonActiveStyle
                  : adminTabButtonStyle
              }
              onClick={() => setAdminActiveTab("calendar")}
            >
              Calendar
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={adminActiveTab === "history"}
              style={
                adminActiveTab === "history"
                  ? adminTabButtonActiveStyle
                  : adminTabButtonStyle
              }
              onClick={() => setAdminActiveTab("history")}
            >
              History
              <span style={adminTabCountStyle}>
                {adminClosedAppointments.length.toLocaleString("en-PH")}
              </span>
            </button>
          </div>

          {adminActiveTab !== "calendar" ? (
            <div style={adminToolbarStyle}>
              <div style={adminSearchWrapStyle}>
                <Search
                  size={14}
                  strokeWidth={1.8}
                  style={adminSearchIconStyle}
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={adminSearch}
                  onChange={(event) => setAdminSearch(event.target.value)}
                  placeholder="Search appointments"
                  style={adminSearchStyle}
                  aria-label="Search appointments"
                />
              </div>

              <select
                value={adminServiceFilter}
                onChange={(event) => setAdminServiceFilter(event.target.value)}
                style={adminFilterSelectStyle}
                aria-label="Filter appointments by service"
              >
                <option value="all">All services</option>
                <option value="consultation">Consultation</option>
                <option value="site_measurement">Site Measurement</option>
                <option value="installation">Installation</option>
              </select>

              <button
                type="button"
                style={btnGhost}
                onClick={() => {
                  setAdminSearch("");
                  setAdminServiceFilter("all");
                }}
              >
                Reset
              </button>

              <span style={adminResultCountStyle}>
                {hasAdminFilters
                  ? `${adminFilteredCount.toLocaleString("en-PH")} matching`
                  : `${adminFilteredCount.toLocaleString("en-PH")} shown`}
              </span>
            </div>
          ) : null}

        </>
      ) : null}

      {isAdmin && adminActiveTab === "calendar" && (
        <SectionCard
          title="Appointment Calendar"
          subtitle="Check available time slots before assigning or creating appointments."
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <button style={btnGhost} onClick={prevWeek}>
              ← Previous Week
            </button>

            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: "#18181b",
              }}
            >
              {weekDays[0].toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
              })}
              {" - "}
              {weekDays[6].toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>

            <button style={btnGhost} onClick={nextWeek}>
              Next Week →
            </button>
          </div>

          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 900,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      padding: 12,
                      border: "1px solid #e4e4e7",
                      background: "#fafafa",
                      width: 120,
                    }}
                  >
                    Time
                  </th>

                  {weekDays.map((day) => (
                    <th
                      key={toYMD(day)}
                      style={{
                        padding: 12,
                        border: "1px solid #e4e4e7",
                        background: "#fafafa",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {day.toLocaleDateString("en-PH", {
                          weekday: "short",
                        })}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: "#71717a",
                          marginTop: 4,
                        }}
                      >
                        {day.toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {TIME_SLOTS.map((slot) => (
                  <tr key={slot}>
                    <td
                      style={{
                        border: "1px solid #e4e4e7",
                        padding: 14,
                        fontWeight: 700,
                        background: "#fafafa",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatTimeForDisplay(slot)}
                    </td>

                    {weekDays.map((day) => (
                      <td
                        key={`${toYMD(day)}-${slot}`}
                        style={{
                          border: "1px solid #e4e4e7",
                          height: 72,
                          padding: 10,
                          textAlign: "center",
                          verticalAlign: "middle",
                        }}
                      >
                        {(() => {
                          const date = toYMD(day);
                          const isSunday = day.getDay() === 0;
                          const slotDateTime = new Date(`${date}T${slot}:00`);
                          const isPastSlot = slotDateTime < new Date();
                          const booking = (bookedSlots[date] || []).find(
                            (b) => b.time === slot || b === slot,
                          );

                          if (loadingSlots) {
                            return (
                              <span style={{ color: "#a1a1aa", fontSize: 12 }}>
                                Loading...
                              </span>
                            );
                          }

                          if (isSunday) {
                            return (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  width: "100%",
                                  height: "100%",
                                  borderRadius: 0,
                                  background: "#fafafa",
                                }}
                              >
                                <div
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: 0,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    background: "#f4f4f5",
                                    color: "#a1a1aa",
                                    border: "1px solid #e4e4e7",
                                  }}
                                >
                                  Unavailable
                                </div>
                              </div>
                            );
                          }

                          if (booking) {
                            if (booking.status === "completed") {
                              return (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    width: "100%",
                                    height: "100%",
                                    borderRadius: 0,
                                    background: "#f4f4f5",
                                  }}
                                >
                                  <div
                                    style={{
                                      padding: "6px 12px",
                                      borderRadius: 0,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      background: "#18181b",
                                      color: "#ffffff",
                                      border: "1px solid #18181b",
                                    }}
                                  >
                                    Completed
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  width: "100%",
                                  height: "100%",
                                  borderRadius: 0,
                                  background: "#fef2f2",
                                }}
                              >
                                <div
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: 0,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    background: "#fef2f2",
                                    color: "#991b1b",
                                    border: "1px solid #fecaca",
                                  }}
                                >
                                  Booked
                                </div>
                              </div>
                            );
                          }

                          if (isPastSlot) {
                            return (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  width: "100%",
                                  height: "100%",
                                  borderRadius: 0,
                                  background: "#fafafa",
                                }}
                              >
                                <div
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: 0,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    background: "#f4f4f5",
                                    color: "#a1a1aa",
                                    border: "1px solid #e4e4e7",
                                  }}
                                >
                                  Unavailable
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                alignItems: "center",
                                width: "100%",
                                height: "100%",
                                borderRadius: 0,
                                background: "#f8fffa",
                              }}
                            >
                              <div
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 0,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: "#f0fdf4",
                                  color: "#166534",
                                  border: "1px solid #bbf7d0",
                                }}
                              >
                                Available
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {error ? (
        <div
          style={{
            marginBottom: 20,
            padding: "14px 16px",
            borderRadius: 0,
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
            borderRadius: 0,
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
        <div
          style={adminModalOverlayStyle}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loading) {
              setShowForm(false);
            }
          }}
        >
          <div
            style={adminModalShellStyle}
            role="dialog"
            aria-modal="true"
            aria-label="New Appointment"
          >
            <button
              type="button"
              style={adminModalCloseStyle}
              onClick={() => setShowForm(false)}
              disabled={loading}
              aria-label="Close new appointment"
            >
              &times;
            </button>

            <SectionCard
              id="manual-appointment-form"
              title="New Appointment"
          subtitle="For walk-in, phone, or staff-created appointment requests."
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
                <label style={labelStyle}>Order ID (optional)</label>
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
                <label style={labelStyle}>Customer ID (optional)</label>
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
                <label style={labelStyle}>Staff (optional)</label>
                <select
                  style={inputStyle}
                  value={form.assigned_staff_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      assigned_staff_id: e.target.value,
                    }))
                  }
                >
                  <option value="">Not assigned yet</option>
                  {assignedStaff.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>
                  Service <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  style={inputStyle}
                  value={form.purpose}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, purpose: e.target.value }))
                  }
                  required
                >
                  <option value="installation">Installation</option>
                  <option value="consultation">Consultation</option>
                  <option value="site_measurement">Site Measurement</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>
                  Date <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  style={inputStyle}
                  type="date"
                  min={getMinDateYMD()}
                  value={
                    form.scheduled_date ? form.scheduled_date.split("T")[0] : ""
                  }
                  onChange={(e) => {
                    const selectedDate = e.target.value;
                    const existingTime = form.scheduled_date
                      ? form.scheduled_date.split("T")[1]?.substring(0, 5)
                      : "";

                    setForm((prev) => ({
                      ...prev,
                      scheduled_date: selectedDate
                        ? `${selectedDate}T${existingTime || "09:00"}`
                        : "",
                    }));
                  }}
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    ...labelStyle,
                    color: form.scheduled_date ? "#18181b" : "#a1a1aa",
                  }}
                >
                  Time <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  style={{
                    ...inputStyle,
                    background: form.scheduled_date ? "#ffffff" : "#fafafa",
                    color: form.scheduled_date ? "#18181b" : "#a1a1aa",
                    cursor: form.scheduled_date ? "pointer" : "not-allowed",
                  }}
                  value={
                    form.scheduled_date
                      ? form.scheduled_date.split("T")[1]?.substring(0, 5)
                      : ""
                  }
                  onChange={(e) => {
                    const d = form.scheduled_date
                      ? form.scheduled_date.split("T")[0]
                      : "";
                    if (d) {
                      setForm((prev) => ({
                        ...prev,
                        scheduled_date: `${d}T${e.target.value}`,
                      }));
                    }
                  }}
                  disabled={!form.scheduled_date}
                  required
                >
                  <option value="" disabled>
                    Select time...
                  </option>
                  {TIME_SLOTS.map((slot) => {
                    const d = form.scheduled_date
                      ? form.scheduled_date.split("T")[0]
                      : "";
                    let statusText = "Available";

                    if (d) {
                      const slotDateTime = new Date(`${d}T${slot}:00`);
                      const isPast = slotDateTime < new Date();

                      const dateObj = new Date(`${d}T00:00:00`);
                      const isSunday = dateObj.getDay() === 0;

                      const booking = (bookedSlots[d] || []).find(
                        (b) => b.time === slot || b === slot,
                      );

                      if (isSunday) {
                        statusText = "Closed";
                      } else if (booking) {
                        statusText =
                          booking.status === "completed"
                            ? "Completed"
                            : "Booked";
                      } else if (isPast) {
                        statusText = "Past";
                      }
                    }

                    return (
                      <option
                        key={slot}
                        value={slot}
                        disabled={statusText !== "Available"}
                      >
                        {formatTimeForDisplay(slot)} - {statusText}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={labelStyle}>
                Notes <span style={{ color: "#ef4444" }}>*</span>
              </label>
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
                placeholder="Description, address, contact number, or customer notes"
                required
              />
            </div>

            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                borderRadius: 0,
                background: "#fafafa",
                border: "1px solid #e4e4e7",
                fontSize: 11.5,
                fontWeight: 400,
                color: "#6f7076",
                lineHeight: 1.45,
              }}
            >
              Assigned staff must accept the appointment before it becomes confirmed.
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
                {loading ? "Saving..." : "Save appointment"}
              </button>
            </div>
          </form>
            </SectionCard>
          </div>
        </div>
      )}

      {isAdmin && (
        <>
          {adminActiveTab === "new" && (
          <SectionCard
            title="New Requests"
            subtitle="Requests that need review and staff assignment."
          >
            {filteredAdminNewRequests.length === 0 ? (
              <p style={emptyStateStyle}>No appointments to show.</p>
            ) : (
              <div style={adminTableScrollStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service</th>
                      <th style={thStyle}>Schedule</th>
                      <th style={thStyle}>Location</th>
                      <th style={thStyle}>Source</th>
                      <th style={thStyle}>Staff</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminNewRequests.map((a) => (
                      <tr
                        key={a.id}
                        id={`appointment-row-${a.id}`}
                        style={
                          focusedAppointmentId === a.id
                            ? {
                                ...trStyle,
                                boxShadow: "inset 0 0 0 2px #0a0a0a",
                              }
                            : trStyle
                        }
                      >
                        {renderRequestRefCell(a)}
                        {renderCustomerCell(a)}
                        {renderServiceCell(a)}
                        {renderPreferredScheduleCell(a)}
                        {renderAddressCell(a)}
                        {renderRequestedByCell(a)}

                        <td style={{ ...tdStyle, minWidth: 180 }}>
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
                            <option value="">Select staff</option>
                            {assignedStaff.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td style={tdStyle}>
                          <div style={adminRowActionsStyle}>
                            <button
                              style={btnGhost}
                              disabled={actionLoadingId === a.id}
                              onClick={() => handleAssignStaff(a)}
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
          )}

          {adminActiveTab === "awaiting" && (
          <SectionCard
            title="Awaiting Staff Acceptance"
            subtitle="Assigned requests waiting for staff response."
          >
            {filteredAdminAwaitingAcceptance.length === 0 ? (
              <p style={emptyStateStyle}>
                No appointments to show.
              </p>
            ) : (
              <div style={adminTableScrollStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service</th>
                      <th style={thStyle}>Schedule</th>
                      <th style={thStyle}>Staff</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminAwaitingAcceptance.map((a) => (
                      <tr
                        key={a.id}
                        id={`appointment-row-${a.id}`}
                        style={
                          focusedAppointmentId === a.id
                            ? {
                                ...trStyle,
                                boxShadow: "inset 0 0 0 2px #0a0a0a",
                              }
                            : trStyle
                        }
                      >
                        {renderRequestRefCell(a)}
                        {renderCustomerCell(a)}
                        {renderServiceCell(a)}
                        {renderConfirmedScheduleCell(a)}
                        <td style={{ ...tdStyle, minWidth: 180 }}>
                          <select
                            style={inputStyle}
                            value={assignmentDrafts[a.id] ?? ""}
                            onChange={(event) =>
                              setAssignmentDrafts((prev) => ({
                                ...prev,
                                [a.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Select staff</option>
                            {assignedStaff.map((staff) => (
                              <option key={staff.id} value={staff.id}>
                                {staff.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td style={tdStyle}>
                          <div style={adminRowActionsStyle}>
                            <button
                              style={btnGhost}
                              disabled={actionLoadingId === a.id}
                              onClick={() => handleAssignStaff(a)}
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
          )}

          {adminActiveTab === "confirmed" && (
          <SectionCard
            title="Confirmed Appointments"
            subtitle="Accepted appointments currently active."
          >
            {filteredAdminConfirmedAppointments.length === 0 ? (
              <p style={emptyStateStyle}>No appointments to show.</p>
            ) : (
              <div style={adminTableScrollStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service</th>
                      <th style={thStyle}>Schedule</th>
                      <th style={thStyle}>Location</th>
                      <th style={thStyle}>Staff</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminConfirmedAppointments.map((a) => (
                      <tr
                        key={a.id}
                        id={`appointment-row-${a.id}`}
                        style={
                          focusedAppointmentId === a.id
                            ? {
                                ...trStyle,
                                boxShadow: "inset 0 0 0 2px #0a0a0a",
                              }
                            : trStyle
                        }
                      >
                        {renderRequestRefCell(a)}
                        {renderCustomerCell(a)}
                        {renderServiceCell(a)}
                        {renderConfirmedScheduleCell(a)}
                        {renderAddressCell(a)}
                        {renderAssignedStaffCell(a)}

                        <td style={tdStyle}>
                          <div style={adminRowActionsStyle}>
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
          )}

          {adminActiveTab === "history" && (
          <SectionCard
            title="Appointment History"
            subtitle="Completed, rejected, and cancelled appointments."
          >
            {filteredAdminClosedAppointments.length === 0 ? (
              <p style={emptyStateStyle}>No appointments to show.</p>
            ) : (
              <div style={adminTableScrollStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={thRowStyle}>
                      <th style={thStyle}>Request</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Service</th>
                      <th style={thStyle}>Schedule</th>
                      <th style={thStyle}>Staff</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminClosedAppointments.map((a) => (
                      <tr
                        key={a.id}
                        id={`appointment-row-${a.id}`}
                        style={
                          focusedAppointmentId === a.id
                            ? {
                                ...trStyle,
                                boxShadow: "inset 0 0 0 2px #0a0a0a",
                              }
                            : trStyle
                        }
                      >
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
          )}

        </>
      )}

      {isIndoorStaff && (
        <>
          <header style={indoorPageHeaderStyle}>
            <h1 style={indoorPageTitleStyle}>My Appointments</h1>
            <p style={indoorPageSubtitleStyle}>
              Review assigned appointments and update work status.
            </p>
          </header>

          <div style={indoorSummaryGridStyle}>
            {staffSummary.map((item, index) => (
              <IndoorSummaryCard
                key={item.label}
                label={item.label}
                count={item.count}
                hint={item.hint}
                emphasized={index === 1}
              />
            ))}
          </div>

          {error ? (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                border: "1px solid #d8a3a3",
                borderRadius: 0,
                background: "#ffffff",
                color: "#991b1b",
                fontSize: 10.5,
                fontWeight: 550,
              }}
            >
              {error}
            </div>
          ) : null}

          {success ? (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                border: "1px solid #d7d8dc",
                borderRadius: 0,
                background: "#fafafa",
                color: "#3f3f46",
                fontSize: 10.5,
                fontWeight: 550,
              }}
            >
              {success}
            </div>
          ) : null}

          <IndoorAppointmentSection
            title="New Assignments"
            subtitle="Appointments waiting for your response."
          >
            {staffNewAssignments.length === 0 ? (
              <div style={indoorEmptyStyle}>No new appointments.</div>
            ) : (
              <div style={indoorAppointmentListStyle}>
                {staffNewAssignments.map((a) => {
                  const scope = cleanIndoorWorkNote(getScope(a));

                  return (
                    <article
                      key={a.id}
                      id={`appointment-row-${a.id}`}
                      style={{
                        ...indoorAppointmentCardStyle,
                        ...(focusedAppointmentId === a.id
                          ? {
                              boxShadow: "inset 0 0 0 2px #18181b",
                            }
                          : {}),
                      }}
                    >
                      <div style={indoorAppointmentHeaderStyle}>
                        <div>
                          <div style={indoorAppointmentRefStyle}>
                            {formatRequestNumber(a.id)}
                          </div>
                          <div style={indoorCustomerStyle}>
                            {a.customer_name || "Customer"}
                          </div>
                        </div>

                        <IndoorStatusBadge status={a.status} />
                      </div>

                      <div style={indoorInfoGridStyle}>
                        <IndoorInfo
                          label="Service"
                          value={humanizePurpose(a.purpose)}
                          important
                        />
                        <IndoorInfo
                          label="Schedule"
                          value={formatDateTime(
                            a.preferred_date || a.scheduled_date,
                          )}
                          important
                        />
                        <IndoorInfo label="Location" value={getAddress(a)} />
                        <IndoorInfo label="Contact" value={getContact(a)} />
                      </div>

                      {scope && scope !== "No additional scope details" ? (
                        <div style={indoorScopeStyle}>
                          <strong style={{ fontWeight: 650, color: "#303034" }}>
                            Work note:
                          </strong>{" "}
                          {scope}
                        </div>
                      ) : null}

                      <div style={indoorActionsStyle}>
                        <button
                          type="button"
                          style={
                            actionLoadingId === a.id
                              ? indoorDisabledButton
                              : indoorPrimaryButton
                          }
                          disabled={actionLoadingId === a.id}
                          onClick={() =>
                            handleAction(
                              a.id,
                              { status: "confirmed" },
                              "Appointment accepted and confirmed.",
                            )
                          }
                        >
                          <CheckCircle2 size={14} />
                          {actionLoadingId === a.id ? "Saving..." : "Accept"}
                        </button>

                        <button
                          type="button"
                          style={
                            actionLoadingId === a.id
                              ? indoorDisabledButton
                              : indoorDangerButton
                          }
                          disabled={actionLoadingId === a.id}
                          onClick={() =>
                            handleAction(
                              a.id,
                              {
                                status: "pending",
                                assigned_staff_id: null,
                              },
                              "Appointment returned to admin for reassignment.",
                            )
                          }
                        >
                          <Ban size={14} />
                          Return to Admin
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </IndoorAppointmentSection>

          <IndoorAppointmentSection
            title="Active Appointments"
            subtitle="Appointments you accepted and are currently handling."
          >
            {staffConfirmedAppointments.length === 0 ? (
              <div style={indoorEmptyStyle}>No active appointments.</div>
            ) : (
              <div style={indoorAppointmentListStyle}>
                {staffConfirmedAppointments.map((a) => {
                  const scope = cleanIndoorWorkNote(getScope(a));

                  return (
                    <article
                      key={a.id}
                      id={`appointment-row-${a.id}`}
                      style={{
                        ...indoorAppointmentCardStyle,
                        ...(focusedAppointmentId === a.id
                          ? {
                              boxShadow: "inset 0 0 0 2px #18181b",
                            }
                          : {}),
                      }}
                    >
                      <div style={indoorAppointmentHeaderStyle}>
                        <div>
                          <div style={indoorAppointmentRefStyle}>
                            {formatRequestNumber(a.id)}
                          </div>
                          <div style={indoorCustomerStyle}>
                            {a.customer_name || "Customer"}
                          </div>
                        </div>

                        <IndoorStatusBadge status={a.status} />
                      </div>

                      <div style={indoorInfoGridStyle}>
                        <IndoorInfo
                          label="Service"
                          value={humanizePurpose(a.purpose)}
                          important
                        />
                        <IndoorInfo
                          label="Schedule"
                          value={formatDateTime(
                            a.scheduled_date || a.preferred_date,
                          )}
                          important
                        />
                        <IndoorInfo label="Location" value={getAddress(a)} />
                        <IndoorInfo label="Contact" value={getContact(a)} />
                      </div>

                      {scope && scope !== "No additional scope details" ? (
                        <div style={indoorScopeStyle}>
                          <strong style={{ fontWeight: 650, color: "#303034" }}>
                            Work note:
                          </strong>{" "}
                          {scope}
                        </div>
                      ) : null}

                      <div style={indoorActionsStyle}>
                        <button
                          type="button"
                          style={
                            actionLoadingId === a.id
                              ? indoorDisabledButton
                              : indoorPrimaryButton
                          }
                          disabled={actionLoadingId === a.id}
                          onClick={() =>
                            handleAction(
                              a.id,
                              { status: "completed" },
                              "Appointment marked as completed.",
                            )
                          }
                        >
                          <Check size={14} />
                          {actionLoadingId === a.id ? "Saving..." : "Mark Done"}
                        </button>

                        <button
                          type="button"
                          style={
                            actionLoadingId === a.id
                              ? indoorDisabledButton
                              : indoorDangerButton
                          }
                          disabled={actionLoadingId === a.id}
                          onClick={() =>
                            handleAction(
                              a.id,
                              { status: "cancelled" },
                              "Appointment cancelled.",
                            )
                          }
                        >
                          <Ban size={14} />
                          Cancel
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </IndoorAppointmentSection>

          <IndoorAppointmentSection
            title="Appointment History"
            subtitle="Completed and closed appointments for reference."
          >
            {staffClosedAppointments.length === 0 ? (
              <div style={indoorEmptyStyle}>No appointment history yet.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={indoorHistoryTableStyle}>
                  <thead>
                    <tr style={indoorHistoryHeadStyle}>
                      <th style={indoorHistoryThStyle}>Appointment</th>
                      <th style={indoorHistoryThStyle}>Customer</th>
                      <th style={indoorHistoryThStyle}>Service</th>
                      <th style={indoorHistoryThStyle}>Schedule</th>
                      <th style={indoorHistoryThStyle}>Location</th>
                      <th style={indoorHistoryThStyle}>Status</th>
                      <th style={indoorHistoryThStyle}>Updated</th>
                    </tr>
                  </thead>

                  <tbody>
                    {[...staffClosedAppointments]
                      .sort(
                        (a, b) =>
                          new Date(
                            b.updated_at || b.scheduled_date || 0,
                          ).getTime() -
                          new Date(
                            a.updated_at || a.scheduled_date || 0,
                          ).getTime(),
                      )
                      .map((a) => (
                        <tr
                          key={a.id}
                          id={`appointment-row-${a.id}`}
                          style={
                            focusedAppointmentId === a.id
                              ? {
                                  boxShadow: "inset 0 0 0 2px #18181b",
                                }
                              : undefined
                          }
                        >
                          <td
                            style={{
                              ...indoorHistoryTdStyle,
                              fontWeight: 750,
                              color: "#18181b",
                            }}
                          >
                            {formatRequestNumber(a.id)}
                          </td>
                          <td
                            style={{
                              ...indoorHistoryTdStyle,
                              fontWeight: 600,
                              color: "#2b2b2f",
                            }}
                          >
                            {a.customer_name || "Customer"}
                          </td>
                          <td style={indoorHistoryTdStyle}>
                            {humanizePurpose(a.purpose)}
                          </td>
                          <td style={indoorHistoryTdStyle}>
                            {formatDateTime(
                              a.scheduled_date || a.preferred_date,
                            )}
                          </td>
                          <td style={indoorHistoryTdStyle}>{getAddress(a)}</td>
                          <td style={indoorHistoryTdStyle}>
                            <IndoorStatusBadge status={a.status} />
                          </td>
                          <td style={indoorHistoryTdStyle}>
                            {formatDateTime(a.updated_at)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </IndoorAppointmentSection>
        </>
      )}
    </div>
  );
}

// ── Reusable Inline Styles ───────────────────────────────────────────────

const adminTabsStyle = {
  display: "flex",
  alignItems: "stretch",
  gap: 0,
  minHeight: 40,
  marginBottom: 10,
  overflowX: "auto",
  borderBottom: "1px solid #d9d9dd",
  scrollbarWidth: "thin",
};

const adminTabButtonStyle = {
  minHeight: 40,
  padding: "8px 13px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flex: "0 0 auto",
  border: 0,
  borderBottom: "2px solid transparent",
  background: "#ffffff",
  color: "#71717a",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const adminTabButtonActiveStyle = {
  ...adminTabButtonStyle,
  color: "#18181b",
  fontWeight: 600,
  borderBottom: "2px solid #18181b",
};

const adminTabCountStyle = {
  color: "#8a8b90",
  fontSize: 10.5,
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
};

const adminModalOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.42)",
};

const adminModalShellStyle = {
  position: "relative",
  width: "min(860px, 100%)",
  maxHeight: "88vh",
  overflowY: "auto",
  background: "#ffffff",
  border: "1px solid #d4d4d8",
};

const adminModalCloseStyle = {
  position: "absolute",
  top: 9,
  right: 10,
  zIndex: 2,
  width: 32,
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d4d4d8",
  borderRadius: 0,
  background: "#ffffff",
  color: "#52525b",
  fontFamily: "inherit",
  fontSize: 20,
  fontWeight: 400,
  lineHeight: 1,
  cursor: "pointer",
};

const adminToolbarStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  padding: "10px 12px",
  marginBottom: 12,
  background: "#ffffff",
  border: "1px solid #e4e4e7",
};

const adminSearchWrapStyle = {
  position: "relative",
  flex: "0 1 360px",
  width: 360,
  maxWidth: "100%",
};

const adminSearchIconStyle = {
  position: "absolute",
  left: 11,
  top: "50%",
  transform: "translateY(-50%)",
  color: "#71717a",
  pointerEvents: "none",
};

const adminSearchStyle = {
  ...inputStyle,
  width: "100%",
  paddingLeft: 34,
};

const adminFilterSelectStyle = {
  ...inputStyle,
  flex: "0 0 170px",
  width: 170,
};

const adminResultCountStyle = {
  marginLeft: "auto",
  paddingRight: 2,
  color: "#71717a",
  fontSize: 11,
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};
const adminPageStyle = {
  width: "min(100%, 1480px)",
  maxWidth: 1480,
  margin: "0 auto",
  color: "#18181b",
  fontVariantNumeric: "tabular-nums",
};

const adminTableScrollStyle = {
  width: "100%",
  maxHeight: "calc(100vh - 320px)",
  overflow: "auto",
};

const adminRowActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexWrap: "nowrap",
  whiteSpace: "nowrap",
};

const btnPrimary = {
  minHeight: 36,
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  border: "1px solid #18181b",
  borderRadius: 0,
  background: "#18181b",
  color: "#ffffff",
  fontFamily: "inherit",
  fontSize: 12,
  lineHeight: 1,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnGhost = {
  minHeight: 34,
  padding: "0 11px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  border: "1px solid #d4d4d8",
  borderRadius: 0,
  background: "#ffffff",
  color: "#18181b",
  fontFamily: "inherit",
  fontSize: 11.5,
  lineHeight: 1,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnDanger = {
  minHeight: 34,
  padding: "0 11px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  border: "1px solid #efb6b6",
  borderRadius: 0,
  background: "#ffffff",
  color: "#991b1b",
  fontFamily: "inherit",
  fontSize: 11.5,
  lineHeight: 1,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const tableStyle = {
  width: "100%",
  minWidth: 1040,
  borderCollapse: "collapse",
  fontSize: 12.5,
  fontVariantNumeric: "tabular-nums",
};

const thRowStyle = {
  background: "#fafafa",
  borderBottom: "1px solid #e4e4e7",
};

const thStyle = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  padding: "11px 12px",
  background: "#fafafa",
  color: "#71717a",
  textAlign: "left",
  fontSize: 9.5,
  fontWeight: 600,
  lineHeight: 1.3,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const trStyle = {
  borderBottom: "1px solid #eeeeef",
  background: "#ffffff",
};

const tdStyle = {
  padding: "12px 12px",
  color: "#3f3f46",
  fontSize: 12.5,
  fontWeight: 400,
  lineHeight: 1.35,
  fontVariantNumeric: "tabular-nums",
  verticalAlign: "middle",
};
