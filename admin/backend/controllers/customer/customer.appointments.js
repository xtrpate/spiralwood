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
    const [existing] = await db.execute(
      `
      SELECT id
      FROM appointments
      WHERE customer_id = ?
        AND purpose = ?
        AND scheduled_date = ?
        AND status IN ('pending', 'confirmed')
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

    // FIXED: Removed provider_id and request_owner_id.
    // We only insert what we know exists in the schema.
    const [result] = await db.execute(
      `
      INSERT INTO appointments
        (
          order_id,
          customer_id,
          handled_by,
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
    // FIXED: Query based directly on a.customer_id instead of joining orders.
    // Changed a.assigned_to to a.handled_by based on standard schema.
    const [rows] = await db.execute(
      `
      SELECT
        a.id,
        a.order_id,
        a.purpose,
        a.scheduled_date,
        a.preferred_date,
        a.status,
        a.notes,
        a.updated_at AS created_at,
        u.name AS assigned_to_name,
        o.order_number
      FROM appointments a
      LEFT JOIN users u ON u.id = a.handled_by
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
    const [rows] = await db.execute(
      `
      SELECT id, customer_id, status
      FROM appointments
      WHERE id = ?
      LIMIT 1
      `,
      [req.params.id],
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

    if (appointment.status !== "pending") {
      return res.status(400).json({
        message: "Only pending appointment requests can be cancelled.",
      });
    }

    await db.execute(
      `UPDATE appointments SET status = 'cancelled' WHERE id = ?`,
      [req.params.id],
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
