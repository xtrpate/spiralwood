// controllers/staff/pos.qrPayments.js
//
// PHASE 3B — Cashier ready-to-ship POS "Online Payment QR" backend
// foundation. This file creates and manages a payment ATTEMPT
// (pos_qr_payment_attempts + pos_qr_stock_reservations) — it never
// creates an orders/order_items/payment_transactions/receipts row.
// Final order/payment/receipt creation is a later, separate,
// verified-payment phase and is intentionally NOT implemented here.
//
// TEST-KEY-ONLY: Phase 3B is deliberately restricted to a PayMongo TEST
// secret key (sk_test_...). isPosQrTestSafeConfigured() is the single
// source of truth for this gate and is exported so the route file can
// reuse it BEFORE authenticate runs — a disabled/misconfigured
// deployment never queries the users table, never opens a DB
// connection, never reserves stock, and never calls PayMongo. The
// controller also re-checks it as a defensive second layer.

const crypto = require("crypto");
const db = require("../../config/db");
const {
  createCheckoutSession,
  retrieveCheckoutSession,
} = require("../../services/paymongoService");
const { createPosSaleReceipt } = require("../../services/receiptService");
const { generateWalkInOrderNumber } = require("../../utils/posOrderNumber");
const {
  parseDecimalToCentsStrict,
  centsToDecimalString,
  MAX_DECIMAL_12_2_CENTS,
} = require("../../utils/paymentAmounts");
const {
  isNonEmptyString,
  isValidNonNegativeNumber,
  isValidPhoneNumber,
  parseStrictPositiveInt,
} = require("../../utils/validators");

const DEFAULT_TTL_MINUTES = 15;
const MAX_TOKEN_LENGTH = 64;

// DECIMAL(10,2) ceiling, expressed in integer centavos (99,999,999.99).
// Narrower than MAX_DECIMAL_12_2_CENTS (imported above, used for
// orders.subtotal/total, payment amounts, and attempt verified_amount) —
// this local constant guards the narrower DECIMAL(10,2) columns:
// orders.discount, orders.delivery_fee, and order_items.subtotal (a
// GENERATED DECIMAL(10,2) column computed as quantity * unit_price).
const MAX_DECIMAL_10_2_CENTS = 9999999999;

// Bounded retry for lock contention only (ER_LOCK_DEADLOCK /
// ER_LOCK_WAIT_TIMEOUT). Never unbounded — 1 initial attempt + 2
// retries, then a sanitized 503.
const MAX_LOCK_RETRY_ATTEMPTS = 3;

