// services/databaseBackupService.js
// Shared database-backup engine for both scheduled and manual backups.
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

const BACKUP_LOCK_NAME = "wisdom_database_backup_v1";
const AUTO_DEDUPE_MINUTES = 5;

class BackupBusyError extends Error {
  constructor(message = "Another database backup is already in progress.") {
    super(message);
    this.name = "BackupBusyError";
    this.code = "BACKUP_IN_PROGRESS";
    this.statusCode = 409;
  }
}

function getBackupDirectory() {
  const backendRoot = path.resolve(__dirname, "..");
  const configured = process.env.BACKUP_DIR;

  if (!configured) return path.join(backendRoot, "backups");
  if (path.isAbsolute(configured)) return path.normalize(configured);

  return path.resolve(backendRoot, configured);
}

// WISDOM BACKUP SERIALIZATION SAFETY V1.0.4
// Keep SQL literals round-trip safe for JSON, generated columns, binary data,
// exact DECIMAL/BIGINT values, control characters, and UTC TIMESTAMP restores.
function quoteSqlIdentifier(value) {
  return `\`${String(value).replace(/\`/g, "\`\`")}\``;
}

function serializeSqlString(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\u0000/g, "\\0")
    .replace(/\u0008/g, "\\b")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\u001a/g, "\\Z")
    .replace(/'/g, "\\'");
}

function serializeSqlValue(value) {
  if (value === null || value === undefined) return "NULL";

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString("hex")}'`;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot serialize a non-finite numeric backup value.");
    }
    return String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  if (value instanceof Date) {
    return `'${value
      .toISOString()
      .slice(0, 19)
      .replace("T", " ")}'`;
  }

  if (typeof value === "object") {
    const json = JSON.stringify(value);
    if (json === undefined) {
      throw new Error("Cannot serialize an unsupported structured backup value.");
    }
    return `'${serializeSqlString(json)}'`;
  }

  return `'${serializeSqlString(value)}'`;
}

function getBaseMysqlType(typeValue) {
  return String(typeValue || "")
    .trim()
    .toLowerCase()
    .split("(")[0]
    .trim();
}

// WISDOM BACKUP GENERATED COLUMN CLASSIFICATION V1.0.5
// DEFAULT_GENERATED is an ordinary default expression. Only actual
// VIRTUAL/STORED GENERATED columns must be excluded from INSERT statements.
function isGeneratedColumn(column) {
  const extra = String(column?.Extra || "").toLowerCase();

  return (
    extra.includes("virtual generated") ||
    extra.includes("stored generated")
  );
}

function buildBackupSelectExpression(column) {
  const identifier = quoteSqlIdentifier(column.Field);
  const baseType = getBaseMysqlType(column.Type);

  if (baseType === "json") {
    return `CAST(${identifier} AS CHAR CHARACTER SET utf8mb4) AS ${identifier}`;
  }

  if (
    baseType === "decimal" ||
    baseType === "numeric" ||
    baseType === "bigint"
  ) {
    return `CAST(${identifier} AS CHAR) AS ${identifier}`;
  }

  return identifier;
}

