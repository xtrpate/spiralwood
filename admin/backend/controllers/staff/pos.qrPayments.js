// controllers/staff/pos.qrPayments.js
//
// Cashier ready-to-ship POS Online Payment controller. Attempt creation
// and stock reservation remain here; strict provider analysis, exact-once
// finalization, and Phase 3D-C cleanup lifecycle rules are centralized in
// services/posQrLifecycleService.js and services/posQrCleanupService.js.
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
  expireCheckoutSession,
  retrieveCheckoutSession,
} = require("../../services/paymongoService");
const {
  analyzeCheckoutSession,
  finalizePaidAttempt,
  getSnapshotTotalCents,
  ALLOWED_RECOVERY_REASON_CODES,
  attachVerifiedProviderSession,
  confirmManualRelease,
  loadManualReleaseSummary,
  loadProviderUnknownAttemptForRecovery,
  markExpireRequested,
  parseAndValidateSnapshot,
  releaseExpiredAttempt,
} = require("../../services/posQrLifecycleService");
const {
  signRecoveryToken,
  verifyRecoveryToken,
} = require("../../utils/posQrRecoveryToken");
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

// Admin cancellation reasons for an attached, unpaid checkout. These are
// intentionally fixed codes only: no free-text note is accepted or stored.
const ALLOWED_UNPAID_CANCEL_REASON_CODES = new Set([
  "customer_abandoned_checkout",
  "cashier_cancelled_checkout",
  "duplicate_abandoned_attempt",
  "other",
]);

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

/* ── PHASE 3D-D3 — RECOVERY FEATURE GATE ─────────────────────────────
   Deliberately INDEPENDENT of POS_QR_ENABLED: normal QR checkout may be
   intentionally paused (e.g. a terminal-level rollout pause) while
   attempts that became provider_unknown before the pause still need
   admin recovery. Coupling the two gates would make recovery
   impossible exactly when it is most likely to be needed.
   Fail-closed: missing, or anything other than the exact string
   "true", disables both recovery endpoints. ── */
const isPosQrRecoveryEnabled = () =>
  process.env.POS_QR_RECOVERY_ENABLED === "true";
exports.isPosQrRecoveryEnabled = isPosQrRecoveryEnabled;

// attach-session additionally makes a real PayMongo call (a read-only
// retrieval, never a session creation), so it keeps its own defensive
// test-key-only check — independent of isPosQrTestSafeConfigured()
// above, which also requires POS_QR_ENABLED and a configured
// FRONTEND_URL, neither of which is relevant here.
const isRecoveryProviderCallSafe = () => {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  return (
    typeof secretKey === "string" &&
    secretKey.length > 0 &&
    secretKey.startsWith("sk_test_")
  );
};

// Conservative PayMongo Checkout Session id shape check. This is a
// format guard only (rejects obviously malformed input before any
// network call) — the real verification is the retrieveCheckoutSession
// round trip plus the ownership/amount checks in attachProviderSession.
const MAX_PROVIDER_SESSION_ID_LENGTH = 100;
const PROVIDER_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9]{8,80}$/;
const isValidProviderSessionIdFormat = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= MAX_PROVIDER_SESSION_ID_LENGTH &&
  PROVIDER_SESSION_ID_PATTERN.test(value.trim());

// FAIL-CLOSED allowlist for attach-session (and recovery-verify). Only
// these three analyzeCheckoutSession() outcomes may ever be acted on;
// any other value — including "malformed", "payment_mismatch",
// "ambiguous_payment", or any kind this codebase does not yet know
// about — must leave the attempt exactly as it was, with no database
// write. Deliberately a positive allowlist rather than a negative
// exclusion list, so a future new analysis kind defaults to safe
// rejection instead of silently falling through.
const ATTACH_ALLOWED_ANALYSIS_KINDS = new Set(["paid", "pending", "expired_unpaid"]);

// Phase 3D-E read-only recovery list validation. The read endpoints are
// intentionally available even when recovery actions are disabled, but
// they only expose unresolved statuses and a sanitized checkout summary.
const RECOVERY_READ_STATUSES = new Set([
  "provider_unknown",
  "awaiting_payment",
]);
const DEFAULT_RECOVERY_LIST_LIMIT = 50;
const MAX_RECOVERY_LIST_LIMIT = 100;

const parseRecoveryStatusFilter = (value) => {
  if (value === undefined) return { ok: true, value: null };
  if (typeof value !== "string" || !RECOVERY_READ_STATUSES.has(value)) {
    return { ok: false, value: null };
  }
  return { ok: true, value };
};

const parseRecoveryListLimit = (value) => {
  if (value === undefined) return DEFAULT_RECOVERY_LIST_LIMIT;
  if (typeof value !== "string" || !/^[1-9]\d{0,2}$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return parsed <= MAX_RECOVERY_LIST_LIMIT ? parsed : null;
};

const toSafePositiveIntOrNull = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const buildRecoveryListAttempt = (row) => {
  const snapshot = parseAndValidateSnapshot(row.checkout_snapshot);
  return {
    id: toSafePositiveIntOrNull(row.id),
    status: row.status,
    provider: row.provider,
    cashier: {
      id: toSafePositiveIntOrNull(row.cashier_id),
      name:
        typeof row.cashier_name === "string" && row.cashier_name.trim()
          ? row.cashier_name
          : null,
    },
    customer_name: snapshot ? snapshot.customer_name : null,
    item_count: snapshot ? snapshot.items.length : null,
    total: snapshot ? snapshot.total : null,
    total_cents: snapshot ? snapshot.total_cents : null,
    session_attached: Boolean(Number(row.session_attached)),
    snapshot_valid: Boolean(snapshot),
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
  };
};

const buildSafeCheckoutSummary = (snapshot) => ({
  customer_name: snapshot.customer_name,
  customer_phone: snapshot.customer_phone,
  items: snapshot.items.map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: item.subtotal,
  })),
  subtotal: snapshot.subtotal,
  discount: snapshot.discount,
  delivery_fee: snapshot.delivery_fee,
  total: snapshot.total,
  total_cents: snapshot.total_cents,
  delivery: snapshot.delivery
    ? {
        address: snapshot.delivery.address,
        lat: snapshot.delivery.lat,
        lng: snapshot.delivery.lng,
        requested_date: snapshot.delivery.requested_date,
        notes: snapshot.delivery.notes,
      }
    : null,
  notes: snapshot.notes,
});

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
      idempotencyKey: attemptRow.idempotency_key,
      timeoutMs: 15000,
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

