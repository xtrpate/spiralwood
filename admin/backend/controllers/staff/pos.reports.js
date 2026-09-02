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

const REPORT_SOURCE_OFFSET = "+00:00";
const REPORT_LOCAL_OFFSET = "+08:00";

const toReportLocalTime = (expression) =>
  `CONVERT_TZ(${expression}, '${REPORT_SOURCE_OFFSET}', '${REPORT_LOCAL_OFFSET}')`;

const reportLocalNowSql = () =>
  `CONVERT_TZ(UTC_TIMESTAMP(), '${REPORT_SOURCE_OFFSET}', '${REPORT_LOCAL_OFFSET}')`;

const buildPaymentFilter = (rawPayment, alias = "pt") => {
  const payment = normalize(rawPayment || "all");
  if (!payment || payment === "all") {
    return { sql: "1=1", params: [] };
  }

  if (payment === "cash") {
    return {
      sql: `LOWER(${alias}.payment_method) IN ('cash', 'cod', 'cop')`,
      params: [],
    };
  }

  if (payment === "online") {
    return {
      sql: `LOWER(${alias}.payment_method) IN ('paymongo', 'gcash', 'bank_transfer')`,
      params: [],
    };
  }

  const error = new Error("Invalid payment type filter.");
  error.statusCode = 400;
  throw error;
};

const buildDateFilter = ({ period, from, to }, expression) => {
  const start = String(from || "").trim();
  const end = String(to || "").trim();
  const localExpression = toReportLocalTime(expression);
  const localNow = reportLocalNowSql();

  if (start || end) {
    const clauses = [];
    const params = [];
    if (start) {
      clauses.push(`DATE(${localExpression}) >= ?`);
      params.push(start);
    }
    if (end) {
      clauses.push(`DATE(${localExpression}) <= ?`);
      params.push(end);
    }
    return { sql: clauses.join(" AND "), params };
  }

  const normalizedPeriod = VALID_PERIODS.has(normalize(period))
    ? normalize(period)
    : "daily";

  if (normalizedPeriod === "weekly") {
    return {
      sql: `YEARWEEK(${localExpression}, 1) = YEARWEEK(${localNow}, 1)`,
      params: [],
    };
  }
  if (normalizedPeriod === "monthly") {
    return {
      sql: `YEAR(${localExpression}) = YEAR(${localNow}) AND MONTH(${localExpression}) = MONTH(${localNow})`,
      params: [],
    };
  }
  if (normalizedPeriod === "yearly") {
    return {
      sql: `YEAR(${localExpression}) = YEAR(${localNow})`,
      params: [],
    };
  }
  return {
    sql: `DATE(${localExpression}) = DATE(${localNow})`,
    params: [],
  };
};

const buildPeriodExpression = (period, expression) => {
  const localExpression = toReportLocalTime(expression);

  switch (normalize(period)) {
    case "weekly":
      return `DATE_SUB(DATE(${localExpression}), INTERVAL WEEKDAY(${localExpression}) DAY)`;
    case "monthly":
      return `DATE_FORMAT(${localExpression}, '%Y-%m-01')`;
    case "yearly":
      return `DATE_FORMAT(${localExpression}, '%Y-01-01')`;
    case "daily":
    default:
      return `DATE(${localExpression})`;
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
    const payment = buildPaymentFilter(req.query.payment, "pt");
    const orderDate = buildDateFilter(req.query, "o.created_at");
    const paymentDateExpression = "COALESCE(pt.verified_at, pt.created_at)";
    const paymentDate = buildDateFilter(req.query, paymentDateExpression);

    const isCashierScope = req.user?.role === "staff";
    const cashierId = Number(req.user?.id);

    if (
      isCashierScope &&
      (!Number.isSafeInteger(cashierId) || cashierId <= 0)
    ) {
      return res.status(401).json({ message: "Invalid cashier session." });
    }

    const ownerSql = isCashierScope ? "pt.verified_by = ?" : "1=1";
    const ownerParams = isCashierScope ? [cashierId] : [];

    const paymentWhereSql = [
      "LOWER(pt.status) = 'verified'",
      "o.status <> 'cancelled'",
      source.sql,
      payment.sql,
      paymentDate.sql,
      ownerSql,
    ].join(" AND ");
    const paymentParams = [
      ...source.params,
      ...payment.params,
      ...paymentDate.params,
      ...ownerParams,
    ];

    // Cashier order-level figures must come only from orders connected to a
    // verified payment the logged-in cashier actually processed in this report
    // period. Admin keeps the existing order-created-period behavior unless a
    // payment category is selected.
    const scopedPayment = buildPaymentFilter(req.query.payment, "pt_scope");
    const scopedPaymentDate = buildDateFilter(
      req.query,
      "COALESCE(pt_scope.verified_at, pt_scope.created_at)",
    );
    const usePaymentScopedOrders =
      isCashierScope ||
      !["", "all"].includes(normalize(req.query.payment || "all"));

    const orderWhereParts = [
      "o.status <> 'cancelled'",
      "COALESCE(o.total, 0) > 0",
      source.sql,
    ];
    const orderParams = [...source.params];

    if (usePaymentScopedOrders) {
      const scopedOwnerSql = isCashierScope
        ? "pt_scope.verified_by = ?"
        : "1=1";

      orderWhereParts.push(`EXISTS (
        SELECT 1
        FROM payment_transactions pt_scope
        WHERE pt_scope.order_id = o.id
          AND LOWER(pt_scope.status) = 'verified'
          AND ${scopedPayment.sql}
          AND ${scopedPaymentDate.sql}
          AND ${scopedOwnerSql}
      )`);

      orderParams.push(
        ...scopedPayment.params,
        ...scopedPaymentDate.params,
        ...(isCashierScope ? [cashierId] : []),
      );
    } else {
      orderWhereParts.push(orderDate.sql);
      orderParams.push(...orderDate.params);
    }

    const orderWhereSql = orderWhereParts.join(" AND ");

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

    // Product values stay order values. For cashier users, the included orders
    // are already restricted to orders with payments processed by that cashier.
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
      grand_total: Number(collectionTotals?.actual_collected || 0),
      outstanding_balance: Number(orderTotals?.outstanding_balance || 0),
      total_discount: Number(orderTotals?.total_discount || 0),
      estimated_profit: Number(orderTotals?.estimated_profit || 0),
      collection_count: Number(collectionTotals?.collection_count || 0),
    };

    res.json({
      report_scope: isCashierScope ? "cashier" : "all",
      report_owner: isCashierScope
        ? {
            id: cashierId,
            name: String(req.user?.name || "Current cashier"),
          }
        : null,
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
