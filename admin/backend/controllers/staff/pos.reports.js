const db = require("../../config/db");

const buildDateFilter = (period, from, to) => {
  const clauses = [];
  const params = [];

  if (from && to) {
    clauses.push("DATE(o.created_at) BETWEEN ? AND ?");
    params.push(from, to);
    return { clauses, params };
  }

  switch (period) {
    case "weekly":
      clauses.push("YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1)");
      break;
    case "monthly":
      clauses.push("YEAR(o.created_at) = YEAR(CURDATE())");
      clauses.push("MONTH(o.created_at) = MONTH(CURDATE())");
      break;
    case "yearly":
      clauses.push("YEAR(o.created_at) = YEAR(CURDATE())");
      break;
    case "daily":
    default:
      clauses.push("DATE(o.created_at) = CURDATE()");
      break;
  }

  return { clauses, params };
};

exports.getReports = async (req, res) => {
  try {
    const { period = "daily", from, to, source = "all" } = req.query;

    const where = ["o.status NOT IN ('cancelled')"];
    const params = [];

    const dateFilter = buildDateFilter(period, from, to);
    where.push(...dateFilter.clauses);
    params.push(...dateFilter.params);

    if (source === "online") {
      where.push("o.type = 'online'");
    } else if (source === "walk_in") {
      where.push("o.type = 'walkin'");
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    let periodExpr = "DATE(o.created_at)";
    if (period === "weekly") periodExpr = "YEARWEEK(o.created_at, 1)";
    if (period === "monthly") periodExpr = "DATE_FORMAT(o.created_at, '%Y-%m')";
    if (period === "yearly") periodExpr = "YEAR(o.created_at)";

    const [totalsRows] = await db.execute(
      `
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(o.total), 0) AS grand_total,
        COALESCE(SUM(o.discount), 0) AS total_discount,
        COALESCE(SUM(p.estimated_profit), 0) AS estimated_profit
      FROM orders o
      LEFT JOIN (
        SELECT
          order_id,
          COALESCE(SUM(profit_margin * quantity), 0) AS estimated_profit
        FROM order_items
        GROUP BY order_id
      ) p ON p.order_id = o.id
      ${whereSql}
      `,
      params,
    );

    const [summaryRows] = await db.execute(
      `
      SELECT
        ${periodExpr} AS period_label,
        COUNT(*) AS order_count,
        COALESCE(SUM(o.total), 0) AS total_sales
      FROM orders o
      ${whereSql}
      GROUP BY ${periodExpr}
      ORDER BY period_label ASC
      `,
      params,
    );

    const [paymentRows] = await db.execute(
      `
      SELECT
        o.payment_method,
        COUNT(*) AS count,
        COALESCE(SUM(o.total), 0) AS total_amount
      FROM orders o
      ${whereSql}
      GROUP BY o.payment_method
      ORDER BY count DESC
      `,
      params,
    );

    const [productRows] = await db.execute(
      `
      SELECT
        oi.product_name,
        SUM(oi.quantity) AS qty,
        COALESCE(SUM(oi.subtotal), 0) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      ${whereSql}
      GROUP BY oi.product_name
      ORDER BY qty DESC
      LIMIT 5
      `,
      params,
    );

    const [transactionRows] = await db.execute(
      `
      SELECT
        o.id AS order_id,
        o.created_at,
        o.order_number,
        r.receipt_number,
        COALESCE(c.name, o.walkin_customer_name, 'Walk-in Customer') AS customer_name,
        COALESCE(c.phone, o.walkin_customer_phone, 'No phone') AS customer_phone,
        o.payment_method,
        o.subtotal,
        o.discount,
        o.total,
        COALESCE(r.cash_received, NULL) AS cash_received,
        COALESCE(r.change_amount, NULL) AS change_amount,
        o.type,
        COALESCE(p.estimated_profit, 0) AS estimated_profit,
        d.status AS delivery_status,
        a.status AS appointment_status,
        cashier.name AS processed_by
      FROM orders o
      LEFT JOIN receipts r ON r.order_id = o.id
      LEFT JOIN users c ON o.customer_id = c.id
      LEFT JOIN users cashier ON cashier.id = r.issued_by
      LEFT JOIN (
        SELECT d1.order_id, d1.status
        FROM deliveries d1
        INNER JOIN (
          SELECT order_id, MAX(id) AS latest_id
          FROM deliveries
          GROUP BY order_id
        ) dx ON dx.latest_id = d1.id
      ) d ON d.order_id = o.id
      LEFT JOIN (
        SELECT a1.order_id, a1.status
        FROM appointments a1
        INNER JOIN (
          SELECT order_id, MAX(id) AS latest_id
          FROM appointments
          GROUP BY order_id
        ) ax ON ax.latest_id = a1.id
      ) a ON a.order_id = o.id
      LEFT JOIN (
        SELECT
          order_id,
          COALESCE(SUM(profit_margin * quantity), 0) AS estimated_profit
        FROM order_items
        GROUP BY order_id
      ) p ON p.order_id = o.id
      ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT 100
      `,
      params,
    );

    res.json({
      totals: totalsRows[0] || {
        total_orders: 0,
        grand_total: 0,
        total_discount: 0,
        estimated_profit: 0,
      },
      summary: summaryRows,
      payment_breakdown: paymentRows,
      top_products: productRows,
      transactions: transactionRows,
    });
  } catch (err) {
    console.error("\n❌ [POS Reports Error]:", err);
    res.status(500).json({ message: "Server error generating reports" });
  }
};