"use strict";

const db = require("../../config/db");
const {
  createNotificationSafe,
} = require("../../utils/notificationHelper");

const ALLOWED_CUSTOM_CANCELLATION_STAGES = new Set([
  "confirmed",
  "contract_released",
  "production",
  "ready_for_pickup",
  "shipping",
]);

const parsePositiveInt = (value) => {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const cleanReason = (value) => String(value || "").trim();

exports.getCustomerCancellationRequest = async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  try {
    const [rows] = await db.query(
      `SELECT
         ccr.id,
         ccr.order_id,
         ccr.reason,
         ccr.status,
         ccr.order_status_at_request,
         ccr.review_note,
         ccr.requested_at,
         ccr.reviewed_at,
         reviewer.name AS reviewed_by_name
       FROM custom_cancellation_requests ccr
       INNER JOIN orders o ON o.id = ccr.order_id
       LEFT JOIN users reviewer ON reviewer.id = ccr.reviewed_by
       WHERE ccr.order_id = ?
         AND o.customer_id = ?
         AND LOWER(COALESCE(o.order_type, '')) = 'blueprint'
       ORDER BY ccr.id DESC
       LIMIT 1`,
      [orderId, req.user.id],
    );

    return res.json({ request: rows[0] || null });
  } catch (err) {
    console.error("[customer cancellation get]", err);
    return res.status(500).json({
      message: "Failed to load cancellation request status.",
    });
  }
};

exports.requestCancellation = async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  const reason = cleanReason(req.body?.reason);

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  if (!reason) {
    return res.status(400).json({
      message: "Please provide a reason for requesting cancellation.",
    });
  }

  if (reason.length > 500) {
    return res.status(400).json({
      message: "Cancellation reason must be 500 characters or fewer.",
    });
  }

  let conn = null;
  let transactionActive = false;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [[order]] = await conn.query(
      `SELECT
         id,
         order_number,
         customer_id,
         order_type,
         status
       FROM orders
       WHERE id = ?
         AND customer_id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId, req.user.id],
    );

    if (!order) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Custom furniture order not found." });
    }

    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Cancellation requests from this page are for custom furniture orders only.",
      });
    }

    const currentStatus = normalize(order.status);
    if (!ALLOWED_CUSTOM_CANCELLATION_STAGES.has(currentStatus)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "This custom furniture order is not at a stage where a cancellation request can be submitted.",
      });
    }

    const [[agreementState]] = await conn.query(
      `SELECT EXISTS(
         SELECT 1
         FROM contracts c
         WHERE c.order_id = ?
           AND c.signed_at IS NOT NULL
       ) AS agreement_accepted`,
      [orderId],
    );

    if (Number(agreementState?.agreement_accepted || 0) !== 1) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "Use the quotation review or conversation flow before the Project Agreement is accepted.",
      });
    }

    const [[existingPending]] = await conn.query(
      `SELECT
         id,
         order_id,
         reason,
         status,
         order_status_at_request,
         review_note,
         requested_at,
         reviewed_at
       FROM custom_cancellation_requests
       WHERE order_id = ?
         AND status = 'pending'
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );

    if (existingPending) {
      await conn.commit();
      transactionActive = false;
      return res.status(200).json({
        message: "A cancellation request is already pending admin review.",
        request: existingPending,
        already_pending: true,
      });
    }

    const [insertResult] = await conn.query(
      `INSERT INTO custom_cancellation_requests
         (
           order_id,
           requested_by,
           reason,
           status,
           order_status_at_request,
           requested_at
         )
       VALUES (?, ?, ?, 'pending', ?, NOW())`,
      [orderId, req.user.id, reason, currentStatus],
    );

    const requestId = insertResult.insertId;

    const [admins] = await conn.query(
      `SELECT id
       FROM users
       WHERE role = 'admin'
         AND is_active = 1`,
    );

    for (const admin of admins) {
      await createNotificationSafe(conn, {
        userId: admin.id,
        type: "cancellation_request",
        title: "Cancellation Request Received",
        message: `A customer requested cancellation for ${order.order_number || `Order #${order.id}`}. Review it before changing the order status.`,
        targetType: "order",
        targetId: order.id,
        targetOrderId: order.id,
      });
    }

    await conn.commit();
    transactionActive = false;

    req.auditRecord = {
      id: requestId,
      old: null,
      new: {
        order_id: order.id,
        status: "pending",
        order_status_at_request: currentStatus,
        reason_provided: true,
      },
    };

    return res.status(201).json({
      message:
        "Cancellation request submitted. Your order remains active while our team reviews it.",
      request: {
        id: requestId,
        order_id: order.id,
        reason,
        status: "pending",
        order_status_at_request: currentStatus,
      },
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error("[customer cancellation request]", err);
    return res.status(500).json({
      message: "Failed to submit cancellation request.",
    });
  } finally {
    if (conn) conn.release();
  }
};
