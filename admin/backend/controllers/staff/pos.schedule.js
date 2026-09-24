const db = require("../../config/db");
const { createNotificationSafe } = require("../../utils/notificationHelper");

const APPOINTMENT_STATUSES = [
  "pending",
  "awaiting_staff_acceptance",
  "confirmed",
  "completed",
  "rejected",
  "cancelled",
];

const APPOINTMENT_PURPOSES = [
  "consultation",
  "site_measurement",
  "installation",
];

const ALLOWED_TIME_SLOTS = new Set(["09:00", "11:00", "13:00", "15:00"]);

const APPOINTMENT_ACTIVE_STATUSES = new Set([
  "pending",
  "awaiting_staff_acceptance",
  "confirmed",
]);

const APPOINTMENT_SLOT_LOCK_PREFIX = "wisdom:appointment-slot:";

const normalizeText = (value) => String(value || "").trim();

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

const toNullableInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const normalizeDateTime = (value) => {
  const raw = normalizeText(value);

  if (!raw) return null;

  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);

  if (!match) return null;

  const [, year, month, day, hour, minute, seconds = "00"] = match;

  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(seconds);

  if (
    !Number.isInteger(yearNumber) ||
    !Number.isInteger(monthNumber) ||
    !Number.isInteger(dayNumber) ||
    !Number.isInteger(hourNumber) ||
    !Number.isInteger(minuteNumber) ||
    !Number.isInteger(secondNumber)
  ) {
    return null;
  }

  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > 31 ||
    hourNumber < 0 ||
    hourNumber > 23 ||
    minuteNumber < 0 ||
    minuteNumber > 59 ||
    secondNumber < 0 ||
    secondNumber > 59
  ) {
    return null;
  }

  // Appointment schedules are minute-based.
  if (secondNumber !== 0) {
    return null;
  }

  const date = new Date(
    Date.UTC(
      yearNumber,
      monthNumber - 1,
      dayNumber,
      hourNumber,
      minuteNumber,
      0,
    ),
  );

  if (
    date.getUTCFullYear() !== yearNumber ||
    date.getUTCMonth() !== monthNumber - 1 ||
    date.getUTCDate() !== dayNumber ||
    date.getUTCHours() !== hourNumber ||
    date.getUTCMinutes() !== minuteNumber
  ) {
    return null;
  }

  return `${year}-${month}-${day} ${hour}:${minute}:00`;
};

// WISDOM APPOINTMENT WALL CLOCK API FIX R5.1
// Appointment slots are business wall-clock times in Asia/Manila.
// Convert only when comparing against the real clock; do not reinterpret the
// stored 09:00 slot as 09:00 UTC.
const APPOINTMENT_TIME_ZONE_OFFSET = "+08:00";

const appointmentWallClockToEpochMs = (value) => {
  const raw = normalizeText(value).replace(" ", "T");
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/.exec(raw);

  if (!match) return Number.NaN;

  const [, datePart, timePart, seconds = "00"] = match;
  return Date.parse(
    `${datePart}T${timePart}:${seconds}${APPOINTMENT_TIME_ZONE_OFFSET}`,
  );
};

const isAppointmentPastDue = (value) => {
  const epochMs = appointmentWallClockToEpochMs(value);
  return Number.isFinite(epochMs) ? epochMs < Date.now() : false;
};

const validateAppointmentSchedule = (value, { requireFuture = true } = {}) => {
  const normalized = normalizeDateTime(value);

  if (!normalized) {
    return {
      value: null,
      message: "Appointment date and time must be a valid date/time.",
    };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):00$/.exec(normalized);

  if (!match) {
    return {
      value: null,
      message: "Appointment date and time is invalid.",
    };
  }

  const [, year, month, day, hour, minute] = match;
  const datePart = `${year}-${month}-${day}`;
  const timePart = `${hour}:${minute}`;

  if (!ALLOWED_TIME_SLOTS.has(timePart)) {
    return {
      value: null,
      message:
        "Invalid appointment time. Please select one of the available time slots.",
    };
  }

  const dayOfWeek = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  ).getUTCDay();

  if (dayOfWeek === 0) {
    return {
      value: null,
      message: "Appointments are not available on Sundays.",
    };
  }

  if (dayOfWeek === 6 && !["09:00", "11:00"].includes(timePart)) {
    return {
      value: null,
      message:
        "Saturday appointments are only available at 9:00 AM and 11:00 AM.",
    };
  }

  if (requireFuture) {
    const epochMs = appointmentWallClockToEpochMs(normalized);

    if (!Number.isFinite(epochMs) || epochMs <= Date.now()) {
      return {
        value: null,
        message: "Appointment date and time must be in the future.",
      };
    }
  }

  return {
    value: normalized,
    message: null,
  };
};

