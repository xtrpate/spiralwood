-- WISDOM Custom Furniture Cancellation Request V1.0.0
-- Admin-reviewed cancellation workflow for blueprint/custom furniture orders.
-- This table stores cancellation decisions only. It has NO refund fields.
-- Existing payment_transactions remain the payment source of truth.

CREATE TABLE IF NOT EXISTS custom_cancellation_requests (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  requested_by INT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('pending','approved','declined') NOT NULL DEFAULT 'pending',
  order_status_at_request VARCHAR(50) NOT NULL,
  reviewed_by INT NULL,
  review_note VARCHAR(500) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_custom_cancel_order_status (order_id, status, id),
  KEY idx_custom_cancel_status_requested (status, requested_at, id),
  KEY idx_custom_cancel_requested_by (requested_by),
  KEY idx_custom_cancel_reviewed_by (reviewed_by),
  CONSTRAINT fk_custom_cancel_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_custom_cancel_requested_by
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_custom_cancel_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
