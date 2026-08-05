// controllers/staff/pos.reports.js
// Cashier reporting is collection-based: verified payments are sales.
const db = require("../../config/db");

const normalize = (value) => String(value || "").trim().toLowerCase();
const VALID_PERIODS = new Set(["daily", "weekly", "monthly", "yearly"]);

const buildSourceFilter = (rawSource, alias = "o") => {
  const source = normalize(rawSource || "all");
  if (!source || source === "all") return { sql: "1=1", params: [] };
  if (source === "online") return { sql: `${alias}.type = 'online'`, params: [] };
  if (source === "walk_in" || source === "walkin") {
    return { sql: `${alias}.type = 'walkin'`, params: [] };
  }
  const error = new Error("Invalid order source filter.");
  error.statusCode = 400;
  throw error;
};

const buildDateFilter = ({ period, from, to }, expression) => {
  const start = String(from || "").trim();
  const end = String(to || "").trim();

  if (start || end) {
    const clauses = [];
    const params = [];
    if (start) {
      clauses.push(`DATE(${expression}) >= ?`);
      params.push(start);
    }
    if (end) {
      clauses.push(`DATE(${expression}) <= ?`);
      params.push(end);
    }
    return { sql: clauses.join(" AND "), params };
  }

  const normalizedPeriod = VALID_PERIODS.has(normalize(period))
    ? normalize(period)
    : "daily";

  if (normalizedPeriod === "weekly") {
    return {
      sql: `YEARWEEK(${expression}, 1) = YEARWEEK(CURDATE(), 1)`,
      params: [],
    };
  }
  if (normalizedPeriod === "monthly") {
    return {
      sql: `YEAR(${expression}) = YEAR(CURDATE()) AND MONTH(${expression}) = MONTH(CURDATE())`,
      params: [],
    };
  }
  if (normalizedPeriod === "yearly") {
    return { sql: `YEAR(${expression}) = YEAR(CURDATE())`, params: [] };
  }
  return { sql: `DATE(${expression}) = CURDATE()`, params: [] };
};

const buildPeriodExpression = (period, expression) => {
  switch (normalize(period)) {
    case "weekly":
      return `DATE_SUB(DATE(${expression}), INTERVAL WEEKDAY(${expression}) DAY)`;
    case "monthly":
      return `DATE_FORMAT(${expression}, '%Y-%m-01')`;
    case "yearly":
      return `DATE_FORMAT(${expression}, '%Y-01-01')`;
    case "daily":
    default:
      return `DATE(${expression})`;
  }
};

const lifetimeCollectedSql = `COALESCE((
  SELECT SUM(pt_life.amount)
  FROM payment_transactions pt_life
  WHERE pt_life.order_id = o.id
    AND LOWER(pt_life.status) = 'verified'
), 0)`;

const estimatedProfitSql = `COALESCE((
  SELECT SUM(
    COALESCE(
      oi.profit_margin,
      COALESCE(oi.unit_price, 0) - COALESCE(oi.production_cost, 0),
      0
    ) * COALESCE(oi.quantity, 0)
  )
  FROM order_items oi
  WHERE oi.order_id = o.id
), 0)`;

