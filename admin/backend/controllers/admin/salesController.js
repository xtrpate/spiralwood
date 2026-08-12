// controllers/admin/salesController.js
// Sales reporting separates order value from money that was actually collected.
const pool = require("../../config/db");

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const VALID_CHANNELS = new Set(["online", "walkin"]);
const VALID_PERIODS = new Set(["daily", "weekly", "monthly", "yearly"]);

const buildChannelFilter = (rawChannel, alias = "o") => {
  const channel = normalize(rawChannel);
  if (!channel) return { sql: "1=1", params: [] };
  if (!VALID_CHANNELS.has(channel)) {
    const error = new Error("Invalid sales channel filter.");
    error.statusCode = 400;
    throw error;
  }
  return { sql: `${alias}.type = ?`, params: [channel] };
};

const buildDateFilter = ({ from, to, period }, expression) => {
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
    : "monthly";

  if (normalizedPeriod === "daily") {
    return { sql: `DATE(${expression}) = CURDATE()`, params: [] };
  }
  if (normalizedPeriod === "weekly") {
    return {
      sql: `YEARWEEK(${expression}, 1) = YEARWEEK(CURDATE(), 1)`,
      params: [],
    };
  }
  if (normalizedPeriod === "yearly") {
    return { sql: `YEAR(${expression}) = YEAR(CURDATE())`, params: [] };
  }

  return {
    sql: `YEAR(${expression}) = YEAR(CURDATE()) AND MONTH(${expression}) = MONTH(CURDATE())`,
    params: [],
  };
};

const getFilters = (query) => {
  const channel = buildChannelFilter(query.channel, "o");
  const orderDate = buildDateFilter(query, "o.created_at");
  const paymentDate = buildDateFilter(
    query,
    "COALESCE(pt.verified_at, pt.created_at)",
  );
  return { channel, orderDate, paymentDate };
};

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

const lifetimeCollectedSql = `COALESCE((
  SELECT SUM(pt_life.amount)
  FROM payment_transactions pt_life
  WHERE pt_life.order_id = o.id
    AND LOWER(pt_life.status) = 'verified'
), 0)`;

