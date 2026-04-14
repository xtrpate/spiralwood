const db = require("../../config/db");


const APPOINTMENT_STATUSES = [
  "pending",
  "assigned",
  "confirmed",
  "done",
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

const getAppointmentById = async (appointmentId) => {
  const [rows] = await db.query(
    `
    SELECT
      a.id,
      a.order_id,
      a.customer_id,
      a.handled_by,
      a.provider_id,
      a.request_owner_id,
      a.handled_by AS handled_by_id,
      a.provider_id AS assigned_to,
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
    LEFT JOIN users handler ON handler.id = a.handled_by
    LEFT JOIN users provider ON provider.id = a.provider_id
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
        a.handled_by,
        a.provider_id,
        a.request_owner_id,
        a.handled_by AS handled_by_id,
        a.provider_id AS assigned_to,
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
      LEFT JOIN users handler ON handler.id = a.handled_by
      LEFT JOIN users provider ON provider.id = a.provider_id
    `;

    const params = [];

    if (req.user.role === "staff") {
      sql += `
        WHERE a.provider_id = ?
      `;
      params.push(req.user.id);
    }

    sql += `
      ORDER BY
        FIELD(a.status, 'pending', 'assigned', 'confirmed', 'done', 'rejected', 'cancelled'),
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
    const providerId = toNullableInt(req.body.provider_id);

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

    let providerUser = null;
    if (providerId) {
      providerUser = await ensureStaffType(providerId, "indoor");
      if (!providerUser) {
        return res.status(400).json({
          message:
            "Selected appointment provider must be an active indoor staff member.",
        });
      }
    }

    const initialStatus = providerId ? "assigned" : "pending";

    const [result] = await db.query(
      `
      INSERT INTO appointments
        (
          order_id,
          customer_id,
          handled_by,
          provider_id,
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
        providerId || null,
        req.user.id,
        purpose,
        scheduledDate,
        preferredDate,
        initialStatus,
        notes,
      ],
    );

    const appointment = await getAppointmentById(result.insertId);

    return res.status(201).json({
      message: providerUser
        ? "Appointment created and assigned to indoor staff."
        : "Appointment request created successfully.",
      appointment,
      assigned_provider: providerUser
        ? { id: providerUser.id, name: providerUser.name }
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
  try {
    const appointmentId = toNullableInt(req.params.id);

    if (!appointmentId) {
      return res.status(400).json({ message: "Invalid appointment id" });
    }

    const [[existing]] = await db.query(
      `
      SELECT
        id,
        order_id,
        customer_id,
        handled_by,
        provider_id,
        request_owner_id,
        purpose,
        scheduled_date,
        preferred_date,
        status,
        notes
      FROM appointments
      WHERE id = ?
      LIMIT 1
      `,
      [appointmentId],
    );

    if (!existing) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const currentStatus = normalizeText(existing.status).toLowerCase();
    const isAdmin = req.user.role === "admin";

    if (["done", "rejected", "cancelled"].includes(currentStatus)) {
      return res.status(400).json({
        message: "This appointment can no longer be changed.",
      });
    }

    if (!isAdmin) {
      const isAssignedProvider =
        Number(existing.provider_id) === Number(req.user.id);

      if (!isAssignedProvider) {
        return res.status(403).json({
          message: "You can only update appointments assigned to you.",
        });
      }

      const requestedStatus = normalizeText(req.body.status).toLowerCase();
      const nextNotes =
        req.body.notes === undefined
          ? existing.notes ?? null
          : normalizeText(req.body.notes) || null;

      if (currentStatus === "assigned") {
        const isAccept = requestedStatus === "confirmed";
        const isReturnToAdmin = requestedStatus === "pending";

        if (!isAccept && !isReturnToAdmin) {
          return res.status(400).json({
            message:
              "Assigned appointment tasks can only be accepted or returned to admin.",
          });
        }

        await db.query(
          `
          UPDATE appointments
          SET
            provider_id = ?,
            status = ?,
            notes = ?,
            updated_at = NOW()
          WHERE id = ?
          `,
          [
            isReturnToAdmin ? null : existing.provider_id,
            isAccept ? "confirmed" : "pending",
            nextNotes,
            appointmentId,
          ],
        );

        const updated = await getAppointmentById(appointmentId);

        return res.json({
          message: isAccept
            ? "Appointment accepted successfully."
            : "Appointment returned to admin for reassignment.",
          appointment: updated,
        });
      }

      if (currentStatus !== "confirmed") {
        return res.status(400).json({
          message:
            "Only assigned or confirmed appointments can be updated by indoor staff.",
        });
      }

      if (!["done", "cancelled"].includes(requestedStatus)) {
        return res.status(400).json({
          message:
            "Indoor staff can only mark confirmed appointments as done or cancelled.",
        });
      }

      await db.query(
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

      const updated = await getAppointmentById(appointmentId);

      return res.json({
        message: "Appointment updated successfully.",
        appointment: updated,
      });
    }

    let handledBy = existing.handled_by ?? null;
    let providerId = existing.provider_id ?? null;
    let purpose = existing.purpose;
    let scheduledDate = existing.scheduled_date ?? null;
    let preferredDate = existing.preferred_date ?? null;
    let status = currentStatus;
    let notes = existing.notes ?? null;

    if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
      notes = normalizeText(req.body.notes) || null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "purpose")) {
      const requestedPurpose = normalizeText(req.body.purpose).toLowerCase();
      if (!APPOINTMENT_PURPOSES.includes(requestedPurpose)) {
        return res.status(400).json({ message: "Invalid appointment purpose" });
      }
      purpose = requestedPurpose;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "preferred_date")) {
      const normalizedPreferredDate = normalizeDateTime(req.body.preferred_date);
      if (!normalizedPreferredDate) {
        return res.status(400).json({
          message: "Preferred appointment date and time is invalid.",
        });
      }
      preferredDate = normalizedPreferredDate;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "scheduled_date")) {
      const normalizedScheduledDate = normalizeDateTime(req.body.scheduled_date);
      if (!normalizedScheduledDate) {
        return res.status(400).json({
          message: "Scheduled appointment date and time is invalid.",
        });
      }
      scheduledDate = normalizedScheduledDate;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "provider_id")) {
      const requestedProviderId = toNullableInt(req.body.provider_id);

      if (!requestedProviderId) {
        providerId = null;
        status = "pending";
      } else {
        const providerUser = await ensureStaffType(requestedProviderId, "indoor");

        if (!providerUser) {
          return res.status(400).json({
            message:
              "Selected appointment provider must be an active indoor staff member.",
          });
        }

        providerId = requestedProviderId;
        handledBy = req.user.id;
        status = "assigned";
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
      const requestedStatus = normalizeText(req.body.status).toLowerCase();

      if (!APPOINTMENT_STATUSES.includes(requestedStatus)) {
        return res.status(400).json({ message: "Invalid appointment status" });
      }

      if (requestedStatus === "confirmed" || requestedStatus === "done") {
        return res.status(400).json({
          message:
            "Only the assigned indoor staff can confirm or complete an appointment.",
        });
      }

      if (requestedStatus === "assigned" && !providerId) {
        return res.status(400).json({
          message: "Assign an indoor staff member before setting status to assigned.",
        });
      }

      if (requestedStatus === "pending") {
        providerId = null;
      }

      status = requestedStatus;
    }

    await db.query(
      `
      UPDATE appointments
      SET
        handled_by = ?,
        provider_id = ?,
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
        providerId,
        purpose,
        scheduledDate,
        preferredDate,
        status,
        notes,
        appointmentId,
      ],
    );

    const updated = await getAppointmentById(appointmentId);

    return res.json({
      message: "Appointment updated successfully.",
      appointment: updated,
    });
  } catch (err) {
    console.error("PATCH /api/pos/appointments/:id error:", err);
    return res.status(500).json({
      message: "Failed to update appointment",
      error: err.message,
    });
  }
};