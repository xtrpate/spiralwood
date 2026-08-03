// services/blueprintMaterialReservationService.js
//
// BPI-3 centralized, idempotent material reservation for blueprint orders.
//
// CONTRACT WITH CALLERS:
//   - Accepts an already-open, already-transactional mysql2 connection.
//   - Never begins, commits, rolls back, or releases a transaction.
//   - Must be called only after the payment write that may make the order
//     reach the required verified 30% threshold, and before the caller's
//     commit.
//   - A stock shortage is NOT an error. The payment remains verified and a
//     pending_stock row is recorded. Only integrity/database failures throw.
//
// BPI-3 does not deduct raw_materials.quantity and does not create a
// stock_movements row. Physical stock deduction belongs to BPI-4 when
// production actually starts.

const {
  parseDecimalToCentsStrict,
  calcDownPaymentAmount,
} = require("../utils/paymentAmounts");
const {
  resolveLifecycleByOrder,
} = require("./blueprintLifecycleService");

const normalize = (value) => String(value || "").trim().toLowerCase();

const ALLOWED_ORDER_STATUSES = new Set([
  "confirmed",
  "contract_released",
  "production",
  "shipping",
  "delivered",
]);

const ACTIVE_RESERVATION_STATUSES = new Set(["pending_stock", "reserved"]);
const TERMINAL_RESERVATION_STATUSES = new Set(["consumed", "released"]);

class BlueprintMaterialReservationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BlueprintMaterialReservationError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new BlueprintMaterialReservationError(code, message);
};

const isPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
};

const parsePositiveQuantityUnits = (value, label) => {
  const units = parseDecimalToCentsStrict(value);
  if (units === null || units <= 0) {
    fail(
      "INVALID_MATERIAL_QUANTITY",
      `${label} has an invalid material quantity.`,
    );
  }
  return units;
};

const parseNonNegativeQuantityUnits = (value, label) => {
  const units = parseDecimalToCentsStrict(value);
  if (units === null) {
    fail(
      "INVALID_MATERIAL_STOCK",
      `${label} has an invalid on-hand quantity.`,
    );
  }
  return units;
};

const unitsToDecimalString = (units) => {
  const safeUnits = Math.trunc(Number(units) || 0);
  const whole = Math.trunc(safeUnits / 100);
  const fraction = String(Math.abs(safeUnits % 100)).padStart(2, "0");
  return `${whole}.${fraction}`;
};

const unitsToAmount = (units) => Number(unitsToDecimalString(units));