const getTtlMinutes = () => {
  const parsed = parseInt(process.env.POS_QR_TTL_MINUTES, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MINUTES;
};

/* ── TEST-KEY-ONLY CONFIG GATE ───────────────────────────────────────
   Single source of truth, reused by both the route-level middleware
   (before authenticate) and this controller's own defensive check.
   Never returns or logs the actual key value — only a boolean. ── */
const getNormalizedFrontendUrl = () => {
  const raw = process.env.FRONTEND_URL;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;

  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  // Strip trailing slash(es) so successUrl/cancelUrl concatenation never
  // produces a double slash.
  return raw.trim().replace(/\/+$/, "");
};

const isPosQrTestSafeConfigured = () => {
  if (process.env.POS_QR_ENABLED !== "true") return false;

  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (typeof secretKey !== "string" || secretKey.length === 0) return false;
  if (!secretKey.startsWith("sk_test_")) return false; // never sk_live_ in Phase 3B

  if (!getNormalizedFrontendUrl()) return false;

  return true;
};

exports.isPosQrTestSafeConfigured = isPosQrTestSafeConfigured;

/* ── Normalization helpers — request INTENT only, never prices. These
   feed request_hash and must never change based on live DB values. ── */
const normalizeText = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

const normalizePhoneDigits = (value) => String(value ?? "").replace(/\D/g, "");

// Fixed-precision canonical coordinate string — matches the
// DECIMAL(10,7) precision already used for lat/lng elsewhere in this
// schema (orders.delivery_lat/lng, users.address_lat/lng), so two
// requests with the same effective pin always hash identically, and a
// genuinely different pin always hashes differently.
const formatCoordForHash = (value) => Number(value).toFixed(7);

// Mirrors the exact optional-but-paired lat/lng validation already used
// in customer.orders.js createOrder: a map pin is optional, but if
// either coordinate is provided, both must be present and within valid
// world-coordinate bounds. Returns { ok:false } on malformed/incomplete
// pairs, or { ok:true, lat, lng } (both null if no pin was provided).
const validateDeliveryCoords = (delivery) => {
  if (!delivery) return { ok: true, lat: null, lng: null };

  const hasLat =
    delivery.lat !== undefined && delivery.lat !== null && delivery.lat !== "";
  const hasLng =
    delivery.lng !== undefined && delivery.lng !== null && delivery.lng !== "";

  if (!hasLat && !hasLng) return { ok: true, lat: null, lng: null };

  const latNum = Number(delivery.lat);
  const lngNum = Number(delivery.lng);

  if (
    !hasLat ||
    !hasLng ||
    !Number.isFinite(latNum) ||
    !Number.isFinite(lngNum) ||
    latNum < -90 ||
    latNum > 90 ||
    lngNum < -180 ||
    lngNum > 180
  ) {
    return { ok: false };
  }

  return { ok: true, lat: latNum, lng: lngNum };
};

const normalizeDeliveryForHash = (delivery, coords, normalizedRequestedDate) => {
  if (!delivery) return null;
  return {
    address: normalizeText(delivery.address),
    requested_date: normalizedRequestedDate,
    notes: normalizeText(delivery.notes),
    lat: coords.lat === null ? null : formatCoordForHash(coords.lat),
    lng: coords.lng === null ? null : formatCoordForHash(coords.lng),
  };
};

// Accepts the current frontend datetime-local shape only:
//   YYYY-MM-DDTHH:mm
//   YYYY-MM-DDTHH:mm:ss   (seconds optional)
// Validates that the calendar date and time are REAL — not merely
// regex-shaped — by round-tripping every component through Date.UTC and
// comparing each one back. JS Date silently "rolls over" out-of-range
// values (e.g. 2026-02-30 becomes 2026-03-02, 2026-01-01T25:00 becomes
// 2026-01-02T01:00) instead of throwing, so a regex match alone is not
// sufficient proof of a real date/time — this comparison is what
// actually catches those cases. Returns the MySQL-compatible normalized
// string "YYYY-MM-DD HH:mm:ss" on success (seconds always present,
// defaulting to "00"), or null for anything malformed or impossible.
const DELIVERY_DATETIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const normalizeDeliveryRequestedDate = (rawValue) => {
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) return null;

  const match = DELIVERY_DATETIME_LOCAL_PATTERN.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] !== undefined ? Number(match[6]) : 0;

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59 ||
    second < 0 || second > 59
  ) {
    return null;
  }

  const asDate = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );
  if (
    Number.isNaN(asDate.getTime()) ||
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day ||
    asDate.getUTCHours() !== hour ||
    asDate.getUTCMinutes() !== minute ||
    asDate.getUTCSeconds() !== second
  ) {
    return null;
  }

  const pad2 = (n) => String(n).padStart(2, "0");
  return `${match[1]}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
};

// Resolves the single requested-delivery-date value used consistently
// everywhere (request_hash, checkout_snapshot, and the final
// orders.requested_delivery_date insert). No delivery -> value is always
// null. Delivery present -> a non-empty, calendar-valid requested date
// is REQUIRED; { ok: false } must be rejected with HTTP 400 before
// Transaction A, before any stock reservation, and before any PayMongo
// session creation.
const resolveDeliveryRequestedDate = (delivery) => {
  if (!delivery) return { ok: true, value: null };

  const rawRequestedDate =
    delivery.requested_date || delivery.preferred_date || delivery.scheduled_date;

  if (typeof rawRequestedDate !== "string" || rawRequestedDate.trim().length === 0) {
    return { ok: false, value: null };
  }

  const normalized = normalizeDeliveryRequestedDate(rawRequestedDate);
  if (!normalized) return { ok: false, value: null };

  return { ok: true, value: normalized };
};

/* ── Canonical, stable-key-order JSON stringify, so two logically
   identical requests always hash to the same value regardless of
   client-side key ordering. ── */
const stableStringify = (value) => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
};

const buildRequestHash = (canonicalInput) =>
  crypto.createHash("sha256").update(stableStringify(canonicalInput)).digest("hex");

/* ── Deduplicate cart lines by product_id (summing quantity) and sort
   ascending — this is both the idempotency-hash input shape AND the
   deterministic FOR UPDATE lock order used below. Returns null on any
   malformed line. ── */
const dedupeAndSortItems = (rawItems) => {
  const map = new Map();

  for (const raw of rawItems) {
    const productId = parseStrictPositiveInt(raw?.product_id);
    const quantity = parseStrictPositiveInt(raw?.quantity);
    if (!productId || !quantity) return null;

    map.set(productId, (map.get(productId) || 0) + quantity);
  }

  if (map.size === 0) return null;

  return Array.from(map.entries())
    .map(([product_id, quantity]) => ({ product_id, quantity }))
    .sort((a, b) => a.product_id - b.product_id);
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

/* ── Sanitized provider-error classification. Never stores raw
   payloads, headers, API keys, or stack traces — only a short code and
   a generic, safe message.

   CONSERVATIVE ALLOWLIST — only these PayMongo HTTP statuses
   conclusively mean "no checkout session was created" and are safe to
   treat as a definite failure that releases reserved stock:
     400 Bad Request        — malformed/invalid request body
     401 Unauthorized        — bad/rejected API key
     403 Forbidden           — key lacks permission
     422 Unprocessable Entity — the provider validated and rejected the
                                 request outright
   Every other outcome is ambiguous and MUST remain provider_unknown,
   because a session may actually have been created on PayMongo's side
   even though this process never received confirmation of it:
     408 Request Timeout, 429 Too Many Requests, all 5xx, any network
     error (ECONNRESET/ECONNREFUSED/ETIMEDOUT), and "no response at
     all" (err.response is undefined). ── */
const DEFINITE_FAILURE_STATUS_ALLOWLIST = new Set([400, 401, 403, 422]);

const classifyProviderError = (err) => {
  const status = err?.response?.status;

  if (typeof status === "number" && DEFINITE_FAILURE_STATUS_ALLOWLIST.has(status)) {
    return {
      definite: true,
      code: `provider_http_${status}`,
      message: "The payment provider rejected the session request.",
    };
  }

  return {
    definite: false,
    code: status ? `provider_http_${status}` : "provider_network_error",
    message: "The payment provider did not return a confirmed result.",
  };
};

/* ── Final response shaping by current attempt status. Never called
   while any transaction/lock from this request is still open. ── */
const respondByStatus = (res, attempt) => {
  if (!attempt) {
    return res.status(500).json({ message: "Server error." });
  }

  const base = {
    attempt_id: attempt.id,
    checkout_token: attempt.checkout_token,
    status: attempt.status,
  };

  switch (attempt.status) {
    case "reserved":
    case "creating_session":
      return res.status(202).json({
        ...base,
        message: "Payment session is being prepared.",
      });
    case "awaiting_payment":
      return res.status(200).json({
        ...base,
        checkout_url: attempt.checkout_url,
      });
    case "provider_unknown":
      return res.status(202).json({
        ...base,
        message:
          "Payment provider status is unresolved. Please wait before retrying.",
      });
    case "failed":
      return res.status(409).json({
        ...base,
        message: "This payment attempt failed and cannot be reused.",
        failure_code: attempt.failure_code || null,
      });
    case "expired":
    case "cancelled":
    case "consumed":
      return res.status(409).json({
        ...base,
        message: "This payment attempt is no longer active.",
      });
    default:
      return res.status(500).json({ message: "Server error." });
  }
};

/* ── DEFINITE PROVIDER FAILURE — release exactly once. Locks the
   attempt, then the active reservation rows, then the products
   themselves (explicitly, in ascending id order — locking the
   reservation rows alone is never treated as a product-row lock),
   restores stock, recalculates stock_status, flips reservations to
   released, and flips the attempt to failed — all guarded by
   affectedRows/count checks so a retried call is a safe no-op. ── */
const handleDefiniteFailure = async (attemptId, classification) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[attempt]] = await conn.query(
      `SELECT id, status FROM pos_qr_payment_attempts WHERE id = ? FOR UPDATE`,
      [attemptId],
    );

    if (!attempt || attempt.status !== "creating_session") {
      await conn.rollback();
      return;
    }

    const [reservations] = await conn.query(
      `SELECT id, product_id, quantity FROM pos_qr_stock_reservations
       WHERE payment_attempt_id = ? AND status = 'active'
       FOR UPDATE`,
      [attemptId],
    );

    if (reservations.length === 0) {
      await conn.rollback();
      return;
    }

    const productIds = [...new Set(reservations.map((r) => r.product_id))].sort(
      (a, b) => a - b,
    );
    const productPlaceholders = productIds.map(() => "?").join(",");

    await conn.query(
      `SELECT id FROM products WHERE id IN (${productPlaceholders})
       ORDER BY id ASC FOR UPDATE`,
      productIds,
    );

    for (const reservation of reservations) {
      await conn.query(`UPDATE products SET stock = stock + ? WHERE id = ?`, [
        reservation.quantity,
        reservation.product_id,
      ]);
      await conn.query(recalcStockStatusSql, [reservation.product_id]);
    }

    const [releaseResult] = await conn.query(
      `UPDATE pos_qr_stock_reservations
       SET status = 'released', released_at = NOW()
       WHERE payment_attempt_id = ? AND status = 'active'`,
      [attemptId],
    );

    if (releaseResult.affectedRows !== reservations.length) {
      await conn.rollback();
      return;
    }

    const [attemptUpdateResult] = await conn.query(
      `UPDATE pos_qr_payment_attempts
       SET status = 'failed', failure_code = ?, failure_message = ?
       WHERE id = ? AND status = 'creating_session'`,
      [classification.code, classification.message, attemptId],
    );

    if (attemptUpdateResult.affectedRows !== 1) {
      await conn.rollback();
      return;
    }

    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    console.error("[pos.qrPayments handleDefiniteFailure]", err);
  } finally {
    conn.release();
  }
};

/* ── PROVIDER UNKNOWN — timeout / connection reset / ambiguous 5xx /
   malformed success response. Stock and reservations are deliberately
   left untouched. The attempt is only transitioned when it is still
   exactly in 'creating_session'; affectedRows is checked, and a
   mismatch rolls back rather than silently committing a no-op. ── */
const handleProviderUnknown = async (attemptId, classification) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[attempt]] = await conn.query(
      `SELECT id, status FROM pos_qr_payment_attempts WHERE id = ? FOR UPDATE`,
      [attemptId],
    );

    if (!attempt || attempt.status !== "creating_session") {
      await conn.rollback();
      return;
    }

    const [updateResult] = await conn.query(
      `UPDATE pos_qr_payment_attempts
       SET status = 'provider_unknown', failure_code = ?, failure_message = ?
       WHERE id = ? AND status = 'creating_session'`,
      [classification.code, classification.message, attemptId],
    );

    if (updateResult.affectedRows !== 1) {
      await conn.rollback();
      return;
    }

    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    console.error("[pos.qrPayments handleProviderUnknown]", err);
  } finally {
    conn.release();
  }
};

/* ── PROVIDER-CALL CLAIM + CALL + TRANSACTION B. This is the single
   code path used both right after a brand-new attempt is created, and
   whenever a retry lands on an existing status='reserved' attempt —
   so a retry and the original request behave identically. ── */
const claimAndCreateSession = async (req, res, attemptId) => {
  // Step 1 — guarded claim, its own short transaction, no network call
  // inside it.
  let claimConn = await db.getConnection();
  let claimed = false;
  try {
    await claimConn.beginTransaction();

    const [claimResult] = await claimConn.query(
      `UPDATE pos_qr_payment_attempts
       SET status = 'creating_session', provider_call_started_at = NOW()
       WHERE id = ? AND status = 'reserved'`,
      [attemptId],
    );

    claimed = claimResult.affectedRows === 1;
    await claimConn.commit();
  } catch (err) {
    try {
      await claimConn.rollback();
    } catch {}
    claimConn.release();
    console.error("[pos.qrPayments claim]", err);
    return res.status(500).json({ message: "Server error." });
  }
  claimConn.release();
  claimConn = null;

  if (!claimed) {
    // Lost the claim race, or the attempt was no longer 'reserved' by the
    // time this request reached the claim — re-read current state and
    // dispatch without ever calling PayMongo.
    const [[current]] = await db.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
      [attemptId],
    );
    return respondByStatus(res, current);
  }

  // Defensive second config check — the route middleware and the top of
  // createAttempt already verified this before Transaction A ever ran,
  // so this can only fail here via a config change mid-process, which
  // should never happen in a single request's lifecycle. Treated as
  // provider_unknown rather than releasing stock, since we cannot be
  // sure no session was created.
  const frontendUrl = getNormalizedFrontendUrl();
  if (!frontendUrl) {
    await handleProviderUnknown(attemptId, {
      code: "config_invalid",
      message: "Payment provider configuration is invalid.",
    });
    const [[resolved]] = await db.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
      [attemptId],
    );
    return respondByStatus(res, resolved);
  }

  // Step 2 — the provider call itself, with ZERO open transaction and
  // ZERO held row locks.
  const [[attemptRow]] = await db.query(
    `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
    [attemptId],
  );
  const snapshot = JSON.parse(attemptRow.checkout_snapshot);

  // Defensive re-validation of the exact integer cents threaded through
  // from Transaction A — this value was already validated before the
  // snapshot was written, so this should never fail in practice.
  if (!Number.isSafeInteger(snapshot.total_cents) || snapshot.total_cents <= 0) {
    await handleDefiniteFailure(attemptId, {
      code: "invalid_snapshot_total",
      message: "The stored order total could not be verified.",
    });
    const [[resolved]] = await db.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
      [attemptId],
    );
    return respondByStatus(res, resolved);
  }

  let checkout;
  try {
    // TRUSTED RETURN URL ONLY — never derived from a request-controlled
    // header (no req.headers.origin fallback). frontendUrl is already
    // validated (http/https, non-empty, trailing slash stripped) by
    // getNormalizedFrontendUrl() above.
    //
    // Reuses paymongoService.createCheckoutSession's additive
    // amountCents parameter — the exact integer centavo value computed
    // in Transaction A is passed straight through, never reconverted
    // via decimal-to-float multiplication. QR Ph as a
    // payment_method_types value is NOT assumed here; this creates a
    // standard checkout session using the currently supported
    // integration, per the approved design (live PayMongo QR Ph
    // capability remains a later sandbox-confirmation item).
    checkout = await createCheckoutSession({
      customer: {
        name: snapshot.customer_name,
        phone: snapshot.customer_phone,
        email: "",
      },
      amountCents: snapshot.total_cents,
      description: `POS QR Payment - Attempt ${attemptRow.checkout_token}`,
      successUrl: `${frontendUrl}/staff/pos/qr-payments/${attemptRow.id}?status=success`,
      cancelUrl: `${frontendUrl}/staff/pos/qr-payments/${attemptRow.id}?status=cancelled`,
      metadata: {
        pos_qr_attempt_id: attemptRow.id,
        checkout_token: attemptRow.checkout_token,
      },
    });
  } catch (err) {
    const classification = classifyProviderError(err);

    if (classification.definite) {
      await handleDefiniteFailure(attemptRow.id, classification);
    } else {
      await handleProviderUnknown(attemptRow.id, classification);
    }

    const [[resolved]] = await db.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
      [attemptRow.id],
    );
    return respondByStatus(res, resolved);
  }

  // VALIDATE PROVIDER SUCCESS RESPONSE — a non-throwing call is not
  // automatically a usable one. A NULL/empty sessionId or checkoutUrl
  // must never be stored as a successful session.
  if (
    !isNonEmptyString(checkout?.sessionId) ||
    !isNonEmptyString(checkout?.checkoutUrl)
  ) {
    await handleProviderUnknown(attemptRow.id, {
      code: "provider_malformed_response",
      message: "The payment provider returned an incomplete session response.",
    });
    const [[resolved]] = await db.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
      [attemptRow.id],
    );
    return respondByStatus(res, resolved);
  }

  // Step 3 — Transaction B success.
  const txConn = await db.getConnection();
  try {
    await txConn.beginTransaction();

    await txConn.query(
      `SELECT id FROM pos_qr_payment_attempts WHERE id = ? FOR UPDATE`,
      [attemptRow.id],
    );

    const [updateResult] = await txConn.query(
      `UPDATE pos_qr_payment_attempts
       SET status = 'awaiting_payment', provider_session_id = ?, checkout_url = ?
       WHERE id = ? AND status = 'creating_session'`,
      [checkout.sessionId, checkout.checkoutUrl, attemptRow.id],
    );

    if (updateResult.affectedRows !== 1) {
      await txConn.rollback();
      txConn.release();
      const [[current]] = await db.query(
        `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
        [attemptRow.id],
      );
      return respondByStatus(res, current);
    }

    await txConn.commit();
  } catch (err) {
    try {
      await txConn.rollback();
    } catch {}
    txConn.release();
    console.error("[pos.qrPayments transactionB]", err);
    return res.status(500).json({ message: "Server error." });
  }
  txConn.release();

  const [[finalAttempt]] = await db.query(
    `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
    [attemptRow.id],
  );
  return respondByStatus(res, finalAttempt);
};

/* ── Dispatch for an EXISTING attempt found during idempotency lookup.
   Ownership is re-checked here too (defense-in-depth — both call sites
   below already check before reaching this function): a cashier must
   never claim, view the checkout_url of, or otherwise touch another
   cashier's attempt. 'reserved' is the only status that may proceed to
   a provider-call claim attempt; every other status is answered
   directly, with no PayMongo call. ── */
const handleExistingAttemptState = async (req, res, attempt) => {
  if (Number(attempt.cashier_id) !== Number(req.user.id)) {
    return res.status(403).json({
      message: "This payment attempt does not belong to you.",
    });
  }
  if (attempt.status === "reserved") {
    return await claimAndCreateSession(req, res, attempt.id);
  }
  return respondByStatus(res, attempt);
};

/* ── Concurrent-insert / lock-contention race handler. Used both for
   ER_DUP_ENTRY (a genuine unique-constraint collision) and as the
   rollback-and-reread recovery step after ER_LOCK_DEADLOCK /
   ER_LOCK_WAIT_TIMEOUT. Re-reads by both (trimmed) columns and applies
   the exact same cross-conflict / ownership / request_hash / status
   rules as the main lookup — never creates a duplicate attempt or
   reservation, never decrements stock twice, never calls PayMongo
   twice. ── */
const handleConflictRace = async (
  req,
  res,
  checkoutToken,
  idempotencyKey,
  requestHash,
) => {
  const [[byToken]] = await db.query(
    `SELECT * FROM pos_qr_payment_attempts WHERE checkout_token = ?`,
    [checkoutToken],
  );
  const [[byKey]] = await db.query(
    `SELECT * FROM pos_qr_payment_attempts WHERE idempotency_key = ?`,
    [idempotencyKey],
  );

  if (byToken && byKey && byToken.id !== byKey.id) {
    return res.status(409).json({
      message: "This checkout_token and idempotency_key refer to different attempts.",
    });
  }

  const existing = byToken || byKey || null;

  if (!existing) {
    return res.status(409).json({ message: "Conflicting request. Please retry." });
  }

  if (Number(existing.cashier_id) !== Number(req.user.id)) {
    return res.status(403).json({
      message: "This payment attempt does not belong to you.",
    });
  }

  if (existing.request_hash !== requestHash) {
    return res.status(409).json({
      message:
        "This checkout_token/idempotency_key was already used for a different request.",
    });
  }

  return await handleExistingAttemptState(req, res, existing);
};

/* ── TRANSACTION A — a single attempt. Throws ER_LOCK_DEADLOCK /
   ER_LOCK_WAIT_TIMEOUT so the caller's bounded retry loop can react;
   every other outcome (business-rule rejection, ER_DUP_ENTRY, or a
   genuine unexpected error) is fully handled here and returns a
   response directly. ── */
const runTransactionA = async (req, res, ctx) => {
  const {
    trimmedCheckoutToken,
    trimmedIdempotencyKey,
    requestHash,
    dedupedItems,
    normalizedCustomerName,
    normalizedCustomerPhone,
    normalizedNotes,
    delivery,
    deliveryCoords,
    normalizedDeliveryRequestedDate,
    discountInputCents,
    deliveryFeeInputCents,
  } = ctx;

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    /* ── steps 1-2: idempotency lookup + conflict rules (trimmed tokens
       used for both lookups). ── */
    const [tokenRows] = await conn.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE checkout_token = ? FOR UPDATE`,
      [trimmedCheckoutToken],
    );
    const [keyRows] = await conn.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE idempotency_key = ? FOR UPDATE`,
      [trimmedIdempotencyKey],
    );

    const tokenAttempt = tokenRows[0] || null;
    const keyAttempt = keyRows[0] || null;

    if (tokenAttempt && keyAttempt && tokenAttempt.id !== keyAttempt.id) {
      await conn.rollback();
      return res.status(409).json({
        message: "This checkout_token and idempotency_key refer to different attempts.",
      });
    }

    const existing = tokenAttempt || keyAttempt || null;

    if (existing) {
      if (Number(existing.cashier_id) !== Number(req.user.id)) {
        await conn.rollback();
        return res.status(403).json({
          message: "This payment attempt does not belong to you.",
        });
      }

      if (existing.request_hash !== requestHash) {
        await conn.rollback();
        return res.status(409).json({
          message:
            "This checkout_token/idempotency_key was already used for a different request.",
        });
      }

      await conn.commit();
      conn.release();
      conn = null;
      return await handleExistingAttemptState(req, res, existing);
    }

    /* ── steps 3-4: deterministic lock order. ── */
    const productIds = dedupedItems.map((item) => item.product_id);
    const productPlaceholders = productIds.map(() => "?").join(",");

    const [productRows] = await conn.query(
      `SELECT id, name, walkin_price, production_cost, stock, reorder_point
       FROM products
       WHERE id IN (${productPlaceholders})
       ORDER BY id ASC
       FOR UPDATE`,
      productIds,
    );

    const productMap = new Map(productRows.map((product) => [product.id, product]));

    /* ── steps 5-6: canonical values + missing/insufficient-stock check. ── */
    for (const item of dedupedItems) {
      const product = productMap.get(item.product_id);

      if (!product) {
        await conn.rollback();
        return res.status(404).json({
          message: `Product not found for item ${item.product_id}.`,
        });
      }

      if (Number(product.stock || 0) < item.quantity) {
        await conn.rollback();
        return res.status(400).json({
          message: `Insufficient stock for ${product.name}.`,
        });
      }
    }

    /* ── step 7: server-side pricing, integer-cents only. ── */
    let subtotalCents = 0;
    const snapshotItems = [];

    for (const item of dedupedItems) {
      const product = productMap.get(item.product_id);
      const unitPriceCents = parseDecimalToCentsStrict(product.walkin_price);
      const productionCostCents = parseDecimalToCentsStrict(product.production_cost) ?? 0;

      if (unitPriceCents === null) {
        await conn.rollback();
        return res.status(400).json({
          message: `Invalid stored price for ${product.name}.`,
        });
      }

      const lineSubtotalCents = unitPriceCents * item.quantity;

      if (!Number.isSafeInteger(lineSubtotalCents)) {
        await conn.rollback();
        return res.status(400).json({
          message: `Line total for ${product.name} is out of range.`,
        });
      }

      /* ── SAFETY CORRECTION: order_items.subtotal is a GENERATED
         DECIMAL(10,2) column (quantity * unit_price) — narrower than the
         DECIMAL(12,2) ceiling used for orders.subtotal/total below.
         Rejected here, before stock is decremented and before any
         PayMongo call. ── */
      if (lineSubtotalCents > MAX_DECIMAL_10_2_CENTS) {
        await conn.rollback();
        return res.status(400).json({
          message: `Line total for ${product.name} exceeds the maximum allowed amount.`,
        });
      }

      subtotalCents += lineSubtotalCents;

      snapshotItems.push({
        product_id: item.product_id,
        product_name: product.name,
        unit_price: centsToDecimalString(unitPriceCents),
        production_cost: centsToDecimalString(productionCostCents),
        quantity: item.quantity,
        subtotal: centsToDecimalString(lineSubtotalCents),
      });
    }

    /* ── step 8: overflow / positive-total guards — BEFORE stock is
       touched. ── */
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Invalid order subtotal." });
    }
    if (subtotalCents > MAX_DECIMAL_12_2_CENTS) {
      await conn.rollback();
      return res.status(400).json({
        message: "Order subtotal exceeds the maximum allowed amount.",
      });
    }
    if (discountInputCents > subtotalCents) {
      await conn.rollback();
      return res.status(400).json({ message: "Discount cannot exceed the subtotal." });
    }

    const totalCentsRaw = subtotalCents - discountInputCents + deliveryFeeInputCents;

    if (!Number.isSafeInteger(totalCentsRaw)) {
      await conn.rollback();
      return res.status(400).json({ message: "Invalid order total." });
    }

    const totalCents = Math.max(totalCentsRaw, 0);

    if (totalCents > MAX_DECIMAL_12_2_CENTS) {
      await conn.rollback();
      return res.status(400).json({
        message: "Order total exceeds the maximum allowed amount.",
      });
    }
    if (totalCents <= 0) {
      await conn.rollback();
      return res.status(400).json({
        message: "Order total must be greater than zero for online payment.",
      });
    }

    /* ── step 8 continued: guarded, deterministic-order decrement —
       THIS is the reservation. ── */
    for (const item of dedupedItems) {
      const [updateResult] = await conn.query(
        `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`,
        [item.quantity, item.product_id, item.quantity],
      );

      if (updateResult.affectedRows !== 1) {
        await conn.rollback();
        return res.status(409).json({
          message: "Stock changed for one of the items. Please try again.",
        });
      }

      await conn.query(recalcStockStatusSql, [item.product_id]);
    }

    /* ── immutable snapshot, built from the values already
       locked/decremented/validated above — never recomputed later.
       total_cents is stored alongside the decimal total so the
       provider call can use the exact integer value directly. ── */
    const checkoutSnapshot = JSON.stringify({
      customer_name: normalizedCustomerName,
      customer_phone: normalizedCustomerPhone,
      items: snapshotItems,
      subtotal: centsToDecimalString(subtotalCents),
      discount: centsToDecimalString(discountInputCents),
      delivery_fee: centsToDecimalString(deliveryFeeInputCents),
      total: centsToDecimalString(totalCents),
      total_cents: totalCents,
      delivery: delivery
        ? {
            address: String(delivery.address || "").trim(),
            lat: deliveryCoords.lat,
            lng: deliveryCoords.lng,
            requested_date: normalizedDeliveryRequestedDate,
            notes: String(delivery.notes || "").trim(),
          }
        : null,
      notes: normalizedNotes,
    });

    /* ── steps 9-10: insert attempt + one reservation per product. ── */
    const ttlMinutes = getTtlMinutes();

    const [attemptResult] = await conn.query(
      `INSERT INTO pos_qr_payment_attempts
        (checkout_token, idempotency_key, request_hash, status, provider,
         cashier_id, checkout_snapshot, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, 'reserved', 'paymongo', ?, ?, NOW(), NOW(),
         DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [
        trimmedCheckoutToken,
        trimmedIdempotencyKey,
        requestHash,
        req.user.id,
        checkoutSnapshot,
        ttlMinutes,
      ],
    );

    const attemptId = attemptResult.insertId;

    for (const item of dedupedItems) {
      await conn.query(
        `INSERT INTO pos_qr_stock_reservations
          (payment_attempt_id, product_id, quantity, status, created_at)
         VALUES (?, ?, ?, 'active', NOW())`,
        [attemptId, item.product_id, item.quantity],
      );
    }

    /* ── step 11: commit — before any PayMongo call. ── */
    await conn.commit();
    conn.release();
    conn = null;

    return await claimAndCreateSession(req, res, attemptId);
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    if (err && err.code === "ER_DUP_ENTRY") {
      return await handleConflictRace(
        req,
        res,
        trimmedCheckoutToken,
        trimmedIdempotencyKey,
        requestHash,
      );
    }

    // Bounded lock-contention retry is handled by the caller — rethrow
    // only these two specific error codes; everything else is a
    // genuine unexpected error and gets a sanitized response here.
    if (
      err &&
      (err.code === "ER_LOCK_DEADLOCK" || err.code === "ER_LOCK_WAIT_TIMEOUT")
    ) {
      throw err;
    }

    console.error("[pos.qrPayments createAttempt]", err);
    return res.status(500).json({ message: "Server error." });
  } finally {
    if (conn) conn.release();
  }
};

/* ══════════════════════════════════════════════════════════════
   POST /api/pos/qr-payments/attempts
   Route-level requirePosQrEnabled middleware (using
   isPosQrTestSafeConfigured, exported above) runs BEFORE authenticate
   (see routes/pos.qrPayments.js). The check below is a defensive
   second layer only.
══════════════════════════════════════════════════════════════ */
exports.createAttempt = async (req, res) => {
  if (!isPosQrTestSafeConfigured()) {
    return res.status(503).json({
      message: "Online payment (QR Ph) is not yet available at this terminal.",
    });
  }

  const {
    checkout_token,
    idempotency_key,
    customer_name,
    customer_phone,
    items: rawItems,
    discount,
    delivery_fee,
    delivery,
    notes,
  } = req.body;

  /* ── STRICT TYPE CHECK — reject numeric, object, array, boolean, null,
     or undefined token values outright, before any trim/lookup/hash
     work touches them. Only a genuine string is acceptable. ── */
  if (typeof checkout_token !== "string") {
    return res.status(400).json({ message: "A valid checkout_token is required." });
  }
  if (typeof idempotency_key !== "string") {
    return res.status(400).json({ message: "A valid idempotency_key is required." });
  }

  /* ── Trim tokens — every subsequent step (length check, lookup,
     hashing, insertion, duplicate-race reread) uses these trimmed
     values, never the raw request-body strings. ── */
  const trimmedCheckoutToken = checkout_token.trim();
  const trimmedIdempotencyKey = idempotency_key.trim();

  if (
    trimmedCheckoutToken.length === 0 ||
    trimmedCheckoutToken.length > MAX_TOKEN_LENGTH
  ) {
    return res.status(400).json({ message: "A valid checkout_token is required." });
  }
  if (
    trimmedIdempotencyKey.length === 0 ||
    trimmedIdempotencyKey.length > MAX_TOKEN_LENGTH
  ) {
    return res.status(400).json({ message: "A valid idempotency_key is required." });
  }

  /* ── Required customer fields — no silent "Walk-in Customer" fallback
     for this endpoint; both name and a valid phone are mandatory. ── */
  if (!isNonEmptyString(customer_name)) {
    return res.status(400).json({ message: "Customer name is required." });
  }
  if (!isNonEmptyString(customer_phone) || !isValidPhoneNumber(customer_phone)) {
    return res
      .status(400)
      .json({ message: "A valid customer phone number is required." });
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ message: "Cart is empty." });
  }
  if (!isValidNonNegativeNumber(discount)) {
    return res.status(400).json({ message: "Invalid discount amount." });
  }
  if (!isValidNonNegativeNumber(delivery_fee)) {
    return res.status(400).json({ message: "Invalid delivery fee amount." });
  }
  if (delivery && !String(delivery.address || "").trim()) {
    return res.status(400).json({ message: "Delivery address is required." });
  }

  const deliveryCoords = validateDeliveryCoords(delivery);
  if (!deliveryCoords.ok) {
    return res.status(400).json({
      message:
        "Invalid map location. Latitude must be between -90 and 90, and longitude between -180 and 180.",
    });
  }

  /* ── SAFETY CORRECTION: delivery requested date is REQUIRED when
     delivery is present, and must be a genuine calendar date/time
     (YYYY-MM-DDTHH:mm, optionally with :ss) — not just regex-shaped.
     Rejected here, before Transaction A, before any stock reservation,
     and before any PayMongo call. ── */
  const deliveryDateResult = resolveDeliveryRequestedDate(delivery);
  if (!deliveryDateResult.ok) {
    return res.status(400).json({
      message: "A valid delivery date and time is required.",
    });
  }

  const dedupedItems = dedupeAndSortItems(rawItems);
  if (!dedupedItems) {
    return res.status(400).json({ message: "Invalid cart item detected." });
  }

  const normalizedCustomerName = normalizeText(customer_name);

  /* ── SAFETY CORRECTION: orders.walkin_customer_name is VARCHAR(150).
     Rejected here, after normalization and before Transaction A — no
     stock reservation, no PayMongo call for an over-length name. ── */
  if (normalizedCustomerName.length > 150) {
    return res.status(400).json({
      message: "Customer name is too long (maximum 150 characters).",
    });
  }

  const normalizedCustomerPhone = normalizePhoneDigits(customer_phone);
  const normalizedNotes = normalizeText(notes);
  const normalizedDeliveryForHash = normalizeDeliveryForHash(
    delivery,
    deliveryCoords,
    deliveryDateResult.value,
  );

  const discountInputCents =
    discount === undefined || discount === null || discount === ""
      ? 0
      : parseDecimalToCentsStrict(discount);
  if (discountInputCents === null) {
    return res.status(400).json({ message: "Invalid discount amount." });
  }

  const deliveryFeeInputCents =
    delivery_fee === undefined || delivery_fee === null || delivery_fee === ""
      ? 0
      : parseDecimalToCentsStrict(delivery_fee);
  if (deliveryFeeInputCents === null) {
    return res.status(400).json({ message: "Invalid delivery fee amount." });
  }

  /* ── SAFETY CORRECTION: orders.discount and orders.delivery_fee are
     DECIMAL(10,2) columns — narrower than the DECIMAL(12,2) ceiling
     already enforced by parseDecimalToCentsStrict. Rejected here, before
     Transaction A, before any stock reservation, and before any
     PayMongo call. ── */
  if (discountInputCents > MAX_DECIMAL_10_2_CENTS) {
    return res.status(400).json({
      message: "Discount amount exceeds the maximum allowed amount.",
    });
  }
  if (deliveryFeeInputCents > MAX_DECIMAL_10_2_CENTS) {
    return res.status(400).json({
      message: "Delivery fee amount exceeds the maximum allowed amount.",
    });
  }

  /* ── request_hash — stable request INTENT only; never live prices.
     Delivery lat/lng ARE included (via normalizedDeliveryForHash), so a
     different map pin always produces a different hash. ── */
  const canonicalInput = {
    items: dedupedItems,
    customer_name: normalizedCustomerName,
    customer_phone: normalizedCustomerPhone,
    delivery: normalizedDeliveryForHash,
    notes: normalizedNotes,
    discount_input_cents: discountInputCents,
    delivery_fee_input_cents: deliveryFeeInputCents,
  };
  const requestHash = buildRequestHash(canonicalInput);

  const ctx = {
    trimmedCheckoutToken,
    trimmedIdempotencyKey,
    requestHash,
    dedupedItems,
    normalizedCustomerName,
    normalizedCustomerPhone,
    normalizedNotes,
    delivery,
    deliveryCoords,
    normalizedDeliveryRequestedDate: deliveryDateResult.value,
    discountInputCents,
    deliveryFeeInputCents,
  };

  /* ── Bounded retry — ONLY for ER_LOCK_DEADLOCK / ER_LOCK_WAIT_TIMEOUT.
     Every retry re-runs the whole of runTransactionA from scratch on a
     fresh connection/transaction; since the prior attempt was fully
     rolled back by MySQL before throwing, this can never decrement
     stock twice, create a duplicate attempt, or call PayMongo twice. ── */
  for (let attemptNum = 1; attemptNum <= MAX_LOCK_RETRY_ATTEMPTS; attemptNum += 1) {
    try {
      return await runTransactionA(req, res, ctx);
    } catch (err) {
      const isLockContention =
        err && (err.code === "ER_LOCK_DEADLOCK" || err.code === "ER_LOCK_WAIT_TIMEOUT");

      if (isLockContention && attemptNum < MAX_LOCK_RETRY_ATTEMPTS) {
        continue;
      }

      console.error(
        "[pos.qrPayments createAttempt] lock contention exhausted or unexpected error",
        err,
      );
      return res.status(503).json({
        message: "The system is busy. Please try again in a moment.",
      });
    }
  }
};

/* ══════════════════════════════════════════════════════════════════════
   PHASE 3D-A — VERIFY PAYMENT ATTEMPT
   POST /api/pos/qr-payments/attempts/:id/verify

   Route-level requirePosQrEnabled + authenticate + requireCashierOrAdmin
   (see routes/pos.qrPayments.js) already ran before this controller. The
   isPosQrTestSafeConfigured() check below is a defensive second layer
   only, exactly like exports.createAttempt above.

   This endpoint NEVER trusts frontend payment claims, redirect query
   params, or request-body payment details — it re-derives everything
   from the stored attempt row and a fresh PayMongo Checkout Session
   retrieval. The provider call happens with ZERO open transaction and
   ZERO held row locks; all DB writes happen afterwards, inside one short
   FOR-UPDATE-guarded transaction.
══════════════════════════════════════════════════════════════════════ */

// Reasonable sanity bounds for a PayMongo `paid_at` Unix-seconds
// timestamp — rejects clearly malformed/garbage values (e.g. millisecond
// timestamps, negative numbers, far-future strings) without hardcoding a
// single "current time" cutoff that would break as real time advances.
const MIN_REASONABLE_EPOCH_SECONDS = 946684800; // 2000-01-01T00:00:00Z
const MAX_REASONABLE_EPOCH_SECONDS = 4102444800; // 2100-01-01T00:00:00Z

// Converts a PayMongo `payments[].attributes.paid_at` value into a JS
// Date, for use as a direct query parameter (mysql2 formats a Date
// object for a DATETIME column using the pool's configured timezone —
// see config/db.js — the same convention already used elsewhere in this
// codebase, e.g. controllers/customer/customer.profile.js's `expires`
// value).
//
// SAFETY CORRECTION (Phase 3D-A final pass): STRICT integer Unix-seconds
// only. A provider payment record is either exactly what PayMongo's
// documented shape says (a whole-number seconds timestamp) or it is
// treated as malformed — never silently reinterpreted. This function
// deliberately does NOT accept:
//   - ISO-8601 / any other string representation (a string paid_at is a
//     shape the provider never legitimately sends for this field; a
//     lenient string fallback would let a malformed/spoofed payload be
//     silently coerced into "looks valid")
//   - fractional/rounded values (e.g. 1732531200.5) — Math.round() used
//     to previously mask this; a non-integer timestamp is now rejected
//     outright rather than quietly snapped to the nearest second
// Returns null for anything that isn't a genuine whole-number Unix
// timestamp within a sane range — callers must treat null as "this
// candidate payment fails validation," never as "treat as now."
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

// Strict decimal-string shape check for values already produced by
// centsToDecimalString and persisted inside checkout_snapshot — exactly
// two decimal places, non-negative (this snapshot never stores a
// negative amount).
const DECIMAL_2DP_PATTERN = /^\d+\.\d{2}$/;

// Strictly parses and validates an attempt's checkout_snapshot JSON
// before it is ever used to create DB rows. Returns null for ANY
// malformed shape — the caller treats null as a sanitized server error
// and rolls back rather than guessing at a "close enough" reconstruction.
// This re-validates independently of the pre-transaction preview parse
// in exports.verifyAttempt below, using the FOR-UPDATE-locked row's own
// checkout_snapshot value (the two are expected to be byte-identical,
// since checkout_snapshot is written once at attempt creation and never
// updated afterwards — this is defense-in-depth, not a compensating
// control for a real mutation path).
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
  // SAFETY CORRECTION defense-in-depth: orders.walkin_customer_name is
  // VARCHAR(150). createAttempt already rejects an over-length name
  // before Transaction A ever runs; this is an independent re-check of
  // the persisted checkout_snapshot value itself.
  if (customer_name.length > 150) return null;
  if (
    typeof customer_phone !== "string" ||
    customer_phone.trim().length === 0
  ) {
    return null;
  }
  if (!Array.isArray(items) || items.length === 0) return null;
  if (!Number.isSafeInteger(total_cents) || total_cents <= 0) return null;

  if (typeof subtotal !== "string" || !DECIMAL_2DP_PATTERN.test(subtotal)) {
    return null;
  }
  if (typeof discount !== "string" || !DECIMAL_2DP_PATTERN.test(discount)) {
    return null;
  }
  if (
    typeof delivery_fee !== "string" ||
    !DECIMAL_2DP_PATTERN.test(delivery_fee)
  ) {
    return null;
  }
  if (typeof total !== "string" || !DECIMAL_2DP_PATTERN.test(total)) {
    return null;
  }

  // Internal consistency: the persisted decimal strings must agree with
  // total_cents and with each other, in integer-cents arithmetic only.
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
  // SAFETY CORRECTION defense-in-depth: orders.discount and
  // orders.delivery_fee are DECIMAL(10,2) columns — narrower than
  // MAX_DECIMAL_12_2_CENTS, which parseDecimalToCentsStrict already
  // enforces for every value above (subtotalCents/discountCents/
  // deliveryFeeCents/totalCentsFromDecimal). orders.subtotal and
  // orders.total remain DECIMAL(12,2) and keep their existing
  // MAX_DECIMAL_12_2_CENTS-based checks unchanged, below.
  if (discountCents > MAX_DECIMAL_10_2_CENTS) return null;
  if (deliveryFeeCents > MAX_DECIMAL_10_2_CENTS) return null;
  if (totalCentsFromDecimal !== total_cents) return null;
  if (
    !Number.isSafeInteger(subtotalCents - discountCents + deliveryFeeCents)
  ) {
    return null;
  }
  if (
    Math.max(subtotalCents - discountCents + deliveryFeeCents, 0) !==
    total_cents
  ) {
    return null;
  }

  /* ── SAFETY CORRECTION: duplicate product_id guard. A Set proves every
     snapshot product appears EXACTLY once — this is checked independently
     of (and in addition to) the later reservation-count comparison, so a
     duplicate can never slip through by coincidentally matching a
     reservation row count. ── */
  const seenProductIds = new Set();

  /* ── SAFETY CORRECTION: item financial consistency, in integer cents
     only. Every line's unit_price * quantity must equal its own
     subtotal, and — after the loop — the sum of every line's subtotal
     must equal the top-level snapshot.subtotal (subtotalCents, already
     parsed above). Any inconsistency rejects the whole snapshot BEFORE
     any order row is ever created. ── */
  let lineSubtotalCentsSum = 0;

  const normalizedItems = [];
  for (const item of items) {
    const productId = parseStrictPositiveInt(item?.product_id);
    const quantity = parseStrictPositiveInt(item?.quantity);
    if (!productId || !quantity) return null;

    if (seenProductIds.has(productId)) return null; // duplicate product_id
    seenProductIds.add(productId);

    if (
      typeof item.product_name !== "string" ||
      item.product_name.trim().length === 0
    ) {
      return null;
    }
    if (
      typeof item.unit_price !== "string" ||
      !DECIMAL_2DP_PATTERN.test(item.unit_price)
    ) {
      return null;
    }
    if (
      typeof item.production_cost !== "string" ||
      !DECIMAL_2DP_PATTERN.test(item.production_cost)
    ) {
      return null;
    }
    if (
      typeof item.subtotal !== "string" ||
      !DECIMAL_2DP_PATTERN.test(item.subtotal)
    ) {
      return null;
    }

    // parseDecimalToCentsStrict already enforces the DECIMAL(12,2)
    // ceiling (MAX_DECIMAL_12_2_CENTS) and rejects negative/malformed
    // values — this satisfies "within DB limits" for all three fields.
    const unitPriceCents = parseDecimalToCentsStrict(item.unit_price);
    const productionCostCents = parseDecimalToCentsStrict(
      item.production_cost,
    );
    const itemSubtotalCents = parseDecimalToCentsStrict(item.subtotal);

    if (
      unitPriceCents === null ||
      productionCostCents === null ||
      itemSubtotalCents === null
    ) {
      return null;
    }
    // SAFETY CORRECTION defense-in-depth: products.walkin_price /
    // products.production_cost / order_items.subtotal are all
    // DECIMAL(10,2) columns — narrower than MAX_DECIMAL_12_2_CENTS,
    // which parseDecimalToCentsStrict already enforced above for each
    // of these three values.
    if (
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

  // Sum of every validated line subtotal must equal the top-level
  // snapshot subtotal (subtotalCents was already parsed and validated
  // above from the `subtotal` field).
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

/* ── Loads the response payload for an attempt that is ALREADY
   'consumed' — used both for the normal idempotent-replay branch inside
   the finalization transaction, and for the ER_DUP_ENTRY recovery path.
   Returns null if order_id/payment_transaction_id are missing, or if the
   linked order/payment_transaction/receipt rows cannot all be found —
   the caller treats null as a sanitized server error and NEVER creates a
   second order as a recovery step.

   SAFETY CORRECTION: this now requires full CROSS-LINKAGE, not just
   independent existence —
     payment_transactions.id       = attempt.payment_transaction_id
     payment_transactions.order_id = attempt.order_id
     receipts.payment_transaction_id = attempt.payment_transaction_id
     receipts.order_id               = attempt.order_id
   A payment_transactions/receipts row that exists but points at a
   DIFFERENT order (e.g. from a corrupted or hand-edited row) fails
   loadFinalizedPayload rather than being silently accepted as "close
   enough." ── */
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

/* ── FINALIZATION TRANSACTION. Called either with a matchedPayment
   (fresh finalization path — attempt is expected to be
   'awaiting_payment') or with matchedPayment = null (idempotent-replay
   path — attempt is expected to be already 'consumed'). Every branch
   that can fail after conn.beginTransaction() rolls back before
   responding; req.auditRecord is set ONLY on the single fresh-commit
   success branch, never on a replay, so a repeated verify call never
   writes a second misleading "order_created" audit row. ── */
const runFinalizationTransaction = async (req, res, attemptId, matchedPayment) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    /* ── step 1: lock the attempt row. ── */
    const [[attempt]] = await conn.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE id = ? FOR UPDATE`,
      [attemptId],
    );

    if (!attempt) {
      await conn.rollback();
      return res.status(404).json({ message: "Payment attempt not found." });
    }

    /* ── step 2: recheck ownership. ── */
    if (Number(attempt.cashier_id) !== Number(req.user.id)) {
      await conn.rollback();
      return res.status(403).json({
        message: "This payment attempt does not belong to you.",
      });
    }

    /* ── step 3: idempotent replay — attempt already consumed. ── */
    if (attempt.status === "consumed") {
      const payload = await loadFinalizedPayload(conn, attempt);
      if (!payload) {
        await conn.rollback();
        console.error(
          "[pos.qrPayments verifyAttempt] consumed attempt missing linked records",
          { attemptId: attempt.id },
        );
        return res.status(500).json({ message: "Server error." });
      }
      await conn.commit();
      conn.release();
      conn = null;
      return res.status(200).json(payload);
    }

    /* ── step 4: otherwise require status === awaiting_payment. ── */
    if (attempt.status !== "awaiting_payment") {
      await conn.rollback();
      return res.status(409).json({
        attempt_id: attempt.id,
        status: attempt.status,
        message: "This payment attempt is not awaiting verification.",
      });
    }

    if (!matchedPayment) {
      // Should never happen — exports.verifyAttempt only calls this
      // function with matchedPayment === null when it already read
      // status === 'consumed' pre-transaction. A status flip to
      // 'awaiting_payment' with a null matchedPayment indicates an
      // internal caller error, not a client-triggerable state.
      await conn.rollback();
      console.error(
        "[pos.qrPayments verifyAttempt] internal error: awaiting_payment with no matchedPayment",
        { attemptId: attempt.id },
      );
      return res.status(500).json({ message: "Server error." });
    }

    /* ── step 5: revalidate provider_session_id against the locked row. ── */
    if (attempt.provider_session_id !== matchedPayment.sessionId) {
      await conn.rollback();
      return res.status(502).json({
        message: "Payment provider session could not be verified.",
      });
    }

    /* ── step 6: lock active reservations, ordered by product_id. ── */
    const [reservations] = await conn.query(
      `SELECT id, product_id, quantity FROM pos_qr_stock_reservations
       WHERE payment_attempt_id = ? AND status = 'active'
       ORDER BY product_id ASC
       FOR UPDATE`,
      [attempt.id],
    );

    if (reservations.length === 0) {
      await conn.rollback();
      console.error(
        "[pos.qrPayments verifyAttempt] no active reservations for awaiting_payment attempt",
        { attemptId: attempt.id },
      );
      return res.status(500).json({ message: "Server error." });
    }

    /* ── step 7: parse and strictly validate checkout_snapshot. ── */
    const snapshot = parseAndValidateSnapshot(attempt.checkout_snapshot);
    if (!snapshot) {
      await conn.rollback();
      console.error(
        "[pos.qrPayments verifyAttempt] invalid checkout_snapshot",
        { attemptId: attempt.id },
      );
      return res.status(500).json({ message: "Server error." });
    }

    /* ── step 8: exact one-to-one equality between snapshot items and
       active reservations — same product IDs, same quantities, no
       missing or extra rows.
       SAFETY CORRECTION: compare raw ARRAY LENGTHS (not Map sizes, which
       silently collapse duplicate keys) after sorting both collections by
       product_id, then compare each pair directly index-by-index.
       parseAndValidateSnapshot already rejects a snapshot with a
       duplicate product_id, and the DB's UNIQUE (payment_attempt_id,
       product_id) constraint on pos_qr_stock_reservations makes a
       duplicate reservation row structurally impossible — this
       length+sorted-pairwise comparison is the explicit, defense-in-depth
       proof that both sides genuinely contain the same single-appearance
       set, rather than relying on either of those guarantees alone. ── */
    const sortedReservations = [...reservations].sort(
      (a, b) => a.product_id - b.product_id,
    );
    const sortedSnapshotItems = [...snapshot.items].sort(
      (a, b) => a.product_id - b.product_id,
    );

    let reservationsMatchSnapshot =
      sortedReservations.length === sortedSnapshotItems.length;
    if (reservationsMatchSnapshot) {
      for (let i = 0; i < sortedReservations.length; i += 1) {
        if (
          sortedReservations[i].product_id !== sortedSnapshotItems[i].product_id ||
          sortedReservations[i].quantity !== sortedSnapshotItems[i].quantity
        ) {
          reservationsMatchSnapshot = false;
          break;
        }
      }
    }

    if (!reservationsMatchSnapshot) {
      await conn.rollback();
      console.error(
        "[pos.qrPayments verifyAttempt] reservation/snapshot mismatch",
        { attemptId: attempt.id },
      );
      return res.status(500).json({ message: "Server error." });
    }

    /* ── defensive re-check: matched payment amount vs snapshot total. ── */
    if (matchedPayment.amount !== snapshot.total_cents) {
      await conn.rollback();
      return res.status(502).json({
        message: "Payment amount could not be verified.",
      });
    }

    /* ── step 9: NO products.stock decrement here — already reserved. ── */

    /* ── step 10: create the walk-in standard order from the immutable
       snapshot. ── */
    const orderNumber = await generateWalkInOrderNumber(conn);
    const hasDelivery = Boolean(
      snapshot.delivery && String(snapshot.delivery.address || "").trim(),
    );
    const orderStatus = hasDelivery ? "confirmed" : "completed";
    // SAFETY CORRECTION: checkout_snapshot.delivery.requested_date was
    // already normalized to the MySQL-compatible "YYYY-MM-DD HH:mm:ss"
    // shape by resolveDeliveryRequestedDate/normalizeDeliveryRequestedDate
    // at attempt-creation time (see createAttempt/runTransactionA above)
    // — used consistently here with no further transformation.
    const requestedDeliveryDateForInsert = snapshot.delivery?.requested_date || null;

    const [orderResult] = await conn.query(
      `
      INSERT INTO orders
        (order_number, walkin_customer_name, walkin_customer_phone, type, order_type,
         status, payment_method, payment_status, subtotal, tax, discount, delivery_fee, total,
         notes, delivery_address, delivery_lat, delivery_lng, requested_delivery_date, delivery_request_notes)
      VALUES (?, ?, ?, 'walkin', 'standard', ?, 'paymongo', 'paid', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
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
        requestedDeliveryDateForInsert,
        snapshot.delivery?.notes || null,
      ],
    );

    if (!orderResult.insertId) {
      await conn.rollback();
      return res.status(500).json({ message: "Server error." });
    }
    const orderId = orderResult.insertId;

    /* ── step 11: order_items + step 12: stock_movements (audit only,
       no stock column touched). ── */
    for (const item of snapshot.items) {
      const [itemResult] = await conn.query(
        `
        INSERT INTO order_items
          (order_id, product_id, product_name, quantity, unit_price, production_cost)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
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
        return res.status(500).json({ message: "Server error." });
      }

      await conn.query(
        `
        INSERT INTO stock_movements
          (product_id, type, quantity, order_id, order_item_id, notes, created_by)
        VALUES (?, 'out', ?, ?, ?, 'POS QR payment sale (stock already reserved at attempt creation)', ?)
        `,
        [
          item.product_id,
          item.quantity,
          orderId,
          itemResult.insertId,
          req.user.id,
        ],
      );
    }

    /* ── step 13: one verified payment_transactions row. ── */
    const [paymentResult] = await conn.query(
      `
      INSERT INTO payment_transactions
        (order_id, amount, payment_method, status, verified_by, verified_at, notes)
      VALUES (?, ?, 'paymongo', 'verified', ?, NOW(), ?)
      `,
      [
        orderId,
        snapshot.total,
        req.user.id,
        "Verified via PayMongo POS QR payment attempt.",
      ],
    );

    if (!paymentResult.insertId) {
      await conn.rollback();
      return res.status(500).json({ message: "Server error." });
    }
    const paymentTransactionId = paymentResult.insertId;

    /* ── step 14: one POS receipt via receiptService. ── */
    const receiptNumber = `OR-${Date.now()}`;
    const itemsSnapshotJson = JSON.stringify(
      snapshot.items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        unit_price: item.unit_price,
        production_cost: item.production_cost,
        quantity: item.quantity,
      })),
    );

    const receiptResult = await createPosSaleReceipt(conn, {
      orderId,
      paymentTransactionId,
      receiptNumber,
      issuedTo: snapshot.customer_name || "Walk-in Customer",
      issuedBy: req.user.id,
      totalAmount: snapshot.total,
      cashReceived: null,
      changeAmount: null,
      itemsSnapshot: itemsSnapshotJson,
      paymentMethodSnapshot: "paymongo",
    });

    /* ── step 15: mark active reservations consumed. ── */
    const [reservationUpdateResult] = await conn.query(
      `
      UPDATE pos_qr_stock_reservations
      SET status = 'consumed', consumed_at = NOW()
      WHERE payment_attempt_id = ? AND status = 'active'
      `,
      [attempt.id],
    );

    if (reservationUpdateResult.affectedRows !== reservations.length) {
      await conn.rollback();
      return res.status(500).json({ message: "Server error." });
    }

    /* ── step 16: update the attempt itself. ── */
    const [attemptUpdateResult] = await conn.query(
      `
      UPDATE pos_qr_payment_attempts
      SET status = 'consumed',
          provider_payment_id = ?,
          verified_amount = ?,
          verified_currency = ?,
          paid_at = ?,
          order_id = ?,
          payment_transaction_id = ?
      WHERE id = ? AND status = 'awaiting_payment'
      `,
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

    /* ── step 17: validate affectedRows. ── */
    if (attemptUpdateResult.affectedRows !== 1) {
      await conn.rollback();
      return res.status(500).json({ message: "Server error." });
    }

    /* ── step 18: commit. ── */
    await conn.commit();
    conn.release();
    conn = null;

    req.auditRecord = {
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
    };

    return res.status(200).json({
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
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    /* ── Rare ER_DUP_ENTRY collision (e.g. two verify calls racing past
       the FOR UPDATE lock boundary on retry). Reread the attempt on the
       pool (outside any transaction) — if it is now consumed, return the
       existing finalized result idempotently; otherwise a sanitized
       retryable error. Never creates a second order as recovery. ── */
    if (err && err.code === "ER_DUP_ENTRY") {
      try {
        const [[reread]] = await db.query(
          `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
          [attemptId],
        );

        if (reread && reread.status === "consumed") {
          const replayConn = await db.getConnection();
          try {
            await replayConn.beginTransaction();
            const payload = await loadFinalizedPayload(replayConn, reread);
            if (payload) {
              await replayConn.commit();
              return res.status(200).json(payload);
            }
            await replayConn.rollback();
          } catch {
            try {
              await replayConn.rollback();
            } catch {}
          } finally {
            replayConn.release();
          }
        }
      } catch (rereadErr) {
        console.error(
          "[pos.qrPayments verifyAttempt] ER_DUP_ENTRY reread failed",
          rereadErr,
        );
      }

      return res.status(503).json({
        message: "The system is busy. Please try again in a moment.",
      });
    }

    console.error("[pos.qrPayments verifyAttempt]", err);
    return res.status(500).json({ message: "Server error." });
  } finally {
    if (conn) conn.release();
  }
};

exports.verifyAttempt = async (req, res) => {
  if (!isPosQrTestSafeConfigured()) {
    return res.status(503).json({
      message: "Online payment (QR Ph) is not yet available at this terminal.",
    });
  }

  const attemptId = parseStrictPositiveInt(req.params.id);
  if (!attemptId) {
    return res.status(400).json({ message: "A valid payment attempt id is required." });
  }

  /* ── Ownership + status routing read — plain SELECT, no lock, no open
     transaction. Authoritative re-checks happen inside
     runFinalizationTransaction under FOR UPDATE. ── */
  const [[attemptRow]] = await db.query(
    `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
    [attemptId],
  );

  if (!attemptRow) {
    return res.status(404).json({ message: "Payment attempt not found." });
  }

  if (Number(attemptRow.cashier_id) !== Number(req.user.id)) {
    return res.status(403).json({
      message: "This payment attempt does not belong to you.",
    });
  }

  /* ── Already consumed — skip the provider call entirely and go
     straight to the idempotent-replay branch of the finalization
     transaction. ── */
  if (attemptRow.status === "consumed") {
    return await runFinalizationTransaction(req, res, attemptId, null);
  }

  if (attemptRow.status !== "awaiting_payment") {
    return res.status(409).json({
      attempt_id: attemptRow.id,
      status: attemptRow.status,
      message: "This payment attempt is not awaiting verification.",
    });
  }

  if (!isNonEmptyString(attemptRow.provider_session_id)) {
    console.error(
      "[pos.qrPayments verifyAttempt] awaiting_payment attempt missing provider_session_id",
      { attemptId: attemptRow.id },
    );
    return res.status(500).json({ message: "Server error." });
  }

  /* ── Pre-transaction snapshot preview — only to read total_cents for
     the amount-matching comparison below. Re-validated in full, from the
     FOR-UPDATE-locked row, inside runFinalizationTransaction. ── */
  let snapshotPreview;
  try {
    snapshotPreview = JSON.parse(attemptRow.checkout_snapshot);
  } catch {
    console.error(
      "[pos.qrPayments verifyAttempt] unparsable checkout_snapshot",
      { attemptId: attemptRow.id },
    );
    return res.status(500).json({ message: "Server error." });
  }
  if (
    !snapshotPreview ||
    typeof snapshotPreview !== "object" ||
    !Number.isSafeInteger(snapshotPreview.total_cents) ||
    snapshotPreview.total_cents <= 0
  ) {
    console.error(
      "[pos.qrPayments verifyAttempt] invalid total_cents in checkout_snapshot",
      { attemptId: attemptRow.id },
    );
    return res.status(500).json({ message: "Server error." });
  }

  /* ── Retrieve the Checkout Session — ZERO open transaction, ZERO held
     row locks. Any failure here (network error, timeout, reset,
     malformed response, or 5xx) returns a sanitized 502/503 WITHOUT
     touching the database: the attempt stays 'awaiting_payment' and
     reservations stay active. ── */
  let session;
  try {
    session = await retrieveCheckoutSession(attemptRow.provider_session_id);
  } catch (err) {
    const status = err?.response?.status;
    if (typeof status === "number") {
      // The provider responded, but with an error — treat as a
      // sanitized upstream failure. Never echoes the raw provider body.
      return res.status(502).json({
        message:
          "Unable to verify payment status with the provider right now. Please try again.",
      });
    }
    // No response at all — network error, timeout, connection reset.
    return res.status(503).json({
      message: "Payment provider is temporarily unavailable. Please try again shortly.",
    });
  }

  if (
    !session ||
    typeof session !== "object" ||
    !isNonEmptyString(session.id) ||
    typeof session.attributes !== "object" ||
    session.attributes === null
  ) {
    return res.status(502).json({
      message: "The payment provider returned an incomplete response.",
    });
  }

  /* ── PAYMENT MATCHING step 1: session.id must equal the stored
     provider_session_id. ── */
  if (session.id !== attemptRow.provider_session_id) {
    return res.status(502).json({
      message: "Payment provider session could not be verified.",
    });
  }

  /* ── steps 2-5: read payments[]. SAFETY CORRECTION: a missing or
     non-array `payments` field is itself a malformed provider response —
     it must NEVER be silently coerced into an empty array (which would
     incorrectly fall through to "pending"). Treated exactly like the
     other malformed-response cases above: sanitized 502, attempt stays
     'awaiting_payment', reservations stay active, zero DB writes. ── */
  if (!Array.isArray(session.attributes.payments)) {
    return res.status(502).json({
      message: "The payment provider returned an incomplete response.",
    });
  }
  const paymentsRaw = session.attributes.payments;

  /* ── Validate every status==='paid' entry against ALL required fields
     as a single unit. Two distinct outcomes are tracked separately:
       - sawPaidEntry: at least one entry had status === 'paid'
       - malformedPaidEntry: at least one status==='paid' entry failed
         required-field validation
     A non-'paid' entry is simply not a candidate and is safely ignored —
     that is not "silently skipping a paid entry," it is correctly
     ignoring an irrelevant one. A malformed 'paid' entry is NEVER
     silently skipped: it forces a manual-review response regardless of
     whether another, perfectly valid, matching entry also exists
     alongside it. ── */
  let sawPaidEntry = false;
  let malformedPaidEntry = false;
  const candidates = [];

  for (const payment of paymentsRaw) {
    const attrs = payment?.attributes;
    if (!attrs || attrs.status !== "paid") continue;

    sawPaidEntry = true;

    const paymentId = payment?.id;
    const amount = attrs.amount;
    const currency = attrs.currency;

    const idValid = isNonEmptyString(paymentId);
    const amountValid = Number.isSafeInteger(amount) && amount > 0;
    // Required field, not a post-hoc filter: this app only ever creates
    // PHP-denominated checkout sessions, so a 'paid' entry whose currency
    // is anything other than exactly "PHP" is not a legitimate
    // amount-mismatch candidate — it is malformed provider data that
    // must escalate to manual review rather than be silently treated as
    // "just doesn't match."
    const currencyValid = currency === "PHP";
    const paidAtDate = paymongoTimestampToDate(attrs.paid_at);

    if (!idValid || !amountValid || !currencyValid || !paidAtDate) {
      malformedPaidEntry = true;
      continue;
    }

    candidates.push({
      id: paymentId,
      amount,
      currency,
      paidAtDate,
      sessionId: session.id,
    });
  }

  /* ── Case B: at least one paid entry has a malformed required field —
     sanitized manual-review error. Never finalize, never return pending,
     regardless of whether a valid matching candidate also exists. ── */
  if (malformedPaidEntry) {
    return res.status(502).json({
      attempt_id: attemptRow.id,
      status: "provider_response_malformed",
      message:
        "A completed payment record from the provider could not be fully verified. Manual review required.",
    });
  }

  /* ── Case A: payments is a valid array with no status='paid' entries
     at all — status pending, change nothing. ── */
  if (!sawPaidEntry) {
    return res.status(200).json({
      attempt_id: attemptRow.id,
      status: "pending",
      message: "Payment has not been completed yet.",
    });
  }

  /* ── Every 'paid' entry was well-formed at this point (malformedPaidEntry
     is false and sawPaidEntry is true), so candidates.length >= 1.
     Currency is already forced to exactly "PHP" above; only amount needs
     to be checked against this order's total here. ── */
  const matching = candidates.filter(
    (c) => c.amount === snapshotPreview.total_cents,
  );

  /* ── step 7: paid entries exist but none match this order's amount. ── */
  if (matching.length === 0) {
    return res.status(409).json({
      attempt_id: attemptRow.id,
      status: "payment_mismatch",
      message:
        "A payment was found but its amount did not match this order.",
    });
  }

  /* ── step 8: more than one different matching paid payment ID. ── */
  const distinctIds = [...new Set(matching.map((m) => m.id))];
  if (distinctIds.length > 1) {
    return res.status(409).json({
      attempt_id: attemptRow.id,
      status: "ambiguous_payment",
      message:
        "Multiple differing payments were found for this session. Manual review required.",
    });
  }

  /* ── step 9: exactly one matching paid payment may proceed. ── */
  const matchedPayment = matching[0];

  return await runFinalizationTransaction(req, res, attemptId, matchedPayment);
};