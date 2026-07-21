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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import useAuthStore from "../../store/authStore";
import api from "../../services/api";
import "./appointmentpage.css";

// Helper: Get tomorrow's date as YYYY-MM-DD
const getMinDateYMD = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
};

// Helper: Format Date to YYYY-MM-DD
const toYMD = (dateObj) => {
  const yr = dateObj.getFullYear();
  const mo = String(dateObj.getMonth() + 1).padStart(2, "0");
  const da = String(dateObj.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
};

// Helper: Get the Monday of a given date's week
const getStartOfWeek = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  // Adjust so week starts on Monday
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
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

// The 4 specific slots requested
const TIME_SLOTS = ["09:00", "11:00", "13:00", "15:00"];

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

const formatTimeForDisplay = (t) => {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  return `${hr > 12 ? hr - 12 : hr === 0 ? 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
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

  // New Calendar State for Weekly View
  const [weekStart, setWeekStart] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getStartOfWeek(tomorrow);
  });

  const [bookedSlots, setBookedSlots] = useState({});
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    setAddress(user?.address || "");
  }, [user]);

  useEffect(() => {
    fetchAppointments();
  }, []);

  // Fetch the whole week's availability when the week view changes
  useEffect(() => {
    const fetchWeeklyAvailability = async () => {
      setLoadingSlots(true);
      try {
        const days = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          return toYMD(d);
        });

        // Ping the backend for all 7 days simultaneously
        const promises = days.map((dateStr) =>
          api.get(`/customer/appointments/availability?date=${dateStr}`),
        );
        const results = await Promise.all(promises);

        const newBooked = {};
        days.forEach((dateStr, i) => {
          newBooked[dateStr] = results[i].data.booked || [];
        });

        setBookedSlots(newBooked);
      } catch (err) {
        console.error("Failed to fetch weekly slots", err);
        setBookedSlots({});
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchWeeklyAvailability();
  }, [weekStart]);

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
    if (!project_description.trim())
      return setError("Please describe your project.");
    if (!preferred_date || !preferred_time)
      return setError("Please select an available schedule from the calendar.");

    const cleanedContact = contact_number.trim();
    if (!cleanedContact) {
      return setError("Please enter a contact number.");
    }
    if (!/^09\d{9}$/.test(cleanedContact)) {
      return setError("Contact number must be 11 digits.");
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
        contact_number: cleanedContact,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setSubmitted(true);
      await fetchAppointments();

      // Refresh current week's calendar blocks
      setWeekStart(new Date(weekStart));
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
      // Re-fetch availability for the current week view
      setWeekStart(new Date(weekStart));
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
    setContactNumber("");
    setAddress(user?.address || "");
    setNotes("");
    setSubmitted(false);
    setError("");
  };

  // Generate the 7 Date objects for the current viewed week
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const nextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
    setPreferredDate(""); // Reset selection if they change weeks
    setPreferredTime("");
  };

  const prevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);

    // Check if the Sunday of the previous week is already fully in the past
    const sundayOfPrevWeek = new Date(prev);
    sundayOfPrevWeek.setDate(sundayOfPrevWeek.getDate() + 6);
    if (toYMD(sundayOfPrevWeek) < getMinDateYMD()) return;

    setWeekStart(prev);
    setPreferredDate(""); // Reset selection if they change weeks
    setPreferredTime("");
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
                    <span>
                      {new Date(preferred_date).toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="appt-success-row">
                    <Clock size={15} />
                    <span>{formatTimeForDisplay(preferred_time)}</span>
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

                  {/* WEEKLY PLANNER SECTION */}
                  <section className="appt-form-section">
                    <div className="appt-section-head weekly-section-head">
                      <div>
                        <h3>Preferred Schedule</h3>
                        <p>Select an available time slot below.</p>
                      </div>
                      <div className="weekly-nav-controls">
                        <button
                          type="button"
                          onClick={prevWeek}
                          className="weekly-nav-btn"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <span className="weekly-nav-label">
                          {weekDays[0].toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          -{" "}
                          {weekDays[6].toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={nextWeek}
                          className="weekly-nav-btn"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="weekly-planner-wrapper">
                      {loadingSlots && (
                        <div className="weekly-loading-overlay">
                          Loading calendar...
                        </div>
                      )}

                      <div className="weekly-grid">
                        {weekDays.map((dateObj, dayIndex) => {
                          const dateStr = toYMD(dateObj);
                          const isPast = dateStr < getMinDateYMD();
                          const isSunday = dateObj.getDay() === 0;
                          const dailyBookings = bookedSlots[dateStr] || [];

                          return (
                            <div
                              key={dateStr}
                              className={`weekly-col color-${dayIndex}`}
                            >
                              <div className="weekly-col-header">
                                <div className="weekly-day">
                                  {dateObj
                                    .toLocaleDateString("en-US", {
                                      weekday: "long",
                                    })
                                    .toUpperCase()}
                                </div>
                                <div className="weekly-date">
                                  {dateObj.getDate()}
                                </div>
                              </div>

                              <div className="weekly-slots-container">
                                {TIME_SLOTS.map((time) => {
                                  const isSelected =
                                    preferred_date === dateStr &&
                                    preferred_time === time;

                                  // Block if past, sunday, or already booked.
                                  // (Also block Saturday afternoon slots if needed based on store hours)
                                  const isSaturdayAfternoon =
                                    dateObj.getDay() === 6 &&
                                    (time === "13:00" || time === "15:00");
                                  const isUnavailable =
                                    isPast ||
                                    isSunday ||
                                    isSaturdayAfternoon ||
                                    dailyBookings.includes(time);

                                  return (
                                    <button
                                      key={`${dateStr}-${time}`}
                                      type="button"
                                      disabled={isUnavailable}
                                      onClick={() => {
                                        setPreferredDate(dateStr);
                                        setPreferredTime(time);
                                      }}
                                      className={`weekly-slot-box ${isUnavailable ? "unavailable" : "available"} ${isSelected ? "selected" : ""}`}
                                    >
                                      <div className="slot-time">
                                        {formatTimeForDisplay(time)}
                                      </div>
                                      <div className="slot-status">
                                        {isUnavailable
                                          ? "Unavailable"
                                          : "Available"}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {preferred_date && preferred_time && (
                      <div className="weekly-selection-feedback">
                        Selected Schedule:{" "}
                        <strong>
                          {new Date(preferred_date).toLocaleDateString(
                            "en-US",
                            { month: "long", day: "numeric", year: "numeric" },
                          )}{" "}
                          at {formatTimeForDisplay(preferred_time)}
                        </strong>
                      </div>
                    )}
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
                        value={contact_number}
                        placeholder="09XXXXXXXXX"
                        maxLength={11}
                        onChange={(e) => {
                          const onlyNums = e.target.value.replace(
                            /[^0-9]/g,
                            "",
                          );
                          if (onlyNums.length <= 11) {
                            setContactNumber(onlyNums);
                          }
                        }}
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
                <div>
                  <strong>1. Submit Request</strong>
                  <p>
                    Choose the appointment type, add your project details, and
                    send your preferred schedule.
                  </p>
                </div>
              </div>

              <div className="appt-step">
                <div>
                  <strong>2. Staff Review</strong>
                  <p>
                    Our team reviews your request and checks availability before
                    assigning the appropriate staff member.
                  </p>
                </div>
              </div>

              <div className="appt-step">
                <div>
                  <strong>3. Confirmation</strong>
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
