const pool = require("../../config/db");

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseISODate(value) {
  if (!value || !ISO_DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateRange(preset, rawFrom, rawTo) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (rawFrom || rawTo) {
    if (!rawFrom || !rawTo) {
      throw createHttpError(
        400,
        "Both from and to dates are required for custom range.",
      );
    }

    const fromDate = parseISODate(rawFrom);
    const toDate = parseISODate(rawTo);

    if (!fromDate || !toDate) {
      throw createHttpError(400, "Invalid custom date range. Use YYYY-MM-DD.");
    }

    if (fromDate > toDate) {
      throw createHttpError(400, "Start date must be before end date.");
    }

    return { from: rawFrom, to: rawTo };
  }

  switch (preset) {
    case "today": {
      const t = formatISODate(today);
      return { from: t, to: t };
    }

    case "yesterday": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      const y = formatISODate(d);
      return { from: y, to: y };
    }

    case "week": {
      const start = new Date(today);
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      start.setDate(start.getDate() - diff);
      return { from: formatISODate(start), to: formatISODate(today) };
    }

    case "last7": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { from: formatISODate(start), to: formatISODate(today) };
    }

    case "month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: formatISODate(start), to: formatISODate(today) };
    }

    case "last30": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { from: formatISODate(start), to: formatISODate(today) };
    }

    case "year": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { from: formatISODate(start), to: formatISODate(today) };
    }

    case "last12m": {
      const start = new Date(today);
      start.setDate(1);
      start.setMonth(start.getMonth() - 11);
      return { from: formatISODate(start), to: formatISODate(today) };
    }

    default: {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { from: formatISODate(start), to: formatISODate(today) };
    }
  }
}

function diffInDaysInclusive(from, to) {
  const start = parseISODate(from);
  const end = parseISODate(to);
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}

function buildDailySeries(rows, from, to) {
  const rowMap = new Map(
    rows.map((r) => [
      r.bucket,
      {
        online_sales: Number(r.online_sales || 0),
        walkin_sales: Number(r.walkin_sales || 0),
      },
    ]),
  );

  const start = parseISODate(from);
  const end = parseISODate(to);
  const series = [];

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = formatISODate(d);
    const row = rowMap.get(key) || { online_sales: 0, walkin_sales: 0 };

    series.push({
      date: key,
      online_sales: row.online_sales,
      walkin_sales: row.walkin_sales,
    });
  }

  return series;
}

