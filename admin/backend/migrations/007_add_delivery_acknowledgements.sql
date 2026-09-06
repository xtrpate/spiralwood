-- WISDOM Delivery E-Signature V1.0.0
-- Additive migration only. Existing deliveries, orders, payments, and proofs are not modified.
-- Apply once to the same database used by the WISDOM backend.

CREATE TABLE delivery_acknowledgements (
  id INT NOT NULL AUTO_INCREMENT,
  delivery_id INT NOT NULL,
  received_by_name VARCHAR(150) NOT NULL,
  recipient_type ENUM('customer','authorized_representative') NOT NULL DEFAULT 'customer',
  signature_data MEDIUMTEXT NOT NULL,
  signature_mime VARCHAR(30) NOT NULL DEFAULT 'image/png',
  acknowledgement_text VARCHAR(500) NOT NULL,
  note VARCHAR(500) NULL,
  captured_by INT NULL,
  acknowledged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_at DATETIME NULL,
  voided_by INT NULL,
  void_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_delivery_ack_delivery (delivery_id),
  KEY idx_delivery_ack_active (delivery_id, voided_at),
  KEY idx_delivery_ack_captured_by (captured_by),
  KEY idx_delivery_ack_voided_by (voided_by),
  CONSTRAINT fk_delivery_ack_delivery
    FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
  CONSTRAINT fk_delivery_ack_captured_by
    FOREIGN KEY (captured_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_delivery_ack_voided_by
    FOREIGN KEY (voided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
