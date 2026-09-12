const pool = require("../config/db");

(async () => {
  try {
    console.log("Checking user_permission_overrides...");

    const [dbInfo] = await pool.query(`
      SELECT
        DATABASE() AS database_name,
        @@hostname AS mysql_host,
        @@port AS mysql_port,
        CURRENT_USER() AS current_user
    `);

    console.log("Connection:", dbInfo[0]);

    const [tables] = await pool.query(`
      SELECT
        TABLE_SCHEMA,
        TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user_permission_overrides'
    `);

    console.log("Table lookup:", tables);

    if (tables.length === 0) {
      console.log("Table does not exist from Node.");

      await pool.query(`
        CREATE TABLE user_permission_overrides (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,

          user_id INT NOT NULL,
          permission_id INT UNSIGNED NOT NULL,

          granted TINYINT(1) NOT NULL,

          updated_by INT NOT NULL,

          created_at TIMESTAMP NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

          updated_at TIMESTAMP NOT NULL
            DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP,

          PRIMARY KEY (id),

          UNIQUE KEY uq_user_permission_override (
            user_id,
            permission_id
          ),

          KEY idx_user_permission_overrides_user (
            user_id
          ),

          KEY idx_user_permission_overrides_permission (
            permission_id
          ),

          KEY idx_user_permission_overrides_updated_by (
            updated_by
          ),

          CONSTRAINT fk_user_permission_overrides_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,

          CONSTRAINT fk_user_permission_overrides_permission
            FOREIGN KEY (permission_id)
            REFERENCES permissions(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,

          CONSTRAINT fk_user_permission_overrides_updated_by
            FOREIGN KEY (updated_by)
            REFERENCES users(id)
            ON DELETE RESTRICT
            ON UPDATE CASCADE,

          CONSTRAINT chk_user_permission_override_granted
            CHECK (granted IN (0, 1))

        ) ENGINE=InnoDB
          DEFAULT CHARSET=utf8mb4
          COLLATE=utf8mb4_unicode_ci
      `);

      console.log("✅ user_permission_overrides created from Node connection.");
    } else {
      console.log(
        "✅ user_permission_overrides already exists from Node connection.",
      );
    }

    const [verify] = await pool.query(`
      SHOW TABLES LIKE 'user_permission_overrides'
    `);

    console.log("Final check:", verify.length > 0);

    process.exit(0);
  } catch (err) {
    console.error("❌ Database check failed:");
    console.error(err);
    process.exit(1);
  }
})();
