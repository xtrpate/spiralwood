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
  validateWisdomBackupSql,
  normalizeCreateTableDdl,
} = require("../utils/backupRestoreSql");

let restoreInProgress = false;

class DatabaseRestoreError extends Error {
  constructor(message, { statusCode = 500, code = "DATABASE_RESTORE_FAILED" } = {}) {
    super(message);
    this.name = "DatabaseRestoreError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isDatabaseRestoreEnabled() {
  return String(process.env.BACKUP_RESTORE_ENABLED || "")
    .trim()
    .toLowerCase() === "true";
}

function isRemoteDatabaseRestoreAllowed() {
  return String(process.env.BACKUP_RESTORE_ALLOW_REMOTE || "")
    .trim()
    .toLowerCase() === "true";
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
  const forbidden = new Set(["mysql", "information_schema", "performance_schema", "sys"]);

  if (!actual || actual !== configured || forbidden.has(actual.toLowerCase())) {
    throw new DatabaseRestoreError(
      "Database restore target validation failed. The active database does not match DB_NAME.",
      { statusCode: 500, code: "UNSAFE_RESTORE_TARGET" },
    );
  }

  return actual;
}

async function assertSchemaCompatible(conn, createTableDdls) {
  const [tableRows] = await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const currentTables = tableRows.map((row) => Object.values(row)[0]).sort();
  const backupTables = [...createTableDdls.keys()].sort();

  if (
    currentTables.length !== backupTables.length ||
    currentTables.some((table, index) => table !== backupTables[index])
  ) {
    throw new DatabaseRestoreError(
      "This backup uses a different database schema version. Use a controlled developer recovery for cross-version restores.",
      { statusCode: 409, code: "BACKUP_SCHEMA_MISMATCH" },
    );
  }

  for (const table of backupTables) {
    const [[createRow]] = await conn.query(
      `SHOW CREATE TABLE ${quoteSqlIdentifier(table)}`,
    );

    const currentDdl = normalizeCreateTableDdl(createRow?.["Create Table"] || "");
    const backupDdl = normalizeCreateTableDdl(createTableDdls.get(table));

    if (!currentDdl || currentDdl !== backupDdl) {
      throw new DatabaseRestoreError(
        `Backup schema mismatch detected for table ${table}. Use a controlled developer recovery for cross-version restores.`,
        { statusCode: 409, code: "BACKUP_SCHEMA_MISMATCH" },
      );
    }
  }

  return backupTables;
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

async function verifyRestoredTables(conn, expectedTables) {
  const [rows] = await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const actualTables = rows.map((row) => Object.values(row)[0]).sort();
  const expected = [...expectedTables].sort();

  if (
    actualTables.length !== expected.length ||
    actualTables.some((table, index) => table !== expected[index])
  ) {
    throw new DatabaseRestoreError(
      "Restore completed SQL execution but table verification did not match the selected backup.",
      { code: "RESTORE_VERIFICATION_FAILED" },
    );
  }

  for (const table of expected) {
    const [checkRows] = await conn.query(
      `CHECK TABLE ${quoteSqlIdentifier(table)}`,
    );

    const failed = checkRows.some(
      (row) =>
        String(row.Msg_type || "").toLowerCase() === "error" ||
        String(row.Msg_text || "").toLowerCase() !== "ok",
    );

    if (failed) {
      throw new DatabaseRestoreError(
        `Restore verification failed for table ${table}.`,
        { code: "RESTORE_VERIFICATION_FAILED" },
      );
    }
  }
}

async function runDatabaseRestore({ backupId, expectedFilename, triggeredBy } = {}) {
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
    throw new DatabaseRestoreError("Another database restore is already in progress.", {
      statusCode: 409,
      code: "RESTORE_IN_PROGRESS",
    });
  }

  restoreInProgress = true;
  let conn = null;
  let lockAcquired = false;
  let safetyBackup = null;
  let destructiveRestoreStarted = false;

  try {
    const [[backupRow]] = await pool.query(
      `SELECT id, type, triggered_by, file_name, file_size_kb, storage_path, status, created_at
       FROM backup_logs
       WHERE id = ?
       LIMIT 1`,
      [parsedBackupId],
    );

    if (!backupRow || String(backupRow.status || "").toLowerCase() !== "success") {
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

    // Validate schema compatibility before creating a safety backup or touching
    // any live table. Cross-version restores remain a developer recovery task.
    const preflightConn = await pool.getConnection();
    try {
      await assertTargetDatabase(preflightConn);
      await assertSchemaCompatible(preflightConn, createTableDdls);
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

    const [[lockRow]] = await conn.query(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [BACKUP_LOCK_NAME],
    );

    if (Number(lockRow?.acquired) !== 1) {
      throw new DatabaseRestoreError(
        "Another database backup or restore is already in progress.",
        { statusCode: 409, code: "DATABASE_MAINTENANCE_IN_PROGRESS" },
      );
    }
    lockAcquired = true;

    await assertTargetDatabase(conn);
    await assertSchemaCompatible(conn, createTableDdls);

    destructiveRestoreStarted = true;

    for (const statement of statements) {
      await conn.query(statement);
    }

    const expectedTables = [...createTableDdls.keys()];
    await verifyRestoredTables(conn, expectedTables);

    // A backup cannot contain its own backup_logs row because that row is
    // written only after dump generation. Re-register the source and the fresh
    // safety backup so both remain visible/downloadable after restoration.
    await ensureBackupRecord(conn, {
      type: backupRow.type,
      fileName: backupRow.file_name,
      sizeKb: backupRow.file_size_kb,
      storagePath: backupRow.storage_path,
      createdAt: backupRow.created_at,
      notes: "Restore source backup re-registered after database restoration.",
    });

    await ensureBackupRecord(conn, {
      type: "manual",
      fileName: safetyBackup.fileName,
      sizeKb: safetyBackup.sizeKb,
      storagePath: safetyBackup.storagePath,
      createdAt: new Date(),
      notes: `Pre-restore safety backup created before restoring ${backupRow.file_name}.`,
    });

    return {
      restoredBackupId: parsedBackupId,
      restoredFileName: backupRow.file_name,
      restoredTableCount: expectedTables.length,
      safetyBackup: {
        fileName: safetyBackup.fileName,
        sizeKb: safetyBackup.sizeKb,
        storage: safetyBackup.storage,
        storagePath: safetyBackup.storagePath,
      },
    };
  } catch (error) {
    if (safetyBackup?.fileName) {
      error.safetyBackup = {
        fileName: safetyBackup.fileName,
        sizeKb: safetyBackup.sizeKb,
        storage: safetyBackup.storage,
        storagePath: safetyBackup.storagePath,
      };
    }
    error.destructiveRestoreStarted = destructiveRestoreStarted;
    throw error;
  } finally {
    if (lockAcquired && conn) {
      try {
        await conn.query("SELECT RELEASE_LOCK(?) AS released", [BACKUP_LOCK_NAME]);
      } catch (error) {
        console.error("[RESTORE] Failed to release database maintenance lock:", error.message);
      }
    }

    if (conn) conn.release();
    restoreInProgress = false;
  }
}

module.exports = {
  DatabaseRestoreError,
  isDatabaseRestoreEnabled,
  isDatabaseRestoreInProgress,
  runDatabaseRestore,
};
