// controllers/admin/inventoryReportController.js
// WISDOM Inventory Report Date Filter V1.2.0
// Read-only point-in-time inventory reconstruction for Admin reports.
//
// Important scope:
// - Never mutates stock.
// - Uses current catalog metadata plus recorded stock movement / transfer history.
// - Historical adjustments are reversed only when a trustworthy previous quantity
//   is available from Physical Inventory snapshots or the stock-movement audit log.
// - If a legacy adjustment cannot be reversed safely, the affected row is returned
//   with null historical quantities and an explicit warning instead of guessing.

const pool = require("../../config/db");

const EPSILON = 0.0000001;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const POSITIVE_MOVEMENT_TYPES = new Set(["in", "return"]);

const normalizeQuantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
};

const formatSqlDateTimeUtc = (date) => {
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return [
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
};

const parseDateOnly = (value) => {
  const text = String(value || "").trim();
  if (!DATE_PATTERN.test(text)) return null;

  const [year, month, day] = text.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return text;
};

const historicalEndOfManilaDayUtc = (dateText) => {
  const [year, month, day] = dateText.split("-").map(Number);
  // Next Manila midnight is 16:00 UTC on the selected UTC calendar date.
  return new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
};

const safeJsonObject = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const computeReadyHealth = (quantity, reorderPoint = 0) => {
  if (quantity === null) return "history_unavailable";
  const qty = Number(quantity) || 0;
  const reorder = Number(reorderPoint) || 0;

  if (qty <= 0) return "out_of_stock";
  if (qty <= reorder) return "low_stock";
  return "healthy_stock";
};

const computeRawHealth = ({
  onHand,
  reserved,
  pendingNeed,
  safetyStock,
  reorderPoint,
  leadTimeDays,
  avgDailyUsage,
}) => {
  if (onHand === null) return "history_unavailable";

  const onHandQty = Number(onHand) || 0;
  const reservedQty = Number(reserved) || 0;
  const pendingQty = Number(pendingNeed) || 0;
  const safety = Number(safetyStock) || 0;
  const reorder = Number(reorderPoint) || 0;
  const leadDays = Math.max(Number(leadTimeDays) || 0, 0);
  const dailyUsage = Math.max(Number(avgDailyUsage) || 0, 0);
  const available = Math.max(onHandQty - reservedQty, 0);
  const leadTimeNeed = dailyUsage * leadDays;

  if (onHandQty <= 0) return "out_of_stock";
  if (pendingQty > 0) return "critical_stock";
  if (available <= 0) return "critical_stock";
  if (available <= safety) return "critical_stock";
  if (leadDays > 0 && dailyUsage > 0 && available <= safety + leadTimeNeed) {
    return "critical_stock";
  }
  if (available <= reorder) return "low_stock";
  return "healthy_stock";
};

const placeholders = (values) => values.map(() => "?").join(",");

async function getReportClock(requestedDate) {
  const [[clock]] = await pool.query(
    `SELECT
       DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s') AS now_utc,
       DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), '%Y-%m-%d') AS today_manila`,
  );

  const todayManila = String(clock?.today_manila || "").trim();
  const selectedDate = parseDateOnly(requestedDate || todayManila);

  if (!selectedDate) {
    const error = new Error("Report date must use a valid YYYY-MM-DD date.");
    error.status = 400;
    throw error;
  }

  if (selectedDate > todayManila) {
    const error = new Error("Report date cannot be in the future.");
    error.status = 400;
    throw error;
  }

  const generatedAtUtc = String(clock?.now_utc || "").trim();
  const cutoff =
    selectedDate === todayManila
      ? new Date(`${generatedAtUtc.replace(" ", "T")}Z`)
      : historicalEndOfManilaDayUtc(selectedDate);

  return {
    selectedDate,
    todayManila,
    generatedAtUtc,
    cutoff,
    cutoffSql: formatSqlDateTimeUtc(cutoff),
    isCurrentDate: selectedDate === todayManila,
  };
}

async function loadAdjustmentPreviousQuantities(adjustmentIds) {
  const ids = [...new Set(adjustmentIds.map(Number).filter((id) => id > 0))];
  const previousByMovement = new Map();

  if (ids.length === 0) return previousByMovement;

  const inClause = placeholders(ids);

  const [physicalRows] = await pool.query(
    `SELECT stock_movement_id, system_quantity
     FROM physical_inventory_items
     WHERE stock_movement_id IN (${inClause})`,
    ids,
  );

  for (const row of physicalRows) {
    const movementId = Number(row.stock_movement_id);
    const previous = normalizeQuantity(row.system_quantity);
    if (movementId > 0 && previous !== null) {
      previousByMovement.set(movementId, previous);
    }
  }

  const unresolved = ids.filter((id) => !previousByMovement.has(id));
  if (unresolved.length === 0) return previousByMovement;

  const auditClause = placeholders(unresolved);
  const [auditRows] = await pool.query(
    `SELECT id, record_id, new_values
     FROM audit_logs
     WHERE table_name = 'stock_movements'
       AND action = 'create_stock_movement'
       AND record_id IN (${auditClause})
     ORDER BY id DESC`,
    unresolved,
  );

  for (const row of auditRows) {
    const movementId = Number(row.record_id);
    if (!movementId || previousByMovement.has(movementId)) continue;

    const values = safeJsonObject(row.new_values);
    const previous = normalizeQuantity(values?.previous_stock);

    if (previous !== null) {
      previousByMovement.set(movementId, previous);
    }
  }

  return previousByMovement;
}

async function reconstructOnHand({ rows, entityType, cutoffSql, warnings }) {
  const idField = entityType === "raw" ? "material_id" : "product_id";
  const ids = rows.map((row) => Number(row.id)).filter((id) => id > 0);
  const currentById = new Map(
    rows.map((row) => [
      Number(row.id),
      entityType === "raw"
        ? normalizeQuantity(row.quantity)
        : normalizeQuantity(row.stock),
    ]),
  );
  const completeById = new Map(ids.map((id) => [id, true]));

  if (ids.length === 0) {
    return { quantityById: currentById, completeById };
  }

  const inClause = placeholders(ids);
  const [movements] = await pool.query(
    `SELECT id, material_id, product_id, type, quantity, reference, created_at
     FROM stock_movements
     WHERE ${idField} IN (${inClause})
       AND created_at >= ?
     ORDER BY created_at DESC, id DESC`,
    [...ids, cutoffSql],
  );

  const adjustmentIds = movements
    .filter((row) => String(row.type || "").toLowerCase() === "adjustment")
    .map((row) => Number(row.id));
  const previousByAdjustment =
    await loadAdjustmentPreviousQuantities(adjustmentIds);

  for (const movement of movements) {
    const entityId = Number(movement[idField]);
    if (!currentById.has(entityId) || !completeById.get(entityId)) continue;

    const type = String(movement.type || "")
      .trim()
      .toLowerCase();
    const quantity = normalizeQuantity(movement.quantity);
    const current = currentById.get(entityId);

    if (current === null || quantity === null) {
      completeById.set(entityId, false);
      currentById.set(entityId, null);
      continue;
    }

    if (type === "adjustment") {
      if (!previousByAdjustment.has(Number(movement.id))) {
        completeById.set(entityId, false);
        currentById.set(entityId, null);
        warnings.push(
          `${entityType === "raw" ? "Raw material" : "Ready-made product"} #${entityId} has a legacy stock adjustment after the selected report date without a recoverable previous quantity. Its historical stock is shown as unavailable.`,
        );
        continue;
      }

      currentById.set(entityId, previousByAdjustment.get(Number(movement.id)));
      continue;
    }

    let previous = current;
    if (POSITIVE_MOVEMENT_TYPES.has(type)) {
      previous = current - quantity;
    } else if (type === "out") {
      previous = current + quantity;
    } else {
      completeById.set(entityId, false);
      currentById.set(entityId, null);
      warnings.push(
        `Stock movement #${movement.id} has an unsupported type "${movement.type}". Historical stock for ${entityType === "raw" ? "raw material" : "ready-made product"} #${entityId} is unavailable.`,
      );
      continue;
    }

    if (previous < -EPSILON) {
      completeById.set(entityId, false);
      currentById.set(entityId, null);
      warnings.push(
        `Historical stock reconstruction produced an invalid negative quantity for ${entityType === "raw" ? "raw material" : "ready-made product"} #${entityId}. The report did not guess a value.`,
      );
      continue;
    }

    currentById.set(entityId, Math.max(0, normalizeQuantity(previous)));
  }

  return { quantityById: currentById, completeById };
}

async function reconstructDisplayStock({ products, cutoffSql, warnings }) {
  const ids = products.map((row) => Number(row.id)).filter((id) => id > 0);

  const displayById = new Map(
    products.map((row) => [
      Number(row.id),
      normalizeQuantity(row.display_stock),
    ]),
  );

  const completeById = new Map(ids.map((id) => [id, true]));

  if (ids.length === 0) {
    return {
      displayById,
      completeById,
    };
  }

  const inClause = placeholders(ids);

  const [transferRows] = await pool.query(
    `SELECT
       sti.id,
       sti.product_id,
       sti.display_before,
       sti.display_after,
       st.created_at
     FROM stock_transfer_items sti
     INNER JOIN stock_transfers st ON st.id = sti.transfer_id
     WHERE sti.product_id IN (${inClause})
       AND st.created_at >= ?
     ORDER BY st.created_at DESC, st.id DESC, sti.id DESC`,
    [...ids, cutoffSql],
  );

  for (const row of transferRows) {
    const productId = Number(row.product_id);
    const before = normalizeQuantity(row.display_before);

    if (!displayById.has(productId)) {
      continue;
    }

    if (before === null) {
      completeById.set(productId, false);
      displayById.set(productId, null);

      warnings.push(
        `Display allocation history is incomplete for ready-made product #${productId}. Historical Display and Warehouse stock cannot be reconstructed safely.`,
      );

      continue;
    }

    displayById.set(productId, Math.max(0, before));
  }

  return {
    displayById,
    completeById,
  };
}

async function getHistoricalReservationSummary(materialIds, cutoffSql) {
  const ids = materialIds.map(Number).filter((id) => id > 0);
  const summaryByMaterial = new Map(
    ids.map((id) => [id, { reserved_quantity: 0, pending_need_quantity: 0 }]),
  );

  if (ids.length === 0) return summaryByMaterial;

  const inClause = placeholders(ids);
  const [rows] = await pool.query(
    `SELECT
       id,
       material_id,
       quantity,
       status,
       created_at,
       reserved_at,
       consumed_at,
       released_at
     FROM blueprint_material_reservations
     WHERE material_id IN (${inClause})
       AND created_at < ?
     ORDER BY created_at ASC, id ASC`,
    [...ids, cutoffSql],
  );

  const cutoffMs = new Date(`${cutoffSql.replace(" ", "T")}Z`).getTime();
  const beforeCutoff = (value) => {
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp < cutoffMs;
  };

  for (const row of rows) {
    const materialId = Number(row.material_id);
    const quantity = normalizeQuantity(row.quantity) ?? 0;
    const summary = summaryByMaterial.get(materialId);
    if (!summary) continue;

    if (beforeCutoff(row.released_at) || beforeCutoff(row.consumed_at)) {
      continue;
    }

    if (beforeCutoff(row.reserved_at)) {
      summary.reserved_quantity = normalizeQuantity(
        summary.reserved_quantity + quantity,
      );
    } else {
      summary.pending_need_quantity = normalizeQuantity(
        summary.pending_need_quantity + quantity,
      );
    }
  }

  return summaryByMaterial;
}

async function getRawUsage30Days(materialIds, cutoffSql) {
  const ids = materialIds.map(Number).filter((id) => id > 0);
  const usageByMaterial = new Map(ids.map((id) => [id, 0]));

  if (ids.length === 0) return usageByMaterial;

  const inClause = placeholders(ids);

  const [rows] = await pool.query(
    `SELECT
       material_id,
       COALESCE(SUM(quantity), 0) AS used_quantity
     FROM stock_movements
     WHERE material_id IN (${inClause})
       AND product_id IS NULL
       AND type = 'out'
       AND reference LIKE 'BLUEPRINT-RESERVATION-%'
       AND created_at >= DATE_SUB(?, INTERVAL 30 DAY)
       AND created_at < ?
     GROUP BY material_id`,
    [...ids, cutoffSql, cutoffSql],
  );

  for (const row of rows) {
    usageByMaterial.set(
      Number(row.material_id),
      normalizeQuantity(row.used_quantity) ?? 0,
    );
  }

  return usageByMaterial;
}

const analyticsDateText = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const analyticsShiftDays = (dateText, amount) => {
  const [year, month, day] = dateText.split("-").map(Number);

  return analyticsDateText(new Date(Date.UTC(year, month - 1, day + amount)));
};

const analyticsShiftMonthStart = (dateText, monthOffset) => {
  const [year, month] = dateText.split("-").map(Number);

  return analyticsDateText(
    new Date(Date.UTC(year, month - 1 + monthOffset, 1)),
  );
};

const analyticsLastDayOfMonth = (monthStartText) => {
  const [year, month] = monthStartText.split("-").map(Number);

  return analyticsDateText(new Date(Date.UTC(year, month, 0)));
};

const analyticsReadCost = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const cost = Number(value);

  // A positive cost is required to value stock or an outgoing quantity.
  // Do not silently interpret a missing or zero cost as a reliable zero value.
  return Number.isFinite(cost) && cost > 0 ? cost : null;
};

