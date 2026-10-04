-- WISDOM Custom Furniture Cancellation / Withdrawal Resolution V1.0.0
-- REQUIRED before applying the matching application-code patch.
-- This migration does NOT alter historical cancellation rows; existing rows
-- remain NULL and are treated as legacy/unclassified history.

ALTER TABLE custom_cancellation_requests
  ADD COLUMN resolution_type
    ENUM('pre_production_cancellation','post_production_withdrawal')
    NULL DEFAULT NULL
    AFTER order_status_at_request,
  ADD COLUMN order_status_at_review
    VARCHAR(50)
    NULL DEFAULT NULL
    AFTER resolution_type,
  ADD KEY idx_custom_cancel_resolution
    (resolution_type, status, reviewed_at);
