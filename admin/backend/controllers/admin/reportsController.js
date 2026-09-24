const db = require("../../config/db");
const {
  getPhilippineBusinessPeriods,
  getPhilippineDateBoundsUtc,
} = require("../../utils/philippineTime");

const SALES_REPORT_DEFAULT_LIMIT = 20;
const SALES_REPORT_MAX_LIMIT = 500;
const SALES_REPORT_SEARCH_MAX_LENGTH = 100;
const SALES_REPORT_ORDER_TYPES = new Set(["all", "standard", "blueprint"]);
const SALES_REPORT_DATE_FILTERS = new Set([
  "all",
  "today",
  "this_week",
  "this_month",
  "custom",
]);

const readPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const buildSalesReportFilters = (query = {}) => {
  const where = ["o.status IN ('completed', 'delivered')"];
  const params = [];

  const search = String(query.search || "").trim();
  if (search.length > SALES_REPORT_SEARCH_MAX_LENGTH) {
    const error = new Error(
      `Search must be ${SALES_REPORT_SEARCH_MAX_LENGTH} characters or less.`,
    );
    error.status = 400;
    throw error;
  }

  if (search) {
    where.push(`(
      INSTR(LOWER(COALESCE(o.order_number, '')), LOWER(?)) > 0
      OR INSTR(
        LOWER(COALESCE(u.name, o.walkin_customer_name, 'Walk-in Customer')),
        LOWER(?)
      ) > 0
    )`);
    params.push(search, search);
  }

  const orderType = String(query.order_type || "all")
    .trim()
    .toLowerCase();

  if (!SALES_REPORT_ORDER_TYPES.has(orderType)) {
    const error = new Error("Invalid order type filter.");
    error.status = 400;
    throw error;
  }

  if (orderType !== "all") {
    where.push("o.order_type = ?");
    params.push(orderType);
  }

  const dateFilter = String(query.date_filter || "all")
    .trim()
    .toLowerCase();

  if (!SALES_REPORT_DATE_FILTERS.has(dateFilter)) {
    const error = new Error("Invalid date filter.");
    error.status = 400;
    throw error;
  }

  let startUtc = null;
  let endUtc = null;

  if (dateFilter === "today") {
    const periods = getPhilippineBusinessPeriods();
    startUtc = periods.todayStart;
    endUtc = periods.tomorrowStart;
  } else if (dateFilter === "this_week") {
    const periods = getPhilippineBusinessPeriods();
    startUtc = periods.weekStart;
    endUtc = periods.nextWeekStart;
  } else if (dateFilter === "this_month") {
    const periods = getPhilippineBusinessPeriods();
    startUtc = periods.monthStart;
    endUtc = periods.nextMonthStart;
  } else if (dateFilter === "custom") {
    const from = String(query.from || "").trim();
    const to = String(query.to || "").trim();

    // Preserve the old UI behavior while the user is still filling the range:
    // custom filtering begins only after both endpoints are present.
    if (from && to) {
      if (from > to) {
        const error = new Error("Start date cannot be after end date.");
        error.status = 400;
        throw error;
      }

      try {
        startUtc = getPhilippineDateBoundsUtc(from).startUtc;
        endUtc = getPhilippineDateBoundsUtc(to).nextStartUtc;
      } catch {
        const error = new Error("Custom dates must use valid YYYY-MM-DD values.");
        error.status = 400;
        throw error;
      }
    }
  }

  if (startUtc && endUtc) {
    where.push("o.created_at >= ? AND o.created_at < ?");
    params.push(startUtc, endUtc);
  }

  return { where, params };
};

const SALES_REPORT_COGS_SQL = `
  CASE
    WHEN o.order_type = 'blueprint' THEN
      CASE
        WHEN e.status = 'approved'
          THEN COALESCE(e.material_cost, 0) + COALESCE(e.labor_cost, 0)
        ELSE 0
      END
    ELSE COALESCE((
      SELECT SUM(oi.quantity * p.production_cost)
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ), 0)
  END
`;

const SALES_REPORT_CANONICAL_ESTIMATION_JOIN_SQL = `
  LEFT JOIN blueprints b
    ON b.id = o.blueprint_id
  LEFT JOIN estimations e
    ON o.order_type = 'blueprint'
   AND e.id = (
      SELECT e2.id
      FROM estimations e2
      WHERE e2.blueprint_id = o.blueprint_id
        AND e2.created_at >= b.created_at
        AND e2.created_at >= o.created_at
      ORDER BY e2.version DESC, e2.id DESC
      LIMIT 1
   )
`;

exports.getSalesProfitabilityReport = async (req, res) => {
  try {
    const page = readPositiveInt(req.query.page, 1);
    const requestedLimit = readPositiveInt(
      req.query.limit,
      SALES_REPORT_DEFAULT_LIMIT,
    );
    const limit = Math.min(requestedLimit, SALES_REPORT_MAX_LIMIT);
    const offset = (page - 1) * limit;
    const includeSummary = String(req.query.include_summary || "1") !== "0";

    const { where, params } = buildSalesReportFilters(req.query);
    const whereSql = where.join(" AND ");

    const recordsSql = `
      SELECT
        o.id AS order_id,
        o.order_number,
        o.created_at AS date_sold,
        o.order_type,
        o.customer_id,
        COALESCE(u.name, o.walkin_customer_name, 'Walk-in Customer') AS customer_name,
        o.total AS revenue,
        ${SALES_REPORT_COGS_SQL} AS cogs
      FROM orders o
      LEFT JOIN users u ON u.id = o.customer_id
      ${SALES_REPORT_CANONICAL_ESTIMATION_JOIN_SQL}
      WHERE ${whereSql}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.query(recordsSql, [...params, limit, offset]);

    const formattedRows = rows.map((row) => {
      const revenue = Number(row.revenue || 0);
      const cogs = Number(row.cogs || 0);
      const grossProfit = revenue - cogs;
      const marginPercentage =
        revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      return {
        ...row,
        revenue,
        cogs,
        gross_profit: grossProfit,
        margin_percentage: marginPercentage.toFixed(2),
      };
    });

    let total;
    let summary;

    if (includeSummary) {
      const summarySql = `
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(report_rows.revenue), 0) AS total_revenue,
          COALESCE(SUM(report_rows.cogs), 0) AS total_cogs
        FROM (
          SELECT
            COALESCE(o.total, 0) AS revenue,
            ${SALES_REPORT_COGS_SQL} AS cogs
          FROM orders o
          LEFT JOIN users u ON u.id = o.customer_id
          ${SALES_REPORT_CANONICAL_ESTIMATION_JOIN_SQL}
          WHERE ${whereSql}
        ) report_rows
      `;

      const [[summaryRow]] = await db.query(summarySql, params);

      total = Number(summaryRow?.total || 0);
      const totalRevenue = Number(summaryRow?.total_revenue || 0);
      const totalCogs = Number(summaryRow?.total_cogs || 0);
      const totalGrossProfit = totalRevenue - totalCogs;
      const overallMargin =
        totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

      summary = {
        total_revenue: totalRevenue,
        total_cogs: totalCogs,
        total_gross_profit: totalGrossProfit,
        overall_margin_percentage: overallMargin.toFixed(2),
      };
    }

    res.json({
      records: formattedRows,
      ...(includeSummary
        ? {
            total,
            page,
            limit,
            summary,
          }
        : {}),
    });
  } catch (err) {
    if (Number(err?.status) === 400) {
      return res.status(400).json({ message: err.message });
    }

    console.error("[Reports] Failed to fetch sales profitability:", err);
    return res.status(500).json({ message: "Failed to generate report." });
  }
};
