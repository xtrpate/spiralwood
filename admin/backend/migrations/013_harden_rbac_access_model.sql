-- ============================================================
-- WISDOM Migration 013
-- RBAC / internal account access hardening
--
-- Intended model:
--   Super Admin  = role 'admin' + authority_level 'admin'
--   Manager      = role 'admin' + authority_level 'manager'
--   Staff        = role 'staff' + authority_level 'user'
--   Customer     = role 'customer' + authority_level 'user'
--
-- Safe goals:
--   1. Normalize legacy invalid role/authority combinations.
--   2. Enforce valid combinations at the database layer.
--   3. Keep Managers able to manage ordinary Staff accounts.
--   4. Keep Custom Access and authority escalation Super-Admin-only.
--   5. Retire legacy cancellations_refunds grants in favor of
--      cancellations.view / cancellations.manage.
--
-- This migration is idempotent. Review before running in production.
-- ============================================================

SELECT DATABASE() AS active_database;

-- ------------------------------------------------------------
-- 1. Normalize current user rows before adding the CHECK.
-- ------------------------------------------------------------
UPDATE users
SET authority_level = 'user'
WHERE role IN ('staff', 'customer')
  AND authority_level <> 'user';

UPDATE users
SET authority_level = 'manager'
WHERE role = 'admin'
  AND authority_level = 'user';

UPDATE users
SET staff_type = NULL
WHERE role <> 'staff';

-- ------------------------------------------------------------
-- 2. Add a DB-level invariant if it does not already exist.
-- ------------------------------------------------------------
SET @wisdom_rbac_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND CONSTRAINT_NAME = 'chk_users_rbac_access_model'
    AND CONSTRAINT_TYPE = 'CHECK'
);

SET @wisdom_rbac_check_sql := IF(
  @wisdom_rbac_check_exists = 0,
  'ALTER TABLE users
     ADD CONSTRAINT chk_users_rbac_access_model
     CHECK (
       (role = ''admin'' AND authority_level IN (''manager'', ''admin'') AND staff_type IS NULL)
       OR
       (role = ''staff'' AND authority_level = ''user'' AND staff_type IS NOT NULL AND staff_type IN (''cashier'', ''indoor'', ''delivery_rider''))
       OR
       (role = ''customer'' AND authority_level = ''user'' AND staff_type IS NULL)
     )',
  'SELECT ''chk_users_rbac_access_model already exists'' AS migration_status'
);

PREPARE wisdom_rbac_check_stmt FROM @wisdom_rbac_check_sql;
EXECUTE wisdom_rbac_check_stmt;
DEALLOCATE PREPARE wisdom_rbac_check_stmt;

-- ------------------------------------------------------------
-- 3. Manager User Management grants.
-- Managers may manage ordinary Staff accounts only. Controllers
-- enforce target scope; these rows only expose the needed actions.
-- ------------------------------------------------------------
INSERT IGNORE INTO authority_permissions (authority_level, permission_id)
SELECT 'manager', id
FROM permissions
WHERE permission_key IN (
  'users.view',
  'users.create',
  'users.edit',
  'users.delete'
);

DELETE ap
FROM authority_permissions ap
INNER JOIN permissions p ON p.id = ap.permission_id
WHERE ap.authority_level = 'manager'
  AND p.permission_key IN ('users.manage', 'users.authority');

-- ------------------------------------------------------------
-- 4. Canonical cancellation permission keys.
-- Managers may view cancellations. Decisions remain Super Admin.
-- ------------------------------------------------------------
INSERT IGNORE INTO authority_permissions (authority_level, permission_id)
SELECT 'manager', id
FROM permissions
WHERE permission_key = 'cancellations.view';

DELETE ap
FROM authority_permissions ap
INNER JOIN permissions p ON p.id = ap.permission_id
WHERE ap.authority_level = 'manager'
  AND p.permission_key = 'cancellations.manage';

INSERT IGNORE INTO authority_permissions (authority_level, permission_id)
SELECT 'admin', id
FROM permissions
WHERE permission_key IN ('cancellations.view', 'cancellations.manage');

DELETE ap
FROM authority_permissions ap
INNER JOIN permissions p ON p.id = ap.permission_id
WHERE p.permission_key IN (
  'cancellations_refunds.view',
  'cancellations_refunds.manage',
  'cancellations_refunds.export'
);

DELETE rp
FROM role_permissions rp
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE p.permission_key IN (
  'cancellations_refunds.view',
  'cancellations_refunds.manage',
  'cancellations_refunds.export'
);

DELETE upo
FROM user_permission_overrides upo
INNER JOIN permissions p ON p.id = upo.permission_id
WHERE p.permission_key IN (
  'cancellations_refunds.view',
  'cancellations_refunds.manage',
  'cancellations_refunds.export'
);

-- ------------------------------------------------------------
-- 5. Verification queries.
-- ------------------------------------------------------------
SELECT id, name, role, authority_level, staff_type, is_active
FROM users
WHERE NOT (
  (role = 'admin' AND authority_level IN ('manager', 'admin') AND staff_type IS NULL)
  OR
  (role = 'staff' AND authority_level = 'user' AND staff_type IS NOT NULL AND staff_type IN ('cashier', 'indoor', 'delivery_rider'))
  OR
  (role = 'customer' AND authority_level = 'user' AND staff_type IS NULL)
)
ORDER BY id;

SELECT ap.authority_level, p.permission_key
FROM authority_permissions ap
INNER JOIN permissions p ON p.id = ap.permission_id
WHERE p.permission_key LIKE 'users.%'
   OR p.permission_key LIKE 'cancellations%'
ORDER BY ap.authority_level, p.permission_key;
