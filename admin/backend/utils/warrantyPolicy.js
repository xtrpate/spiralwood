"use strict";

const WARRANTY_PERIOD_KEY = "warranty_period_days";
const WARRANTY_POLICY_VERSION_KEY = "warranty_policy_version";
const WARRANTY_POLICY_VERSION = "2";
const MIN_WARRANTY_PERIOD_DAYS = 1;
const MAX_WARRANTY_PERIOD_DAYS = 3650;

const warrantyPolicyError = (message, code = "WARRANTY_POLICY_INTEGRITY") => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const parseWarrantyPeriodDays = (value) => {
  const text = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(text)) return null;
  const days = Number(text);
  return Number.isSafeInteger(days) &&
    days >= MIN_WARRANTY_PERIOD_DAYS &&
    days <= MAX_WARRANTY_PERIOD_DAYS
    ? days
    : null;
};

const parseOrderWarrantyPolicySnapshot = (row = {}) => {
  const rawDays = row.warranty_period_days_snapshot;
  const rawVersion = row.warranty_policy_version_snapshot;
  const rawEffectiveAt = row.warranty_policy_effective_at;

  const hasDays = rawDays !== null && rawDays !== undefined && String(rawDays).trim() !== "";
  const hasVersion =
    rawVersion !== null &&
    rawVersion !== undefined &&
    String(rawVersion).trim() !== "";
  const hasEffectiveAt =
    rawEffectiveAt !== null &&
    rawEffectiveAt !== undefined &&
    String(rawEffectiveAt).trim() !== "";

  if (!hasDays && !hasVersion && !hasEffectiveAt) return null;
  if (!(hasDays && hasVersion && hasEffectiveAt)) {
    throw warrantyPolicyError("Order warranty policy snapshot is incomplete.");
  }

  const periodDays = parseWarrantyPeriodDays(rawDays);
  const version = String(rawVersion).trim();

  if (!periodDays || !version) {
    throw warrantyPolicyError("Order warranty policy snapshot is invalid.");
  }

  return {
    periodDays,
    version,
    effectiveAt: rawEffectiveAt,
  };
};

const loadCurrentWarrantyPolicy = async (executor) => {
  if (!executor || typeof executor.query !== "function") {
    throw warrantyPolicyError("Warranty policy database executor is unavailable.");
  }

  const [rows] = await executor.query(
    `SELECT content_key, content
     FROM website_content
     WHERE content_type = 'setting'
       AND content_key IN (?, ?)`,
    [WARRANTY_PERIOD_KEY, WARRANTY_POLICY_VERSION_KEY],
  );

  const values = new Map(
    (rows || []).map((row) => [String(row.content_key), row.content]),
  );
  const periodDays = parseWarrantyPeriodDays(values.get(WARRANTY_PERIOD_KEY));
  const version = String(values.get(WARRANTY_POLICY_VERSION_KEY) || "").trim();

  if (!periodDays || version !== WARRANTY_POLICY_VERSION) {
    throw warrantyPolicyError(
      "Current warranty policy settings are invalid or unsupported.",
      "WARRANTY_POLICY_CONFIGURATION",
    );
  }

  return { periodDays, version };
};

const bindOrderWarrantyPolicy = async (conn, orderId) => {
  const parsedOrderId = Number(orderId);
  if (!Number.isSafeInteger(parsedOrderId) || parsedOrderId <= 0) {
    throw warrantyPolicyError("A valid order id is required for warranty policy binding.");
  }
  if (!conn || typeof conn.query !== "function") {
    throw warrantyPolicyError("Warranty policy database connection is unavailable.");
  }

  const [[order]] = await conn.query(
    `SELECT
       id,
       warranty_period_days_snapshot,
       warranty_policy_version_snapshot,
       warranty_policy_effective_at
     FROM orders
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [parsedOrderId],
  );

  if (!order) {
    throw warrantyPolicyError("Order was not found for warranty policy binding.");
  }

  const existing = parseOrderWarrantyPolicySnapshot(order);
  if (existing) return existing;

  const current = await loadCurrentWarrantyPolicy(conn);
  const [updateResult] = await conn.query(
    `UPDATE orders
     SET warranty_period_days_snapshot = ?,
         warranty_policy_version_snapshot = ?,
         warranty_policy_effective_at = NOW()
     WHERE id = ?
       AND warranty_period_days_snapshot IS NULL
       AND warranty_policy_version_snapshot IS NULL
       AND warranty_policy_effective_at IS NULL`,
    [current.periodDays, current.version, parsedOrderId],
  );

  if (Number(updateResult?.affectedRows || 0) !== 1) {
    throw warrantyPolicyError(
      "Order warranty policy snapshot changed while it was being bound.",
    );
  }

  return {
    periodDays: current.periodDays,
    version: current.version,
    effectiveAt: null,
  };
};

const buildWarrantyTermsForPeriod = (periodDays, existingTerms = "") => {
  const days = parseWarrantyPeriodDays(periodDays);
  if (!days) {
    throw warrantyPolicyError("Warranty period cannot be rendered safely.");
  }

  const coverage = `The furniture is covered by a ${days}-day warranty from the handoff date for defects in materials and workmanship under normal use.`;
  const paragraphs = String(existingTerms || "")
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return coverage;

  if (/^The furniture is covered by\b/i.test(paragraphs[0])) {
    paragraphs[0] = coverage;
  } else {
    paragraphs.unshift(coverage);
  }

  return paragraphs.join("\n\n");
};

module.exports = {
  WARRANTY_PERIOD_KEY,
  WARRANTY_POLICY_VERSION_KEY,
  WARRANTY_POLICY_VERSION,
  MIN_WARRANTY_PERIOD_DAYS,
  MAX_WARRANTY_PERIOD_DAYS,
  parseOrderWarrantyPolicySnapshot,
  loadCurrentWarrantyPolicy,
  bindOrderWarrantyPolicy,
  buildWarrantyTermsForPeriod,
  _test: {
    parseWarrantyPeriodDays,
  },
};
