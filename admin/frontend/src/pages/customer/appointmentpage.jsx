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

const PURPOSE_META = {
  consultation: {
    title: "Consultation",
    desc: "Discuss your furniture requirements, ideas, and project scope.",
  },
  site_measurement: {
    title: "Site Measurement",
    desc: "Request an on-site visit so staff can inspect and measure the area.",
  },
};

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
          <span className="appt-eyebrow">Customer Service</span>
          <h1>Request an Appointment</h1>
          <p>
            Book a consultation or site measurement. Our team will review your
            request and confirm the final schedule.
          </p>
        </div>
      </div>

      <div className="appt-layout">
        <div className="appt-form-col">
          <div className="appt-card">
            {submitted ? (
              <div className="appt-success">
                <div className="appt-success-icon">
                  <CheckCircle size={42} strokeWidth={1.5} />
                </div>

                <div className="appt-success-copy">
                  <span className="appt-success-eyebrow">
                    Request Submitted
                  </span>
                  <h2>Appointment request sent successfully</h2>
                  <p>
                    Our staff will review your request, assign the appropriate
                    team member, and confirm the schedule with you.
                  </p>
                </div>

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

                <button
                  type="button"
                  className="appt-btn-secondary"
                  onClick={resetForm}
                >
                  Submit Another Request
                </button>
              </div>
            ) : (
              <>
                <div className="appt-card-header">
                  <span className="appt-section-kicker">Appointment Form</span>
                  <h2>Appointment Request Details</h2>
                  <p>
                    Consultation and site measurement requests can be submitted
                    online. Installation scheduling is arranged by staff after
                    order confirmation.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="appt-form">
                  <section className="appt-form-section">
                    <div className="appt-section-head">
                      <h3>Appointment Type</h3>
                      <p>Select one option.</p>
                    </div>

                    <div className="appt-purpose-grid">
                      {PURPOSE_OPTIONS.map((item) => {
                        const isActive = purpose === item.value;
                        const meta = PURPOSE_META[item.value];

                        return (
                          <button
                            key={item.value}
                            type="button"
                            className={`appt-purpose-option ${isActive ? "active" : ""}`}
                            onClick={() => setPurpose(item.value)}
                          >
                            <span className="appt-purpose-title">
                              {meta?.title || item.label}
                            </span>
                            <span className="appt-purpose-desc">
                              {meta?.desc || ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="appt-form-section">
                    <div className="appt-section-head">
                      <h3>Project Details</h3>
                      <p>
                        Describe the furniture or service you need so our staff
                        can review it properly.
                      </p>
                    </div>

                    <div className="appt-field">
                      <label className="appt-label">
                        <FileText size={14} /> Project Description{" "}
                        <span className="appt-required">*</span>
                      </label>
                      <textarea
                        className="appt-textarea appt-textarea-lg"
                        placeholder="e.g. 3-door wardrobe with mirror, kitchen cabinet set, floating shelves..."
                        value={project_description}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        rows={4}
                        maxLength={500}
                      />
                      <div className="appt-char-count">
                        {project_description.length}/500
                      </div>
                    </div>

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
                        rows={3}
                        maxLength={300}
                      />
                    </div>
                  </section>

                  <section className="appt-form-section">
                    <div className="appt-section-head">
                      <h3>Preferred Schedule</h3>
                      <p>
                        Choose your preferred schedule. Staff may confirm the
                        closest available slot.
                      </p>
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
                        <input
                          type="time"
                          className="appt-input appt-time-input"
                          value={preferred_time}
                          onChange={(e) => setPreferredTime(e.target.value)}
                          step="60"
                        />
                      </div>
                    </div>

                    <div className="appt-field-help">
                      Enter your preferred time. Staff will confirm the final
                      available schedule.
                    </div>
                  </section>

                  <section className="appt-form-section">
                    <div className="appt-section-head">
                      <h3>Contact Information</h3>
                      <p>
                        We will use this information to confirm the appointment
                        or suggest an adjustment if needed.
                      </p>
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
                          rows={3}
                          maxLength={300}
                        />
                      </div>
                    )}
                  </section>

                  {error && <div className="appt-error">{error}</div>}

                  <div className="appt-form-actions">
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
                  </div>
                </form>
              </>
            )}
          </div>
        </div>

        <div className="appt-info-col">
          <div className="appt-card appt-info-card">
            <div className="appt-side-header">
              <span className="appt-section-kicker">Process</span>
              <h3>What to Expect</h3>
            </div>

            <div className="appt-steps">
              <div className="appt-step">
                <div className="appt-step-num">1</div>
                <div>
                  <strong>Submit Request</strong>
                  <p>
                    Choose the appointment type, add your project details, and
                    send your preferred schedule.
                  </p>
                </div>
              </div>

              <div className="appt-step">
                <div className="appt-step-num">2</div>
                <div>
                  <strong>Staff Review</strong>
                  <p>
                    Our team reviews your request and checks availability before
                    assigning the appropriate staff member.
                  </p>
                </div>
              </div>

              <div className="appt-step">
                <div className="appt-step-num">3</div>
                <div>
                  <strong>Confirmation</strong>
                  <p>
                    Once confirmed, you will receive the final appointment
                    schedule from our staff.
                  </p>
                </div>
              </div>
            </div>

            <div className="appt-note-box">
              Consultation and site measurement requests are reviewed manually.
              Installation scheduling is handled by staff after order
              confirmation.
            </div>

            <div className="appt-hours">
              <div className="appt-hours-title">Available Hours</div>
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
            <div className="appt-side-header">
              <span className="appt-section-kicker">History</span>
              <h3 className="appt-my-title">My Appointments</h3>
            </div>

            {loadingAppts ? (
              <div className="appt-loading">
                <div className="appt-spinner" /> Loading…
              </div>
            ) : appointments.length === 0 ? (
              <div className="appt-empty">
                <Calendar size={30} strokeWidth={1} />
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
                        <div className="appt-item-body">
                          {details.projectDescription}
                        </div>
                      )}

                      {a.assigned_to_name && (
                        <div className="appt-item-assigned">
                          Assigned Staff: {a.assigned_to_name}
                        </div>
                      )}

                      {a.status === "pending" && (
                        <button
                          type="button"
                          className="appt-btn-cancel"
                          onClick={() => handleCancel(a.id)}
                        >
                          <X size={12} /> Cancel Request
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