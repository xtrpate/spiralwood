const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/admin/reportsController");
const { authenticate, authorize } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permission");

// Use your system's correct admin/staff authorization
const adminStaff = [authenticate, authorize("admin", "staff")];

// GET /api/reports/sales-profitability/export
router.get(
  "/sales-profitability/export",
  adminStaff,
  requirePermission("sales_report.export"),
  reportsController.getSalesProfitabilityReport,
);

// GET /api/reports/sales-profitability
router.get(
  "/sales-profitability",
  adminStaff,
  requirePermission("sales_report.view"),
  reportsController.getSalesProfitabilityReport,
);

module.exports = router;
