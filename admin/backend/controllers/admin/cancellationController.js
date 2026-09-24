"use strict";

const db = require("../../config/db");
const { createNotificationSafe } = require("../../utils/notificationHelper");
const {
  releaseBlueprintMaterialsForCancellation,
  BlueprintMaterialReleaseError,
} = require("../../services/blueprintMaterialReleaseService");
const { emitOrderStatusUpdate } = require("../../utils/orderStatusSocket");
const {
  getPhilippineDateBoundsUtc,
  getPhilippineDateKey,
} = require("../../utils/philippineTime");

const APPROVABLE_ORDER_STATUSES = new Set([
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

const cleanNote = (value) => String(value || "").trim();

const loadRequestOrderId = async (requestId) => {
  const [[row]] = await db.query(
    `SELECT order_id
     FROM custom_cancellation_requests
     WHERE id = ?
     LIMIT 1`,
    [requestId],
  );
  return row ? Number(row.order_id) : null;
};

const isRetryableLockError = (err) =>
  err?.code === "ER_LOCK_DEADLOCK" ||
  err?.code === "ER_LOCK_WAIT_TIMEOUT" ||
  Number(err?.errno) === 1213 ||
  Number(err?.errno) === 1205;

const TRANSACTION_REPORT_DATE_FILTERS = new Set([
  "all",
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "this_year",
  "custom",
]);

const formatUtcDateKey = (date) =>
  [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");

const shiftDateKey = (dateKey, days) => {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return formatUtcDateKey(new Date(Date.UTC(year, month - 1, day + days)));
};

const buildTransactionReportDateRange = ({
  dateFilter,
  from,
  to,
}) => {
  const normalizedFilter = String(dateFilter || "all")
    .trim()
    .toLowerCase();

  if (!TRANSACTION_REPORT_DATE_FILTERS.has(normalizedFilter)) {
    const error = new Error("Invalid transaction report date filter.");
    error.status = 400;
    throw error;
  }

  if (normalizedFilter === "all") {
    return { startUtc: null, endUtc: null };
  }

  if (normalizedFilter === "custom") {
    const fromKey = String(from || "").trim();
    const toKey = String(to || "").trim();

    if (fromKey && toKey && fromKey > toKey) {
      const error = new Error("Start date cannot be after end date.");
      error.status = 400;
      throw error;
    }

    try {
      return {
        startUtc: fromKey
          ? getPhilippineDateBoundsUtc(fromKey).startUtc
          : null,
        endUtc: toKey
          ? getPhilippineDateBoundsUtc(toKey).nextStartUtc
          : null,
      };
    } catch {
      const error = new Error(
        "Transaction report dates must use valid YYYY-MM-DD values.",
      );
      error.status = 400;
      throw error;
    }
  }

  const todayKey = getPhilippineDateKey();
  const [year, month, day] = todayKey.split("-").map(Number);

  let startKey = todayKey;
  let endKey = shiftDateKey(todayKey, 1);

  if (normalizedFilter === "yesterday") {
    startKey = shiftDateKey(todayKey, -1);
    endKey = todayKey;
  } else if (normalizedFilter === "this_week") {
    // Preserve the Transaction Report's existing Sunday-Saturday week.
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    startKey = shiftDateKey(todayKey, -dayOfWeek);
    endKey = shiftDateKey(startKey, 7);
  } else if (normalizedFilter === "this_month") {
    startKey = [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      "01",
    ].join("-");
    endKey = formatUtcDateKey(new Date(Date.UTC(year, month, 1)));
  } else if (normalizedFilter === "this_year") {
    startKey = `${String(year).padStart(4, "0")}-01-01`;
    endKey = `${String(year + 1).padStart(4, "0")}-01-01`;
  }

  return {
    startUtc: getPhilippineDateBoundsUtc(startKey).startUtc,
    endUtc: getPhilippineDateBoundsUtc(endKey).startUtc,
  };
};

const CANCELLATION_RECORDS_FROM_SQL = `
  FROM (
    SELECT
      CONCAT('custom_request:', ccr.id) AS record_key,
      'custom_furniture' AS record_type,
      'custom_request' AS record_source,
      ccr.id AS request_id,
      ccr.order_id,
      ccr.requested_by,
      ccr.reason,
      CAST(ccr.status AS CHAR) AS status,
      ccr.order_status_at_request,
      ccr.reviewed_by,
      ccr.review_note,
      ccr.requested_at,
      ccr.reviewed_at
    FROM custom_cancellation_requests ccr

    UNION ALL

    SELECT
      CONCAT('ready_made:', ready.id) AS record_key,
      'ready_made' AS record_type,
      'ready_made_order' AS record_source,
      NULL AS request_id,
      ready.id AS order_id,
      ready.customer_id AS requested_by,
      COALESCE(
        NULLIF(TRIM(ready.cancellation_reason), ''),
        'Order cancelled'
      ) AS reason,
      'cancelled' AS status,
      NULL AS order_status_at_request,
      NULL AS reviewed_by,
      NULL AS review_note,
      COALESCE(ready.cancelled_at, ready.updated_at, ready.created_at) AS requested_at,
      ready.cancelled_at AS reviewed_at
    FROM orders ready
    WHERE LOWER(
      COALESCE(NULLIF(TRIM(ready.order_type), ''), 'standard')
    ) = 'standard'
      AND LOWER(COALESCE(ready.status, '')) = 'cancelled'

    UNION ALL

    SELECT
      CONCAT('custom_legacy:', legacy.id) AS record_key,
      'custom_furniture' AS record_type,
      'custom_legacy' AS record_source,
      NULL AS request_id,
      legacy.id AS order_id,
      legacy.customer_id AS requested_by,
      COALESCE(
        NULLIF(TRIM(legacy.cancellation_reason), ''),
        'Historical custom furniture cancellation'
      ) AS reason,
      'cancelled' AS status,
      NULL AS order_status_at_request,
      NULL AS reviewed_by,
      NULL AS review_note,
      COALESCE(legacy.cancelled_at, legacy.updated_at, legacy.created_at) AS requested_at,
      legacy.cancelled_at AS reviewed_at
    FROM orders legacy
    WHERE LOWER(COALESCE(legacy.order_type, '')) = 'blueprint'
      AND LOWER(COALESCE(legacy.status, '')) = 'cancelled'
      AND NOT EXISTS (
        SELECT 1
        FROM custom_cancellation_requests existing_request
        WHERE existing_request.order_id = legacy.id
      )
  ) records
  INNER JOIN orders o ON o.id = records.order_id
  LEFT JOIN users customer ON customer.id = o.customer_id
  LEFT JOIN users requester ON requester.id = records.requested_by
  LEFT JOIN users reviewer ON reviewer.id = records.reviewed_by
`;

exports.listRequests = async (req, res) => {
  try {
    const transactionReportMode =
      String(req.query?.transaction_report || "").trim() === "1";

    // Preserve the existing operational Cancellation Requests page contract:
    // no report mode => the historical array response remains unchanged.
    if (!transactionReportMode) {
      const [rows] = await db.query(
        `SELECT
           records.record_key,
           records.record_type,
           records.record_source,
           records.request_id AS id,
           records.request_id,
           records.order_id,
           records.requested_by,
           records.reason,
           records.status,
           records.order_status_at_request,
           records.reviewed_by,
           records.review_note,
           records.requested_at,
           records.reviewed_at,
           o.order_number,
           o.status AS order_status,
           o.total,
           o.payment_status,
           o.fulfillment_method,
           COALESCE(
             NULLIF(TRIM(o.walkin_customer_name), ''),
             customer.name,
             'Customer'
           ) AS customer_name,
           COALESCE(
             requester.name,
             customer.name,
             NULLIF(TRIM(o.walkin_customer_name), ''),
             'Customer'
           ) AS requested_by_name,
           reviewer.name AS reviewed_by_name,
           COALESCE(
             (
               SELECT SUM(
                 CASE
                   WHEN LOWER(COALESCE(pt.status, '')) = 'verified'
                   THEN pt.amount
                   ELSE 0
                 END
               )
               FROM payment_transactions pt
               WHERE pt.order_id = o.id
             ),
             0
           ) AS verified_payment_total,
           (
             SELECT COUNT(*)
             FROM payment_transactions pt
             WHERE pt.order_id = o.id
               AND LOWER(COALESCE(pt.status, '')) = 'pending'
           ) AS pending_payment_count,
           CASE
             WHEN o.paymongo_session_id IS NOT NULL
               OR o.payment_url IS NOT NULL
             THEN 1
             ELSE 0
           END AS payment_session_active,
           (
             SELECT COUNT(*)
             FROM project_tasks task
             WHERE task.order_id = o.id
           ) AS production_task_count,
           (
             SELECT COUNT(*)
             FROM project_tasks task
             WHERE task.order_id = o.id
               AND LOWER(COALESCE(task.status, '')) = 'completed'
           ) AS production_completed_count,
           (
             SELECT d.status
             FROM deliveries d
             WHERE d.order_id = o.id
             ORDER BY d.id DESC
             LIMIT 1
           ) AS delivery_status
         FROM (
           SELECT
             CONCAT('custom_request:', ccr.id) AS record_key,
             'custom_furniture' AS record_type,
             'custom_request' AS record_source,
             ccr.id AS request_id,
             ccr.order_id,
             ccr.requested_by,
             ccr.reason,
             CAST(ccr.status AS CHAR) AS status,
             ccr.order_status_at_request,
             ccr.reviewed_by,
             ccr.review_note,
             ccr.requested_at,
             ccr.reviewed_at
           FROM custom_cancellation_requests ccr

           UNION ALL

           SELECT
             CONCAT('ready_made:', ready.id) AS record_key,
             'ready_made' AS record_type,
             'ready_made_order' AS record_source,
             NULL AS request_id,
             ready.id AS order_id,
             ready.customer_id AS requested_by,
             COALESCE(
               NULLIF(TRIM(ready.cancellation_reason), ''),
               'Order cancelled'
             ) AS reason,
             'cancelled' AS status,
             NULL AS order_status_at_request,
             NULL AS reviewed_by,
             NULL AS review_note,
             COALESCE(ready.cancelled_at, ready.updated_at, ready.created_at) AS requested_at,
             ready.cancelled_at AS reviewed_at
           FROM orders ready
           WHERE LOWER(
             COALESCE(NULLIF(TRIM(ready.order_type), ''), 'standard')
           ) = 'standard'
             AND LOWER(COALESCE(ready.status, '')) = 'cancelled'

           UNION ALL

           SELECT
             CONCAT('custom_legacy:', legacy.id) AS record_key,
             'custom_furniture' AS record_type,
             'custom_legacy' AS record_source,
             NULL AS request_id,
             legacy.id AS order_id,
             legacy.customer_id AS requested_by,
             COALESCE(
               NULLIF(TRIM(legacy.cancellation_reason), ''),
               'Historical custom furniture cancellation'
             ) AS reason,
             'cancelled' AS status,
             NULL AS order_status_at_request,
             NULL AS reviewed_by,
             NULL AS review_note,
             COALESCE(legacy.cancelled_at, legacy.updated_at, legacy.created_at) AS requested_at,
             legacy.cancelled_at AS reviewed_at
           FROM orders legacy
           WHERE LOWER(COALESCE(legacy.order_type, '')) = 'blueprint'
             AND LOWER(COALESCE(legacy.status, '')) = 'cancelled'
             AND NOT EXISTS (
               SELECT 1
               FROM custom_cancellation_requests existing_request
               WHERE existing_request.order_id = legacy.id
             )
         ) records
         INNER JOIN orders o ON o.id = records.order_id
         LEFT JOIN users customer ON customer.id = o.customer_id
         LEFT JOIN users requester ON requester.id = records.requested_by
         LEFT JOIN users reviewer ON reviewer.id = records.reviewed_by
         ORDER BY records.requested_at DESC, records.order_id DESC
         LIMIT 1000`,
      );

      return res.json(rows);
    }

    const {
      page = 1,
      limit = 20,
      search,
      date_filter,
      from,
      to,
      include_summary,
    } = req.query || {};

    const reportPage = parsePositiveInt(page) || 1;
    const reportLimit = Math.min(parsePositiveInt(limit) || 20, 500);
    const offset = (reportPage - 1) * reportLimit;
    const includeSummary =
      String(include_summary || "1").trim() !== "0";

    const where = [];
    const params = [];

    const { startUtc, endUtc } = buildTransactionReportDateRange({
      dateFilter: date_filter,
      from,
      to,
    });

    if (startUtc) {
      where.push("records.requested_at >= ?");
      params.push(startUtc);
    }

    if (endUtc) {
      where.push("records.requested_at < ?");
      params.push(endUtc);
    }

    const normalizedSearch = String(search || "").trim();

    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;

      where.push(`(
        COALESCE(records.record_key, '') LIKE ?
        OR CAST(COALESCE(records.request_id, 0) AS CHAR) LIKE ?
        OR COALESCE(o.order_number, '') LIKE ?
        OR CAST(records.order_id AS CHAR) LIKE ?
        OR COALESCE(NULLIF(TRIM(o.walkin_customer_name), ''), customer.name, '') LIKE ?
        OR COALESCE(requester.name, '') LIKE ?
        OR COALESCE(reviewer.name, '') LIKE ?
        OR COALESCE(records.reason, '') LIKE ?
        OR COALESCE(records.review_note, '') LIKE ?
        OR COALESCE(records.record_type, '') LIKE ?
        OR COALESCE(records.record_source, '') LIKE ?
        OR COALESCE(records.status, '') LIKE ?
        OR COALESCE(records.order_status_at_request, '') LIKE ?
        OR COALESCE(o.status, '') LIKE ?
        OR COALESCE(o.payment_status, '') LIKE ?
        OR COALESCE(o.fulfillment_method, '') LIKE ?
        OR CAST(COALESCE(o.total, 0) AS CHAR) LIKE ?
      )`);

      params.push(...Array(17).fill(pattern));
    }

    const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";

    const [rows] = await db.query(
      `SELECT
         records.record_key,
         records.record_type,
         records.record_source,
         records.request_id AS id,
         records.request_id,
         records.order_id,
         records.requested_by,
         records.reason,
         records.status,
         records.order_status_at_request,
         records.reviewed_by,
         records.review_note,
         records.requested_at,
         records.reviewed_at,
         o.order_number,
         o.status AS order_status,
         o.total,
         o.payment_status,
         o.fulfillment_method,
         COALESCE(
           NULLIF(TRIM(o.walkin_customer_name), ''),
           customer.name,
           'Customer'
         ) AS customer_name,
         COALESCE(
           requester.name,
           customer.name,
           NULLIF(TRIM(o.walkin_customer_name), ''),
           'Customer'
         ) AS requested_by_name,
         reviewer.name AS reviewed_by_name,
         COALESCE(
           (
             SELECT SUM(
               CASE
                 WHEN LOWER(COALESCE(pt.status, '')) = 'verified'
                 THEN pt.amount
                 ELSE 0
               END
             )
             FROM payment_transactions pt
             WHERE pt.order_id = o.id
           ),
           0
         ) AS verified_payment_total,
         (
           SELECT COUNT(*)
           FROM payment_transactions pt
           WHERE pt.order_id = o.id
             AND LOWER(COALESCE(pt.status, '')) = 'pending'
         ) AS pending_payment_count,
         CASE
           WHEN o.paymongo_session_id IS NOT NULL
             OR o.payment_url IS NOT NULL
           THEN 1
           ELSE 0
         END AS payment_session_active,
         (
           SELECT COUNT(*)
           FROM project_tasks task
           WHERE task.order_id = o.id
         ) AS production_task_count,
         (
           SELECT COUNT(*)
           FROM project_tasks task
           WHERE task.order_id = o.id
             AND LOWER(COALESCE(task.status, '')) = 'completed'
         ) AS production_completed_count,
         (
           SELECT d.status
           FROM deliveries d
           WHERE d.order_id = o.id
           ORDER BY d.id DESC
           LIMIT 1
         ) AS delivery_status
       ${CANCELLATION_RECORDS_FROM_SQL}
       ${whereSql}
       ORDER BY records.requested_at DESC, records.order_id DESC
       LIMIT ? OFFSET ?`,
      [...params, reportLimit, offset],
    );

    const response = { records: rows };

    if (includeSummary) {
      const [[summaryRow]] = await db.query(
        `SELECT
           COUNT(*) AS total_records,
           COALESCE(
             SUM(CASE
               WHEN LOWER(COALESCE(records.status, '')) = 'pending'
               THEN 1 ELSE 0
             END),
             0
           ) AS pending_review,
           COALESCE(
             SUM(CASE
               WHEN LOWER(COALESCE(records.status, '')) IN ('approved', 'cancelled')
               THEN 1 ELSE 0
             END),
             0
           ) AS approved_or_cancelled
         ${CANCELLATION_RECORDS_FROM_SQL}
         ${whereSql}`,
        params,
      );

      response.total = Number(summaryRow?.total_records || 0);
      response.summary = {
        pending_review: Number(summaryRow?.pending_review || 0),
        approved_or_cancelled: Number(
          summaryRow?.approved_or_cancelled || 0,
        ),
      };
    }

    return res.json(response);
  } catch (err) {
    if (Number(err?.status) === 400) {
      return res.status(400).json({ message: err.message });
    }

    console.error("[admin cancellations list]", err);
    return res.status(500).json({
      message: "Failed to load cancellation records.",
    });
  }
};

exports.approveRequest = async (req, res) => {
  const requestId = parsePositiveInt(req.params.requestId);
  const reviewNote = cleanNote(req.body?.review_note);

  if (!requestId) {
    return res
      .status(400)
      .json({ message: "Invalid cancellation request ID." });
  }

  if (reviewNote.length > 500) {
    return res.status(400).json({
      message: "Review note must be 500 characters or fewer.",
    });
  }

  const orderId = await loadRequestOrderId(requestId);
  if (!orderId) {
    return res.status(404).json({ message: "Cancellation request not found." });
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
         status,
         total,
         payment_status,
         paymongo_session_id,
         payment_url
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );

    if (!order) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Linked order not found." });
    }

    const [[request]] = await conn.query(
      `SELECT *
       FROM custom_cancellation_requests
       WHERE id = ?
         AND order_id = ?
       LIMIT 1
       FOR UPDATE`,
      [requestId, orderId],
    );

    if (!request) {
      await conn.rollback();
      transactionActive = false;
      return res
        .status(404)
        .json({ message: "Cancellation request not found." });
    }

    if (normalize(request.status) !== "pending") {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message: "This cancellation request has already been reviewed.",
      });
    }

    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "Only custom furniture cancellation requests can be approved here.",
      });
    }

    const currentOrderStatus = normalize(order.status);
    if (!APPROVABLE_ORDER_STATUSES.has(currentOrderStatus)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "This order has already reached a stage where cancellation can no longer be approved.",
      });
    }

    const [paymentRows] = await conn.query(
      `SELECT id, amount, status, payment_method
       FROM payment_transactions
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );

    const pendingPayments = paymentRows.filter(
      (row) => normalize(row.status) === "pending",
    );

    if (pendingPayments.length > 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        reason_code: "PENDING_PAYMENT_REVIEW",
        message:
          "Resolve the pending payment review before approving this cancellation.",
      });
    }

    if (order.paymongo_session_id || order.payment_url) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        reason_code: "ACTIVE_PAYMENT_SESSION",
        message:
          "An online payment session is still attached to this order. Resolve that payment session before approving cancellation.",
      });
    }

    const verifiedPaymentTotal = paymentRows
      .filter((row) => normalize(row.status) === "verified")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const materialReleaseResult =
      await releaseBlueprintMaterialsForCancellation(conn, {
        orderId,
        actorUserId: req.user.id,
        releaseReason: `Cancellation request #${requestId} approved. ${request.reason}`,
      });

    const [activeDeliveries] = await conn.query(
      `SELECT id, driver_id, status
       FROM deliveries
       WHERE order_id = ?
         AND status IN ('scheduled', 'in_transit')
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );

    const [unfinishedStaffRows] = await conn.query(
      `SELECT DISTINCT assigned_to
       FROM project_tasks
       WHERE order_id = ?
         AND assigned_to IS NOT NULL
         AND LOWER(COALESCE(status, '')) <> 'completed'`,
      [orderId],
    );

    const [orderUpdate] = await conn.query(
      `UPDATE orders
       SET status = 'cancelled',
           cancellation_reason = ?,
           cancelled_at = NOW()
       WHERE id = ?
         AND status = ?`,
      [request.reason, orderId, order.status],
    );

    if (Number(orderUpdate.affectedRows || 0) !== 1) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "The order changed before cancellation could be approved. Refresh and try again.",
      });
    }

    if (activeDeliveries.length > 0) {
      await conn.query(
        `UPDATE deliveries
         SET status = 'cancelled'
         WHERE order_id = ?
           AND status IN ('scheduled', 'in_transit')`,
        [orderId],
      );
    }

    const [requestUpdate] = await conn.query(
      `UPDATE custom_cancellation_requests
       SET status = 'approved',
           reviewed_by = ?,
           review_note = ?,
           reviewed_at = NOW()
       WHERE id = ?
         AND status = 'pending'`,
      [req.user.id, reviewNote || null, requestId],
    );

    if (Number(requestUpdate.affectedRows || 0) !== 1) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "The cancellation request changed before the decision was saved. Refresh and try again.",
      });
    }

    if (order.customer_id) {
      await createNotificationSafe(conn, {
        userId: order.customer_id,
        type: "cancellation_update",
        title: "Cancellation Request Approved",
        message: `Your cancellation request for ${order.order_number || `Order #${order.id}`} was approved. Recorded payments remain in payment history; this cancellation does not issue a refund.`,
        targetType: "order",
        targetId: order.id,
        targetOrderId: order.id,
      });
    }

    for (const row of unfinishedStaffRows) {
      if (!row.assigned_to) continue;
      await createNotificationSafe(conn, {
        userId: row.assigned_to,
        type: "task_update",
        title: "Production Order Cancelled",
        message: `${order.order_number || `Order #${order.id}`} was cancelled. Stop any remaining production work for this order.`,
        targetType: "order",
        targetId: order.id,
        targetOrderId: order.id,
      });
    }

    const riderIds = [
      ...new Set(
        activeDeliveries
          .map((row) => Number(row.driver_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    for (const riderId of riderIds) {
      await createNotificationSafe(conn, {
        userId: riderId,
        type: "delivery_update",
        title: "Delivery Cancelled",
        message: `${order.order_number || `Order #${order.id}`} was cancelled. Do not continue this delivery.`,
        targetType: "order",
        targetId: order.id,
        targetOrderId: order.id,
      });
    }

    await conn.commit();
    transactionActive = false;

    const io = req.app.get("io");
    emitOrderStatusUpdate(io, {
      orderId: order.id,
      orderNumber: order.order_number,
      status: "cancelled",
      customerId: order.customer_id,
    });

    req.auditRecord = {
      id: requestId,
      old: {
        request_status: "pending",
        order_status: currentOrderStatus,
      },
      new: {
        request_status: "approved",
        order_status: "cancelled",
        reviewed_by: req.user.id,
        review_note_provided: Boolean(reviewNote),
        verified_payment_total_preserved: Number(
          verifiedPaymentTotal.toFixed(2),
        ),
        material_release_reason: materialReleaseResult.reason,
        material_reservation_ids: materialReleaseResult.reservation_ids || [],
        active_delivery_ids_cancelled: activeDeliveries.map((row) => row.id),
      },
    };

    return res.json({
      message:
        "Cancellation approved. The order is now cancelled and recorded payments were preserved.",
      request_id: requestId,
      order_id: orderId,
      order_status: "cancelled",
      verified_payment_total: Number(verifiedPaymentTotal.toFixed(2)),
      material_release: materialReleaseResult,
      cancelled_delivery_ids: activeDeliveries.map((row) => row.id),
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
      } catch {}
    }

    if (err instanceof BlueprintMaterialReleaseError) {
      return res.status(err.statusCode || 409).json({
        message: err.message,
        integrity_reason: err.code,
        ...(err.details ? { details: err.details } : {}),
      });
    }

    if (isRetryableLockError(err)) {
      return res.status(409).json({
        message:
          "The order was being updated by another process. Refresh and try approving the cancellation again.",
      });
    }

    console.error("[admin cancellation approve]", err);
    return res.status(500).json({
      message: "Failed to approve cancellation request.",
    });
  } finally {
    if (conn) conn.release();
  }
};

exports.declineRequest = async (req, res) => {
  const requestId = parsePositiveInt(req.params.requestId);
  const reviewNote = cleanNote(req.body?.review_note);

  if (!requestId) {
    return res
      .status(400)
      .json({ message: "Invalid cancellation request ID." });
  }

  if (!reviewNote) {
    return res.status(400).json({
      message:
        "Please provide a reason for declining the cancellation request.",
    });
  }

  if (reviewNote.length > 500) {
    return res.status(400).json({
      message: "Review note must be 500 characters or fewer.",
    });
  }

  const orderId = await loadRequestOrderId(requestId);
  if (!orderId) {
    return res.status(404).json({ message: "Cancellation request not found." });
  }

  let conn = null;
  let transactionActive = false;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [[order]] = await conn.query(
      `SELECT id, order_number, customer_id, order_type, status
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );

    if (!order) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Linked order not found." });
    }

    const [[request]] = await conn.query(
      `SELECT *
       FROM custom_cancellation_requests
       WHERE id = ?
         AND order_id = ?
       LIMIT 1
       FOR UPDATE`,
      [requestId, orderId],
    );

    if (!request) {
      await conn.rollback();
      transactionActive = false;
      return res
        .status(404)
        .json({ message: "Cancellation request not found." });
    }

    if (normalize(request.status) !== "pending") {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message: "This cancellation request has already been reviewed.",
      });
    }

    const [requestUpdate] = await conn.query(
      `UPDATE custom_cancellation_requests
       SET status = 'declined',
           reviewed_by = ?,
           review_note = ?,
           reviewed_at = NOW()
       WHERE id = ?
         AND status = 'pending'`,
      [req.user.id, reviewNote, requestId],
    );

    if (Number(requestUpdate.affectedRows || 0) !== 1) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "The cancellation request changed before the decision was saved. Refresh and try again.",
      });
    }

    if (order.customer_id) {
      await createNotificationSafe(conn, {
        userId: order.customer_id,
        type: "cancellation_update",
        title: "Cancellation Request Declined",
        message: `Your cancellation request for ${order.order_number || `Order #${order.id}`} was declined. Your order remains active. Review the admin note and use the Conversation if you need to discuss it.`,
        targetType: "order",
        targetId: order.id,
        targetOrderId: order.id,
      });
    }

    await conn.commit();
    transactionActive = false;

    req.auditRecord = {
      id: requestId,
      old: {
        request_status: "pending",
        order_status: normalize(order.status),
      },
      new: {
        request_status: "declined",
        order_status: normalize(order.status),
        reviewed_by: req.user.id,
        review_note_provided: true,
      },
    };

    return res.json({
      message: "Cancellation request declined. The order remains active.",
      request_id: requestId,
      order_id: orderId,
      order_status: order.status,
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
      } catch {}
    }

    if (isRetryableLockError(err)) {
      return res.status(409).json({
        message:
          "The order was being updated by another process. Refresh and try again.",
      });
    }

    console.error("[admin cancellation decline]", err);
    return res.status(500).json({
      message: "Failed to decline cancellation request.",
    });
  } finally {
    if (conn) conn.release();
  }
};