async function loadAnalyticsSnapshot({
  rows,
  entityType,
  cutoffSql,
  snapshotCache,
  warnings,
}) {
  const cacheKey = `${entityType}:${cutoffSql}:${rows
    .map((row) => Number(row.id))
    .sort((a, b) => a - b)
    .join(",")}`;

  if (snapshotCache.has(cacheKey)) {
    return snapshotCache.get(cacheKey);
  }

  // Exclude catalog items that did not exist by this historical cutoff.
  const snapshotRows = rows.filter(
    (row) => String(row.created_at_utc || "") < cutoffSql,
  );

  const reconstructed = await reconstructOnHand({
    rows: snapshotRows,
    entityType,
    cutoffSql,
    warnings,
  });

  const snapshot = {
    ...reconstructed,
    rows: snapshotRows,
  };

  snapshotCache.set(cacheKey, snapshot);

  return snapshot;
}

function calculateAnalyticsValuation(snapshot, entityType) {
  let total = 0;
  let complete = true;
  let missingCostCount = 0;
  let unavailableQuantityCount = 0;

  for (const row of snapshot.rows) {
    const id = Number(row.id);
    const quantity = snapshot.quantityById.get(id);
    const historyComplete = snapshot.completeById.get(id) !== false;

    if (
      !historyComplete ||
      quantity === null ||
      quantity === undefined ||
      !Number.isFinite(Number(quantity))
    ) {
      complete = false;
      unavailableQuantityCount += 1;
      continue;
    }

    const quantityValue = Number(quantity);
    const unitCost = analyticsReadCost(
      entityType === "raw" ? row.unit_cost : row.production_cost,
    );

    if (quantityValue > 0 && unitCost === null) {
      complete = false;
      missingCostCount += 1;
      continue;
    }

    total += Math.max(0, quantityValue) * (unitCost ?? 0);
  }

  return {
    value: complete ? Math.round(total * 100) / 100 : null,
    complete,
    missingCostCount,
    unavailableQuantityCount,
  };
}

