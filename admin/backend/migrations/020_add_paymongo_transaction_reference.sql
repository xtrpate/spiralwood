ALTER TABLE `payment_transactions`
  ADD COLUMN `paymongo_reference`
    VARCHAR(128)
    NULL
    DEFAULT NULL
    AFTER `proof_url`;

ALTER TABLE `payment_transactions`
  ADD UNIQUE KEY `uq_payment_transactions_order_paymongo_reference`
    (`order_id`, `paymongo_reference`);