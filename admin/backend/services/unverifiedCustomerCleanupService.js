// services/unverifiedCustomerCleanupService.js
// Safely removes abandoned customer registrations that never verified email.
// It never disables foreign-key checks and skips any account that has linked rows.
const pool = require("../config/db");
const { writeAuditLogSafe } = require("../middleware/auditLog");

const DEFAULT_AGE_DAYS = 7;
const DEFAULT_BATCH_SIZE = 100;
const IDENTIFIER_RE = /^[A-Za-z0-9_]+$/;

async function getUserReferences() {
  const [fkRows] = await pool.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = 'users'
        AND REFERENCED_COLUMN_NAME = 'id'`,
  );

  // Also detect conventional user/customer links even when an older table was
  // created without a foreign key. This makes cleanup preservation-oriented.
  const [columnRows] = await pool.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME <> 'users'
        AND COLUMN_NAME IN (
          'user_id', 'customer_id', 'created_by', 'updated_by',
          'assigned_to', 'assigned_by', 'approved_by', 'fulfilled_by',
          'processed_by', 'released_by', 'picked_up_by'
        )`,
  );

  const deduped = new Map();
  for (const row of [...fkRows, ...columnRows]) {
    const table = String(row.table_name || "");
    const column = String(row.column_name || "");
    if (!IDENTIFIER_RE.test(table) || !IDENTIFIER_RE.test(column)) continue;
    deduped.set(`${table}.${column}`, { table_name: table, column_name: column });
  }
  return [...deduped.values()];
}

async function hasLinkedRecords(userId, references) {
  for (const ref of references) {
    const table = String(ref.table_name);
    const column = String(ref.column_name);
    const [[row]] = await pool.query(
      `SELECT 1 AS linked FROM \`${table}\` WHERE \`${column}\` = ? LIMIT 1`,
      [userId],
    );

    if (row?.linked) {
      return { linked: true, table };
    }
  }

  return { linked: false, table: null };
}

async function cleanupUnverifiedCustomers({
  ageDays = DEFAULT_AGE_DAYS,
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  const safeAgeDays = Number.isInteger(Number(ageDays)) && Number(ageDays) >= 1
    ? Number(ageDays)
    : DEFAULT_AGE_DAYS;
  const safeBatchSize =
    Number.isInteger(Number(batchSize)) && Number(batchSize) >= 1
      ? Math.min(Number(batchSize), 500)
      : DEFAULT_BATCH_SIZE;

  const [candidates] = await pool.query(
    `SELECT id, email, created_at
       FROM users
      WHERE role = 'customer'
        AND COALESCE(is_verified, 0) = 0
        AND created_at < NOW() - INTERVAL ? DAY
      ORDER BY created_at ASC
      LIMIT ?`,
    [safeAgeDays, safeBatchSize],
  );

  if (!candidates.length) {
    return { scanned: 0, deleted: 0, skipped_linked: 0 };
  }

  const references = await getUserReferences();
  let deleted = 0;
  let skippedLinked = 0;

  for (const candidate of candidates) {
    const linked = await hasLinkedRecords(candidate.id, references);
    if (linked.linked) {
      skippedLinked += 1;
      continue;
    }

    let result;
    try {
      [result] = await pool.query(
        `DELETE FROM users
          WHERE id = ?
            AND role = 'customer'
            AND COALESCE(is_verified, 0) = 0
            AND created_at < NOW() - INTERVAL ? DAY`,
        [candidate.id, safeAgeDays],
      );
    } catch (err) {
      // A linked row could be created between the reference check and delete.
      // Treat FK protection as a safe skip instead of failing the entire job.
      if (err?.code === "ER_ROW_IS_REFERENCED_2" || err?.errno === 1451) {
        skippedLinked += 1;
        continue;
      }
      throw err;
    }

    if (result.affectedRows === 1) {
      deleted += 1;
      await writeAuditLogSafe({
        userId: null,
        action: "cleanup_abandoned_registration",
        tableName: "users",
        recordId: candidate.id,
        oldValues: {
          email_configured: Boolean(candidate.email),
          email_verified: false,
          created_at: candidate.created_at,
        },
        newValues: {
          deleted: true,
          reason: `email_unverified_over_${safeAgeDays}_days_no_linked_records`,
        },
      });
    }
  }

  return {
    scanned: candidates.length,
    deleted,
    skipped_linked: skippedLinked,
  };
}

module.exports = { cleanupUnverifiedCustomers };
