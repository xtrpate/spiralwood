-- ============================================================
-- WISDOM Migration 019
-- Add PayMongo as a valid payment transaction method
--
-- Reason:
--   Current application code creates payment_transactions rows
--   with payment_method = 'paymongo', but older database schemas
--   only defined:
--     cash, gcash, bank_transfer, cod, cop
--
-- Current live database evidence:
--   payment_transactions.payment_method already includes 'paymongo'.
--
-- This migration makes the repository migration history match the
-- payment flow used by the application and ensures fresh/older
-- environments accept PayMongo payment transactions.
--
-- Scope:
--   Schema only. No payment rows are modified.
-- ============================================================

ALTER TABLE `payment_transactions`
  MODIFY COLUMN `payment_method`
    ENUM(
      'cash',
      'gcash',
      'bank_transfer',
      'cod',
      'cop',
      'paymongo'
    )
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_general_ci
    NOT NULL;