async function generateSQLDump(conn, filePath) {
  const lines = [];

  lines.push("-- WISDOM Database Backup");
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Database: ${process.env.DB_NAME || "wisdom_db"}`);
  lines.push("");

  lines.push(
    "SET @WISDOM_OLD_FOREIGN_KEY_CHECKS=@@SESSION.foreign_key_checks;",
  );
  lines.push("SET @WISDOM_OLD_SQL_MODE=@@SESSION.sql_mode;");
  lines.push("SET @WISDOM_OLD_TIME_ZONE=@@SESSION.time_zone;");
  lines.push("SET FOREIGN_KEY_CHECKS=0;");
  lines.push(
    "SET SESSION sql_mode='NO_AUTO_VALUE_ON_ZERO,ANSI_QUOTES';",
  );
  lines.push("SET SESSION time_zone='+00:00';");
  lines.push("");

  const [tables] = await conn.query("SHOW TABLES");
  const tableNames = tables.map((row) => Object.values(row)[0]);

  for (const table of tableNames) {
    const tableIdentifier = quoteSqlIdentifier(table);

    const [[createRow]] = await conn.query(
      `SHOW CREATE TABLE ${tableIdentifier}`,
    );

    lines.push(`-- Table: ${table}`);
    lines.push(`DROP TABLE IF EXISTS ${tableIdentifier};`);
    lines.push(createRow["Create Table"] + ";");
    lines.push("");

    const [columnRows] = await conn.query(
      `SHOW FULL COLUMNS FROM ${tableIdentifier}`,
    );

    const insertableColumns = columnRows.filter(
      (column) => !isGeneratedColumn(column),
    );

    if (insertableColumns.length === 0) {
      lines.push("");
      continue;
    }

    const selectList = insertableColumns
      .map(buildBackupSelectExpression)
      .join(", ");

    const [rows] = await conn.query(
      `SELECT ${selectList} FROM ${tableIdentifier}`,
    );

    if (rows.length === 0) {
      lines.push("");
      continue;
    }

    const columns = insertableColumns
      .map((column) => quoteSqlIdentifier(column.Field))
      .join(", ");

    const chunkSize = 100;
    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize);

      const values = chunk
        .map(
          (row) =>
            "(" +
            insertableColumns
              .map((column) => serializeSqlValue(row[column.Field]))
              .join(", ") +
            ")",
        )
        .join(",\n");

      lines.push(`INSERT INTO ${tableIdentifier} (${columns}) VALUES`);
      lines.push(values + ";");
    }

    lines.push("");
  }

  lines.push(
    "SET FOREIGN_KEY_CHECKS=@WISDOM_OLD_FOREIGN_KEY_CHECKS;",
  );
  lines.push("SET SESSION time_zone=@WISDOM_OLD_TIME_ZONE;");
  lines.push("SET SESSION sql_mode=@WISDOM_OLD_SQL_MODE;");

  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

// WISDOM BACKUP CONSISTENT SNAPSHOT V1.0.6
// Read the live InnoDB data through one REPEATABLE READ consistent snapshot.
async function generateConsistentSQLDump(conn, filePath) {
  let snapshotStarted = false;

  try {
    await conn.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
    );
    await conn.query(
      "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
    );
    snapshotStarted = true;

    await generateSQLDump(conn, filePath);

    await conn.commit();
    snapshotStarted = false;
  } catch (error) {
    if (snapshotStarted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "[BACKUP] Failed to roll back consistent snapshot:",
          rollbackError.message,
        );
      }
    }

    throw error;
  }
}

async function hasRecentAutomaticBackup(conn) {
  const [[row]] = await conn.query(
    `SELECT id
       FROM backup_logs
       WHERE type = 'auto'
         AND created_at >= DATE_SUB(NOW(), INTERVAL ${AUTO_DEDUPE_MINUTES} MINUTE)
       ORDER BY id DESC
       LIMIT 1`,
  );

  return row || null;
}

async function runDatabaseBackup({
  type = "auto",
  triggeredBy = null,
} = {}) {
  if (!["auto", "manual"].includes(type)) {
    const error = new Error("Invalid backup type.");
    error.statusCode = 400;
    throw error;
  }

  const conn = await pool.getConnection();
  let lockAcquired = false;

  try {
    const [[lockRow]] = await conn.query(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [BACKUP_LOCK_NAME],
    );

    if (Number(lockRow?.acquired) !== 1) {
      throw new BackupBusyError();
    }

    lockAcquired = true;

    if (type === "auto") {
      const recent = await hasRecentAutomaticBackup(conn);
      if (recent) {
        return {
          skipped: true,
          reason: "recent_auto_backup_exists",
          existingLogId: recent.id,
        };
      }
    }

    const backupDir = getBackupDirectory();
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `wisdom_backup_${type}_${timestamp}.sql`;
    const filePath = path.join(backupDir, fileName);

    let backupError = null;
    let sizeKb = 0;

    try {
      await generateConsistentSQLDump(conn, filePath);
      sizeKb = fs.existsSync(filePath)
        ? Math.round(fs.statSync(filePath).size / 1024)
        : 0;
    } catch (error) {
      backupError = error?.message || "Unknown backup error.";
    }

    const status = backupError ? "failed" : "success";
    const parsedTriggeredBy = Number(triggeredBy);
    const safeTriggeredBy =
      Number.isInteger(parsedTriggeredBy) && parsedTriggeredBy > 0
        ? parsedTriggeredBy
        : null;

    const [logResult] = await conn.query(
      `INSERT INTO backup_logs
         (type, triggered_by, file_name, file_size_kb, storage_path, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        safeTriggeredBy,
        fileName,
        sizeKb,
        filePath,
        status,
        backupError,
      ],
    );

    return {
      skipped: false,
      status,
      error: backupError,
      logId: logResult.insertId,
      fileName,
      filePath,
      sizeKb,
    };
  } finally {
    if (lockAcquired) {
      try {
        await conn.query("SELECT RELEASE_LOCK(?) AS released", [
          BACKUP_LOCK_NAME,
        ]);
      } catch (error) {
        console.error("[BACKUP] Failed to release backup lock:", error.message);
      }
    }

    conn.release();
  }
}

module.exports = {
  BackupBusyError,
  getBackupDirectory,
  runDatabaseBackup,
};
