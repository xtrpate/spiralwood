// routes/pos.qrPayments.js
const express = require("express");
const router = express.Router();

const { authenticate, requireCashierOrAdmin } = require("../middleware/auth");

const posQrPaymentsController = require("../controllers/staff/pos.qrPayments");

/* ── Route-level feature flag — must run BEFORE authenticate, so a
   disabled/misconfigured deployment never queries the users table (or
   opens any DB connection at all) for this endpoint.
   isPosQrTestSafeConfigured() (exported from the controller, single
   source of truth) requires ALL of: POS_QR_ENABLED === "true", a
   non-empty PAYMONGO_SECRET_KEY that starts with "sk_test_" (never
   sk_live_ in Phase 3B), and a valid configured FRONTEND_URL. The
   controller also keeps its own defensive second check of the exact
   same gate. Never returns or logs the actual key value. ── */
const requirePosQrEnabled = (req, res, next) => {
  if (!posQrPaymentsController.isPosQrTestSafeConfigured()) {
    return res.status(503).json({
      message: "Online payment (QR Ph) is not yet available at this terminal.",
    });
  }
  next();
};

const posAccess = [requirePosQrEnabled, authenticate, requireCashierOrAdmin];

/* ══════════════════════════════════════════════════════════════
   CASHIER POS — QR / ONLINE PAYMENT ATTEMPTS
   Phase 3B backend foundation only. No unauthenticated route is
   exposed here — requirePosQrEnabled only short-circuits BEFORE
   authentication when the feature is disabled/misconfigured; it never
   bypasses authentication when the feature is properly enabled.
══════════════════════════════════════════════════════════════ */

router.post("/attempts", posAccess, posQrPaymentsController.createAttempt);

module.exports = router;