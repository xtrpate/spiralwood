// services/cronService.js – Automated backup cron (12:00 AM and 12:00 PM daily)
const cron = require("node-cron");
const pool = require("../config/db");
const { runDatabaseBackup } = require("./databaseBackupService");
const { isDatabaseRestoreInProgress } = require("./databaseRestoreService");
const { runPosQrCleanupBatch } = require("./posQrCleanupService");
const {
  cleanupUnverifiedCustomers,
} = require("./unverifiedCustomerCleanupService");
const {
  sendCustomerAppointmentNotificationSafe,
} = require("./customerAppointmentNotificationService");
const { writeAuditLogSafe } = require("../middleware/auditLog");

const APPOINTMENT_AUTO_CANCEL_AFTER_MINUTES = 30;

const APPOINTMENT_AUTO_CANCEL_STATUSES = new Set([
  "confirmed",
  "awaiting_staff_acceptance",
]);

const getPhilippineWallClock = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
};

const runAppointmentAutoCancellation = async ({ io = null } = {}) => {
  if (isDatabaseRestoreInProgress()) {
    console.log(
      "[CRON] Skipping appointment auto-cancellation during database restore.",
    );

    return {
      scanned: 0,
      cancelled: 0,
      skipped: true,
    };
  }

  /*
   * Business rule:
   *
   * An appointment becomes eligible for automatic cancellation
   * 30 minutes after its scheduled appointment time.
   *
   * All appointment wall-clock calculations use Asia/Manila.
   */
  const cutoffDate = new Date(
    Date.now() - APPOINTMENT_AUTO_CANCEL_AFTER_MINUTES * 60 * 1000,
  );

  const cutoffWallClock = getPhilippineWallClock(cutoffDate);

  const [candidates] = await pool.query(
    `
      SELECT
        id,
        customer_id,
        assigned_staff_id,
        scheduled_date,
        status
      FROM appointments
      WHERE status IN ('confirmed', 'awaiting_staff_acceptance')
        AND scheduled_date <= ?
      ORDER BY scheduled_date ASC, id ASC
      LIMIT 100
    `,
    [cutoffWallClock],
  );

  if (candidates.length === 0) {
    console.log(
      "[CRON] Appointment auto-cancellation check: no eligible appointments.",
    );

    return {
      scanned: 0,
      cancelled: 0,
      skipped: false,
    };
  }

  let cancelled = 0;

  for (const candidate of candidates) {
    const candidateStatus = String(candidate.status || "")
      .trim()
      .toLowerCase();

    if (!APPOINTMENT_AUTO_CANCEL_STATUSES.has(candidateStatus)) {
      continue;
    }

    /*
     * Atomic/idempotent status transition.
     *
     * If an admin/staff member changes the appointment between the
     * SELECT above and this UPDATE, affectedRows will be 0 and the
     * automatic cancellation will not overwrite the newer state.
     */
    const [result] = await pool.query(
      `
        UPDATE appointments
        SET
          status = 'cancelled',
          updated_at = NOW()
        WHERE id = ?
          AND status = ?
          AND scheduled_date <= ?
      `,
      [candidate.id, candidate.status, cutoffWallClock],
    );

    if (result.affectedRows !== 1) {
      continue;
    }

    cancelled += 1;

    const appointmentId = Number(candidate.id);

    /*
     * System audit record.
     */
    await writeAuditLogSafe({
      action: "auto_cancel_appointment",
      tableName: "appointments",
      recordId: appointmentId,
      oldValues: {
        status: candidateStatus,
        scheduled_date: candidate.scheduled_date || null,
      },
      newValues: {
        status: "cancelled",
        cancellation_type: "automatic",
        cancellation_reason:
          "Appointment remained active more than 30 minutes after its scheduled time.",
      },
      actorType: "system",
    });

    /*
     * Update connected customer/admin/staff clients immediately.
     */
    if (io) {
      const socketPayload = {
        appointment_id: appointmentId,
        customer_id: candidate.customer_id
          ? Number(candidate.customer_id)
          : null,
        assigned_staff_id: candidate.assigned_staff_id
          ? Number(candidate.assigned_staff_id)
          : null,
        status: "cancelled",
        scheduled_date: candidate.scheduled_date || null,
        updated_at: new Date().toISOString(),
      };

      try {
        if (socketPayload.customer_id) {
          io.to(`user:${socketPayload.customer_id}`).emit(
            "appointment:updated",
            socketPayload,
          );
        }

        io.to("staff-updates").emit("appointment:updated", socketPayload);
      } catch (socketError) {
        console.error(
          "[CRON] Appointment auto-cancellation socket update failed:",
          socketError?.message || socketError,
        );
      }
    }

    /*
     * Reuse the existing appointment cancellation
     * email/SMS notification system.
     */
    await sendCustomerAppointmentNotificationSafe(pool, {
      appointmentId,
      event: "cancelled",
    });
  }

  console.log(
    `[CRON] Appointment auto-cancellation check: scanned=${candidates.length}, cancelled=${cancelled}, cutoff=${cutoffWallClock} Asia/Manila.`,
  );

  return {
    scanned: candidates.length,
    cancelled,
    skipped: false,
  };
};

