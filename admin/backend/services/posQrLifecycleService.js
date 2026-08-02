const db = require("../config/db");
const { createPosSaleReceipt } = require("./receiptService");
const { generateWalkInOrderNumber } = require("../utils/posOrderNumber");
const {
  parseDecimalToCentsStrict,
  centsToDecimalString,
} = require("../utils/paymentAmounts");
const { parseStrictPositiveInt, isNonEmptyString } = require("../utils/validators");

const MAX_DECIMAL_10_2_CENTS = 9999999999;
const MIN_REASONABLE_EPOCH_SECONDS = 946684800;
const MAX_REASONABLE_EPOCH_SECONDS = 4102444800;
const DECIMAL_2DP_PATTERN = /^\d+\.\d{2}$/;

const result = (httpStatus, payload, extras = {}) => ({
  httpStatus,
  payload,
  ...extras,
});

const paymongoTimestampToDate = (value) => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_REASONABLE_EPOCH_SECONDS ||
    value > MAX_REASONABLE_EPOCH_SECONDS
  ) {
    return null;
  }
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseAndValidateSnapshot = (rawSnapshot) => {
  let parsed;
  try {
    parsed = JSON.parse(rawSnapshot);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const {
    customer_name,
    customer_phone,
    items,
    subtotal,
    discount,
    delivery_fee,
    total,
    total_cents,
    delivery,
    notes,
  } = parsed;

  if (typeof customer_name !== "string" || customer_name.trim().length === 0) {
    return null;
  }
  if (customer_name.length > 150) return null;
  if (
    typeof customer_phone !== "string" ||
    customer_phone.trim().length === 0
  ) {
    return null;
  }
  if (!Array.isArray(items) || items.length === 0) return null;
  if (!Number.isSafeInteger(total_cents) || total_cents <= 0) return null;

  for (const amount of [subtotal, discount, delivery_fee, total]) {
    if (typeof amount !== "string" || !DECIMAL_2DP_PATTERN.test(amount)) {
      return null;
    }
  }

  const subtotalCents = parseDecimalToCentsStrict(subtotal);
  const discountCents = parseDecimalToCentsStrict(discount);
  const deliveryFeeCents = parseDecimalToCentsStrict(delivery_fee);
  const totalCentsFromDecimal = parseDecimalToCentsStrict(total);
  if (
    subtotalCents === null ||
    discountCents === null ||
    deliveryFeeCents === null ||
    totalCentsFromDecimal === null
  ) {
    return null;
  }
  if (
    discountCents > MAX_DECIMAL_10_2_CENTS ||
    deliveryFeeCents > MAX_DECIMAL_10_2_CENTS ||
    totalCentsFromDecimal !== total_cents
  ) {
    return null;
  }

  const computedTotal = subtotalCents - discountCents + deliveryFeeCents;
  if (!Number.isSafeInteger(computedTotal)) return null;
  if (Math.max(computedTotal, 0) !== total_cents) return null;

  const seenProductIds = new Set();
  const normalizedItems = [];
  let lineSubtotalCentsSum = 0;

  for (const item of items) {
    const productId = parseStrictPositiveInt(item?.product_id);
    const quantity = parseStrictPositiveInt(item?.quantity);
    if (!productId || !quantity || seenProductIds.has(productId)) return null;
    seenProductIds.add(productId);

    if (
      typeof item.product_name !== "string" ||
      item.product_name.trim().length === 0 ||
      typeof item.unit_price !== "string" ||
      !DECIMAL_2DP_PATTERN.test(item.unit_price) ||
      typeof item.production_cost !== "string" ||
      !DECIMAL_2DP_PATTERN.test(item.production_cost) ||
      typeof item.subtotal !== "string" ||
      !DECIMAL_2DP_PATTERN.test(item.subtotal)
    ) {
      return null;
    }

    const unitPriceCents = parseDecimalToCentsStrict(item.unit_price);
    const productionCostCents = parseDecimalToCentsStrict(item.production_cost);
    const itemSubtotalCents = parseDecimalToCentsStrict(item.subtotal);
    if (
      unitPriceCents === null ||
      productionCostCents === null ||
      itemSubtotalCents === null ||
      unitPriceCents > MAX_DECIMAL_10_2_CENTS ||
      productionCostCents > MAX_DECIMAL_10_2_CENTS ||
      itemSubtotalCents > MAX_DECIMAL_10_2_CENTS
    ) {
      return null;
    }

    const computedLineCents = unitPriceCents * quantity;
    if (!Number.isSafeInteger(computedLineCents)) return null;
    if (computedLineCents !== itemSubtotalCents) return null;
    lineSubtotalCentsSum += computedLineCents;
    if (!Number.isSafeInteger(lineSubtotalCentsSum)) return null;

    normalizedItems.push({
      product_id: productId,
      product_name: item.product_name,
      quantity,
      unit_price: item.unit_price,
      production_cost: item.production_cost,
      subtotal: item.subtotal,
    });
  }

  if (lineSubtotalCentsSum !== subtotalCents) return null;

  let normalizedDelivery = null;
  if (delivery !== null && delivery !== undefined) {
    if (typeof delivery !== "object") return null;
    if (
      typeof delivery.address !== "string" ||
      delivery.address.trim().length === 0
    ) {
      return null;
    }
    normalizedDelivery = {
      address: delivery.address,
      lat: typeof delivery.lat === "number" ? delivery.lat : null,
      lng: typeof delivery.lng === "number" ? delivery.lng : null,
      requested_date:
        typeof delivery.requested_date === "string"
          ? delivery.requested_date
          : "",
      notes: typeof delivery.notes === "string" ? delivery.notes : "",
    };
  }

  return {
    customer_name,
    customer_phone,
    items: normalizedItems,
    subtotal,
    discount,
    delivery_fee,
    total,
    total_cents,
    delivery: normalizedDelivery,
    notes: typeof notes === "string" ? notes : "",
  };
};

const getSnapshotTotalCents = (rawSnapshot) => {
  const snapshot = parseAndValidateSnapshot(rawSnapshot);
  return snapshot ? snapshot.total_cents : null;
};

const reservationsMatchSnapshot = (reservations, snapshotItems) => {
  const left = [...reservations]
    .map((row) => ({
      product_id: Number(row.product_id),
      quantity: Number(row.quantity),
    }))
    .sort((a, b) => a.product_id - b.product_id);
  const right = [...snapshotItems]
    .map((row) => ({
      product_id: Number(row.product_id),
      quantity: Number(row.quantity),
    }))
    .sort((a, b) => a.product_id - b.product_id);

  if (left.length !== right.length) return false;
  return left.every(
    (row, index) =>
      row.product_id === right[index].product_id &&
      row.quantity === right[index].quantity,
  );
};

const analyzeCheckoutSession = ({ session, expectedSessionId, expectedTotalCents }) => {
  if (
    !session ||
    typeof session !== "object" ||
    !isNonEmptyString(session.id) ||
    !session.attributes ||
    typeof session.attributes !== "object"
  ) {
    return { kind: "malformed", code: "provider_response_incomplete" };
  }
  if (session.id !== expectedSessionId) {
    return { kind: "malformed", code: "provider_session_mismatch" };
  }
  if (!Array.isArray(session.attributes.payments)) {
    return { kind: "malformed", code: "provider_payments_missing" };
  }

  let sawPaidEntry = false;
  let malformedPaidEntry = false;
  const candidates = [];

  for (const payment of session.attributes.payments) {
    const attrs = payment?.attributes;
    if (!attrs || attrs.status !== "paid") continue;
    sawPaidEntry = true;

    const paidAtDate = paymongoTimestampToDate(attrs.paid_at);
    if (
      !isNonEmptyString(payment?.id) ||
      !Number.isSafeInteger(attrs.amount) ||
      attrs.amount <= 0 ||
      attrs.currency !== "PHP" ||
      !paidAtDate
    ) {
      malformedPaidEntry = true;
      continue;
    }

    candidates.push({
      id: payment.id,
      amount: attrs.amount,
      currency: attrs.currency,
      paidAtDate,
      sessionId: session.id,
    });
  }

  if (malformedPaidEntry) {
    return { kind: "malformed", code: "provider_paid_entry_malformed" };
  }

  if (sawPaidEntry) {
    const matching = candidates.filter(
      (candidate) => candidate.amount === expectedTotalCents,
    );
    if (matching.length === 0) return { kind: "payment_mismatch" };
    const distinctIds = [...new Set(matching.map((candidate) => candidate.id))];
    if (distinctIds.length > 1) return { kind: "ambiguous_payment" };
    return { kind: "paid", payment: matching[0] };
  }

  const providerStatus = session.attributes.status;
  if (providerStatus === "expired") return { kind: "expired_unpaid" };
  if (providerStatus === "active") return { kind: "pending" };
  return { kind: "malformed", code: "provider_status_unknown" };
};

const loadFinalizedPayload = async (conn, attempt) => {
  if (!attempt.order_id || !attempt.payment_transaction_id) return null;

  const [[order]] = await conn.query(
    `SELECT id, order_number, status, total FROM orders WHERE id = ?`,
    [attempt.order_id],
  );
  if (!order || Number(order.id) !== Number(attempt.order_id)) return null;

  const [[paymentTx]] = await conn.query(
    `SELECT id, order_id FROM payment_transactions WHERE id = ?`,
    [attempt.payment_transaction_id],
  );
  if (
    !paymentTx ||
    Number(paymentTx.id) !== Number(attempt.payment_transaction_id) ||
    Number(paymentTx.order_id) !== Number(attempt.order_id)
  ) {
    return null;
  }

  const [[receipt]] = await conn.query(
    `SELECT id, receipt_number, payment_transaction_id, order_id
     FROM receipts
     WHERE payment_transaction_id = ?`,
    [attempt.payment_transaction_id],
  );
  if (
    !receipt ||
    Number(receipt.payment_transaction_id) !==
      Number(attempt.payment_transaction_id) ||
    Number(receipt.order_id) !== Number(attempt.order_id)
  ) {
    return null;
  }

  return {
    attempt_id: attempt.id,
    status: "consumed",
    order_id: order.id,
    order_number: order.order_number,
    order_status: order.status,
    payment_transaction_id: paymentTx.id,
    receipt_id: receipt.id,
    receipt_number: receipt.receipt_number,
    total: order.total,
    payment_status: "paid",
  };
};

const finalizePaidAttempt = async ({
  attemptId,
  matchedPayment,
  actorUserId,
  requireOwner = true,
}) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[attempt]] = await conn.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE id = ? FOR UPDATE`,
      [attemptId],
    );
    if (!attempt) {
      await conn.rollback();
      return result(404, { message: "Payment attempt not found." });
    }

    if (requireOwner && Number(attempt.cashier_id) !== Number(actorUserId)) {
      await conn.rollback();
      return result(403, {
        message: "This payment attempt does not belong to you.",
      });
    }

    if (attempt.status === "consumed") {
      const payload = await loadFinalizedPayload(conn, attempt);
      if (!payload) {
        await conn.rollback();
        return result(500, { message: "Server error." });
      }
      await conn.commit();
      return result(200, payload, { freshCommit: false });
    }

    if (attempt.status !== "awaiting_payment") {
      await conn.rollback();
      return result(409, {
        attempt_id: attempt.id,
        status: attempt.status,
        message: "This payment attempt is not awaiting verification.",
      });
    }

    if (!matchedPayment) {
      await conn.rollback();
      return result(500, { message: "Server error." });
    }

    if (attempt.provider_session_id !== matchedPayment.sessionId) {
      await conn.rollback();
      return result(502, {
        message: "Payment provider session could not be verified.",
      });
    }

    const [reservations] = await conn.query(
      `SELECT id, product_id, quantity
       FROM pos_qr_stock_reservations
       WHERE payment_attempt_id = ? AND status = 'active'
       ORDER BY product_id ASC
       FOR UPDATE`,
      [attempt.id],
    );
    if (reservations.length === 0) {
      await conn.rollback();
      return result(500, { message: "Server error." });
    }

    const snapshot = parseAndValidateSnapshot(attempt.checkout_snapshot);
    if (!snapshot || !reservationsMatchSnapshot(reservations, snapshot.items)) {
      await conn.rollback();
      return result(500, { message: "Server error." });
    }
    if (matchedPayment.amount !== snapshot.total_cents) {
      await conn.rollback();
      return result(502, { message: "Payment amount could not be verified." });
    }

    const resolvedActorUserId = Number(actorUserId || attempt.cashier_id);
    if (!Number.isInteger(resolvedActorUserId) || resolvedActorUserId <= 0) {
      await conn.rollback();
      return result(500, { message: "Server error." });
    }

    const orderNumber = await generateWalkInOrderNumber(conn);
    const hasDelivery = Boolean(
      snapshot.delivery && String(snapshot.delivery.address || "").trim(),
    );
    const orderStatus = hasDelivery ? "confirmed" : "completed";

    const [orderResult] = await conn.query(
      `INSERT INTO orders
        (order_number, walkin_customer_name, walkin_customer_phone, type, order_type,
         status, payment_method, payment_status, subtotal, tax, discount, delivery_fee, total,
         notes, delivery_address, delivery_lat, delivery_lng, requested_delivery_date, delivery_request_notes,
         paymongo_session_id, payment_url)
       VALUES (?, ?, ?, 'walkin', 'standard', ?, 'paymongo', 'paid', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        snapshot.customer_name || "Walk-in Customer",
        snapshot.customer_phone || null,
        orderStatus,
        snapshot.subtotal,
        snapshot.discount,
        snapshot.delivery_fee,
        snapshot.total,
        snapshot.notes || null,
        snapshot.delivery?.address || null,
        snapshot.delivery?.lat ?? null,
        snapshot.delivery?.lng ?? null,
        snapshot.delivery?.requested_date || null,
        snapshot.delivery?.notes || null,
        attempt.provider_session_id,
        attempt.checkout_url,
      ],
    );
    if (!orderResult.insertId) {
      await conn.rollback();
      return result(500, { message: "Server error." });
    }
    const orderId = orderResult.insertId;

    for (const item of snapshot.items) {
      const [itemResult] = await conn.query(
        `INSERT INTO order_items
          (order_id, product_id, product_name, quantity, unit_price, production_cost)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.quantity,
          item.unit_price,
          item.production_cost,
        ],
      );
      if (!itemResult.insertId) {
        await conn.rollback();
        return result(500, { message: "Server error." });
      }

      const [movementResult] = await conn.query(
        `INSERT INTO stock_movements
          (product_id, type, quantity, order_id, order_item_id, notes, created_by)
         VALUES (?, 'out', ?, ?, ?,
          'POS QR payment sale (stock already reserved at attempt creation)', ?)`,
        [
          item.product_id,
          item.quantity,
          orderId,
          itemResult.insertId,
          resolvedActorUserId,
        ],
      );
      if (movementResult.affectedRows !== 1) {
        await conn.rollback();
        return result(500, { message: "Server error." });
      }
    }

    const [paymentResult] = await conn.query(
      `INSERT INTO payment_transactions
        (order_id, amount, payment_method, status, verified_by, verified_at, notes)
       VALUES (?, ?, 'paymongo', 'verified', ?, NOW(), ?)`,
      [
        orderId,
        snapshot.total,
        resolvedActorUserId,
        "Verified via PayMongo POS QR payment attempt.",
      ],
    );
    if (!paymentResult.insertId) {
      await conn.rollback();
      return result(500, { message: "Server error." });
    }
    const paymentTransactionId = paymentResult.insertId;

    const receiptResult = await createPosSaleReceipt(conn, {
      orderId,
      paymentTransactionId,
      receiptNumber: `OR-${Date.now()}`,
      issuedTo: snapshot.customer_name || "Walk-in Customer",
      issuedBy: resolvedActorUserId,
      totalAmount: snapshot.total,
      cashReceived: null,
      changeAmount: null,
      itemsSnapshot: JSON.stringify(
        snapshot.items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          unit_price: item.unit_price,
          production_cost: item.production_cost,
          quantity: item.quantity,
        })),
      ),
      paymentMethodSnapshot: "paymongo",
    });

    const [reservationUpdateResult] = await conn.query(
      `UPDATE pos_qr_stock_reservations
       SET status = 'consumed', consumed_at = NOW()
       WHERE payment_attempt_id = ? AND status = 'active'`,
      [attempt.id],
    );
    if (reservationUpdateResult.affectedRows !== reservations.length) {
      await conn.rollback();
      return result(500, { message: "Server error." });
    }

    const [attemptUpdateResult] = await conn.query(
      `UPDATE pos_qr_payment_attempts
       SET status = 'consumed',
           provider_payment_id = ?,
           verified_amount = ?,
           verified_currency = ?,
           paid_at = ?,
           order_id = ?,
           payment_transaction_id = ?,
           failure_code = NULL,
           failure_message = NULL
       WHERE id = ? AND status = 'awaiting_payment'`,
      [
        matchedPayment.id,
        centsToDecimalString(matchedPayment.amount),
        matchedPayment.currency,
        matchedPayment.paidAtDate,
        orderId,
        paymentTransactionId,
        attempt.id,
      ],
    );
    if (attemptUpdateResult.affectedRows !== 1) {
      await conn.rollback();
      return result(500, { message: "Server error." });
    }

    await conn.commit();

    const payload = {
      attempt_id: attempt.id,
      status: "consumed",
      order_id: orderId,
      order_number: orderNumber,
      order_status: orderStatus,
      payment_transaction_id: paymentTransactionId,
      receipt_id: receiptResult.receiptId,
      receipt_number: receiptResult.receiptNumber,
      total: snapshot.total,
      payment_status: "paid",
    };

    return result(200, payload, {
      freshCommit: true,
      auditRecord: {
        id: orderId,
        old: null,
        new: {
          order_created: true,
          payment_verified: true,
          payment_method: "paymongo",
          payment_attempt_id: attempt.id,
          payment_transaction_id: paymentTransactionId,
          receipt_id: receiptResult.receiptId,
        },
      },
      attempt,
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    if (err?.code === "ER_DUP_ENTRY") {
      try {
        const [[reread]] = await db.query(
          `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
          [attemptId],
        );
        if (reread?.status === "consumed") {
          const replayConn = await db.getConnection();
          try {
            await replayConn.beginTransaction();
            const payload = await loadFinalizedPayload(replayConn, reread);
            if (payload) {
              await replayConn.commit();
              return result(200, payload, { freshCommit: false });
            }
            await replayConn.rollback();
          } finally {
            replayConn.release();
          }
        }
      } catch (rereadErr) {
        console.error("[posQrLifecycle finalize duplicate reread]", rereadErr);
      }
      return result(503, {
        message: "The system is busy. Please try again in a moment.",
      });
    }

    console.error("[posQrLifecycle finalizePaidAttempt]", err);
    return result(500, { message: "Server error." });
  } finally {
    if (conn) conn.release();
  }
};

