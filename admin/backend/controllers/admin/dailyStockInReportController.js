// controllers/admin/dailyStockInReportController.js
// WISDOM Stock In Report Period Filter V1.1.0
// Read-only report of Stock In movements using Philippine calendar ranges.

const pool = require("../../config/db");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE_SIZE = 500;

const pad = (value, size = 2) => String(value).padStart(size, "0");

const formatSqlUtc = (date) =>
  [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
    " ",
    pad(date.getUTCHours()),
    ":",
    pad(date.getUTCMinutes()),
    ":",
    pad(date.getUTCSeconds()),
  ].join("");

const parseDateOnly = (value) => {
  const text = String(value || "").trim();
  if (!DATE_PATTERN.test(text)) return null;

  const [year, month, day] = text.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { text, year, month, day };
};

const manilaDayStartUtc = (parsed) =>
  new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, -8, 0, 0),
  );

const getReportRange = async ({ date, from, to }) => {
  const [[clock]] = await pool.query(
    `SELECT
       DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s') AS now_utc,
       DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), '%Y-%m-%d') AS today_manila`,
  );

  const todayManila = String(clock?.today_manila || "").trim();
  const generatedAt = `${String(clock?.now_utc || "").trim()}Z`;

  // Backward compatibility with the original single-date endpoint.
  const legacyDate = String(date || "").trim();
  let fromText = String(from || "").trim();
  let toText = String(to || "").trim();

  if (legacyDate && !fromText && !toText) {
    fromText = legacyDate;
    toText = legacyDate;
  }

  // No date bounds = All Stock In history.
  if (!fromText && !toText) {
    return {
      generatedAt,
      todayManila,
      fromDate: null,
      toDate: null,
      startSql: null,
      endSql: null,
    };
  }

  if (!fromText || !toText) {
    const error = new Error(
      "Both From Date and To Date are required for a date range.",
    );
    error.status = 400;
    throw error;
  }

  const parsedFrom = parseDateOnly(fromText);
  const parsedTo = parseDateOnly(toText);

  if (!parsedFrom || !parsedTo) {
    const error = new Error(
      "From Date and To Date must use valid YYYY-MM-DD dates.",
    );
    error.status = 400;
    throw error;
  }

  if (parsedFrom.text > parsedTo.text) {
    const error = new Error("From Date cannot be later than To Date.");
    error.status = 400;
    throw error;
  }

  if (parsedFrom.text > todayManila || parsedTo.text > todayManila) {
    const error = new Error("Report dates cannot be in the future.");
    error.status = 400;
    throw error;
  }

  // Manila is UTC+08:00 with no daylight-saving time.
  // Range is inclusive by Philippine calendar date:
  // [From 00:00 Manila, day after To 00:00 Manila).
  const startUtc = manilaDayStartUtc(parsedFrom);
  const toStartUtc = manilaDayStartUtc(parsedTo);
  const endUtc = new Date(toStartUtc.getTime() + 24 * 60 * 60 * 1000);

  return {
    generatedAt,
    todayManila,
    fromDate: parsedFrom.text,
    toDate: parsedTo.text,
    startSql: formatSqlUtc(startUtc),
    endSql: formatSqlUtc(endUtc),
  };
};

exports.getDailyStockInReport = async (req, res) => {
  try {
    const range = await getReportRange({
      date: req.query.date,
      from: req.query.from,
      to: req.query.to,
    });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(req.query.limit, 10) || 200),
    );
    const offset = (page - 1) * limit;

    const whereParts = ["sm.type = 'in'"];
    const params = [];

    if (range.startSql && range.endSql) {
      whereParts.push("sm.created_at >= ?");
      whereParts.push("sm.created_at < ?");
      params.push(range.startSql, range.endSql);
    }

    const whereSql = whereParts.join("\n      AND ");

    const [rows] = await pool.query(
      `SELECT
         sm.id,
         sm.material_id,
         sm.product_id,
         sm.quantity,
         sm.supplier_id,
         sm.order_id,
         sm.reference,
         sm.notes,
         sm.created_by,
         sm.created_at,
         CASE
           WHEN sm.material_id IS NOT NULL THEN 'raw_material'
           WHEN sm.product_id IS NOT NULL THEN 'ready_made'
           ELSE 'unknown'
         END AS inventory_type,
         COALESCE(rm.name, p.name, 'Unknown item') AS item_name,
         CASE
           WHEN sm.material_id IS NOT NULL THEN COALESCE(rm.unit, 'unit')
           ELSE 'unit'
         END AS unit,
         p.barcode AS product_barcode,
         supplier.name AS supplier_name,
         actor.name AS created_by_name,
         o.order_number
       FROM stock_movements sm
       LEFT JOIN raw_materials rm ON rm.id = sm.material_id
       LEFT JOIN products p ON p.id = sm.product_id
       LEFT JOIN suppliers supplier ON supplier.id = sm.supplier_id
       LEFT JOIN users actor ON actor.id = sm.created_by
       LEFT JOIN orders o ON o.id = sm.order_id
       WHERE ${whereSql}
       ORDER BY sm.created_at DESC, sm.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const [[summary]] = await pool.query(
      `SELECT
         COUNT(*) AS stock_in_entries,
         SUM(CASE WHEN material_id IS NOT NULL THEN 1 ELSE 0 END) AS raw_material_entries,
         SUM(CASE WHEN product_id IS NOT NULL THEN 1 ELSE 0 END) AS ready_made_entries,
         COALESCE(
           SUM(CASE WHEN product_id IS NOT NULL THEN quantity ELSE 0 END),
           0
         ) AS ready_made_units_added,
         COUNT(
           DISTINCT CASE
             WHEN material_id IS NOT NULL THEN CONCAT('raw:', material_id)
             WHEN product_id IS NOT NULL THEN CONCAT('ready:', product_id)
             ELSE CONCAT('movement:', id)
           END
         ) AS distinct_items
       FROM stock_movements sm
       WHERE ${whereSql}`,
      params,
    );

    const total = Number(summary?.stock_in_entries || 0);

    return res.json({
      from_date: range.fromDate,
      to_date: range.toDate,
      generated_at: range.generatedAt,
      timezone: "Asia/Manila",
      included_movement_type: "in",
      excluded_movement_types: ["return", "adjustment", "out"],
      rows,
      total,
      page,
      limit,
      summary: {
        stock_in_entries: total,
        raw_material_entries: Number(summary?.raw_material_entries || 0),
        ready_made_entries: Number(summary?.ready_made_entries || 0),
        ready_made_units_added: Number(
          summary?.ready_made_units_added || 0,
        ),
        distinct_items: Number(summary?.distinct_items || 0),
      },
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      message: error?.message || "Failed to generate Stock In Report.",
    });
  }
};
