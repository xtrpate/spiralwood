const db = require("../config/db");
const {
  retrieveCheckoutSession,
  expireCheckoutSession,
} = require("./paymongoService");
const {
  analyzeCheckoutSession,
  finalizePaidAttempt,
  getSnapshotTotalCents,
  markAttemptProviderUnknown,
  markExpireRequested,
  releaseExpiredAttempt,
} = require("./posQrLifecycleService");

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_STALE_CREATING_SECONDS = 120;
const DEFAULT_EXPIRE_CONFIRMATION_GRACE_SECONDS = 60;
let cleanupRunning = false;

const boundedInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const getConfig = () => ({
  batchSize: boundedInt(
    process.env.POS_QR_CLEANUP_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    1,
    100,
  ),
  staleCreatingSeconds: boundedInt(
    process.env.POS_QR_CREATING_STALE_SECONDS,
    DEFAULT_STALE_CREATING_SECONDS,
    60,
    1800,
  ),
  confirmationGraceSeconds: boundedInt(
    process.env.POS_QR_EXPIRE_CONFIRMATION_GRACE_SECONDS,
    DEFAULT_EXPIRE_CONFIRMATION_GRACE_SECONDS,
    30,
    600,
  ),
  providerTimeoutMs: boundedInt(
    process.env.POS_QR_PROVIDER_TIMEOUT_MS,
    15000,
    5000,
    30000,
  ),
});

const isPosQrCleanupTestSafeConfigured = () => {
  if (process.env.POS_QR_CLEANUP_ENABLED !== "true") return false;
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  return (
    typeof secretKey === "string" &&
    secretKey.length > 0 &&
    secretKey.startsWith("sk_test_")
  );
};

const writeSystemAudit = async ({ action, attemptId, oldValues, newValues }) => {
  try {
    await db.query(
      `INSERT INTO audit_logs
        (user_id, action, table_name, record_id, old_values, new_values, ip_address)
       VALUES (NULL, ?, 'pos_qr_payment_attempts', ?, ?, ?, NULL)`,
      [
        action,
        attemptId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
      ],
    );
  } catch (err) {
    console.error("[POS QR CLEANUP audit]", err.message);
  }
};

const processExpiredReservedAttempt = async (attemptId, stats) => {
  const released = await releaseExpiredAttempt({
    attemptId,
    allowedStatuses: ["reserved"],
  });

  if (!released.changed) {
    stats.skipped += 1;
    if (released.reason === "error") stats.errors += 1;
    return;
  }

  stats.expired += 1;
  stats.reservationsReleased += released.releasedCount;
  await writeSystemAudit({
    action: "expire_pos_qr_payment_attempt",
    attemptId,
    oldValues: { status: released.oldStatus },
    newValues: {
      status: "expired",
      provider_status: "not_created",
      reservations_released: released.releasedCount,
    },
  });
};

const processExpiredAwaitingAttempt = async (attemptId, config, stats) => {
  const [[attempt]] = await db.query(
    `SELECT id, status, cashier_id, provider_session_id, checkout_snapshot,
            failure_code, updated_at, expires_at
     FROM pos_qr_payment_attempts
     WHERE id = ?`,
    [attemptId],
  );

  if (
    !attempt ||
    attempt.status !== "awaiting_payment" ||
    !attempt.provider_session_id
  ) {
    stats.skipped += 1;
    return;
  }

  const expectedTotalCents = getSnapshotTotalCents(attempt.checkout_snapshot);
  if (!expectedTotalCents) {
    stats.manualReview += 1;
    console.error("[POS QR CLEANUP] Invalid checkout snapshot", { attemptId });
    return;
  }

  let session;
  try {
    session = await retrieveCheckoutSession(attempt.provider_session_id, {
      timeoutMs: config.providerTimeoutMs,
    });
  } catch (err) {
    stats.providerErrors += 1;
    console.error("[POS QR CLEANUP] Provider retrieval failed", {
      attemptId,
      providerStatus: err?.response?.status || null,
      code: err?.code || null,
    });
    return;
  }

  const analysis = analyzeCheckoutSession({
    session,
    expectedSessionId: attempt.provider_session_id,
    expectedTotalCents,
  });

  if (analysis.kind === "paid") {
    const finalized = await finalizePaidAttempt({
      attemptId,
      matchedPayment: analysis.payment,
      actorUserId: attempt.cashier_id,
      requireOwner: false,
    });

    if (finalized.httpStatus === 200) {
      stats.finalized += finalized.freshCommit ? 1 : 0;
      stats.skipped += finalized.freshCommit ? 0 : 1;
      if (finalized.freshCommit) {
        await writeSystemAudit({
          action: "recover_pos_qr_paid_attempt",
          attemptId,
          oldValues: { status: "awaiting_payment" },
          newValues: {
            status: "consumed",
            order_id: finalized.payload.order_id,
            payment_transaction_id:
              finalized.payload.payment_transaction_id,
            receipt_id: finalized.payload.receipt_id,
          },
        });
      }
      return;
    }

    stats.errors += 1;
    console.error("[POS QR CLEANUP] Paid finalization failed", {
      attemptId,
      httpStatus: finalized.httpStatus,
      status: finalized.payload?.status || null,
    });
    return;
  }

  if (
    analysis.kind === "payment_mismatch" ||
    analysis.kind === "ambiguous_payment" ||
    analysis.kind === "malformed"
  ) {
    stats.manualReview += 1;
    console.error("[POS QR CLEANUP] Manual review required", {
      attemptId,
      result: analysis.kind,
      code: analysis.code || null,
    });
    return;
  }

  if (analysis.kind === "pending") {
    try {
      await expireCheckoutSession(attempt.provider_session_id, {
        timeoutMs: config.providerTimeoutMs,
      });
      await markExpireRequested({
        attemptId,
        providerSessionId: attempt.provider_session_id,
      });
      stats.expireRequested += 1;
    } catch (err) {
      stats.providerErrors += 1;
      console.error("[POS QR CLEANUP] Provider expiration failed", {
        attemptId,
        providerStatus: err?.response?.status || null,
        code: err?.code || null,
      });
    }
    return;
  }

  if (analysis.kind !== "expired_unpaid") {
    stats.manualReview += 1;
    return;
  }

  const updatedAtMs = new Date(attempt.updated_at).getTime();
  const graceElapsed =
    Number.isFinite(updatedAtMs) &&
    Date.now() - updatedAtMs >= config.confirmationGraceSeconds * 1000;

  if (attempt.failure_code !== "cleanup_expire_requested") {
    await markExpireRequested({
      attemptId,
      providerSessionId: attempt.provider_session_id,
    });
    stats.confirmationWaiting += 1;
    return;
  }

  if (!graceElapsed) {
    stats.confirmationWaiting += 1;
    return;
  }

  const released = await releaseExpiredAttempt({
    attemptId,
    allowedStatuses: ["awaiting_payment"],
    expectedProviderSessionId: attempt.provider_session_id,
  });

  if (!released.changed) {
    stats.skipped += 1;
    if (released.reason === "error") stats.errors += 1;
    return;
  }

  stats.expired += 1;
  stats.reservationsReleased += released.releasedCount;
  await writeSystemAudit({
    action: "expire_pos_qr_payment_attempt",
    attemptId,
    oldValues: { status: released.oldStatus },
    newValues: {
      status: "expired",
      provider_status: "expired",
      reservations_released: released.releasedCount,
    },
  });
};

