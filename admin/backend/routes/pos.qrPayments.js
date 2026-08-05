// routes/pos.qrPayments.js
const express = require("express");
const router = express.Router();

const {
  authenticate,
  requireCashierOrAdmin,
  authorize,
} = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");

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

/* ═════════════════════════════════════════════════════════════
   PHASE 3D-F1 — CASHIER RESUME / LOCAL-STATE RECONCILIATION
   Read-only and intentionally not gated by requirePosQrEnabled. This
   allows an authenticated cashier/admin to reconcile stale browser
   state even while creation of new QR attempts is disabled.
════════════════════════════════════════════════════════════ */
const resumeAccess = [authenticate, requireCashierOrAdmin];

router.post(
  "/attempts/resume",
  resumeAccess,
  posQrPaymentsController.resumeAttempt,
);

/* ══════════════════════════════════════════════════════════════
   PHASE 3D-A — VERIFY PAYMENT ATTEMPT
   Same posAccess guard chain (requirePosQrEnabled runs BEFORE
   authenticate, exactly as above). logAction runs after the
   controller — it only writes a row when the controller has set
   req.auditRecord, which happens ONLY after a successful commit that
   freshly finalizes an attempt (never on an idempotent replay of an
   already-consumed attempt, and never on a rejected/pending/error
   response).
══════════════════════════════════════════════════════════════ */

router.post(
  "/attempts/:id/verify",
  posAccess,
  logAction("verify_pos_qr_payment", "orders"),
  posQrPaymentsController.verifyAttempt,
);

/* ══════════════════════════════════════════════════════════════
   PHASE 3D-E — ADMIN RECOVERY READ ENDPOINTS
   Admin-only, but intentionally not behind the recovery action gate.
   This keeps unresolved attempts visible while mutating recovery
   actions are disabled.
══════════════════════════════════════════════════════════════ */
const recoveryReadAccess = [authenticate, authorize("admin")];

router.get(
  "/recovery/attempts",
  recoveryReadAccess,
  posQrPaymentsController.listRecoveryAttempts,
);

router.get(
  "/recovery/attempts/:id",
  recoveryReadAccess,
  posQrPaymentsController.getRecoveryAttempt,
);

/* ══════════════════════════════════════════════════════════════
   PHASE 3D-D3 — ADMIN RECOVERY: PROVIDER-UNKNOWN ATTEMPTS
   Independent feature gate (requirePosQrRecoveryEnabled), also BEFORE
   authenticate — a disabled/misconfigured recovery deployment never
   queries the users table for these routes either. Admin-only via
   authorize("admin") (reused directly from middleware/auth.js — no
   change to that file). Never gated by requirePosQrEnabled: normal
   cashier QR checkout may be intentionally disabled while stuck
   provider_unknown attempts from before the pause still need recovery.
══════════════════════════════════════════════════════════════ */
const requirePosQrRecoveryEnabled = (req, res, next) => {
  if (!posQrPaymentsController.isPosQrRecoveryEnabled()) {
    return res.status(403).json({
      message: "Recovery actions are not enabled.",
    });
  }
  next();
};

const recoveryAccess = [
  requirePosQrRecoveryEnabled,
  authenticate,
  authorize("admin"),
];

router.post(
  "/attempts/:id/attach-session",
  recoveryAccess,
  logAction("attach_pos_qr_provider_session", "pos_qr_payment_attempts"),
  posQrPaymentsController.attachProviderSession,
);

/* manual-release/request performs NO database write (see controller),
   so it deliberately has no logAction — there is nothing to audit yet;
   the token it returns is the only artifact of this call. */
router.post(
  "/attempts/:id/manual-release/request",
  recoveryAccess,
  posQrPaymentsController.requestManualRelease,
);

router.post(
  "/attempts/:id/manual-release/confirm",
  recoveryAccess,
  logAction("admin_manual_release_pos_qr_attempt", "pos_qr_payment_attempts"),
  posQrPaymentsController.confirmManualRelease,
);

/* recovery-verify — admin-only, ownership-free equivalent of
   /attempts/:id/verify, usable independently of POS_QR_ENABLED. logAction
   runs after the controller, exactly like the cashier verify route above;
   it only writes when the controller sets req.auditRecord, which happens
   ONLY on a freshly-completed finalization (never on a pending result,
   and never on an idempotent consumed replay). */
router.post(
  "/attempts/:id/recovery-verify",
  recoveryAccess,
  logAction("recovery_verify_pos_qr_payment", "orders"),
  posQrPaymentsController.recoveryVerifyAttempt,
);

/* Safe cancellation for an attached awaiting_payment attempt. The
   controller re-verifies PayMongo, expires a still-pending Checkout
   Session, and releases stock only after expired_unpaid is confirmed. */
router.post(
  "/attempts/:id/cancel-unpaid",
  recoveryAccess,
  logAction(
    "admin_resolve_unpaid_pos_qr_attempt",
    "pos_qr_payment_attempts",
  ),
  posQrPaymentsController.cancelUnpaidAttempt,
);

module.exports = router;
