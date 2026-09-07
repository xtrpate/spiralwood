require("dotenv").config();
const pool = require("./config/db");
const {
  cleanupUnverifiedCustomers,
} = require("./services/unverifiedCustomerCleanupService");

(async () => {
  try {
    console.log("[cleanup] Checking abandoned email-unverified registrations older than 7 days...");
    const result = await cleanupUnverifiedCustomers({ ageDays: 7, batchSize: 500 });
    console.log(
      `[cleanup] scanned=${result.scanned} deleted=${result.deleted} skipped_linked=${result.skipped_linked}`,
    );
  } catch (error) {
    console.error("[cleanup] Failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
