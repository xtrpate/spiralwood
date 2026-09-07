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

function serializeSqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);

  if (value instanceof Date) {
    return `'${value
      .toISOString()
      .slice(0, 19)
      .replace("T", " ")}'`;
  }

  return `'${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")}'`;
}

async function generateSQLDump(conn, filePath) {
  const lines = [];

  lines.push("-- WISDOM Database Backup");
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Database: ${process.env.DB_NAME || "wisdom_db"}`);
  lines.push("");
  lines.push("SET FOREIGN_KEY_CHECKS=0;");
  lines.push('SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";');
  lines.push("");

  const [tables] = await conn.query("SHOW TABLES");
  const tableNames = tables.map((row) => Object.values(row)[0]);

  for (const table of tableNames) {
    const [[createRow]] = await conn.query(
      `SHOW CREATE TABLE \`${table}\``,
    );

    lines.push(`-- Table: ${table}`);
    lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
    lines.push(createRow["Create Table"] + ";");
    lines.push("");

    const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
    if (rows.length === 0) continue;

    const columns = Object.keys(rows[0])
      .map((column) => `\`${column}\``)
      .join(", ");

    const chunkSize = 100;
    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize);
      const values = chunk
        .map(
          (row) =>
            "(" +
            Object.values(row).map(serializeSqlValue).join(", ") +
            ")",
        )
        .join(",\n");

      lines.push(`INSERT INTO \`${table}\` (${columns}) VALUES`);
      lines.push(values + ";");
    }

    lines.push("");
  }

  lines.push("SET FOREIGN_KEY_CHECKS=1;");
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
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

    // Every running backend instance may start the same cron schedule.
    // After the DB-level lock is acquired, suppress another automatic backup
    // from the same five-minute schedule window.
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
      await generateSQLDump(conn, filePath);
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
