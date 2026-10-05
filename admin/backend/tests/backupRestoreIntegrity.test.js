const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  splitSqlStatements,
  validateWisdomBackupSql,
  normalizeCreateTableDdl,
} = require("../utils/backupRestoreSql");

const backendRoot = path.resolve(__dirname, "..");
const adminRoot = path.resolve(backendRoot, "..");

const read = (relativePath) =>
  fs.readFileSync(path.join(adminRoot, relativePath), "utf8");

const sampleSql = `-- WISDOM Database Backup
-- Generated: 2026-10-05T00:00:00.000Z
-- Database: wisdom_db
SET @WISDOM_OLD_FOREIGN_KEY_CHECKS=@@SESSION.foreign_key_checks;
SET FOREIGN_KEY_CHECKS=0;
SET SESSION sql_mode='NO_AUTO_VALUE_ON_ZERO,ANSI_QUOTES';
SET SESSION time_zone='+00:00';
-- Table: sample
DROP TABLE IF EXISTS \`sample\`;
CREATE TABLE \`sample\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`value\` varchar(255) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=utf8mb4;
INSERT INTO \`sample\` (\`id\`, \`value\`) VALUES
(1, 'semi;colon'),
(2, 'quote\\'still-safe');
SET FOREIGN_KEY_CHECKS=@WISDOM_OLD_FOREIGN_KEY_CHECKS;`;

const parsed = validateWisdomBackupSql(sampleSql);
assert.strictEqual(parsed.createTableDdls.size, 1);
assert.ok(parsed.createTableDdls.has("sample"));
assert.strictEqual(
  parsed.statements.filter((statement) => statement.includes("INSERT INTO")).length,
  1,
);
assert.ok(splitSqlStatements(sampleSql).length >= 7);

assert.strictEqual(
  normalizeCreateTableDdl(
    "CREATE TABLE `sample` (`id` int NOT NULL) ENGINE=InnoDB AUTO_INCREMENT=99 DEFAULT CHARSET=utf8mb4",
  ),
  normalizeCreateTableDdl(
    "CREATE TABLE `sample` (`id` int NOT NULL) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4",
  ),
);

assert.throws(
  () =>
    validateWisdomBackupSql(
      "-- WISDOM Database Backup\nDROP DATABASE `wisdom_db`;",
    ),
  /unsupported SQL statement/i,
);

const backupService = read("backend/services/databaseBackupService.js");
assert.match(backupService, /BACKUP_LOCK_NAME/);
assert.match(backupService, /module\.exports[\s\S]*BACKUP_LOCK_NAME/);

const restoreService = read("backend/services/databaseRestoreService.js");
assert.match(restoreService, /BACKUP_RESTORE_ENABLED/);
assert.match(restoreService, /BACKUP_RESTORE_ALLOW_REMOTE/);
assert.match(restoreService, /REMOTE_DATABASE_RESTORE_DISABLED/);
assert.match(restoreService, /isLoopbackDatabaseHost/);
assert.match(restoreService, /assertRemoteRestoreAllowed\(\);/);
assert.match(restoreService, /runDatabaseBackup/);
assert.match(restoreService, /assertSchemaCompatible/);
assert.match(restoreService, /GET_LOCK/);
assert.match(restoreService, /verifyRestoredTables/);
assert.match(restoreService, /Pre-restore safety backup/);

const websiteController = read("backend/controllers/admin/websiteController.js");
assert.match(websiteController, /exports\.restoreBackup/);
assert.match(websiteController, /confirmation[\s\S]*RESTORE/);
assert.match(websiteController, /database_restore_success/);
assert.match(websiteController, /database_restore_failed/);

const routes = read("backend/routes/admin.js");
assert.match(
  routes,
  /\/backup\/restore\/:id[\s\S]*requirePermission\("backup\.manage"\)[\s\S]*website\.restoreBackup/,
);

const server = read("backend/server.js");
assert.match(server, /isDatabaseRestoreInProgress/);
assert.match(server, /DATABASE_RESTORE_IN_PROGRESS/);

const cron = read("backend/services/cronService.js");
assert.match(cron, /isDatabaseRestoreInProgress/);
assert.match(cron, /Skipping POS QR cleanup during database restore/);

const backupPage = read("frontend/src/pages/backup/BackupPage.jsx");
assert.match(backupPage, /backup\.manage/);
assert.match(backupPage, /Restore Backup/);
assert.match(backupPage, /expected_filename/);
assert.match(backupPage, /restoreConfirmation !== "RESTORE"/);
assert.match(backupPage, /!restoreAcknowledged/);
assert.match(backupPage, /I understand that newer data may be lost/);

console.log("PASS backupRestoreIntegrity.test.js");
