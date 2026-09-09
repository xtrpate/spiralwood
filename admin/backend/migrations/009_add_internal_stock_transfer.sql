-- WISDOM Internal Stock Transfer V1.0.0
-- One physical Spiral Wood site with two operational ready-made areas:
-- Warehouse / Production and Sales / Display.
-- products.stock remains the company-wide ready-made total.
-- ready_made_display_stock.quantity tracks only the Sales / Display allocation.
-- Warehouse quantity is derived as products.stock - display quantity.

CREATE TABLE IF NOT EXISTS ready_made_display_stock (
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id),
  CONSTRAINT fk_ready_made_display_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT chk_ready_made_display_nonnegative CHECK (quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Existing ready-made inventory starts in Warehouse / Production.
-- No historical quantity is guessed as already displayed.
INSERT INTO ready_made_display_stock (product_id, quantity)
SELECT p.id, 0
FROM products p
WHERE LOWER(COALESCE(p.type, 'standard')) = 'standard'
ON DUPLICATE KEY UPDATE product_id = VALUES(product_id);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id INT NOT NULL AUTO_INCREMENT,
  reference_code VARCHAR(60) NOT NULL,
  direction ENUM('warehouse_to_display','display_to_warehouse') NOT NULL,
  reason VARCHAR(500) NOT NULL,
  transferred_by INT NULL,
  reversal_of_transfer_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_transfer_reference (reference_code),
  UNIQUE KEY uq_stock_transfer_reversal (reversal_of_transfer_id),
  KEY idx_stock_transfer_created_at (created_at),
  KEY idx_stock_transfer_direction_created (direction, created_at),
  KEY idx_stock_transfer_actor (transferred_by),
  CONSTRAINT fk_stock_transfer_actor
    FOREIGN KEY (transferred_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_stock_transfer_reversal
    FOREIGN KEY (reversal_of_transfer_id) REFERENCES stock_transfers(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id INT NOT NULL AUTO_INCREMENT,
  transfer_id INT NOT NULL,
  product_id INT NULL,
  product_name_snapshot VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  total_stock_snapshot INT NOT NULL,
  warehouse_before INT NOT NULL,
  display_before INT NOT NULL,
  warehouse_after INT NOT NULL,
  display_after INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_transfer_item_product (transfer_id, product_id),
  KEY idx_stock_transfer_item_product (product_id),
  CONSTRAINT fk_stock_transfer_item_transfer
    FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_transfer_item_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT chk_stock_transfer_item_quantity CHECK (quantity > 0),
  CONSTRAINT chk_stock_transfer_item_snapshots CHECK (
    total_stock_snapshot >= 0
    AND warehouse_before >= 0
    AND display_before >= 0
    AND warehouse_after >= 0
    AND display_after >= 0
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
