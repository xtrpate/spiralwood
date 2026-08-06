const db = require("../../config/db");

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

const normalizeText = (value) => String(value || "").trim();

const toNullableInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const normalizeDateTime = (value) => {
  const raw = normalizeText(value);
  if (!raw) return null;
  const cleaned = raw.replace("T", " ");
  return cleaned.length === 16 ? `${cleaned}:00` : cleaned;
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
      a.scheduled_date,
      a.preferred_date,
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
        a.scheduled_date,
        a.preferred_date,
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
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        message: "Date is required.",
      });
    }

    const [rows] = await db.query(
      `
      SELECT TIME(scheduled_date) AS booked_time, status
      FROM appointments
      WHERE DATE(scheduled_date) = ?
        AND status IN (
          'pending',
          'awaiting_staff_acceptance',
          'confirmed',
          'completed'
        )
      `,
      [date],
    );

    const booked = rows
      .map((r) => {
        const time = r.booked_time;
        return {
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
    const scheduledDate =
      normalizeDateTime(req.body.scheduled_date) || preferredDate;

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

      try {
        conn = await db.getConnection();
        await conn.beginTransaction();
        transactionActive = true;

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
            assignedStaffId || null,
            req.user.id,
            purpose,
            scheduledDate,
            preferredDate,
            initialStatus,
            notes,
          ],
        );

        await conn.commit();
        transactionActive = false;
        insertId = result.insertId;
      } catch (txErr) {
        if (conn && transactionActive) {
          await conn.rollback();
          transactionActive = false;
        }
        throw txErr;
      } finally {
        if (conn) conn.release();
      }
    } else {
      const [result] = await db.query(
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
          assignedStaffId || null,
          req.user.id,
          purpose,
          scheduledDate,
          preferredDate,
          initialStatus,
          notes,
        ],
      );

      insertId = result.insertId;
    }

    const appointment = await getAppointmentById(insertId);

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

        await conn.commit();
        transactionActive = false;
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
      const normalizedPreferredDate = normalizeDateTime(
        req.body.preferred_date,
      );
      if (!normalizedPreferredDate) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message: "Preferred appointment date and time is invalid.",
        });
      }
      preferredDate = normalizedPreferredDate;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "scheduled_date")) {
      const normalizedScheduledDate = normalizeDateTime(
        req.body.scheduled_date,
      );
      if (!normalizedScheduledDate) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message: "Scheduled appointment date and time is invalid.",
        });
      }
      scheduledDate = normalizedScheduledDate;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "assigned_staff_id")) {
      const requestedProviderId = toNullableInt(req.body.assigned_staff_id);

      if (!requestedProviderId) {
        assignedStaffId = null;
        status = "pending";
      } else {
        const providerRow = await lockAndValidateIndoorProvider(
          conn,
          requestedProviderId,
        );

        if (!providerRow) {
          await conn.rollback();
          transactionActive = false;
          return res.status(400).json({
            message:
              "Selected assigned staff member must be an active indoor staff member.",
          });
        }

        lockedAssignedStaffId = requestedProviderId;
        lockedProviderRow = providerRow;

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

    // Effective-state check: runs once, using the final computed values from
    // every branch above — not tied to which specific field the admin sent.
    // A reschedule-only request on an already-assigned/confirmed appointment
    // must still be checked against its existing (unchanged) assigned_staff_id.
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

    await conn.commit();
    transactionActive = false;
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
    if (conn) conn.release();
  }
};