const safeParseEstimationData = (rawValue) => {
  if (!rawValue) return null;
  try {
    const parsed =
      typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeItemDescription = (item) =>
  String(item?.name || item?.description || "").trim();

// Source type exists only in estimations.estimation_data. The normalized
// estimation_items table intentionally does not have a source_type column,
// so rows are paired by their transactionally-created order and checked
// against the JSON snapshot before any material is reserved. This prevents a
// billable component/cut-list row that merely has raw_material_id from being
// mistaken for an explicit inventory-tracking row.
const extractInventoryRequirements = ({ estimation, estimationItemRows }) => {
  const estimationData = safeParseEstimationData(estimation?.estimation_data);
  const jsonItems = Array.isArray(estimationData?.items)
    ? estimationData.items
    : [];

  const inventoryIndexes = [];
  jsonItems.forEach((item, index) => {
    if (normalize(item?.source_type || item?.sourceType) === "inventory_material") {
      inventoryIndexes.push(index);
    }
  });

  if (inventoryIndexes.length === 0) return [];

  if (jsonItems.length !== estimationItemRows.length) {
    fail(
      "ESTIMATION_ITEM_SNAPSHOT_MISMATCH",
      "The approved estimation item snapshot does not match its normalized item rows.",
    );
  }

  const grouped = new Map();

  for (const index of inventoryIndexes) {
    const jsonItem = jsonItems[index];
    const dbItem = estimationItemRows[index];
    const rawMaterialId = Number(jsonItem?.raw_material_id);

    if (!isPositiveInt(rawMaterialId)) {
      fail(
        "INVALID_INVENTORY_MATERIAL_LINK",
        `Approved estimation item ${index + 1} has no valid inventory material link.`,
      );
    }

    if (Number(dbItem?.raw_material_id) !== rawMaterialId) {
      fail(
        "ESTIMATION_ITEM_SNAPSHOT_MISMATCH",
        `Approved estimation item ${index + 1} does not match its stored inventory material link.`,
      );
    }

    const jsonQuantityUnits = parsePositiveQuantityUnits(
      jsonItem?.quantity,
      `Approved estimation item ${index + 1}`,
    );
    const dbQuantityUnits = parsePositiveQuantityUnits(
      dbItem?.quantity,
      `Stored estimation item ${index + 1}`,
    );

    if (jsonQuantityUnits !== dbQuantityUnits) {
      fail(
        "ESTIMATION_ITEM_SNAPSHOT_MISMATCH",
        `Approved estimation item ${index + 1} does not match its stored quantity.`,
      );
    }

    const expectedDescription = normalizeItemDescription(jsonItem);
    const storedDescription = String(dbItem?.description || "").trim();
    if (!expectedDescription || expectedDescription !== storedDescription) {
      fail(
        "ESTIMATION_ITEM_SNAPSHOT_MISMATCH",
        `Approved estimation item ${index + 1} does not match its stored description.`,
      );
    }

    const jsonUnitCostUnits = parseDecimalToCentsStrict(jsonItem?.unit_cost ?? 0);
    const dbUnitCostUnits = parseDecimalToCentsStrict(dbItem?.unit_cost ?? 0);
    if (
      jsonUnitCostUnits === null ||
      dbUnitCostUnits === null ||
      jsonUnitCostUnits !== dbUnitCostUnits
    ) {
      fail(
        "ESTIMATION_ITEM_SNAPSHOT_MISMATCH",
        `Approved estimation item ${index + 1} does not match its stored rate.`,
      );
    }

    const previous = grouped.get(rawMaterialId);
    const nextQuantityUnits =
      (previous?.quantityUnits || 0) + dbQuantityUnits;

    if (!Number.isSafeInteger(nextQuantityUnits)) {
      fail(
        "INVALID_MATERIAL_QUANTITY",
        `Approved estimation material ${rawMaterialId} has an invalid total quantity.`,
      );
    }

    grouped.set(rawMaterialId, {
      materialId: rawMaterialId,
      quantityUnits: nextQuantityUnits,
    });
  }

  return [...grouped.values()].sort((a, b) => a.materialId - b.materialId);
};

const buildIssueNote = ({ requiredUnits, availableUnits, shortageUnits, unit }) => {
  const safeUnit = String(unit || "unit").trim() || "unit";
  return [
    `Required ${unitsToDecimalString(requiredUnits)} ${safeUnit}`,
    `available ${unitsToDecimalString(availableUnits)} ${safeUnit}`,
    `shortage ${unitsToDecimalString(shortageUnits)} ${safeUnit}`,
  ]
    .join("; ")
    .slice(0, 255);
};

async function ensureBlueprintMaterialReservations(
  conn,
  { orderId, actorUserId = null } = {},
) {
  const orderIdNum = Number(orderId);
  const actorUserIdNum = actorUserId == null ? null : Number(actorUserId);

  if (!conn || typeof conn.query !== "function") {
    fail(
      "INVALID_CONNECTION",
      "A transactional database connection is required for material reservation.",
    );
  }
  if (!isPositiveInt(orderIdNum)) {
    fail("INVALID_ORDER_ID", "orderId must be a positive integer.");
  }
  if (actorUserIdNum !== null && !isPositiveInt(actorUserIdNum)) {
    fail("INVALID_ACTOR_ID", "actorUserId must be a positive integer or null.");
  }

  // Canonical lock order: order -> blueprint -> estimation/context/payment.
  const lifecycle = await resolveLifecycleByOrder(conn, {
    orderId: orderIdNum,
    lockOrder: true,
    lockBlueprint: true,
    lockEstimation: true,
    lockContext: true,
  });

  if (
    lifecycle.status !== "OK" ||
    !lifecycle.order ||
    !lifecycle.blueprint ||
    !lifecycle.estimation
  ) {
    fail(
      "BLUEPRINT_LIFECYCLE_UNRESOLVED",
      `Blueprint material reservation cannot resolve the current order lifecycle (${lifecycle.reason || "unknown"}).`,
    );
  }

  const { order, blueprint, estimation } = lifecycle;

  if (normalize(order.order_type) !== "blueprint") {
    return {
      triggered: false,
      reason: "NOT_BLUEPRINT_ORDER",
      order_id: orderIdNum,
      threshold_reached: false,
      materials: [],
    };
  }

  if (!ALLOWED_ORDER_STATUSES.has(normalize(order.status))) {
    fail(
      "ORDER_STATUS_NOT_RESERVABLE",
      `Order status "${order.status}" does not allow blueprint material reservation.`,
    );
  }

  if (
    Number(blueprint.is_deleted) === 1 ||
    normalize(blueprint.stage) === "archived"
  ) {
    fail(
      "BLUEPRINT_ARCHIVED",
      "Archived blueprint materials cannot be reserved.",
    );
  }

  if (normalize(estimation.status) !== "approved") {
    fail(
      "ESTIMATION_NOT_APPROVED",
      "Blueprint materials can only be reserved from an approved estimation.",
    );
  }

  const orderTotalCents = parseDecimalToCentsStrict(order.total);
  const estimationTotalCents = parseDecimalToCentsStrict(estimation.grand_total);
  if (
    orderTotalCents === null ||
    estimationTotalCents === null ||
    orderTotalCents <= 0 ||
    estimationTotalCents <= 0 ||
    orderTotalCents !== estimationTotalCents
  ) {
    fail(
      "ORDER_ESTIMATION_TOTAL_MISMATCH",
      "The order total does not match the approved estimation total.",
    );
  }

  const [paymentRows] = await conn.query(
    `SELECT id, amount, status
     FROM payment_transactions
     WHERE order_id = ?
     ORDER BY id
     FOR UPDATE`,
    [orderIdNum],
  );

  let verifiedTotalCents = 0;
  for (const row of paymentRows) {
    if (normalize(row.status) !== "verified") continue;
    const amountCents = parseDecimalToCentsStrict(row.amount);
    if (amountCents === null || amountCents <= 0) {
      fail(
        "INVALID_VERIFIED_PAYMENT_AMOUNT",
        "One or more verified payment amounts are invalid.",
      );
    }
    const nextTotal = verifiedTotalCents + amountCents;
    if (!Number.isSafeInteger(nextTotal)) {
      fail(
        "INVALID_VERIFIED_PAYMENT_TOTAL",
        "The verified payment total is invalid.",
      );
    }
    verifiedTotalCents = nextTotal;
  }

  if (verifiedTotalCents > orderTotalCents) {
    fail(
      "VERIFIED_PAYMENT_OVERPAYMENT",
      "Verified payments exceed the approved order total.",
    );
  }

  const requiredMinimumAmount = calcDownPaymentAmount(estimation.grand_total);
  const requiredMinimumCents = parseDecimalToCentsStrict(
    typeof requiredMinimumAmount === "number"
      ? requiredMinimumAmount.toFixed(2)
      : requiredMinimumAmount,
  );

  if (requiredMinimumCents === null || requiredMinimumCents <= 0) {
    fail(
      "INVALID_REQUIRED_DOWN_PAYMENT",
      "The required 30% down payment could not be calculated.",
    );
  }

  if (verifiedTotalCents < requiredMinimumCents) {
    return {
      triggered: false,
      reason: "BELOW_REQUIRED_30_PERCENT",
      order_id: orderIdNum,
      blueprint_id: blueprint.id,
      estimation_id: estimation.id,
      threshold_reached: false,
      verified_total: verifiedTotalCents / 100,
      required_minimum: requiredMinimumCents / 100,
      materials: [],
    };
  }

  const [estimationItemRows] = await conn.query(
    `SELECT id, raw_material_id, description, quantity, unit_cost
     FROM estimation_items
     WHERE estimation_id = ?
     ORDER BY id
     FOR UPDATE`,
    [estimation.id],
  );

  const requirements = extractInventoryRequirements({
    estimation,
    estimationItemRows,
  });

  if (requirements.length === 0) {
    return {
      triggered: true,
      reason: "NO_INVENTORY_MATERIALS",
      order_id: orderIdNum,
      blueprint_id: blueprint.id,
      estimation_id: estimation.id,
      threshold_reached: true,
      verified_total: verifiedTotalCents / 100,
      required_minimum: requiredMinimumCents / 100,
      overall_status: "not_required",
      reserved_count: 0,
      pending_stock_count: 0,
      unchanged_terminal_count: 0,
      materials: [],
    };
  }

  const materialIds = requirements.map((row) => row.materialId);
  const placeholders = materialIds.map(() => "?").join(",");

  // Raw material rows are locked first and in ascending id order. This is
  // the serialization point that prevents two different projects from both
  // claiming the same remaining availability.
  const [materialRows] = await conn.query(
    `SELECT id, name, unit, quantity, is_active
     FROM raw_materials
     WHERE id IN (${placeholders})
     ORDER BY id
     FOR UPDATE`,
    materialIds,
  );

  if (materialRows.length !== materialIds.length) {
    fail(
      "RAW_MATERIAL_NOT_FOUND",
      "One or more approved estimation materials no longer exist.",
    );
  }

  const materialMap = new Map(
    materialRows.map((row) => [Number(row.id), row]),
  );

  // Lock every active/terminal reservation row for the selected materials.
  // Because raw material rows above are already locked, all concurrent
  // reservations for the same material serialize before this calculation.
  const [reservationRows] = await conn.query(
    `SELECT id, order_id, blueprint_id, estimation_id, material_id,
            material_name_snapshot, unit_snapshot, quantity, status,
            issue_code, issue_note, reserved_at
     FROM blueprint_material_reservations
     WHERE material_id IN (${placeholders})
     ORDER BY material_id, id
     FOR UPDATE`,
    materialIds,
  );

  const currentReservationByMaterial = new Map();
  const reservedElsewhereUnitsByMaterial = new Map();

  for (const row of reservationRows) {
    const materialId = Number(row.material_id);
    const rowOrderId = Number(row.order_id);
    const status = normalize(row.status);

    if (rowOrderId === orderIdNum) {
      if (currentReservationByMaterial.has(materialId)) {
        fail(
          "DUPLICATE_ORDER_MATERIAL_RESERVATION",
          `Order ${orderIdNum} has duplicate reservations for material ${materialId}.`,
        );
      }
      currentReservationByMaterial.set(materialId, row);
      continue;
    }

    if (status === "reserved") {
      const quantityUnits = parsePositiveQuantityUnits(
        row.quantity,
        `Reservation ${row.id}`,
      );
      const previous = reservedElsewhereUnitsByMaterial.get(materialId) || 0;
      const next = previous + quantityUnits;
      if (!Number.isSafeInteger(next)) {
        fail(
          "INVALID_RESERVED_TOTAL",
          `Reserved quantity for material ${materialId} is invalid.`,
        );
      }
      reservedElsewhereUnitsByMaterial.set(materialId, next);
    }
  }

  const materialResults = [];
  let reservedCount = 0;
  let pendingStockCount = 0;
  let unchangedTerminalCount = 0;

  for (const requirement of requirements) {
    const material = materialMap.get(requirement.materialId);
    if (!material) {
      fail(
        "RAW_MATERIAL_NOT_FOUND",
        `Raw material ${requirement.materialId} no longer exists.`,
      );
    }

    const onHandUnits = parseNonNegativeQuantityUnits(
      material.quantity,
      `Raw material ${material.id}`,
    );
    const reservedElsewhereUnits =
      reservedElsewhereUnitsByMaterial.get(requirement.materialId) || 0;
    const availableUnits = Math.max(0, onHandUnits - reservedElsewhereUnits);
    const shortageUnits = Math.max(
      0,
      requirement.quantityUnits - availableUnits,
    );

    const existing = currentReservationByMaterial.get(requirement.materialId);
    const existingStatus = normalize(existing?.status);

    if (existing) {
      const existingQuantityUnits = parsePositiveQuantityUnits(
        existing.quantity,
        `Reservation ${existing.id}`,
      );
      const referenceMatches =
        Number(existing.blueprint_id) === Number(blueprint.id) &&
        Number(existing.estimation_id) === Number(estimation.id) &&
        existingQuantityUnits === requirement.quantityUnits;

      if (!referenceMatches) {
        fail(
          "EXISTING_RESERVATION_MISMATCH",
          `Existing reservation ${existing.id} does not match the approved estimation.`,
        );
      }
    }

    if (existing && TERMINAL_RESERVATION_STATUSES.has(existingStatus)) {
      unchangedTerminalCount += 1;
      materialResults.push({
        reservation_id: existing.id,
        material_id: requirement.materialId,
        material_name: material.name,
        unit: material.unit,
        required: unitsToAmount(requirement.quantityUnits),
        on_hand: unitsToAmount(onHandUnits),
        reserved_elsewhere: unitsToAmount(reservedElsewhereUnits),
        available: unitsToAmount(availableUnits),
        shortage: unitsToAmount(shortageUnits),
        status: existingStatus,
        changed: false,
      });
      continue;
    }

    // Once an active reservation has successfully claimed stock, never
    // downgrade it merely because a later manual adjustment made on-hand
    // stock lower. The reservation remains the project's claim; inventory
    // reconciliation is a separate integrity task.
    const targetStatus =
      existingStatus === "reserved" || shortageUnits === 0
        ? "reserved"
        : "pending_stock";

    const issueCode =
      targetStatus === "pending_stock" ? "INSUFFICIENT_STOCK" : null;
    const issueNote =
      targetStatus === "pending_stock"
        ? buildIssueNote({
            requiredUnits: requirement.quantityUnits,
            availableUnits,
            shortageUnits,
            unit: material.unit,
          })
        : null;

    let reservationId = existing?.id || null;
    let changed = false;

    if (!existing) {
      const [insertResult] = await conn.query(
        `INSERT INTO blueprint_material_reservations
          (order_id, blueprint_id, estimation_id, material_id,
           material_name_snapshot, unit_snapshot, quantity, status,
           issue_code, issue_note, created_by, reserved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 CASE WHEN ? = 'reserved' THEN NOW() ELSE NULL END)`,
        [
          orderIdNum,
          blueprint.id,
          estimation.id,
          requirement.materialId,
          String(material.name || "").slice(0, 150),
          String(material.unit || "unit").slice(0, 30),
          unitsToDecimalString(requirement.quantityUnits),
          targetStatus,
          issueCode,
          issueNote,
          actorUserIdNum,
          targetStatus,
        ],
      );

      if (insertResult.affectedRows !== 1 || !isPositiveInt(insertResult.insertId)) {
        fail(
          "RESERVATION_INSERT_FAILED",
          `Failed to create a reservation for material ${requirement.materialId}.`,
        );
      }

      reservationId = insertResult.insertId;
      changed = true;
    } else if (!ACTIVE_RESERVATION_STATUSES.has(existingStatus)) {
      fail(
        "INVALID_RESERVATION_STATUS",
        `Reservation ${existing.id} has an invalid status.`,
      );
    } else {
      const [updateResult] = await conn.query(
        `UPDATE blueprint_material_reservations
         SET status = ?,
             issue_code = ?,
             issue_note = ?,
             reserved_at = CASE
               WHEN ? = 'reserved' THEN COALESCE(reserved_at, NOW())
               ELSE NULL
             END
         WHERE id = ?
           AND order_id = ?
           AND material_id = ?
           AND status IN ('pending_stock', 'reserved')`,
        [
          targetStatus,
          issueCode,
          issueNote,
          targetStatus,
          existing.id,
          orderIdNum,
          requirement.materialId,
        ],
      );

      if (updateResult.affectedRows > 1) {
        fail(
          "RESERVATION_UPDATE_FAILED",
          `Reservation ${existing.id} updated an unexpected number of rows.`,
        );
      }

      changed =
        existingStatus !== targetStatus ||
        String(existing.issue_code || "") !== String(issueCode || "") ||
        String(existing.issue_note || "") !== String(issueNote || "");
    }

    if (targetStatus === "reserved") reservedCount += 1;
    else pendingStockCount += 1;

    materialResults.push({
      reservation_id: reservationId,
      material_id: requirement.materialId,
      material_name: material.name,
      unit: material.unit,
      required: unitsToAmount(requirement.quantityUnits),
      on_hand: unitsToAmount(onHandUnits),
      reserved_elsewhere: unitsToAmount(reservedElsewhereUnits),
      available: unitsToAmount(availableUnits),
      shortage: unitsToAmount(shortageUnits),
      status: targetStatus,
      changed,
    });
  }

  return {
    triggered: true,
    reason: null,
    order_id: orderIdNum,
    blueprint_id: blueprint.id,
    estimation_id: estimation.id,
    threshold_reached: true,
    verified_total: verifiedTotalCents / 100,
    required_minimum: requiredMinimumCents / 100,
    overall_status:
      pendingStockCount > 0 ? "pending_stock" : "reserved",
    reserved_count: reservedCount,
    pending_stock_count: pendingStockCount,
    unchanged_terminal_count: unchangedTerminalCount,
    materials: materialResults,
  };
}

module.exports = {
  ensureBlueprintMaterialReservations,
  BlueprintMaterialReservationError,
  // Exported only for focused unit/static tests; production callers should
  // use ensureBlueprintMaterialReservations.
  extractInventoryRequirements,
};
