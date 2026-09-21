-- Migration: 003_add_order_checkout_idempotency.sql
-- Prevents duplicate standard checkout orders when a client retries the same
-- request after a timeout or lost response.

ALTER TABLE orders
  ADD COLUMN checkout_idempotency_key VARCHAR(128) NULL;

CREATE UNIQUE INDEX uq_orders_checkout_idempotency_key
  ON orders (checkout_idempotency_key);