function buildMonthlySeries(rows, from, to) {
  const rowMap = new Map(
    rows.map((r) => [
      r.bucket,
      {
        online_sales: Number(r.online_sales || 0),
        walkin_sales: Number(r.walkin_sales || 0),
      },
    ]),
  );

  const start = parseISODate(from);
  const end = parseISODate(to);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const limit = new Date(end.getFullYear(), end.getMonth(), 1);
  const series = [];

  while (cursor <= limit) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;
    const row = rowMap.get(key) || { online_sales: 0, walkin_sales: 0 };

    series.push({
      date: key,
      online_sales: row.online_sales,
      walkin_sales: row.walkin_sales,
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return series;
}

exports.getDashboard = async (req, res) => {
  try {
    const { preset, from: rawFrom, to: rawTo } = req.query;
    const { from, to } = getDateRange(preset, rawFrom, rawTo);
    const dateParams = [from, to];

    const totalDays = diffInDaysInclusive(from, to);
    const chartMode =
      preset === "year" || preset === "last12m" || totalDays > 120
        ? "monthly"
        : "daily";

    // ── 1. INVENTORY ──
    const [[invStats]] = await pool.query(`
      SELECT
        COUNT(*) AS total_products,
        COALESCE(SUM(stock_status = 'low_stock'), 0) AS low_stock_count,
        COALESCE(SUM(stock_status = 'out_of_stock'), 0) AS out_of_stock_count
      FROM products
    `);

    const [[rawStats]] = await pool.query(`
      SELECT
        COUNT(*) AS total_raw_materials,
        COALESCE(SUM(stock_status = 'low_stock'), 0) AS raw_low_stock,
        COALESCE(SUM(stock_status = 'out_of_stock'), 0) AS raw_out_of_stock
      FROM raw_materials
    `);

    let stockMovements = { stock_in_total: 0, stock_out_total: 0 };
    try {
      const [[movements]] = await pool.query(
        `
        SELECT
          COALESCE(SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END), 0) AS stock_in_total,
          COALESCE(SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END), 0) AS stock_out_total
        FROM stock_movements
        WHERE DATE(DATE_ADD(created_at, INTERVAL 8 HOUR)) BETWEEN ? AND ?
      `,
        dateParams,
      );
      stockMovements = movements;
    } catch (e) {}

    const inventory = {
      ...invStats,
      ...rawStats,
      ...stockMovements,
      alert_total:
        Number(invStats.low_stock_count) +
        Number(invStats.out_of_stock_count) +
        Number(rawStats.raw_low_stock) +
        Number(rawStats.raw_out_of_stock),
    };

    // ── 2. CURRENT OPS & ORDERS ──
    const [[currentOpsDate]] = await pool.query(
      `
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(status = 'completed'), 0) AS completed_orders,
        COALESCE(SUM(status = 'pending'), 0) AS pending_orders,
        COALESCE(SUM(status = 'confirmed'), 0) AS confirmed_orders,
        COALESCE(SUM(status = 'production'), 0) AS production_orders,
        COALESCE(SUM(status = 'shipping'), 0) AS shipping_orders,
        COALESCE(SUM(status = 'delivered'), 0) AS delivered_orders,
        COALESCE(SUM(status = 'cancelled'), 0) AS cancelled_orders
      FROM orders
      WHERE DATE(DATE_ADD(created_at, INTERVAL 8 HOUR)) BETWEEN ? AND ?
      `,
      dateParams,
    );

    // All-time Open Queue (Ignores date filter)
    const [[currentOpsAllTime]] = await pool.query(`
      SELECT
        COALESCE(SUM(status NOT IN ('completed', 'cancelled')), 0) AS open_orders,
        COALESCE(SUM(status = 'delivered' AND (payment_status IS NULL OR payment_status != 'paid')), 0) AS delivered_unpaid_orders
      FROM orders
    `);

    const currentOps = { ...currentOpsDate, ...currentOpsAllTime };

    // ── 3. SALES & REVENUE (Strictly using `type` for online/walkin) ──
    const [[salesTotals]] = await pool.query(
      `
      SELECT
        COALESCE(SUM(o.total), 0) AS total_revenue,
        COALESCE(AVG(o.total), 0) AS avg_order_value,
        COALESCE(SUM(o.type = 'online'), 0) AS online_orders,
        COALESCE(SUM(o.type = 'walkin'), 0) AS walkin_orders
      FROM orders o
      WHERE o.status != 'cancelled'
        AND DATE(DATE_ADD(o.created_at, INTERVAL 8 HOUR)) BETWEEN ? AND ?
      `,
      dateParams,
    );

    let totalProfit = 0;
    try {
      const [[profitTotals]] = await pool.query(
        `
        SELECT COALESCE(SUM(oi.profit_margin * oi.quantity), 0) AS total_profit
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status != 'cancelled'
          AND DATE(DATE_ADD(o.created_at, INTERVAL 8 HOUR)) BETWEEN ? AND ?
        `,
        dateParams,
      );
      totalProfit = profitTotals.total_profit;
    } catch (e) {}

    const salesStats = {
      total_revenue: Number(salesTotals.total_revenue || 0),
      total_profit: Number(totalProfit || 0),
      avg_order_value: Number(salesTotals.avg_order_value || 0),
      online_orders: Number(salesTotals.online_orders || 0),
      walkin_orders: Number(salesTotals.walkin_orders || 0),
    };

    // ── 4. PAYMENTS QUEUE ──
    let payments = { pending_reviews: 0 };
    try {
      const [[paymentRows]] = await pool.query(`
        SELECT COALESCE(SUM(status = 'pending'), 0) AS pending_reviews
        FROM payments
      `);
      payments = paymentRows;
    } catch (e) {}

    // ── 5. BLUEPRINT PIPELINE (Strictly using order_type and valid statuses) ──
    const [[blueprintDbRows]] = await pool.query(`
      SELECT
        COUNT(*) AS total_blueprint_orders,
        COALESCE(SUM(status = 'pending'), 0) AS pending_custom_review,
        COALESCE(SUM(status = 'confirmed'), 0) AS quotation_approved,
        COALESCE(SUM(status = 'contract_released'), 0) AS contract_released,
        COALESCE(SUM(status = 'production'), 0) AS in_production,
        COALESCE(SUM(status IN ('shipping', 'delivered')), 0) AS ready_for_dispatch,
        COALESCE(SUM(status = 'completed'), 0) AS completed_blueprint_orders
      FROM orders
      WHERE order_type = 'blueprint' OR blueprint_id IS NOT NULL
    `);

    const blueprint = {
      ...blueprintDbRows,
      estimate_drafting: 0, // Fallbacks for frontend so it doesn't crash
      quotation_waiting: 0,
    };

    // ── 6. CHARTS & RECENT ──
    let rawChartRows = [];

    if (chartMode === "monthly") {
      [rawChartRows] = await pool.query(
        `
        SELECT
          DATE_FORMAT(DATE_ADD(created_at, INTERVAL 8 HOUR), '%Y-%m') AS bucket,
          COALESCE(SUM(CASE WHEN type = 'online' THEN total ELSE 0 END), 0) AS online_sales,
          COALESCE(SUM(CASE WHEN type = 'walkin' THEN total ELSE 0 END), 0) AS walkin_sales
        FROM orders
        WHERE status != 'cancelled'
          AND DATE(DATE_ADD(created_at, INTERVAL 8 HOUR)) BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(DATE_ADD(created_at, INTERVAL 8 HOUR), '%Y-%m')
        ORDER BY bucket ASC
        `,
        dateParams,
      );
    } else {
      [rawChartRows] = await pool.query(
        `
        SELECT
          DATE_FORMAT(DATE_ADD(created_at, INTERVAL 8 HOUR), '%Y-%m-%d') AS bucket,
          COALESCE(SUM(CASE WHEN type = 'online' THEN total ELSE 0 END), 0) AS online_sales,
          COALESCE(SUM(CASE WHEN type = 'walkin' THEN total ELSE 0 END), 0) AS walkin_sales
        FROM orders
        WHERE status != 'cancelled'
          AND DATE(DATE_ADD(created_at, INTERVAL 8 HOUR)) BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(DATE_ADD(created_at, INTERVAL 8 HOUR), '%Y-%m-%d')
        ORDER BY bucket ASC
        `,
        dateParams,
      );
    }

    const salesChart =
      chartMode === "monthly"
        ? buildMonthlySeries(rawChartRows, from, to)
        : buildDailySeries(rawChartRows, from, to);

    const [topProducts] = await pool.query(
      `
      SELECT
        oi.product_id,
        oi.product_name,
        COALESCE(SUM(oi.quantity), 0) AS units_sold,
        COALESCE(SUM(oi.subtotal), 0) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'cancelled'
        AND DATE(DATE_ADD(o.created_at, INTERVAL 8 HOUR)) BETWEEN ? AND ?
      GROUP BY oi.product_id, oi.product_name
      ORDER BY units_sold DESC, revenue DESC
      LIMIT 10
      `,
      dateParams,
    );

    const [recentOrders] = await pool.query(
      `
      SELECT
        o.id,
        COALESCE(u.name, o.walkin_customer_name, 'Walk-in') AS customer_name,
        o.total AS total_amount,
        o.status,
        o.type AS channel,
        o.order_type,
        o.payment_status,
        o.created_at
      FROM orders o
      LEFT JOIN users u ON u.id = o.customer_id
      WHERE DATE(DATE_ADD(o.created_at, INTERVAL 8 HOUR)) BETWEEN ? AND ?
      ORDER BY o.created_at DESC
      LIMIT 15
      `,
      dateParams,
    );

    return res.json({
      inventory,
      orders: currentOpsDate,
      currentOps,
      sales: salesStats,
      payments,
      blueprint,
      salesChart,
      chartMode,
      topProducts,
      recentOrders,
      dateRange: {
        from,
        to,
        preset: preset || (rawFrom && rawTo ? "custom" : "last30"),
      },
    });
  } catch (err) {
    console.error("[Dashboard]", err.message);

    return res.status(err.status || 500).json({
      message: err.message || "Failed to load dashboard data.",
    });
  }
};
