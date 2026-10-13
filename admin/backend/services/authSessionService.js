// services/authSessionService.js
// Server-managed authentication session helpers.
// Stores only SHA-256 hashes of cryptographically random session secrets.

const crypto = require("crypto");
const pool = require("../config/db");

const DEFAULT_SESSION_HOURS = 8;

const hashSessionToken = (token) =>
  crypto.createHash("sha256").update(token, "utf8").digest("hex");

const generateSessionToken = () => crypto.randomBytes(32).toString("hex");

const getSessionExpiry = () => {
  const configuredHours = Number(process.env.AUTH_SESSION_HOURS);
  const hours =
    Number.isFinite(configuredHours) && configuredHours > 0
      ? configuredHours
      : DEFAULT_SESSION_HOURS;

  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

/**
 * Create a server-managed session.
 *
 * The raw token is returned once to the caller.
 * Only its SHA-256 hash is stored in the database.
 */
async function createSession({ userId, ipAddress = null, userAgent = null }) {
  const normalizedUserId = Number(userId);

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new TypeError("A valid user ID is required to create a session.");
  }

  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const expiresAt = getSessionExpiry();

  const [result] = await pool.query(
    `INSERT INTO auth_sessions (
       user_id,
       token_version,
       session_token_hash,
       expires_at,
       ip_address,
       user_agent
     )
     SELECT
       id,
       COALESCE(token_version, 0),
       ?,
       ?,
       ?,
       ?
     FROM users
     WHERE id = ?
       AND is_active = 1`,
    [
      sessionTokenHash,
      expiresAt,
      ipAddress ? String(ipAddress).slice(0, 45) : null,
      userAgent ? String(userAgent).slice(0, 500) : null,
      normalizedUserId,
    ],
  );

  if (result.affectedRows !== 1) {
    throw new Error("Unable to create a session for this account.");
  }

  const [[session]] = await pool.query(
    `SELECT id
       FROM auth_sessions
      WHERE session_token_hash = ?
      LIMIT 1`,
    [sessionTokenHash],
  );

  if (!session) {
    throw new Error("Unable to confirm the created session.");
  }

  return {
    sessionId: session.id,
    sessionToken,
    expiresAt,
  };
}

/**
 * Validate a raw session token against the stored hash.
 * Returns the session and current account security fields, or null.
 */
async function validateSession(sessionToken) {
  if (
    typeof sessionToken !== "string" ||
    !/^[a-f0-9]{64}$/i.test(sessionToken)
  ) {
    return null;
  }

  const sessionTokenHash = hashSessionToken(sessionToken);

  const [[session]] = await pool.query(
    `SELECT
       s.id AS session_id,
       s.user_id,
       s.token_version AS session_token_version,
       s.expires_at,
       s.created_at,
       s.last_seen_at,
       u.name,
       u.email,
       u.role,
       u.authority_level,
       u.staff_type,
       u.is_active,
       u.is_verified,
       u.must_change_password,
       u.token_version
     FROM auth_sessions AS s
     INNER JOIN users AS u
       ON u.id = s.user_id
     WHERE s.session_token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > UTC_TIMESTAMP()
       AND u.is_active = 1
       AND s.token_version = COALESCE(u.token_version, 0)
     LIMIT 1`,
    [sessionTokenHash],
  );

  return session || null;
}

/**
 * Update last_seen_at for a validated session.
 * Call only after successful session validation.
 */
async function touchSession(sessionId) {
  const normalizedSessionId = Number(sessionId);

  if (!Number.isSafeInteger(normalizedSessionId) || normalizedSessionId <= 0) {
    return false;
  }

  const [result] = await pool.query(
    `UPDATE auth_sessions AS s
       INNER JOIN users AS u
         ON u.id = s.user_id
        SET s.last_seen_at = UTC_TIMESTAMP()
      WHERE s.id = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > UTC_TIMESTAMP()
        AND u.is_active = 1
        AND s.token_version = COALESCE(u.token_version, 0)`,
    [normalizedSessionId],
  );

  // MySQL can report zero changed rows if last_seen_at already has
  // the current timestamp. Do not use affectedRows alone as proof
  // that the session is invalid.
  return true;
}

/**
 * Revoke one session using its raw token.
 */
async function revokeSession(sessionToken) {
  if (
    typeof sessionToken !== "string" ||
    !/^[a-f0-9]{64}$/i.test(sessionToken)
  ) {
    return false;
  }

  const sessionTokenHash = hashSessionToken(sessionToken);

  const [result] = await pool.query(
    `UPDATE auth_sessions
        SET revoked_at = UTC_TIMESTAMP()
      WHERE session_token_hash = ?
        AND revoked_at IS NULL`,
    [sessionTokenHash],
  );

  return result.affectedRows > 0;
}

/**
 * Revoke all active sessions belonging to one user.
 */
async function revokeAllUserSessions(userId) {
  const normalizedUserId = Number(userId);

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new TypeError("A valid user ID is required.");
  }

  const [result] = await pool.query(
    `UPDATE auth_sessions
        SET revoked_at = UTC_TIMESTAMP()
      WHERE user_id = ?
        AND revoked_at IS NULL`,
    [normalizedUserId],
  );

  return result.affectedRows;
}

module.exports = {
  createSession,
  validateSession,
  touchSession,
  revokeSession,
  revokeAllUserSessions,
};
