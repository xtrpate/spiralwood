const pool = require("../../config/db");
const {
  getPhilippineDateBoundsUtc,
} = require("../../utils/philippineTime");

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

function getManilaToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return new Date(values.year, values.month - 1, values.day);
}

function getDateRange(preset, rawFrom, rawTo) {
  const today = getManilaToday();

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

function getPhilippineUtcRange(from, to) {
  try {
    const start = getPhilippineDateBoundsUtc(from);
    const end = getPhilippineDateBoundsUtc(to);
    return [start.startUtc, end.nextStartUtc];
  } catch {
    throw createHttpError(400, "Invalid custom date range. Use YYYY-MM-DD.");
  }
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
    const salesUtcParams = getPhilippineUtcRange(from, to);

    const totalDays = diffInDaysInclusive(from, to);
    const chartMode =
      preset === "year" || preset === "last12m" || totalDays > 120
        ? "monthly"
        : "daily";

    // ── 1. INVENTORY ──
    // Compute current health from inventory facts instead of persisted labels.
    const [[invStats]] = await pool.query(`
      SELECT
        COUNT(*) AS total_products,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(p.stock, 0) > COALESCE(p.reorder_point, 0)
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS healthy_stock_count,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(p.stock, 0) > 0
               AND COALESCE(p.stock, 0) <= COALESCE(p.reorder_point, 0)
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS low_stock_count,
        0 AS critical_stock_count,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(p.stock, 0) <= 0
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS out_of_stock_count
      FROM products p
      WHERE p.is_active = 1
        AND LOWER(COALESCE(p.type, 'standard')) = 'standard'
    `);

    const [[rawStats]] = await pool.query(`
      SELECT
        COUNT(*) AS total_raw_materials,
        COALESCE(
          SUM(computed_stock_status = 'healthy_stock'),
          0
        ) AS raw_healthy_stock,
        COALESCE(
          SUM(computed_stock_status = 'low_stock'),
          0
        ) AS raw_low_stock,
        COALESCE(
          SUM(computed_stock_status = 'critical_stock'),
          0
        ) AS raw_critical_stock,
        COALESCE(
          SUM(computed_stock_status = 'out_of_stock'),
          0
        ) AS raw_out_of_stock
      FROM (
        SELECT
          rm.id,
          CASE
            WHEN COALESCE(rm.quantity, 0) <= 0
              THEN 'out_of_stock'
            WHEN COALESCE(bmr_summary.pending_need_quantity, 0) > 0
              THEN 'critical_stock'
            WHEN GREATEST(
              COALESCE(rm.quantity, 0) -
                COALESCE(bmr_summary.reserved_quantity, 0),
              0
            ) <= 0
              THEN 'critical_stock'
            WHEN GREATEST(
              COALESCE(rm.quantity, 0) -
                COALESCE(bmr_summary.reserved_quantity, 0),
              0
            ) <= COALESCE(rm.safety_stock, 0)
              THEN 'critical_stock'
            WHEN COALESCE(rm.lead_time_days, 0) > 0
             AND COALESCE(usage_summary.avg_daily_usage_30d, 0) > 0
             AND GREATEST(
               COALESCE(rm.quantity, 0) -
                 COALESCE(bmr_summary.reserved_quantity, 0),
               0
             ) <= (
               COALESCE(rm.safety_stock, 0) +
               (
                 COALESCE(usage_summary.avg_daily_usage_30d, 0) *
                 GREATEST(COALESCE(rm.lead_time_days, 0), 0)
               )
             )
              THEN 'critical_stock'
            WHEN GREATEST(
              COALESCE(rm.quantity, 0) -
                COALESCE(bmr_summary.reserved_quantity, 0),
              0
            ) <= COALESCE(rm.reorder_point, 0)
              THEN 'low_stock'
            ELSE 'healthy_stock'
          END AS computed_stock_status
        FROM raw_materials rm
        LEFT JOIN (
          SELECT
            material_id,
            SUM(
              CASE
                WHEN status = 'reserved' THEN quantity ELSE 0
              END
            ) AS reserved_quantity,
            SUM(
              CASE
                WHEN status = 'pending_stock' THEN quantity ELSE 0
              END
            ) AS pending_need_quantity
          FROM blueprint_material_reservations
          GROUP BY material_id
        ) bmr_summary ON bmr_summary.material_id = rm.id
        LEFT JOIN (
          SELECT
            material_id,
            SUM(quantity) / 30 AS avg_daily_usage_30d
          FROM stock_movements
          WHERE material_id IS NOT NULL
            AND product_id IS NULL
            AND type = 'out'
            AND reference LIKE 'BLUEPRINT-RESERVATION-%'
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY material_id
        ) usage_summary ON usage_summary.material_id = rm.id
        WHERE rm.is_active = 1
      ) raw_health
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
        Number(invStats.critical_stock_count) +
        Number(invStats.out_of_stock_count) +
        Number(rawStats.raw_low_stock) +
        Number(rawStats.raw_critical_stock) +
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
        COALESCE(SUM(status = 'contract_released'), 0) AS contract_released_orders,
        COALESCE(SUM(status = 'production'), 0) AS production_orders,
        COALESCE(SUM(status = 'ready_for_pickup'), 0) AS ready_for_pickup_orders,
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
        COALESCE(SUM(status = 'pending'), 0) AS open_pending_orders,
        COALESCE(SUM(status = 'delivered' AND (payment_status IS NULL OR payment_status != 'paid')), 0) AS delivered_unpaid_orders
      FROM orders
    `);

    const currentOps = { ...currentOpsDate, ...currentOpsAllTime };

    // ── 3. SALES / VERIFIED COLLECTIONS ──
    // Order value and collected money are different business measures.
    // Keep non-cancelled order value as context, but the dashboard's primary
    // sales KPI follows the canonical Sales Report definition: only verified
    // payment_transactions recognized by payment verification date.
    const [[orderValueTotals]] = await pool.query(
      `
      SELECT
        COALESCE(SUM(o.total), 0) AS order_value,
        COALESCE(AVG(o.total), 0) AS avg_order_value,
        COALESCE(SUM(o.type = 'online'), 0) AS online_orders,
        COALESCE(SUM(o.type = 'walkin'), 0) AS walkin_orders
      FROM orders o
      WHERE o.status != 'cancelled'
        AND o.created_at >= ?
        AND o.created_at < ?
      `,
      salesUtcParams,
    );

    const [[collectionTotals]] = await pool.query(
      `
      SELECT
        COALESCE(SUM(pt.amount), 0) AS verified_collections,
        COUNT(*) AS verified_payment_count
      FROM payment_transactions pt
      INNER JOIN orders o ON o.id = pt.order_id
      WHERE LOWER(pt.status) = 'verified'
        AND COALESCE(pt.verified_at, pt.created_at) >= ?
        AND COALESCE(pt.verified_at, pt.created_at) < ?
      `,
      salesUtcParams,
    );

    const verifiedCollections = Number(
      collectionTotals.verified_collections || 0,
    );

    const salesStats = {
      // Compatibility alias: dashboard consumers historically read
      // total_revenue. It now represents actual verified collections.
      total_revenue: verifiedCollections,
      verified_collections: verifiedCollections,
      verified_payment_count: Number(
        collectionTotals.verified_payment_count || 0,
      ),
      order_value: Number(orderValueTotals.order_value || 0),
      avg_order_value: Number(orderValueTotals.avg_order_value || 0),
      online_orders: Number(orderValueTotals.online_orders || 0),
      walkin_orders: Number(orderValueTotals.walkin_orders || 0),
    };

    // ── 4. PAYMENTS QUEUE ──
    // Pending review work is stored in payment_transactions. Do not swallow
    // database failures here: showing a fake zero could hide money awaiting
    // admin review.
    const [[paymentRows]] = await pool.query(`
      SELECT COUNT(*) AS pending_reviews
      FROM payment_transactions
      WHERE status = 'pending'
    `);
    const payments = {
      pending_reviews: Number(paymentRows?.pending_reviews || 0),
    };

    // ── 5. BLUEPRINT PIPELINE (Strictly using order_type and valid statuses) ──
    const [[blueprintDbRows]] = await pool.query(
      `
      SELECT
        COUNT(*) AS total_blueprint_orders,
        COALESCE(SUM(status = 'pending'), 0) AS pending_custom_review,
        COALESCE(SUM(status = 'confirmed'), 0) AS quotation_approved,
        COALESCE(SUM(status = 'contract_released'), 0) AS contract_released,
        COALESCE(SUM(status = 'production'), 0) AS in_production,
        COALESCE(SUM(status IN ('ready_for_pickup', 'shipping', 'delivered')), 0) AS fulfillment,
        COALESCE(SUM(status = 'completed'), 0) AS completed_blueprint_orders,
        COALESCE(SUM(status = 'cancelled'), 0) AS cancelled_blueprint_orders
      FROM orders
      WHERE (order_type = 'blueprint' OR blueprint_id IS NOT NULL)
        AND DATE(DATE_ADD(created_at, INTERVAL 8 HOUR)) BETWEEN ? AND ?
      `,
      dateParams,
    );

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
          DATE_FORMAT(
            DATE_ADD(COALESCE(pt.verified_at, pt.created_at), INTERVAL 8 HOUR),
            '%Y-%m'
          ) AS bucket,
          COALESCE(
            SUM(CASE WHEN o.type = 'online' THEN pt.amount ELSE 0 END),
            0
          ) AS online_sales,
          COALESCE(
            SUM(CASE WHEN o.type = 'walkin' THEN pt.amount ELSE 0 END),
            0
          ) AS walkin_sales
        FROM payment_transactions pt
        INNER JOIN orders o ON o.id = pt.order_id
        WHERE LOWER(pt.status) = 'verified'
          AND COALESCE(pt.verified_at, pt.created_at) >= ?
          AND COALESCE(pt.verified_at, pt.created_at) < ?
        GROUP BY DATE_FORMAT(
          DATE_ADD(COALESCE(pt.verified_at, pt.created_at), INTERVAL 8 HOUR),
          '%Y-%m'
        )
        ORDER BY bucket ASC
        `,
        salesUtcParams,
      );
    } else {
      [rawChartRows] = await pool.query(
        `
        SELECT
          DATE_FORMAT(
            DATE_ADD(COALESCE(pt.verified_at, pt.created_at), INTERVAL 8 HOUR),
            '%Y-%m-%d'
          ) AS bucket,
          COALESCE(
            SUM(CASE WHEN o.type = 'online' THEN pt.amount ELSE 0 END),
            0
          ) AS online_sales,
          COALESCE(
            SUM(CASE WHEN o.type = 'walkin' THEN pt.amount ELSE 0 END),
            0
          ) AS walkin_sales
        FROM payment_transactions pt
        INNER JOIN orders o ON o.id = pt.order_id
        WHERE LOWER(pt.status) = 'verified'
          AND COALESCE(pt.verified_at, pt.created_at) >= ?
          AND COALESCE(pt.verified_at, pt.created_at) < ?
        GROUP BY DATE_FORMAT(
          DATE_ADD(COALESCE(pt.verified_at, pt.created_at), INTERVAL 8 HOUR),
          '%Y-%m-%d'
        )
        ORDER BY bucket ASC
        `,
        salesUtcParams,
      );
    }

    const salesChart =
      chartMode === "monthly"
        ? buildMonthlySeries(rawChartRows, from, to)
        : buildDailySeries(rawChartRows, from, to);

    // Rank actual standard catalog products when the order first becomes a
    // verified sale. This excludes unpaid/open noise and custom/blueprint
    // order-item names that are not backed by a catalog product_id.
    const [topProducts] = await pool.query(
      `
      SELECT
        oi.product_id,
        COALESCE(
          MAX(p.name),
          MAX(oi.product_name),
          CONCAT('Product #', oi.product_id)
        ) AS product_name,
        COALESCE(SUM(oi.quantity), 0) AS units_sold,
        COALESCE(
          SUM(
            CASE
              WHEN oi.subtotal IS NULL
                THEN COALESCE(oi.unit_price, 0) * COALESCE(oi.quantity, 0)
              ELSE oi.subtotal
            END
          ),
          0
        ) AS revenue
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      INNER JOIN (
        SELECT
          pt.order_id,
          MIN(COALESCE(pt.verified_at, pt.created_at)) AS first_verified_at
        FROM payment_transactions pt
        WHERE LOWER(pt.status) = 'verified'
        GROUP BY pt.order_id
      ) verified_sale ON verified_sale.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.status <> 'cancelled'
        AND LOWER(COALESCE(o.order_type, 'standard')) = 'standard'
        AND oi.product_id IS NOT NULL
        AND verified_sale.first_verified_at >= ?
        AND verified_sale.first_verified_at < ?
      GROUP BY oi.product_id
      ORDER BY units_sold DESC, revenue DESC, oi.product_id ASC
      LIMIT 10
      `,
      salesUtcParams,
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
