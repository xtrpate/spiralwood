// controllers/staff/pos.deliveries.js
const fs = require("fs");
const db = require("../../config/db");
const { signUploadPath } = require("../../utils/signedUrl");
const {
  storeUploadBuffer,
  cleanupStoredUpload,
} = require("../../utils/adaptiveUpload");
const {
  parseDecimalToCentsStrict,
  centsToDecimalString,
  centsToAmount,
} = require("../../utils/paymentAmounts");
const {
  createNotification,
  createNotificationSafe,
} = require("../../utils/notificationHelper");

// PHASE 5 corrective patch — deletes ONLY the file this specific request
// freshly uploaded via multer (req.file), never an existing, already
// persisted deliveries.signed_receipt. Never called after a successful
// commit. Safe to call even when no file was uploaded (no-op). Logs a
// failure without throwing — cleanup must never replace or mask the
// original HTTP error already being returned.
const cleanupFreshUpload = (file) => {
  if (!file) return;

  if (file.storedUpload) {
    cleanupStoredUpload(file.storedUpload).catch((err) => {
      console.error(
        "[updateDeliveryStatus] failed to remove orphaned upload:",
        err,
      );
    });
    return;
  }

  if (!file.path || /^https?:\/\//i.test(file.path)) return;
  fs.unlink(file.path, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error(
        "[updateDeliveryStatus] failed to remove orphaned upload:",
        err,
      );
    }
  });
};

const DELIVERY_STATUSES = ["scheduled", "in_transit", "delivered", "failed"];

const DELIVERY_TRANSITIONS = {
  scheduled: ["scheduled", "in_transit"],
  in_transit: ["in_transit", "delivered", "failed"],
  delivered: ["delivered", "in_transit"],
  failed: [],
};
const normalizeText = (value) => String(value || "").trim();

const toNullableInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const normalizeDateTime = (value) => {
  const raw = normalizeText(value);
  if (!raw) return null;

  const cleaned = raw.replace("T", " ").trim();
  return cleaned.length === 16 ? `${cleaned}:00` : cleaned;
};

// Confirmed Delivery Schedule is date-only. This validator is used only
// for that field on delivery creation — it does not touch or replace
// normalizeDateTime above, which remains used as-is for the Requested
// Delivery Date. Accepts a bare "YYYY-MM-DD" value, or a full datetime
// beginning with "YYYY-MM-DD" and a valid time (from an older/cached
// frontend), and normalizes either to just "YYYY-MM-DD". Anchored
// start-to-end so no leading/trailing garbage is accepted, and the
// year/month/day must form a real calendar date. Pure string/integer
// handling — no Date object, no timezone conversion. Returns null for
// anything empty or malformed.
const CONFIRMED_SCHEDULE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

const isRealCalendarDate = (year, month, day) => {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
};

const normalizeConfirmedScheduleDateOnly = (value) => {
  const raw = normalizeText(value);
  if (!raw) return null;

  const match = CONFIRMED_SCHEDULE_PATTERN.exec(raw);
  if (!match) return null;

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!isRealCalendarDate(year, month, day)) return null;

  if (hourStr !== undefined) {
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    const second = secondStr !== undefined ? Number(secondStr) : 0;
    if (hour > 23 || minute > 59 || second > 59) return null;
  }

  return `${yearStr}-${monthStr}-${dayStr}`;
};

const buildSignedReceiptPath = (file) => {
  if (!file || !file.path) return null;
  return file.path; // Returns the live Cloudinary URL!
};

const DELIVERY_COLLECTION_METHODS = ["cash", "gcash", "bank_transfer"];

const toPositiveAmount = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Number(num.toFixed(2)) : 0;
};