async function queryAnalyticsRawOutflow(
  rows,
  startCutoff,
  endCutoff,
  groupByMonth = false,
) {
  const ids = rows.map((row) => Number(row.id)).filter((id) => id > 0);

  if (ids.length === 0) return [];

  const bucketExpression =
    groupByMonth === "day"
      ? "DATE_FORMAT(DATE_ADD(sm.created_at, INTERVAL 8 HOUR), '%Y-%m-%d')"
      : groupByMonth
        ? "DATE_FORMAT(DATE_ADD(sm.created_at, INTERVAL 8 HOUR), '%Y-%m')"
        : "'__period__'";

  const [results] = await pool.query(
    `SELECT
       ${bucketExpression} AS month,
       sm.material_id,
       COALESCE(SUM(sm.quantity), 0) AS used_quantity
     FROM stock_movements sm
     WHERE sm.material_id IN (${placeholders(ids)})
       AND sm.product_id IS NULL
       AND sm.type = 'out'
       AND sm.created_at >= ?
       AND sm.created_at < ?
     GROUP BY month, sm.material_id`,
    [...ids, startCutoff, endCutoff],
  );

  return results;
}

async function queryAnalyticsReadyMadeCogs(
  rows,
  startCutoff,
  endCutoff,
  groupByMonth = false,
) {
  const ids = rows.map((row) => Number(row.id)).filter((id) => id > 0);

  if (ids.length === 0) return [];

  const bucketExpression =
    groupByMonth === "day"
      ? "DATE_FORMAT(DATE_ADD(o.created_at, INTERVAL 8 HOUR), '%Y-%m-%d')"
      : groupByMonth
        ? "DATE_FORMAT(DATE_ADD(o.created_at, INTERVAL 8 HOUR), '%Y-%m')"
        : "'__period__'";

  const unitCostExpression =
    "COALESCE(NULLIF(oi.production_cost, 0), NULLIF(p.production_cost, 0))";

  const [results] = await pool.query(
    `SELECT
       ${bucketExpression} AS month,
       oi.product_id,
       COALESCE(
         SUM(oi.quantity * COALESCE(${unitCostExpression}, 0)),
         0
       ) AS cogs,
       COALESCE(
         SUM(
           CASE
             WHEN oi.quantity > 0
               AND ${unitCostExpression} IS NULL
             THEN oi.quantity
             ELSE 0
           END
         ),
         0
       ) AS uncosted_units
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.product_id IN (${placeholders(ids)})
       AND o.status = 'completed'
       AND LOWER(COALESCE(o.order_type, 'standard')) = 'standard'
       AND o.created_at >= ?
       AND o.created_at < ?
     GROUP BY month, oi.product_id`,
    [...ids, startCutoff, endCutoff],
  );

  return results;
}

