// services/blueprintMaterialReleaseService.js
//
// BPI-5 centralized, transaction-bound release of blueprint material
// reservations when an order is cancelled.
//
// CONTRACT WITH CALLERS:
//   - Accepts an already-open, already-transactional mysql2 connection.
//   - Never begins, commits, rolls back, or releases a transaction.
//   - The caller must cancel the order in the SAME transaction.
//   - Only reserved and pending_stock rows are released.
//   - Consumed rows are never returned to physical stock by this service.
//   - No raw_materials quantity or stock_movements row is changed/created.
//   - Repeated calls are idempotent after every reservation is released or
//     consumed.

const normalize = (value) => String(value || "").trim().toLowerCase();

class BlueprintMaterialReleaseError extends Error {
  constructor(code, message, statusCode = 409, details = null) {
    super(message);
    this.name = "BlueprintMaterialReleaseError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const fail = (code, message, statusCode = 409, details = null) => {
  throw new BlueprintMaterialReleaseError(
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

const sanitizeReleaseReason = (value, fallback) => {
  const reason = String(value || "").trim() || fallback;
  return reason.slice(0, 255);
};

const buildMovementReference = (reservationId) =>
  `BLUEPRINT-RESERVATION-${reservationId}`;

async function releaseBlueprintMaterialsForCancellation(
  conn,
  { orderId, actorUserId, releaseReason } = {},
) {
  const orderIdNum = Number(orderId);
  const actorUserIdNum = Number(actorUserId);

  if (!conn || typeof conn.query !== "function") {
    fail(
      "INVALID_CONNECTION",
      "A transactional database connection is required for material release.",
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

  // Lock the canonical order first. This matches the lock order used by BPI-3
  // and BPI-4 and serializes cancellation against reservation/consumption.
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
      "Material release is only allowed for blueprint orders.",
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
  const allowedStatuses = new Set([
    "pending",
    "confirmed",
    "contract_released",
    "production",
    "cancelled",
  ]);

  if (!allowedStatuses.has(orderStatus)) {
    fail(
      "ORDER_NOT_CANCELLABLE",
      `Order status "${order.status}" does not allow blueprint material release.`,
      400,
    );
  }

  const [reservationRows] = await conn.query(
    `SELECT id, order_id, blueprint_id, estimation_id, material_id,
            material_name_snapshot, unit_snapshot, quantity, status,
            issue_code, issue_note, reserved_at,
            released_by, released_at, release_reason,
            consumed_by, consumed_at
     FROM blueprint_material_reservations
     WHERE order_id = ?
     ORDER BY material_id, id
     FOR UPDATE`,
    [orderIdNum],
  );

  if (reservationRows.length === 0) {
    return {
      triggered: false,
      reason: "NO_RESERVATIONS",
      order_id: orderIdNum,
      blueprint_id: Number(order.blueprint_id),
      released_count: 0,
      reservation_ids: [],
      materials: [],
    };
  }

  for (const reservation of reservationRows) {
    if (!isPositiveInt(reservation.id)) {
      fail(
        "INVALID_RESERVATION_ID",
        "One or more blueprint material reservations have an invalid ID.",
      );
    }
    if (Number(reservation.order_id) !== orderIdNum) {
      fail(
        "RESERVATION_ORDER_MISMATCH",
        `Reservation ${reservation.id} does not belong to this order.`,
      );
    }
    if (Number(reservation.blueprint_id) !== Number(order.blueprint_id)) {
      fail(
        "RESERVATION_BLUEPRINT_MISMATCH",
        `Reservation ${reservation.id} does not belong to the order's canonical blueprint.`,
      );
    }
    if (!isPositiveInt(reservation.material_id)) {
      fail(
        "INVALID_MATERIAL_LINK",
        `Reservation ${reservation.id} has an invalid raw material link.`,
      );
    }
  }

  const supportedStatuses = new Set([
    "pending_stock",
    "reserved",
    "released",
    "consumed",
  ]);
  const invalidRows = reservationRows.filter(
    (row) => !supportedStatuses.has(normalize(row.status)),
  );

  if (invalidRows.length > 0) {
    fail(
      "INVALID_RESERVATION_STATUS",
      "One or more blueprint material reservations have an unsupported status.",
      409,
      {
        reservations: invalidRows.map((row) => ({
          reservation_id: row.id,
          status: row.status,
        })),
      },
    );
  }

  const activeRows = reservationRows.filter((row) =>
    ["pending_stock", "reserved"].includes(normalize(row.status)),
  );
  const releasedRows = reservationRows.filter(
    (row) => normalize(row.status) === "released",
  );
  const consumedRows = reservationRows.filter(
    (row) => normalize(row.status) === "consumed",
  );

  // Any mixture of active and terminal states means a previous operation only
  // affected part of the reservation set. Releasing the remainder would hide
  // a possible physical-stock discrepancy, so cancellation must stop for
  // manual review.
  if (
    (activeRows.length > 0 &&
      (releasedRows.length > 0 || consumedRows.length > 0)) ||
    (releasedRows.length > 0 && consumedRows.length > 0)
  ) {
    fail(
      "MIXED_RESERVATION_STATE",
      "This order has a mixed blueprint material reservation state and requires manual review before cancellation.",
      409,
      {
        pending_or_reserved: activeRows.map((row) => row.id),
        released: releasedRows.map((row) => row.id),
        consumed: consumedRows.map((row) => row.id),
      },
    );
  }

  if (releasedRows.length === reservationRows.length) {
    return {
      triggered: false,
      reason: "ALREADY_RELEASED",
      order_id: orderIdNum,
      blueprint_id: Number(order.blueprint_id),
      released_count: releasedRows.length,
      reservation_ids: releasedRows.map((row) => row.id),
      materials: releasedRows.map((row) => ({
        reservation_id: row.id,
        material_id: row.material_id,
        material_name: row.material_name_snapshot,
        unit: row.unit_snapshot,
        quantity: Number(row.quantity),
        status: "released",
        released_by: row.released_by,
        released_at: row.released_at,
        release_reason: row.release_reason,
      })),
    };
  }

  // Cancellation after production does not restore raw materials. BPI-4 has
  // already deducted them and marked the complete set consumed.
  if (consumedRows.length === reservationRows.length) {
    return {
      triggered: false,
      reason: "ALREADY_CONSUMED",
      order_id: orderIdNum,
      blueprint_id: Number(order.blueprint_id),
      released_count: 0,
      reservation_ids: consumedRows.map((row) => row.id),
      materials: consumedRows.map((row) => ({
        reservation_id: row.id,
        material_id: row.material_id,
        material_name: row.material_name_snapshot,
        unit: row.unit_snapshot,
        quantity: Number(row.quantity),
        status: "consumed",
      })),
    };
  }

  if (activeRows.length !== reservationRows.length) {
    fail(
      "RESERVATIONS_NOT_RELEASABLE",
      "All blueprint material reservations must be reserved or pending stock before they can be released.",
    );
  }

  if (orderStatus === "production") {
    fail(
      "PRODUCTION_RESERVATIONS_NOT_CONSUMED",
      "This production order still has unconsumed material reservations and requires manual review before cancellation.",
    );
  }

  // A stock-out movement linked to an active reservation means physical stock
  // may already have been deducted while the reservation status was not
  // finalized. Do not release such rows because that would falsely make the
  // material available again.
  const movementReferences = activeRows.map((row) =>
    buildMovementReference(row.id),
  );
  const movementPlaceholders = movementReferences.map(() => "?").join(",");
  const [existingMovementRows] = await conn.query(
    `SELECT id, material_id, order_id, quantity, reference
     FROM stock_movements
     WHERE order_id = ?
       AND type = 'out'
       AND reference IN (${movementPlaceholders})
     ORDER BY id
     FOR UPDATE`,
    [orderIdNum, ...movementReferences],
  );

  if (existingMovementRows.length > 0) {
    fail(
      "ACTIVE_RESERVATION_HAS_CONSUMPTION_MOVEMENT",
      "A production stock movement already exists for a reservation that is not marked consumed. Manual review is required.",
      409,
      {
        stock_movement_ids: existingMovementRows.map((row) => row.id),
        references: existingMovementRows.map((row) => row.reference),
      },
    );
  }

  const effectiveReleaseReason = sanitizeReleaseReason(
    releaseReason,
    `Order ${order.order_number || `#${orderIdNum}`} cancelled before material consumption.`,
  );
  const activeReservationIds = activeRows.map((row) => Number(row.id));
  const updatePlaceholders = activeReservationIds.map(() => "?").join(",");

  const [releaseResult] = await conn.query(
    `UPDATE blueprint_material_reservations
     SET status = 'released',
         issue_code = NULL,
         issue_note = NULL,
         released_by = ?,
         released_at = NOW(),
         release_reason = ?
     WHERE order_id = ?
       AND id IN (${updatePlaceholders})
       AND status IN ('pending_stock', 'reserved')`,
    [
      actorUserIdNum,
      effectiveReleaseReason,
      orderIdNum,
      ...activeReservationIds,
    ],
  );

  if (releaseResult.affectedRows !== activeRows.length) {
    fail(
      "RESERVATION_RELEASE_CONFLICT",
      "The blueprint material reservations changed before cancellation could release them. Please refresh and try again.",
    );
  }

  return {
    triggered: true,
    reason: "RELEASED_FOR_CANCELLATION",
    order_id: orderIdNum,
    blueprint_id: Number(order.blueprint_id),
    released_count: activeRows.length,
    reservation_ids: activeReservationIds,
    release_reason: effectiveReleaseReason,
    materials: activeRows.map((row) => ({
      reservation_id: row.id,
      material_id: row.material_id,
      material_name: row.material_name_snapshot,
      unit: row.unit_snapshot,
      quantity: Number(row.quantity),
      previous_status: normalize(row.status),
      status: "released",
    })),
  };
}

module.exports = {
  releaseBlueprintMaterialsForCancellation,
  BlueprintMaterialReleaseError,
};