exports.getReports = async (req, res) => {
  try {
    const { period = "daily" } = req.query;
    const source = buildSourceFilter(req.query.source, "o");
    const orderDate = buildDateFilter(req.query, "o.created_at");
    const paymentDateExpression = "COALESCE(pt.verified_at, pt.created_at)";
    const paymentDate = buildDateFilter(req.query, paymentDateExpression);

    const orderWhereSql = [
      "o.status <> 'cancelled'",
      source.sql,
      orderDate.sql,
    ].join(" AND ");
    const orderParams = [...source.params, ...orderDate.params];

    const paymentWhereSql = [
      "LOWER(pt.status) = 'verified'",
      source.sql,
      paymentDate.sql,
    ].join(" AND ");
    const paymentParams = [...source.params, ...paymentDate.params];

    const [[orderTotals]] = await db.query(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(order_rows.total_amount), 0) AS gross_order_value,
         COALESCE(SUM(order_rows.discount), 0) AS total_discount,
         COALESCE(SUM(order_rows.estimated_profit), 0) AS estimated_profit,
         COALESCE(SUM(order_rows.outstanding_balance), 0) AS outstanding_balance
       FROM (
         SELECT
           o.id,
           COALESCE(o.total, 0) AS total_amount,
           COALESCE(o.discount, 0) AS discount,
           ${estimatedProfitSql} AS estimated_profit,
           GREATEST(COALESCE(o.total, 0) - ${lifetimeCollectedSql}, 0) AS outstanding_balance
         FROM orders o
         WHERE ${orderWhereSql}
       ) order_rows`,
      orderParams,
    );

    const [[collectionTotals]] = await db.query(
      `SELECT
         COUNT(*) AS collection_count,
         COALESCE(SUM(pt.amount), 0) AS actual_collected
       FROM payment_transactions pt
       INNER JOIN orders o ON o.id = pt.order_id
       WHERE ${paymentWhereSql}`,
      paymentParams,
    );

    const periodExpression = buildPeriodExpression(period, paymentDateExpression);
    const [summaryRows] = await db.query(
      `SELECT
         ${periodExpression} AS period_label,
         COUNT(*) AS transaction_count,
         COALESCE(SUM(pt.amount), 0) AS total_sales
       FROM payment_transactions pt
       INNER JOIN orders o ON o.id = pt.order_id
       WHERE ${paymentWhereSql}
       GROUP BY ${periodExpression}
       ORDER BY period_label ASC`,
      paymentParams,
    );

    const [paymentRows] = await db.query(
      `SELECT
         LOWER(pt.payment_method) AS payment_method,
         COUNT(*) AS count,
         COALESCE(SUM(pt.amount), 0) AS total_amount
       FROM payment_transactions pt
       INNER JOIN orders o ON o.id = pt.order_id
       WHERE ${paymentWhereSql}
       GROUP BY LOWER(pt.payment_method)
       ORDER BY total_amount DESC, count DESC`,
      paymentParams,
    );

    // Product figures remain order pipeline figures and are explicitly
    // labelled Gross Order Value in the UI; partial blueprint collections
    // are never allocated artificially across individual products.
    const [productRows] = await db.query(
      `SELECT
         oi.product_name,
         SUM(COALESCE(oi.quantity, 0)) AS qty,
         COALESCE(SUM(
           COALESCE(oi.subtotal, COALESCE(oi.unit_price, 0) * COALESCE(oi.quantity, 0))
         ), 0) AS gross_order_value,
         COALESCE(SUM(
           COALESCE(
             oi.profit_margin,
             COALESCE(oi.unit_price, 0) - COALESCE(oi.production_cost, 0),
             0
           ) * COALESCE(oi.quantity, 0)
         ), 0) AS estimated_profit
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE ${orderWhereSql}
       GROUP BY oi.product_name
       ORDER BY gross_order_value DESC, qty DESC
       LIMIT 20`,
      orderParams,
    );

    const [transactionRows] = await db.query(
      `SELECT
         pt.id AS payment_transaction_id,
         pt.order_id,
         pt.amount,
         pt.payment_method,
         COALESCE(pt.verified_at, pt.created_at) AS payment_date,
         pt.notes,
         o.order_number,
         o.order_type,
         o.type,
         o.status AS order_status,
         o.payment_status,
         COALESCE(o.total, 0) AS order_total,
         ${lifetimeCollectedSql} AS lifetime_collected,
         GREATEST(COALESCE(o.total, 0) - ${lifetimeCollectedSql}, 0) AS remaining_balance,
         COALESCE(customer.name, o.walkin_customer_name, 'Walk-in Customer') AS customer_name,
         COALESCE(customer.phone, o.walkin_customer_phone, 'No phone') AS customer_phone,
         CASE
           WHEN LOWER(pt.payment_method) = 'paymongo' THEN 'PayMongo / Online Payment'
           WHEN verifier.name IS NOT NULL THEN verifier.name
           ELSE 'System'
         END AS processed_by,
         receipt.receipt_id,
         receipt.receipt_number,
         receipt.payment_label
       FROM payment_transactions pt
       INNER JOIN orders o ON o.id = pt.order_id
       LEFT JOIN users customer ON customer.id = o.customer_id
       LEFT JOIN users verifier ON verifier.id = pt.verified_by
       LEFT JOIN (
         SELECT
           payment_transaction_id,
           MAX(id) AS receipt_id,
           MAX(receipt_number) AS receipt_number,
           MAX(payment_label) AS payment_label
         FROM receipts
         WHERE payment_transaction_id IS NOT NULL
         GROUP BY payment_transaction_id
       ) receipt ON receipt.payment_transaction_id = pt.id
       WHERE ${paymentWhereSql}
       ORDER BY COALESCE(pt.verified_at, pt.created_at) DESC, pt.id DESC
       LIMIT 200`,
      paymentParams,
    );

    const totals = {
      total_orders: Number(orderTotals?.total_orders || 0),
      gross_order_value: Number(orderTotals?.gross_order_value || 0),
      actual_collected: Number(collectionTotals?.actual_collected || 0),
      // Compatibility alias: grand_total now correctly represents actual
      // verified collections, not all non-cancelled order totals.
      grand_total: Number(collectionTotals?.actual_collected || 0),
      outstanding_balance: Number(orderTotals?.outstanding_balance || 0),
      total_discount: Number(orderTotals?.total_discount || 0),
      estimated_profit: Number(orderTotals?.estimated_profit || 0),
      collection_count: Number(collectionTotals?.collection_count || 0),
    };

    res.json({
      totals,
      summary: summaryRows,
      payment_breakdown: paymentRows,
      top_products: productRows,
      transactions: transactionRows,
    });
  } catch (err) {
    const statusCode = Number(err.statusCode) || 500;
    if (statusCode >= 500) {
      console.error("\n❌ [POS Reports Error]:", err);
    }
    res.status(statusCode).json({
      message:
        statusCode === 400
          ? err.message
          : "Server error generating reports",
    });
  }
};
