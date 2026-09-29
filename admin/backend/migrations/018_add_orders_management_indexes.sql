-- ============================================================
-- WISDOM Migration 018
-- Orders Management list-query indexes
--
-- Evidence:
--   Orders Management R1 live EXPLAIN showed full scans + filesort
--   for the default latest-orders list, status-filtered list, and
--   date-filtered list.
--
-- Scope:
--   Add indexes only. No row data is changed.
-- ============================================================

CREATE INDEX idx_orders_created_at
  ON orders (created_at);

CREATE INDEX idx_orders_status_created_at
  ON orders (status, created_at);
