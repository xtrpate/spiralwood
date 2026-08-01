const express = require("express");
const router = express.Router();

const {
  authenticate,
  requireCashierOrAdmin,
} = require("../middleware/auth");

const posReceiptsController = require("../controllers/staff/pos.receipts");

const posAccess = [authenticate, requireCashierOrAdmin];

/* ══════════════════════════════════════════════════════════════
   CASHIER / POS RECEIPTS
══════════════════════════════════════════════════════════════ */

router.get("/receipts", posAccess, posReceiptsController.getReceiptByOrderId);
router.get("/receipts/:id", posAccess, posReceiptsController.getReceiptById);

/* ══════════════════════════════════════════════════════════════
   STAFF BLUEPRINT PAYMENT RECEIPTS
══════════════════════════════════════════════════════════════ */

router.get(
  "/blueprint-receipts/:id",
  posAccess,
  posReceiptsController.getBlueprintReceiptById,
);

module.exports = router;