function aggregateAnalyticsRawOutflow(rows, materialRows) {
  const costById = new Map(
    materialRows.map((row) => [
      Number(row.id),
      analyticsReadCost(row.unit_cost),
    ]),
  );

  const totals = new Map();

  for (const row of rows) {
    const bucket = row.month || "__period__";
    const current = totals.get(bucket) || {
      value: 0,
      complete: true,
    };

    const quantity = Math.max(0, Number(row.used_quantity || 0));
    const unitCost = costById.get(Number(row.material_id));

    if (quantity > 0 && unitCost === null) {
      current.complete = false;
    } else {
      current.value += quantity * (unitCost ?? 0);
    }

    totals.set(bucket, current);
  }

  return totals;
}

function aggregateAnalyticsReadyMadeCogs(rows) {
  const totals = new Map();

  for (const row of rows) {
    const bucket = row.month || "__period__";
    const current = totals.get(bucket) || {
      value: 0,
      complete: true,
    };

    current.value += Number(row.cogs || 0);

    if (Number(row.uncosted_units || 0) > 0) {
      current.complete = false;
    }

    totals.set(bucket, current);
  }

  return totals;
}

function calculateAnalyticsTurnover(outflow, openingValue, closingValue) {
  if (
    !outflow ||
    outflow.complete !== true ||
    openingValue?.complete !== true ||
    closingValue?.complete !== true ||
    openingValue.value === null ||
    closingValue.value === null
  ) {
    return null;
  }

  const averageInventory = (openingValue.value + closingValue.value) / 2;

  if (!Number.isFinite(averageInventory) || averageInventory <= 0) {
    return null;
  }

  return Math.round((outflow.value / averageInventory) * 100) / 100;
}

function buildTurnoverInputs(outflow, openingValue, closingValue) {
  const openingComplete =
    openingValue?.complete === true &&
    openingValue.value !== null &&
    Number.isFinite(Number(openingValue.value));

  const closingComplete =
    closingValue?.complete === true &&
    closingValue.value !== null &&
    Number.isFinite(Number(closingValue.value));

  const averageInventoryValue =
    openingComplete && closingComplete
      ? Math.round(
          ((Number(openingValue.value) + Number(closingValue.value)) / 2) * 100,
        ) / 100
      : null;

  return {
    opening_inventory_value: openingComplete
      ? Number(openingValue.value)
      : null,

    opening_inventory_complete: openingComplete,

    closing_inventory_value: closingComplete
      ? Number(closingValue.value)
      : null,

    closing_inventory_complete: closingComplete,

    average_inventory_value: averageInventoryValue,

    outflow_value:
      outflow?.complete === true
        ? Math.round(Number(outflow.value || 0) * 100) / 100
        : null,

    outflow_complete: outflow?.complete === true,
  };
}

