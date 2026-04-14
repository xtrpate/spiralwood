// controllers/salesController.js – Sales Reports [SCHEMA-CORRECTED]
// orders.type not channel | orders.total not total_amount | LEFT JOIN users for walk-ins
const pool = require("../../config/db");

function buildFilters(query) {
  const { channel, from, to, period } = query;
  const where = ["o.status != 'cancelled'"];
  const params = [];

  if (channel) {
    where.push("o.type = ?");
    params.push(channel);
  }

  if (from && to) {
    where.push("DATE(o.created_at) BETWEEN ? AND ?");
    params.push(from, to);
  } else if (period) {
    const map = { daily: 0, weekly: 6, monthly: 29, yearly: 364 };
    const days = map[period] ?? 29;
    where.push("DATE(o.created_at) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)");
    params.push(days);
  }

  return { where, params };
}

exports.getReport = async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);

    const [orders] = await pool.query(
      `SELECT o.id, o.order_number,
              o.type     AS channel,           -- schema: type
              o.status,
              o.payment_method,
              o.total    AS total_amount,       -- schema: total
              o.created_at,
              COALESCE(u.name,  o.walkin_customer_name)  AS customer_name,
              COALESCE(u.phone, o.walkin_customer_phone)  AS customer_phone,
              r.receipt_number,
              d.status   AS delivery_status,
              COALESCE(SUM(oi.profit_margin * oi.quantity), 0) AS total_profit
       FROM orders o
       LEFT JOIN users u       ON u.id  = o.customer_id
       LEFT JOIN receipts r    ON r.order_id = o.id
       LEFT JOIN deliveries d  ON d.order_id = o.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE ${where.join(" AND ")}
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      params,
    );

    const [[summary]] = await pool.query(
      `SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(order_totals.total_amount), 0) AS total_revenue,
        COALESCE(SUM(order_totals.total_profit), 0) AS total_profit,
        COALESCE(AVG(order_totals.total_amount), 0) AS avg_order_value,
        SUM(order_totals.channel = 'online') AS online_count,
        SUM(order_totals.channel = 'walkin') AS walkin_count
      FROM (
        SELECT
          o.id,
          o.type AS channel,
          o.total AS total_amount,
          COALESCE(SUM(oi.profit_margin * oi.quantity), 0) AS total_profit
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE ${where.join(" AND ")}
        GROUP BY o.id, o.type, o.total
      ) AS order_totals`,
      params,
    );

    const [products] = await pool.query(
      `SELECT oi.product_name,
              SUM(oi.quantity)                          AS units_sold,
              SUM(oi.subtotal)                          AS revenue,
              SUM(oi.profit_margin * oi.quantity)       AS profit
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE ${where.join(" AND ")}
       GROUP BY oi.product_name
       ORDER BY units_sold DESC`,
      params,
    );

    res.json({ orders, summary, products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPrintData = async (req, res) => exports.getReport(req, res);
