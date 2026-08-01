-- Migration: 003_expand_receipts_for_payment_transactions.sql
-- Phase 1 — Professional POS Cash Receipts + Future-Safe Payment Snapshot
--
-- Purpose:
--   1. Allow multiple receipts for one order.
--   2. Allow only one receipt for each payment transaction.
--   3. Make cash fields nullable for legitimate non-cash receipts.
--   4. Prepare snapshot fields for blueprint payment receipts in Phase 2.
--
-- MariaDB 10.4 compatible.
--
-- IMPORTANT:
-- Select the correct database/schema before running this migration.
-- In MySQL Workbench, make sure `defaultdb` is the active schema.
--
-- You may uncomment the following line only for local manual execution:
-- USE `defaultdb`;

-- ============================================================
-- STEP 1
-- Replace UNIQUE(order_id) with a normal order_id index.
--
-- IMPORTANT:
-- Add the normal index FIRST because the existing foreign key
-- requires an index on receipts.order_id.
-- ============================================================

ALTER TABLE `receipts`
  ADD INDEX `idx_receipts_order_id` (`order_id`);

ALTER TABLE `receipts`
  DROP INDEX `order_id`;

-- ============================================================
-- STEP 2
-- Make cash fields nullable.
--
-- Existing values remain unchanged. This only removes the
-- NOT NULL requirement for receipts where cash does not apply.
-- ============================================================

ALTER TABLE `receipts`
  MODIFY COLUMN `cash_received`
    DECIMAL(10,2) NULL DEFAULT NULL,
  MODIFY COLUMN `change_amount`
    DECIMAL(10,2) NULL DEFAULT NULL;

-- ============================================================
-- STEP 3
-- Link each new receipt to its exact payment transaction.
--
-- Existing historical receipts remain NULL because they were
-- created before payment_transaction_id was supported.
-- ============================================================

ALTER TABLE `receipts`
  ADD COLUMN `payment_transaction_id`
    INT NULL DEFAULT NULL
    AFTER `order_id`;

ALTER TABLE `receipts`
  ADD UNIQUE KEY `uq_receipts_payment_transaction_id`
    (`payment_transaction_id`);

ALTER TABLE `receipts`
  ADD CONSTRAINT `receipts_payment_transaction_fk`
  FOREIGN KEY (`payment_transaction_id`)
  REFERENCES `payment_transactions` (`id`);

-- ============================================================
-- STEP 4
-- Add receipt classification and payment snapshot fields.
-- ============================================================

ALTER TABLE `receipts`
  ADD COLUMN `receipt_type`
    ENUM('pos_sale', 'blueprint_payment')
    NOT NULL DEFAULT 'pos_sale'
    AFTER `payment_transaction_id`,

  ADD COLUMN `payment_method_snapshot`
    VARCHAR(30) NULL DEFAULT NULL
    AFTER `receipt_type`,

  ADD COLUMN `payment_label`
    VARCHAR(30) NULL DEFAULT NULL
    COMMENT 'down_payment|partial_payment|balance_payment|full_payment'
    AFTER `payment_method_snapshot`,

  ADD COLUMN `previous_paid_amount`
    DECIMAL(12,2) NULL DEFAULT NULL
    COMMENT 'Verified total before this payment'
    AFTER `payment_label`,

  ADD COLUMN `amount_paid`
    DECIMAL(12,2) NULL DEFAULT NULL
    COMMENT 'Amount covered by this payment transaction'
    AFTER `previous_paid_amount`,

  ADD COLUMN `total_paid_after`
    DECIMAL(12,2) NULL DEFAULT NULL
    COMMENT 'Verified total after this payment'
    AFTER `amount_paid`,

  ADD COLUMN `remaining_balance_after`
    DECIMAL(12,2) NULL DEFAULT NULL
    COMMENT 'Order total minus total_paid_after'
    AFTER `total_paid_after`,

  ADD COLUMN `provider_reference`
    VARCHAR(150) NULL DEFAULT NULL
    COMMENT 'PayMongo session or payment reference when applicable'
    AFTER `remaining_balance_after`;

-- ============================================================
-- VERIFICATION QUERIES
-- Run these separately after the migration succeeds.
-- ============================================================

-- SHOW COLUMNS FROM `receipts`;

-- SHOW INDEX FROM `receipts`;

-- SELECT
--   id,
--   order_id,
--   payment_transaction_id,
--   receipt_type,
--   payment_method_snapshot,
--   cash_received,
--   change_amount
-- FROM `receipts`
-- ORDER BY id;

-- ============================================================
-- EXPECTED RESULT
--
-- Existing historical receipts:
--   payment_transaction_id = NULL
--   receipt_type = 'pos_sale'
--   payment_method_snapshot = NULL
--
-- Expected indexes:
--   idx_receipts_order_id
--     Non_unique = 1
--
--   uq_receipts_payment_transaction_id
--     Non_unique = 0
--
-- The old UNIQUE index named `order_id` should no longer exist.
-- ============================================================


-- ============================================================
-- MANUAL ROLLBACK NOTES
--
-- Do not execute these together with the migration.
-- Use only if the migration must be manually reverted.
-- ============================================================

-- 1. Remove the payment transaction foreign key and unique index.

-- ALTER TABLE `receipts`
--   DROP FOREIGN KEY `receipts_payment_transaction_fk`;

-- ALTER TABLE `receipts`
--   DROP INDEX `uq_receipts_payment_transaction_id`;

-- 2. Remove the new snapshot columns.

-- ALTER TABLE `receipts`
--   DROP COLUMN `provider_reference`,
--   DROP COLUMN `remaining_balance_after`,
--   DROP COLUMN `total_paid_after`,
--   DROP COLUMN `amount_paid`,
--   DROP COLUMN `previous_paid_amount`,
--   DROP COLUMN `payment_label`,
--   DROP COLUMN `payment_method_snapshot`,
--   DROP COLUMN `receipt_type`,
--   DROP COLUMN `payment_transaction_id`;

-- 3. Before restoring NOT NULL cash fields, make sure no row
--    contains NULL values.

-- UPDATE `receipts`
-- SET `cash_received` = 0.00
-- WHERE `cash_received` IS NULL;

-- UPDATE `receipts`
-- SET `change_amount` = 0.00
-- WHERE `change_amount` IS NULL;

-- ALTER TABLE `receipts`
--   MODIFY COLUMN `cash_received`
--     DECIMAL(10,2) NOT NULL DEFAULT '0.00',
--   MODIFY COLUMN `change_amount`
--     DECIMAL(10,2) NOT NULL DEFAULT '0.00';

-- 4. Before restoring UNIQUE(order_id), confirm that no order
--    already has multiple receipt rows.

-- SELECT
--   order_id,
--   COUNT(*) AS receipt_count
-- FROM `receipts`
-- GROUP BY order_id
-- HAVING COUNT(*) > 1;

-- Continue only when the query above returns no rows.

-- Add the old unique index FIRST so the order_id foreign key
-- always has a valid supporting index.

-- ALTER TABLE `receipts`
--   ADD UNIQUE KEY `order_id` (`order_id`);

-- Then remove the Phase 1 normal index.

-- ALTER TABLE `receipts`
--   DROP INDEX `idx_receipts_order_id`;