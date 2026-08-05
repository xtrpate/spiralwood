// services/blueprintMaterialConsumptionService.js
//
// BPI-4 centralized, transaction-bound material consumption for blueprint
// production.
//
// CONTRACT WITH CALLERS:
//   - Accepts an already-open, already-transactional mysql2 connection.
//   - Never begins, commits, rolls back, or releases a transaction.
//   - The caller must update the order to production in the SAME transaction.
//   - All reserved materials are deducted as one atomic unit. A pending,
//     released, missing, malformed, or physically deficient reservation blocks
//     production before any deduction is committed.
//   - Repeated calls are idempotent once every reservation is consumed.

const { parseDecimalToCentsStrict } = require("../utils/paymentAmounts");

const normalize = (value) => String(value || "").trim().toLowerCase();

class BlueprintMaterialConsumptionError extends Error {
  constructor(code, message, statusCode = 409, details = null) {
    super(message);
    this.name = "BlueprintMaterialConsumptionError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const fail = (code, message, statusCode = 409, details = null) => {
  throw new BlueprintMaterialConsumptionError(
    code,
    message,
    statusCode,
    details,
  );
};

const isPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
};

const parsePositiveQuantityUnits = (value, label) => {
  const units = parseDecimalToCentsStrict(value);
  if (units === null || units <= 0) {
    fail(
      "INVALID_RESERVED_QUANTITY",
      `${label} has an invalid reserved quantity.`,
    );
  }
  return units;
};

