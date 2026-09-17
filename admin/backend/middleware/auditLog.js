// middleware/auditLog.js – Central audit trail helpers for WISDOM
const pool = require("../config/db");
const {
  getRequestAuditContext,
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

const ALLOWED_ACTOR_TYPES = new Set([
  "user",
  "anonymous",
  "system",
  "webhook",
]);

let warnedAboutLegacyAuditSchema = false;

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

const cleanOptionalString = (value, maxLength) => {
  if (value === null || value === undefined) return null;
  const clean = String(value).trim();
  return clean ? clean.slice(0, maxLength) : null;
};

const normalizeActorType = (value) => {
  const clean = String(value || "")
    .trim()
    .toLowerCase();
  return ALLOWED_ACTOR_TYPES.has(clean) ? clean : null;
};

const normalizeResponseStatus = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599
    ? parsed
    : null;
};

const writeLegacyAuditRow = async ({
  safeUserId,
  cleanAction,
  cleanTableName,
  safeRecordId,
  oldValues,
  newValues,
  safeIp,
}) => {
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
};

async function writeAuditLogSafe({
  userId = null,
  action,
  tableName,
  recordId = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
  actorType = null,
  userAgent = null,
  requestMethod = null,
  requestPath = null,
  responseStatus = null,
  requestId = null,
  ipCountryCode = null,
  ipRegion = null,
  ipCity = null,
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

  const requestContext = getRequestAuditContext();
  const safeIp = normalizeClientIp(requestContext?.clientIp || ipAddress);
  const safeActorType =
    normalizeActorType(actorType) ||
    (safeUserId ? "user" : requestContext ? "anonymous" : "system");
  const safeUserAgent = cleanOptionalString(
    userAgent ?? requestContext?.userAgent,
    512,
  );
  const safeRequestMethod = cleanOptionalString(
    requestMethod ?? requestContext?.requestMethod,
    10,
  );
  const safeRequestPath = cleanOptionalString(
    requestPath ?? requestContext?.requestPath,
    1000,
  );
  const safeResponseStatus = normalizeResponseStatus(responseStatus);
  const safeRequestId = cleanOptionalString(
    requestId ?? requestContext?.requestId,
    36,
  );
  const safeIpCountryCode = cleanOptionalString(
    ipCountryCode ?? requestContext?.ipCountryCode,
    2,
  )?.toUpperCase() || null;
  const safeIpRegion = cleanOptionalString(
    ipRegion ?? requestContext?.ipRegion,
    120,
  );
  const safeIpCity = cleanOptionalString(
    ipCity ?? requestContext?.ipCity,
    120,
  );

  const auditParams = {
    safeUserId,
    cleanAction,
    cleanTableName,
    safeRecordId,
    oldValues,
    newValues,
    safeIp,
  };

  try {
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, actor_type, action, table_name, record_id,
          old_values, new_values, ip_address, user_agent,
          request_method, request_path, response_status, request_id,
          ip_country_code, ip_region, ip_city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        safeUserId,
        safeActorType,
        cleanAction.slice(0, 100),
        cleanTableName.slice(0, 100),
        safeRecordId,
        serializeAuditValue(oldValues),
        serializeAuditValue(newValues),
        safeIp,
        safeUserAgent,
        safeRequestMethod,
        safeRequestPath,
        safeResponseStatus,
        safeRequestId,
        safeIpCountryCode,
        safeIpRegion,
        safeIpCity,
      ],
    );
    return true;
  } catch (error) {
    // R1 is deliberately deployment-order safe. If the additive migration has
    // not been applied yet, preserve the existing audit trail instead of
    // dropping the event. Once migration 015 exists, the full-context insert is
    // used automatically.
    if (error?.code === "ER_BAD_FIELD_ERROR" || Number(error?.errno) === 1054) {
      if (!warnedAboutLegacyAuditSchema) {
        warnedAboutLegacyAuditSchema = true;
        console.warn(
          "Audit context columns are not available yet; using legacy audit schema until migration 015 is applied.",
        );
      }

      try {
        await writeLegacyAuditRow(auditParams);
        return true;
      } catch (legacyError) {
        console.error("Audit log error:", legacyError.message);
        return false;
      }
    }

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
          actorType: "user",
          responseStatus: Number(res.statusCode || 200),
        });
      }
      return originalJson(body);
    };

    next();
  };
}

module.exports = {
  logAction,
  writeAuditLogSafe,
  sanitizeAuditValue,
  normalizeActorType,
  normalizeResponseStatus,
};
