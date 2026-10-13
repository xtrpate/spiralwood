// services/databaseRestoreService.js
// Guarded database restore workflow for successful WISDOM backup records only.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const pool = require("../config/db");
const {
  BACKUP_LOCK_NAME,
  getBackupDirectory,
  runDatabaseBackup,
  isR2StoragePath,
  getR2BackupObject,
} = require("./databaseBackupService");
const {
  stripLeadingComments,
  validateWisdomBackupSql,
  parseWisdomInsertStatement,
  projectWisdomInsertToColumns,
} = require("../utils/backupRestoreSql");

let restoreInProgress = false;

class DatabaseRestoreError extends Error {
  constructor(
    message,
    { statusCode = 500, code = "DATABASE_RESTORE_FAILED" } = {},
  ) {
    super(message);
    this.name = "DatabaseRestoreError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isDatabaseRestoreEnabled() {
  return (
    String(process.env.BACKUP_RESTORE_ENABLED || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function isRemoteDatabaseRestoreAllowed() {
  return (
    String(process.env.BACKUP_RESTORE_ALLOW_REMOTE || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function normalizeDatabaseHost(value) {
  return String(value || "localhost")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
}

function isLoopbackDatabaseHost(value) {
  const host = normalizeDatabaseHost(value);

  return host === "localhost" || host === "::1" || host.startsWith("127.");
}

function assertRemoteRestoreAllowed() {
  if (isLoopbackDatabaseHost(process.env.DB_HOST)) return;
  if (isRemoteDatabaseRestoreAllowed()) {
    console.warn(
      "[RESTORE] Remote database restore override is enabled for this maintenance window.",
    );
    return;
  }

  throw new DatabaseRestoreError(
    "Remote database restore is blocked by server configuration. Set BACKUP_RESTORE_ALLOW_REMOTE=true only during an approved maintenance window.",
    { statusCode: 503, code: "REMOTE_DATABASE_RESTORE_DISABLED" },
  );
}

function isDatabaseRestoreInProgress() {
  return restoreInProgress;
}

function quoteSqlIdentifier(value) {
  return `\`${String(value).replace(/\`/g, "\`\`")}\``;
}

async function streamBodyToBuffer(body) {
  if (!body) {
    throw new DatabaseRestoreError("Backup storage returned an empty file.", {
      statusCode: 502,
      code: "BACKUP_FILE_EMPTY",
    });
  }

  if (Buffer.isBuffer(body)) return body;

  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function loadBackupSql(backupRow) {
  const filename = String(backupRow.file_name || "");
  let fileBuffer;

  if (isR2StoragePath(backupRow.storage_path)) {
    let object;
    try {
      object = await getR2BackupObject(backupRow.storage_path);
    } catch (error) {
      const statusCode = Number(error?.$metadata?.httpStatusCode);
      if (
        statusCode === 404 ||
        error?.name === "NoSuchKey" ||
        error?.name === "NotFound"
      ) {
        throw new DatabaseRestoreError(
          "This backup record exists, but its R2 file is no longer available.",
          { statusCode: 404, code: "BACKUP_FILE_MISSING" },
        );
      }
      throw error;
    }

    fileBuffer = await streamBodyToBuffer(object?.Body);
  } else {
    const backupDir = path.resolve(getBackupDirectory());
    const filePath = path.resolve(backupDir, filename);

    if (path.dirname(filePath) !== backupDir) {
      throw new DatabaseRestoreError("Invalid backup file path.", {
        statusCode: 400,
        code: "INVALID_BACKUP_PATH",
      });
    }

    if (!fs.existsSync(filePath)) {
      throw new DatabaseRestoreError(
        "This backup record exists, but its local file is no longer available.",
        { statusCode: 404, code: "BACKUP_FILE_MISSING" },
      );
    }

    fileBuffer = await fs.promises.readFile(filePath);
  }

  if (filename.toLowerCase().endsWith(".gz")) {
    try {
      fileBuffer = zlib.gunzipSync(fileBuffer);
    } catch {
      throw new DatabaseRestoreError("The compressed backup file is invalid.", {
        statusCode: 400,
        code: "INVALID_GZIP_BACKUP",
      });
    }
  }

  const sql = fileBuffer.toString("utf8");
  if (!sql.trim()) {
    throw new DatabaseRestoreError("The selected backup file is empty.", {
      statusCode: 400,
      code: "BACKUP_FILE_EMPTY",
    });
  }

  return sql;
}

async function assertTargetDatabase(conn) {
  const [[row]] = await conn.query("SELECT DATABASE() AS database_name");
  const actual = String(row?.database_name || "").trim();
  const configured = String(process.env.DB_NAME || "wisdom_db").trim();
  const forbidden = new Set([
    "mysql",
    "information_schema",
    "performance_schema",
    "sys",
  ]);

  if (!actual || actual !== configured || forbidden.has(actual.toLowerCase())) {
    throw new DatabaseRestoreError(
      "Database restore target validation failed. The active database does not match DB_NAME.",
      { statusCode: 500, code: "UNSAFE_RESTORE_TARGET" },
    );
  }

  return actual;
}

const IMMUTABLE_RESTORE_TABLES = new Set(["audit_logs"]);

function isGeneratedCurrentColumn(column) {
  const extra = String(column?.Extra || "").toLowerCase();

  return (
    extra.includes("virtual generated") || extra.includes("stored generated")
  );
}

function buildRestoreSqlMode(originalMode) {
  // Preserve the active SQL modes while permitting WISDOM's escaped
  // backup strings to be interpreted correctly.
  const modes = String(originalMode || "")
    .split(",")
    .map((mode) => mode.trim())
    .filter(Boolean)
    .filter((mode) => mode.toUpperCase() !== "NO_BACKSLASH_ESCAPES");

  const modeSet = new Set(modes.map((mode) => mode.toUpperCase()));

  if (!modeSet.has("NO_AUTO_VALUE_ON_ZERO")) {
    modes.push("NO_AUTO_VALUE_ON_ZERO");
  }

  if (
    !modeSet.has("STRICT_TRANS_TABLES") &&
    !modeSet.has("STRICT_ALL_TABLES")
  ) {
    modes.push("STRICT_TRANS_TABLES");
  }

  return [...new Set(modes)].join(",");
}

async function ensureBackupRecord(conn, backup) {
  if (!backup?.fileName) return;

  const [existing] = await conn.query(
    "SELECT id FROM backup_logs WHERE file_name = ? LIMIT 1",
    [backup.fileName],
  );

  if (existing.length > 0) return;

  await conn.query(
    `INSERT INTO backup_logs
       (type, triggered_by, file_name, file_size_kb, storage_path, status, notes, created_at)
     VALUES (?, NULL, ?, ?, ?, 'success', ?, ?)`,
    [
      backup.type || "manual",
      backup.fileName,
      Number(backup.sizeKb) || 0,
      backup.storagePath || null,
      backup.notes || null,
      backup.createdAt || new Date(),
    ],
  );
}

async function buildDataRestorePlan(conn, statements, createTableDdls) {
  await assertTargetDatabase(conn);

  const [tableRows] = await conn.query(
    "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'",
  );

  const currentTableNames = tableRows
    .map((row) => String(Object.values(row)[0] || ""))
    .filter(Boolean)
    .sort();

  const currentTables = new Set(currentTableNames);

  const historicalTables = new Set(createTableDdls.keys());

  // Restore only tables that existed in the selected backup and still exist
  // in the current schema. Current-only tables remain untouched.
  const tablesToClear = [...historicalTables]
    .filter(
      (table) =>
        currentTables.has(table) && !IMMUTABLE_RESTORE_TABLES.has(table),
    )
    .sort();

  const tablesToClearSet = new Set(tablesToClear);
  const columnsByTable = new Map();
  const expectedRowsByTable = new Map(tablesToClear.map((table) => [table, 0]));

  for (const table of tablesToClear) {
    const [columns] = await conn.query(
      `SHOW FULL COLUMNS FROM ${quoteSqlIdentifier(table)}`,
    );

    columnsByTable.set(table, columns);
  }

  // Data-only restoration must not fire unknown table triggers or operate
  // on nontransactional tables that cannot reliably roll back.
  const [engineRows] = await conn.query(
    `SELECT TABLE_NAME, ENGINE
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'`,
  );

  const enginesByTable = new Map(
    engineRows.map((row) => [
      String(row.TABLE_NAME),
      String(row.ENGINE || "").toUpperCase(),
    ]),
  );

  const nonTransactionalTables = tablesToClear.filter(
    (table) => enginesByTable.get(table) !== "INNODB",
  );

  if (nonTransactionalTables.length > 0) {
    throw new DatabaseRestoreError(
      `Data-only restore requires transactional InnoDB tables. Unsupported tables: ${nonTransactionalTables.join(", ")}.`,
      {
        statusCode: 409,
        code: "DATA_RESTORE_NON_TRANSACTIONAL_TABLE",
      },
    );
  }

  const [triggerRows] = await conn.query(
    `SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE
       FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()`,
  );

  const conflictingTriggers = triggerRows.filter((trigger) =>
    tablesToClearSet.has(String(trigger.EVENT_OBJECT_TABLE)),
  );

  if (conflictingTriggers.length > 0) {
    const triggerNames = conflictingTriggers
      .map(
        (trigger) => `${trigger.TRIGGER_NAME} (${trigger.EVENT_OBJECT_TABLE})`,
      )
      .join(", ");

    throw new DatabaseRestoreError(
      `Data-only restore stopped because trigger(s) exist on tables that would be restored: ${triggerNames}. Review their behavior before retrying.`,
      {
        statusCode: 409,
        code: "DATA_RESTORE_TRIGGER_CONFLICT",
      },
    );
  }

  const insertStatements = [];

  for (const statement of statements) {
    const clean = stripLeadingComments(statement);

    if (!/^INSERT\s+INTO\b/i.test(clean)) {
      // Never execute historical DROP TABLE or CREATE TABLE statements.
      continue;
    }

    const parsed = parseWisdomInsertStatement(clean);

    if (!historicalTables.has(parsed.tableName)) {
      throw new DatabaseRestoreError(
        `Backup data references table ${parsed.tableName}, which has no table definition in the backup.`,
        {
          statusCode: 400,
          code: "BACKUP_DATA_INVALID",
        },
      );
    }

    // Audit logs are append-only in WISDOM. Preserve the current records
    // instead of deleting or replacing them with historical audit data.
    if (IMMUTABLE_RESTORE_TABLES.has(parsed.tableName)) {
      continue;
    }

    if (!currentTables.has(parsed.tableName)) {
      throw new DatabaseRestoreError(
        `Historical data for table ${parsed.tableName} cannot be restored because that table no longer exists in the current schema. The database was not changed.`,
        {
          statusCode: 409,
          code: "DATA_RESTORE_TABLE_MISSING",
        },
      );
    }

    if (!tablesToClearSet.has(parsed.tableName)) {
      throw new DatabaseRestoreError(
        `Table ${parsed.tableName} is not an eligible data-restore target.`,
        {
          statusCode: 409,
          code: "DATA_RESTORE_TABLE_NOT_ELIGIBLE",
        },
      );
    }

    const currentColumns = columnsByTable.get(parsed.tableName) || [];
    const historicalColumns = new Set(parsed.columns);

    // A historical row must be able to satisfy every required current
    // column that the backup does not provide.
    const missingRequiredColumns = currentColumns.filter((column) => {
      if (isGeneratedCurrentColumn(column)) return false;
      if (historicalColumns.has(String(column.Field))) return false;

      const extra = String(column.Extra || "").toLowerCase();

      return (
        String(column.Null || "").toUpperCase() !== "YES" &&
        column.Default == null &&
        !/auto_increment|default_generated/i.test(extra)
      );
    });

    if (missingRequiredColumns.length > 0) {
      throw new DatabaseRestoreError(
        `Historical data for ${parsed.tableName} is missing required current column(s): ${missingRequiredColumns
          .map((column) => column.Field)
          .join(", ")}. The restore was stopped before changing data.`,
        {
          statusCode: 409,
          code: "DATA_RESTORE_REQUIRED_COLUMN_MISSING",
        },
      );
    }

    const allowedColumns = currentColumns
      .filter((column) => !isGeneratedCurrentColumn(column))
      .map((column) => String(column.Field));

    const projectedSql = projectWisdomInsertToColumns(clean, allowedColumns);

    if (!projectedSql) {
      throw new DatabaseRestoreError(
        `No compatible columns were found for historical data in table ${parsed.tableName}.`,
        {
          statusCode: 409,
          code: "DATA_RESTORE_NO_COMPATIBLE_COLUMNS",
        },
      );
    }

    insertStatements.push({
      tableName: parsed.tableName,
      sql: projectedSql,
    });

    expectedRowsByTable.set(
      parsed.tableName,
      (expectedRowsByTable.get(parsed.tableName) || 0) + parsed.rows.length,
    );
  }

  const restorableRowCount = [...expectedRowsByTable.values()].reduce(
    (total, count) => total + Number(count || 0),
    0,
  );

  if (insertStatements.length === 0 || restorableRowCount === 0) {
    throw new DatabaseRestoreError(
      "The selected backup contains no restorable row data. The database was not changed.",
      {
        statusCode: 400,
        code: "BACKUP_NO_RESTORABLE_DATA",
      },
    );
  }

  return {
    currentTableNames,
    tablesToClear,
    insertStatements,
    expectedRowsByTable,
  };
}

async function verifyForeignKeyIntegrity(conn) {
  const [foreignKeys] = await conn.query(
    `SELECT
       TABLE_NAME,
       CONSTRAINT_NAME,
       COLUMN_NAME,
       REFERENCED_TABLE_NAME,
       REFERENCED_COLUMN_NAME,
       ORDINAL_POSITION
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
  );

  const groups = new Map();

  for (const foreignKey of foreignKeys) {
    const key = [
      foreignKey.TABLE_NAME,
      foreignKey.CONSTRAINT_NAME,
      foreignKey.REFERENCED_TABLE_NAME,
    ].join("\u0000");

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(foreignKey);
  }

  for (const columns of groups.values()) {
    const first = columns[0];

    const joinConditions = columns
      .map(
        (column) =>
          `child.${quoteSqlIdentifier(column.COLUMN_NAME)} = ` +
          `parent.${quoteSqlIdentifier(column.REFERENCED_COLUMN_NAME)}`,
      )
      .join(" AND ");

    const nonNullConditions = columns
      .map(
        (column) =>
          `child.${quoteSqlIdentifier(column.COLUMN_NAME)} IS NOT NULL`,
      )
      .join(" AND ");

    const referenceColumn = quoteSqlIdentifier(first.REFERENCED_COLUMN_NAME);

    const [invalidRows] = await conn.query(
      `SELECT 1
         FROM ${quoteSqlIdentifier(first.TABLE_NAME)} AS child
         LEFT JOIN ${quoteSqlIdentifier(first.REFERENCED_TABLE_NAME)} AS parent
           ON ${joinConditions}
        WHERE ${nonNullConditions}
          AND parent.${referenceColumn} IS NULL
        LIMIT 1`,
    );

    if (invalidRows.length > 0) {
      throw new DatabaseRestoreError(
        `The historical data would violate foreign key ${first.CONSTRAINT_NAME} on table ${first.TABLE_NAME}. The restore has been rolled back.`,
        {
          statusCode: 409,
          code: "DATA_RESTORE_FOREIGN_KEY_MISMATCH",
        },
      );
    }
  }
}

async function verifyDataRestore(conn, plan) {
  const [tableRows] = await conn.query(
    "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'",
  );

  const currentTableNames = tableRows
    .map((row) => String(Object.values(row)[0] || ""))
    .filter(Boolean)
    .sort();

  if (
    currentTableNames.length !== plan.currentTableNames.length ||
    currentTableNames.some(
      (table, index) => table !== plan.currentTableNames[index],
    )
  ) {
    throw new DatabaseRestoreError(
      "The database schema changed during the data-only restore. The restore was rolled back.",
      {
        statusCode: 409,
        code: "DATA_RESTORE_SCHEMA_CHANGED",
      },
    );
  }

  for (const table of plan.tablesToClear) {
    // Backup history receives the selected backup and safety backup again.
    if (table === "backup_logs") continue;

    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS row_count
         FROM ${quoteSqlIdentifier(table)}`,
    );

    const actualCount = Number(row?.row_count || 0);
    const expectedCount = Number(plan.expectedRowsByTable.get(table) || 0);

    if (actualCount !== expectedCount) {
      throw new DatabaseRestoreError(
        `Restored row count verification failed for table ${table}.`,
        {
          statusCode: 500,
          code: "DATA_RESTORE_ROW_COUNT_MISMATCH",
        },
      );
    }
  }

  await verifyForeignKeyIntegrity(conn);
}

async function runDatabaseRestore({
  backupId,
  expectedFilename,
  triggeredBy,
} = {}) {
  if (!isDatabaseRestoreEnabled()) {
    throw new DatabaseRestoreError(
      "Database restore is disabled by server configuration. Set BACKUP_RESTORE_ENABLED=true only during an approved maintenance window.",
      { statusCode: 503, code: "DATABASE_RESTORE_DISABLED" },
    );
  }

  // A remote/live-like database needs a second explicit maintenance override.
  // This guard runs before any backup record lookup or database mutation.
  assertRemoteRestoreAllowed();

  const parsedBackupId = Number(backupId);
  if (!Number.isInteger(parsedBackupId) || parsedBackupId <= 0) {
    throw new DatabaseRestoreError("Invalid backup ID.", {
      statusCode: 400,
      code: "INVALID_BACKUP_ID",
    });
  }

  if (restoreInProgress) {
    throw new DatabaseRestoreError(
      "Another database restore is already in progress.",
      {
        statusCode: 409,
        code: "RESTORE_IN_PROGRESS",
      },
    );
  }

  restoreInProgress = true;
  let conn = null;
  let lockAcquired = false;
  let safetyBackup = null;
  let destructiveRestoreStarted = false;
  let restorePlan = null;
  let originalSessionSettings = null;
  let transactionStarted = false;
  let rollbackFailed = false;

  try {
    const [[backupRow]] = await pool.query(
      `SELECT id, type, triggered_by, file_name, file_size_kb, storage_path, status, created_at
       FROM backup_logs
       WHERE id = ?
       LIMIT 1`,
      [parsedBackupId],
    );

    if (
      !backupRow ||
      String(backupRow.status || "").toLowerCase() !== "success"
    ) {
      throw new DatabaseRestoreError("Successful backup record not found.", {
        statusCode: 404,
        code: "BACKUP_NOT_FOUND",
      });
    }

    if (
      expectedFilename &&
      String(expectedFilename) !== String(backupRow.file_name || "")
    ) {
      throw new DatabaseRestoreError(
        "Backup selection changed. Refresh Backup History and try again.",
        { statusCode: 409, code: "BACKUP_SELECTION_CHANGED" },
      );
    }

    const sql = await loadBackupSql(backupRow);
    const { statements, createTableDdls } = validateWisdomBackupSql(sql);

    // Prepare a data-only restore plan before creating a safety backup.
    // This validates compatible columns, table engines, and trigger behavior.
    const preflightConn = await pool.getConnection();

    try {
      restorePlan = await buildDataRestorePlan(
        preflightConn,
        statements,
        createTableDdls,
      );
    } finally {
      preflightConn.release();
    }

    safetyBackup = await runDatabaseBackup({
      type: "manual",
      triggeredBy,
    });

    if (!safetyBackup || safetyBackup.status !== "success") {
      throw new DatabaseRestoreError(
        "Restore stopped because the pre-restore safety backup did not complete successfully.",
        { statusCode: 500, code: "SAFETY_BACKUP_FAILED" },
      );
    }

    conn = await pool.getConnection();

    const [[lockRow]] = await conn.query("SELECT GET_LOCK(?, 0) AS acquired", [
      BACKUP_LOCK_NAME,
    ]);

    if (Number(lockRow?.acquired) !== 1) {
      throw new DatabaseRestoreError(
        "Another database backup or restore is already in progress.",
        { statusCode: 409, code: "DATABASE_MAINTENANCE_IN_PROGRESS" },
      );
    }
    lockAcquired = true;

    // Rebuild the plan while holding the maintenance lock so it reflects
    // the current database schema immediately before data changes begin.
    restorePlan = await buildDataRestorePlan(conn, statements, createTableDdls);

    const [[sessionSettings]] = await conn.query(
      `SELECT
     @@SESSION.FOREIGN_KEY_CHECKS AS foreign_key_checks,
     @@SESSION.sql_mode AS sql_mode,
     @@SESSION.time_zone AS time_zone`,
    );

    originalSessionSettings = sessionSettings;

    // Preserve the schema: execute no historical DROP TABLE or CREATE TABLE
    // statements. Temporarily disable FK enforcement for the multi-table
    // replacement, then validate all current foreign keys before committing.
    await conn.query("SET SESSION FOREIGN_KEY_CHECKS = 0");
    await conn.query("SET SESSION sql_mode = ?", [
      buildRestoreSqlMode(originalSessionSettings.sql_mode),
    ]);
    await conn.query("SET SESSION time_zone = '+00:00'");

    await conn.beginTransaction();
    transactionStarted = true;
    destructiveRestoreStarted = true;

    for (const table of restorePlan.tablesToClear) {
      await conn.query(`DELETE FROM ${quoteSqlIdentifier(table)}`);
    }

    for (const statement of restorePlan.insertStatements) {
      await conn.query(statement.sql);
    }

    // A backup cannot contain its own backup_logs row because the row is
    // written only after dump generation. Re-register the source and safety
    // backup inside this transaction so they survive the historical restore.
    await ensureBackupRecord(conn, {
      type: backupRow.type,
      fileName: backupRow.file_name,
      sizeKb: backupRow.file_size_kb,
      storagePath: backupRow.storage_path,
      createdAt: backupRow.created_at,
      notes: "Restore source backup re-registered after data-only restoration.",
    });

    await ensureBackupRecord(conn, {
      type: "manual",
      fileName: safetyBackup.fileName,
      sizeKb: safetyBackup.sizeKb,
      storagePath: safetyBackup.storagePath,
      createdAt: new Date(),
      notes: `Pre-restore safety backup created before restoring ${backupRow.file_name}.`,
    });

    await verifyDataRestore(conn, restorePlan);

    await conn.commit();
    transactionStarted = false;

    return {
      restoredBackupId: parsedBackupId,
      restoredFileName: backupRow.file_name,
      restoredTableCount: restorePlan.tablesToClear.length,
      safetyBackup: {
        fileName: safetyBackup.fileName,
        sizeKb: safetyBackup.sizeKb,
        storage: safetyBackup.storage,
        storagePath: safetyBackup.storagePath,
      },
    };
  } catch (error) {
    if (transactionStarted && conn) {
      try {
        await conn.rollback();
        transactionStarted = false;
      } catch (rollbackError) {
        rollbackFailed = true;
        console.error(
          "[RESTORE] Transaction rollback failed. The connection will be discarded:",
          rollbackError.message,
        );
      }
    }
    if (safetyBackup?.fileName) {
      error.safetyBackup = {
        fileName: safetyBackup.fileName,
        sizeKb: safetyBackup.sizeKb,
        storage: safetyBackup.storage,
        storagePath: safetyBackup.storagePath,
      };
    }
    // Only report an unrecovered destructive attempt if the rollback failed
    // or the transaction could not be confirmed as rolled back.
    error.destructiveRestoreStarted = Boolean(
      destructiveRestoreStarted && (rollbackFailed || transactionStarted),
    );

    if (destructiveRestoreStarted && !rollbackFailed && !transactionStarted) {
      error.restoreRolledBack = true;
    }
    throw error;
  } finally {
    let sessionResetFailed = false;
    let lockReleaseFailed = false;

    if (conn && originalSessionSettings && !rollbackFailed) {
      try {
        await conn.query(
          `SET SESSION FOREIGN_KEY_CHECKS = ${
            Number(originalSessionSettings.foreign_key_checks) === 0 ? 0 : 1
          }`,
        );

        await conn.query("SET SESSION sql_mode = ?", [
          String(originalSessionSettings.sql_mode || ""),
        ]);

        await conn.query("SET SESSION time_zone = ?", [
          String(originalSessionSettings.time_zone || "+00:00"),
        ]);
      } catch (resetError) {
        sessionResetFailed = true;

        console.error(
          "[RESTORE] Failed to restore database session settings:",
          resetError.message,
        );
      }
    }

    if (lockAcquired && conn && !sessionResetFailed && !rollbackFailed) {
      try {
        const [[releaseRow]] = await conn.query(
          "SELECT RELEASE_LOCK(?) AS released",
          [BACKUP_LOCK_NAME],
        );

        if (Number(releaseRow?.released) !== 1) {
          lockReleaseFailed = true;

          console.error(
            "[RESTORE] Database maintenance lock was not confirmed as released. The connection will be discarded.",
          );
        }
      } catch (error) {
        lockReleaseFailed = true;

        console.error(
          "[RESTORE] Failed to release database maintenance lock. The connection will be discarded:",
          error.message,
        );
      }
    }

    if (conn) {
      if (
        (sessionResetFailed || rollbackFailed || lockReleaseFailed) &&
        typeof conn.destroy === "function"
      ) {
        // Do not return an uncertain transaction/session to the connection pool.
        conn.destroy();
      } else {
        conn.release();
      }
    }

    restoreInProgress = false;
  }
}

module.exports = {
  DatabaseRestoreError,
  isDatabaseRestoreEnabled,
  isDatabaseRestoreInProgress,
  runDatabaseRestore,
};
