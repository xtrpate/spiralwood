// controllers/websiteController.js
const pool = require("../../config/db");
const path = require("path");
const fs = require("fs");
const { writeAuditLogSafe } = require("../../middleware/auditLog");
const {
  persistSiteLogo,
  cleanupPersistedSiteLogo,
} = require("../../config/upload");

// Setting-key categorization for audit metadata only — does not affect
// validation or business behavior. Values are never logged, only which
// category of keys changed.
const PAYMENT_SETTING_KEYS = [
  "bank_account_name",
  "bank_account_number",
  "bank_transfer_enabled",
  "gcash_enabled",
  "gcash_number",
  "cod_enabled",
  "cop_enabled",
  "paymongo_enabled",
];
const MESSAGE_SETTING_KEYS = ["email_footer", "checkout_note"];
const POLICY_SETTING_KEYS = ["warranty_period_days"];
const WARRANTY_POLICY_VERSION_KEY = "warranty_policy_version";
const WARRANTY_POLICY_VERSION = "2";
const DEFAULT_WARRANTY_PERIOD_DAYS = 365;
const DELIVERY_SETTING_KEYS = [
  "standard_truck_limit_width_mm",
  "standard_truck_limit_height_mm",
  "standard_truck_limit_depth_mm",
];

// Public storefront consumers only need branding/contact/location data,
// storefront section visibility, checkout note, and the two live ready-made
// payment switches. Operational/admin settings must never be exposed just
// because a new row exists in website_content.
const PUBLIC_SETTING_KEYS = new Set([
  "site_logo",
  "site_name",
  "business_address",
  "google_maps_url",
  "business_latitude",
  "business_longitude",
  "google_maps_place_id",
  "business_phone",
  "business_email",
  "social_facebook",
  "social_instagram",
  "social_telegram",
  "operating_hours",
  "cod_enabled",
  "paymongo_enabled",
  "checkout_note",
]);

const TOGGLE_SETTING_KEYS = new Set([
  "show_faq_section",
  "show_about_section",
  "show_contact_section",
  "cod_enabled",
  "cop_enabled",
  "paymongo_enabled",
  "gcash_enabled",
  "bank_transfer_enabled",
  "email_order_confirmed",
  "email_production_started",
  "email_out_for_delivery",
]);

const EMAIL_SETTING_KEYS = new Map([
  ["business_email", "Business Email"],
  ["admin_alert_email", "Admin Alert Email"],
]);

const URL_SETTING_KEYS = new Map([
  ["google_maps_url", "Google Maps URL"],
  ["social_facebook", "Facebook URL"],
  ["social_instagram", "Instagram URL"],
  ["social_telegram", "Telegram URL"],
]);

const hasOwn = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj || {}, key);

const makeValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const normalizeToggleSetting = (value, key) => {
  if (value === true || value === 1 || value === "1") return "true";
  if (value === false || value === 0 || value === "0") return "false";

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "true") return "true";
  if (normalized === "false") return "false";

  throw makeValidationError(
    `${key} must be a true/false setting value.`,
  );
};

const validateEmailSetting = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text) return;

  if (
    text.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
  ) {
    throw makeValidationError(`${label} must be a valid email address.`);
  }
};

const validateHttpUrlSetting = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text) return;

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw makeValidationError(`${label} must be a valid URL.`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw makeValidationError(`${label} must use http:// or https://.`);
  }
};

