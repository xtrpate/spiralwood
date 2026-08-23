-- WISDOM Blueprint Product history snapshot
-- Keeps a Product's final Blueprint design after the editable Blueprint is purged.
CREATE TABLE IF NOT EXISTS product_blueprint_snapshots (
  product_id INT NOT NULL,
  source_blueprint_id INT NOT NULL,
  title VARCHAR(255) NULL,
  description TEXT NULL,
  thumbnail_url LONGTEXT NULL,
  file_url LONGTEXT NULL,
  file_type VARCHAR(50) NULL,
  source VARCHAR(50) NULL,
  design_data LONGTEXT NULL,
  view_3d_data LONGTEXT NULL,
  components_json LONGTEXT NULL,
  captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id),
  KEY idx_product_blueprint_snapshot_source (source_blueprint_id),
  CONSTRAINT fk_product_blueprint_snapshot_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