const acquireAppointmentSlotLock = async (conn, scheduledDate) => {
  const lockName = `${APPOINTMENT_SLOT_LOCK_PREFIX}${scheduledDate}`;

  const [rows] = await conn.query(`SELECT GET_LOCK(?, 10) AS acquired`, [
    lockName,
  ]);

  const acquired = Number(rows[0]?.acquired || 0) === 1;

  return {
    acquired,
    lockName,
  };
};

const releaseAppointmentSlotLock = async (conn, lockName) => {
  if (!conn || !lockName) return;

  try {
    await conn.query(`SELECT RELEASE_LOCK(?) AS released`, [lockName]);
  } catch (err) {
    console.error("[appointments slot lock release]", err.message || err);
  }
};

const hasActiveAppointmentAtSlot = async (
  conn,
  scheduledDate,
  excludeAppointmentId = null,
) => {
  let sql = `
    SELECT id
    FROM appointments
    WHERE scheduled_date = ?
      AND status IN (
        'pending',
        'awaiting_staff_acceptance',
        'confirmed'
      )
  `;

  const params = [scheduledDate];

  if (excludeAppointmentId) {
    sql += ` AND id <> ?`;
    params.push(excludeAppointmentId);
  }

  sql += ` LIMIT 1`;

  const [rows] = await conn.query(sql, params);

  return rows.length > 0;
};

const ensureUserHasRole = async (userId, allowedRoles) => {
  if (!userId) return null;

  const [rows] = await db.query(
    `SELECT id, name, role FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );

  if (!rows.length) return null;

  const user = rows[0];
  if (!allowedRoles.includes(user.role)) return null;

  return user;
};

const ensureStaffType = async (userId, expectedType) => {
  if (!userId) return null;

  const [rows] = await db.query(
    `SELECT id, name, role, staff_type, is_active
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId],
  );

  if (!rows.length) return null;

  const user = rows[0];

  if (user.role !== "staff") return null;
  if (user.staff_type !== expectedType) return null;
  if (!user.is_active) return null;

  return user;
};

// Stage-1 assumption: the repository has no stored/configured appointment
// duration anywhere (no column, no settings entry). A fixed 60-minute
// duration is used only to detect provider double-booking in this stage.
const APPOINTMENT_DURATION_MINUTES = 60;

// Half-open interval overlap check: [start, start + 60min).
// Conflict iff existing_start < new_end AND new_start < existing_end.
// Must run on the transaction connection (conn), after the candidate
// provider's users row is already locked by the caller — this is a plain
// read, not the serialization point itself.
const hasOverlappingProviderAppointment = async (
  conn,
  assignedStaffId,
  scheduledDate,
  excludeAppointmentId,
) => {
  const [rows] = await conn.query(
    `SELECT id
     FROM appointments
     WHERE assigned_staff_id = ?
       AND status IN ('awaiting_staff_acceptance', 'confirmed')
       AND id != ?
       AND scheduled_date < DATE_ADD(?, INTERVAL ? MINUTE)
       AND DATE_ADD(scheduled_date, INTERVAL ? MINUTE) > ?
     LIMIT 1`,
    [
      assignedStaffId,
      excludeAppointmentId,
      scheduledDate,
      APPOINTMENT_DURATION_MINUTES,
      APPOINTMENT_DURATION_MINUTES,
      scheduledDate,
    ],
  );

  return rows.length > 0;
};

