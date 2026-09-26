// routes/public.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");

const PUBLIC_SETTING_KEYS = [
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
];

const PUBLIC_PAGE_VISIBILITY_KEYS = {
  about_us: "show_about_section",
  contact: "show_contact_section",
  faq: "show_faq_section",
};

/* ── Public: Get Website Settings (For Home Page) ── */
router.get("/settings", async (req, res) => {
  try {
    // Legacy flat endpoint kept for compatibility, but it now uses an
    // explicit public allow-list instead of returning every admin setting.
    const placeholders = PUBLIC_SETTING_KEYS.map(() => "?").join(", ");

    const [rows] = await db.execute(
      `SELECT
         content_key AS setting_key,
         content AS setting_value
       FROM website_content
       WHERE content_type = 'setting'
         AND content_key IN (${placeholders})
       ORDER BY content_key`,
      PUBLIC_SETTING_KEYS,
    );

    const [pageRows] = await db.execute(
      `SELECT content_key AS slug, is_visible
       FROM website_content
       WHERE content_type = 'page'
         AND content_key IN ('about_us', 'contact', 'faq')`,
    );

    const settings = {};

    rows.forEach((row) => {
      settings[row.setting_key] = row.setting_value;
    });

    pageRows.forEach((row) => {
      const settingKey = PUBLIC_PAGE_VISIBILITY_KEYS[row.slug];
      if (settingKey) {
        settings[settingKey] = Number(row.is_visible) === 1 ? "true" : "false";
      }
    });

    res.json(settings);
  } catch (err) {
    console.error("[Public Settings Error]:", err);
    res.status(500).json({
      message: "Unable to load website settings.",
    });
  }
});

/* ── Public: Get FAQs ── */
router.get("/faqs", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM faqs ORDER BY created_at DESC",
    );

    res.json(rows);
  } catch (err) {
    console.error("[Public FAQs Error]:", err);
    res.status(500).json({
      message: "Unable to load FAQs.",
    });
  }
});

module.exports = router;
