-- ============================================================
-- WISDOM Migration 021
-- Immutable per-order Warranty policy snapshot
--
-- Purpose:
--   Future Website Settings changes must not retroactively shorten or extend
--   the warranty promised to an existing order.
--
-- Binding rules used by application code after this migration:
--   - standard online / POS orders: bind when the order is created
--   - blueprint orders: bind when the Project Agreement is created
--   - actual pickup/delivery remains the warranty START date
--
-- Historical backfill evidence for the current project database:
--   - warranty_period_days = 365 and warranty_policy_version = 2
--   - existing Project Agreements use one-year handoff-based warranty wording
--
-- Safety:
--   - existing warranty claims and warranties.warranty_expiry are untouched
--   - blueprint requests with NO Project Agreement remain NULL and will bind
--     only when their future Project Agreement is created
-- ============================================================

ALTER TABLE orders
  ADD COLUMN warranty_period_days_snapshot SMALLINT UNSIGNED NULL
    AFTER checkout_idempotency_key,
  ADD COLUMN warranty_policy_version_snapshot VARCHAR(32) NULL
    AFTER warranty_period_days_snapshot,
  ADD COLUMN warranty_policy_effective_at DATETIME NULL
    AFTER warranty_policy_version_snapshot;

-- Legacy STANDARD orders were transacted under the historical 365-day / v2
-- policy. Their order creation time is the policy binding record; handoff is
-- still calculated separately by the Warranty engine.
UPDATE orders
SET warranty_period_days_snapshot = 365,
    warranty_policy_version_snapshot = '2',
    warranty_policy_effective_at = created_at
WHERE order_type = 'standard'
  AND warranty_period_days_snapshot IS NULL
  AND warranty_policy_version_snapshot IS NULL
  AND warranty_policy_effective_at IS NULL;

-- Legacy BLUEPRINT orders bind only when a Project Agreement already exists.
-- Use the earliest agreement creation timestamp as the historical policy event.
UPDATE orders o
INNER JOIN (
  SELECT order_id, MIN(created_at) AS agreement_created_at
  FROM contracts
  WHERE order_id IS NOT NULL
  GROUP BY order_id
) c ON c.order_id = o.id
SET o.warranty_period_days_snapshot = 365,
    o.warranty_policy_version_snapshot = '2',
    o.warranty_policy_effective_at = c.agreement_created_at
WHERE o.order_type = 'blueprint'
  AND o.warranty_period_days_snapshot IS NULL
  AND o.warranty_policy_version_snapshot IS NULL
  AND o.warranty_policy_effective_at IS NULL;