// Authoritative provider validation once a transaction is open. Must always
// run on the transaction connection (conn), never on the global pool, so a
// held transaction never blocks on a second pool connection underneath it.
const lockAndValidateIndoorProvider = async (conn, assignedStaffId) => {
  const [[row]] = await conn.query(
    `SELECT id, name, role, staff_type, is_active
     FROM users
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [assignedStaffId],
  );

  if (!row) return null;
  if (row.role !== "staff") return null;
  if (row.staff_type !== "indoor") return null;
  if (!row.is_active) return null;

  return row;
};

const getAppointmentById = async (appointmentId) => {
  const [rows] = await db.query(
    `
    SELECT
      a.id,
      a.order_id,
      a.customer_id,
      a.reviewed_by,
      a.assigned_staff_id,
      a.request_owner_id,
      a.reviewed_by AS reviewed_by_id,
      a.assigned_staff_id AS assigned_to,
      a.purpose,
      DATE_FORMAT(a.scheduled_date, '%Y-%m-%dT%H:%i:%s') AS scheduled_date,
      DATE_FORMAT(a.preferred_date, '%Y-%m-%dT%H:%i:%s') AS preferred_date,
      a.status,
      a.notes,
      a.updated_at,

      o.order_number,
      o.total,
      o.payment_method,
      o.delivery_address AS order_delivery_address,
      customer.address AS customer_address,
      o.created_at AS order_created_at,

      COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
      COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone,
      
      request_owner.name AS request_owner_name,
      handler.name AS handled_by_name,
      provider.name AS provider_name,
      COALESCE(provider.name, handler.name) AS assigned_to_name

    FROM appointments a
    LEFT JOIN orders o ON o.id = a.order_id
    LEFT JOIN users customer ON customer.id = a.customer_id
    LEFT JOIN users request_owner ON request_owner.id = a.request_owner_id
    LEFT JOIN users handler ON handler.id = a.reviewed_by
    LEFT JOIN users provider ON provider.id = a.assigned_staff_id
    WHERE a.id = ?
    LIMIT 1
    `,
    [appointmentId],
  );

  return rows[0] || null;
};

exports.getAppointments = async (req, res) => {
  try {
    let sql = `
      SELECT
        a.id,
        a.order_id,
        a.customer_id,
        a.reviewed_by,
        a.assigned_staff_id,
        a.request_owner_id,
        a.reviewed_by AS reviewed_by_id,
        a.assigned_staff_id AS assigned_to,
        a.purpose,
        DATE_FORMAT(a.scheduled_date, '%Y-%m-%dT%H:%i:%s') AS scheduled_date,
        DATE_FORMAT(a.preferred_date, '%Y-%m-%dT%H:%i:%s') AS preferred_date,
        a.status,
        a.notes,
        a.updated_at,

        o.order_number,
        o.total,
        o.payment_method,
        o.delivery_address AS order_delivery_address,
        customer.address AS customer_address,
        o.created_at AS order_created_at,

        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone,

        request_owner.name AS request_owner_name,
        handler.name AS handled_by_name,
        provider.name AS provider_name,
        COALESCE(provider.name, handler.name) AS assigned_to_name

      FROM appointments a
      LEFT JOIN orders o ON o.id = a.order_id
      LEFT JOIN users customer ON customer.id = a.customer_id
      LEFT JOIN users request_owner ON request_owner.id = a.request_owner_id
      LEFT JOIN users handler ON handler.id = a.reviewed_by
      LEFT JOIN users provider ON provider.id = a.assigned_staff_id
    `;

    const params = [];

    if (req.user.role === "staff") {
      sql += `
        WHERE a.assigned_staff_id = ?
      `;
      params.push(req.user.id);
    }

    sql += `
      ORDER BY
        FIELD(a.status, 'pending', 'awaiting_staff_acceptance', 'confirmed', 'completed', 'rejected', 'cancelled'),
        COALESCE(a.scheduled_date, a.preferred_date) ASC,
        a.id DESC
      LIMIT 200
    `;

    const [rows] = await db.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error("GET /api/pos/appointments error:", err);
    return res.status(500).json({
      message: "Failed to load appointments",
      error: err.message,
    });
  }
};

exports.getAvailability = async (req, res) => {
  try {
    const rawDate = String(req.query.date || "").trim();
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);

    if (!dateMatch) {
      return res.status(400).json({
        message: "Date must use the YYYY-MM-DD format.",
      });
    }

    const [, year, month, day] = dateMatch;

    const dateObj = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );

    if (
      dateObj.getUTCFullYear() !== Number(year) ||
      dateObj.getUTCMonth() !== Number(month) - 1 ||
      dateObj.getUTCDate() !== Number(day)
    ) {
      return res.status(400).json({
        message: "Date is invalid.",
      });
    }

    const date = rawDate;

    const [rows] = await db.query(
      `
      SELECT id, TIME(scheduled_date) AS booked_time, status
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

    const booked = rows
      .map((r) => {
        const time = r.booked_time;

        return {
          id: Number(r.id),
          time: time ? time.substring(0, 5) : null,
          status: r.status,
        };
      })
      .filter((b) => b.time);

    return res.json({ booked });
  } catch (err) {
    console.error("[appointments availability]", err);

    return res.status(500).json({
      message: "Server error.",
    });
  }
};