const normalizeAndValidateSettingsPayload = (body, existingMap) => {
  const normalized = { ...(body || {}) };

  for (const key of TOGGLE_SETTING_KEYS) {
    if (hasOwn(normalized, key)) {
      normalized[key] = normalizeToggleSetting(normalized[key], key);
    }
  }

  if (hasOwn(normalized, "business_phone")) {
    const phone = String(normalized.business_phone ?? "").trim();
    if (phone && !/^09\d{9}$/.test(phone)) {
      throw makeValidationError(
        "Business Phone must be exactly 11 digits and start with 09.",
      );
    }
    normalized.business_phone = phone;
  }

  if (hasOwn(normalized, "gcash_number")) {
    const phone = String(normalized.gcash_number ?? "").trim();
    if (phone && !/^09\d{9}$/.test(phone)) {
      throw makeValidationError(
        "GCash Number must be exactly 11 digits and start with 09.",
      );
    }
    normalized.gcash_number = phone;
  }

  for (const [key, label] of EMAIL_SETTING_KEYS) {
    if (hasOwn(normalized, key)) {
      const value = String(normalized[key] ?? "").trim();
      validateEmailSetting(value, label);
      normalized[key] = value;
    }
  }

  for (const [key, label] of URL_SETTING_KEYS) {
    if (hasOwn(normalized, key)) {
      const value = String(normalized[key] ?? "").trim();
      validateHttpUrlSetting(value, label);
      normalized[key] = value;
    }
  }

  const coordinatesChanged =
    hasOwn(normalized, "business_latitude") ||
    hasOwn(normalized, "business_longitude");

  if (coordinatesChanged) {
    const latitudeRaw = String(
      hasOwn(normalized, "business_latitude")
        ? normalized.business_latitude
        : existingMap.get("business_latitude")?.value ?? "",
    ).trim();
    const longitudeRaw = String(
      hasOwn(normalized, "business_longitude")
        ? normalized.business_longitude
        : existingMap.get("business_longitude")?.value ?? "",
    ).trim();

    if ((latitudeRaw && !longitudeRaw) || (!latitudeRaw && longitudeRaw)) {
      throw makeValidationError(
        "Business Latitude and Business Longitude must be provided together.",
      );
    }

    if (latitudeRaw && longitudeRaw) {
      const latitude = Number(latitudeRaw);
      const longitude = Number(longitudeRaw);

      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw makeValidationError(
          "Enter valid business latitude and longitude coordinates.",
        );
      }
    }

    if (hasOwn(normalized, "business_latitude")) {
      normalized.business_latitude = latitudeRaw;
    }
    if (hasOwn(normalized, "business_longitude")) {
      normalized.business_longitude = longitudeRaw;
    }
  }

  return normalized;
};

// Strict allow-list mapping each known non-logo setting key to its
// database group_name. Any key not in this map is ignored entirely —
// no row is read, written, or added to changedKeys. site_logo is
// deliberately absent: it may only ever come from req.file, never
// from a normal request-body field.
const SETTING_KEY_GROUPS = {
  site_name: "display",
  show_faq_section: "display",
  show_about_section: "display",
  show_contact_section: "display",
  business_address: "display",
  // WISDOM GOOGLE MAPS LINK V1
  google_maps_url: "display",
  // WISDOM GOOGLE MAPS PIN V1
  business_latitude: "display",
  business_longitude: "display",
  google_maps_place_id: "display",
  business_phone: "display",
  business_email: "display",
  social_facebook: "display",
  social_instagram: "display",
  social_telegram: "display",
  operating_hours: "display",
  cod_enabled: "payment",
  cop_enabled: "payment",
  paymongo_enabled: "payment",
  gcash_enabled: "payment",
  bank_transfer_enabled: "payment",
  gcash_number: "payment",
  bank_account_name: "payment",
  bank_account_number: "payment",
  email_footer: "email",
  checkout_note: "email",
  admin_alert_email: "email",
  email_order_confirmed: "email",
  email_production_started: "email",
  email_out_for_delivery: "email",
  warranty_period_days: "policy",
  standard_truck_limit_width_mm: "delivery",
  standard_truck_limit_height_mm: "delivery",
  standard_truck_limit_depth_mm: "delivery",
};

// Only these three static pages may be created or updated. Any other
// slug is rejected before touching the database.
const KNOWN_PAGE_SLUGS = ["about_us", "contact", "faq"];

