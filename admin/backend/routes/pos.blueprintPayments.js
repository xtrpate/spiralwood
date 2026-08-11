const express = require("express");
const router = express.Router();

const { authenticate, requireCashierOrAdmin } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const controller = require("../controllers/staff/pos.blueprintPayments");

router.get(
  "/",
  authenticate,
  requireCashierOrAdmin,
  controller.listOrders,
);

router.get(
  "/lookup",
  authenticate,
  requireCashierOrAdmin,
  controller.lookupByOrderNumber,
);

router.post(
  "/:id",
  authenticate,
  requireCashierOrAdmin,
  logAction("record_blueprint_cash_payment", "payment_transactions"),
  controller.recordPayment,
);

module.exports = router;