exports.createAppointment = async (req, res) => {
  try {
    const orderId = toNullableInt(req.body.order_id);
    const requestedCustomerId = toNullableInt(req.body.customer_id);
    const purpose =
      normalizeText(req.body.purpose).toLowerCase() || "installation";

    const preferredDate = normalizeDateTime(req.body.preferred_date);

    let scheduledDate = null;

    if (Object.prototype.hasOwnProperty.call(req.body, "scheduled_date")) {
      scheduledDate = normalizeDateTime(req.body.scheduled_date);

      if (!scheduledDate) {
        return res.status(400).json({
          message: "Scheduled appointment date and time is invalid.",
        });
      }
    } else {
      scheduledDate = preferredDate;
    }

    const preferredScheduleValidation =
      validateAppointmentSchedule(preferredDate);

    if (preferredScheduleValidation.message) {
      return res.status(400).json({
        message: preferredScheduleValidation.message,
      });
    }

    const scheduledScheduleValidation =
      validateAppointmentSchedule(scheduledDate);

    if (scheduledScheduleValidation.message) {
      return res.status(400).json({
        message: scheduledScheduleValidation.message,
      });
    }

    const notes = normalizeText(req.body.notes) || null;
    const assignedStaffId = toNullableInt(req.body.assigned_staff_id);

    if (!APPOINTMENT_PURPOSES.includes(purpose)) {
      return res.status(400).json({ message: "Invalid appointment purpose" });
    }

    if (!preferredDate) {
      return res.status(400).json({
        message: "Preferred appointment date and time are required",
      });
    }

    let linkedOrder = null;
    if (orderId) {
      const [orderRows] = await db.query(
        `
        SELECT
          o.id,
          o.customer_id,
          o.status,
          o.order_number
        FROM orders o
        WHERE o.id = ?
        LIMIT 1
        `,
        [orderId],
      );

      linkedOrder = orderRows[0] || null;

      if (
        linkedOrder &&
        requestedCustomerId &&
        Number(linkedOrder.customer_id || 0) !== Number(requestedCustomerId)
      ) {
        return res.status(400).json({
          message:
            "The selected customer does not match the customer on the linked order.",
        });
      }

      if (!linkedOrder) {
        return res.status(404).json({ message: "Linked order not found" });
      }

      const orderStatus = String(linkedOrder.status || "").toLowerCase();
      if (["cancelled", "completed"].includes(orderStatus)) {
        return res.status(400).json({
          message: "Cannot create an appointment for this order",
        });
      }
    }

    const customerId =
      requestedCustomerId || toNullableInt(linkedOrder?.customer_id);

    if (customerId) {
      const customer = await ensureUserHasRole(customerId, ["customer"]);
      if (!customer) {
        return res.status(400).json({
          message: "Selected customer was not found",
        });
      }
    }

    const initialStatus = assignedStaffId
      ? "awaiting_staff_acceptance"
      : "pending";

    let assignedStaff = null;
    let insertId;

    if (assignedStaffId) {
      let conn = null;
      let transactionActive = false;
      let appointmentSlotLockName = null;

      try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        transactionActive = true;

        const slotLock = await acquireAppointmentSlotLock(conn, scheduledDate);

        if (!slotLock.acquired) {
          await conn.rollback();
          transactionActive = false;

          return res.status(503).json({
            message:
              "The appointment schedule is currently being processed. Please try again.",
          });
        }

        appointmentSlotLockName = slotLock.lockName;

        const slotConflict = await hasActiveAppointmentAtSlot(
          conn,
          scheduledDate,
        );

        if (slotConflict) {
          await conn.rollback();
          transactionActive = false;

          return res.status(409).json({
            message:
              "The selected appointment schedule is already booked. Please choose another time slot.",
          });
        }

        const lockedProvider = await lockAndValidateIndoorProvider(
          conn,
          assignedStaffId,
        );

        if (!lockedProvider) {
          await conn.rollback();
          transactionActive = false;

          return res.status(400).json({
            message:
              "Selected assigned staff member must be an active indoor staff member.",
          });
        }

        assignedStaff = lockedProvider;

        const hasConflict = await hasOverlappingProviderAppointment(
          conn,
          assignedStaffId,
          scheduledDate,
          0,
        );

        if (hasConflict) {
          await conn.rollback();
          transactionActive = false;

          return res.status(409).json({
            message:
              "The assigned staff already has an overlapping appointment.",
          });
        }

        const [result] = await conn.query(
          `
          INSERT INTO appointments
            (
              order_id,
              customer_id,
              reviewed_by,
              assigned_staff_id,
              request_owner_id,
              purpose,
              scheduled_date,
              preferred_date,
              status,
              notes
            )
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            orderId || null,
            customerId || null,
            req.user.id,
            assignedStaffId,
            req.user.id,
            purpose,
            scheduledDate,
            preferredDate,
            initialStatus,
            notes,
          ],
        );

        insertId = result.insertId;

        await conn.commit();
        transactionActive = false;
      } catch (txErr) {
        if (conn && transactionActive) {
          await conn.rollback();
          transactionActive = false;
        }

        throw txErr;
      } finally {
        if (conn && appointmentSlotLockName) {
          await releaseAppointmentSlotLock(conn, appointmentSlotLockName);

          appointmentSlotLockName = null;
        }

        if (conn) conn.release();
      }
    } else {
      let conn = null;
      let transactionActive = false;
      let appointmentSlotLockName = null;

      try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        transactionActive = true;

        const slotLock = await acquireAppointmentSlotLock(conn, scheduledDate);

        if (!slotLock.acquired) {
          await conn.rollback();
          transactionActive = false;

          return res.status(503).json({
            message:
              "The appointment schedule is currently being processed. Please try again.",
          });
        }

        appointmentSlotLockName = slotLock.lockName;

        const slotConflict = await hasActiveAppointmentAtSlot(
          conn,
          scheduledDate,
        );

        if (slotConflict) {
          await conn.rollback();
          transactionActive = false;

          return res.status(409).json({
            message:
              "The selected appointment schedule is already booked. Please choose another time slot.",
          });
        }

        const [result] = await conn.query(
          `
          INSERT INTO appointments
            (
              order_id,
              customer_id,
              reviewed_by,
              assigned_staff_id,
              request_owner_id,
              purpose,
              scheduled_date,
              preferred_date,
              status,
              notes
            )
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            orderId || null,
            customerId || null,
            req.user.id,
            null,
            req.user.id,
            purpose,
            scheduledDate,
            preferredDate,
            "pending",
            notes,
          ],
        );

        insertId = result.insertId;

        await conn.commit();
        transactionActive = false;
      } catch (txErr) {
        if (conn && transactionActive) {
          await conn.rollback();
          transactionActive = false;
        }

        throw txErr;
      } finally {
        if (conn && appointmentSlotLockName) {
          await releaseAppointmentSlotLock(conn, appointmentSlotLockName);

          appointmentSlotLockName = null;
        }

        if (conn) conn.release();
      }
    }

    const appointment = await getAppointmentById(insertId);

    if (assignedStaffId) {
      const purposeLabel = getAppointmentPurposeLabel(purpose);
      const scheduleLabel = formatAppointmentSchedule(scheduledDate);
      const orderContext = appointment?.order_number
        ? ` for Order ${appointment.order_number}`
        : "";
      await createNotificationSafe(db, {
        userId: assignedStaffId,
        type: "appointment_assignment",
        title: "New Appointment Assigned",
        message: `You were assigned a ${purposeLabel} appointment${orderContext} for ${scheduleLabel}. Open Appointments to review the details.`,
        targetType: "appointment",
        targetId: insertId,
        targetOrderId: orderId || null,
      });
    }

    req.auditRecord = {
      id: insertId,
      new: {
        status: initialStatus,
        assigned_staff_id: assignedStaffId || null,
        scheduled_date: scheduledDate,
        preferred_date: preferredDate,
        purpose_configured: Boolean(purpose),
        notes_configured: Boolean(notes),
      },
    };

    return res.status(201).json({
      message: assignedStaff
        ? "Appointment created and assigned to indoor staff."
        : "Appointment request created successfully.",
      appointment,
      assigned_staff: assignedStaff
        ? { id: assignedStaff.id, name: assignedStaff.name }
        : null,
    });
  } catch (err) {
    console.error("POST /api/pos/appointments error:", err);
    return res.status(500).json({
      message: "Failed to create appointment",
      error: err.message,
    });
  }
};

