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

async function reconstructOnHand({
  rows,
  entityType,
  cutoffSql,
  warnings,
}) {
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

    const type = String(movement.type || "").trim().toLowerCase();
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
      normalizeQuantity(row.display_stock) ?? 0,
    ]),
  );

  if (ids.length === 0) return displayById;

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

    if (!displayById.has(productId) || before === null) {
      warnings.push(
        `Display allocation history is incomplete for ready-made product #${productId}.`,
      );
      continue;
    }

    displayById.set(productId, Math.max(0, before));
  }

  return displayById;
}

async function getHistoricalReservationSummary(materialIds, cutoffSql) {
  const ids = materialIds.map(Number).filter((id) => id > 0);
  const summaryByMaterial = new Map(
    ids.map((id) => [
      id,
      { reserved_quantity: 0, pending_need_quantity: 0 },
    ]),
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
    `SELECT material_id, COALESCE(SUM(quantity), 0) AS used_quantity
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
       WHERE rm.is_active = 1
         AND rm.created_at < ?
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
         AND p.is_active = 1
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
    const displayByProduct = await reconstructDisplayStock({
      products: productRows,
      cutoffSql: clock.cutoffSql,
      warnings,
    });

    const rawIds = rawRows.map((row) => Number(row.id));
    const reservationByMaterial = await getHistoricalReservationSummary(
      rawIds,
      clock.cutoffSql,
    );
    const usageByMaterial = await getRawUsage30Days(
      rawIds,
      clock.cutoffSql,
    );

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
      let display = displayByProduct.get(productId) ?? 0;

      if (total !== null && display > total + EPSILON) {
        warnings.push(
          `Ready-made product #${productId} has historical Display stock above historical Total stock. The location allocation needs review.`,
        );
      }

      if (total !== null) {
        display = Math.min(Math.max(0, display), Math.max(0, total));
      }

      const warehouse =
        total === null ? null : Math.max(0, normalizeQuantity(total - display));

      return {
        id: row.id,
        name: row.name,
        barcode: row.barcode,
        reorder_point: row.reorder_point,
        total_stock: total,
        display_stock: total === null ? null : display,
        warehouse_stock: warehouse,
        stock_status: computeReadyHealth(total, row.reorder_point),
        history_complete:
          productReconstruction.completeById.get(productId) !== false,
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
        "Currently active inventory records that already existed by the selected report date.",
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
