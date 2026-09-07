// middleware/auditLog.js – Central audit trail helpers for WISDOM
const pool = require("../config/db");
const {
  getRequestClientIp,
  normalizeClientIp,
} = require("../utils/clientIp");

// Never persist credentials, authentication tokens, OTP values, cookies, or
// secrets in audit metadata. Exact-key matching keeps useful boolean flags such
// as password_reset while redacting actual secret-bearing fields.
const SENSITIVE_AUDIT_KEYS = new Set([
  "password",
  "current_password",
  "new_password",
  "otp",
  "otp_code",
  "reset_otp",
  "reset_token",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "cookie",
  "jwt",
  "secret",
  "client_secret",
]);

const sanitizeAuditValue = (value, depth = 0) => {
  if (depth > 8) return "[omitted]";
  if (value === null || value === undefined) return value ?? null;

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeAuditValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = String(key || "").trim().toLowerCase();
      out[key] = SENSITIVE_AUDIT_KEYS.has(normalizedKey)
        ? "[redacted]"
        : sanitizeAuditValue(item, depth + 1);
    }
    return out;
  }

  if (typeof value === "string" && value.length > 5000) {
    return value.slice(0, 5000) + "…";
  }

  return value;
};

const serializeAuditValue = (value) => {
  if (value === null || value === undefined) return null;
  return JSON.stringify(sanitizeAuditValue(value));
};

async function writeAuditLogSafe({
  userId = null,
  action,
  tableName,
  recordId = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
}) {
  const cleanAction = String(action || "").trim();
  const cleanTableName = String(tableName || "").trim();
  if (!cleanAction || !cleanTableName) return false;

  const parsedUserId = Number(userId);
  const safeUserId =
    Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;
  const parsedRecordId = Number(recordId);
  const safeRecordId =
    Number.isInteger(parsedRecordId) && parsedRecordId > 0
      ? parsedRecordId
      : null;
  // Prefer the visitor address captured by the request middleware.
  // This fixes existing audit callers centrally, even if they still pass
  // req.ip (which can be a Render/private proxy address in production).
  const requestClientIp = getRequestClientIp();
  const safeIp = normalizeClientIp(requestClientIp || ipAddress);

  try {
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, action, table_name, record_id, old_values, new_values, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        safeUserId,
        cleanAction.slice(0, 100),
        cleanTableName.slice(0, 100),
        safeRecordId,
        serializeAuditValue(oldValues),
        serializeAuditValue(newValues),
        safeIp,
      ],
    );
    return true;
  } catch (error) {
    console.error("Audit log error:", error.message);
    return false;
  }
}

/**
 * Factory: logAction("create_product", "products")
 * Attach before a controller that sets req.auditRecord = { id, old, new }.
 */
function logAction(action, tableName) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = async function (body) {
      if (
        req.user &&
        req.auditRecord &&
        Number(res.statusCode || 200) < 400
      ) {
        await writeAuditLogSafe({
          userId: req.user.id,
          action,
          tableName,
          recordId: req.auditRecord.id || null,
          oldValues: req.auditRecord.old || null,
          newValues: req.auditRecord.new || null,
          ipAddress: req.ip || null,
        });
      }
      return originalJson(body);
    };

    next();
  };
}

module.exports = { logAction, writeAuditLogSafe, sanitizeAuditValue };
