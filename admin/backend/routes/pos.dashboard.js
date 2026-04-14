const express = require("express");
const router = express.Router();

const { authenticate, authorize } = require("../middleware/auth");
const posDashboardController = require("../controllers/staff/pos.dashboard");

/* ══════════════════════════════════════════════════════════════
   STAFF/POS DASHBOARD ROUTES
══════════════════════════════════════════════════════════════ */

router.get(
  "/",
  authenticate,
  authorize("admin", "staff"),
  posDashboardController.getDashboardMetrics
);

module.exports = router;