const computeOrderPaymentStatus = ({
  totalAmount,
  verifiedTotal,
  hasPending,
  hasRejected,
}) => {
  if (verifiedTotal >= totalAmount && totalAmount > 0) return "paid";
  if (verifiedTotal > 0) return "partial";
  if (hasPending) return "pending";
  if (hasRejected) return "rejected";
  return "unpaid";
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

exports.getDeliverableOrders = async (req, res) => {
  try {
    // ── FIXED: Added empty array [] to prevent driver panics ──
    const [rows] = await db.query(
      `
      SELECT
        o.id,
        o.order_number,
        o.status,
        o.order_type,
        o.payment_method,
        o.payment_status,
        o.total,
        o.delivery_address,
        o.delivery_lat,
        o.delivery_lng,
        o.requested_delivery_date,
        o.delivery_request_notes,
        o.created_at,

        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone

      FROM orders o
      LEFT JOIN users customer ON customer.id = o.customer_id

      WHERE o.status IN ('confirmed', 'contract_released', 'production', 'shipping')
        AND COALESCE(o.delivery_address, '') <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM deliveries d2
          WHERE d2.order_id = o.id
        )

      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 200
    `,
      [], // Added this safety parameter
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /api/pos/deliverable-orders error:", err);
    res.status(500).json({ message: "Failed to load deliverable orders" });
  }
};

exports.getDeliveries = async (req, res) => {
  try {
    let sql = `
      SELECT
        d.id,
        d.order_id,
        d.driver_id,
        d.assigned_by,
        d.assigned_at,
        d.scheduled_date,
        d.delivered_date,
        d.address,
        d.status,
        d.notes,
        d.signed_receipt,
        d.updated_at,

        o.order_number,
        o.total,
        o.payment_method,
        o.payment_status,
        o.order_type,
        o.remaining_payment_method,
        o.delivery_lat,
        o.delivery_lng,
        o.created_at AS order_created_at,

        COALESCE(
          (
            SELECT SUM(
              CASE
                WHEN LOWER(pt.status) = 'verified' THEN pt.amount
                ELSE 0
              END
            )
            FROM payment_transactions pt
            WHERE pt.order_id = o.id
          ),
          0
        ) AS payment_verified_total,

        GREATEST(
          o.total - COALESCE(
            (
              SELECT SUM(
                CASE
                  WHEN LOWER(pt.status) = 'verified' THEN pt.amount
                  ELSE 0
                END
              )
              FROM payment_transactions pt
              WHERE pt.order_id = o.id
            ),
            0
          ),
          0
        ) AS payment_balance,

        (
          SELECT COUNT(*)
          FROM payment_transactions pt
          WHERE pt.order_id = o.id
            AND LOWER(pt.status) = 'pending'
        ) AS pending_payment_count,

        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone,

        driver.name AS driver_name
      FROM deliveries d
      INNER JOIN orders o ON o.id = d.order_id
      LEFT JOIN users customer ON customer.id = o.customer_id
      LEFT JOIN users driver ON driver.id = d.driver_id
    `;

    const params = [];

    if (req.user.role === "staff") {
      sql += ` WHERE d.driver_id = ? `;
      params.push(req.user.id);
    }

    sql += ` ORDER BY d.updated_at DESC, d.id DESC LIMIT 200`;

    const [rows] = await db.query(sql, params);
    rows.forEach((row) => {
      if (row.signed_receipt)
        row.signed_receipt = signUploadPath(row.signed_receipt);
    });
    res.json(rows);
  } catch (err) {
    console.error("GET /api/pos/deliveries error:", err);
    res.status(500).json({ message: "Failed to load deliveries" });
  }
};

exports.createDelivery = async (req, res) => {
  const orderId = toNullableInt(req.body.order_id);
  const driverId = toNullableInt(req.body.driver_id);
  const address = normalizeText(req.body.address);
  const scheduledDateRaw = normalizeText(req.body.scheduled_date);
  const scheduledDate = normalizeConfirmedScheduleDateOnly(scheduledDateRaw);
  const notes = normalizeText(req.body.notes) || "";

  if (!orderId || !driverId || !address || !scheduledDateRaw) {
    return res.status(400).json({
      message: "order_id, driver_id, address, and scheduled_date are required",
    });
  }

  if (!scheduledDate) {
    return res.status(400).json({
      message: "Confirmed delivery schedule must be a valid date.",
    });
  }

  try {
    const rider = await ensureStaffType(driverId, "delivery_rider");
    if (!rider) {
      return res.status(400).json({
        message: "Selected delivery rider was not found.",
      });
    }

    const [[order]] = await db.query(
      `
      SELECT
        o.id,
        o.order_number,
        o.customer_id,
        o.status,
        o.payment_status,
        o.delivery_address,
        o.requested_delivery_date,
        o.delivery_request_notes,
        o.notes,
        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone
      FROM orders o
      LEFT JOIN users customer ON customer.id = o.customer_id
      WHERE o.id = ?
      LIMIT 1
      `,
      [orderId],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const orderStatus = String(order.status || "").toLowerCase();

    if (["cancelled", "delivered", "completed"].includes(orderStatus)) {
      return res.status(400).json({
        message: "This order can no longer be scheduled for delivery",
      });
    }

    const [[existingDelivery]] = await db.query(
      `
      SELECT id, status
      FROM deliveries
      WHERE order_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [orderId],
    );

    if (existingDelivery) {
      return res.status(409).json({
        message:
          String(existingDelivery.status || "").toLowerCase() === "failed"
            ? "This order has a failed delivery. Use Reschedule on the latest failed attempt."
            : "A delivery already exists for this order.",
      });
    }

    const finalNotes = notes || null;

    const [result] = await db.query(
      `
      INSERT INTO deliveries (
        order_id,
        driver_id,
        assigned_by,
        assigned_at,
        scheduled_date,
        delivered_date,
        address,
        status,
        notes,
        signed_receipt
      )
      VALUES (?, ?, ?, NOW(), ?, NULL, ?, 'scheduled', ?, NULL)
      `,
      [orderId, driverId, req.user.id, scheduledDate, address, finalNotes],
    );

    const [[delivery]] = await db.query(
      `
      SELECT
        d.id,
        d.order_id,
        d.driver_id,
        d.assigned_by,
        d.assigned_at,
        d.scheduled_date,
        d.delivered_date,
        d.address,
        d.status,
        d.notes,
        d.signed_receipt,
        d.updated_at,

        o.order_number,
        o.total,
        o.payment_method,
        o.delivery_lat,
        o.delivery_lng,
        o.created_at AS order_created_at,

        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone,

        driver.name AS driver_name
      FROM deliveries d
      INNER JOIN orders o ON o.id = d.order_id
      LEFT JOIN users customer ON customer.id = o.customer_id
      LEFT JOIN users driver ON driver.id = d.driver_id
      WHERE d.id = ?
      LIMIT 1
      `,
      [result.insertId],
    );

    req.auditRecord = {
      id: result.insertId,
      old: null,
      new: {
        id: delivery?.id ?? result.insertId,
        order_id: delivery?.order_id ?? orderId,
        driver_id: delivery?.driver_id ?? driverId,
        assigned_by: delivery?.assigned_by ?? req.user.id,
        scheduled_date: delivery?.scheduled_date ?? scheduledDate,
        status: delivery?.status ?? "scheduled",
        address_present: Boolean(delivery?.address ?? address),
        notes_present: Boolean(delivery?.notes ?? finalNotes),
        signed_receipt_present: false,
        assigned_at: delivery?.assigned_at ?? null,
      },
    };

    if (delivery?.signed_receipt) {
      delivery.signed_receipt = signUploadPath(delivery.signed_receipt);
    }

    await createNotificationSafe(db, {
      userId: driverId,
      type: "assignment",
      title: "New Delivery Assigned",
      message: `You have been assigned a delivery for ${order.order_number}, scheduled for ${scheduledDate}.`,
      targetType: "delivery",
      targetId: delivery?.id ?? result.insertId,
      targetOrderId: orderId,
    });

    if (order.customer_id) {
      await createNotificationSafe(db, {
        userId: order.customer_id,
        type: "delivery_update",
        title: "Delivery Scheduled",
        message: `Your order ${order.order_number} has been scheduled for delivery on ${scheduledDate}.`,
        targetType: "order",
        targetId: orderId,
        targetOrderId: orderId,
      });
    }

    res.status(201).json({
      message: "Delivery scheduled successfully",
      delivery,
      assigned_driver: {
        id: rider.id,
        name: rider.name,
      },
    });
  } catch (err) {
    console.error("POST /api/pos/deliveries error:", err);
    res.status(500).json({ message: "Failed to schedule delivery" });
  }
};

exports.rescheduleDelivery = async (req, res) => {
  const sourceDeliveryId = toNullableInt(req.params.id);
  const driverId = toNullableInt(req.body.driver_id);
  const scheduledDateRaw = normalizeText(req.body.scheduled_date);
  const scheduledDate = normalizeConfirmedScheduleDateOnly(scheduledDateRaw);
  const rescheduleReason = normalizeText(req.body.reschedule_reason);
  const notes = normalizeText(req.body.notes) || "";

  if (!sourceDeliveryId) {
    return res.status(400).json({ message: "Invalid failed delivery id." });
  }

  if (!driverId || !scheduledDateRaw || !rescheduleReason) {
    return res.status(400).json({
      message: "driver_id, scheduled_date, and reschedule_reason are required.",
    });
  }

  if (!scheduledDate) {
    return res.status(400).json({
      message: "New delivery date must be a valid date.",
    });
  }

  if (rescheduleReason.length > 500) {
    return res.status(400).json({
      message: "Reschedule reason must be 500 characters or fewer.",
    });
  }

  let conn;
  try {
    const rider = await ensureStaffType(driverId, "delivery_rider");
    if (!rider) {
      return res.status(400).json({
        message: "Selected delivery rider was not found.",
      });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[sourceDelivery]] = await conn.query(
      `SELECT * FROM deliveries WHERE id = ? LIMIT 1 FOR UPDATE`,
      [sourceDeliveryId],
    );

    if (!sourceDelivery) {
      await conn.rollback();
      return res.status(404).json({ message: "Failed delivery not found." });
    }

    if (normalizeText(sourceDelivery.status).toLowerCase() !== "failed") {
      await conn.rollback();
      return res.status(409).json({
        message: "Only a failed delivery can be rescheduled.",
      });
    }

    const [[latestAttempt]] = await conn.query(
      `
      SELECT id, status
      FROM deliveries
      WHERE order_id = ?
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [sourceDelivery.order_id],
    );

    if (!latestAttempt || Number(latestAttempt.id) !== Number(sourceDeliveryId)) {
      await conn.rollback();
      return res.status(409).json({
        message: "Only the latest failed delivery attempt can be rescheduled.",
      });
    }

    const [[activeAttempt]] = await conn.query(
      `
      SELECT id, status
      FROM deliveries
      WHERE order_id = ?
        AND status <> 'failed'
      LIMIT 1
      FOR UPDATE
      `,
      [sourceDelivery.order_id],
    );

    if (activeAttempt) {
      await conn.rollback();
      return res.status(409).json({
        message: "A newer active delivery already exists for this order.",
      });
    }

    const [[order]] = await conn.query(
      `
      SELECT id, order_number, customer_id, status
      FROM orders
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [sourceDelivery.order_id],
    );

    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: "Linked order not found." });
    }

    const orderStatus = normalizeText(order.status).toLowerCase();
    if (["cancelled", "delivered", "completed"].includes(orderStatus)) {
      await conn.rollback();
      return res.status(409).json({
        message: "This order can no longer be rescheduled for delivery.",
      });
    }

    const finalNotes = [
      `Reschedule Reason: ${rescheduleReason}`,
      notes,
    ]
      .filter(Boolean)
      .join("\n");

    const [insertResult] = await conn.query(
      `
      INSERT INTO deliveries (
        order_id,
        driver_id,
        assigned_by,
        assigned_at,
        scheduled_date,
        delivered_date,
        address,
        status,
        notes,
        signed_receipt
      )
      VALUES (?, ?, ?, NOW(), ?, NULL, ?, 'scheduled', ?, NULL)
      `,
      [
        sourceDelivery.order_id,
        driverId,
        req.user.id,
        scheduledDate,
        sourceDelivery.address,
        finalNotes,
      ],
    );

    const [[delivery]] = await conn.query(
      `
      SELECT
        d.id,
        d.order_id,
        d.driver_id,
        d.assigned_by,
        d.assigned_at,
        d.scheduled_date,
        d.delivered_date,
        d.address,
        d.status,
        d.notes,
        d.signed_receipt,
        d.updated_at,
        o.order_number,
        o.total,
        o.payment_method,
        o.delivery_lat,
        o.delivery_lng,
        o.created_at AS order_created_at,
        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone,
        driver.name AS driver_name
      FROM deliveries d
      INNER JOIN orders o ON o.id = d.order_id
      LEFT JOIN users customer ON customer.id = o.customer_id
      LEFT JOIN users driver ON driver.id = d.driver_id
      WHERE d.id = ?
      LIMIT 1
      `,
      [insertResult.insertId],
    );

    await conn.commit();

    req.auditRecord = {
      id: insertResult.insertId,
      old: {
        source_delivery_id: sourceDeliveryId,
        source_status: sourceDelivery.status,
        source_scheduled_date: sourceDelivery.scheduled_date,
        source_driver_id: sourceDelivery.driver_id,
      },
      new: {
        id: delivery?.id ?? insertResult.insertId,
        order_id: sourceDelivery.order_id,
        driver_id: delivery?.driver_id ?? driverId,
        assigned_by: delivery?.assigned_by ?? req.user.id,
        scheduled_date: delivery?.scheduled_date ?? scheduledDate,
        status: delivery?.status ?? "scheduled",
        rescheduled_from_delivery_id: sourceDeliveryId,
        reschedule_reason_present: true,
        notes_present: Boolean(notes),
      },
    };

    await createNotificationSafe(db, {
      userId: driverId,
      type: "assignment",
      title: "Redelivery Assigned",
      message: `You have been assigned another delivery attempt for ${order.order_number}, scheduled for ${scheduledDate}.`,
      targetType: "delivery",
      targetId: delivery?.id ?? insertResult.insertId,
      targetOrderId: sourceDelivery.order_id,
    });

    if (order.customer_id) {
      await createNotificationSafe(db, {
        userId: order.customer_id,
        type: "delivery_update",
        title: "Redelivery Scheduled",
        message: `A new delivery schedule for your order ${order.order_number} has been arranged for ${scheduledDate}.`,
        targetType: "order",
        targetId: sourceDelivery.order_id,
        targetOrderId: sourceDelivery.order_id,
      });
    }

    res.status(201).json({
      message: "Delivery rescheduled successfully.",
      delivery,
      source_delivery_id: sourceDeliveryId,
      assigned_driver: {
        id: rider.id,
        name: rider.name,
      },
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("POST /api/pos/deliveries/:id/reschedule rollback error:", rollbackErr);
      }
    }
    console.error("POST /api/pos/deliveries/:id/reschedule error:", err);
    res.status(500).json({ message: "Failed to reschedule delivery." });
  } finally {
    if (conn) conn.release();
  }
};

exports.updateDeliveryStatus = async (req, res) => {
  const deliveryId = toNullableInt(req.params.id);
  const requestedStatus = normalizeText(req.body.status).toLowerCase();
  const nextNotes =
    req.body.notes === undefined
      ? undefined
      : normalizeText(req.body.notes) || null;

  let uploadedReceiptPath = null;

  if (req.file) {
    try {
      const storedReceipt = await storeUploadBuffer({
        file: req.file,
        folder: "deliveries",
      });
      req.file.storedUpload = storedReceipt;
      req.file.path = storedReceipt.file_url;
      uploadedReceiptPath = buildSignedReceiptPath(req.file);
    } catch (uploadErr) {
      console.error(
        "[updateDeliveryStatus] Proof of Delivery upload failed:",
        uploadErr?.message || uploadErr,
      );
      return res.status(Number(uploadErr?.status) || 502).json({
        message:
          Number(uploadErr?.status) === 400
            ? uploadErr.message
            : "Proof of Delivery upload is unavailable right now. Please try again.",
      });
    }
  }

  const collectedAmount = toPositiveAmount(req.body.collected_amount);
  const collectedPaymentMethod = normalizeText(
    req.body.payment_method,
  ).toLowerCase();
  const collectionNotes = normalizeText(req.body.collection_notes) || "";
  const failureReason = normalizeText(req.body.failure_reason);

  if (!deliveryId) {
    return res.status(400).json({ message: "Invalid delivery id" });
  }

  if (!DELIVERY_STATUSES.includes(requestedStatus)) {
    return res.status(400).json({ message: "Invalid delivery status" });
  }

  if (requestedStatus === "failed") {
    if (!failureReason) {
      return res.status(400).json({ message: "A failure reason is required." });
    }
    if (failureReason.length > 500) {
      return res.status(400).json({
        message: "Failure reason must be 500 characters or fewer.",
      });
    }
  }

  let conn;
  // PHASE 5 corrective patch — hoisted so the catch block below can
  // decide whether an orphaned upload needs cleanup on an unexpected
  // exception (e.g. the deliveries UPDATE or the payment_transactions
  // INSERT throwing). Both stay false for every non-blueprint request.
  let isBlueprintOrder = false;
  let isCompletingDeliveryNow = false;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT * FROM deliveries WHERE id = ? FOR UPDATE`,
      [deliveryId],
    );

    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: "Delivery not found" });
    }

    if (
      req.user.role === "staff" &&
      Number(existing.driver_id) !== Number(req.user.id)
    ) {
      await conn.rollback();
      return res.status(403).json({
        message: "You can only update deliveries assigned to you.",
      });
    }

    const [[order]] = await conn.query(
      `SELECT id, order_number, total, status, payment_status, customer_id,
              order_type, remaining_payment_method
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [existing.order_id],
    );

    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: "Linked order not found." });
    }

    const currentStatus = normalizeText(
      existing.status || "scheduled",
    ).toLowerCase();
    const allowedNextStatuses = DELIVERY_TRANSITIONS[currentStatus] || [
      currentStatus,
    ];

    if (!allowedNextStatuses.includes(requestedStatus)) {
      await conn.rollback();
      return res.status(400).json({
        message: `Invalid delivery transition from ${currentStatus} to ${requestedStatus}.`,
      });
    }

    isBlueprintOrder =
      normalizeText(order.order_type || "").toLowerCase() === "blueprint";
    isCompletingDeliveryNow =
      requestedStatus === "delivered" && currentStatus !== "delivered";

    // PHASE 5 -- BLUEPRINT RIDER FINAL CASH COLLECTION
    // Isolated branch inside this shared delivery-completion flow. Only
    // activates for order_type = 'blueprint' when the rider is
    // completing the delivery (the transition table only ever allows
    // "delivered" to be reached from "in_transit", so this always means
    // in_transit -> delivered). Standard, walk-in, COD, COP, and
    // ready-to-ship completions never enter this block and are
    // completely unaffected by it.
    let blueprintCashCollection = null;

    if (isBlueprintOrder && isCompletingDeliveryNow) {
      // 1) Assigned-rider authorization — checked FIRST, before the
      // order's lifecycle status is ever inspected, so an unauthorized
      // caller (admin, cashier, another rider, unrelated staff) never
      // learns whether the order is cancelled, completed, paid, or
      // otherwise active. Only the assigned, active delivery_rider may
      // proceed past this point.
      const isAssignedActiveRider =
        req.user.role === "staff" &&
        req.user.staff_type === "delivery_rider" &&
        Boolean(req.user.is_active) &&
        Number(existing.driver_id) === Number(req.user.id);

      if (!isAssignedActiveRider) {
        await conn.rollback();
        cleanupFreshUpload(req.file);
        return res.status(403).json({
          message:
            "Only the assigned delivery rider may complete this blueprint delivery.",
        });
      }

      // 2) Cancelled/completed order guard — only reached after
      // authorization succeeds. A legitimately fully paid ACTIVE order
      // is not rejected here (fully paid is handled later, where it
      // falls through to a normal delivery completion with no new
      // transaction) — this only blocks orders whose lifecycle has
      // already ended.
      const orderStatusNormalized = normalizeText(
        order.status || "",
      ).toLowerCase();

      if (["cancelled", "completed"].includes(orderStatusNormalized)) {
        await conn.rollback();
        cleanupFreshUpload(req.file);
        return res.status(409).json({
          reason_code: "BLUEPRINT_ORDER_NOT_DELIVERABLE",
          message:
            orderStatusNormalized === "cancelled"
              ? "This order has been cancelled and can no longer be delivered."
              : "This order has already been completed.",
        });
      }

      // 3) Fresh Proof of Delivery photo check.
      if (!uploadedReceiptPath) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Please upload a fresh Proof of Delivery photo to complete this delivery.",
        });
      }

      // Lock order for this branch: orders (locked above) -> deliveries
      // (locked above) -> payment_transactions (locked here). The
      // backend, never the client, computes the exact remaining balance.
      const [blueprintPaymentRows] = await conn.query(
        `SELECT id, amount, status
         FROM payment_transactions
         WHERE order_id = ?
         ORDER BY id
         FOR UPDATE`,
        [existing.order_id],
      );

      let verifiedCentsBlueprint = 0;
      let hasPendingPaymentBlueprint = false;
      let hasInvalidAmountBlueprint = false;

      for (const row of blueprintPaymentRows) {
        const cents = parseDecimalToCentsStrict(row.amount);
        if (cents === null) {
          hasInvalidAmountBlueprint = true;
          continue;
        }
        const st = normalizeText(row.status).toLowerCase();
        if (st === "verified") verifiedCentsBlueprint += cents;
        else if (st === "pending") hasPendingPaymentBlueprint = true;
      }

      if (hasInvalidAmountBlueprint) {
        await conn.rollback();
        cleanupFreshUpload(req.file);
        return res.status(409).json({
          message:
            "This order's payment records are inconsistent. Please contact support.",
        });
      }

      const orderTotalCentsBlueprint = parseDecimalToCentsStrict(order.total);
      if (orderTotalCentsBlueprint === null) {
        await conn.rollback();
        cleanupFreshUpload(req.file);
        return res.status(409).json({
          message: "This order's total is invalid. Please contact support.",
        });
      }

      const remainingCentsBlueprint = Math.max(
        0,
        orderTotalCentsBlueprint - verifiedCentsBlueprint,
      );
      // Cash on Delivery is the default remaining-balance method.
      // A null value means the customer did not opt into Online Payment.
      const remainingMethod =
        normalizeText(order.remaining_payment_method || "").toLowerCase() ||
        "cash";

      if (remainingCentsBlueprint > 0) {
        if (!remainingMethod) {
          await conn.rollback();
          cleanupFreshUpload(req.file);
          return res.status(409).json({
            reason_code: "REMAINING_PAYMENT_METHOD_REQUIRED",
            message:
              "The customer has not yet chosen how to pay the remaining balance.",
          });
        }

        if (remainingMethod === "paymongo") {
          await conn.rollback();
          cleanupFreshUpload(req.file);
          return res.status(409).json({
            reason_code: "ONLINE_PAYMENT_NOT_CONFIRMED",
            message: "Awaiting Online Payment Confirmation.",
          });
        }

        if (remainingMethod !== "cash") {
          await conn.rollback();
          cleanupFreshUpload(req.file);
          return res.status(409).json({
            message:
              "This order's remaining payment method is invalid. Please contact support.",
          });
        }

        if (hasPendingPaymentBlueprint) {
          await conn.rollback();
          cleanupFreshUpload(req.file);
          return res.status(409).json({
            message:
              "A payment is already awaiting admin review for this order.",
          });
        }

        blueprintCashCollection = {
          amountCents: remainingCentsBlueprint,
          verifiedCentsBefore: verifiedCentsBlueprint,
        };
      } else if (
        remainingMethod === "paymongo" &&
        normalizeText(order.payment_status || "").toLowerCase() !== "paid"
      ) {
        await conn.rollback();
        cleanupFreshUpload(req.file);
        return res.status(409).json({
          reason_code: "ONLINE_PAYMENT_NOT_CONFIRMED",
          message: "Awaiting Online Payment Confirmation.",
        });
      }
    }

    if (
      uploadedReceiptPath &&
      !["in_transit", "delivered"].includes(requestedStatus)
    ) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Proof of delivery can only be uploaded while the delivery is in transit or being marked delivered.",
      });
    }

    const nextSignedReceipt =
      uploadedReceiptPath || existing.signed_receipt || null;

    if (requestedStatus === "delivered" && !nextSignedReceipt) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Please upload the signed receipt / proof of delivery before marking this delivery as delivered.",
      });
    }

    const [[paymentSummaryBefore]] = await conn.query(
      `SELECT
         COALESCE(
           SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END),
           0
         ) AS verified_total,
         MAX(
           CASE
             WHEN LOWER(status) = 'pending' THEN 1
             ELSE 0
           END
         ) AS has_pending
       FROM payment_transactions
       WHERE order_id = ?`,
      [existing.order_id],
    );

    const totalAmount = Number(order.total || 0);
    const verifiedTotalBefore = Number(
      paymentSummaryBefore?.verified_total || 0,
    );
    // Never subtracted from currentBalance — a pending proof may later be
    // rejected, so the true outstanding balance always stays based only
    // on verified amounts.
    const currentBalance = Math.max(0, totalAmount - verifiedTotalBefore);
    const hasPendingPaymentBefore =
      Number(paymentSummaryBefore?.has_pending || 0) === 1;

    // isCompletingDeliveryNow is already declared above (needed earlier
    // for the Phase 5 blueprint branch's own gating).

    // One condition, used consistently everywhere a rider collection is
    // gated below — never a re-derived or slightly different version of
    // the same check. PHASE 5: explicitly excludes blueprint orders —
    // those are fully handled by the isolated branch above, which never
    // trusts collectedAmount/collectedPaymentMethod from the client.
    const shouldRecordDeliveryCollection =
      isCompletingDeliveryNow &&
      !isBlueprintOrder &&
      currentBalance > 0.009 &&
      !hasPendingPaymentBefore;

    // A real balance is due, but an existing real payment_transactions
    // row is already pending review — delivery still completes, but no
    // second, redundant pending collection is created. PHASE 5: also
    // excluded for blueprint orders (handled entirely above).
    const collectionSkippedForPendingPayment =
      isCompletingDeliveryNow &&
      !isBlueprintOrder &&
      currentBalance > 0.009 &&
      hasPendingPaymentBefore;

    if (shouldRecordDeliveryCollection) {
      if (!(collectedAmount > 0)) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Please enter the amount collected by the rider before completing this delivery.",
        });
      }

      if (!DELIVERY_COLLECTION_METHODS.includes(collectedPaymentMethod)) {
        await conn.rollback();
        return res.status(400).json({
          message: "Invalid collected payment method.",
        });
      }

      if (collectedAmount > currentBalance + 0.01) {
        await conn.rollback();
        return res.status(400).json({
          message: `Collected amount exceeds the remaining balance of ₱${currentBalance.toLocaleString(
            "en-PH",
            { minimumFractionDigits: 2 },
          )}.`,
        });
      }
    }

    let deliveredDate = existing.delivered_date || null;

    if (requestedStatus === "delivered" && currentStatus !== "delivered") {
      deliveredDate = new Date();
    } else if (
      requestedStatus === "delivered" &&
      currentStatus === "delivered"
    ) {
      deliveredDate = existing.delivered_date || new Date();
    } else {
      deliveredDate = null;
    }

    let nextNotesForUpdate =
      nextNotes !== undefined ? nextNotes : (existing.notes ?? null);

    if (requestedStatus === "failed") {
      const failureLine = `Failure Reason: ${failureReason}`;
      nextNotesForUpdate = nextNotesForUpdate
        ? `${nextNotesForUpdate}\n${failureLine}`
        : failureLine;
    }

    await conn.query(
      `
      UPDATE deliveries
      SET
        status = ?,
        notes = ?,
        delivered_date = ?,
        signed_receipt = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        requestedStatus,
        nextNotesForUpdate,
        deliveredDate,
        nextSignedReceipt,
        deliveryId,
      ],
    );

    if (shouldRecordDeliveryCollection) {
      const paymentNotes = [
        `Collected on delivery by ${req.user.name || "assigned rider"}.`,
        `Order: ${order.order_number || `#${existing.order_id}`}`,
        `Remaining balance collected on site.`,
        collectionNotes ? `Rider note: ${collectionNotes}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await conn.query(
        `INSERT INTO payment_transactions
          (
            order_id,
            amount,
            payment_method,
            proof_url,
            verified_by,
            verified_at,
            status,
            notes
          )
         VALUES (?, ?, ?, ?, NULL, NULL, 'pending', ?)`,
        [
          existing.order_id,
          collectedAmount,
          collectedPaymentMethod,
          nextSignedReceipt || null,
          paymentNotes,
        ],
      );
    }

    let blueprintPaymentTransactionId = null;

    // PHASE 5 -- server-calculated amount only. collected_amount and
    // payment_method from the request body are never read here.
    if (blueprintCashCollection) {
      const amountDecimalString = centsToDecimalString(
        blueprintCashCollection.amountCents,
      );

      const [blueprintInsertResult] = await conn.query(
        `INSERT INTO payment_transactions
          (order_id, amount, payment_method, proof_url, verified_by, verified_at, status, notes)
         VALUES (?, ?, 'cash', ?, NULL, NULL, 'pending', ?)`,
        [
          existing.order_id,
          amountDecimalString,
          nextSignedReceipt,
          "Collected on delivery.",
        ],
      );

      blueprintPaymentTransactionId = blueprintInsertResult.insertId;
    }

    const [[paymentRollup]] = await conn.query(
      `SELECT
         COALESCE(
           SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END),
           0
         ) AS verified_total,
         MAX(CASE WHEN LOWER(status) = 'pending' THEN 1 ELSE 0 END) AS has_pending,
         MAX(CASE WHEN LOWER(status) = 'rejected' THEN 1 ELSE 0 END) AS has_rejected
       FROM payment_transactions
       WHERE order_id = ?`,
      [existing.order_id],
    );

    const nextOrderPaymentStatus = computeOrderPaymentStatus({
      totalAmount,
      verifiedTotal: Number(paymentRollup?.verified_total || 0),
      hasPending: Number(paymentRollup?.has_pending || 0) === 1,
      hasRejected: Number(paymentRollup?.has_rejected || 0) === 1,
    });

    let nextOrderStatus = null;

    if (requestedStatus === "in_transit") {
      nextOrderStatus = "shipping";
    } else if (requestedStatus === "delivered") {
      nextOrderStatus = "delivered";
    } else if (requestedStatus === "failed") {
      nextOrderStatus = "shipping";
    }

    if (nextOrderStatus) {
      await conn.query(
        `UPDATE orders
         SET status = ?, payment_status = ?
         WHERE id = ?`,
        [nextOrderStatus, nextOrderPaymentStatus, existing.order_id],
      );
    } else {
      await conn.query(
        `UPDATE orders
         SET payment_status = ?
         WHERE id = ?`,
        [nextOrderPaymentStatus, existing.order_id],
      );
    }

    const isFailureUpdate = requestedStatus === "failed";
    const isStartingTransitNow =
      requestedStatus === "in_transit" && currentStatus === "scheduled";
    const isUndoingDeliveryNow =
      requestedStatus === "in_transit" && currentStatus === "delivered";

    if (
      existing.assigned_by &&
      Number(existing.assigned_by) !== Number(req.user.id)
    ) {
      await createNotification(conn, {
        userId: existing.assigned_by,
        type: "delivery_update",
        title: isFailureUpdate
          ? "Delivery Marked as Failed"
          : "Delivery Status Updated",
        message: isFailureUpdate
          ? `${req.user.name || "Assigned rider"} marked delivery #${deliveryId} as failed for ${order.order_number || `#${existing.order_id}`}. Reason: ${failureReason}.`
          : `${req.user.name || "Assigned rider"} updated delivery #${deliveryId} to ${requestedStatus.replace(/_/g, " ")}.`,
        targetType: "delivery",
        targetId: deliveryId,
        targetOrderId: existing.order_id,
      });
    }

    if (isFailureUpdate && order.customer_id) {
      await createNotificationSafe(conn, {
        userId: order.customer_id,
        type: "delivery_update",
        title: "Delivery Attempt Unsuccessful",
        message: `We attempted to deliver your order ${order.order_number || `#${existing.order_id}`} but were unable to complete it. Our team will contact you to arrange another delivery.`,
        targetType: "order",
        targetId: existing.order_id,
        targetOrderId: existing.order_id,
      });
    }

    if (isStartingTransitNow && order.customer_id) {
      await createNotificationSafe(conn, {
        userId: order.customer_id,
        type: "delivery_update",
        title: "Your Delivery Is on the Way",
        message: `Your order ${order.order_number || `#${existing.order_id}`} is now on the way.`,
        targetType: "order",
        targetId: existing.order_id,
        targetOrderId: existing.order_id,
      });
    }

    if (isCompletingDeliveryNow && order.customer_id) {
      await createNotificationSafe(conn, {
        userId: order.customer_id,
        type: "delivery_update",
        title: "Your Order Has Arrived",
        message: `Your order ${order.order_number || `#${existing.order_id}`} has been delivered. Thank you for choosing Spiral Wood Services.`,
        targetType: "order",
        targetId: existing.order_id,
        targetOrderId: existing.order_id,
      });
    }

    if (isUndoingDeliveryNow && order.customer_id) {
      await createNotificationSafe(conn, {
        userId: order.customer_id,
        type: "delivery_update",
        title: "Delivery Status Corrected",
        message: `The delivery status for your order ${order.order_number || `#${existing.order_id}`} was corrected. Our team is still completing your delivery.`,
        targetType: "order",
        targetId: existing.order_id,
        targetOrderId: existing.order_id,
      });
    }

    if (existing.assigned_by && shouldRecordDeliveryCollection) {
      await createNotification(conn, {
        userId: existing.assigned_by,
        type: "payment_review",
        title: "Delivery Payment Pending Review",
        message: `${req.user.name || "Assigned rider"} recorded ₱${collectedAmount.toLocaleString(
          "en-PH",
          { minimumFractionDigits: 2 },
        )} collected on delivery for ${order.order_number || `#${existing.order_id}`}. Review the pending payment before completing the order.`,
        targetType: "order",
        targetId: order.id,
        targetOrderId: order.id,
      });
    }

    const [[updated]] = await conn.query(
      `
      SELECT
        d.id,
        d.order_id,
        d.driver_id,
        d.assigned_by,
        d.assigned_at,
        d.scheduled_date,
        d.delivered_date,
        d.address,
        d.status,
        d.notes,
        d.signed_receipt,
        d.updated_at,

        o.order_number,
        o.total,
        o.payment_method,
        o.payment_status,
        o.order_type,
        o.remaining_payment_method,
        o.delivery_lat,
        o.delivery_lng,
        o.created_at AS order_created_at,

        COALESCE(
          (
            SELECT SUM(
              CASE
                WHEN LOWER(pt.status) = 'verified' THEN pt.amount
                ELSE 0
              END
            )
            FROM payment_transactions pt
            WHERE pt.order_id = o.id
          ),
          0
        ) AS payment_verified_total,

        GREATEST(
          o.total - COALESCE(
            (
              SELECT SUM(
                CASE
                  WHEN LOWER(pt.status) = 'verified' THEN pt.amount
                  ELSE 0
                END
              )
              FROM payment_transactions pt
              WHERE pt.order_id = o.id
            ),
            0
          ),
          0
        ) AS payment_balance,

        (
          SELECT COUNT(*)
          FROM payment_transactions pt
          WHERE pt.order_id = o.id
            AND LOWER(pt.status) = 'pending'
        ) AS pending_payment_count,

        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone,

        driver.name AS driver_name
      FROM deliveries d
      INNER JOIN orders o ON o.id = d.order_id
      LEFT JOIN users customer ON customer.id = o.customer_id
      LEFT JOIN users driver ON driver.id = d.driver_id
      WHERE d.id = ?
      LIMIT 1
      `,
      [deliveryId],
    );

    await conn.commit();

    // PHASE 5 -- dedicated audit for the blueprint rider cash collection,
    // written only after the transaction has actually committed. Kept
    // separate from the generic "update_delivery_status" audit below
    // (which is logged by the route's own logAction middleware) since
    // this needs its own action name. Only safe, structured, non-PII
    // values -- no customer name/address/phone, no raw file paths.
    if (blueprintCashCollection && blueprintPaymentTransactionId) {
      try {
        await db.query(
          `INSERT INTO audit_logs
             (user_id, action, table_name, record_id, old_values, new_values, ip_address)
           VALUES (?, 'confirm_blueprint_rider_cash_collection', 'payment_transactions', ?, ?, ?, ?)`,
          [
            req.user.id,
            blueprintPaymentTransactionId,
            JSON.stringify({
              collection_status: "pending",
            }),
            JSON.stringify({
              order_id: existing.order_id,
              delivery_id: deliveryId,
              payment_transaction_id: blueprintPaymentTransactionId,
              amount_collected: centsToAmount(
                blueprintCashCollection.amountCents,
              ),
              previous_verified_total: centsToAmount(
                blueprintCashCollection.verifiedCentsBefore,
              ),
              current_verified_remaining_balance: centsToAmount(
                blueprintCashCollection.amountCents,
              ),
              collection_status: "pending",
            }),
            req.ip || null,
          ],
        );
      } catch (auditErr) {
        // Non-blocking -- never turn a successful collection into a
        // failed response because of an audit-logging error.
        console.error(
          "[updateDeliveryStatus confirm_blueprint_rider_cash_collection audit]",
          auditErr,
        );
      }
    }

    req.auditRecord = {
      id: deliveryId,
      old: {
        status: currentStatus,
        driver_id: existing.driver_id,
        scheduled_date: existing.scheduled_date,
        delivered_date: existing.delivered_date,
        notes_present: Boolean(existing.notes),
        signed_receipt_present: Boolean(existing.signed_receipt),
      },
      new: {
        status: updated?.status ?? requestedStatus,
        driver_id: updated?.driver_id ?? existing.driver_id,
        scheduled_date: updated?.scheduled_date ?? existing.scheduled_date,
        delivered_date: updated?.delivered_date ?? deliveredDate,
        notes_present_before: Boolean(existing.notes),
        notes_present_after: Boolean(updated?.notes),
        notes_changed: (existing.notes ?? null) !== (updated?.notes ?? null),
        signed_receipt_present: Boolean(nextSignedReceipt),
        receipt_uploaded_this_update: Boolean(uploadedReceiptPath),
        order_id: existing.order_id,
        order_status_before: order.status,
        order_status_after: nextOrderStatus || order.status,
        order_payment_status_before: order.payment_status,
        order_payment_status_after: nextOrderPaymentStatus,
        payment_transaction_created: shouldRecordDeliveryCollection,
        payment_collected: shouldRecordDeliveryCollection
          ? { amount: collectedAmount, method: collectedPaymentMethod }
          : null,
        collection_skipped_due_to_pending_payment:
          collectionSkippedForPendingPayment,
      },
    };

    let message = "Delivery updated successfully";

    if (blueprintCashCollection) {
      message =
        "Delivery completed. The collected cash is now pending admin verification.";
    } else if (shouldRecordDeliveryCollection) {
      message =
        "Delivery completed. Final collected payment is now pending admin verification.";
    } else if (collectionSkippedForPendingPayment) {
      message =
        "Delivery completed. An existing payment proof is already pending admin verification, so no additional collection was recorded.";
    } else if (requestedStatus === "delivered" && uploadedReceiptPath) {
      message =
        "Delivery marked as delivered and signed receipt uploaded successfully";
    } else if (requestedStatus === "delivered") {
      message = "Delivery marked as delivered successfully";
    } else if (requestedStatus === "failed") {
      message = "Delivery marked as failed successfully";
    } else if (uploadedReceiptPath) {
      message = "Signed receipt uploaded successfully";
    } else if (requestedStatus !== currentStatus) {
      message = "Delivery status updated successfully";
    }

    if (updated?.signed_receipt) {
      updated.signed_receipt = signUploadPath(updated.signed_receipt);
    }

    res.json({
      message,
      delivery: updated,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    // PHASE 5 corrective patch: only for a blueprint completion attempt
    // that had already passed its own gate and uploaded a fresh photo —
    // never for standard/COD/COP requests, and never touches an
    // existing deliveries.signed_receipt.
    if (isBlueprintOrder && isCompletingDeliveryNow) {
      cleanupFreshUpload(req.file);
    }
    console.error("PATCH /api/pos/deliveries/:id/status error:", err);
    res.status(500).json({ message: "Failed to update delivery status" });
  } finally {
    if (conn) conn.release();
  }
};

