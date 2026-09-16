-- ============================================================
-- WISDOM Migration 014
-- Staff role permission hardening
--
-- Goal:
--   1. Make authority_level='user' permission-neutral.
--   2. Make Staff Role the source of default operational access.
--   3. Preserve intended Customer portal access explicitly through
--      customer role permissions.
--   4. Preserve per-user Custom Access overrides.
--   5. Leave Manager and Super Admin authority grants untouched.
--
-- Effective permission inheritance remains:
--   authority_permissions
--       +
--   role_permissions
--       +
--   user_permission_overrides
--
-- This migration is idempotent for permission grants.
-- Review and run separately after the matching code is deployed.
-- ============================================================

SELECT DATABASE() AS active_database;

START TRANSACTION;

-- ------------------------------------------------------------
-- 1. Standard authority is intentionally permission-neutral.
-- Staff/Customer business access comes from role_permissions.
-- ------------------------------------------------------------
DELETE FROM authority_permissions
WHERE authority_level = 'user';

-- ------------------------------------------------------------
-- 2. Preserve intended Customer portal permissions explicitly.
-- Do not delete other customer role rows here; this migration is
-- focused on Staff defaults and avoids unrelated customer cleanup.
-- ------------------------------------------------------------
INSERT INTO role_permissions (role, staff_type, permission_id)
SELECT 'customer', NULL, p.id
FROM permissions p
WHERE p.permission_key IN (
  'dashboard.view',
  'products.view',
  'orders.create',
  'orders.view',
  'customers.view',
  'appointments.create',
  'appointments.view',
  'warranty.create',
  'warranty.view'
)
AND NOT EXISTS (
  SELECT 1
  FROM role_permissions rp
  WHERE rp.role = 'customer'
    AND rp.staff_type IS NULL
    AND rp.permission_id = p.id
);

-- ------------------------------------------------------------
-- 3. Reset Staff defaults so the assigned Staff Role is the
-- single default source of Staff operational permissions.
--
-- User-specific overrides are intentionally preserved.
-- ------------------------------------------------------------
DELETE FROM role_permissions
WHERE role = 'staff';

-- Cashier
INSERT INTO role_permissions (role, staff_type, permission_id)
SELECT 'staff', 'cashier', p.id
FROM permissions p
WHERE p.permission_key IN (
  'dashboard.view',
  'products.view',
  'orders.view',
  'orders.manage',
  'sales_report.view',
  'sales_report.export'
);

-- Furniture Specialist (internal staff_type = indoor)
INSERT INTO role_permissions (role, staff_type, permission_id)
SELECT 'staff', 'indoor', p.id
FROM permissions p
WHERE p.permission_key IN (
  'dashboard.view',
  'products.view',
  'task_assignments.view',
  'appointments.view',
  'appointments.manage'
);

-- Delivery Staff
INSERT INTO role_permissions (role, staff_type, permission_id)
SELECT 'staff', 'delivery_rider', p.id
FROM permissions p
WHERE p.permission_key IN (
  'dashboard.view',
  'delivery_scheduling.view',
  'delivery_scheduling.edit'
);

COMMIT;

-- ------------------------------------------------------------
-- 4. Verification queries.
-- ------------------------------------------------------------

-- Expected: 0 rows.
SELECT ap.authority_level, p.permission_key
FROM authority_permissions ap
INNER JOIN permissions p ON p.id = ap.permission_id
WHERE ap.authority_level = 'user'
ORDER BY p.permission_key;

-- Expected exact Staff defaults:
-- cashier:
--   dashboard.view
--   orders.manage
--   orders.view
--   products.view
--   sales_report.export
--   sales_report.view
--
-- indoor:
--   appointments.manage
--   appointments.view
--   dashboard.view
--   products.view
--   task_assignments.view
--
-- delivery_rider:
--   dashboard.view
--   delivery_scheduling.edit
--   delivery_scheduling.view
SELECT
  rp.role,
  rp.staff_type,
  p.permission_key
FROM role_permissions rp
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE rp.role = 'staff'
ORDER BY rp.staff_type, p.permission_key;

-- Customer portal permissions are explicit after Standard becomes
-- permission-neutral. Existing customer-specific role grants are
-- otherwise preserved.
SELECT
  rp.role,
  rp.staff_type,
  p.permission_key
FROM role_permissions rp
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE rp.role = 'customer'
  AND rp.staff_type IS NULL
ORDER BY p.permission_key;
