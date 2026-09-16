const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/admin/reportsController");
const { authenticate, authorize } = require("../middleware/auth");

// Use your system's correct admin/staff authorization
const adminStaff = [authenticate, authorize("admin", "staff")];

// GET /api/reports/sales-profitability
router.get(
  "/sales-profitability",
  adminStaff,
  reportsController.getSalesProfitabilityReport,
);

module.exports = router;
