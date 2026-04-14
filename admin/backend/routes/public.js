// routes/public.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");

/* ── Public: Get Website Settings (For Home Page) ── */
router.get("/settings", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT setting_key, setting_value FROM website_settings",
    );
    const settings = {};
    rows.forEach((r) => {
      settings[r.setting_key] = r.setting_value;
    });
    res.json(settings);
  } catch (err) {
    console.error("[Public Settings Error]:", err);
    res.status(500).json({ message: "Server error" });
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
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
