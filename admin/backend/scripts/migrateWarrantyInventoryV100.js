// WISDOM Warranty + Inventory V1.0.0 additive/idempotent migration
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mysql = require("mysql2/promise");

const database = process.env.DB_NAME || "wisdom_db";
const config = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database,
  timezone: "+00:00",
};

const columnExists = async (conn, table, column) => {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [database, table, column],
  );
  return Number(row?.count || 0) > 0;
};

const tableExists = async (conn, table) => {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?`,
    [database, table],
  );
  return Number(row?.count || 0) > 0;
};

(async () => {
  const conn = await mysql.createConnection(config);
  try {
    await conn.query("SET SESSION time_zone = '+00:00'");
    for (const required of ["warranties", "order_items", "stock_movements", "raw_materials", "products", "ready_made_display_stock", "blueprint_material_reservations"]) {
      if (!(await tableExists(conn, required))) throw new Error(`Required table is missing: ${required}`);
    }
    if (!(await columnExists(conn, "warranties", "order_item_id"))) {
      throw new Error("STOP: warranties.order_item_id is missing. This patch expects the 2026-09-09 schema and will not create a duplicate/guessed link.");
    }

    const additions = [
      ["claim_quantity", "ALTER TABLE warranties ADD COLUMN claim_quantity INT NOT NULL DEFAULT 1 AFTER order_item_id"],
      ["resolution_type", "ALTER TABLE warranties ADD COLUMN resolution_type ENUM('repair','part_replacement','full_product_replacement') NULL AFTER replacement_receipt"],
      ["resolution_notes", "ALTER TABLE warranties ADD COLUMN resolution_notes TEXT NULL AFTER resolution_type"],
      ["replacement_source", "ALTER TABLE warranties ADD COLUMN replacement_source ENUM('warehouse','display') NULL AFTER resolution_notes"],
      ["return_disposition", "ALTER TABLE warranties ADD COLUMN return_disposition ENUM('not_returned','for_inspection','damaged_unusable','usable_returned') NULL AFTER replacement_source"],
    ];
    for (const [name, sql] of additions) {
      if (!(await columnExists(conn, "warranties", name))) {
        console.log(`ADD warranties.${name}`);
        await conn.query(sql);
      } else {
        console.log(`KEEP warranties.${name}`);
      }
    }

    await conn.query(
      `CREATE TABLE IF NOT EXISTS warranty_inventory_movements (
         id INT NOT NULL AUTO_INCREMENT,
         warranty_id INT NOT NULL,
         stock_movement_id INT NOT NULL,
         movement_role ENUM('material_usage','replacement_issue','returned_usable') NOT NULL,
         source_location ENUM('warehouse','display') DEFAULT NULL,
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         UNIQUE KEY uq_warranty_inventory_stock_movement (stock_movement_id),
         KEY idx_warranty_inventory_warranty (warranty_id),
         CONSTRAINT fk_warranty_inventory_warranty FOREIGN KEY (warranty_id) REFERENCES warranties(id) ON DELETE CASCADE,
         CONSTRAINT fk_warranty_inventory_stock_movement FOREIGN KEY (stock_movement_id) REFERENCES stock_movements(id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    );

    const [backfill] = await conn.query(
      `UPDATE warranties w
       INNER JOIN (
         SELECT order_id, MIN(id) AS order_item_id
         FROM order_items
         GROUP BY order_id
         HAVING COUNT(*) = 1
       ) single_item ON single_item.order_id = w.order_id
       SET w.order_item_id = single_item.order_item_id
       WHERE w.order_item_id IS NULL`,
    );
    console.log(`Legacy exact-item backfill rows: ${Number(backfill.affectedRows || 0)}`);

    const [[remaining]] = await conn.query(`SELECT COUNT(*) AS count FROM warranties WHERE order_item_id IS NULL`);
    console.log(`Legacy multi-item/unresolved claims left unlinked: ${Number(remaining?.count || 0)}`);
    console.log("PASS: Warranty + Inventory V1.0.0 database migration complete.");
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error("FAIL: Warranty + Inventory database migration failed:", err.message);
  process.exit(1);
});