/* ══════════════════════════════════════════════════════════════
   PHASE 3D-F1 — CASHIER RESUME / LOCAL-STATE RECONCILIATION
   POST /api/pos/qr-payments/attempts/resume

   Read-only and deliberately NOT behind POS_QR_ENABLED. A cashier must
   still be able to reconcile or safely clear stale browser state even
   when new QR payments are paused. The checkout token is accepted only
   in the request body, is matched together with the authenticated
   cashier id, and is never echoed in the response.
══════════════════════════════════════════════════════════════ */
exports.resumeAttempt = async (req, res) => {
  const rawCheckoutToken = req.body?.checkout_token;
  if (typeof rawCheckoutToken !== "string") {
    return res.status(400).json({
      message: "A valid checkout_token is required.",
    });
  }

  const checkoutToken = rawCheckoutToken.trim();
  if (checkoutToken.length === 0 || checkoutToken.length > MAX_TOKEN_LENGTH) {
    return res.status(400).json({
      message: "A valid checkout_token is required.",
    });
  }

  try {
    const [[attempt]] = await db.query(
      `SELECT
         attempt.id,
         attempt.status,
         attempt.provider_session_id,
         attempt.checkout_url,
         attempt.order_id,
         attempt.payment_transaction_id,
         attempt.checkout_snapshot,
         attempt.created_at,
         attempt.updated_at,
         attempt.expires_at,
         order_row.order_number,
         order_row.status AS order_status,
         order_row.total AS order_total,
         payment_row.id AS linked_payment_transaction_id,
         receipt_row.id AS receipt_id,
         receipt_row.receipt_number
       FROM pos_qr_payment_attempts AS attempt
       LEFT JOIN orders AS order_row
         ON order_row.id = attempt.order_id
       LEFT JOIN payment_transactions AS payment_row
         ON payment_row.id = attempt.payment_transaction_id
        AND payment_row.order_id = attempt.order_id
       LEFT JOIN receipts AS receipt_row
         ON receipt_row.payment_transaction_id = attempt.payment_transaction_id
        AND receipt_row.order_id = attempt.order_id
       WHERE attempt.checkout_token = ?
         AND attempt.cashier_id = ?
       LIMIT 1`,
      [checkoutToken, req.user.id],
    );

    // Same response for a nonexistent token and a token owned by another
    // cashier. This prevents cross-cashier token probing.
    if (!attempt) {
      return res.status(404).json({
        resume_state: "not_found",
        can_clear_local_state: true,
        message: "No payment attempt was found for this checkout.",
      });
    }

    const attemptId = toSafePositiveIntOrNull(attempt.id);
    const base = {
      attempt_id: attemptId,
      status: attempt.status,
      created_at: attempt.created_at,
      updated_at: attempt.updated_at,
      expires_at: attempt.expires_at,
    };

    if (["failed", "expired", "cancelled"].includes(attempt.status)) {
      return res.status(200).json({
        ...base,
        resume_state: "terminal",
        can_clear_local_state: true,
        message: "This online payment attempt is no longer active.",
      });
    }

    if (attempt.status === "consumed") {
      const orderId = toSafePositiveIntOrNull(attempt.order_id);
      const paymentTransactionId = toSafePositiveIntOrNull(
        attempt.payment_transaction_id,
      );
      const linkedPaymentTransactionId = toSafePositiveIntOrNull(
        attempt.linked_payment_transaction_id,
      );
      const receiptId = toSafePositiveIntOrNull(attempt.receipt_id);

      if (
        !attemptId ||
        !orderId ||
        !paymentTransactionId ||
        paymentTransactionId !== linkedPaymentTransactionId ||
        !receiptId ||
        typeof attempt.order_number !== "string" ||
        !attempt.order_number.trim() ||
        typeof attempt.receipt_number !== "string" ||
        !attempt.receipt_number.trim()
      ) {
        return res.status(409).json({
          ...base,
          resume_state: "manual_review",
          can_clear_local_state: false,
          message:
            "Completed payment records could not be safely loaded. Contact an administrator.",
        });
      }

      return res.status(200).json({
        ...base,
        resume_state: "consumed",
        can_clear_local_state: true,
        result: {
          attempt_id: attemptId,
          status: "consumed",
          order_id: orderId,
          order_number: attempt.order_number,
          order_status: attempt.order_status,
          payment_transaction_id: paymentTransactionId,
          receipt_id: receiptId,
          receipt_number: attempt.receipt_number,
          total: attempt.order_total,
          payment_status: "paid",
        },
        message: "Payment was already completed.",
      });
    }

    if (
      !["reserved", "creating_session", "awaiting_payment", "provider_unknown"].includes(
        attempt.status,
      )
    ) {
      return res.status(409).json({
        ...base,
        resume_state: "manual_review",
        can_clear_local_state: false,
        message: "This payment attempt could not be safely resumed.",
      });
    }

    const snapshot = parseAndValidateSnapshot(attempt.checkout_snapshot);
    if (!snapshot) {
      return res.status(409).json({
        ...base,
        resume_state: "manual_review",
        can_clear_local_state: false,
        message: "Payment attempt details could not be safely loaded.",
      });
    }

    const sessionAttached = isNonEmptyString(attempt.provider_session_id);
    const checkoutUrl =
      attempt.status === "awaiting_payment" &&
      isNonEmptyString(attempt.checkout_url)
        ? attempt.checkout_url
        : null;

    if (attempt.status === "provider_unknown") {
      return res.status(200).json({
        ...base,
        resume_state: "admin_recovery_required",
        can_clear_local_state: false,
        requires_admin_recovery: true,
        session_attached: sessionAttached,
        checkout_url: null,
        total: snapshot.total,
        total_cents: snapshot.total_cents,
        item_count: snapshot.items.length,
        message:
          "The payment provider result is unresolved. Ask an administrator to review this attempt.",
      });
    }

    if (attempt.status === "awaiting_payment") {
      return res.status(200).json({
        ...base,
        resume_state: "awaiting_payment",
        can_clear_local_state: false,
        requires_admin_recovery: false,
        session_attached: sessionAttached,
        checkout_url: checkoutUrl,
        total: snapshot.total,
        total_cents: snapshot.total_cents,
        item_count: snapshot.items.length,
        message: checkoutUrl
          ? "Existing online payment session restored."
          : "Payment session exists but its checkout link is unavailable.",
      });
    }

    return res.status(200).json({
      ...base,
      resume_state: "preparing_payment",
      can_clear_local_state: false,
      requires_admin_recovery: false,
      session_attached: sessionAttached,
      checkout_url: null,
      total: snapshot.total,
      total_cents: snapshot.total_cents,
      item_count: snapshot.items.length,
      message: "Payment session is still being prepared.",
    });
  } catch (err) {
    console.error("[pos.qrPayments resumeAttempt]", err);
    return res.status(500).json({ message: "Server error." });
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

// Phase 3D-C centralizes strict provider-response analysis and exact-once
// order finalization in services/posQrLifecycleService.js. The controller
// keeps only HTTP authentication/ownership and response shaping.
exports.verifyAttempt = async (req, res) => {
  if (!isPosQrTestSafeConfigured()) {
    return res.status(503).json({
      message: "Online payment (QR Ph) is not yet available at this terminal.",
    });
  }

  const attemptId = parseStrictPositiveInt(req.params.id);
  if (!attemptId) {
    return res
      .status(400)
      .json({ message: "A valid payment attempt id is required." });
  }

  try {
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

    if (attemptRow.status === "consumed") {
      const replay = await finalizePaidAttempt({
        attemptId,
        matchedPayment: null,
        actorUserId: req.user.id,
        requireOwner: true,
      });
      return res.status(replay.httpStatus).json(replay.payload);
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

    const expectedTotalCents = getSnapshotTotalCents(
      attemptRow.checkout_snapshot,
    );
    if (!expectedTotalCents) {
      console.error(
        "[pos.qrPayments verifyAttempt] invalid checkout_snapshot",
        { attemptId: attemptRow.id },
      );
      return res.status(500).json({ message: "Server error." });
    }

    let session;
    try {
      session = await retrieveCheckoutSession(attemptRow.provider_session_id, {
        timeoutMs: 15000,
      });
    } catch (err) {
      if (typeof err?.response?.status === "number") {
        return res.status(502).json({
          message:
            "Unable to verify payment status with the provider right now. Please try again.",
        });
      }
      return res.status(503).json({
        message:
          "Payment provider is temporarily unavailable. Please try again shortly.",
      });
    }

    const analysis = analyzeCheckoutSession({
      session,
      expectedSessionId: attemptRow.provider_session_id,
      expectedTotalCents,
    });

    if (analysis.kind === "pending") {
      return res.status(200).json({
        attempt_id: attemptRow.id,
        status: "pending",
        message: "Payment has not been completed yet.",
      });
    }

    if (analysis.kind === "expired_unpaid") {
      return res.status(200).json({
        attempt_id: attemptRow.id,
        status: "pending",
        message:
          "The provider session has expired and is awaiting safe stock release.",
      });
    }

    if (analysis.kind === "malformed") {
      return res.status(502).json({
        attempt_id: attemptRow.id,
        status: "provider_response_malformed",
        message:
          "A provider response could not be fully verified. Manual review required.",
      });
    }

    if (analysis.kind === "payment_mismatch") {
      return res.status(409).json({
        attempt_id: attemptRow.id,
        status: "payment_mismatch",
        message: "A payment was found but its amount did not match this order.",
      });
    }

    if (analysis.kind === "ambiguous_payment") {
      return res.status(409).json({
        attempt_id: attemptRow.id,
        status: "ambiguous_payment",
        message:
          "Multiple differing payments were found for this session. Manual review required.",
      });
    }

    if (analysis.kind !== "paid") {
      return res.status(502).json({
        message: "Payment provider session could not be verified.",
      });
    }

    const finalized = await finalizePaidAttempt({
      attemptId,
      matchedPayment: analysis.payment,
      actorUserId: req.user.id,
      requireOwner: true,
    });

    if (finalized.freshCommit && finalized.auditRecord) {
      req.auditRecord = finalized.auditRecord;
    }

    return res.status(finalized.httpStatus).json(finalized.payload);
  } catch (err) {
    console.error("[pos.qrPayments verifyAttempt]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   PHASE 3D-E — ADMIN RECOVERY READ MODEL

   These endpoints are deliberately NOT guarded by
   requirePosQrRecoveryEnabled. An admin must still be able to inspect
   unresolved attempts while mutating recovery actions are paused. They
   expose only an explicit, sanitized allowlist of fields; the raw
   checkout snapshot and all provider/token/hash/idempotency fields stay
   server-side.
══════════════════════════════════════════════════════════════════════ */
exports.listRecoveryAttempts = async (req, res) => {
  const statusFilter = parseRecoveryStatusFilter(req.query.status);
  if (!statusFilter.ok) {
    return res.status(400).json({
      message:
        "status must be either provider_unknown or awaiting_payment.",
      recovery_actions_enabled: isPosQrRecoveryEnabled(),
    });
  }

  const limit = parseRecoveryListLimit(req.query.limit);
  if (limit === null) {
    return res.status(400).json({
      message: `limit must be a whole number from 1 to ${MAX_RECOVERY_LIST_LIMIT}.`,
      recovery_actions_enabled: isPosQrRecoveryEnabled(),
    });
  }

  try {
    const params = [];
    let statusSql =
      "attempt.status IN ('provider_unknown', 'awaiting_payment')";
    if (statusFilter.value) {
      statusSql += " AND attempt.status = ?";
      params.push(statusFilter.value);
    }
    params.push(limit);

    const [rows] = await db.query(
      `SELECT
         attempt.id,
         attempt.status,
         attempt.provider,
         attempt.cashier_id,
         cashier.name AS cashier_name,
         CASE
           WHEN attempt.provider_session_id IS NOT NULL
             AND attempt.provider_session_id <> ''
           THEN 1 ELSE 0
         END AS session_attached,
         attempt.checkout_snapshot,
         attempt.created_at,
         attempt.updated_at,
         attempt.expires_at
       FROM pos_qr_payment_attempts AS attempt
       LEFT JOIN users AS cashier ON cashier.id = attempt.cashier_id
       WHERE ${statusSql}
       ORDER BY attempt.updated_at DESC, attempt.id DESC
       LIMIT ?`,
      params,
    );

    const attempts = rows.map(buildRecoveryListAttempt);
    return res.status(200).json({
      attempts,
      count: attempts.length,
      limit,
      status: statusFilter.value,
      recovery_actions_enabled: isPosQrRecoveryEnabled(),
    });
  } catch (err) {
    console.error("[pos.qrPayments listRecoveryAttempts]", err);
    return res.status(500).json({
      message: "Server error.",
      recovery_actions_enabled: isPosQrRecoveryEnabled(),
    });
  }
};

exports.getRecoveryAttempt = async (req, res) => {
  const attemptId = parseStrictPositiveInt(req.params.id);
  if (!attemptId) {
    return res.status(400).json({
      message: "A valid payment attempt id is required.",
      recovery_actions_enabled: isPosQrRecoveryEnabled(),
    });
  }

  try {
    const [[attempt]] = await db.query(
      `SELECT
         attempt.id,
         attempt.status,
         attempt.provider,
         attempt.cashier_id,
         cashier.name AS cashier_name,
         CASE
           WHEN attempt.provider_session_id IS NOT NULL
             AND attempt.provider_session_id <> ''
           THEN 1 ELSE 0
         END AS session_attached,
         attempt.checkout_snapshot,
         attempt.created_at,
         attempt.updated_at,
         attempt.expires_at
       FROM pos_qr_payment_attempts AS attempt
       LEFT JOIN users AS cashier ON cashier.id = attempt.cashier_id
       WHERE attempt.id = ?
         AND attempt.status IN ('provider_unknown', 'awaiting_payment')`,
      [attemptId],
    );

    // Deliberately the same 404 for a missing row and an attempt that has
    // already moved out of the unresolved recovery statuses.
    if (!attempt) {
      return res.status(404).json({
        message: "Unresolved payment attempt not found.",
        recovery_actions_enabled: isPosQrRecoveryEnabled(),
      });
    }

    const snapshot = parseAndValidateSnapshot(attempt.checkout_snapshot);
    if (!snapshot) {
      return res.status(409).json({
        attempt_id: attemptId,
        status: attempt.status,
        message: "Payment attempt details could not be safely loaded.",
        recovery_actions_enabled: isPosQrRecoveryEnabled(),
      });
    }

    const [reservationRows] = await db.query(
      `SELECT
         reservation.product_id,
         product.name AS product_name,
         reservation.quantity
       FROM pos_qr_stock_reservations AS reservation
       LEFT JOIN products AS product ON product.id = reservation.product_id
       WHERE reservation.payment_attempt_id = ?
         AND reservation.status = 'active'
       ORDER BY reservation.product_id ASC`,
      [attemptId],
    );

    return res.status(200).json({
      attempt: {
        id: toSafePositiveIntOrNull(attempt.id),
        status: attempt.status,
        provider: attempt.provider,
        cashier: {
          id: toSafePositiveIntOrNull(attempt.cashier_id),
          name:
            typeof attempt.cashier_name === "string" &&
            attempt.cashier_name.trim()
              ? attempt.cashier_name
              : null,
        },
        session_attached: Boolean(Number(attempt.session_attached)),
        checkout_summary: buildSafeCheckoutSummary(snapshot),
        reserved_items: reservationRows.map((row) => ({
          product_id: toSafePositiveIntOrNull(row.product_id),
          product_name:
            typeof row.product_name === "string" && row.product_name.trim()
              ? row.product_name
              : null,
          quantity: toSafePositiveIntOrNull(row.quantity),
        })),
        created_at: attempt.created_at,
        updated_at: attempt.updated_at,
        expires_at: attempt.expires_at,
      },
      recovery_actions_enabled: isPosQrRecoveryEnabled(),
    });
  } catch (err) {
    console.error("[pos.qrPayments getRecoveryAttempt]", err);
    return res.status(500).json({
      message: "Server error.",
      recovery_actions_enabled: isPosQrRecoveryEnabled(),
    });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   PHASE 3D-D3 — ADMIN RECOVERY: ATTACH-SESSION
   POST /api/pos/qr-payments/attempts/:id/attach-session

   Route-level requirePosQrRecoveryEnabled + authenticate +
   authorize("admin") already ran before this controller (see
   routes/pos.qrPayments.js). isPosQrRecoveryEnabled() /
   isRecoveryProviderCallSafe() below are defensive second-layer checks
   only, matching the exact pattern already used for
   isPosQrTestSafeConfigured() above.

   NEVER calls createCheckoutSession. Phase 3D-D1's sandbox test
   confirmed PayMongo does not deduplicate Checkout Session creation on
   Idempotency-Key reuse (repeated calls returned different session
   ids), so this endpoint only ever RETRIEVES a session id an admin
   found manually in the PayMongo Dashboard — it never creates one.
   provider_payment_id is never accepted as an alternative input; this
   codebase's PayMongo wrapper has no verified method to resolve a
   payment id back to its parent checkout session.
══════════════════════════════════════════════════════════════════════ */
exports.attachProviderSession = async (req, res) => {
  if (!isPosQrRecoveryEnabled()) {
    return res
      .status(403)
      .json({ message: "Recovery actions are not enabled." });
  }
  if (!isRecoveryProviderCallSafe()) {
    return res.status(403).json({
      message: "Recovery session attachment is not available at this terminal.",
    });
  }

  const attemptId = parseStrictPositiveInt(req.params.id);
  if (!attemptId) {
    return res
      .status(400)
      .json({ message: "A valid payment attempt id is required." });
  }

  if (isNonEmptyString(req.body?.provider_payment_id)) {
    return res.status(400).json({
      message:
        "A provider payment id cannot be used to attach a session. Locate the related Checkout Session id in the PayMongo Dashboard instead.",
    });
  }

  const rawSessionId = req.body?.provider_session_id;
  if (!isValidProviderSessionIdFormat(rawSessionId)) {
    return res.status(400).json({
      message: "A valid PayMongo Checkout Session id is required.",
    });
  }
  const providerSessionId = rawSessionId.trim();

  try {
    // Transaction A — read-only guard check, no write, no provider call.
    // Now also returns attemptVersion + snapshotHash: these are the
    // "before" fingerprint that Transaction B re-verifies against the
    // live row, so a snapshot mutated during the provider round trip
    // (however unlikely, since checkout_snapshot is otherwise
    // immutable) is caught explicitly rather than silently attached
    // against stale data (TOCTOU protection).
    const claimCheck = await loadProviderUnknownAttemptForRecovery(attemptId);
    if (!claimCheck.ok) {
      if (claimCheck.reason === "not_found") {
        return res.status(404).json({ message: "Payment attempt not found." });
      }
      if (
        claimCheck.reason === "wrong_status" ||
        claimCheck.reason === "linked_records_present"
      ) {
        return res.status(409).json({
          attempt_id: attemptId,
          status: claimCheck.status || null,
          message: "This payment attempt is not eligible for session attachment.",
        });
      }
      console.error(
        "[pos.qrPayments attachProviderSession] claim check failed",
        { attemptId, reason: claimCheck.reason },
      );
      return res.status(500).json({ message: "Server error." });
    }

    const { attempt, attemptVersion, snapshotHash } = claimCheck;

    // Provider call — outside any transaction/lock.
    let session;
    try {
      session = await retrieveCheckoutSession(providerSessionId, {
        timeoutMs: 15000,
      });
    } catch (err) {
      const providerStatus = err?.response?.status;
      if (providerStatus === 404) {
        return res.status(404).json({
          message: "No Checkout Session was found for this id.",
        });
      }
      if (typeof providerStatus === "number") {
        return res.status(502).json({
          message: "Unable to retrieve this session from the payment provider.",
        });
      }
      return res.status(502).json({
        message:
          "Payment provider is temporarily unavailable. Please try again shortly.",
      });
    }

    // Ownership check — both sides normalized to strings, since PayMongo
    // metadata values and this attempt's own numeric id can otherwise
    // differ only in JS type.
    const metadata = session?.attributes?.metadata;
    const metadataAttemptId =
      metadata && typeof metadata === "object"
        ? metadata.pos_qr_attempt_id
        : undefined;
    const metadataCheckoutToken =
      metadata && typeof metadata === "object"
        ? metadata.checkout_token
        : undefined;

    if (
      String(metadataAttemptId ?? "") !== String(attempt.id) ||
      String(metadataCheckoutToken ?? "") !== String(attempt.checkout_token)
    ) {
      return res.status(409).json({
        attempt_id: attempt.id,
        status: "provider_unknown",
        message: "This session does not belong to this payment attempt.",
      });
    }

    // STRICT single-line-item validation. The original
    // createCheckoutSession integration always creates exactly one PHP
    // line item with quantity 1 and amount === snapshot.total_cents —
    // this now requires that EXACT shape, with no quantity default and
    // no summation across multiple items. Anything else is rejected
    // before any write, regardless of paid/pending/expired outcome.
    const expectedTotalCents = getSnapshotTotalCents(attempt.checkout_snapshot);
    const lineItems = session?.attributes?.line_items;
    const soleItem =
      Array.isArray(lineItems) && lineItems.length === 1 ? lineItems[0] : null;

    const lineItemValid =
      soleItem !== null &&
      expectedTotalCents !== null &&
      Number.isSafeInteger(expectedTotalCents) &&
      soleItem.currency === "PHP" &&
      Number.isSafeInteger(soleItem.amount) &&
      soleItem.amount > 0 &&
      soleItem.quantity === 1 &&
      soleItem.amount === expectedTotalCents;

    if (!lineItemValid) {
      return res.status(409).json({
        attempt_id: attempt.id,
        status: "provider_unknown",
        message: "This session's line items do not match this payment attempt.",
      });
    }

    const analysis = analyzeCheckoutSession({
      session,
      expectedSessionId: providerSessionId,
      expectedTotalCents,
    });

    // FAIL-CLOSED allowlist — only these three kinds may ever proceed to
    // Transaction B. Any other value, including a kind this codebase
    // does not yet know about, stays provider_unknown with no write.
    if (!ATTACH_ALLOWED_ANALYSIS_KINDS.has(analysis.kind)) {
      return res.status(409).json({
        attempt_id: attempt.id,
        status: "provider_unknown",
        message:
          "This session could not be fully verified. Manual review required.",
      });
    }

    // Transaction B — TOCTOU-checked attach + transition ONLY. Re-checks
    // the snapshot hash/version, then status, fresh under FOR UPDATE;
    // never assumes Transaction A's earlier read is still valid.
    const checkoutUrl = isNonEmptyString(session?.attributes?.checkout_url)
      ? session.attributes.checkout_url
      : null;

    const attached = await attachVerifiedProviderSession({
      attemptId: attempt.id,
      providerSessionId,
      checkoutUrl,
      expectedAttemptVersion: attemptVersion,
      expectedSnapshotHash: snapshotHash,
    });

    if (!attached.changed) {
      if (attached.reason === "session_already_linked_elsewhere") {
        return res.status(409).json({
          attempt_id: attempt.id,
          message:
            "This session is already linked to a different payment attempt.",
        });
      }
      if (
        attached.reason === "stale_attempt_version" ||
        attached.reason === "stale_snapshot_hash"
      ) {
        return res.status(409).json({
          attempt_id: attempt.id,
          message:
            "This payment attempt changed while the session was being verified. Please try again.",
        });
      }
      if (
        attached.reason === "status_changed" ||
        attached.reason === "linked_records_present" ||
        attached.reason === "not_found"
      ) {
        return res.status(409).json({
          attempt_id: attempt.id,
          status: attached.status || null,
          message: "This payment attempt is no longer eligible for session attachment.",
        });
      }
      console.error("[pos.qrPayments attachProviderSession] attach failed", {
        attemptId: attempt.id,
        reason: attached.reason,
      });
      return res.status(500).json({ message: "Server error." });
    }

    // Attach committed durably. From here, a failure in the optional
    // paid-finalization step below does NOT revert anything (see the
    // finalization_pending branch further down).
    if (analysis.kind !== "paid") {
      const outcome = analysis.kind === "expired_unpaid" ? "expired_unpaid" : "awaiting_payment";
      req.auditRecord = {
        id: attempt.id,
        old: { status: "provider_unknown" },
        new: {
          status: "awaiting_payment",
          provider_session_attached: true,
          checkout_url_stored: Boolean(checkoutUrl),
          outcome,
          admin_user_id: req.user.id,
        },
      };
      return res.status(202).json({
        attempt_id: attempt.id,
        status: "awaiting_payment",
        session_attached: true,
        message:
          analysis.kind === "pending"
            ? "Session attached. Payment is still pending."
            : "Session attached. This session appears expired; automatic cleanup will confirm and release it.",
      });
    }

    const finalized = await finalizePaidAttempt({
      attemptId: attempt.id,
      matchedPayment: analysis.payment,
      actorUserId: req.user.id,
      requireOwner: false,
    });

    if (finalized.httpStatus === 200) {
      if (finalized.freshCommit === true) {
        // This request itself created the order/payment/receipt.
        req.auditRecord = {
          id: attempt.id,
          old: { status: "provider_unknown" },
          new: {
            status: "consumed",
            provider_session_attached: true,
            checkout_url_stored: Boolean(checkoutUrl),
            outcome: "paid",
            order_created: true,
            payment_verified: true,
            order_id: finalized.payload?.order_id ?? null,
            payment_transaction_id: finalized.payload?.payment_transaction_id ?? null,
            receipt_id: finalized.payload?.receipt_id ?? null,
            admin_user_id: req.user.id,
          },
        };
        return res.status(200).json(finalized.payload);
      }

      // freshCommit === false — a concurrent verification (e.g. the
      // cashier's own /verify call, or recovery-verify) already
      // finalized this attempt between our Transaction B commit and
      // this finalizePaidAttempt call. Database-safe (finalizePaidAttempt
      // itself guarantees exactly-once order/payment/receipt creation),
      // but this request did NOT create anything — the audit record
      // must not claim it did. Still returns the same finalized payload
      // idempotently, and no separate verification/finalization audit
      // is written for this replay.
      req.auditRecord = {
        id: attempt.id,
        old: { status: "provider_unknown" },
        new: {
          status: "consumed",
          provider_session_attached: true,
          checkout_url_stored: Boolean(checkoutUrl),
          outcome: "already_consumed",
          order_created: false,
          payment_verified: true,
          admin_user_id: req.user.id,
        },
      };
      return res.status(200).json(finalized.payload);
    }

    // Attach already committed durably; finalization did not complete
    // this time. Nothing is reverted — the attempt remains a normal,
    // safely-retryable awaiting_payment attempt with its reservation
    // still active. finalizePaidAttempt's own guards make it safe to
    // retry via the admin recovery-verify endpoint or the cleanup
    // lifecycle.
    console.error(
      "[pos.qrPayments attachProviderSession] finalize-after-attach did not complete",
      { attemptId: attempt.id, httpStatus: finalized.httpStatus },
    );
    req.auditRecord = {
      id: attempt.id,
      old: { status: "provider_unknown" },
      new: {
        status: "awaiting_payment",
        provider_session_attached: true,
        checkout_url_stored: Boolean(checkoutUrl),
        outcome: "awaiting_payment",
        admin_user_id: req.user.id,
      },
    };
    return res.status(202).json({
      attempt_id: attempt.id,
      status: "awaiting_payment",
      session_attached: true,
      finalization_pending: true,
      message:
        "Session attached and verified as paid, but finalization did not complete yet. It can be retried through the admin recovery-verify endpoint (POST /api/pos/qr-payments/attempts/:id/recovery-verify).",
    });
  } catch (err) {
    console.error("[pos.qrPayments attachProviderSession]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   PHASE 3D-D3 — ADMIN RECOVERY: MANUAL RELEASE (REQUEST)
   POST /api/pos/qr-payments/attempts/:id/manual-release/request

   Performs NO database write. Reads current state, computes a stable
   attempt_version and checkout_snapshot hash, and signs a short-lived
   token binding this exact admin/attempt/state/reason to a confirmation
   the admin must submit separately via /manual-release/confirm. Only
   the allowlisted reason_code is accepted — there is deliberately no
   free-text "note" field on either /request or /confirm, to avoid any
   presence-flag inconsistency between the two steps.
══════════════════════════════════════════════════════════════════════ */
exports.requestManualRelease = async (req, res) => {
  if (!isPosQrRecoveryEnabled()) {
    return res
      .status(403)
      .json({ message: "Recovery actions are not enabled." });
  }

  const attemptId = parseStrictPositiveInt(req.params.id);
  if (!attemptId) {
    return res
      .status(400)
      .json({ message: "A valid payment attempt id is required." });
  }

  const reasonCode = req.body?.reason_code;
  if (
    typeof reasonCode !== "string" ||
    !ALLOWED_RECOVERY_REASON_CODES.has(reasonCode)
  ) {
    return res.status(400).json({ message: "A valid reason_code is required." });
  }

  try {
    const summary = await loadManualReleaseSummary(attemptId);
    if (!summary.ok) {
      if (summary.reason === "not_found") {
        return res.status(404).json({ message: "Payment attempt not found." });
      }
      if (
        summary.reason === "wrong_status" ||
        summary.reason === "linked_records_present" ||
        summary.reason === "no_active_reservations" ||
        summary.reason === "snapshot_mismatch" ||
        summary.reason === "invalid_snapshot"
      ) {
        return res.status(409).json({
          attempt_id: attemptId,
          status: summary.status || null,
          message: "This payment attempt is not eligible for manual release.",
        });
      }
      console.error("[pos.qrPayments requestManualRelease] summary failed", {
        attemptId,
        reason: summary.reason,
      });
      return res.status(500).json({ message: "Server error." });
    }

    const signed = signRecoveryToken({
      attemptId: summary.attempt.id,
      adminUserId: req.user.id,
      attemptVersion: summary.attemptVersion,
      snapshotHash: summary.snapshotHash,
      reasonCode,
    });
    if (!signed) {
      console.error(
        "[pos.qrPayments requestManualRelease] recovery token secret unavailable",
      );
      return res.status(500).json({ message: "Server error." });
    }

    return res.status(200).json({
      attempt_id: summary.attempt.id,
      status: "provider_unknown",
      reason_code: reasonCode,
      reserved_items: summary.reservations.map((row) => ({
        product_id: row.product_id,
        quantity: row.quantity,
      })),
      confirmation_token: signed.token,
      expires_at: signed.payload.expires_at,
      message:
        "Review the reserved items above, then submit this token to /manual-release/confirm to release them.",
    });
  } catch (err) {
    console.error("[pos.qrPayments requestManualRelease]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   PHASE 3D-D3 — ADMIN RECOVERY: MANUAL RELEASE (CONFIRM)
   POST /api/pos/qr-payments/attempts/:id/manual-release/confirm
══════════════════════════════════════════════════════════════════════ */
exports.confirmManualRelease = async (req, res) => {
  if (!isPosQrRecoveryEnabled()) {
    return res
      .status(403)
      .json({ message: "Recovery actions are not enabled." });
  }

  const attemptId = parseStrictPositiveInt(req.params.id);
  if (!attemptId) {
    return res
      .status(400)
      .json({ message: "A valid payment attempt id is required." });
  }

  const reasonCode = req.body?.reason_code;
  if (
    typeof reasonCode !== "string" ||
    !ALLOWED_RECOVERY_REASON_CODES.has(reasonCode)
  ) {
    return res.status(400).json({ message: "A valid reason_code is required." });
  }

  const rawToken = req.body?.confirmation_token;
  if (!isNonEmptyString(rawToken)) {
    return res.status(400).json({ message: "A confirmation_token is required." });
  }

  const verified = verifyRecoveryToken(rawToken.trim());
  if (!verified.ok) {
    if (verified.reason === "recovery_token_secret_unavailable") {
      return res.status(500).json({ message: "Server error." });
    }
    if (verified.reason === "expired") {
      return res.status(409).json({
        message:
          "This confirmation token has expired. Please request a new one.",
      });
    }
    // "malformed" / "invalid_signature" / "wrong_purpose" — a tampered
    // or forged token stays 403, distinct from a merely time-expired
    // one (409).
    return res
      .status(403)
      .json({ message: "This confirmation token is invalid." });
  }

  const token = verified.payload;
  if (Number(token.attempt_id) !== Number(attemptId)) {
    return res.status(409).json({
      message: "This confirmation token does not match this payment attempt.",
    });
  }
  if (Number(token.admin_user_id) !== Number(req.user.id)) {
    return res
      .status(403)
      .json({ message: "This confirmation token belongs to a different admin." });
  }
  if (token.reason_code !== reasonCode) {
    return res
      .status(409)
      .json({ message: "The reason_code does not match the confirmation token." });
  }

  try {
    const released = await confirmManualRelease({
      attemptId,
      expectedAttemptVersion: token.attempt_version,
      expectedSnapshotHash: token.snapshot_hash,
      adminUserId: req.user.id,
      reasonCode,
    });

    if (!released.changed) {
      if (released.reason === "not_found") {
        return res.status(404).json({ message: "Payment attempt not found." });
      }
      if (
        released.reason === "stale_token_version" ||
        released.reason === "stale_token_snapshot"
      ) {
        return res.status(409).json({
          attempt_id: attemptId,
          message:
            "This payment attempt changed since the confirmation token was issued. Please request a new confirmation.",
        });
      }
      if (
        released.reason === "status_changed" ||
        released.reason === "linked_records_present" ||
        released.reason === "no_active_reservations" ||
        released.reason === "snapshot_mismatch"
      ) {
        return res.status(409).json({
          attempt_id: attemptId,
          status: released.status || null,
          message: "This payment attempt is no longer eligible for manual release.",
        });
      }
      console.error("[pos.qrPayments confirmManualRelease] release failed", {
        attemptId,
        reason: released.reason,
      });
      return res.status(500).json({ message: "Server error." });
    }

    req.auditRecord = {
      id: attemptId,
      old: { status: "provider_unknown" },
      new: {
        status: "cancelled",
        reason_code: reasonCode,
        reservations_released: released.reservationsReleased,
        admin_user_id: req.user.id,
      },
    };

    return res.status(200).json({
      attempt_id: attemptId,
      status: "cancelled",
      reservations_released: released.reservationsReleased,
      message: "Reservation released and stock restored.",
    });
  } catch (err) {
    console.error("[pos.qrPayments confirmManualRelease]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   PHASE 3D-D3 (correction) — ADMIN RECOVERY: VERIFY
   POST /api/pos/qr-payments/attempts/:id/recovery-verify

   The existing /attempts/:id/verify cannot be relied on for recovery
   because it (a) requires POS_QR_ENABLED, which recovery must work
   without, and (b) requires the authenticated user to own the attempt
   (attempt.cashier_id), which an admin performing recovery on someone
   else's stuck attempt will not satisfy. This endpoint is the
   admin-only, ownership-free equivalent, gated independently by
   requirePosQrRecoveryEnabled instead.

   NEVER calls createCheckoutSession — only ever RETRIEVES the session
   id already stored on the attempt (from the original attempt or from
   a prior attach-session). Reuses the exact same
   analyzeCheckoutSession/finalizePaidAttempt primitives as the
   cashier-facing verify endpoint and Phase 3D-C's cleanup lifecycle —
   no new finalize/analysis logic is introduced here.
══════════════════════════════════════════════════════════════════════ */
exports.recoveryVerifyAttempt = async (req, res) => {
  if (!isPosQrRecoveryEnabled()) {
    return res
      .status(403)
      .json({ message: "Recovery actions are not enabled." });
  }
  if (!isRecoveryProviderCallSafe()) {
    return res.status(403).json({
      message: "Recovery verification is not available at this terminal.",
    });
  }

  const attemptId = parseStrictPositiveInt(req.params.id);
  if (!attemptId) {
    return res
      .status(400)
      .json({ message: "A valid payment attempt id is required." });
  }

  try {
    const [[attemptRow]] = await db.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
      [attemptId],
    );

    if (!attemptRow) {
      return res.status(404).json({ message: "Payment attempt not found." });
    }

    // Idempotent replay for an already-consumed attempt — no provider
    // call, no audit (freshCommit is always false on this path).
    if (attemptRow.status === "consumed") {
      const replay = await finalizePaidAttempt({
        attemptId,
        matchedPayment: null,
        actorUserId: req.user.id,
        requireOwner: false,
      });
      return res.status(replay.httpStatus).json(replay.payload);
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
        "[pos.qrPayments recoveryVerifyAttempt] awaiting_payment attempt missing provider_session_id",
        { attemptId: attemptRow.id },
      );
      return res.status(500).json({ message: "Server error." });
    }

    const expectedTotalCents = getSnapshotTotalCents(
      attemptRow.checkout_snapshot,
    );
    if (!expectedTotalCents) {
      console.error(
        "[pos.qrPayments recoveryVerifyAttempt] invalid checkout_snapshot",
        { attemptId: attemptRow.id },
      );
      return res.status(500).json({ message: "Server error." });
    }

    let session;
    try {
      session = await retrieveCheckoutSession(attemptRow.provider_session_id, {
        timeoutMs: 15000,
      });
    } catch (err) {
      const providerStatus = err?.response?.status;
      if (providerStatus === 404) {
        return res.status(404).json({
          message: "No Checkout Session was found for this payment attempt.",
        });
      }
      if (typeof providerStatus === "number") {
        return res.status(502).json({
          message:
            "Unable to verify payment status with the provider right now. Please try again.",
        });
      }
      return res.status(502).json({
        message:
          "Payment provider is temporarily unavailable. Please try again shortly.",
      });
    }

    const analysis = analyzeCheckoutSession({
      session,
      expectedSessionId: attemptRow.provider_session_id,
      expectedTotalCents,
    });

    if (analysis.kind === "pending") {
      return res.status(200).json({
        attempt_id: attemptRow.id,
        status: "pending",
        message: "Payment has not been completed yet.",
      });
    }

    if (analysis.kind === "expired_unpaid") {
      return res.status(200).json({
        attempt_id: attemptRow.id,
        status: "pending",
        message:
          "The provider session has expired and is awaiting safe stock release.",
      });
    }

    // FAIL-CLOSED allowlist — same as attach-session. Only "paid" can
    // reach the finalize call below; malformed/payment_mismatch/
    // ambiguous_payment/any unknown kind stays untouched, no write.
    if (!ATTACH_ALLOWED_ANALYSIS_KINDS.has(analysis.kind)) {
      return res.status(409).json({
        attempt_id: attemptRow.id,
        status: "manual_review",
        message:
          "A provider response could not be fully verified. Manual review required.",
      });
    }

    const finalized = await finalizePaidAttempt({
      attemptId,
      matchedPayment: analysis.payment,
      actorUserId: req.user.id,
      requireOwner: false,
    });

    // Audit ONLY on a fresh finalization — never on a pending result,
    // and never on an idempotent consumed replay (handled earlier).
    if (finalized.freshCommit && finalized.auditRecord) {
      req.auditRecord = finalized.auditRecord;
    }

    return res.status(finalized.httpStatus).json(finalized.payload);
  } catch (err) {
    console.error("[pos.qrPayments recoveryVerifyAttempt]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   ADMIN RECOVERY — CANCEL ATTACHED UNPAID ATTEMPT
   POST /api/pos/qr-payments/attempts/:id/cancel-unpaid

   Safe release rules:
   - admin-only and recovery-gated at the route and controller layers;
   - requires an attached awaiting_payment attempt with no finalized links;
   - re-reads PayMongo immediately before any stock release;
   - a still-pending Checkout Session is expired first, then re-read;
   - stock is released only after PayMongo confirms expired_unpaid;
   - a payment that completed during the race is finalized instead;
   - local TTL must already be reached (enforced by releaseExpiredAttempt).
══════════════════════════════════════════════════════════════════════ */
exports.cancelUnpaidAttempt = async (req, res) => {
  if (!isPosQrRecoveryEnabled()) {
    return res
      .status(403)
      .json({ message: "Recovery actions are not enabled." });
  }
  if (!isRecoveryProviderCallSafe()) {
    return res.status(403).json({
      message: "Unpaid payment cancellation is not available at this terminal.",
    });
  }

  const attemptId = parseStrictPositiveInt(req.params.id);
  if (!attemptId) {
    return res
      .status(400)
      .json({ message: "A valid payment attempt id is required." });
  }

  const reasonCode = req.body?.reason_code;
  if (
    typeof reasonCode !== "string" ||
    !ALLOWED_UNPAID_CANCEL_REASON_CODES.has(reasonCode)
  ) {
    return res.status(400).json({ message: "A valid reason_code is required." });
  }

  const providerErrorResponse = (err, fallbackMessage) => {
    const providerStatus = err?.response?.status;
    if (typeof providerStatus === "number") {
      return res.status(502).json({
        message:
          providerStatus === 404
            ? "The PayMongo Checkout Session could not be found. Stock was not released."
            : fallbackMessage,
      });
    }
    return res.status(502).json({
      message:
        "Payment provider is temporarily unavailable. Stock was not released.",
    });
  };

  const finalizeInsteadOfCancel = async (analysis) => {
    const finalized = await finalizePaidAttempt({
      attemptId,
      matchedPayment: analysis.payment,
      actorUserId: req.user.id,
      requireOwner: false,
    });

    if (finalized.freshCommit) {
      req.auditRecord = {
        id: attemptId,
        old: { status: "awaiting_payment" },
        new: {
          status: "consumed",
          resolution: "payment_completed_before_cancellation",
          order_id: finalized.payload?.order_id || null,
          payment_transaction_id:
            finalized.payload?.payment_transaction_id || null,
          receipt_id: finalized.payload?.receipt_id || null,
          admin_user_id: req.user.id,
        },
      };
    }

    if (finalized.httpStatus !== 200) {
      return res.status(finalized.httpStatus).json(finalized.payload);
    }

    return res.status(200).json({
      ...finalized.payload,
      cancellation_blocked: true,
      message:
        "Payment was completed before cancellation. The paid order was finalized instead.",
    });
  };

  try {
    const [[attemptRow]] = await db.query(
      `SELECT * FROM pos_qr_payment_attempts WHERE id = ?`,
      [attemptId],
    );

    if (!attemptRow) {
      return res.status(404).json({ message: "Payment attempt not found." });
    }
    if (attemptRow.status !== "awaiting_payment") {
      return res.status(409).json({
        attempt_id: attemptRow.id,
        status: attemptRow.status,
        message: "This payment attempt is no longer awaiting cancellation.",
      });
    }
    if (
      attemptRow.order_id ||
      attemptRow.payment_transaction_id ||
      attemptRow.provider_payment_id
    ) {
      return res.status(409).json({
        attempt_id: attemptRow.id,
        status: attemptRow.status,
        message: "This payment attempt already has finalized payment records.",
      });
    }
    if (!isNonEmptyString(attemptRow.provider_session_id)) {
      return res.status(409).json({
        attempt_id: attemptRow.id,
        status: attemptRow.status,
        message: "This attempt has no attached Checkout Session to verify.",
      });
    }

    const expectedTotalCents = getSnapshotTotalCents(
      attemptRow.checkout_snapshot,
    );
    if (!expectedTotalCents) {
      console.error(
        "[pos.qrPayments cancelUnpaidAttempt] invalid checkout_snapshot",
        { attemptId: attemptRow.id },
      );
      return res.status(500).json({ message: "Server error." });
    }

    const analyzeCurrentSession = async () => {
      const session = await retrieveCheckoutSession(
        attemptRow.provider_session_id,
        { timeoutMs: 15000 },
      );
      return analyzeCheckoutSession({
        session,
        expectedSessionId: attemptRow.provider_session_id,
        expectedTotalCents,
      });
    };

    let analysis;
    let expireRequestMarked =
      attemptRow.failure_code === "cleanup_expire_requested";
    try {
      analysis = await analyzeCurrentSession();
    } catch (err) {
      return providerErrorResponse(
        err,
        "Unable to verify payment status with PayMongo. Stock was not released.",
      );
    }

    if (analysis.kind === "paid") {
      return finalizeInsteadOfCancel(analysis);
    }

    if (analysis.kind === "pending") {
      try {
        await expireCheckoutSession(attemptRow.provider_session_id, {
          timeoutMs: 15000,
        });
      } catch (err) {
        return providerErrorResponse(
          err,
          "Unable to expire the PayMongo Checkout Session. Stock was not released.",
        );
      }

      const marked = await markExpireRequested({
        attemptId,
        providerSessionId: attemptRow.provider_session_id,
      });
      if (!marked) {
        return res.status(409).json({
          attempt_id: attemptId,
          message:
            "This payment attempt changed while cancellation was being processed. Refresh and review it again.",
        });
      }
      expireRequestMarked = true;

      try {
        analysis = await analyzeCurrentSession();
      } catch (err) {
        return providerErrorResponse(
          err,
          "The Checkout Session expiration was requested, but PayMongo could not yet confirm it. Stock was not released.",
        );
      }

      if (analysis.kind === "paid") {
        return finalizeInsteadOfCancel(analysis);
      }

      if (analysis.kind === "pending") {
        return res.status(409).json({
          attempt_id: attemptId,
          status: "expiration_requested",
          message:
            "Checkout Session expiration was requested. Wait a moment, then retry Cancel & Release Stock.",
        });
      }
    }

    if (analysis.kind !== "expired_unpaid") {
      return res.status(409).json({
        attempt_id: attemptId,
        status: "manual_review",
        message:
          "PayMongo did not confirm an expired unpaid session. Stock was not released.",
      });
    }

    // The session was already expired when first read, or was just expired
    // above. Mark the expected lifecycle guard before the exact-once stock
    // release transaction.
    if (!expireRequestMarked) {
      const marked = await markExpireRequested({
        attemptId,
        providerSessionId: attemptRow.provider_session_id,
      });
      if (!marked) {
        return res.status(409).json({
          attempt_id: attemptId,
          message:
            "This payment attempt changed while cancellation was being processed. Refresh and review it again.",
        });
      }
    }

    const released = await releaseExpiredAttempt({
      attemptId,
      allowedStatuses: ["awaiting_payment"],
      expectedProviderSessionId: attemptRow.provider_session_id,
    });

    if (!released.changed) {
      if (released.reason === "not_found") {
        return res.status(404).json({ message: "Payment attempt not found." });
      }
      if (released.reason === "not_expired") {
        return res.status(409).json({
          attempt_id: attemptId,
          status: "awaiting_payment",
          message:
            "The 15-minute reservation period has not ended yet. Try again after the attempt expiry time.",
        });
      }
      if (
        released.reason === "status_changed" ||
        released.reason === "linked_records_present" ||
        released.reason === "provider_session_changed" ||
        released.reason === "provider_expiry_not_confirmed" ||
        released.reason === "no_active_reservations" ||
        released.reason === "snapshot_mismatch"
      ) {
        return res.status(409).json({
          attempt_id: attemptId,
          status: released.status || null,
          message:
            "This payment attempt is no longer eligible for cancellation and stock release.",
        });
      }
      console.error("[pos.qrPayments cancelUnpaidAttempt] release failed", {
        attemptId,
        reason: released.reason,
      });
      return res.status(500).json({ message: "Server error." });
    }

    req.auditRecord = {
      id: attemptId,
      old: { status: "awaiting_payment" },
      new: {
        status: "expired",
        reason_code: reasonCode,
        provider_status: "expired_unpaid",
        reservations_released: released.releasedCount,
        admin_user_id: req.user.id,
      },
    };

    return res.status(200).json({
      attempt_id: attemptId,
      status: "expired",
      reservations_released: released.releasedCount,
      message: "Unpaid attempt cancelled and reserved stock restored.",
    });
  } catch (err) {
    console.error("[pos.qrPayments cancelUnpaidAttempt]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