exports.updateAppointment = async (req, res) => {
  const appointmentId = toNullableInt(req.params.id);

  if (!appointmentId) {
    return res.status(400).json({ message: "Invalid appointment id" });
  }

  let conn = null;
  let transactionActive = false;
  let appointmentSlotLockName = null;
  let appointmentSlotLockHeld = false;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [[existing]] = await conn.query(
      `
      SELECT
        id,
        order_id,
        customer_id,
        reviewed_by,
        assigned_staff_id,
        request_owner_id,
        purpose,
        DATE_FORMAT(scheduled_date, '%Y-%m-%d %H:%i:%s') AS scheduled_date,
        DATE_FORMAT(preferred_date, '%Y-%m-%d %H:%i:%s') AS preferred_date,
        status,
        notes
      FROM appointments
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [appointmentId],
    );

    if (!existing) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Appointment not found" });
    }

    const currentStatus = normalizeText(existing.status).toLowerCase();
    const isAdmin = req.user.role === "admin";

    // Check the stored business wall-clock schedule against real time using
    // the explicit Asia/Manila offset, independent of the server OS timezone.
    const isPastDue = isAppointmentPastDue(
      existing.scheduled_date || existing.preferred_date,
    );

    if (["completed", "rejected", "cancelled"].includes(currentStatus)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "This appointment can no longer be changed.",
      });
    }

    if (!isAdmin) {
      const isAssignedProvider =
        Number(existing.assigned_staff_id) === Number(req.user.id);

      if (!isAssignedProvider) {
        await conn.rollback();
        transactionActive = false;
        return res.status(403).json({
          message: "You can only update appointments assigned to you.",
        });
      }

      const requestedStatus = normalizeText(req.body.status).toLowerCase();
      const nextNotes =
        req.body.notes === undefined
          ? (existing.notes ?? null)
          : normalizeText(req.body.notes) || null;

      if (currentStatus === "awaiting_staff_acceptance") {
        const isAccept = requestedStatus === "confirmed";
        const isReturnToAdmin = requestedStatus === "pending";

        if (!isAccept && !isReturnToAdmin) {
          await conn.rollback();
          transactionActive = false;
          return res.status(400).json({
            message:
              "Assigned appointment tasks can only be accepted or returned to admin.",
          });
        }

        if (isAccept && isPastDue) {
          await conn.rollback();
          transactionActive = false;
          return res.status(400).json({
            message:
              "This appointment schedule has already passed. Please return it to the admin.",
          });
        }

        await conn.query(
          `
          UPDATE appointments
          SET
            assigned_staff_id = ?,
            status = ?,
            notes = ?,
            updated_at = NOW()
          WHERE id = ?
          `,
          [
            isReturnToAdmin ? null : existing.assigned_staff_id,
            isAccept ? "confirmed" : "pending",
            nextNotes,
            appointmentId,
          ],
        );

        const purposeLabel = getAppointmentPurposeLabel(existing.purpose);
        const scheduleLabel = formatAppointmentSchedule(
          existing.scheduled_date,
        );
        if (isAccept && existing.customer_id) {
          await createNotificationSafe(conn, {
            userId: existing.customer_id,
            type: "appointment_confirmed",
            title: "Appointment Confirmed",
            message: `Your ${purposeLabel} appointment is confirmed for ${scheduleLabel}.`,
            targetType: "appointment",
            targetId: appointmentId,
            targetOrderId: existing.order_id || null,
          });
        }
        if (isReturnToAdmin) {
          const ownerId = existing.request_owner_id || existing.reviewed_by;
          if (ownerId && Number(ownerId) !== Number(req.user.id)) {
            await createNotificationSafe(conn, {
              userId: ownerId,
              type: "appointment_reassignment_needed",
              title: "Appointment Needs Reassignment",
              message: `${req.user.name || "Indoor staff"} returned the ${purposeLabel} appointment scheduled for ${scheduleLabel}. Assign another staff member.`,
              targetType: "appointment",
              targetId: appointmentId,
              targetOrderId: existing.order_id || null,
            });
          }
        }

        await conn.commit();
        transactionActive = false;

        if (conn && appointmentSlotLockHeld) {
          await releaseAppointmentSlotLock(conn, appointmentSlotLockName);

          appointmentSlotLockName = null;
          appointmentSlotLockHeld = false;
        }

        conn.release();
        conn = null;

        const updated = await getAppointmentById(appointmentId);

        req.auditRecord = {
          id: appointmentId,
          old: {
            status: currentStatus,
            assigned_staff_id: existing.assigned_staff_id ?? null,
          },
          new: {
            status: isAccept ? "confirmed" : "pending",
            assigned_staff_id: isReturnToAdmin
              ? null
              : (existing.assigned_staff_id ?? null),
            changed_fields: isReturnToAdmin
              ? ["status", "assigned_staff_id"]
              : ["status"],
          },
        };

        return res.json({
          message: isAccept
            ? "Appointment accepted successfully."
            : "Appointment returned to admin for reassignment.",
          appointment: updated,
        });
      }

      if (currentStatus !== "confirmed") {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message:
            "Only assigned or confirmed appointments can be updated by indoor staff.",
        });
      }

      if (!["completed", "cancelled"].includes(requestedStatus)) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message:
            "Indoor staff can only mark confirmed appointments as completed or cancelled.",
        });
      }

      await conn.query(
        `
        UPDATE appointments
        SET
          status = ?,
          notes = ?,
          updated_at = NOW()
        WHERE id = ?
        `,
        [requestedStatus, nextNotes, appointmentId],
      );

      if (existing.customer_id) {
        const purposeLabel = getAppointmentPurposeLabel(existing.purpose);
        const scheduleLabel = formatAppointmentSchedule(
          existing.scheduled_date,
        );
        await createNotificationSafe(conn, {
          userId: existing.customer_id,
          type: "appointment_update",
          title:
            requestedStatus === "completed"
              ? "Appointment Completed"
              : "Appointment Cancelled",
          message:
            requestedStatus === "completed"
              ? `Your ${purposeLabel} appointment scheduled for ${scheduleLabel} has been completed.`
              : `Your ${purposeLabel} appointment scheduled for ${scheduleLabel} has been cancelled.`,
          targetType: "appointment",
          targetId: appointmentId,
          targetOrderId: existing.order_id || null,
        });
      }

      await conn.commit();
      transactionActive = false;
      conn.release();
      conn = null;

      const updated = await getAppointmentById(appointmentId);

      req.auditRecord = {
        id: appointmentId,
        old: { status: currentStatus },
        new: { status: requestedStatus, changed_fields: ["status"] },
      };

      return res.json({
        message: "Appointment updated successfully.",
        appointment: updated,
      });
    }

    let handledBy = existing.reviewed_by ?? null;
    let assignedStaffId = existing.assigned_staff_id ?? null;
    let purpose = existing.purpose;
    let scheduledDate = existing.scheduled_date ?? null;
    let preferredDate = existing.preferred_date ?? null;
    let status = currentStatus;
    let notes = existing.notes ?? null;

    // Caches the provider row already locked+validated by the assigned_staff_id
    // branch below, so the final effective-state check can reuse it instead
    // of locking and querying the same users row a second time in this
    // same request.
    let lockedAssignedStaffId = null;
    let lockedProviderRow = null;

    if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
      notes = normalizeText(req.body.notes) || null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "purpose")) {
      const requestedPurpose = normalizeText(req.body.purpose).toLowerCase();
      if (!APPOINTMENT_PURPOSES.includes(requestedPurpose)) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({ message: "Invalid appointment purpose" });
      }
      purpose = requestedPurpose;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "preferred_date")) {
      const preferredScheduleValidation = validateAppointmentSchedule(
        req.body.preferred_date,
      );

      if (preferredScheduleValidation.message) {
        await conn.rollback();
        transactionActive = false;

        return res.status(400).json({
          message: preferredScheduleValidation.message,
        });
      }

      preferredDate = preferredScheduleValidation.value;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "scheduled_date")) {
      const scheduledScheduleValidation = validateAppointmentSchedule(
        req.body.scheduled_date,
      );

      if (scheduledScheduleValidation.message) {
        await conn.rollback();
        transactionActive = false;

        return res.status(400).json({
          message: scheduledScheduleValidation.message,
        });
      }

      scheduledDate = scheduledScheduleValidation.value;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "assigned_staff_id")) {
      const requestedProviderId = toNullableInt(req.body.assigned_staff_id);

      if (!requestedProviderId) {
        assignedStaffId = null;
        status = "pending";
      } else {
        assignedStaffId = requestedProviderId;
        handledBy = req.user.id;
        status = "awaiting_staff_acceptance";
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
      const requestedStatus = normalizeText(req.body.status).toLowerCase();

      if (!APPOINTMENT_STATUSES.includes(requestedStatus)) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({ message: "Invalid appointment status" });
      }

      if (requestedStatus === "confirmed" || requestedStatus === "completed") {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message:
            "Only the assigned indoor staff can confirm or complete an appointment.",
        });
      }

      if (requestedStatus === "awaiting_staff_acceptance" && !assignedStaffId) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message:
            "Assign an indoor staff member before setting the appointment to Awaiting Staff Acceptance.",
        });
      }

      if (requestedStatus === "pending") {
        assignedStaffId = null;
      }

      status = requestedStatus;
    }

    const scheduledDateChanged =
      (scheduledDate ?? null) !== (existing.scheduled_date ?? null);

    if (
      currentStatus === "confirmed" &&
      scheduledDateChanged &&
      status === "confirmed"
    ) {
      status = assignedStaffId ? "awaiting_staff_acceptance" : "pending";
    }

    // Evaluate the NEW business wall-clock date using Asia/Manila semantics.
    const isNowPastDue = isAppointmentPastDue(scheduledDate || preferredDate);

    if (
      isNowPastDue &&
      !["cancelled", "rejected", "completed"].includes(status) &&
      (scheduledDate !== (existing.scheduled_date ?? null) ||
        preferredDate !== (existing.preferred_date ?? null))
    ) {
      await conn.rollback();
      transactionActive = false;

      return res.status(400).json({
        message:
          "The chosen appointment date has already passed. Please select a future date.",
      });
    }

    // Effective-state check: runs once, using the final computed values from
    // every branch above — not tied to which specific field the admin sent.
    // A reschedule-only request on an already-assigned/confirmed appointment
    // must still be checked against its existing (unchanged) assigned_staff_id.

    if (scheduledDate && APPOINTMENT_ACTIVE_STATUSES.has(status)) {
      const slotLock = await acquireAppointmentSlotLock(conn, scheduledDate);

      if (!slotLock.acquired) {
        await conn.rollback();
        transactionActive = false;

        return res.status(503).json({
          message:
            "The appointment schedule is currently being processed. Please try again.",
        });
      }

      appointmentSlotLockName = slotLock.lockName;
      appointmentSlotLockHeld = true;

      const slotConflict = await hasActiveAppointmentAtSlot(
        conn,
        scheduledDate,
        appointmentId,
      );

      if (slotConflict) {
        await conn.rollback();
        transactionActive = false;

        return res.status(409).json({
          message:
            "The selected appointment schedule is already booked. Please choose another time slot.",
        });
      }
    }
    if (
      assignedStaffId &&
      ["awaiting_staff_acceptance", "confirmed"].includes(status)
    ) {
      let providerRow =
        lockedAssignedStaffId === assignedStaffId ? lockedProviderRow : null;

      if (!providerRow) {
        providerRow = await lockAndValidateIndoorProvider(
          conn,
          assignedStaffId,
        );

        if (!providerRow) {
          await conn.rollback();
          transactionActive = false;
          return res.status(400).json({
            message:
              "Selected assigned staff member must be an active indoor staff member.",
          });
        }
      }

      const hasConflict = await hasOverlappingProviderAppointment(
        conn,
        assignedStaffId,
        scheduledDate,
        appointmentId,
      );

      if (hasConflict) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message: "The assigned staff already has an overlapping appointment.",
        });
      }
    }

    const changedFields = [];
    if (status !== currentStatus) changedFields.push("status");
    if ((assignedStaffId ?? null) !== (existing.assigned_staff_id ?? null)) {
      changedFields.push("assigned_staff_id");
    }
    if ((scheduledDate ?? null) !== (existing.scheduled_date ?? null)) {
      changedFields.push("scheduled_date");
    }
    if ((preferredDate ?? null) !== (existing.preferred_date ?? null)) {
      changedFields.push("preferred_date");
    }
    const purposeChanged = purpose !== existing.purpose;
    const notesChanged = (notes ?? null) !== (existing.notes ?? null);
    if (purposeChanged) changedFields.push("purpose");
    if (notesChanged) changedFields.push("notes");

    await conn.query(
      `
      UPDATE appointments
      SET
        reviewed_by = ?,
        assigned_staff_id = ?,
        purpose = ?,
        scheduled_date = ?,
        preferred_date = ?,
        status = ?,
        notes = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        handledBy,
        assignedStaffId,
        purpose,
        scheduledDate,
        preferredDate,
        status,
        notes,
        appointmentId,
      ],
    );

    const purposeLabel = getAppointmentPurposeLabel(purpose);
    const scheduleLabel = formatAppointmentSchedule(scheduledDate);
    const assignmentChanged = changedFields.includes("assigned_staff_id");
    const scheduleChanged = changedFields.includes("scheduled_date");

    if (assignmentChanged && assignedStaffId) {
      await createNotificationSafe(conn, {
        userId: assignedStaffId,
        type: "appointment_assignment",
        title: "New Appointment Assigned",
        message: `You were assigned a ${purposeLabel} appointment for ${scheduleLabel}. Open Appointments to review the details.`,
        targetType: "appointment",
        targetId: appointmentId,
        targetOrderId: existing.order_id || null,
      });
    }

    if (scheduleChanged && existing.customer_id) {
      await createNotificationSafe(conn, {
        userId: existing.customer_id,
        type: "appointment_rescheduled",
        title: "Appointment Rescheduled",
        message: `Your ${purposeLabel} appointment was moved to ${scheduleLabel}. Please review the updated schedule.`,
        targetType: "appointment",
        targetId: appointmentId,
        targetOrderId: existing.order_id || null,
      });
    }

    if (scheduleChanged && assignedStaffId && !assignmentChanged) {
      await createNotificationSafe(conn, {
        userId: assignedStaffId,
        type: "appointment_rescheduled",
        title: "Appointment Rescheduled",
        message: `Your assigned ${purposeLabel} appointment was moved to ${scheduleLabel}.`,
        targetType: "appointment",
        targetId: appointmentId,
        targetOrderId: existing.order_id || null,
      });
    }

    if (
      ["rejected", "cancelled"].includes(status) &&
      status !== currentStatus &&
      existing.customer_id
    ) {
      await createNotificationSafe(conn, {
        userId: existing.customer_id,
        type: "appointment_update",
        title:
          status === "rejected"
            ? "Appointment Request Not Approved"
            : "Appointment Cancelled",
        message:
          status === "rejected"
            ? `We could not approve your ${purposeLabel} appointment request for ${scheduleLabel}. Please choose another schedule or contact our team.`
            : `Your ${purposeLabel} appointment for ${scheduleLabel} has been cancelled.`,
        targetType: "appointment",
        targetId: appointmentId,
        targetOrderId: existing.order_id || null,
      });
    }

    await conn.commit();
    transactionActive = false;

    if (conn && appointmentSlotLockHeld) {
      await releaseAppointmentSlotLock(conn, appointmentSlotLockName);

      appointmentSlotLockName = null;
      appointmentSlotLockHeld = false;
    }

    conn.release();
    conn = null;

    const updated = await getAppointmentById(appointmentId);

    if (changedFields.length > 0) {
      req.auditRecord = {
        id: appointmentId,
        old: {
          status: currentStatus,
          assigned_staff_id: existing.assigned_staff_id ?? null,
          scheduled_date: existing.scheduled_date ?? null,
          preferred_date: existing.preferred_date ?? null,
        },
        new: {
          status,
          assigned_staff_id: assignedStaffId,
          scheduled_date: scheduledDate,
          preferred_date: preferredDate,
          purpose_changed: purposeChanged,
          notes_changed: notesChanged,
          changed_fields: changedFields,
        },
      };
    }

    return res.json({
      message: "Appointment updated successfully.",
      appointment: updated,
    });
  } catch (err) {
    if (conn && transactionActive) {
      await conn.rollback();
      transactionActive = false;
    }
    console.error("PATCH /api/pos/appointments/:id error:", err);
    return res.status(500).json({
      message: "Failed to update appointment",
      error: err.message,
    });
  } finally {
    if (conn && appointmentSlotLockHeld) {
      await releaseAppointmentSlotLock(conn, appointmentSlotLockName);

      appointmentSlotLockName = null;
      appointmentSlotLockHeld = false;
    }

    if (conn) conn.release();
  }
};