/* ── RIDER DASHBOARD STATS ── */
exports.getRiderDashboard = async (req, res) => {
  try {
    const riderId = req.user.id;

    // Fetch all deliveries assigned to this rider regardless of date
    const [deliveries] = await db.query(
      `SELECT status FROM deliveries WHERE driver_id = ?`,
      [riderId],
    );

    let pendingCount = 0;
    let completedCount = 0;

    deliveries.forEach((d) => {
      if (d.status === "scheduled" || d.status === "in_transit") {
        pendingCount++;
      } else if (d.status === "delivered") {
        completedCount++;
      }
    });

    res.json({
      pending_today: pendingCount,
      completed_today: completedCount,
      total_deliveries: deliveries.length,
    });
  } catch (err) {
    console.error("[Rider Dashboard Error]", err);
    res.status(500).json({ message: "Failed to load dashboard stats" });
  }
};

/* ── RIDER DELIVERY HISTORY ── */
exports.getRiderHistory = async (req, res) => {
  try {
    const riderId = req.user.id;

    // Fetch completed/failed deliveries and safely grab online or walk-in customer names
    const [history] = await db.query(
      `SELECT 
         d.id AS delivery_id, 
         o.order_number, 
         o.order_type,
         COALESCE(o.walkin_customer_name, u.name, 'Walk-in Customer') AS customer_name, 
         d.address, 
         d.status, 
         o.payment_status, 
         o.total, 
         o.delivery_lat,
         o.delivery_lng,
         d.delivered_date, 
         d.updated_at 
       FROM deliveries d
       JOIN orders o ON d.order_id = o.id
       LEFT JOIN users u ON u.id = o.customer_id
       WHERE d.driver_id = ? AND d.status IN ('delivered', 'failed')
       ORDER BY d.updated_at DESC
       LIMIT 50`,
      [riderId],
    );
    res.json(history);
  } catch (err) {
    console.error("[Rider History Error]", err);
    res.status(500).json({ message: "Failed to load delivery history" });
  }
};
