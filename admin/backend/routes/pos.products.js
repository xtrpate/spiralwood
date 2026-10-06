// routes/pos.products.js
const express = require("express");
const router = express.Router();
const {
  authenticate,
  requireStaffOrAdmin,
  requireIndoorStaffOrAdmin,
} = require("../middleware/auth");
const posProductController = require("../controllers/staff/pos.products");

const posAccess = [authenticate, requireStaffOrAdmin];
const inventoryLookupAccess = [authenticate, requireIndoorStaffOrAdmin];

/* ══════════════════════════════════════════════════════════════
   STAFF/POS PRODUCTS ROUTES
══════════════════════════════════════════════════════════════ */

// NOTE: /all must come before / to avoid route conflicts if / ever takes params
router.get("/all", inventoryLookupAccess, posProductController.getAllInventory);
router.get("/", posAccess, posProductController.searchProducts);

module.exports = router;