const recalcStockStatusSql = `
  UPDATE products
  SET stock_status = CASE
    WHEN stock <= 0 THEN 'out_of_stock'
    WHEN stock <= reorder_point THEN 'low_stock'
    ELSE 'in_stock'
  END
  WHERE id = ?
`;

const releaseExpiredAttempt = async ({
  attemptId,
  allowedStatuses = ["reserved", "awaiting_payment"],
  expectedProviderSessionId = null,
}) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[attempt]] = await conn.query(
      `SELECT *, (expires_at <= NOW()) AS is_locally_expired
       FROM pos_qr_payment_attempts
       WHERE id = ?
       FOR UPDATE`,
      [attemptId],
    );
    if (!attempt) {
      await conn.rollback();
      return { changed: false, reason: "not_found" };
    }
    if (!allowedStatuses.includes(attempt.status)) {
      await conn.rollback();
      return { changed: false, reason: "status_changed", status: attempt.status };
    }
    if (Number(attempt.is_locally_expired) !== 1) {
      await conn.rollback();
      return { changed: false, reason: "not_expired" };
    }
    if (
      attempt.order_id ||
      attempt.payment_transaction_id ||
      attempt.provider_payment_id
    ) {
      await conn.rollback();
      return { changed: false, reason: "linked_records_present" };
    }
    if (
      expectedProviderSessionId !== null &&
      attempt.provider_session_id !== expectedProviderSessionId
    ) {
      await conn.rollback();
      return { changed: false, reason: "provider_session_changed" };
    }
    if (attempt.status === "reserved" && attempt.provider_session_id) {
      await conn.rollback();
      return { changed: false, reason: "reserved_has_provider_session" };
    }
    if (
      attempt.status === "awaiting_payment" &&
      (attempt.failure_code !== "cleanup_expire_requested" ||
        !expectedProviderSessionId)
    ) {
      await conn.rollback();
      return { changed: false, reason: "provider_expiry_not_confirmed" };
    }

    const [reservations] = await conn.query(
      `SELECT id, product_id, quantity
       FROM pos_qr_stock_reservations
       WHERE payment_attempt_id = ? AND status = 'active'
       ORDER BY product_id ASC
       FOR UPDATE`,
      [attempt.id],
    );
    if (reservations.length === 0) {
      await conn.rollback();
      return { changed: false, reason: "no_active_reservations" };
    }

    const snapshot = parseAndValidateSnapshot(attempt.checkout_snapshot);
    if (!snapshot || !reservationsMatchSnapshot(reservations, snapshot.items)) {
      await conn.rollback();
      return { changed: false, reason: "snapshot_mismatch" };
    }

    const productIds = reservations.map((row) => Number(row.product_id));
    const placeholders = productIds.map(() => "?").join(",");
    const [products] = await conn.query(
      `SELECT id FROM products
       WHERE id IN (${placeholders})
       ORDER BY id ASC
       FOR UPDATE`,
      productIds,
    );
    if (products.length !== productIds.length) {
      await conn.rollback();
      return { changed: false, reason: "product_count_mismatch" };
    }

    for (const reservation of reservations) {
      const [stockResult] = await conn.query(
        `UPDATE products SET stock = stock + ? WHERE id = ?`,
        [reservation.quantity, reservation.product_id],
      );
      if (stockResult.affectedRows !== 1) {
        await conn.rollback();
        return { changed: false, reason: "stock_restore_failed" };
      }
      await conn.query(recalcStockStatusSql, [reservation.product_id]);
    }

    const [reservationResult] = await conn.query(
      `UPDATE pos_qr_stock_reservations
       SET status = 'released', released_at = NOW()
       WHERE payment_attempt_id = ? AND status = 'active'`,
      [attempt.id],
    );
    if (reservationResult.affectedRows !== reservations.length) {
      await conn.rollback();
      return { changed: false, reason: "reservation_update_failed" };
    }

    const expirationCode =
      attempt.status === "reserved"
        ? "local_reservation_expired"
        : "provider_confirmed_expired";
    const expirationMessage =
      attempt.status === "reserved"
        ? "Reservation expired before provider session creation."
        : "PayMongo session expired without a verified payment.";

    const [attemptResult] = await conn.query(
      `UPDATE pos_qr_payment_attempts
       SET status = 'expired', failure_code = ?, failure_message = ?
       WHERE id = ? AND status = ?`,
      [expirationCode, expirationMessage, attempt.id, attempt.status],
    );
    if (attemptResult.affectedRows !== 1) {
      await conn.rollback();
      return { changed: false, reason: "attempt_update_failed" };
    }

    await conn.commit();
    return {
      changed: true,
      attemptId: attempt.id,
      oldStatus: attempt.status,
      releasedCount: reservations.length,
    };
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }
    console.error("[posQrLifecycle releaseExpiredAttempt]", err);
    return { changed: false, reason: "error", error: err };
  } finally {
    if (conn) conn.release();
  }
};

const markAttemptProviderUnknown = async ({ attemptId, failureCode, failureMessage }) => {
  const [updateResult] = await db.query(
    `UPDATE pos_qr_payment_attempts
     SET status = 'provider_unknown', failure_code = ?, failure_message = ?
     WHERE id = ? AND status = 'creating_session'`,
    [failureCode, failureMessage, attemptId],
  );
  return updateResult.affectedRows === 1;
};

const markExpireRequested = async ({ attemptId, providerSessionId }) => {
  const [updateResult] = await db.query(
    `UPDATE pos_qr_payment_attempts
     SET failure_code = 'cleanup_expire_requested',
         failure_message = 'Provider session expiration requested; awaiting confirmation.'
     WHERE id = ?
       AND status = 'awaiting_payment'
       AND provider_session_id = ?`,
    [attemptId, providerSessionId],
  );
  return updateResult.affectedRows === 1;
};

module.exports = {
  analyzeCheckoutSession,
  finalizePaidAttempt,
  getSnapshotTotalCents,
  loadFinalizedPayload,
  markAttemptProviderUnknown,
  markExpireRequested,
  parseAndValidateSnapshot,
  releaseExpiredAttempt,
};
