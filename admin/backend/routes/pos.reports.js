// routes/pos.reports.js
const express = require("express");
const router = express.Router();

// 1. Import your auth middleware
const { authenticate, authorize } = require("../middleware/auth");

// 2. Import the controller we updated in the last step
const posReportsController = require("../controllers/staff/pos.reports");

// 3. Define the access level
const posAccess = [authenticate, authorize("admin", "staff")];

/* ══════════════════════════════════════════════════════════════
   STAFF/POS REPORTS ROUTES
══════════════════════════════════════════════════════════════ */
// This tells the route to let the controller handle the logic!
router.get("/", posAccess, posReportsController.getReports);

module.exports = router;
