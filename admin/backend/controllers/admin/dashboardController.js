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

    const [[orderStats]] = await pool.query(
      `
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(status = 'completed'), 0) AS completed_orders,
        COALESCE(SUM(status = 'pending'), 0) AS pending_orders,
        COALESCE(SUM(status = 'production'), 0) AS processing_orders,
        COALESCE(SUM(status = 'shipping'), 0) AS shipped_orders,
        COALESCE(SUM(status = 'cancelled'), 0) AS cancelled_orders
      FROM orders
      WHERE DATE(created_at) BETWEEN ? AND ?
      `,
      dateParams,
    );

    // Revenue + AOV must be separate from order_items join to avoid duplicated totals
    const [[salesTotals]] = await pool.query(
      `
      SELECT
        COALESCE(SUM(o.total), 0) AS total_revenue,
        COALESCE(AVG(o.total), 0) AS avg_order_value,
        COALESCE(SUM(o.type = 'online'), 0) AS online_orders,
        COALESCE(SUM(o.type = 'walkin'), 0) AS walkin_orders
      FROM orders o
      WHERE o.status != 'cancelled'
        AND DATE(o.created_at) BETWEEN ? AND ?
      `,
      dateParams,
    );

    const [[profitTotals]] = await pool.query(
      `
      SELECT
        COALESCE(SUM(oi.profit_margin * oi.quantity), 0) AS total_profit
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'cancelled'
        AND DATE(o.created_at) BETWEEN ? AND ?
      `,
      dateParams,
    );

    const salesStats = {
      total_revenue: Number(salesTotals.total_revenue || 0),
      total_profit: Number(profitTotals.total_profit || 0),
      avg_order_value: Number(salesTotals.avg_order_value || 0),
      online_orders: Number(salesTotals.online_orders || 0),
      walkin_orders: Number(salesTotals.walkin_orders || 0),
    };

    let rawChartRows = [];

    if (chartMode === "monthly") {
      [rawChartRows] = await pool.query(
        `
        SELECT
          DATE_FORMAT(created_at, '%Y-%m') AS bucket,
          COALESCE(SUM(CASE WHEN type = 'online' THEN total ELSE 0 END), 0) AS online_sales,
          COALESCE(SUM(CASE WHEN type = 'walkin' THEN total ELSE 0 END), 0) AS walkin_sales
        FROM orders
        WHERE status != 'cancelled'
          AND DATE(created_at) BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY bucket ASC
        `,
        dateParams,
      );
    } else {
      [rawChartRows] = await pool.query(
        `
        SELECT
          DATE_FORMAT(created_at, '%Y-%m-%d') AS bucket,
          COALESCE(SUM(CASE WHEN type = 'online' THEN total ELSE 0 END), 0) AS online_sales,
          COALESCE(SUM(CASE WHEN type = 'walkin' THEN total ELSE 0 END), 0) AS walkin_sales
        FROM orders
        WHERE status != 'cancelled'
          AND DATE(created_at) BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
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
        AND DATE(o.created_at) BETWEEN ? AND ?
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
        o.created_at
      FROM orders o
      LEFT JOIN users u ON u.id = o.customer_id
      WHERE DATE(o.created_at) BETWEEN ? AND ?
      ORDER BY o.created_at DESC
      LIMIT 15
      `,
      dateParams,
    );

    return res.json({
      inventory: {
        ...invStats,
        ...rawStats,
      },
      orders: orderStats,
      sales: salesStats,
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
