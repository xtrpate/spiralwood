-- ============================================================
-- WISDOM Migration 017
-- Production task current hold-state persistence
--
-- Adds current operational hold state to project_tasks.
-- Historical hold/reopen events remain in audit_logs.
-- Existing rows are not modified or deleted.
--
-- IMPORTANT:
-- Apply this migration before restarting/deploying backend code that
-- reads/writes project_tasks.hold_reason and project_tasks.blocked_at.
-- ============================================================

SELECT DATABASE() AS active_database;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'project_tasks'
      AND column_name = 'hold_reason'
  ),
  'SELECT ''project_tasks.hold_reason already exists'' AS migration_note',
  'ALTER TABLE project_tasks ADD COLUMN hold_reason VARCHAR(500) NULL AFTER completed_at'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'project_tasks'
      AND column_name = 'blocked_at'
  ),
  'SELECT ''project_tasks.blocked_at already exists'' AS migration_note',
  'ALTER TABLE project_tasks ADD COLUMN blocked_at DATETIME NULL AFTER hold_reason'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT
  column_name,
  column_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'project_tasks'
  AND column_name IN ('hold_reason', 'blocked_at')
ORDER BY ordinal_position;
