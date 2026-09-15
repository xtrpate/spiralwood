// controllers/staff/pos.dashboard.js
const db = require("../../config/db"); // Uses the unified db config
const {
  getPhilippineBusinessPeriods,
} = require("../../utils/philippineTime");

/* ── Get POS Dashboard Metrics ── */
exports.getDashboardMetrics = async (req, res) => {
  try {
    // WISDOM POS DASHBOARD PH BUSINESS DAY R9.1
    // The database stores real timestamps in UTC. Build Philippine
    // day/week/month boundaries once per request and query UTC ranges.
    const periods = getPhilippineBusinessPeriods();

    // Today's sales & order count (ALL orders, walkin + online)
    // ── FIXED: Switched to .query ──
    const [salesToday] = await db.query(
      `
      SELECT
        COUNT(*) AS order_count,
        COALESCE(SUM(total), 0) AS total_sales
      FROM orders
      WHERE created_at >= ?
        AND created_at < ?
        AND status NOT IN ('cancelled')
      `,
      [periods.todayStart, periods.tomorrowStart],
    );

    // This week's sales
    // ── FIXED: Switched to .query ──
    const [salesWeek] = await db.query(
      `
      SELECT COALESCE(SUM(total), 0) AS weekly_sales
      FROM orders
      WHERE created_at >= ?
        AND created_at < ?
        AND status NOT IN ('cancelled')
      `,
      [periods.weekStart, periods.nextWeekStart],
    );

    // This month's sales
    // ── FIXED: Switched to .query ──
    const [salesMonth] = await db.query(
      `
      SELECT COALESCE(SUM(total), 0) AS monthly_sales
      FROM orders
      WHERE created_at >= ?
        AND created_at < ?
        AND status NOT IN ('cancelled')
      `,
      [periods.monthStart, periods.nextMonthStart],
    );

    // Recent orders today
    // We use LEFT JOIN to get the user's name if it's an online order, otherwise use the walkin name
    // ── FIXED: Switched to .query ──
    const [recentOrders] = await db.query(
      `
      SELECT o.id, o.order_number,
             COALESCE(o.walkin_customer_name, u.name, 'Customer') as walkin_customer_name,
             o.total, o.payment_method, o.status, o.created_at
      FROM orders o
      LEFT JOIN users u ON o.customer_id = u.id
      WHERE o.created_at >= ?
        AND o.created_at < ?
      ORDER BY o.created_at DESC
      LIMIT 10
      `,
      [periods.todayStart, periods.tomorrowStart],
    );

    // Top 5 products today
    // ── FIXED: Switched to .query ──
    const [topProducts] = await db.query(
      `
      SELECT oi.product_name, SUM(oi.quantity) AS qty_sold,
             SUM(oi.subtotal) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= ?
        AND o.created_at < ?
        AND o.status NOT IN ('cancelled')
      GROUP BY oi.product_name
      ORDER BY qty_sold DESC
      LIMIT 5
      `,
      [periods.todayStart, periods.tomorrowStart],
    );

    // Low stock alerts — ALL low/out products
    // ── FIXED: Switched to .query ──
    const [lowStock] = await db.query(`
      SELECT id, name, stock, reorder_point, stock_status
      FROM products
      WHERE stock_status IN ('low_stock','out_of_stock')
      ORDER BY stock_status DESC, stock ASC
      LIMIT 8
    `);

    res.json({
      today: salesToday[0],
      weekly_sales: salesWeek[0].weekly_sales,
      monthly_sales: salesMonth[0].monthly_sales,
      recent_orders: recentOrders,
      top_products: topProducts,
      low_stock_alerts: lowStock,
    });
  } catch (err) {
    console.error("[POS Dashboard Error]:", err);
    res.status(500).json({ message: "Server error" });
  }
};
