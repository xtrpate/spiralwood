import { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  Phone,
  FileText,
  CheckCircle,
  MapPin,
  UserCheck,
  X,
} from "lucide-react";
import useAuthStore from "../../store/authStore";
import api from "../../services/api";
import "./appointmentpage.css";

const getMinDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

const PURPOSE_OPTIONS = [
  { value: "consultation", label: "Consultation" },
  { value: "site_measurement", label: "Site Measurement" },
];

const getPurposeLabel = (value) => {
  const match = PURPOSE_OPTIONS.find((item) => item.value === value);
  if (match) return match.label;

  if (value === "done") return "Completed";
  if (!value) return "—";

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const StatusBadge = ({ status }) => {
  const map = {
    pending: { cls: "appt-badge-pending", label: "Pending" },
    confirmed: { cls: "appt-badge-confirmed", label: "Confirmed" },
    done: { cls: "appt-badge-completed", label: "Completed" },
    cancelled: { cls: "appt-badge-cancelled", label: "Cancelled" },
  };

  const { cls, label } = map[status] || {
    cls: "appt-badge-pending",
    label: getPurposeLabel(status),
  };

  return <span className={`appt-status-badge ${cls}`}>{label}</span>;
};

const TIME_SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
];

const formatTime = (t) => {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
};