const PAGE_VISIBILITY_SETTING_KEYS = {
  about_us: "show_about_section",
  contact: "show_contact_section",
  faq: "show_faq_section",
};

// ── SETTINGS ─────────────────────────────────────────────────────────────────
const loadSettingRows = async () => {
  const [rows] = await pool.query(
    `SELECT
       content_key AS setting_key,
       content AS value,
       group_name
     FROM website_content
     WHERE content_type = 'setting'
     ORDER BY group_name, content_key`,
    [],
  );
  return rows;
};

const loadPageVisibilityRows = async () => {
  const [rows] = await pool.query(
    `SELECT content_key AS slug, is_visible
     FROM website_content
     WHERE content_type = 'page'
       AND content_key IN (?, ?, ?)`,
    KNOWN_PAGE_SLUGS,
  );
  return rows;
};

const applyPageVisibilityToPublicSettings = (grouped, pageRows) => {
  grouped.display = grouped.display || {};

  const visibilityBySlug = new Map(
    (pageRows || []).map((row) => [
      row.slug,
      Number(row.is_visible) === 1,
    ]),
  );

  for (const [slug, settingKey] of Object.entries(
    PAGE_VISIBILITY_SETTING_KEYS,
  )) {
    grouped.display[settingKey] =
      visibilityBySlug.get(slug) === true ? "true" : "false";
  }

  return grouped;
};

const groupSettingRows = (rows, { publicOnly = false } = {}) => {
  const grouped = rows.reduce((acc, row) => {
    if (
      row.setting_key === "cancellation_fee_pct" ||
      row.setting_key === WARRANTY_POLICY_VERSION_KEY
    ) {
      return acc;
    }

    if (publicOnly && !PUBLIC_SETTING_KEYS.has(row.setting_key)) {
      return acc;
    }

    (acc[row.group_name] = acc[row.group_name] || {})[row.setting_key] =
      row.value;
    return acc;
  }, {});

  if (!publicOnly) {
    const warrantyVersion = rows.find(
      (row) => row.setting_key === WARRANTY_POLICY_VERSION_KEY,
    )?.value;

    if (String(warrantyVersion || "") !== WARRANTY_POLICY_VERSION) {
      grouped.policy = grouped.policy || {};
      grouped.policy.warranty_period_days = String(
        DEFAULT_WARRANTY_PERIOD_DAYS,
      );
    }
  }

  return grouped;
};

