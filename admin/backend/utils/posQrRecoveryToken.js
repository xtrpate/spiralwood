// utils/posQrRecoveryToken.js
//
// Phase 3D-D3 — stateless, short-lived, server-signed confirmation
// tokens for POS QR admin recovery actions (manual release only).
//
// Deliberately independent of JWT_SECRET (used for login sessions) —
// a separate POS_QR_RECOVERY_TOKEN_SECRET keeps this narrow-purpose
// token's blast radius isolated from the authentication system. Fails
// closed (returns null / { ok:false }) whenever the secret is missing
// or shorter than MIN_SECRET_LENGTH — never falls back to a default or
// an empty-string secret.
//
// The token payload is intentionally minimal: no customer data, no
// product/stock quantities, no raw notes, no provider responses, no
// session/payment ids, no checkout URLs, and never the secret itself.
// It exists only to prove "this admin reviewed this exact attempt in
// this exact state, moments ago, and chose this reason" — the actual
// database guards are re-checked independently at confirmation time
// regardless of what the token says (see posQrLifecycleService.js
// confirmManualRelease).

const crypto = require("crypto");

const TOKEN_PURPOSE = "pos_qr_manual_release";
const TOKEN_TTL_SECONDS = 300; // ~5 minutes
const MIN_SECRET_LENGTH = 32;
const MAX_TOKEN_LENGTH = 2000;

const getRecoveryTokenSecret = () => {
  const secret = process.env.POS_QR_RECOVERY_TOKEN_SECRET;
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    // Fail closed. Never log or expose the value either way.
    return null;
  }
  return secret;
};

// Deterministic, recursively key-sorted JSON stringify — guarantees the
// same logical object always serializes identically regardless of
// property insertion order, so hashing/signing is stable. Kept as a
// small, self-contained copy here (rather than imported from the
// controller's own stableStringify) to avoid a cross-module dependency
// between this utility and controllers/staff/pos.qrPayments.js.
const canonicalStringify = (value) => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(",")}}`;
};

// Computes a stable SHA-256 hash of an attempt's checkout_snapshot,
// used as a tamper/staleness fingerprint inside the recovery token.
// Returns null if the raw snapshot is not valid JSON — callers must
// treat a null result as "cannot issue/verify a token for this attempt".
const computeSnapshotHash = (rawCheckoutSnapshot) => {
  let parsed;
  try {
    parsed = JSON.parse(rawCheckoutSnapshot);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  return crypto
    .createHash("sha256")
    .update(canonicalStringify(parsed))
    .digest("hex");
};

const base64UrlEncode = (buffer) =>
  buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const base64UrlDecodeToBuffer = (value) => {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
};

// Signs a short-lived recovery token. Returns null (fail closed) if the
// signing secret is not configured/too weak — callers must treat a null
// result as "recovery is not available", never fall back to an
// unsigned or default-signed token.
const signRecoveryToken = ({
  attemptId,
  adminUserId,
  attemptVersion,
  snapshotHash,
  reasonCode,
}) => {
  const secret = getRecoveryTokenSecret();
  if (!secret) return null;

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TOKEN_TTL_SECONDS;

  const payload = {
    purpose: TOKEN_PURPOSE,
    attempt_id: attemptId,
    admin_user_id: adminUserId,
    attempt_version: attemptVersion,
    snapshot_hash: snapshotHash,
    reason_code: reasonCode,
    issued_at: issuedAt,
    expires_at: expiresAt,
  };

  const payloadJson = canonicalStringify(payload);
  const payloadB64 = base64UrlEncode(Buffer.from(payloadJson, "utf8"));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest();
  const signatureB64 = base64UrlEncode(signature);

  return { token: `${payloadB64}.${signatureB64}`, payload };
};

// Verifies a recovery token's signature, purpose, and expiration only.
// Does NOT check attempt_id/admin_user_id/reason_code against the
// current request, and does NOT re-check attempt_version/snapshot_hash
// against the live database row — those checks belong to the caller
// (controller for the request-context fields, posQrLifecycleService's
// confirmManualRelease for the live-data staleness check), since this
// utility has no knowledge of the current request or database state.
const verifyRecoveryToken = (token) => {
  const secret = getRecoveryTokenSecret();
  if (!secret) return { ok: false, reason: "recovery_token_secret_unavailable" };

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH
  ) {
    return { ok: false, reason: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, signatureB64] = parts;

  let expectedSignature;
  try {
    expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payloadB64)
      .digest();
  } catch {
    return { ok: false, reason: "malformed" };
  }

  let providedSignature;
  try {
    providedSignature = base64UrlDecodeToBuffer(signatureB64);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    providedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeToBuffer(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "malformed" };
  }
  if (payload.purpose !== TOKEN_PURPOSE) {
    return { ok: false, reason: "wrong_purpose" };
  }
  if (!Number.isInteger(payload.expires_at)) {
    return { ok: false, reason: "malformed" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds >= payload.expires_at) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload };
};

module.exports = {
  TOKEN_PURPOSE,
  TOKEN_TTL_SECONDS,
  computeSnapshotHash,
  signRecoveryToken,
  verifyRecoveryToken,
};