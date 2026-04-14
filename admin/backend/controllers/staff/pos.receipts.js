const db = require("../../config/db");

/* ── Get Receipt by ID ── */
exports.getReceiptById = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT
        r.*,
        o.order_number,
        o.walkin_customer_name,
        o.walkin_customer_phone,
        o.payment_method,
        o.subtotal,
        o.tax,
        o.discount,
        o.total,
        o.notes,
        u.name AS staff_name
      FROM receipts r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN users u ON u.id = r.issued_by
      WHERE r.id = ?
      LIMIT 1
      `,
      [req.params.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    const receipt = rows[0];

    try {
      receipt.items = JSON.parse(receipt.items_snapshot || "[]");
    } catch {
      receipt.items = [];
    }

    // IMPORTANT FIX:
    // website_settings uses column `value`, not `setting_value`
    const [settings] = await db.execute(
      `
      SELECT setting_key, value
      FROM website_settings
      WHERE setting_key IN (
        'site_name',
        'site_logo',
        'business_address',
        'business_phone',
        'gcash_number'
      )
      `,
    );

    const biz = {};
    settings.forEach((s) => {
      biz[s.setting_key] = s.value;
    });

    biz.business_name = biz.site_name || "Spiral Wood Services";
    receipt.business = biz;

    return res.json(receipt);
  } catch (err) {
    console.error("GET /api/pos/receipts/:id error:", err);
    return res.status(500).json({
      message: "Failed to load receipt",
      error: err.message,
    });
  }
};

/* ── Get Receipt by Order ID ── */
exports.getReceiptByOrderId = async (req, res) => {
  const { order_id } = req.query;

  if (!order_id) {
    return res.status(400).json({ message: "order_id required" });
  }

  try {
    const [rows] = await db.execute(
      `
      SELECT
        r.*,
        o.order_number,
        o.walkin_customer_name,
        o.walkin_customer_phone,
        o.payment_method,
        o.subtotal,
        o.tax,
        o.discount,
        o.total,
        o.notes,
        u.name AS staff_name
      FROM receipts r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN users u ON u.id = r.issued_by
      WHERE r.order_id = ?
      ORDER BY r.id DESC
      LIMIT 1
      `,
      [order_id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    const receipt = rows[0];

    try {
      receipt.items = JSON.parse(receipt.items_snapshot || "[]");
    } catch {
      receipt.items = [];
    }

    return res.json(receipt);
  } catch (err) {
    console.error("GET /api/pos/receipts?order_id= error:", err);
    return res.status(500).json({
      message: "Failed to load receipt",
      error: err.message,
    });
  }
};

/* ── POS Sales Reports ── */
exports.getReports = async (req, res) => {
  const { period = "daily", from, to, staff_id } = req.query;

  let groupBy, dateExpr;
  switch (period) {
    case "weekly":
      dateExpr = "YEARWEEK(o.created_at, 1)";
      groupBy = dateExpr;
      break;
    case "monthly":
      dateExpr = "DATE_FORMAT(o.created_at, '%Y-%m')";
      groupBy = dateExpr;
      break;
    case "yearly":
      dateExpr = "YEAR(o.created_at)";
      groupBy = dateExpr;
      break;
    default:
      dateExpr = "DATE(o.created_at)";
      groupBy = dateExpr;
  }

  try {
    let where = "WHERE o.type = 'walkin' AND o.status NOT IN ('cancelled')";
    const params = [];

    if (from) {
      where += " AND DATE(o.created_at) >= ?";
      params.push(from);
    }
    if (to) {
      where += " AND DATE(o.created_at) <= ?";
      params.push(to);
    }

    const receiptJoin =
      (staff_id && req.user.role === "admin") || req.user.role === "staff"
        ? "INNER JOIN receipts r ON r.order_id = o.id"
        : "LEFT JOIN receipts r ON r.order_id = o.id";

    if (staff_id && req.user.role === "admin") {
      where += " AND r.issued_by = ?";
      params.push(staff_id);
    } else if (req.user.role === "staff") {
      where += " AND r.issued_by = ?";
      params.push(req.user.id);
    }

    const [summary] = await db.execute(
      `
      SELECT ${dateExpr} AS period_label,
             COUNT(o.id) AS order_count,
             COALESCE(SUM(o.subtotal), 0) AS subtotal,
             COALESCE(SUM(o.discount), 0) AS discount,
             COALESCE(SUM(o.total), 0) AS total_sales
      FROM orders o
      ${receiptJoin}
      ${where}
      GROUP BY ${groupBy}
      ORDER BY period_label DESC
      LIMIT 30
      `,
      params,
    );

    const [totals] = await db.execute(
      `
      SELECT COUNT(o.id) AS total_orders,
             COALESCE(SUM(o.total), 0) AS grand_total,
             COALESCE(SUM(o.discount), 0) AS total_discount
      FROM orders o
      ${receiptJoin}
      ${where}
      `,
      params,
    );

    const [topProducts] = await db.execute(
      `
      SELECT oi.product_name,
            SUM(oi.quantity) AS qty,
            COALESCE(SUM(COALESCE(oi.subtotal, oi.unit_price * oi.quantity)), 0) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      ${receiptJoin}
      ${where}
      GROUP BY oi.product_name
      ORDER BY qty DESC
      LIMIT 10
      `,
      params,
    );

    const [paymentBreakdown] = await db.execute(
      `
      SELECT o.payment_method, COUNT(*) AS count,
             COALESCE(SUM(o.total), 0) AS total
      FROM orders o
      ${receiptJoin}
      ${where}
      GROUP BY o.payment_method
      `,
      params,
    );

    return res.json({
      summary,
      totals: totals[0],
      top_products: topProducts,
      payment_breakdown: paymentBreakdown,
    });
  } catch (err) {
    console.error("GET /api/pos/reports error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};