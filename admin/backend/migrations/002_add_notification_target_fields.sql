-- Migration: 002_add_notification_target_fields.sql
-- Notification Click-Navigation Feature
--
-- Adds nullable navigation target fields to the notifications table so a
-- notification can point at the exact record it is about, without a
-- polymorphic foreign key (target_id intentionally has no FK — it may
-- reference orders, project_tasks, deliveries, appointments, or
-- blueprints depending on target_type. This mirrors the existing
-- FK-less pattern already used by orders.blueprint_id and
-- orders.custom_request_id in this schema).
--
-- target_type   — short string tag: 'order' | 'task' | 'delivery' |
--                  'appointment' | 'custom_request' | 'blueprint_estimation'
-- target_id     — primary key of the record identified by target_type
--                  (semantics only; resolved by the frontend, not stored
--                  as a resolved URL)
-- target_order_id — the orders.id this notification relates to, when
--                  known, kept separate from target_id so an order can
--                  still be recovered even when target_id points at a
--                  task/delivery/etc.
--
-- Safe for existing rows: all three columns are NULL by default, no
-- backfill performed or required. Old notifications keep working —
-- single click still marks them read; double click falls back to the
-- safest list page instead of guessing a record from the message text.
--
-- NOT executed automatically. Run manually against each environment
-- BEFORE deploying/starting the backend that writes these columns:
--   mysql -u <user> -p <database> < backend/migrations/002_add_notification_target_fields.sql

ALTER TABLE notifications
  ADD COLUMN target_type VARCHAR(30) NULL DEFAULT NULL AFTER channel,
  ADD COLUMN target_id INT NULL DEFAULT NULL AFTER target_type,
  ADD COLUMN target_order_id INT NULL DEFAULT NULL AFTER target_id;

-- Rollback (run manually if this migration needs to be reverted):
-- ALTER TABLE notifications
--   DROP COLUMN target_type,
--   DROP COLUMN target_id,
--   DROP COLUMN target_order_id;