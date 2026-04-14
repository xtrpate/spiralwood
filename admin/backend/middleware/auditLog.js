// middleware/auditLog.js – Log admin/staff actions for accountability
const pool = require("../config/db");

/**
 * Factory: logAction('create_product', 'products')
 * Attach after controller sets req.auditRecord = { id, old, new }
 */
function logAction(action, tableName) {
  return async (req, res, next) => {
    // Run the actual handler first, collect audit data, then log
    const originalJson = res.json.bind(res);

    res.json = async function (body) {
      try {
        if (req.user && req.auditRecord) {
          await pool.query(
            `INSERT INTO audit_logs
               (user_id, action, table_name, record_id, old_values, new_values, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              req.user.id,
              action,
              tableName,
              req.auditRecord.id || null,
              req.auditRecord.old ? JSON.stringify(req.auditRecord.old) : null,
              req.auditRecord.new ? JSON.stringify(req.auditRecord.new) : null,
              req.ip || null,
            ],
          );
        }
      } catch (e) {
        // Non-blocking: log errors should never break the response
        console.error("Audit log error:", e.message);
      }
      return originalJson(body);
    };

    next();
  };
}

module.exports = { logAction };
