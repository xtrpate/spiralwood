// config/db.js – MySQL connection pool
const mysql = require("mysql2/promise");
require("dotenv").config();

const DB_TIME_ZONE = "+00:00";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "wisdom_db",
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  timezone: DB_TIME_ZONE, // Parse MySQL timestamps as UTC
  decimalNumbers: true,
});

// Keep every pooled MySQL connection in UTC. The frontend is responsible
// for displaying timestamps in Asia/Manila.
pool.on("connection", (connection) => {
  connection.query(
    `SET SESSION time_zone = '${DB_TIME_ZONE}'`,
    (error) => {
      if (error) {
        console.error(
          "Failed to set MySQL UTC session time zone:",
          error.message,
        );
      }
    },
  );
});

// Verify connectivity on startup
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("✅  MySQL connected →", process.env.DB_NAME);
    conn.release();
  } catch (err) {
    console.error("❌  MySQL connection failed:", err.message);
    process.exit(1);
  }
})();

module.exports = pool;
