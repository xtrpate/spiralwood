-- WISDOM Pickup Fulfillment V2.3.12
-- Manual migration. Apply this once to the same database used by the WISDOM backend.
-- Existing rows remain backward-compatible: NULL fulfillment_method is treated as Delivery in application logic.

ALTER TABLE orders
  MODIFY COLUMN status ENUM(
    'pending',
    'confirmed',
    'contract_released',
    'production',
    'ready_for_pickup',
    'shipping',
    'delivered',
    'completed',
    'cancelled'
  ) NOT NULL DEFAULT 'pending',
  ADD COLUMN fulfillment_method ENUM('delivery','pickup') NULL DEFAULT NULL AFTER order_type,
  ADD COLUMN picked_up_at DATETIME NULL AFTER cancelled_at,
  ADD COLUMN picked_up_by INT NULL AFTER picked_up_at,
  ADD INDEX idx_orders_fulfillment_method (fulfillment_method),
  ADD INDEX idx_orders_picked_up_by (picked_up_by),
  ADD CONSTRAINT fk_orders_picked_up_by
    FOREIGN KEY (picked_up_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE pickup_acknowledgements (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  received_by_name VARCHAR(150) NOT NULL,
  recipient_type ENUM('customer','authorized_representative') NOT NULL DEFAULT 'customer',
  signature_data MEDIUMTEXT NOT NULL,
  acknowledgement_text VARCHAR(500) NOT NULL,
  note VARCHAR(500) NULL,
  released_by INT NULL,
  acknowledged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pickup_ack_order (order_id),
  KEY idx_pickup_ack_released_by (released_by),
  CONSTRAINT fk_pickup_ack_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_pickup_ack_released_by
    FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
