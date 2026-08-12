// controllers/customer/customer.appointments.js
const db = require("../../config/db");

const ALLOWED_PURPOSES = new Set(["consultation", "site_measurement"]);

const normalizeText = (value) => String(value || "").trim();

const buildScheduledDate = (preferredDate, preferredTime) =>
  `${preferredDate} ${preferredTime}:00`;

const buildNotesBlock = ({
  project_description,
  contact_number,
  address,
  notes,
}) => {
  const lines = [];

  if (project_description)
    lines.push(`Project Description: ${project_description}`);
  if (contact_number) lines.push(`Contact: ${contact_number}`);
  if (address) lines.push(`Address: ${address}`);
  if (notes) lines.push(`Customer Notes: ${notes}`);

  return lines.join("\n") || null;
};

/* ── Create Appointment ── */
exports.createAppointment = async (req, res) => {
  const purpose = normalizeText(req.body.purpose).toLowerCase();
  const preferred_date = normalizeText(req.body.preferred_date);
  const preferred_time = normalizeText(req.body.preferred_time);
  const contact_number = normalizeText(req.body.contact_number);
  const project_description = normalizeText(req.body.project_description);
  const address = normalizeText(req.body.address);
  const notes = normalizeText(req.body.notes);

  if (!ALLOWED_PURPOSES.has(purpose)) {
    return res.status(400).json({
      message:
        "Only Consultation and Site Measurement can be requested online.",
    });
  }

  if (!project_description) {
    return res.status(400).json({
      message: "Project description is required.",
    });
  }

  if (!preferred_date || !preferred_time) {
    return res.status(400).json({
      message: "Preferred date and time are required.",
    });
  }

  if (!contact_number) {
    return res.status(400).json({
      message: "Contact number is required.",
    });
  }

  if (purpose === "site_measurement" && !address) {
    return res.status(400).json({
      message: "Address is required for site measurement requests.",
    });
  }

  const scheduled_date = buildScheduledDate(preferred_date, preferred_time);
  const preferred_schedule = buildScheduledDate(preferred_date, preferred_time);

  const fullNotes = buildNotesBlock({
    project_description,
    contact_number,
    address,
    notes,
  });

  try {
    // ── FIXED: Switched to .query ──
    const [existing] = await db.query(
      `
      SELECT id
      FROM appointments
      WHERE customer_id = ?
        AND purpose = ?
        AND scheduled_date = ?
        AND status IN (
    'pending',
    'awaiting_staff_acceptance',
    'confirmed'
)
      LIMIT 1
      `,
      [req.user.id, purpose, scheduled_date],
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message:
          "You already have an active appointment request for that schedule.",
      });
    }

    // ── FIXED: Switched to .query ──
    const [result] = await db.query(
      `
      INSERT INTO appointments
        (
          order_id,
          customer_id,
          reviewed_by,
          purpose,
          scheduled_date,
          preferred_date,
          status,
          notes
        )
      VALUES
        (NULL, ?, NULL, ?, ?, ?, 'pending', ?)
      `,
      [req.user.id, purpose, scheduled_date, preferred_schedule, fullNotes],
    );

    return res.status(201).json({
      message: "Appointment request submitted successfully.",
      appointment_id: result.insertId,
    });
  } catch (err) {
    console.error("[customer.appointments POST]", err);
    return res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  }
};

/* ── Get Appointments ── */
exports.getAppointments = async (req, res) => {
  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      `
      SELECT
        a.id,
        a.order_id,
        a.purpose,
        a.scheduled_date,
        a.preferred_date,
        a.status,
        a.notes,
        a.created_at,
        u.name AS assigned_to_name,
        o.order_number
      FROM appointments a
      LEFT JOIN users u ON u.id = a.assigned_staff_id
      LEFT JOIN orders o ON o.id = a.order_id
      WHERE a.customer_id = ?
      ORDER BY a.updated_at DESC, a.id DESC
      `,
      [req.user.id],
    );

    return res.json(rows);
  } catch (err) {
    console.error("[customer.appointments GET]", err);
    return res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  }
};

/* ── Cancel Appointment ── */
exports.cancelAppointment = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and added parseInt to req.params.id ──
    const [rows] = await db.query(
      `
      SELECT id, customer_id, status
      FROM appointments
      WHERE id = ?
      LIMIT 1
      `,
      [parseInt(req.params.id)],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    const appointment = rows[0];

    if (String(appointment.customer_id) !== String(req.user.id)) {
      return res.status(403).json({
        message: "You can only cancel your own appointment requests.",
      });
    }

    const cancellableStatuses = ["pending", "awaiting_staff_acceptance"];

    if (!cancellableStatuses.includes(appointment.status)) {
      return res.status(400).json({
        message: "This appointment can no longer be cancelled online.",
      });
    }

    await db.query(
      `UPDATE appointments SET status = 'cancelled' WHERE id = ?`,
      [parseInt(req.params.id)],
    );

    return res.json({ message: "Appointment request cancelled." });
  } catch (err) {
    console.error("[customer.appointments DELETE]", err);
    return res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  }
};

/* ── Check Availability ── */
exports.getAvailability = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "Date is required." });

    // Fetch all pending/confirmed appointments for the chosen date
    const [rows] = await db.query(
      `
      SELECT TIME(scheduled_date) as booked_time
      FROM appointments
      WHERE DATE(scheduled_date) = ?
  AND status IN (
      'pending',
      'awaiting_staff_acceptance',
      'confirmed'
  )
      `,
      [date],
    );

    // Format times into HH:mm (e.g., "09:00")
    const bookedSlots = rows
      .map((r) => {
        const timeStr = r.booked_time;
        return timeStr ? timeStr.substring(0, 5) : null;
      })
      .filter(Boolean);

    return res.json({ booked: bookedSlots });
  } catch (err) {
    console.error("[customer.appointments AVAILABILITY]", err);
    return res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  }
};

/* ── Check Weekly Availability ── */
exports.getWeeklyAvailability = async (req, res) => {
  try {
    const { start } = req.query;

    if (!start) {
      return res.status(400).json({
        message: "Start date is required.",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        DATE(scheduled_date) AS booked_date,
        TIME(scheduled_date) AS booked_time
      FROM appointments
      WHERE DATE(scheduled_date) BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
        AND status IN (
          'pending',
          'awaiting_staff_acceptance',
          'confirmed'
        )
      `,
      [start, start],
    );

    const result = {};

    // Always return all 7 days, even when there are no bookings.
    for (let i = 0; i < 7; i++) {
      const date = new Date(`${start}T00:00:00`);
      date.setDate(date.getDate() + i);

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");

      result[`${year}-${month}-${day}`] = [];
    }

    rows.forEach((row) => {
      const dateKey = row.booked_date
        ? new Date(row.booked_date).toISOString().slice(0, 10)
        : null;

      const timeValue = row.booked_time
        ? String(row.booked_time).substring(0, 5)
        : null;

      if (dateKey && timeValue && result[dateKey]) {
        result[dateKey].push(timeValue);
      }
    });

    return res.json(result);
  } catch (err) {
    console.error("[customer.appointments WEEKLY AVAILABILITY]", err);

    return res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  }
};
