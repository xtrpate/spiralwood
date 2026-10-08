// controllers/staff/pos.reports.js
// Cashier reporting is collection-based: verified payments are sales.
const db = require("../../config/db");
const {
  getPhilippineBusinessPeriods,
  getPhilippineDateBoundsUtc,
  getPhilippineDateKey,
} = require("../../utils/philippineTime");

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const VALID_PERIODS = new Set(["daily", "weekly", "monthly", "yearly"]);
const DEFAULT_TRANSACTION_LIMIT = 200;
const MAX_TRANSACTION_LIMIT = 200;

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const parsePositiveInteger = (rawValue, { name, fallback, max }) => {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const text = String(rawValue).trim();
  if (!/^\d+$/.test(text)) {
    throw badRequest(`Invalid ${name}. Use a positive integer.`);
  }

  const value = Number(text);
  if (!Number.isSafeInteger(value) || value <= 0 || (max && value > max)) {
    throw badRequest(
      max
        ? `Invalid ${name}. Use a positive integer up to ${max}.`
        : `Invalid ${name}. Use a positive integer.`,
    );
  }

  return value;
};

const validatePeriod = (rawPeriod) => {
  const period = normalize(rawPeriod || "daily");
  if (!VALID_PERIODS.has(period)) {
    throw badRequest("Invalid report period.");
  }
  return period;
};

const validateDateKey = (rawValue, name) => {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  try {
    getPhilippineDateBoundsUtc(value);
    return value;
  } catch (_error) {
    throw badRequest(`Invalid ${name} date. Use YYYY-MM-DD.`);
  }
};

const buildSourceFilter = (rawSource, alias = "o") => {
  const source = normalize(rawSource || "all");
  if (!source || source === "all") {
    return { value: "all", sql: "1=1", params: [] };
  }
  if (source === "online") {
    return { value: "online", sql: `${alias}.type = 'online'`, params: [] };
  }
  if (source === "walk_in" || source === "walkin") {
    return { value: "walk_in", sql: `${alias}.type = 'walkin'`, params: [] };
  }
  throw badRequest("Invalid order source filter.");
};

const buildPaymentFilter = (rawPayment, alias = "pt") => {
  const payment = normalize(rawPayment || "all");
  if (!payment || payment === "all") {
    return { value: "all", sql: "1=1", params: [] };
  }

  if (payment === "cash") {
    return {
      value: "cash",
      sql: `${alias}.payment_method IN ('cash', 'cod', 'cop')`,
      params: [],
    };
  }

  if (payment === "online") {
    return {
      value: "online",
      sql: `${alias}.payment_method IN ('paymongo', 'gcash', 'bank_transfer')`,
      params: [],
    };
  }

  throw badRequest("Invalid payment type filter.");
};

const getDefaultPeriodBounds = (period) => {
  const businessPeriods = getPhilippineBusinessPeriods();

  if (period === "weekly") {
    return {
      startUtc: businessPeriods.weekStart,
      endUtc: businessPeriods.nextWeekStart,
    };
  }

  if (period === "monthly") {
    return {
      startUtc: businessPeriods.monthStart,
      endUtc: businessPeriods.nextMonthStart,
    };
  }

  if (period === "yearly") {
    const year = Number(getPhilippineDateKey().slice(0, 4));
    return {
      startUtc: getPhilippineDateBoundsUtc(`${year}-01-01`).startUtc,
      endUtc: getPhilippineDateBoundsUtc(`${year + 1}-01-01`).startUtc,
    };
  }

  return {
    startUtc: businessPeriods.todayStart,
    endUtc: businessPeriods.tomorrowStart,
  };
};