exports.getReport = async (req, res) => {
  try {
    const { channel, orderDate, paymentDate } = getFilters(req.query);

    const orderWhereSql = [
      "o.status <> 'cancelled'",
      channel.sql,
      orderDate.sql,
    ].join(" AND ");
    const orderParams = [...channel.params, ...orderDate.params];

    const paymentWhereSql = [
      "LOWER(pt.status) = 'verified'",
      channel.sql,
      paymentDate.sql,
    ].join(" AND ");
    const paymentParams = [...channel.params, ...paymentDate.params];

    const [[orderSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(order_rows.total_amount), 0) AS gross_order_value,
         COALESCE(SUM(order_rows.outstanding_balance), 0) AS outstanding_balance,
         COALESCE(SUM(order_rows.estimated_profit), 0) AS total_profit,
         COALESCE(AVG(order_rows.total_amount), 0) AS avg_order_value,
         COALESCE(SUM(order_rows.channel = 'online'), 0) AS online_count,
         COALESCE(SUM(order_rows.channel = 'walkin'), 0) AS walkin_count
       FROM (
         SELECT
           o.id,
           o.type AS channel,
           COALESCE(o.total, 0) AS total_amount,
           GREATEST(COALESCE(o.total, 0) - ${lifetimeCollectedSql}, 0) AS outstanding_balance,
           ${estimatedProfitSql} AS estimated_profit
         FROM orders o
         WHERE ${orderWhereSql}
       ) AS order_rows`,
      orderParams,
    );

    const [[collectionSummary]] = await pool.query(
      `SELECT
         COUNT(*) AS collection_count,
         COALESCE(SUM(pt.amount), 0) AS actual_collected
       FROM payment_transactions pt
       INNER JOIN orders o ON o.id = pt.order_id
       WHERE ${paymentWhereSql}`,
      paymentParams,
    );

    // Include non-cancelled orders created in the selected order period,
    // plus any order (including cancelled ones) that has a real verified
    // collection in the selected payment period.
    const [orders] = await pool.query(
      `SELECT
         o.id,
         o.order_number,
         o.order_type,
         o.type AS channel,
         o.status,
         o.payment_method AS initial_payment_method,
         o.payment_status,
         COALESCE(o.total, 0) AS total_amount,
         o.created_at,
         COALESCE(u.name, o.walkin_customer_name, 'Walk-in Customer') AS customer_name,
         COALESCE(u.phone, o.walkin_customer_phone, '') AS customer_phone,
         COALESCE((
           SELECT SUM(pt_period.amount)
           FROM payment_transactions pt_period
           WHERE pt_period.order_id = o.id
             AND LOWER(pt_period.status) = 'verified'
             AND ${paymentDate.sql.split("pt.").join("pt_period.")}
         ), 0) AS collected_this_period,
         ${lifetimeCollectedSql} AS lifetime_collected,
         GREATEST(COALESCE(o.total, 0) - ${lifetimeCollectedSql}, 0) AS remaining_balance,
         ${estimatedProfitSql} AS total_profit,
         (SELECT COUNT(*)
            FROM receipts r_count
            INNER JOIN payment_transactions pt_receipt
              ON pt_receipt.id = r_count.payment_transaction_id
           WHERE pt_receipt.order_id = o.id
             AND LOWER(pt_receipt.status) = 'verified'
         ) AS receipt_count,
         (SELECT GROUP_CONCAT(
             DISTINCT LOWER(pt_method.payment_method)
             ORDER BY LOWER(pt_method.payment_method)
             SEPARATOR ', '
           )
            FROM payment_transactions pt_method
           WHERE pt_method.order_id = o.id
             AND LOWER(pt_method.status) = 'verified'
         ) AS collected_payment_methods,
         (SELECT MAX(COALESCE(pt_last.verified_at, pt_last.created_at))
            FROM payment_transactions pt_last
           WHERE pt_last.order_id = o.id
             AND LOWER(pt_last.status) = 'verified'
         ) AS last_payment_at,
         (SELECT d.status
            FROM deliveries d
           WHERE d.order_id = o.id
           ORDER BY d.id DESC
           LIMIT 1
         ) AS delivery_status
       FROM orders o
       LEFT JOIN users u ON u.id = o.customer_id
       WHERE ${channel.sql}
         AND (
           (o.status <> 'cancelled' AND ${orderDate.sql})
           OR EXISTS (
             SELECT 1
             FROM payment_transactions pt
             WHERE pt.order_id = o.id
               AND LOWER(pt.status) = 'verified'
               AND ${paymentDate.sql}
           )
         )
       ORDER BY COALESCE(last_payment_at, o.created_at) DESC, o.id DESC`,
      [
        ...paymentDate.params,
        ...channel.params,
        ...orderDate.params,
        ...paymentDate.params,
      ],
    );

    const [collections] = await pool.query(
      `SELECT
         pt.id AS payment_transaction_id,
         pt.order_id,
         pt.amount,
         pt.payment_method,
         COALESCE(pt.verified_at, pt.created_at) AS payment_date,
         pt.notes,
         o.order_number,
         o.order_type,
         o.type AS channel,
         o.status AS order_status,
         o.payment_status,
         COALESCE(o.total, 0) AS order_total,
         COALESCE(u.name, o.walkin_customer_name, 'Walk-in Customer') AS customer_name,
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
       LEFT JOIN users u ON u.id = o.customer_id
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
       ORDER BY COALESCE(pt.verified_at, pt.created_at) DESC, pt.id DESC`,
      paymentParams,
    );

    const [paymentMethods] = await pool.query(
      `SELECT
         LOWER(pt.payment_method) AS payment_method,
         COUNT(*) AS transaction_count,
         COALESCE(SUM(pt.amount), 0) AS total_amount
       FROM payment_transactions pt
       INNER JOIN orders o ON o.id = pt.order_id
       WHERE ${paymentWhereSql}
       GROUP BY LOWER(pt.payment_method)
       ORDER BY total_amount DESC, transaction_count DESC`,
      paymentParams,
    );

    const [products] = await pool.query(
      `SELECT
         oi.product_name,
         SUM(COALESCE(oi.quantity, 0)) AS units_sold,
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
       ORDER BY gross_order_value DESC, units_sold DESC`,
      orderParams,
    );

    const [salesByChannelRows] = await pool.query(
      `
  SELECT
    o.type AS channel,
    COUNT(*) AS order_count,
    COALESCE(SUM(o.total), 0) AS sales_revenue
  FROM orders o
  WHERE ${orderWhereSql}
  GROUP BY o.type
  ORDER BY o.type
  `,
      orderParams,
    );

    const salesByChannel = [
      {
        channel: "online",
        order_count: 0,
        sales_revenue: 0,
      },
      {
        channel: "walkin",
        order_count: 0,
        sales_revenue: 0,
      },
    ].map((base) => {
      const found = salesByChannelRows.find(
        (row) => String(row.channel || "").toLowerCase() === base.channel,
      );

      return {
        channel: base.channel,
        order_count: Number(found?.order_count || 0),
        sales_revenue: Number(found?.sales_revenue || 0),
      };
    });

    const [printProducts] = await pool.query(
      `
  SELECT
    oi.product_name,
    o.type AS channel,
    COALESCE(oi.unit_price, 0) AS unit_price,
    SUM(COALESCE(oi.quantity, 0)) AS units_sold,
    COALESCE(
      SUM(
        COALESCE(
          oi.subtotal,
          COALESCE(oi.unit_price, 0) * COALESCE(oi.quantity, 0)
        )
      ),
      0
    ) AS sales_amount
  FROM order_items oi
  INNER JOIN orders o ON o.id = oi.order_id
  WHERE ${orderWhereSql}
  GROUP BY
    oi.product_name,
    o.type,
    oi.unit_price
  ORDER BY
    sales_amount DESC,
    units_sold DESC,
    oi.product_name ASC
  `,
      orderParams,
    );

    const summary = {
      total_orders: Number(orderSummary?.total_orders || 0),
      gross_order_value: Number(orderSummary?.gross_order_value || 0),
      actual_collected: Number(collectionSummary?.actual_collected || 0),

      // Compatibility alias.
      total_revenue: Number(collectionSummary?.actual_collected || 0),

      outstanding_balance: Number(orderSummary?.outstanding_balance || 0),
      total_profit: Number(orderSummary?.total_profit || 0),
      avg_order_value: Number(orderSummary?.avg_order_value || 0),

      online_count: Number(orderSummary?.online_count || 0),
      walkin_count: Number(orderSummary?.walkin_count || 0),

      collection_count: Number(collectionSummary?.collection_count || 0),
    };

    res.json({
      summary,
      orders,
      collections,
      payment_methods: paymentMethods,
      products,
      sales_by_channel: salesByChannel,
      print_products: printProducts,
    });
  } catch (err) {
    const statusCode = Number(err.statusCode) || 500;
    if (statusCode >= 500) {
      console.error("[salesController.getReport]", err);
    }
    res.status(statusCode).json({
      message:
        statusCode === 400
          ? err.message
          : "Failed to generate the sales report.",
    });
  }
};

exports.getPrintData = async (req, res) => exports.getReport(req, res);