const processStaleCreatingAttempt = async (attemptId, stats) => {
  const changed = await markAttemptProviderUnknown({
    attemptId,
    failureCode: "stale_creating_session",
    failureMessage:
      "Provider session creation result is unresolved; manual reconciliation required.",
  });

  if (!changed) {
    stats.skipped += 1;
    return;
  }

  stats.providerUnknown += 1;
  await writeSystemAudit({
    action: "mark_pos_qr_provider_unknown",
    attemptId,
    oldValues: { status: "creating_session" },
    newValues: {
      status: "provider_unknown",
      reservations_released: 0,
    },
  });
};

const runPosQrCleanupBatch = async () => {
  if (!isPosQrCleanupTestSafeConfigured()) {
    return { skipped: true, reason: "disabled_or_not_test_safe" };
  }
  if (cleanupRunning) return { skipped: true, reason: "already_running" };

  cleanupRunning = true;
  const config = getConfig();
  const stats = {
    skipped: 0,
    expired: 0,
    finalized: 0,
    expireRequested: 0,
    confirmationWaiting: 0,
    providerUnknown: 0,
    reservationsReleased: 0,
    providerErrors: 0,
    manualReview: 0,
    errors: 0,
  };

  try {
    const [reservedRows] = await db.query(
      `SELECT id
       FROM pos_qr_payment_attempts
       WHERE status = 'reserved' AND expires_at <= NOW()
       ORDER BY expires_at ASC, id ASC
       LIMIT ?`,
      [config.batchSize],
    );
    for (const row of reservedRows) {
      await processExpiredReservedAttempt(row.id, stats);
    }

    const [awaitingRows] = await db.query(
      `SELECT id
       FROM pos_qr_payment_attempts
       WHERE status = 'awaiting_payment' AND expires_at <= NOW()
       ORDER BY expires_at ASC, id ASC
       LIMIT ?`,
      [config.batchSize],
    );
    for (const row of awaitingRows) {
      await processExpiredAwaitingAttempt(row.id, config, stats);
    }

    const [staleRows] = await db.query(
      `SELECT id
       FROM pos_qr_payment_attempts
       WHERE status = 'creating_session'
         AND provider_call_started_at IS NOT NULL
         AND TIMESTAMPDIFF(SECOND, provider_call_started_at, NOW()) >= ?
       ORDER BY provider_call_started_at ASC, id ASC
       LIMIT ?`,
      [config.staleCreatingSeconds, config.batchSize],
    );
    for (const row of staleRows) {
      await processStaleCreatingAttempt(row.id, stats);
    }

    if (
      stats.expired ||
      stats.finalized ||
      stats.expireRequested ||
      stats.providerUnknown ||
      stats.errors ||
      stats.manualReview
    ) {
      console.log("[POS QR CLEANUP]", stats);
    }

    return { skipped: false, stats };
  } catch (err) {
    console.error("[POS QR CLEANUP] Batch failed", err);
    return { skipped: false, error: true, stats };
  } finally {
    cleanupRunning = false;
  }
};

module.exports = {
  isPosQrCleanupTestSafeConfigured,
  runPosQrCleanupBatch,
};
