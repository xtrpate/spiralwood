// controllers/customer/customer.appointments.js
const db = require("../../config/db");
const { createNotificationSafe } = require("../../utils/notificationHelper");
const { writeAuditLogSafe } = require("../../middleware/auditLog");

const ALLOWED_PURPOSES = new Set(["consultation", "site_measurement"]);

const ALLOWED_TIME_SLOTS = new Set(["09:00", "11:00", "13:00", "15:00"]);

const MAX_PROJECT_DESCRIPTION_LENGTH = 500;
const MAX_NOTES_LENGTH = 300;
const MAX_ADDRESS_LENGTH = 300;

const normalizeText = (value) => String(value || "").trim();

const isValidYMDDate = (value) => {
  const raw = normalizeText(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return false;
  }

  const [year, month, day] = raw.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const getTodayYMDManila = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

const getDayOfWeekFromYMD = (value) => {
  if (!isValidYMDDate(value)) return null;

  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const isTomorrowOrLater = (value) => {
  if (!isValidYMDDate(value)) return false;

  const today = getTodayYMDManila();

  return value > today;
};

const isAllowedAppointmentTimeForDate = (date, time) => {
  if (!ALLOWED_TIME_SLOTS.has(time)) {
    return false;
  }

  const dayOfWeek = getDayOfWeekFromYMD(date);

  if (dayOfWeek === null) {
    return false;
  }

  // Sunday is closed.
  if (dayOfWeek === 0) {
    return false;
  }

  // Saturday only allows 9:00 AM and 11:00 AM.
  if (dayOfWeek === 6 && !["09:00", "11:00"].includes(time)) {
    return false;
  }

  return true;
};

const APPOINTMENT_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const getAppointmentPurposeLabel = (purpose) => {
  const normalized = normalizeText(purpose).toLowerCase();
  if (normalized === "site_measurement") return "Site Measurement";
  if (normalized === "installation") return "Installation";
  return "Consultation";
};

const formatAppointmentSchedule = (value) => {
  const raw = String(value || "")
    .trim()
    .replace("T", " ");
  const match = /^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})/.exec(raw);
  if (!match) return "the requested schedule";
  const [, year, month, day, hour, minute] = match;
  const hourNumber = Number(hour);
  const displayHour = hourNumber % 12 || 12;
  const period = hourNumber >= 12 ? "PM" : "AM";
  return `${APPOINTMENT_MONTHS[Number(month) - 1]} ${Number(day)}, ${year} at ${displayHour}:${minute} ${period}`;
};

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

  /*
   * --------------------------------------------------------------
   * Appointment Input Validation
   * --------------------------------------------------------------
   * These checks are intentionally performed on the backend even
   * though the frontend already restricts these values.
   */

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

  if (project_description.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
    return res.status(400).json({
      message: `Project description must not exceed ${MAX_PROJECT_DESCRIPTION_LENGTH} characters.`,
    });
  }

  if (!preferred_date || !preferred_time) {
    return res.status(400).json({
      message: "Preferred date and time are required.",
    });
  }

  if (!isValidYMDDate(preferred_date)) {
    return res.status(400).json({
      message: "Preferred date must be a valid date in YYYY-MM-DD format.",
    });
  }

  if (!isTomorrowOrLater(preferred_date)) {
    return res.status(400).json({
      message: "Appointments can only be requested for tomorrow or later.",
    });
  }

  if (!ALLOWED_TIME_SLOTS.has(preferred_time)) {
    return res.status(400).json({
      message:
        "Invalid appointment time. Please select one of the available time slots.",
    });
  }

  const appointmentDay = getDayOfWeekFromYMD(preferred_date);

  if (appointmentDay === 0) {
    return res.status(400).json({
      message: "Appointments are not available on Sundays.",
    });
  }

  if (appointmentDay === 6 && !["09:00", "11:00"].includes(preferred_time)) {
    return res.status(400).json({
      message:
        "Saturday appointments are only available at 9:00 AM and 11:00 AM.",
    });
  }

  if (!isAllowedAppointmentTimeForDate(preferred_date, preferred_time)) {
    return res.status(400).json({
      message: "The selected appointment schedule is not available.",
    });
  }

  if (!contact_number) {
    return res.status(400).json({
      message: "Contact number is required.",
    });
  }

  if (!/^09\d{9}$/.test(contact_number)) {
    return res.status(400).json({
      message: "Contact number must be exactly 11 digits and start with 09.",
    });
  }

  if (notes.length > MAX_NOTES_LENGTH) {
    return res.status(400).json({
      message: `Additional notes must not exceed ${MAX_NOTES_LENGTH} characters.`,
    });
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    return res.status(400).json({
      message: `Address must not exceed ${MAX_ADDRESS_LENGTH} characters.`,
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
    let insertId = null;
    let conn = null;
    let transactionActive = false;
    let appointmentSlotLockHeld = false;

    const appointmentSlotLockName = `wisdom:appointment-slot:${scheduled_date}`;

    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      transactionActive = true;

      const [lockRows] = await conn.query(
        `SELECT GET_LOCK(?, 10) AS acquired`,
        [appointmentSlotLockName],
      );

      const lockAcquired = Number(lockRows[0]?.acquired || 0) === 1;

      if (!lockAcquired) {
        await conn.rollback();
        transactionActive = false;

        return res.status(503).json({
          message:
            "The appointment schedule is currently being processed. Please try again.",
        });
      }

      appointmentSlotLockHeld = true;

      const [existing] = await conn.query(
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
        await conn.rollback();
        transactionActive = false;

        return res.status(409).json({
          message:
            "You already have an active appointment request for that schedule.",
        });
      }

      const [slotExisting] = await conn.query(
        `
        SELECT id
        FROM appointments
        WHERE scheduled_date = ?
          AND status IN (
            'pending',
            'awaiting_staff_acceptance',
            'confirmed'
          )
        LIMIT 1
        `,
        [scheduled_date],
      );

      if (slotExisting.length > 0) {
        await conn.rollback();
        transactionActive = false;

        return res.status(409).json({
          message:
            "The selected appointment schedule is no longer available. Please choose another time slot.",
        });
      }

      const [result] = await conn.query(
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

      insertId = result.insertId;

      await conn.commit();
      transactionActive = false;
    } catch (appointmentInsertErr) {
      if (conn && transactionActive) {
        await conn.rollback();
        transactionActive = false;
      }

      throw appointmentInsertErr;
    } finally {
      if (conn && appointmentSlotLockHeld) {
        try {
          await conn.query(`SELECT RELEASE_LOCK(?) AS released`, [
            appointmentSlotLockName,
          ]);
        } catch (lockReleaseErr) {
          console.error(
            "[customer.appointments slot lock release]",
            lockReleaseErr.message || lockReleaseErr,
          );
        }

        appointmentSlotLockHeld = false;
      }

      if (conn) {
        conn.release();
        conn = null;
      }
    }

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "request_appointment",
      tableName: "appointments",
      recordId: insertId,
      newValues: {
        purpose,
        scheduled_date,
        status: "pending",
      },
      ipAddress: req.ip || null,
    });

    try {
      const [admins] = await db.query(
        `SELECT id FROM users WHERE role = 'admin' AND is_active = 1`,
      );

      const purposeLabel = getAppointmentPurposeLabel(purpose);

      const scheduleLabel = formatAppointmentSchedule(scheduled_date);

      const customerName = req.user.name || "A customer";

      for (const admin of admins) {
        await createNotificationSafe(db, {
          userId: admin.id,
          type: "appointment_request",
          title: "New Appointment Request",
          message: `${customerName} requested a ${purposeLabel} appointment for ${scheduleLabel}. Review the requested schedule.`,
          targetType: "appointment",
          targetId: insertId,
        });
      }
    } catch (notificationErr) {
      console.error(
        "[customer.appointments notification skipped]",
        notificationErr.message || notificationErr,
      );
    }

    return res.status(201).json({
      message: "Appointment request submitted successfully.",
      appointment_id: insertId,
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
        DATE_FORMAT(a.scheduled_date, '%Y-%m-%dT%H:%i:%s') AS scheduled_date,
        DATE_FORMAT(a.preferred_date, '%Y-%m-%dT%H:%i:%s') AS preferred_date,
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
    const appointmentId = Number(req.params.id);

    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      return res.status(400).json({
        message: "Invalid appointment id.",
      });
    }
    // ── FIXED: Switched to .query and added parseInt to req.params.id ──
    const [rows] = await db.query(
      `
      SELECT id, customer_id, status, assigned_staff_id, reviewed_by,
             request_owner_id, purpose,
             DATE_FORMAT(scheduled_date, '%Y-%m-%d %H:%i:%s') AS scheduled_date
      FROM appointments
      WHERE id = ?
      LIMIT 1
      `,
      [appointmentId],
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

    const cancellableStatuses = ["pending"];

    if (!cancellableStatuses.includes(appointment.status)) {
      return res.status(400).json({
        message: "Only pending appointments can be cancelled online.",
      });
    }

    const [cancelResult] = await db.query(
      `
      UPDATE appointments
      SET
        status = 'cancelled',
        updated_at = NOW()
      WHERE id = ?
        AND customer_id = ?
        AND status = 'pending'
      `,
      [appointmentId, req.user.id],
    );

    if (!cancelResult.affectedRows) {
      return res.status(409).json({
        message:
          "This appointment can no longer be cancelled. It may have already been assigned or updated.",
      });
    }

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "cancel_appointment",
      tableName: "appointments",
      recordId: appointment.id,
      oldValues: { status: appointment.status },
      newValues: {
        status: "cancelled",
        purpose: appointment.purpose,
        scheduled_date: appointment.scheduled_date,
      },
      ipAddress: req.ip || null,
    });

    try {
      const [admins] = await db.query(
        `SELECT id FROM users WHERE role = 'admin' AND is_active = 1`,
      );
      const recipients = new Set(admins.map((row) => Number(row.id)));
      if (appointment.assigned_staff_id)
        recipients.add(Number(appointment.assigned_staff_id));
      const purposeLabel = getAppointmentPurposeLabel(appointment.purpose);
      const scheduleLabel = formatAppointmentSchedule(
        appointment.scheduled_date,
      );
      const customerName = req.user.name || "The customer";

      for (const userId of recipients) {
        if (!userId) continue;
        await createNotificationSafe(db, {
          userId,
          type: "appointment_cancelled",
          title: "Appointment Cancelled by Customer",
          message: `${customerName} cancelled the ${purposeLabel} appointment scheduled for ${scheduleLabel}.`,
          targetType: "appointment",
          targetId: appointment.id,
        });
      }
    } catch (notificationErr) {
      console.error(
        "[customer.appointments cancel notification skipped]",
        notificationErr.message || notificationErr,
      );
    }

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

    if (!date) {
      return res.status(400).json({
        message: "Date is required.",
      });
    }

    if (!isValidYMDDate(date)) {
      return res.status(400).json({
        message: "Date must be a valid date in YYYY-MM-DD format.",
      });
    }

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

    if (!isValidYMDDate(start)) {
      return res.status(400).json({
        message: "Start date must be a valid date in YYYY-MM-DD format.",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        DATE_FORMAT(scheduled_date, '%Y-%m-%d') AS booked_date,
        DATE_FORMAT(scheduled_date, '%H:%i') AS booked_time
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
    // UTC is used only as a neutral calendar arithmetic container here.
    for (let i = 0; i < 7; i++) {
      const date = new Date(`${start}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + i);

      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");

      result[`${year}-${month}-${day}`] = [];
    }

    rows.forEach((row) => {
      const dateKey = row.booked_date
        ? String(row.booked_date).slice(0, 10)
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
