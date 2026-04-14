// config/db.js – MySQL connection pool
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'wisdom_db',
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  timezone:           '+08:00',        // Philippine Standard Time
  decimalNumbers:     true,
});

// Verify connectivity on startup
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅  MySQL connected →', process.env.DB_NAME);
    conn.release();
  } catch (err) {
    console.error('❌  MySQL connection failed:', err.message);
    process.exit(1);
  }
})();

module.exports = pool;