// Public storefront-safe settings only.
exports.getSettings = async (req, res) => {
  try {
    const [rows, pageRows] = await Promise.all([
      loadSettingRows(),
      loadPageVisibilityRows(),
    ]);

    const grouped = groupSettingRows(rows, { publicOnly: true });
    res.json(applyPageVisibilityToPublicSettings(grouped, pageRows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Full settings are available only through the admin-protected route.
exports.getAdminSettings = async (req, res) => {
  try {
    const rows = await loadSettingRows();
    res.json(groupSettingRows(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  const conn = await pool.getConnection();
  let persistedLogo = null;
  let transactionCommitted = false;

  try {
    await conn.beginTransaction();

    const [[existingLogo]] = await conn.query(
      `SELECT content AS value
       FROM website_content
       WHERE content_type = 'setting' AND content_key = ?
       LIMIT 1`,
      ["site_logo"],
    );
    const hasLogoBefore = Boolean(existingLogo?.value);

    const [existingRows] = await conn.query(
      `SELECT
         content_key AS setting_key,
         content AS value,
         group_name
       FROM website_content
       WHERE content_type = 'setting'`,
    );
    const existingMap = new Map(
      existingRows.map((r) => [
        r.setting_key,
        {
          value: r.value,
          group_name: r.group_name,
        },
      ]),
    );

    // Normalize/validate all incoming settings before any setting row is
    // changed. Frontend validation remains UX; this is the authoritative gate.
    const incomingSettings = normalizeAndValidateSettingsPayload(
      req.body,
      existingMap,
    );

    if (hasOwn(incomingSettings, "warranty_period_days")) {
      const warrantyDays = Number(incomingSettings.warranty_period_days);

      if (
        !Number.isInteger(warrantyDays) ||
        warrantyDays < 1 ||
        warrantyDays > 3650
      ) {
        const error = new Error(
          "Warranty Period must be a whole number from 1 to 3650 days.",
        );
        error.statusCode = 400;
        throw error;
      }
    }

    const hasDeliveryLimitUpdate = DELIVERY_SETTING_KEYS.some((key) =>
      hasOwn(incomingSettings, key),
    );

    if (hasDeliveryLimitUpdate) {
      const mergedLimits = DELIVERY_SETTING_KEYS.map((key) => {
        const incoming = hasOwn(incomingSettings, key)
          ? incomingSettings[key]
          : existingMap.get(key)?.value;

        return Number(incoming);
      });

      const hasInvalidLimit = mergedLimits.some(
        (value) => !Number.isFinite(value) || value <= 0 || value > 20000,
      );

      if (hasInvalidLimit) {
        const error = new Error(
          "Enter valid internal truck width, height, and depth limits in millimeters before saving.",
        );
        error.statusCode = 400;
        throw error;
      }
    }

    const changedKeys = [];
    for (const [key, value] of Object.entries(incomingSettings)) {
      const groupName = SETTING_KEY_GROUPS[key];
      if (!groupName) continue; // unknown/arbitrary key — ignored entirely

      const existing = existingMap.get(key);

      // Normalize to strings before comparing — website_content.content is
      // TEXT, but a direct JSON request could send a number or boolean,
      // which would otherwise falsely register as "changed" every time.
      const nextValue =
        value === null || value === undefined ? "" : String(value);
      const previousValue =
        existing?.value === null || existing?.value === undefined
          ? ""
          : String(existing.value);

      const valueChanged = !existing || previousValue !== nextValue;
      const groupChanged = !existing || existing.group_name !== groupName;
      if (!valueChanged && !groupChanged) continue; // genuine no-op, skip

      await conn.query(
        `INSERT INTO website_content
           (content_key, content_type, content, group_name, is_visible, updated_by)
         VALUES
           (?, 'setting', ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE
           content_type = 'setting',
           content = VALUES(content),
           group_name = VALUES(group_name),
           updated_by = VALUES(updated_by)`,
        [key, nextValue, groupName, parseInt(req.user.id)],
      );

      if (key === "warranty_period_days") {
        await conn.query(
          `INSERT INTO website_content
             (content_key, content_type, content, group_name, is_visible, updated_by)
           VALUES
             (?, 'setting', ?, 'policy', 0, ?)
           ON DUPLICATE KEY UPDATE
             content_type = 'setting',
             content = VALUES(content),
             group_name = 'policy',
             is_visible = 0,
             updated_by = VALUES(updated_by)`,
          [
            WARRANTY_POLICY_VERSION_KEY,
            WARRANTY_POLICY_VERSION,
            parseInt(req.user.id),
          ],
        );
      }

      changedKeys.push(key);
    }
    if (req.file) {
      // File content has already passed extension/MIME/magic-byte checks in
      // uploadSiteLogo. Persist only after settings validation has succeeded.
      persistedLogo = await persistSiteLogo(req.file);
      const logoUrl = persistedLogo.url;

      await conn.query(
        `INSERT INTO website_content
           (content_key, content_type, content, group_name, is_visible, updated_by)
         VALUES
           ('site_logo', 'setting', ?, 'display', 1, ?)
         ON DUPLICATE KEY UPDATE
           content_type = 'setting',
           content = VALUES(content),
           group_name = 'display',
           updated_by = VALUES(updated_by)`,
        [logoUrl, parseInt(req.user.id)],
      );
    }

    const [[updatedLogo]] = await conn.query(
      `SELECT content AS value
       FROM website_content
       WHERE content_type = 'setting' AND content_key = ?
       LIMIT 1`,
      ["site_logo"],
    );
    const hasLogoAfter = Boolean(updatedLogo?.value);

    await conn.commit();
    transactionCommitted = true;

    if (changedKeys.length > 0 || Boolean(req.file)) {
      req.auditRecord = {
        old: {
          has_logo: hasLogoBefore,
        },
        new: {
          keys_changed: changedKeys,
          business_name_changed: changedKeys.includes("site_name"),
          contact_info_changed: changedKeys.some((k) =>
            [
              "business_address",
              "google_maps_url",
              "business_latitude",
              "business_longitude",
              "google_maps_place_id",
              "business_phone",
              "business_email",
              "social_facebook",
              "social_instagram",
              "social_telegram",
              "operating_hours",
            ].includes(k),
          ),
          payment_settings_changed: changedKeys.some((k) =>
            PAYMENT_SETTING_KEYS.includes(k),
          ),
          message_settings_changed: changedKeys.some((k) =>
            [
              "email_footer",
              "checkout_note",
              "admin_alert_email",
              "email_order_confirmed",
              "email_production_started",
              "email_out_for_delivery",
            ].includes(k),
          ),
          policy_settings_changed: changedKeys.some((k) =>
            POLICY_SETTING_KEYS.includes(k),
          ),
          delivery_settings_changed: changedKeys.some((k) =>
            DELIVERY_SETTING_KEYS.includes(k),
          ),
          has_logo: hasLogoAfter,
          logo_uploaded_this_update: Boolean(req.file),
        },
      };
    }

    res.json({ message: "Settings updated." });
  } catch (err) {
    // Roll back only while the DB transaction is still open. A rare error
    // after commit must never make the controller pretend the committed write
    // was rolled back.
    if (!transactionCommitted) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error(
          "[website settings rollback]",
          rollbackErr?.message || rollbackErr,
        );
      }
    }

    // Clean the newly persisted asset only when its DB transaction did not
    // commit. If commit already succeeded, website_content now references it.
    if (!transactionCommitted && persistedLogo) {
      try {
        await cleanupPersistedSiteLogo(persistedLogo);
      } catch (cleanupErr) {
        console.error(
          "[website settings logo cleanup]",
          cleanupErr?.message || cleanupErr,
        );
      }
    }

    res.status(err.statusCode || err.status || 500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── FAQs ─────────────────────────────────────────────────────────────────────
// Public FAQ reader: hidden FAQ rows are not exposed to storefront clients.
// If the FAQ page itself is hidden, its Q&A content must not be exposed either.
exports.getFaqs = async (req, res) => {
  try {
    const [[faqPage]] = await pool.query(
      `SELECT is_visible
       FROM website_content
       WHERE content_type = 'page' AND content_key = 'faq'
       LIMIT 1`,
      [],
    );

    // FAQ page is hidden, so its Q&A content must not be exposed.
    if (!faqPage || Number(faqPage.is_visible) !== 1) {
      return res.json([]);
    }

    const [rows] = await pool.query(
      `SELECT id, question, answer, sort_order, is_visible
       FROM faqs
       WHERE is_visible = 1
       ORDER BY sort_order ASC, id ASC`,
      [],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin reader keeps hidden FAQ rows available for management.
exports.getAdminFaqs = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM faqs ORDER BY sort_order ASC, id ASC",
      [],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createFaq = async (req, res) => {
  try {
    const { question, answer, sort_order = 0, is_visible = true } = req.body;
    const [r] = await pool.query(
      "INSERT INTO faqs (question, answer, sort_order, is_visible, created_by) VALUES (?,?,?,?,?)",
      [question, answer, sort_order, is_visible ? 1 : 0, parseInt(req.user.id)],
    );

    req.auditRecord = {
      id: r.insertId,
      new: { is_visible: Boolean(is_visible) },
    };

    res.status(201).json({ message: "FAQ created.", id: r.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateFaq = async (req, res) => {
  try {
    const { question, answer, sort_order, is_visible } = req.body;
    const faqId = parseInt(req.params.id);

    const [[oldFaq]] = await pool.query(
      "SELECT question, answer, sort_order, is_visible FROM faqs WHERE id = ?",
      [faqId],
    );

    // ── FIXED: Parsed ID ──
    const [updateResult] = await pool.query(
      "UPDATE faqs SET question=?,answer=?,sort_order=?,is_visible=? WHERE id=?",
      [question, answer, sort_order, is_visible ? 1 : 0, faqId],
    );

    if (oldFaq && updateResult.affectedRows > 0) {
      req.auditRecord = {
        id: faqId,
        old: {
          is_visible: Boolean(oldFaq.is_visible),
          sort_order: oldFaq.sort_order ?? null,
        },
        new: {
          is_visible: Boolean(is_visible),
          sort_order: sort_order ?? null,
          question_changed: oldFaq.question !== question,
          answer_changed: oldFaq.answer !== answer,
        },
      };
    }

    res.json({ message: "FAQ updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteFaq = async (req, res) => {
  try {
    const faqId = parseInt(req.params.id);

    const [[oldFaq]] = await pool.query(
      "SELECT is_visible FROM faqs WHERE id = ?",
      [faqId],
    );

    // ── FIXED: Parsed ID ──
    const [deleteResult] = await pool.query("DELETE FROM faqs WHERE id = ?", [
      faqId,
    ]);

    if (oldFaq && deleteResult.affectedRows > 0) {
      req.auditRecord = {
        id: faqId,
        old: { is_visible: Boolean(oldFaq.is_visible) },
      };
    }

    res.json({ message: "FAQ deleted." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── STATIC PAGES ─────────────────────────────────────────────────────────────
// static_pages was merged into website_content. Static page rows are stored
// with content_type='page' and use content_key as the page slug.
// Public page list: hidden page content is not exposed, and internal
// editor/user metadata is deliberately omitted from storefront responses.
exports.getPages = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         id,
         content_key AS slug,
         title,
         content,
         is_visible,
         updated_at
       FROM website_content
       WHERE content_type = 'page'
         AND content_key IN (?, ?, ?)
         AND is_visible = 1
       ORDER BY FIELD(content_key, ?, ?, ?)`,
      [...KNOWN_PAGE_SLUGS, ...KNOWN_PAGE_SLUGS],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin page list keeps hidden content available for editing.
exports.getAdminPages = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         id,
         content_key AS slug,
         title,
         content,
         is_visible,
         updated_by,
         updated_at
       FROM website_content
       WHERE content_type = 'page'
         AND content_key IN (?, ?, ?)
       ORDER BY FIELD(content_key, ?, ?, ?)`,
      [...KNOWN_PAGE_SLUGS, ...KNOWN_PAGE_SLUGS],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPage = async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!KNOWN_PAGE_SLUGS.includes(slug)) {
      return res.status(404).json({ message: "Page not found." });
    }

    const [[page]] = await pool.query(
      `SELECT
         id,
         content_key AS slug,
         title,
         content,
         is_visible,
         updated_at
       FROM website_content
       WHERE content_type = 'page'
         AND content_key = ?
         AND is_visible = 1
       LIMIT 1`,
      [slug],
    );

    if (!page) return res.status(404).json({ message: "Page not found." });
    res.json(page);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updatePage = async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!KNOWN_PAGE_SLUGS.includes(slug)) {
      return res.status(404).json({ message: "Page not found." });
    }

    const nextTitle =
      req.body.title === null || req.body.title === undefined
        ? ""
        : String(req.body.title);
    const nextContent =
      req.body.content === null || req.body.content === undefined
        ? ""
        : String(req.body.content);
    const hasSubmittedVisibility = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "is_visible",
    );

    const [[oldPage]] = await pool.query(
      `SELECT id, title, content, is_visible
       FROM website_content
       WHERE content_type = 'page' AND content_key = ?
       LIMIT 1`,
      [slug],
    );

    const submittedVisible = req.body.is_visible;
    let nextVisible;

    if (hasSubmittedVisibility) {
      nextVisible =
        submittedVisible === true ||
        submittedVisible === 1 ||
        submittedVisible === "1" ||
        submittedVisible === "true"
          ? 1
          : 0;
    } else {
      nextVisible = oldPage
        ? Number(oldPage.is_visible) === 1
          ? 1
          : 0
        : 1;
    }

    const isNew = !oldPage;
    const titleChanged = isNew || String(oldPage.title ?? "") !== nextTitle;
    const contentChanged =
      isNew || String(oldPage.content ?? "") !== nextContent;
    const visibilityChanged =
      isNew || Number(oldPage.is_visible) !== nextVisible;

    if (!isNew && !titleChanged && !contentChanged && !visibilityChanged) {
      return res.json({ message: "Page updated." });
    }

    const [upsertResult] = await pool.query(
      `INSERT INTO website_content
         (content_key, content_type, title, content, group_name, is_visible, updated_by)
       VALUES
         (?, 'page', ?, ?, NULL, ?, ?)
       ON DUPLICATE KEY UPDATE
         content_type = 'page',
         title = VALUES(title),
         content = VALUES(content),
         group_name = NULL,
         is_visible = VALUES(is_visible),
         updated_by = VALUES(updated_by)`,
      [slug, nextTitle, nextContent, nextVisible, parseInt(req.user.id)],
    );

    req.auditRecord = {
      id: oldPage?.id || upsertResult.insertId || null,
      old: {
        is_visible: isNew ? null : Boolean(oldPage.is_visible),
      },
      new: {
        page_slug: slug,
        title_changed: titleChanged,
        content_changed: contentChanged,
        is_visible: Boolean(nextVisible),
        page_created: isNew,
      },
    };

    res.json({ message: "Page updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── BACKUP ───────────────────────────────────────────────────────────────────
async function generateSQLDump(filePath) {
  const conn = await pool.getConnection();
  const lines = [];

  lines.push("-- WISDOM Database Backup");
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Database: ${process.env.DB_NAME || "wisdom_db"}`);
  lines.push("");
  lines.push("SET FOREIGN_KEY_CHECKS=0;");
  lines.push('SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";');
  lines.push("");

  try {
    // Get all tables
    const [tables] = await conn.query("SHOW TABLES", []);
    const tableNames = tables.map((t) => Object.values(t)[0]);

    for (const table of tableNames) {
      // DROP + CREATE TABLE
      const [[createRow]] = await conn.query(
        `SHOW CREATE TABLE \`${table}\``,
        [],
      );
      const createSQL = createRow["Create Table"];
      lines.push(`-- Table: ${table}`);
      lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
      lines.push(createSQL + ";");
      lines.push("");

      // Row data
      const [rows] = await conn.query(`SELECT * FROM \`${table}\``, []);
      if (rows.length > 0) {
        const cols = Object.keys(rows[0])
          .map((c) => `\`${c}\``)
          .join(", ");
        const chunkSize = 100;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const values = chunk
            .map(
              (row) =>
                "(" +
                Object.values(row)
                  .map((v) => {
                    if (v === null) return "NULL";
                    if (typeof v === "number") return v;
                    if (v instanceof Date)
                      return `'${v.toISOString().slice(0, 19).replace("T", " ")}'`;
                    return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
                  })
                  .join(", ") +
                ")",
            )
            .join(",\n");
          lines.push(`INSERT INTO \`${table}\` (${cols}) VALUES`);
          lines.push(values + ";");
        }
        lines.push("");
      }
    }

    lines.push("SET FOREIGN_KEY_CHECKS=1;");
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  } finally {
    conn.release();
  }
}

exports.getBackupLogs = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT bl.*, u.name AS triggered_by_name,
              bl.storage_path AS file_url 
       FROM backup_logs bl
       LEFT JOIN users u ON u.id = bl.triggered_by
       ORDER BY bl.created_at DESC LIMIT 50`,
      [],
    );
    const normalized = rows.map((r) => ({
      ...r,
      filename: r.file_name,
      file_size: r.file_size_kb,
      file_url: `/backup/download/${r.file_name}`,
      triggered_by: r.triggered_by_name || "System",
    }));
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.triggerManualBackup = async (req, res) => {
  try {
    const backupDir =
      process.env.BACKUP_DIR || path.join(__dirname, "../../backups");
    const absDir = path.isAbsolute(backupDir)
      ? backupDir
      : path.join(__dirname, "../../", backupDir);

    if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `wisdom_backup_manual_${timestamp}.sql`;
    const filePath = path.join(absDir, fileName);

    // 👉 This is the variable that went missing!
    let backupError = null;
    let sizeKb = 0;

    try {
      await generateSQLDump(filePath);
      sizeKb = fs.existsSync(filePath)
        ? Math.round(fs.statSync(filePath).size / 1024)
        : 0;
    } catch (e) {
      backupError = e.message;
    }

    const status = backupError ? "failed" : "success";

    const [backupLogResult] = await pool.query(
      `INSERT INTO backup_logs (type, triggered_by, file_name, file_size_kb, storage_path, status, notes)
       VALUES ('manual', ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(req.user.id),
        fileName,
        sizeKb,
        filePath,
        status,
        backupError || null,
      ],
    );

    if (backupError) {
      await writeAuditLogSafe({
        userId: req.user.id,
        action: "manual_backup_failed",
        tableName: "backup_logs",
        recordId: backupLogResult.insertId,
        newValues: {
          file_name: fileName,
          file_size_kb: sizeKb,
          result: "failed",
        },
        ipAddress: req.ip || null,
      });

      return res.status(500).json({ message: "Backup failed: " + backupError });
    }

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "manual_backup_created",
      tableName: "backup_logs",
      recordId: backupLogResult.insertId,
      newValues: {
        file_name: fileName,
        file_size_kb: sizeKb,
        result: "success",
      },
      ipAddress: req.ip || null,
    });

    res.json({
      message: "Backup completed successfully.",
      file: fileName,
      size_kb: sizeKb,
      file_url: `/backup/download/${fileName}`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── DOWNLOAD a specific backup file (admin-only, filename strictly validated) ─
const BACKUP_FILENAME_RE = /^[A-Za-z0-9_-]+\.sql$/;

exports.downloadBackup = async (req, res) => {
  try {
    const filename = String(req.params.filename || "");

    if (!BACKUP_FILENAME_RE.test(filename)) {
      return res.status(400).json({ message: "Invalid backup filename." });
    }

    const backupDir =
      process.env.BACKUP_DIR || path.join(__dirname, "../../backups");
    const absDir = path.isAbsolute(backupDir)
      ? backupDir
      : path.join(__dirname, "../../", backupDir);

    const filePath = path.join(absDir, filename);

    // Defense in depth: resolved file must still live directly inside absDir.
    if (path.dirname(filePath) !== absDir) {
      return res.status(400).json({ message: "Invalid backup filename." });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Backup file not found." });
    }

    const [[backupRow]] = await pool.query(
      `SELECT id FROM backup_logs WHERE file_name = ? ORDER BY id DESC LIMIT 1`,
      [filename],
    );

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "backup_downloaded",
      tableName: "backup_logs",
      recordId: backupRow?.id || null,
      newValues: { file_name: filename, result: "download_started" },
      ipAddress: req.ip || null,
    });

    res.download(filePath, filename);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
