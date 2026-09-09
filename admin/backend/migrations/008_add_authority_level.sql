-- ============================================================
-- WISDOM Migration 008
-- Add users.authority_level safely
--
-- Safe to run on:
--   1. A fresh database
--   2. A database where authority_level already exists
--
-- IMPORTANT:
-- Existing authority assignments are NOT overwritten when the
-- column already exists.
-- ============================================================

SET @authority_column_exists := (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND column_name = 'authority_level'
);

SET @add_authority_column_sql := IF(
    @authority_column_exists = 0,
    'ALTER TABLE users
       ADD COLUMN authority_level
       ENUM(''user'', ''manager'', ''admin'')
       NOT NULL DEFAULT ''user''
       AFTER role',
    'SELECT 1'
);

PREPARE add_authority_column
FROM @add_authority_column_sql;

EXECUTE add_authority_column;

DEALLOCATE PREPARE add_authority_column;


-- ============================================================
-- Only initialize existing administrator accounts when the
-- column was actually newly created by this migration.
--
-- If the column already existed, preserve all current authority
-- assignments exactly as they are.
-- ============================================================

SET @initialize_authority_sql := IF(
    @authority_column_exists = 0,
    'UPDATE users
       SET authority_level =
         CASE
           WHEN role = ''admin'' THEN ''admin''
           ELSE ''user''
         END',
    'SELECT 1'
);

PREPARE initialize_authority
FROM @initialize_authority_sql;

EXECUTE initialize_authority;

DEALLOCATE PREPARE initialize_authority;