const parseNonNegativeQuantityUnits = (value, label) => {
  const units = parseDecimalToCentsStrict(value);
  if (units === null || units < 0) {
    fail(
      "INVALID_ON_HAND_QUANTITY",
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

const buildMovementReference = (reservationId) =>
  `BLUEPRINT-RESERVATION-${reservationId}`;

const sameNumericSet = (left, right) => {
  if (left.length !== right.length) return false;
  const a = [...left].map(Number).sort((x, y) => x - y);
  const b = [...right].map(Number).sort((x, y) => x - y);
  return a.every((value, index) => value === b[index]);
};

async function consumeBlueprintMaterialsForProduction(
  conn,
  { orderId, actorUserId } = {},
) {
  const orderIdNum = Number(orderId);
  const actorUserIdNum = Number(actorUserId);

  if (!conn || typeof conn.query !== "function") {
    fail(
      "INVALID_CONNECTION",
      "A transactional database connection is required for material consumption.",
      500,
    );
  }
  if (!isPositiveInt(orderIdNum)) {
    fail("INVALID_ORDER_ID", "orderId must be a positive integer.", 400);
  }
  if (!isPositiveInt(actorUserIdNum)) {
    fail(
      "INVALID_ACTOR_ID",
      "actorUserId must be a positive integer.",
      400,
    );
  }

  // Canonical transaction lock begins with the order. Both production-entry
  // controllers call this before their own guarded status write.
  const [[order]] = await conn.query(
    `SELECT id, order_number, order_type, status, blueprint_id
     FROM orders
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [orderIdNum],
  );

  if (!order) {
    fail("ORDER_NOT_FOUND", "Order not found.", 404);
  }
  if (normalize(order.order_type) !== "blueprint") {
    fail(
      "NOT_BLUEPRINT_ORDER",
      "Material consumption is only allowed for blueprint orders.",
      400,
    );
  }
  if (!isPositiveInt(order.blueprint_id)) {
    fail(
      "BLUEPRINT_LINK_MISSING",
      "This blueprint order is not linked to a valid blueprint.",
    );
  }

  const orderStatus = normalize(order.status);
  if (!["contract_released", "production"].includes(orderStatus)) {
    fail(
      "ORDER_NOT_READY_FOR_PRODUCTION",
      `Order status "${order.status}" does not allow production material consumption.`,
      400,
    );
  }

  // Read the material ids first. The locked order serializes compliant writes
  // for this order. Raw materials are then locked in ascending id order before
  // the reservation rows, matching BPI-3's material-before-reservation lock
  // order and reducing cross-order deadlock risk.
  const [reservationPreviewRows] = await conn.query(
    `SELECT id, material_id
     FROM blueprint_material_reservations
     WHERE order_id = ?
     ORDER BY material_id, id`,
    [orderIdNum],
  );

  if (reservationPreviewRows.length === 0) {
    fail(
      "MATERIAL_RESERVATIONS_MISSING",
      "Production cannot start because this blueprint order has no material reservations.",
    );
  }

  const previewMaterialIds = reservationPreviewRows.map((row) =>
    Number(row.material_id),
  );
  if (previewMaterialIds.some((id) => !isPositiveInt(id))) {
    fail(
      "INVALID_MATERIAL_LINK",
      "One or more blueprint material reservations have an invalid material link.",
    );
  }

  const uniqueMaterialIds = [...new Set(previewMaterialIds)].sort(
    (a, b) => a - b,
  );
  if (uniqueMaterialIds.length !== previewMaterialIds.length) {
    fail(
      "DUPLICATE_ORDER_MATERIAL_RESERVATION",
      "This order has duplicate material reservation rows and requires manual review.",
    );
  }

  const materialPlaceholders = uniqueMaterialIds.map(() => "?").join(",");

  const [materialRows] = await conn.query(
    `SELECT id, name, unit, quantity, reorder_point, stock_status, is_active
     FROM raw_materials
     WHERE id IN (${materialPlaceholders})
     ORDER BY id
     FOR UPDATE`,
    uniqueMaterialIds,
  );

  if (materialRows.length !== uniqueMaterialIds.length) {
    fail(
      "RAW_MATERIAL_NOT_FOUND",
      "One or more reserved raw materials no longer exist.",
    );
  }

  const [reservationRows] = await conn.query(
    `SELECT id, order_id, blueprint_id, estimation_id, material_id,
            material_name_snapshot, unit_snapshot, quantity, status,
            issue_code, issue_note, reserved_at, consumed_by, consumed_at
     FROM blueprint_material_reservations
     WHERE order_id = ?
     ORDER BY material_id, id
     FOR UPDATE`,
    [orderIdNum],
  );

  if (
    reservationRows.length !== reservationPreviewRows.length ||
    !sameNumericSet(
      reservationRows.map((row) => row.id),
      reservationPreviewRows.map((row) => row.id),
    )
  ) {
    fail(
      "RESERVATION_SET_CHANGED",
      "The blueprint material reservation set changed while production was starting. Please refresh and try again.",
    );
  }

  const materialMap = new Map(
    materialRows.map((row) => [Number(row.id), row]),
  );

  const pendingRows = reservationRows.filter(
    (row) => normalize(row.status) === "pending_stock",
  );
  if (pendingRows.length > 0) {
    fail(
      "MATERIALS_PENDING_STOCK",
      `Production cannot start because ${pendingRows.length} material reservation${
        pendingRows.length === 1 ? " is" : "s are"
      } still pending stock.`,
      409,
      {
        pending_materials: pendingRows.map((row) => ({
          reservation_id: row.id,
          material_id: row.material_id,
          material_name: row.material_name_snapshot,
          quantity: Number(row.quantity),
          issue_code: row.issue_code,
          issue_note: row.issue_note,
        })),
      },
    );
  }

  const releasedRows = reservationRows.filter(
    (row) => normalize(row.status) === "released",
  );
  if (releasedRows.length > 0) {
    fail(
      "MATERIAL_RESERVATION_RELEASED",
      "Production cannot start because one or more material reservations were released.",
    );
  }

  const invalidRows = reservationRows.filter(
    (row) => !["reserved", "consumed"].includes(normalize(row.status)),
  );
  if (invalidRows.length > 0) {
    fail(
      "INVALID_RESERVATION_STATUS",
      "One or more material reservations have an unsupported status.",
    );
  }

  for (const reservation of reservationRows) {
    if (Number(reservation.blueprint_id) !== Number(order.blueprint_id)) {
      fail(
        "RESERVATION_BLUEPRINT_MISMATCH",
        `Reservation ${reservation.id} does not belong to the order's canonical blueprint.`,
      );
    }
    if (!materialMap.has(Number(reservation.material_id))) {
      fail(
        "RAW_MATERIAL_NOT_FOUND",
        `Reserved material ${reservation.material_id} no longer exists.`,
      );
    }
  }

  const consumedRows = reservationRows.filter(
    (row) => normalize(row.status) === "consumed",
  );
  const reservedRows = reservationRows.filter(
    (row) => normalize(row.status) === "reserved",
  );

  if (consumedRows.length > 0 && reservedRows.length > 0) {
    fail(
      "PARTIAL_MATERIAL_CONSUMPTION",
      "This order has a partially consumed material set and requires manual review before production can continue.",
    );
  }

  if (consumedRows.length === reservationRows.length) {
    return {
      triggered: false,
      reason: "ALREADY_CONSUMED",
      order_id: orderIdNum,
      blueprint_id: Number(order.blueprint_id),
      consumed_count: consumedRows.length,
      materials: consumedRows.map((row) => ({
        reservation_id: row.id,
        material_id: row.material_id,
        material_name: row.material_name_snapshot,
        unit: row.unit_snapshot,
        quantity: Number(row.quantity),
        status: "consumed",
        stock_movement_id: null,
      })),
    };
  }

  if (reservedRows.length !== reservationRows.length) {
    fail(
      "MATERIAL_RESERVATIONS_NOT_READY",
      "All blueprint material reservations must be reserved before production can start.",
    );
  }

  const movementReferences = reservedRows.map((row) =>
    buildMovementReference(row.id),
  );
  const referencePlaceholders = movementReferences.map(() => "?").join(",");
  const [existingMovementRows] = await conn.query(
    `SELECT id, material_id, order_id, quantity, reference
     FROM stock_movements
     WHERE order_id = ?
       AND type = 'out'
       AND reference IN (${referencePlaceholders})
     ORDER BY id
     FOR UPDATE`,
    [orderIdNum, ...movementReferences],
  );

  if (existingMovementRows.length > 0) {
    fail(
      "CONSUMPTION_MOVEMENT_ALREADY_EXISTS",
      "A production stock movement already exists for a reservation that is still marked reserved. Manual review is required.",
    );
  }

  const prepared = reservedRows.map((reservation) => {
    const material = materialMap.get(Number(reservation.material_id));
    const requiredUnits = parsePositiveQuantityUnits(
      reservation.quantity,
      `Reservation ${reservation.id}`,
    );
    const onHandUnits = parseNonNegativeQuantityUnits(
      material.quantity,
      `Raw material ${material.id}`,
    );

    if (onHandUnits < requiredUnits) {
      fail(
        "RESERVED_STOCK_DEFICIT",
        `${material.name || `Material ${material.id}`} has only ${unitsToDecimalString(
          onHandUnits,
        )} ${material.unit || "unit"} on hand, but ${unitsToDecimalString(
          requiredUnits,
        )} ${material.unit || "unit"} is reserved for this order.`,
        409,
        {
          material_id: material.id,
          material_name: material.name,
          on_hand: unitsToAmount(onHandUnits),
          required: unitsToAmount(requiredUnits),
        },
      );
    }

    return {
      reservation,
      material,
      requiredUnits,
      onHandUnits,
      remainingUnits: onHandUnits - requiredUnits,
      movementReference: buildMovementReference(reservation.id),
    };
  });

  const materialResults = [];
  const stockMovementIds = [];

  for (const item of prepared) {
    const quantityText = unitsToDecimalString(item.requiredUnits);

    const [deductResult] = await conn.query(
      `UPDATE raw_materials
       SET quantity = quantity - ?
       WHERE id = ?
         AND quantity >= ?`,
      [quantityText, item.material.id, quantityText],
    );

    if (deductResult.affectedRows !== 1) {
      fail(
        "RAW_MATERIAL_DEDUCTION_CONFLICT",
        `${item.material.name || `Material ${item.material.id}`} changed before production could start. Please refresh and try again.`,
      );
    }

    await conn.query(
      `UPDATE raw_materials
       SET stock_status = CASE
         WHEN quantity <= 0 THEN 'out_of_stock'
         WHEN quantity <= reorder_point THEN 'low_stock'
         ELSE 'in_stock'
       END
       WHERE id = ?`,
      [item.material.id],
    );

    const [movementResult] = await conn.query(
      `INSERT INTO stock_movements
        (material_id, product_id, type, quantity, supplier_id, order_id,
         order_item_id, reference, notes, created_by)
       VALUES (?, NULL, 'out', ?, NULL, ?, NULL, ?, ?, ?)`,
      [
        item.material.id,
        quantityText,
        orderIdNum,
        item.movementReference,
        `Blueprint material consumed when production started for ${
          order.order_number || `Order #${orderIdNum}`
        }. Reservation #${item.reservation.id}.`,
        actorUserIdNum,
      ],
    );

    if (
      movementResult.affectedRows !== 1 ||
      !isPositiveInt(movementResult.insertId)
    ) {
      fail(
        "STOCK_MOVEMENT_INSERT_FAILED",
        `Failed to record production stock movement for reservation ${item.reservation.id}.`,
        500,
      );
    }

    const [reservationUpdateResult] = await conn.query(
      `UPDATE blueprint_material_reservations
       SET status = 'consumed',
           issue_code = NULL,
           issue_note = NULL,
           consumed_by = ?,
           consumed_at = NOW()
       WHERE id = ?
         AND status = 'reserved'`,
      [actorUserIdNum, item.reservation.id],
    );

    if (reservationUpdateResult.affectedRows !== 1) {
      fail(
        "RESERVATION_CONSUMPTION_CONFLICT",
        `Reservation ${item.reservation.id} changed before it could be consumed.`,
      );
    }

    stockMovementIds.push(movementResult.insertId);
    materialResults.push({
      reservation_id: item.reservation.id,
      material_id: item.material.id,
      material_name: item.material.name,
      unit: item.material.unit,
      quantity: unitsToAmount(item.requiredUnits),
      on_hand_before: unitsToAmount(item.onHandUnits),
      on_hand_after: unitsToAmount(item.remainingUnits),
      status: "consumed",
      stock_movement_id: movementResult.insertId,
      reference: item.movementReference,
    });
  }

  return {
    triggered: true,
    reason: "CONSUMED_FOR_PRODUCTION",
    order_id: orderIdNum,
    blueprint_id: Number(order.blueprint_id),
    consumed_count: materialResults.length,
    reservation_ids: materialResults.map((row) => row.reservation_id),
    stock_movement_ids: stockMovementIds,
    materials: materialResults,
  };
}

module.exports = {
  consumeBlueprintMaterialsForProduction,
  BlueprintMaterialConsumptionError,
};