const buildDateFilter = ({ period, from, to }, expression) => {
  if (from || to) {
    const clauses = [];
    const params = [];

    if (from) {
      clauses.push(`${expression} >= ?`);
      params.push(getPhilippineDateBoundsUtc(from).startUtc);
    }

    if (to) {
      clauses.push(`${expression} < ?`);
      params.push(getPhilippineDateBoundsUtc(to).nextStartUtc);
    }

    return { sql: clauses.join(" AND "), params };
  }

  const { startUtc, endUtc } = getDefaultPeriodBounds(period);
  return {
    sql: `${expression} >= ? AND ${expression} < ?`,
    params: [startUtc, endUtc],
  };
};

const REPORT_SOURCE_OFFSET = "+00:00";
const REPORT_LOCAL_OFFSET = "+08:00";
const toReportLocalTime = (expression) =>
  `CONVERT_TZ(${expression}, '${REPORT_SOURCE_OFFSET}', '${REPORT_LOCAL_OFFSET}')`;

const buildPeriodExpression = (period, expression) => {
  const localExpression = toReportLocalTime(expression);

  switch (period) {
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
    AND pt_life.status = 'verified'
), 0)`;

const historicalCollectedAfterSql = `COALESCE(
  receipt.total_paid_after,
  (
    SELECT COALESCE(SUM(pt_hist.amount), 0)
    FROM payment_transactions pt_hist
    WHERE pt_hist.order_id = pt.order_id
      AND pt_hist.status = 'verified'
      AND (
        COALESCE(pt_hist.verified_at, pt_hist.created_at) < COALESCE(pt.verified_at, pt.created_at)
        OR (
          COALESCE(pt_hist.verified_at, pt_hist.created_at) = COALESCE(pt.verified_at, pt.created_at)
          AND pt_hist.id <= pt.id
        )
      )
  )
)`;

exports.getReports = async (req, res) => {
  try {
    const period = validatePeriod(req.query.period);
    const from = validateDateKey(req.query.from, "from");
    const to = validateDateKey(req.query.to, "to");

    if (from && to && from > to) {
      throw badRequest("Start date cannot be after end date.");
    }

    const page = parsePositiveInteger(req.query.page, {
      name: "page",
      fallback: 1,
    });
    const limit = parsePositiveInteger(req.query.limit, {
      name: "limit",
      fallback: DEFAULT_TRANSACTION_LIMIT,
      max: MAX_TRANSACTION_LIMIT,
    });
    const offset = (page - 1) * limit;

    const source = buildSourceFilter(req.query.source, "o");
    const payment = buildPaymentFilter(req.query.payment, "pt");
    const paymentDateExpression = "COALESCE(pt.verified_at, pt.created_at)";
    const paymentDate = buildDateFilter(
      { period, from, to },
      paymentDateExpression,
    );

    const isCashierScope = req.user?.role === "staff";
    const cashierId = Number(req.user?.id);

    if (
      isCashierScope &&
      (!Number.isSafeInteger(cashierId) || cashierId <= 0)
    ) {
      return res.status(401).json({ message: "Invalid cashier session." });
    }

    // Cashier ownership is primarily determined by payment_transactions.verified_by.
    // For legacy POS transactions where verified_by was not populated, safely fall
    // back to the receipt owner only when the receipt is explicitly linked to the
    // same payment transaction.
    //
    // IMPORTANT:
    // - A payment verified by another cashier is NOT included.
    // - Only NULL verified_by values may use the legacy receipt fallback.
    // - Admin reports remain unrestricted.
    const ownerSql = isCashierScope
      ? `(pt.verified_by = ?
      OR (
        pt.verified_by IS NULL
        AND EXISTS (
          SELECT 1
          FROM receipts r_owner
          WHERE r_owner.payment_transaction_id = pt.id
            AND r_owner.issued_by = ?
        )
      ))`
      : "1=1";

    const ownerParams = isCashierScope ? [cashierId, cashierId] : [];

    // Preserve the current cancellation semantics for R3B1. A separate
    // accounting/refund decision is required before cancelled collections
    // can safely be included in historical sales reporting.
    const paymentWhereSql = [
      "pt.status = 'verified'",
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

    // Order-level metrics use the same verified-payment population as the
    // collection metrics. This prevents Admin reports from mixing order-created
    // dates with payment dates in one report.
    const scopedPayment = buildPaymentFilter(req.query.payment, "pt_scope");
    const scopedPaymentDateExpression =
      "COALESCE(pt_scope.verified_at, pt_scope.created_at)";
    const scopedPaymentDate = buildDateFilter(
      { period, from, to },
      scopedPaymentDateExpression,
    );
    const scopedOwnerSql = isCashierScope
      ? `(pt_scope.verified_by = ?
      OR (
        pt_scope.verified_by IS NULL
        AND EXISTS (
          SELECT 1
          FROM receipts r_scope_owner
          WHERE r_scope_owner.payment_transaction_id = pt_scope.id
            AND r_scope_owner.issued_by = ?
        )
      ))`
      : "1=1";

    const orderWhereSql = [
      "o.status <> 'cancelled'",
      "COALESCE(o.total, 0) > 0",
      source.sql,
      `EXISTS (
        SELECT 1
        FROM payment_transactions pt_scope
        WHERE pt_scope.order_id = o.id
          AND pt_scope.status = 'verified'
          AND ${scopedPayment.sql}
          AND ${scopedPaymentDate.sql}
          AND ${scopedOwnerSql}
      )`,
    ].join(" AND ");
    const orderParams = [
      ...source.params,
      ...scopedPayment.params,
      ...scopedPaymentDate.params,
      ...(isCashierScope ? [cashierId, cashierId] : []),
    ];

    const [[orderTotals]] = await db.query(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(order_rows.total_amount), 0) AS gross_order_value,
         COALESCE(SUM(order_rows.discount), 0) AS total_discount,
         COALESCE(SUM(order_rows.outstanding_balance), 0) AS outstanding_balance
       FROM (
         SELECT
           o.id,
           COALESCE(o.total, 0) AS total_amount,
           COALESCE(o.discount, 0) AS discount,
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

    const periodExpression = buildPeriodExpression(
      period,
      paymentDateExpression,
    );
    const [summaryRows] = await db.query(
      `SELECT
     ${periodExpression} AS period_label,
     COUNT(*) AS transaction_count,
     COALESCE(SUM(pt.amount), 0) AS total_sales,

     COALESCE(
       SUM(
         CASE
           WHEN o.type = 'online' THEN pt.amount
           ELSE 0
         END
       ),
       0
     ) AS online_sales,

     COALESCE(
       SUM(
         CASE
           WHEN o.type <> 'online' OR o.type IS NULL THEN pt.amount
           ELSE 0
         END
       ),
       0
     ) AS walkin_sales

   FROM payment_transactions pt
   INNER JOIN orders o ON o.id = pt.order_id
   WHERE ${paymentWhereSql}
   GROUP BY ${periodExpression}
   ORDER BY period_label ASC`,
      paymentParams,
    );

    const [paymentRows] = await db.query(
      `SELECT
         pt.payment_method AS payment_method,
         COUNT(*) AS count,
         COALESCE(SUM(pt.amount), 0) AS total_amount
       FROM payment_transactions pt
       INNER JOIN orders o ON o.id = pt.order_id
       WHERE ${paymentWhereSql}
       GROUP BY pt.payment_method
       ORDER BY total_amount DESC, count DESC`,
      paymentParams,
    );

    // Product rows are merchandise/item values from orders connected to the
    // same filtered verified-payment population. Profit data is intentionally
    // not returned by this POS/Cashier report endpoint.
    const [productRows] = await db.query(
      `SELECT
         oi.product_name,
         SUM(COALESCE(oi.quantity, 0)) AS qty,
         COALESCE(SUM(
           COALESCE(oi.subtotal, COALESCE(oi.unit_price, 0) * COALESCE(oi.quantity, 0))
         ), 0) AS gross_order_value
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE ${orderWhereSql}
       GROUP BY oi.product_name
       ORDER BY gross_order_value DESC, qty DESC
       LIMIT 20`,
      orderParams,
    );

    const [[transactionCountRow]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM payment_transactions pt
       INNER JOIN orders o ON o.id = pt.order_id
       WHERE ${paymentWhereSql}`,
      paymentParams,
    );

    const transactionTotal = Number(transactionCountRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(transactionTotal / limit));

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
         COALESCE(o.total, 0) AS order_total,
         ${historicalCollectedAfterSql} AS lifetime_collected,
         ${historicalCollectedAfterSql} AS total_paid_after,
         COALESCE(
           receipt.remaining_balance_after,
           GREATEST(COALESCE(o.total, 0) - ${historicalCollectedAfterSql}, 0)
         ) AS remaining_balance,
         CASE
           WHEN receipt.payment_label IN ('full_payment', 'balance_payment') THEN 'paid'
           WHEN receipt.payment_label IN ('down_payment', 'partial_payment') THEN 'partial'
           WHEN COALESCE(o.total, 0) > 0
             AND ${historicalCollectedAfterSql} >= COALESCE(o.total, 0) THEN 'paid'
           WHEN ${historicalCollectedAfterSql} > 0 THEN 'partial'
           ELSE 'unpaid'
         END AS payment_status,
         COALESCE(customer.name, o.walkin_customer_name, 'Walk-in Customer') AS customer_name,
         COALESCE(customer.phone, o.walkin_customer_phone, 'No phone') AS customer_phone,
         CASE
  WHEN pt.payment_method = 'paymongo' THEN 'PayMongo / Online Payment'
  WHEN verifier.name IS NOT NULL THEN verifier.name
  WHEN receiptIssuer.name IS NOT NULL THEN receiptIssuer.name
  ELSE 'System'
