-- ============================================================
-- WISDOM Migration 015
-- Audit-log request context foundation
--
-- Adds additive context columns and query indexes only.
-- Existing audit rows are not updated or deleted.
-- Migration 012 immutability triggers, when present, remain untouched.
--
-- New location fields are intentionally approximate IP-derived metadata.
-- No GPS coordinates or exact addresses are stored here.
-- ============================================================

SELECT DATABASE() AS active_database;

-- ------------------------------------------------------------
-- 1. Add context columns only when missing.
-- MySQL DDL auto-commits, so each statement is individually guarded.
-- ------------------------------------------------------------

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND column_name = 'actor_type'
  ),
  'SELECT ''actor_type already exists'' AS migration_note',
  'ALTER TABLE audit_logs ADD COLUMN actor_type VARCHAR(20) NULL AFTER user_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND column_name = 'user_agent'
  ),
  'SELECT ''user_agent already exists'' AS migration_note',
  'ALTER TABLE audit_logs ADD COLUMN user_agent VARCHAR(512) NULL AFTER ip_address'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND column_name = 'request_method'
  ),
  'SELECT ''request_method already exists'' AS migration_note',
  'ALTER TABLE audit_logs ADD COLUMN request_method VARCHAR(10) NULL AFTER user_agent'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND column_name = 'request_path'
  ),
  'SELECT ''request_path already exists'' AS migration_note',
  'ALTER TABLE audit_logs ADD COLUMN request_path VARCHAR(1000) NULL AFTER request_method'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND column_name = 'response_status'
  ),
  'SELECT ''response_status already exists'' AS migration_note',
  'ALTER TABLE audit_logs ADD COLUMN response_status SMALLINT UNSIGNED NULL AFTER request_path'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND column_name = 'request_id'
  ),
  'SELECT ''request_id already exists'' AS migration_note',
  'ALTER TABLE audit_logs ADD COLUMN request_id CHAR(36) NULL AFTER response_status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND column_name = 'ip_country_code'
  ),
  'SELECT ''ip_country_code already exists'' AS migration_note',
  'ALTER TABLE audit_logs ADD COLUMN ip_country_code CHAR(2) NULL AFTER request_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND column_name = 'ip_region'
  ),
  'SELECT ''ip_region already exists'' AS migration_note',
  'ALTER TABLE audit_logs ADD COLUMN ip_region VARCHAR(120) NULL AFTER ip_country_code'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND column_name = 'ip_city'
  ),
  'SELECT ''ip_city already exists'' AS migration_note',
  'ALTER TABLE audit_logs ADD COLUMN ip_city VARCHAR(120) NULL AFTER ip_region'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 2. Add indexes used by the Audit Logs list/filter/search paths.
-- ------------------------------------------------------------

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND index_name = 'idx_audit_logs_created_at'
  ),
  'SELECT ''idx_audit_logs_created_at already exists'' AS migration_note',
  'CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND index_name = 'idx_audit_logs_user_created'
  ),
  'SELECT ''idx_audit_logs_user_created already exists'' AS migration_note',
  'CREATE INDEX idx_audit_logs_user_created ON audit_logs (user_id, created_at)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND index_name = 'idx_audit_logs_action_created'
  ),
  'SELECT ''idx_audit_logs_action_created already exists'' AS migration_note',
  'CREATE INDEX idx_audit_logs_action_created ON audit_logs (action, created_at)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND index_name = 'idx_audit_logs_table_created'
  ),
  'SELECT ''idx_audit_logs_table_created already exists'' AS migration_note',
  'CREATE INDEX idx_audit_logs_table_created ON audit_logs (table_name, created_at)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND index_name = 'idx_audit_logs_ip_created'
  ),
  'SELECT ''idx_audit_logs_ip_created already exists'' AS migration_note',
  'CREATE INDEX idx_audit_logs_ip_created ON audit_logs (ip_address, created_at)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'audit_logs'
      AND index_name = 'idx_audit_logs_request_id'
  ),
  'SELECT ''idx_audit_logs_request_id already exists'' AS migration_note',
  'CREATE INDEX idx_audit_logs_request_id ON audit_logs (request_id)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 3. Verification only. Expected: all 9 context columns + 6 indexes.
-- ------------------------------------------------------------
SELECT
  column_name,
  column_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'audit_logs'
  AND column_name IN (
    'actor_type',
    'user_agent',
    'request_method',
    'request_path',
    'response_status',
    'request_id',
    'ip_country_code',
    'ip_region',
    'ip_city'
  )
ORDER BY ordinal_position;

SELECT
  index_name,
  GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ', ') AS indexed_columns
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'audit_logs'
  AND index_name IN (
    'idx_audit_logs_created_at',
    'idx_audit_logs_user_created',
    'idx_audit_logs_action_created',
    'idx_audit_logs_table_created',
    'idx_audit_logs_ip_created',
    'idx_audit_logs_request_id'
  )
GROUP BY index_name
ORDER BY index_name;

-- Migration 012 verification. Expected two rows if immutability was applied.
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema = DATABASE()
  AND event_object_table = 'audit_logs'
  AND trigger_name IN (
    'audit_logs_prevent_update',
    'audit_logs_prevent_delete'
  )
ORDER BY trigger_name;
