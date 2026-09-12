-- WISDOM Digital Delivery Receipt V3.2.0
-- Additive migration built on top of 007_add_delivery_acknowledgements.sql.
-- Existing delivery acknowledgement rows, signatures, POD files, void history,
-- orders, and payment transactions remain untouched.
--
-- The guarded migrate.js runner inspects the live schema first and only applies
-- missing/required clauses. This SQL file documents the intended final schema.

ALTER TABLE delivery_acknowledgements
  MODIFY signature_data MEDIUMTEXT NULL,
  MODIFY signature_mime VARCHAR(30) NULL DEFAULT NULL,
  ADD COLUMN receipt_number VARCHAR(40) NULL AFTER note,
  ADD COLUMN receipt_snapshot_json LONGTEXT NULL AFTER receipt_number,
  ADD UNIQUE KEY uq_delivery_ack_receipt_number (receipt_number);

-- Expected result:
--   - recipient e-signature is optional
--   - historical signatures are preserved
--   - each new active handoff may receive one stable DR number
--   - the professional Delivery Receipt uses a frozen JSON snapshot
--   - voided acknowledgements remain historical records
