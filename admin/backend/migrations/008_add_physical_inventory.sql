-- WISDOM Physical Inventory V1.0.0
-- Additive migration only. Existing raw materials and stock movements are not modified.
-- Physical inventory sessions preserve system snapshots, physical counts, reasons,
-- actors, timestamps, and links to the resulting stock adjustment movements.

CREATE TABLE IF NOT EXISTS physical_inventory_sessions (
  id INT NOT NULL AUTO_INCREMENT,
  reference_code VARCHAR(60) NOT NULL,
  status ENUM('draft','completed','cancelled') NOT NULL DEFAULT 'draft',
  active_key TINYINT NULL DEFAULT 1,
  notes VARCHAR(1000) NULL,
  cancel_reason VARCHAR(500) NULL,
  started_by INT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_by INT NULL,
  completed_at DATETIME NULL,
  cancelled_by INT NULL,
  cancelled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_physical_inventory_reference (reference_code),
  UNIQUE KEY uq_physical_inventory_active (active_key),
  KEY idx_physical_inventory_status_started (status, started_at),
  KEY idx_physical_inventory_started_by (started_by),
  KEY idx_physical_inventory_completed_by (completed_by),
  KEY idx_physical_inventory_cancelled_by (cancelled_by),
  CONSTRAINT fk_physical_inventory_started_by
    FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_physical_inventory_completed_by
    FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_physical_inventory_cancelled_by
    FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS physical_inventory_items (
  id INT NOT NULL AUTO_INCREMENT,
  session_id INT NOT NULL,
  material_id INT NOT NULL,
  material_name_snapshot VARCHAR(255) NOT NULL,
  unit_snapshot VARCHAR(50) NOT NULL,
  material_form_snapshot VARCHAR(30) NOT NULL DEFAULT 'other',
  length_mm_snapshot DECIMAL(10,2) NULL,
  width_mm_snapshot DECIMAL(10,2) NULL,
  thickness_mm_snapshot DECIMAL(10,2) NULL,
  system_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  reserved_quantity_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0,
  physical_count DECIMAL(12,2) NULL,
  difference_quantity DECIMAL(12,2) NULL,
  reason VARCHAR(500) NULL,
  counted_by INT NULL,
  counted_at DATETIME NULL,
  stock_movement_id INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_physical_inventory_session_material (session_id, material_id),
  KEY idx_physical_inventory_item_material (material_id),
  KEY idx_physical_inventory_item_movement (stock_movement_id),
  KEY idx_physical_inventory_item_counted_by (counted_by),
  KEY idx_physical_inventory_item_created_by (created_by),
  CONSTRAINT fk_physical_inventory_item_session
    FOREIGN KEY (session_id) REFERENCES physical_inventory_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_physical_inventory_item_material
    FOREIGN KEY (material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
  CONSTRAINT fk_physical_inventory_item_movement
    FOREIGN KEY (stock_movement_id) REFERENCES stock_movements(id) ON DELETE SET NULL,
  CONSTRAINT fk_physical_inventory_item_counted_by
    FOREIGN KEY (counted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_physical_inventory_item_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