END AS processed_by,
         receipt.id AS receipt_id,
         receipt.receipt_number,
         receipt.payment_label,
         receipt.previous_paid_amount,
         receipt.amount_paid AS receipt_amount_paid
       FROM payment_transactions pt
       INNER JOIN orders o ON o.id = pt.order_id
       LEFT JOIN users customer ON customer.id = o.customer_id
LEFT JOIN users verifier ON verifier.id = pt.verified_by
LEFT JOIN receipts receipt ON receipt.payment_transaction_id = pt.id
LEFT JOIN users receiptIssuer ON receiptIssuer.id = receipt.issued_by
       WHERE ${paymentWhereSql}
       ORDER BY COALESCE(pt.verified_at, pt.created_at) DESC, pt.id DESC
       LIMIT ? OFFSET ?`,
      [...paymentParams, limit, offset],
    );

    const totals = {
      total_orders: Number(orderTotals?.total_orders || 0),
      gross_order_value: Number(orderTotals?.gross_order_value || 0),
      actual_collected: Number(collectionTotals?.actual_collected || 0),
      grand_total: Number(collectionTotals?.actual_collected || 0),
      outstanding_balance: Number(orderTotals?.outstanding_balance || 0),
      total_discount: Number(orderTotals?.total_discount || 0),
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
      filters_applied: {
        source: source.value,
        payment: payment.value,
        period,
        from: from || null,
        to: to || null,
      },
      generated_at: new Date().toISOString(),
      totals,
      summary: summaryRows,
      payment_breakdown: paymentRows,
      top_products: productRows,
      transactions: transactionRows,
      pagination: {
        page,
        limit,
        total: transactionTotal,
        total_pages: totalPages,
        has_previous: page > 1,
        has_next: page < totalPages,
      },
    });
  } catch (err) {
    const statusCode = Number(err.statusCode) || 500;
    if (statusCode >= 500) {
      console.error("\n❌ [POS Reports Error]:", err);
    }
    res.status(statusCode).json({
      message:
        statusCode === 400 ? err.message : "Server error generating reports",
    });
  }
};
