// services/cronService.js – Automated backup cron (12:00 AM and 12:00 PM daily)
const cron = require("node-cron");
const pool = require("../config/db");
const { runDatabaseBackup } = require("./databaseBackupService");
const { runPosQrCleanupBatch } = require("./posQrCleanupService");
const { cleanupUnverifiedCustomers } = require("./unverifiedCustomerCleanupService");

async function runBackup(type = "auto") {
  return runDatabaseBackup({ type });
}

async function runScheduledAutoBackup(label) {
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

function startCronJobs() {
  cron.schedule("0 0 * * *", () => {
    console.log("[CRON] Running midnight auto-backup...");
    void runScheduledAutoBackup("Midnight");
  });

  cron.schedule("0 12 * * *", () => {
    console.log("[CRON] Running noon auto-backup...");
    void runScheduledAutoBackup("Noon");
  });

  cron.schedule("*/5 * * * *", async () => {
    try {
      await runPosQrCleanupBatch();
    } catch (err) {
      console.error("[CRON] POS QR cleanup failed:", err.message);
    }
  });

  // Abandoned customer registration cleanup — once daily at 2:30 AM.
  cron.schedule("30 2 * * *", async () => {
    try {
      const result = await cleanupUnverifiedCustomers({ ageDays: 7, batchSize: 100 });
      console.log(
        `[CRON] Unverified registration cleanup: scanned=${result.scanned}, deleted=${result.deleted}, skipped_linked=${result.skipped_linked}`,
      );
    } catch (err) {
      console.error("[CRON] Unverified registration cleanup failed:", err.message);
    }
  });

  // New: Support ticket auto-close (Runs at midnight)
  cron.schedule("0 0 * * *", async () => {
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
  });

  console.log(
    "✅  Cron jobs started: auto-backup at 12:00 AM and 12:00 PM daily; POS QR cleanup every 5 minutes; unverified registration cleanup at 2:30 AM; ticket auto-close at 12:00 AM.",
  );
}

module.exports = { startCronJobs, runBackup };