async function runBackup(type = "auto") {
  return runDatabaseBackup({ type });
}

async function runScheduledAutoBackup(label) {
  if (isDatabaseRestoreInProgress()) {
    console.log(
      `[BACKUP] ${label} auto-backup skipped: database restore is in progress.`,
    );
    return;
  }

  try {
    const result = await runBackup("auto");

    if (result?.skipped) {
      console.log(
        `[BACKUP] ${label} auto-backup skipped: a backup for this schedule window already exists.`,
      );
      return;
    }

    if (result?.status === "failed") {
      console.error(
        `[BACKUP] ${label} auto-backup FAILED:`,
        result.error || "Unknown backup error.",
      );
      return;
    }

    console.log(
      `[BACKUP] ${label} auto-backup SUCCESS: ${result.fileName} (${result.sizeKb} KB)`,
    );
  } catch (error) {
    if (error?.code === "BACKUP_IN_PROGRESS") {
      console.log(
        `[BACKUP] ${label} auto-backup skipped: another backup is already in progress.`,
      );
      return;
    }

    console.error(
      `[BACKUP] ${label} auto-backup FAILED:`,
      error?.message || error,
    );
  }
}

function startCronJobs(io = null) {
  cron.schedule(
    "0 0 * * *",
    () => {
      console.log("[CRON] Running midnight auto-backup...");
      void runScheduledAutoBackup("Midnight");
    },
    { timezone: "Asia/Manila" },
  );

  cron.schedule(
    "0 12 * * *",
    () => {
      console.log("[CRON] Running noon auto-backup...");
      void runScheduledAutoBackup("Noon");
    },
    { timezone: "Asia/Manila" },
  );

  cron.schedule(
    "*/5 * * * *",
    async () => {
      if (isDatabaseRestoreInProgress()) {
        console.log("[CRON] Skipping POS QR cleanup during database restore.");
        return;
      }

      try {
        await runPosQrCleanupBatch({ io });
      } catch (err) {
        console.error("[CRON] POS QR cleanup failed:", err.message);
      }
    },
    { timezone: "Asia/Manila" },
  );

  // Appointment auto-cancellation — every 5 minutes.
  //
  // Business rule:
  // Cancel confirmed/awaiting-staff appointments when they are
  // at least 30 minutes past their scheduled appointment time.
  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await runAppointmentAutoCancellation({ io });
      } catch (err) {
        console.error(
          "[CRON] Appointment auto-cancellation failed:",
          err?.message || err,
        );
      }
    },
    { timezone: "Asia/Manila" },
  );

  // Abandoned customer registration cleanup — once daily at 2:30 AM.
  cron.schedule(
    "30 2 * * *",
    async () => {
      if (isDatabaseRestoreInProgress()) {
        console.log(
          "[CRON] Skipping unverified registration cleanup during database restore.",
        );
        return;
      }

      try {
        const result = await cleanupUnverifiedCustomers({
          ageDays: 7,
          batchSize: 100,
        });
        console.log(
          `[CRON] Unverified registration cleanup: scanned=${result.scanned}, deleted=${result.deleted}, skipped_linked=${result.skipped_linked}`,
        );
      } catch (err) {
        console.error(
          "[CRON] Unverified registration cleanup failed:",
          err.message,
        );
      }
    },
    { timezone: "Asia/Manila" },
  );

  // New: Support ticket auto-close (Runs at midnight)
  cron.schedule(
    "0 0 * * *",
    async () => {
      if (isDatabaseRestoreInProgress()) {
        console.log(
          "[CRON] Skipping support ticket auto-close during database restore.",
        );
        return;
      }

      try {
        console.log(
          "[CRON] Running nightly auto-close check for resolved tickets...",
        );
        const [result] = await pool.query(
          `
        UPDATE support_tickets
        SET 
          status = 'closed',
          updated_at = NOW()
        WHERE status = 'resolved' 
          AND resolved_at <= NOW() - INTERVAL 3 DAY
        `,
        );
        if (result.affectedRows > 0) {
          console.log(
            `[CRON] Successfully auto-closed ${result.affectedRows} ticket(s).`,
          );
        } else {
          console.log(
            "[CRON] Check complete: No tickets met the 3-day auto-close criteria.",
          );
        }
      } catch (err) {
        console.error("[CRON] Error running auto-close tickets job:", err);
      }
    },
    { timezone: "Asia/Manila" },
  );

  console.log(
    "✅ Cron jobs started: auto-backup at 12:00 AM and 12:00 PM daily; POS QR cleanup every 5 minutes; appointment auto-cancellation every 5 minutes; unverified registration cleanup at 2:30 AM; ticket auto-close at 12:00 AM.",
  );
}

module.exports = {
  startCronJobs,
  runBackup,
  runAppointmentAutoCancellation,
};