exports.getInventoryAnalytics = async (req, res) => {
  try {
    const requestedFrom = String(req.query.from || "").trim();
    const requestedTo = String(req.query.to || "").trim();

    if (Boolean(requestedFrom) !== Boolean(requestedTo)) {
      const error = new Error("Both start and end dates are required.");
      error.status = 400;
      throw error;
    }

    const clock = await getReportClock(requestedTo || req.query.date);

    const showTrend = ["1", "true"].includes(
      String(req.query.trend || "")
        .trim()
        .toLowerCase(),
    );

    const inventoryType = String(
      req.query.inventory_type || req.query.inventoryType || "",
    )
      .trim()
      .toLowerCase();

    const stockStatus = String(
      req.query.stock_status || req.query.stockStatus || "",
    )
      .trim()
      .toLowerCase();

    const search = String(req.query.search || "")
      .trim()
      .toLowerCase();

    if (!["", "raw", "ready_made"].includes(inventoryType)) {
      const error = new Error("Invalid inventory type filter.");
      error.status = 400;
      throw error;
    }

    if (search.length > 120) {
      const error = new Error("Search must be 120 characters or less.");
      error.status = 400;
      throw error;
    }

    const allowedStatuses = new Set([
      "",
      "healthy_stock",
      "low_stock",
      "critical_stock",
      "out_of_stock",
      "history_unavailable",
    ]);

    if (!allowedStatuses.has(stockStatus)) {
      const error = new Error("Invalid stock health filter.");
      error.status = 400;
      throw error;
    }

    const rangeStartDate = requestedFrom ? parseDateOnly(requestedFrom) : null;

    if (requestedFrom && !rangeStartDate) {
      const error = new Error("Start date must use a valid YYYY-MM-DD date.");
      error.status = 400;
      throw error;
    }

    if (rangeStartDate && rangeStartDate > clock.selectedDate) {
      const error = new Error("Start date cannot be after end date.");
      error.status = 400;
      throw error;
    }

    const warnings = [];
    const snapshotCache = new Map();

    // Load the historical catalog records and their current cost fields.
    const [allRawRows] = await pool.query(
      `SELECT
         rm.id,
         rm.name,
         rm.unit,
         rm.material_form,
         rm.length_mm,
         rm.width_mm,
         rm.thickness_mm,
         rm.quantity,
         rm.unit_cost,
         rm.reorder_point,
         rm.safety_stock,
         rm.lead_time_days,
         s.name AS supplier_name,
         c.name AS category_name,
         DATE_FORMAT(
           rm.created_at,
           '%Y-%m-%d %H:%i:%s'
         ) AS created_at_utc
       FROM raw_materials rm
       LEFT JOIN suppliers s
         ON s.id = rm.supplier_id
       LEFT JOIN categories c
         ON c.id = rm.category_id
       WHERE rm.created_at < ?
       ORDER BY rm.created_at ASC, rm.id ASC`,
      [clock.cutoffSql],
    );

    const [allProductRows] = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.barcode,
         p.stock,
         p.reorder_point,
         p.production_cost,
         DATE_FORMAT(
           p.created_at,
           '%Y-%m-%d %H:%i:%s'
         ) AS created_at_utc
       FROM products p
       WHERE LOWER(COALESCE(p.type, 'standard')) = 'standard'
         AND p.created_at < ?
       ORDER BY p.created_at ASC, p.id ASC`,
      [clock.cutoffSql],
    );

    const matchesSearch = (...values) => {
      if (!search) return true;

      const searchable = values
        .map((value) =>
          String(value ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
        .join(" ");

      return search
        .split(/\s+/)
        .filter(Boolean)
        .every((term) => searchable.includes(term));
    };

    // Resolve stock health using reconstructed stock and the same
    // health rules as the Inventory Report.
    const [allClosingRawSnapshot, allClosingReadySnapshot] = await Promise.all([
      loadAnalyticsSnapshot({
        rows: allRawRows,
        entityType: "raw",
        cutoffSql: clock.cutoffSql,
        snapshotCache,
        warnings: [],
      }),
      loadAnalyticsSnapshot({
        rows: allProductRows,
        entityType: "ready",
        cutoffSql: clock.cutoffSql,
        snapshotCache,
        warnings: [],
      }),
    ]);

    let reservationByMaterial = new Map();
    let usageByMaterial = new Map();

    if (stockStatus) {
      const rawIds = allRawRows.map((row) => Number(row.id));

      [reservationByMaterial, usageByMaterial] = await Promise.all([
        getHistoricalReservationSummary(rawIds, clock.cutoffSql),
        getRawUsage30Days(rawIds, clock.cutoffSql),
      ]);
    }

    const rawRows =
      inventoryType === "ready_made"
        ? []
        : allRawRows.filter((row) => {
            if (
              !matchesSearch(
                row.name,
                row.category_name,
                row.supplier_name,
                row.unit,
                row.material_form,
              )
            ) {
              return false;
            }

            if (!stockStatus) return true;

            const id = Number(row.id);

            const reservation = reservationByMaterial.get(id) || {
              reserved_quantity: 0,
              pending_need_quantity: 0,
            };

            const usedLast30Days = Number(usageByMaterial.get(id) || 0);

            const status = computeRawHealth({
              onHand: allClosingRawSnapshot.quantityById.get(id),
              reserved: reservation.reserved_quantity,
              pendingNeed: reservation.pending_need_quantity,
              safetyStock: row.safety_stock,
              reorderPoint: row.reorder_point,
              leadTimeDays: row.lead_time_days,
              avgDailyUsage: usedLast30Days / 30,
            });

            return status === stockStatus;
          });

    const productRows =
      inventoryType === "raw"
        ? []
        : allProductRows.filter((row) => {
            if (!matchesSearch(row.name, row.barcode)) {
              return false;
            }

            if (!stockStatus) return true;

            const status = computeReadyHealth(
              allClosingReadySnapshot.quantityById.get(Number(row.id)),
              row.reorder_point,
            );

            return status === stockStatus;
          });

    // The KPI period defaults to the 30 days ending on the report date.
    const periodStartDate =
      rangeStartDate || analyticsShiftDays(clock.selectedDate, -29);

    const openingCutoff = formatSqlDateTimeUtc(
      historicalEndOfManilaDayUtc(analyticsShiftDays(periodStartDate, -1)),
    );

    const [
      openingRawSnapshot,
      closingRawSnapshot,
      openingReadySnapshot,
      closingReadySnapshot,
    ] = await Promise.all([
      loadAnalyticsSnapshot({
        rows: rawRows,
        entityType: "raw",
        cutoffSql: openingCutoff,
        snapshotCache,
        warnings: [],
      }),
      loadAnalyticsSnapshot({
        rows: rawRows,
        entityType: "raw",
        cutoffSql: clock.cutoffSql,
        snapshotCache,
        warnings,
      }),
      loadAnalyticsSnapshot({
        rows: productRows,
        entityType: "ready",
        cutoffSql: openingCutoff,
        snapshotCache,
        warnings: [],
      }),
      loadAnalyticsSnapshot({
        rows: productRows,
        entityType: "ready",
        cutoffSql: clock.cutoffSql,
        snapshotCache,
        warnings,
      }),
    ]);

    const openingRawValue = calculateAnalyticsValuation(
      openingRawSnapshot,
      "raw",
    );

    const closingRawValue = calculateAnalyticsValuation(
      closingRawSnapshot,
      "raw",
    );

    const openingReadyValue = calculateAnalyticsValuation(
      openingReadySnapshot,
      "ready",
    );

    const closingReadyValue = calculateAnalyticsValuation(
      closingReadySnapshot,
      "ready",
    );

    // An empty opening snapshot is not sufficient evidence that the
    // business physically had zero inventory at the start of the period.
    // Withhold turnover when records exist at closing but none were
    // available for the opening snapshot.
    if (
      openingRawSnapshot.rows.length === 0 &&
      closingRawSnapshot.rows.length > 0
    ) {
      openingRawValue.value = null;
      openingRawValue.complete = false;
      openingRawValue.baselineUnavailable = true;

      warnings.push(
        "Raw-material opening inventory value is unavailable because no matching raw-material records existed at the start of the period. Turnover is withheld rather than assuming an unverified zero opening balance.",
      );
    }

    if (
      openingReadySnapshot.rows.length === 0 &&
      closingReadySnapshot.rows.length > 0
    ) {
      openingReadyValue.value = null;
      openingReadyValue.complete = false;
      openingReadyValue.baselineUnavailable = true;

      warnings.push(
        "Ready-made opening inventory value is unavailable because no matching ready-made product records existed at the start of the period. Turnover is withheld rather than assuming an unverified zero opening balance.",
      );
    }

    const [rawPeriodRows, readyPeriodRows] = await Promise.all([
      queryAnalyticsRawOutflow(rawRows, openingCutoff, clock.cutoffSql),
      queryAnalyticsReadyMadeCogs(productRows, openingCutoff, clock.cutoffSql),
    ]);

    const rawPeriodOutflow = aggregateAnalyticsRawOutflow(
      rawPeriodRows,
      rawRows,
    ).get("__period__") || {
      value: 0,
      complete: true,
    };

    const readyPeriodCogs = aggregateAnalyticsReadyMadeCogs(
      readyPeriodRows,
    ).get("__period__") || {
      value: 0,
      complete: true,
    };

    const rawSelected = inventoryType !== "ready_made";

    const readySelected = inventoryType !== "raw";

    const valuationTotal =
      (!rawSelected || closingRawValue.complete) &&
      (!readySelected || closingReadyValue.complete)
        ? Math.round(
            ((rawSelected ? closingRawValue.value : 0) +
              (readySelected ? closingReadyValue.value : 0)) *
              100,
          ) / 100
        : null;

    const trend = [];
    let trendInterval = "month";

    if (showTrend) {
      const trendStartDate =
        rangeStartDate || analyticsShiftMonthStart(clock.selectedDate, -11);

      const trendEndDate = clock.selectedDate;

      const rangeDays =
        Math.floor(
          (new Date(`${trendEndDate}T00:00:00Z`).getTime() -
            new Date(`${trendStartDate}T00:00:00Z`).getTime()) /
            86400000,
        ) + 1;

      trendInterval = rangeStartDate && rangeDays <= 45 ? "day" : "month";

      const trendTargets = [];

      if (trendInterval === "day") {
        for (
          let cursor = trendStartDate;
          cursor <= trendEndDate;
          cursor = analyticsShiftDays(cursor, 1)
        ) {
          trendTargets.push({
            key: cursor,
            startDate: cursor,
            cutoffSql:
              cursor === clock.selectedDate && clock.isCurrentDate
                ? clock.cutoffSql
                : formatSqlDateTimeUtc(historicalEndOfManilaDayUtc(cursor)),
          });
        }
      } else {
        for (
          let monthStart = analyticsShiftMonthStart(trendStartDate, 0);
          monthStart <= trendEndDate;
          monthStart = analyticsShiftMonthStart(monthStart, 1)
        ) {
          const month = monthStart.slice(0, 7);
          const lastDay = analyticsLastDayOfMonth(monthStart);

          const bucketStart =
            trendStartDate > monthStart ? trendStartDate : monthStart;

          const bucketEnd = trendEndDate < lastDay ? trendEndDate : lastDay;

          trendTargets.push({
            key: month,
            startDate: bucketStart,
            cutoffSql:
              bucketEnd === clock.selectedDate && clock.isCurrentDate
                ? clock.cutoffSql
                : formatSqlDateTimeUtc(historicalEndOfManilaDayUtc(bucketEnd)),
          });
        }
      }

      const trendStartCutoff = formatSqlDateTimeUtc(
        historicalEndOfManilaDayUtc(analyticsShiftDays(trendStartDate, -1)),
      );

      const groupMode = trendInterval === "day" ? "day" : true;

      const [rawTrendRows, readyTrendRows] = await Promise.all([
        queryAnalyticsRawOutflow(
          rawRows,
          trendStartCutoff,
          clock.cutoffSql,
          groupMode,
        ),
        queryAnalyticsReadyMadeCogs(
          productRows,
          trendStartCutoff,
          clock.cutoffSql,
          groupMode,
        ),
      ]);

      const rawTrendOutflows = aggregateAnalyticsRawOutflow(
        rawTrendRows,
        rawRows,
      );

      const readyTrendCogs = aggregateAnalyticsReadyMadeCogs(readyTrendRows);

      // Process a few dates concurrently so the graph does not wait for
      // every historical date to finish one by one.
      // Keep batches small to avoid overwhelming the database.
      const TREND_BATCH_SIZE = 4;

      for (
        let batchStart = 0;
        batchStart < trendTargets.length;
        batchStart += TREND_BATCH_SIZE
      ) {
        const batch = trendTargets.slice(
          batchStart,
          batchStart + TREND_BATCH_SIZE,
        );

        const batchPoints = await Promise.all(
          batch.map(async (target) => {
            const bucketOpeningCutoff = formatSqlDateTimeUtc(
              historicalEndOfManilaDayUtc(
                analyticsShiftDays(target.startDate, -1),
              ),
            );

            const [
              rawOpeningSnapshot,
              rawClosingSnapshot,
              readyOpeningSnapshot,
              readyClosingSnapshot,
            ] = await Promise.all([
              loadAnalyticsSnapshot({
                rows: rawRows,
                entityType: "raw",
                cutoffSql: bucketOpeningCutoff,
                snapshotCache,
                warnings: [],
              }),
              loadAnalyticsSnapshot({
                rows: rawRows,
                entityType: "raw",
                cutoffSql: target.cutoffSql,
                snapshotCache,
                warnings: [],
              }),
              loadAnalyticsSnapshot({
                rows: productRows,
                entityType: "ready",
                cutoffSql: bucketOpeningCutoff,
                snapshotCache,
                warnings: [],
              }),
              loadAnalyticsSnapshot({
                rows: productRows,
                entityType: "ready",
                cutoffSql: target.cutoffSql,
                snapshotCache,
                warnings: [],
              }),
            ]);

            const rawOpeningValue = calculateAnalyticsValuation(
              rawOpeningSnapshot,
              "raw",
            );

            const rawClosingValue = calculateAnalyticsValuation(
              rawClosingSnapshot,
              "raw",
            );

            const readyOpeningValue = calculateAnalyticsValuation(
              readyOpeningSnapshot,
              "ready",
            );

            const readyClosingValue = calculateAnalyticsValuation(
              readyClosingSnapshot,
              "ready",
            );

            // An empty opening snapshot is not proof of a zero opening
            // balance when inventory records exist by the end of the bucket.
            // Keep the closing valuation visible, but withhold turnover
            // until the opening baseline can be verified.
            if (
              rawOpeningSnapshot.rows.length === 0 &&
              rawClosingSnapshot.rows.length > 0
            ) {
              rawOpeningValue.value = null;
              rawOpeningValue.complete = false;
              rawOpeningValue.baselineUnavailable = true;
            }

            if (
              readyOpeningSnapshot.rows.length === 0 &&
              readyClosingSnapshot.rows.length > 0
            ) {
              readyOpeningValue.value = null;
              readyOpeningValue.complete = false;
              readyOpeningValue.baselineUnavailable = true;
            }

            const rawOutflow = rawTrendOutflows.get(target.key) || {
              value: 0,
              complete: true,
            };

            const readyOutflow = readyTrendCogs.get(target.key) || {
              value: 0,
              complete: true,
            };

            return {
              month: target.key,

              raw_materials_value:
                inventoryType === "ready_made" ? null : rawClosingValue.value,

              ready_made_value:
                inventoryType === "raw" ? null : readyClosingValue.value,

              raw_materials_turnover:
                inventoryType === "ready_made"
                  ? null
                  : calculateAnalyticsTurnover(
                      rawOutflow,
                      rawOpeningValue,
                      rawClosingValue,
                    ),

              ready_made_turnover:
                inventoryType === "raw"
                  ? null
                  : calculateAnalyticsTurnover(
                      readyOutflow,
                      readyOpeningValue,
                      readyClosingValue,
                    ),

              valuation_complete:
                (inventoryType === "ready_made" || rawClosingValue.complete) &&
                (inventoryType === "raw" || readyClosingValue.complete),
            };
          }),
        );

        // Promise.all preserves the original date order.
        trend.push(...batchPoints);
      }
    }

    if (rawSelected && !closingRawValue.complete) {
      warnings.push(
        "Raw-material valuation is incomplete because some historical quantities or unit costs are unavailable.",
      );
    }

    if (readySelected && !closingReadyValue.complete) {
      warnings.push(
        "Ready-made valuation is incomplete because some historical quantities or production costs are unavailable.",
      );
    }

    return res.json({
      report_date: clock.selectedDate,
      period_start_date: periodStartDate,
      period_end_date: clock.selectedDate,

      period_days: rangeStartDate
        ? Math.floor(
            (new Date(`${clock.selectedDate}T00:00:00Z`).getTime() -
              new Date(`${periodStartDate}T00:00:00Z`).getTime()) /
              86400000,
          ) + 1
        : 30,

      filters: {
        inventory_type: inventoryType || "all",
        search,
        stock_status: stockStatus || "all",
      },

      cost_basis:
        "Historical quantities valued using current catalog costs; ready-made turnover uses stored order-item production costs when available.",

      valuation: {
        raw_materials: rawSelected ? closingRawValue.value : null,

        ready_made: readySelected ? closingReadyValue.value : null,

        total: valuationTotal,

        raw_materials_complete: rawSelected ? closingRawValue.complete : null,

        ready_made_complete: readySelected ? closingReadyValue.complete : null,
      },

      turnover: {
        raw_materials: rawSelected
          ? calculateAnalyticsTurnover(
              rawPeriodOutflow,
              openingRawValue,
              closingRawValue,
            )
          : null,

        ready_made: readySelected
          ? calculateAnalyticsTurnover(
              readyPeriodCogs,
              openingReadyValue,
              closingReadyValue,
            )
          : null,
      },

      turnover_inputs: {
        raw_materials: rawSelected
          ? buildTurnoverInputs(
              rawPeriodOutflow,
              openingRawValue,
              closingRawValue,
            )
          : null,

        ready_made: readySelected
          ? buildTurnoverInputs(
              readyPeriodCogs,
              openingReadyValue,
              closingReadyValue,
            )
          : null,
      },

      trend_interval: trendInterval,
      trend,
      warnings: [...new Set(warnings)],
    });
  } catch (error) {
    const status = Number(error?.status) || 500;

    return res.status(status).json({
      message: error?.message || "Failed to generate Inventory Analytics.",
    });
  }
};

exports.getInventoryReport = async (req, res) => {
  try {
    const clock = await getReportClock(req.query.date);
    const warnings = [];

    const [rawRows] = await pool.query(
      `SELECT
         rm.id,
         rm.name,
         rm.category_id,
         rm.unit,
         rm.material_form,
         rm.length_mm,
         rm.width_mm,
         rm.thickness_mm,
         rm.quantity,
         rm.reorder_point,
         rm.safety_stock,
         rm.lead_time_days,
         rm.supplier_id,
         rm.stock_status,
         rm.created_at,
         s.name AS supplier_name,
         c.name AS category_name
       FROM raw_materials rm
       LEFT JOIN suppliers s ON s.id = rm.supplier_id
       LEFT JOIN categories c ON c.id = rm.category_id
              WHERE rm.created_at < ?
       ORDER BY rm.created_at ASC, rm.id ASC`,
      [clock.cutoffSql],
    );

    const [productRows] = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.barcode,
         p.stock,
         p.reorder_point,
         p.stock_status,
         p.created_at,
         COALESCE(ds.quantity, 0) AS display_stock
       FROM products p
       LEFT JOIN ready_made_display_stock ds ON ds.product_id = p.id
            WHERE LOWER(COALESCE(p.type, 'standard')) = 'standard'
         AND p.created_at < ?
       ORDER BY p.name ASC, p.id ASC`,
      [clock.cutoffSql],
    );

    const rawReconstruction = await reconstructOnHand({
      rows: rawRows,
      entityType: "raw",
      cutoffSql: clock.cutoffSql,
      warnings,
    });
    const productReconstruction = await reconstructOnHand({
      rows: productRows,
      entityType: "ready",
      cutoffSql: clock.cutoffSql,
      warnings,
    });
    const displayReconstruction = await reconstructDisplayStock({
      products: productRows,
      cutoffSql: clock.cutoffSql,
      warnings,
    });

    const displayByProduct = displayReconstruction.displayById;
    const displayCompleteByProduct = displayReconstruction.completeById;

    const rawIds = rawRows.map((row) => Number(row.id));
    const reservationByMaterial = await getHistoricalReservationSummary(
      rawIds,
      clock.cutoffSql,
    );
    const usageByMaterial = await getRawUsage30Days(rawIds, clock.cutoffSql);

    const raw_materials = rawRows.map((row) => {
      const materialId = Number(row.id);
      const onHand = rawReconstruction.quantityById.get(materialId);
      const reservation = reservationByMaterial.get(materialId) || {
        reserved_quantity: 0,
        pending_need_quantity: 0,
      };
      const usedLast30Days = usageByMaterial.get(materialId) || 0;
      const avgDailyUsage = usedLast30Days / 30;
      const available =
        onHand === null
          ? null
          : Math.max(
              0,
              normalizeQuantity(
                onHand - Number(reservation.reserved_quantity || 0),
              ),
            );

      const availabilityStatus = computeRawHealth({
        onHand,
        reserved: reservation.reserved_quantity,
        pendingNeed: reservation.pending_need_quantity,
        safetyStock: row.safety_stock,
        reorderPoint: row.reorder_point,
        leadTimeDays: row.lead_time_days,
        avgDailyUsage,
      });

      return {
        ...row,
        on_hand_quantity: onHand,
        reserved_quantity: reservation.reserved_quantity,
        available_quantity: available,
        pending_need_quantity: reservation.pending_need_quantity,
        used_last_30_days: usedLast30Days,
        avg_daily_usage_30d: avgDailyUsage,
        availability_status: availabilityStatus,
        history_complete:
          rawReconstruction.completeById.get(materialId) !== false,
      };
    });

    const ready_made = productRows.map((row) => {
      const productId = Number(row.id);
      const total = productReconstruction.quantityById.get(productId);
      let display = displayByProduct.get(productId);

      const displayHistoryComplete =
        displayCompleteByProduct.get(productId) !== false;

      if (!displayHistoryComplete) {
        display = null;
      }

      if (total !== null && display !== null && display > total + EPSILON) {
        warnings.push(
          `Ready-made product #${productId} has historical Display stock above historical Total stock. The location allocation needs review.`,
        );

        display = null;
      }

      if (total !== null && display !== null) {
        display = Math.min(Math.max(0, display), Math.max(0, total));
      }

      const warehouse =
        total === null || display === null
          ? null
          : Math.max(0, normalizeQuantity(total - display));

      return {
        id: row.id,
        name: row.name,
        barcode: row.barcode,
        reorder_point: row.reorder_point,
        total_stock: total,
        display_stock: display,
        warehouse_stock: warehouse,
        stock_status: computeReadyHealth(total, row.reorder_point),
        history_complete:
          productReconstruction.completeById.get(productId) !== false &&
          displayHistoryComplete,
      };
    });

    const dedupedWarnings = [...new Set(warnings)];

    return res.json({
      report_date: clock.selectedDate,
      generated_at: `${clock.generatedAtUtc}Z`,
      as_of_at: `${clock.cutoffSql.replace(" ", "T")}Z`,
      is_current_date: clock.isCurrentDate,
      history_complete: dedupedWarnings.length === 0,
      warnings: dedupedWarnings,
      scope:
        "Inventory records that already existed by the selected report date. Historical stock quantities are reconstructed from recorded inventory movement, adjustment, reservation, and transfer history.",
      raw_materials,
      ready_made,
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      message: error?.message || "Failed to generate Inventory Report.",
    });
  }
};