const formatDate = (str) => {
  if (!str) return "—";
  const d = new Date(str);
  return d.toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatDateTime = (str) => {
  if (!str) return "—";
  const d = new Date(str);
  return (
    d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " at " +
    d.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
};

const parseNotes = (notes) => {
  const details = {
    projectDescription: "",
    contact: "",
    address: "",
    customerNotes: "",
  };

  String(notes || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
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

export default function AppointmentPage() {
  const { user } = useAuthStore();

  const [purpose, setPurpose] = useState("consultation");
  const [project_description, setProjectDescription] = useState("");
  const [preferred_date, setPreferredDate] = useState("");
  const [preferred_time, setPreferredTime] = useState("");
  const [contact_number, setContactNumber] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [appointments, setAppointments] = useState([]);
  const [loadingAppts, setLoadingAppts] = useState(true);

  useEffect(() => {
    setContactNumber(user?.phone || "");
    setAddress(user?.address || "");
  }, [user]);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    setLoadingAppts(true);
    try {
      const res = await api.get("/customer/appointments");
      setAppointments(Array.isArray(res.data) ? res.data : []);
    } catch {
      setAppointments([]);
    } finally {
      setLoadingAppts(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!purpose) return setError("Please select an appointment type.");
    if (!project_description.trim()) {
      return setError("Please describe your project.");
    }
    if (!preferred_date) return setError("Please select a preferred date.");
    if (!preferred_time) return setError("Please select a preferred time.");
    if (!contact_number.trim()) {
      return setError("Please enter a contact number.");
    }
    if (purpose === "site_measurement" && !address.trim()) {
      return setError("Please enter the full address for site measurement.");
    }

    setSubmitting(true);
    try {
      await api.post("/customer/appointments", {
        purpose,
        project_description: project_description.trim(),
        preferred_date,
        preferred_time,
        contact_number: contact_number.trim(),
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setSubmitted(true);
      await fetchAppointments();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("Cancel this appointment request?")) return;

    try {
      await api.delete(`/customer/appointments/${id}`);
      await fetchAppointments();
    } catch (err) {
      alert(
        err.response?.data?.message || "Could not cancel appointment request.",
      );
    }
  };

  const resetForm = () => {
    setPurpose("consultation");
    setProjectDescription("");
    setPreferredDate("");
    setPreferredTime("");
    setContactNumber(user?.phone || "");
    setAddress(user?.address || "");
    setNotes("");
    setSubmitted(false);
    setError("");
  };

  return (
    <div className="appt-page">
      <div className="appt-hero">
        <div className="appt-hero-text">
          <h1>Request Appointment</h1>
          <p>
            Submit a consultation or site measurement request and our staff will
            review and confirm the schedule.
          </p>
        </div>
      </div>

      <div className="appt-layout">
        <div className="appt-form-col">
          <div className="appt-card">
            {submitted ? (
              <div className="appt-success">
                <div className="appt-success-icon">
                  <CheckCircle size={52} strokeWidth={1.5} />
                </div>
                <h2>Appointment Request Submitted!</h2>
                <p>
                  Your request has been sent to our staff. We will review it,
                  assign a staff member, and confirm the schedule.
                </p>

                <div className="appt-success-details">
                  <div className="appt-success-row">
                    <UserCheck size={15} />
                    <span>{getPurposeLabel(purpose)}</span>
                  </div>
                  <div className="appt-success-row">
                    <Calendar size={15} />
                    <span>{formatDate(preferred_date)}</span>
                  </div>
                  <div className="appt-success-row">
                    <Clock size={15} />
                    <span>{formatTime(preferred_time)}</span>
                  </div>
                  <div className="appt-success-row">
                    <FileText size={15} />
                    <span>{project_description}</span>
                  </div>
                </div>

                <button className="appt-btn-primary" onClick={resetForm}>
                  Submit Another Request
                </button>
              </div>
            ) : (
              <>
                <div className="appt-card-header">
                  <h2>Appointment Request Details</h2>
                  <p>
                    Online requests are for Consultation and Site Measurement
                    only. Installation schedules are arranged by staff after
                    order confirmation.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="appt-form">
                  <div className="appt-field">
                    <label className="appt-label">
                      <UserCheck size={14} /> Appointment Type{" "}
                      <span className="appt-required">*</span>
                    </label>
                    <select
                      className="appt-input"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                    >
                      {PURPOSE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="appt-field">
                    <label className="appt-label">
                      <FileText size={14} /> Project Description{" "}
                      <span className="appt-required">*</span>
                    </label>
                    <textarea
                      className="appt-textarea"
                      placeholder="e.g. 3-door wardrobe with mirror, kitchen cabinet set, floating shelves..."
                      value={project_description}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      rows={3}
                      maxLength={500}
                    />
                    <div className="appt-char-count">
                      {project_description.length}/500
                    </div>
                  </div>

                  <div className="appt-row">
                    <div className="appt-field">
                      <label className="appt-label">
                        <Calendar size={14} /> Preferred Date{" "}
                        <span className="appt-required">*</span>
                      </label>
                      <input
                        type="date"
                        className="appt-input"
                        min={getMinDate()}
                        value={preferred_date}
                        onChange={(e) => setPreferredDate(e.target.value)}
                      />
                    </div>

                    <div className="appt-field">
                      <label className="appt-label">
                        <Clock size={14} /> Preferred Time{" "}
                        <span className="appt-required">*</span>
                      </label>
                      <div className="appt-time-grid">
                        {TIME_SLOTS.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={`appt-time-slot ${preferred_time === t ? "active" : ""}`}
                            onClick={() => setPreferredTime(t)}
                          >
                            {formatTime(t)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="appt-field">
                    <label className="appt-label">
                      <Phone size={14} /> Contact Number{" "}
                      <span className="appt-required">*</span>
                    </label>
                    <input
                      type="tel"
                      className="appt-input"
                      placeholder="e.g. 09171234567"
                      value={contact_number}
                      onChange={(e) => setContactNumber(e.target.value)}
                      maxLength={20}
                    />
                  </div>

                  {purpose === "site_measurement" && (
                    <div className="appt-field">
                      <label className="appt-label">
                        <MapPin size={14} /> Site Address{" "}
                        <span className="appt-required">*</span>
                      </label>
                      <textarea
                        className="appt-textarea"
                        placeholder="Enter the full address where the measurement will take place."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        rows={2}
                        maxLength={300}
                      />
                    </div>
                  )}

                  <div className="appt-field">
                    <label className="appt-label">
                      Additional Notes{" "}
                      <span className="appt-optional">(optional)</span>
                    </label>
                    <textarea
                      className="appt-textarea"
                      placeholder="Any extra details, style preferences, dimensions, or questions..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      maxLength={300}
                    />
                  </div>

                  {error && <div className="appt-error">{error}</div>}

                  <button
                    type="submit"
                    className="appt-btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <span className="appt-spinner" /> Submitting…
                      </>
                    ) : (
                      "Submit Request"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        <div className="appt-info-col">
          <div className="appt-card appt-info-card">
            <h3>What to Expect</h3>

            <div className="appt-steps">
              <div className="appt-step">
                <div className="appt-step-num">1</div>
                <div>
                  <strong>Submit Request</strong>
                  <p>
                    Choose Consultation or Site Measurement, then enter your
                    project details and preferred schedule.
                  </p>
                </div>
              </div>

              <div className="appt-step">
                <div className="appt-step-num">2</div>
                <div>
                  <strong>Staff Review</strong>
                  <p>
                    Our team checks your request, assigns a staff member, and
                    reviews the preferred schedule.
                  </p>
                </div>
              </div>

              <div className="appt-step">
                <div className="appt-step-num">3</div>
                <div>
                  <strong>Confirmation</strong>
                  <p>
                    Once confirmed, the assigned staff member will handle your
                    appointment.
                  </p>
                </div>
              </div>
            </div>

            <div className="appt-hours">
              <div className="appt-hours-title">📅 Available Hours</div>
              <div className="appt-hours-row">
                <span>Monday – Friday</span>
                <span>8:00 AM – 5:00 PM</span>
              </div>
              <div className="appt-hours-row">
                <span>Saturday</span>
                <span>8:00 AM – 12:00 PM</span>
              </div>
              <div className="appt-hours-row closed">
                <span>Sunday</span>
                <span>Closed</span>
              </div>
            </div>
          </div>

          <div className="appt-card">
            <h3 className="appt-my-title">My Appointments</h3>

            {loadingAppts ? (
              <div className="appt-loading">
                <div className="appt-spinner" /> Loading…
              </div>
            ) : appointments.length === 0 ? (
              <div className="appt-empty">
                <Calendar size={32} strokeWidth={1} />
                <p>No appointments yet</p>
              </div>
            ) : (
              <div className="appt-list">
                {appointments.map((a) => {
                  const details = parseNotes(a.notes);

                  return (
                    <div key={a.id} className="appt-item">
                      <div className="appt-item-top">
                        <div className="appt-item-purpose">
                          {getPurposeLabel(a.purpose)}
                        </div>
                        <StatusBadge status={a.status} />
                      </div>

                      <div className="appt-item-meta">
                        <span>
                          <Calendar size={12} />{" "}
                          {formatDateTime(a.scheduled_date)}
                        </span>
                      </div>

                      {details.projectDescription && (
                        <div
                          style={{ fontSize: 13, color: "#555", marginTop: 6 }}
                        >
                          {details.projectDescription}
                        </div>
                      )}

                      {a.assigned_to_name && (
                        <div
                          style={{ fontSize: 12, color: "#666", marginTop: 6 }}
                        >
                          Assigned Staff: {a.assigned_to_name}
                        </div>
                      )}

                      {a.status === "pending" && (
                        <button
                          className="appt-btn-cancel"
                          onClick={() => handleCancel(a.id)}
                        >
                          <X size={12} /> Cancel
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}