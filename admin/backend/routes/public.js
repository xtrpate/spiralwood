// routes/public.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");

/* ── Public: Get Website Settings (For Home Page) ── */
router.get("/settings", async (req, res) => {
  try {
    // website_settings was merged into website_content.
    // Preserve the original public API response shape:
    // { site_name: "...", business_address: "...", ... }
    const [rows] = await db.execute(
      `SELECT
         content_key AS setting_key,
         content AS setting_value
       FROM website_content
       WHERE content_type = 'setting'
       ORDER BY content_key`,
    );

    const settings = {};

    rows.forEach((row) => {
      settings[row.setting_key] = row.setting_value;
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
