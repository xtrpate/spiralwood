-- WISDOM Account Management Hardening V1.0.5
-- MySQL Workbench migration. DATABASE CHANGE IS NOT RUN BY THE CODE INSTALLER.
-- Safe to execute more than once: it only adds must_change_password when missing.
-- Existing users keep DEFAULT 0, so current accounts are not forced into a password change.
-- Existing customer phone values are intentionally NOT rewritten.

USE `defaultdb`;

SELECT DATABASE() AS active_database;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME IN ('pending_phone', 'must_change_password')
ORDER BY COLUMN_NAME;

SET @wisdom_has_must_change_password := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'must_change_password'
);

SET @wisdom_sql := IF(
  @wisdom_has_must_change_password = 0,
  'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password',
  'SELECT ''must_change_password already exists; no ALTER needed.'' AS migration_status'
);

PREPARE wisdom_stmt FROM @wisdom_sql;
EXECUTE wisdom_stmt;
DEALLOCATE PREPARE wisdom_stmt;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'must_change_password';
