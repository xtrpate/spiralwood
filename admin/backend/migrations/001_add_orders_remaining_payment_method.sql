-- Migration: 001_add_orders_remaining_payment_method.sql
-- Phase 5 — Blueprint Rider Final Cash Collection
--
-- Adds the customer's chosen FINAL/REMAINING payment method for blueprint
-- orders. This is intentionally separate from orders.payment_method, which
-- remains the immutable historical INITIAL payment method and must never
-- be overwritten by remaining-balance selection or rider collection.
--
-- Safe for existing rows: NULL default, no backfill needed. Standard,
-- walk-in, COD, COP, and ready-to-ship orders are unaffected — this column
-- is only ever read/written for order_type = 'blueprint'.
--
-- NOT executed automatically. Run manually against each environment:
--   mysql -u <user> -p <database> < backend/migrations/001_add_orders_remaining_payment_method.sql

ALTER TABLE orders
ADD COLUMN remaining_payment_method
ENUM('cash','paymongo') NULL DEFAULT NULL
AFTER payment_method;