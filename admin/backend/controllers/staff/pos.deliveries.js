// controllers/staff/pos.deliveries.js
const db = require("../../config/db");

/* ── RIDER DASHBOARD STATS ── */
exports.getRiderDashboard = async (req, res) => {
  try {
    const riderId = req.user.id;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Fetch all deliveries assigned to this rider that are scheduled for today
    const [deliveries] = await db.query(
      `SELECT status FROM deliveries 
       WHERE driver_id = ? AND DATE(scheduled_date) = ?`,
      [riderId, today],
    );

    let pendingCount = 0;
    let completedCount = 0;

    deliveries.forEach((d) => {
      if (d.status === "delivered") completedCount++;
      else if (d.status !== "failed") pendingCount++;
    });

    res.json({
      pending_today: pendingCount,
      completed_today: completedCount,
      total_deliveries: deliveries.length,
    });
  } catch (err) {
    console.error("[Rider Dashboard Error]", err);
    res.status(500).json({ message: "Failed to load dashboard stats" });
  }
};

/* ── RIDER DELIVERY HISTORY ── */
exports.getRiderHistory = async (req, res) => {
  try {
    const riderId = req.user.id;

    // Fetch only completed or failed deliveries for this rider
    const [history] = await db.query(
      `SELECT d.id AS delivery_id, o.order_number, o.walkin_customer_name AS customer_name, 
              d.address, d.status, o.payment_status, o.total, d.delivered_date, d.updated_at 
       FROM deliveries d
       JOIN orders o ON d.order_id = o.id
       WHERE d.driver_id = ? AND d.status IN ('delivered', 'failed')
       ORDER BY d.updated_at DESC
       LIMIT 50`,
      [riderId],
    );

    res.json(history);
  } catch (err) {
    console.error("[Rider History Error]", err);
    res.status(500).json({ message: "Failed to load delivery history" });
  }
};
