const { parseStrictPositiveInt } = require("../utils/validators");

const normalizeProductionTaskRole = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const PRODUCTION_TASK_STEPS = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const PRODUCTION_TASK_KEYS = PRODUCTION_TASK_STEPS.map(
  normalizeProductionTaskRole,
);

const SUPPORTED_PRODUCTION_TASK_STATUSES = new Set([
  "pending",
  "in_progress",
  "blocked",
  "completed",
]);

const ALLOWED_TRANSITIONS = new Map([
  ["pending", new Set(["in_progress"])],
  ["in_progress", new Set(["blocked", "completed"])],
  ["blocked", new Set(["in_progress"])],
  ["completed", new Set()],
]);

class ProductionTaskSequenceError extends Error {
  constructor(code, message, statusCode = 409, details = null) {
    super(message);
    this.name = "ProductionTaskSequenceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const fail = (code, message, statusCode = 409, details = null) => {
  throw new ProductionTaskSequenceError(code, message, statusCode, details);
};

const isRequiredProductionTaskRole = (value) =>
  PRODUCTION_TASK_KEYS.includes(normalizeProductionTaskRole(value));

const getProductionTaskRoleLabel = (value) =>
  PRODUCTION_TASK_STEPS.find(
    (label) =>
      normalizeProductionTaskRole(label) === normalizeProductionTaskRole(value),
  ) || value;

const isProductionReady = (rows) =>
  PRODUCTION_TASK_KEYS.every((key) => {
    const row = rows.find(
      (candidate) => normalizeProductionTaskRole(candidate.task_role) === key,
    );
    return row && normalizeProductionTaskRole(row.status) === "completed";
  });

const assertPacketIntegrity = ({ packetRows, order }) => {
  const requiredRows = packetRows.filter((row) =>
    isRequiredProductionTaskRole(row.task_role),
  );

  const rowsByKey = new Map();

  for (const row of requiredRows) {
    const key = normalizeProductionTaskRole(row.task_role);

    if (rowsByKey.has(key)) {
      fail(
        "PRODUCTION_PACKET_DUPLICATE_STEP",
        `This order's production packet contains more than one ${getProductionTaskRoleLabel(
          key,
        )} step. Manual review is required.`,
      );
    }

    if (Number(row.blueprint_id) !== Number(order.blueprint_id)) {
      fail(
        "PRODUCTION_PACKET_BLUEPRINT_MISMATCH",
        "This order's production packet references an unexpected blueprint. Manual review is required.",
      );
    }

    const status = normalizeProductionTaskRole(row.status);
    if (!SUPPORTED_PRODUCTION_TASK_STATUSES.has(status)) {
      fail(
        "PRODUCTION_PACKET_INVALID_STATUS",
        "This order's production packet contains an unsupported task status.",
      );
    }

    rowsByKey.set(key, row);
  }

  const missingKeys = PRODUCTION_TASK_KEYS.filter((key) => !rowsByKey.has(key));

  if (missingKeys.length > 0 || requiredRows.length !== PRODUCTION_TASK_KEYS.length) {
    fail(
      "PRODUCTION_PACKET_INCOMPLETE",
      "This order does not have a complete five-step production packet.",
      409,
      {
        missing_steps: missingKeys.map(getProductionTaskRoleLabel),
        required_step_count: PRODUCTION_TASK_KEYS.length,
        actual_required_step_count: requiredRows.length,
      },
    );
  }

  let firstNonCompletedSeen = false;

  for (const key of PRODUCTION_TASK_KEYS) {
    const row = rowsByKey.get(key);
    const status = normalizeProductionTaskRole(row.status);

    if (!firstNonCompletedSeen && status === "completed") {
      continue;
    }

    if (!firstNonCompletedSeen) {
      firstNonCompletedSeen = true;
      continue;
    }

    if (status !== "pending") {
      fail(
        "PRODUCTION_SEQUENCE_STATE_INVALID",
        `Production sequence is inconsistent: ${getProductionTaskRoleLabel(
          key,
        )} has already started even though an earlier step is not completed.`,
      );
    }
  }

  return {
    requiredRows,
    rowsByKey,
  };
};

const assertTransitionAllowed = ({
  rowsByKey,
  taskRole,
  currentStatus,
  nextStatus,
  isAdmin = false,
}) => {
  const taskKey = normalizeProductionTaskRole(taskRole);
  const stepIndex = PRODUCTION_TASK_KEYS.indexOf(taskKey);

  if (stepIndex === -1) {
    fail(
      "NOT_REQUIRED_PRODUCTION_TASK",
      "This task is not part of the required production sequence.",
      400,
    );
  }

  for (let index = 0; index < stepIndex; index += 1) {
    const previousKey = PRODUCTION_TASK_KEYS[index];
    const previousRow = rowsByKey.get(previousKey);

    if (
      !previousRow ||
      normalizeProductionTaskRole(previousRow.status) !== "completed"
    ) {
      fail(
        "PRODUCTION_PREVIOUS_STEP_INCOMPLETE",
        `Complete ${getProductionTaskRoleLabel(
          previousKey,
        )} first before starting ${getProductionTaskRoleLabel(taskKey)}.`,
      );
    }
  }

  // Preserve the existing admin-only reset behavior without exposing it to
  // staff. This is not an Undo Done operation; completed steps remain locked.
  if (
    isAdmin &&
    nextStatus === "pending" &&
    ["in_progress", "blocked"].includes(currentStatus)
  ) {
    return;
  }

  const allowedNext = ALLOWED_TRANSITIONS.get(currentStatus);

  if (!allowedNext || !allowedNext.has(nextStatus)) {
    if (nextStatus === "completed") {
      fail(
        "PRODUCTION_INVALID_TRANSITION",
        "Only an in-progress step can be marked as completed.",
      );
    }

    if (nextStatus === "blocked") {
      fail(
        "PRODUCTION_INVALID_TRANSITION",
        "Only an in-progress step can be marked as blocked.",
      );
    }

    if (nextStatus === "in_progress") {
      fail(
        "PRODUCTION_INVALID_TRANSITION",
        "Only a pending or blocked step can be started.",
      );
    }

    fail(
      "PRODUCTION_INVALID_TRANSITION",
      `Production task cannot move from ${currentStatus} to ${nextStatus}.`,
    );
  }
};

async function transitionProductionTask(
  pool,
  {
    taskId,
    expectedOrderId = null,
    actorUserId,
    actorRole,
    nextStatus,
    holdReason = null,
  },
) {
  const parsedTaskId = parseStrictPositiveInt(taskId);
  const parsedExpectedOrderId =
    expectedOrderId === null || expectedOrderId === undefined
      ? null
      : parseStrictPositiveInt(expectedOrderId);
  const parsedActorUserId = parseStrictPositiveInt(actorUserId);
  const normalizedActorRole = normalizeProductionTaskRole(actorRole);
  const normalizedNextStatus = normalizeProductionTaskRole(nextStatus);

  let normalizedHoldReason = null;
  if (normalizedNextStatus === "blocked") {
    if (typeof holdReason !== "string") {
      fail(
        "INVALID_HOLD_REASON",
        "A reason is required before putting production work on hold.",
        400,
      );
    }

    normalizedHoldReason = holdReason.trim();

    if (!normalizedHoldReason) {
      fail(
        "INVALID_HOLD_REASON",
        "A reason is required before putting production work on hold.",
        400,
      );
    }

    if (normalizedHoldReason.length > 500) {
      fail(
        "INVALID_HOLD_REASON",
        "Hold reason must be 500 characters or fewer.",
        400,
      );
    }
  }

  if (!parsedTaskId) {
    fail("INVALID_TASK_ID", "Invalid task ID.", 400);
  }

  if (
    expectedOrderId !== null &&
    expectedOrderId !== undefined &&
    !parsedExpectedOrderId
  ) {
    fail("INVALID_ORDER_ID", "Invalid order ID.", 400);
  }

  if (!parsedActorUserId) {
    fail("INVALID_ACTOR_ID", "Invalid user ID.", 400);
  }

  if (!SUPPORTED_PRODUCTION_TASK_STATUSES.has(normalizedNextStatus)) {
    fail("INVALID_TASK_STATUS", "Invalid task status.", 400);
  }

  const conn = await pool.getConnection();
  let transactionOpen = false;

  try {
    await conn.beginTransaction();
    transactionOpen = true;

    // Non-locking lookup only discovers the owning order. The authoritative
    // task state is re-read after locking the order and full production packet.
    const [[taskReference]] = await conn.query(
      `SELECT id, order_id, task_role
       FROM project_tasks
       WHERE id = ?
       LIMIT 1`,
      [parsedTaskId],
    );

    if (!taskReference) {
      fail("TASK_NOT_FOUND", "Task not found.", 404);
    }

    const orderId = parseStrictPositiveInt(taskReference.order_id);
    if (!orderId) {
      fail(
        "PRODUCTION_TASK_ORDER_MISSING",
        "This production task is not linked to a valid order.",
      );
    }

    if (parsedExpectedOrderId && orderId !== parsedExpectedOrderId) {
      fail("TASK_NOT_FOUND_FOR_ORDER", "Task not found for this order.", 404);
    }

    const [[order]] = await conn.query(
      `SELECT
         id,
         order_number,
         customer_id,
         status,
         order_type,
         blueprint_id,
         fulfillment_method
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );

    if (!order) {
      fail(
        "PRODUCTION_ORDER_NOT_FOUND",
        "The order linked to this production task no longer exists.",
        409,
      );
    }

    if (normalizeProductionTaskRole(order.order_type) !== "blueprint") {
      fail(
        "PRODUCTION_ORDER_TYPE_INVALID",
        "This task does not belong to a blueprint production order.",
      );
    }

    const blueprintId = parseStrictPositiveInt(order.blueprint_id);

    if (!blueprintId) {
      fail(
        "PRODUCTION_BLUEPRINT_MISSING",
        "This production order is not linked to a valid blueprint.",
      );
    }

    // Lock order first, then blueprint, then the full production task packet.
    // This keeps production transitions aligned with the existing assignment
    // lock order while also proving that the canonical blueprint still exists.
    const [[blueprint]] = await conn.query(
      `SELECT id, is_deleted
       FROM blueprints
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [blueprintId],
    );

    if (!blueprint || Number(blueprint.is_deleted) === 1) {
      fail(
        "PRODUCTION_BLUEPRINT_UNAVAILABLE",
        "This production order's linked blueprint is unavailable. Manual review is required.",
      );
    }

    if (normalizeProductionTaskRole(order.status) !== "production") {
      fail(
        "PRODUCTION_ORDER_NOT_ACTIVE",
        "Production tasks can only be changed while the order is in Production.",
      );
    }

    const [packetRows] = await conn.query(
      `SELECT
         id,
         order_id,
         blueprint_id,
         assigned_to,
         assigned_by,
         task_role,
         title,
         status,
         accepted_at,
         completed_at,
         hold_reason,
         blocked_at
       FROM project_tasks
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );

    const { requiredRows, rowsByKey } = assertPacketIntegrity({
      packetRows,
      order,
    });

    const existing = requiredRows.find(
      (row) => Number(row.id) === parsedTaskId,
    );

    if (!existing) {
      fail(
        "TASK_NOT_IN_PRODUCTION_PACKET",
        "This task is not part of the order's required production packet.",
        409,
      );
    }

    const isAdmin = normalizedActorRole === "admin";
    const isOwner = Number(existing.assigned_to) === parsedActorUserId;

    if (!isAdmin && !isOwner) {
      fail(
        "PRODUCTION_TASK_FORBIDDEN",
        "You can only update production tasks assigned to you.",
        403,
      );
    }

    const currentStatus = normalizeProductionTaskRole(existing.status);

    if (currentStatus === normalizedNextStatus) {
      await conn.commit();
      transactionOpen = false;

      return {
        no_change: true,
        task_id: parsedTaskId,
        order_id: orderId,
        order_number: order.order_number,
        customer_id: order.customer_id,
        assigned_to: existing.assigned_to,
        assigned_by: existing.assigned_by,
        task_role: existing.task_role,
        title: existing.title,
        previous_status: currentStatus,
        status: currentStatus,
        accepted_at: existing.accepted_at || null,
        completed_at: existing.completed_at || null,
        hold_reason: existing.hold_reason || null,
        blocked_at: existing.blocked_at || null,
        fulfillment_method: order.fulfillment_method,
        production_ready: isProductionReady(requiredRows),
        order_status_changed: false,
        previous_order_status: order.status,
        order_status: order.status,
      };
    }

    assertTransitionAllowed({
      rowsByKey,
      taskRole: existing.task_role,
      currentStatus,
      nextStatus: normalizedNextStatus,
      isAdmin,
    });

    const wasProductionReady = isProductionReady(requiredRows);

    let acceptedAt = existing.accepted_at || null;
    let completedAt = existing.completed_at || null;
    let nextHoldReason = null;
    let blockedAt = null;

    if (!acceptedAt && normalizedNextStatus === "in_progress") {
      acceptedAt = new Date();
    }

    if (normalizedNextStatus === "completed") {
      completedAt = new Date();
    } else {
      completedAt = null;
    }

    if (normalizedNextStatus === "blocked") {
      nextHoldReason = normalizedHoldReason;
      blockedAt = new Date();
    }

    const [updateResult] = await conn.query(
      `UPDATE project_tasks
       SET
         status = ?,
         completed_at = ?,
         accepted_at = ?,
         hold_reason = ?,
         blocked_at = ?,
         is_read = 1,
         updated_at = NOW()
       WHERE id = ?
         AND status = ?
         AND assigned_to = ?`,
      [
        normalizedNextStatus,
        completedAt,
        acceptedAt,
        nextHoldReason,
        blockedAt,
        parsedTaskId,
        existing.status,
        existing.assigned_to,
      ],
    );

    if (updateResult.affectedRows !== 1) {
      fail(
        "PRODUCTION_TASK_CHANGED",
        "Task status or assignment changed before this update was completed. Refresh and try again.",
      );
    }

    const afterRows = requiredRows.map((row) =>
      Number(row.id) === parsedTaskId
        ? {
            ...row,
            status: normalizedNextStatus,
            accepted_at: acceptedAt,
            completed_at: completedAt,
            hold_reason: nextHoldReason,
            blocked_at: blockedAt,
          }
        : row,
    );

    // A valid transition must also leave the packet in a coherent sequence.
    assertPacketIntegrity({
      packetRows: [
        ...packetRows.filter(
          (row) => !isRequiredProductionTaskRole(row.task_role),
        ),
        ...afterRows,
      ],
      order,
    });

    const isProductionReadyAfter = isProductionReady(afterRows);
    const becameProductionReady =
      !wasProductionReady && isProductionReadyAfter;

    const isPickupOrder =
      normalizeProductionTaskRole(order.fulfillment_method || "delivery") ===
      "pickup";

    let orderStatusChanged = false;
    let nextOrderStatus = order.status;

    if (becameProductionReady && isPickupOrder) {
      const [orderUpdateResult] = await conn.query(
        `UPDATE orders
         SET status = 'ready_for_pickup',
             updated_at = NOW()
         WHERE id = ?
           AND status = 'production'
           AND order_type = 'blueprint'
           AND COALESCE(
             NULLIF(LOWER(TRIM(fulfillment_method)), ''),
             'delivery'
           ) = 'pickup'`,
        [orderId],
      );

      if (orderUpdateResult.affectedRows !== 1) {
        fail(
          "PRODUCTION_FINALIZATION_FAILED",
          "The pickup order changed before production could be finalized. No production changes were saved.",
        );
      }

      orderStatusChanged = true;
      nextOrderStatus = "ready_for_pickup";
    }

    await conn.commit();
    transactionOpen = false;

    return {
      no_change: false,
      task_id: parsedTaskId,
      order_id: orderId,
      order_number: order.order_number,
      customer_id: order.customer_id,
      assigned_to: existing.assigned_to,
      assigned_by: existing.assigned_by,
      task_role: existing.task_role,
      title: existing.title,
      previous_status: currentStatus,
      status: normalizedNextStatus,
      previous_accepted_at: existing.accepted_at || null,
      previous_completed_at: existing.completed_at || null,
      previous_hold_reason: existing.hold_reason || null,
      previous_blocked_at: existing.blocked_at || null,
      accepted_at: acceptedAt,
      completed_at: completedAt,
      hold_reason: nextHoldReason,
      blocked_at: blockedAt,
      fulfillment_method: order.fulfillment_method,
      production_ready: becameProductionReady,
      production_ready_after: isProductionReadyAfter,
      order_status_changed: orderStatusChanged,
      previous_order_status: order.status,
      order_status: nextOrderStatus,
    };
  } catch (error) {
    if (transactionOpen) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "[productionTaskSequenceService] rollback failed:",
          rollbackError.message,
        );
      }
    }

    throw error;
  } finally {
    conn.release();
  }
}


async function undoProductionTaskCompletion(
  pool,
  { taskId, actorUserId, actorRole, undoReason },
) {
  const parsedTaskId = parseStrictPositiveInt(taskId);
  const parsedActorUserId = parseStrictPositiveInt(actorUserId);
  const normalizedActorRole = normalizeProductionTaskRole(actorRole);

  if (!parsedTaskId) {
    fail("INVALID_TASK_ID", "Invalid task ID.", 400);
  }

  if (!parsedActorUserId) {
    fail("INVALID_ACTOR_ID", "Invalid user ID.", 400);
  }

  if (typeof undoReason !== "string" || !undoReason.trim()) {
    fail(
      "INVALID_UNDO_REASON",
      "A reason is required before reopening a completed production step.",
      400,
    );
  }

  const normalizedUndoReason = undoReason.trim();

  if (normalizedUndoReason.length > 500) {
    fail(
      "INVALID_UNDO_REASON",
      "Undo reason must be 500 characters or fewer.",
      400,
    );
  }

  const conn = await pool.getConnection();
  let transactionOpen = false;

  try {
    await conn.beginTransaction();
    transactionOpen = true;

    const [[taskReference]] = await conn.query(
      `SELECT id, order_id
       FROM project_tasks
       WHERE id = ?
       LIMIT 1`,
      [parsedTaskId],
    );

    if (!taskReference) {
      fail("TASK_NOT_FOUND", "Task not found.", 404);
    }

    const orderId = parseStrictPositiveInt(taskReference.order_id);

    if (!orderId) {
      fail(
        "PRODUCTION_TASK_ORDER_MISSING",
        "This production task is not linked to a valid order.",
      );
    }

    const [[order]] = await conn.query(
      `SELECT
         id,
         order_number,
         customer_id,
         status,
         order_type,
         blueprint_id,
         fulfillment_method
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );

    if (!order) {
      fail(
        "PRODUCTION_ORDER_NOT_FOUND",
        "The order linked to this production task no longer exists.",
      );
    }

    if (normalizeProductionTaskRole(order.order_type) !== "blueprint") {
      fail(
        "PRODUCTION_ORDER_TYPE_INVALID",
        "This task does not belong to a blueprint production order.",
      );
    }

    const blueprintId = parseStrictPositiveInt(order.blueprint_id);

    if (!blueprintId) {
      fail(
        "PRODUCTION_BLUEPRINT_MISSING",
        "This production order is not linked to a valid blueprint.",
      );
    }

    const [[blueprint]] = await conn.query(
      `SELECT id, is_deleted
       FROM blueprints
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [blueprintId],
    );

    if (!blueprint || Number(blueprint.is_deleted) === 1) {
      fail(
        "PRODUCTION_BLUEPRINT_UNAVAILABLE",
        "This production order's linked blueprint is unavailable. Manual review is required.",
      );
    }

    const [packetRows] = await conn.query(
      `SELECT
         id,
         order_id,
         blueprint_id,
         assigned_to,
         assigned_by,
         task_role,
         title,
         status,
         accepted_at,
         completed_at,
         hold_reason,
         blocked_at
       FROM project_tasks
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );

    const { requiredRows, rowsByKey } = assertPacketIntegrity({
      packetRows,
      order,
    });

    const existing = requiredRows.find(
      (row) => Number(row.id) === parsedTaskId,
    );

    if (!existing) {
      fail(
        "TASK_NOT_IN_PRODUCTION_PACKET",
        "This task is not part of the order's required production packet.",
      );
    }

    const isAdmin = normalizedActorRole === "admin";
    const isOwner = Number(existing.assigned_to) === parsedActorUserId;

    if (!isAdmin && !isOwner) {
      fail(
        "PRODUCTION_TASK_FORBIDDEN",
        "You can only reopen production tasks assigned to you.",
        403,
      );
    }

    if (normalizeProductionTaskRole(existing.status) !== "completed") {
      fail(
        "PRODUCTION_UNDO_REQUIRES_COMPLETED",
        "Only a completed production step can be reopened.",
      );
    }

    const taskKey = normalizeProductionTaskRole(existing.task_role);
    const currentStepIndex = PRODUCTION_TASK_KEYS.indexOf(taskKey);

    if (currentStepIndex === -1) {
      fail(
        "NOT_REQUIRED_PRODUCTION_TASK",
        "Only required production steps support Undo Done.",
        400,
      );
    }

    const isPacking = taskKey === normalizeProductionTaskRole("Packing");
    const isPickupOrder =
      normalizeProductionTaskRole(order.fulfillment_method || "delivery") ===
      "pickup";
    const orderStatus = normalizeProductionTaskRole(order.status);
    const canRollbackPickupReady =
      isPacking && isPickupOrder && orderStatus === "ready_for_pickup";

    if (orderStatus !== "production" && !canRollbackPickupReady) {
      fail(
        "PRODUCTION_UNDO_ORDER_NOT_ACTIVE",
        "This production step can no longer be reopened because the order has already moved beyond Production.",
      );
    }

    for (
      let index = currentStepIndex + 1;
      index < PRODUCTION_TASK_KEYS.length;
      index += 1
    ) {
      const laterKey = PRODUCTION_TASK_KEYS[index];
      const laterRow = rowsByKey.get(laterKey);

      if (
        !laterRow ||
        normalizeProductionTaskRole(laterRow.status) !== "pending"
      ) {
        fail(
          "PRODUCTION_UNDO_LATER_STEP_STARTED",
          `Cannot reopen ${existing.task_role || existing.title} because ${getProductionTaskRoleLabel(
            laterKey,
          )} has already started.`,
        );
      }
    }

    if (isPacking) {
      // Do not lock delivery rows here. Delivery status/reassignment flows
      // lock delivery -> order, while production locks order first. The order
      // lock already serializes delivery creation, and this plain existence
      // check avoids introducing the reverse lock order / deadlock cycle.
      const [[deliveryAttempt]] = await conn.query(
        `SELECT id, status
         FROM deliveries
         WHERE order_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [orderId],
      );

      if (deliveryAttempt) {
        fail(
          "PRODUCTION_UNDO_DELIVERY_EXISTS",
          "Packing can no longer be reopened because a delivery attempt already exists for this order.",
        );
      }
    }

    const [updateResult] = await conn.query(
      `UPDATE project_tasks
       SET
         status = 'in_progress',
         completed_at = NULL,
         hold_reason = NULL,
         blocked_at = NULL,
         is_read = 1,
         updated_at = NOW()
       WHERE id = ?
         AND status = 'completed'
         AND assigned_to = ?`,
      [parsedTaskId, existing.assigned_to],
    );

    if (updateResult.affectedRows !== 1) {
      fail(
        "PRODUCTION_TASK_CHANGED",
        "The production step changed before Undo Done was applied. Refresh and try again.",
      );
    }

    let orderStatusChanged = false;
    let nextOrderStatus = order.status;

    if (canRollbackPickupReady) {
      const [orderUpdateResult] = await conn.query(
        `UPDATE orders
         SET status = 'production',
             updated_at = NOW()
         WHERE id = ?
           AND status = 'ready_for_pickup'
           AND order_type = 'blueprint'
           AND COALESCE(
             NULLIF(LOWER(TRIM(fulfillment_method)), ''),
             'delivery'
           ) = 'pickup'`,
        [orderId],
      );

      if (orderUpdateResult.affectedRows !== 1) {
        fail(
          "PRODUCTION_UNDO_PICKUP_ROLLBACK_FAILED",
          "The pickup order changed before production could be reopened. No changes were saved.",
        );
      }

      orderStatusChanged = true;
      nextOrderStatus = "production";
    }

    await conn.commit();
    transactionOpen = false;

    return {
      task_id: parsedTaskId,
      order_id: orderId,
      order_number: order.order_number,
      customer_id: order.customer_id,
      assigned_to: existing.assigned_to,
      assigned_by: existing.assigned_by,
      task_role: existing.task_role,
      title: existing.title,
      previous_status: "completed",
      status: "in_progress",
      accepted_at: existing.accepted_at || null,
      previous_completed_at: existing.completed_at || null,
      completed_at: null,
      previous_hold_reason: existing.hold_reason || null,
      hold_reason: null,
      previous_blocked_at: existing.blocked_at || null,
      blocked_at: null,
      undo_reason: normalizedUndoReason,
      fulfillment_method: order.fulfillment_method,
      production_ready: false,
      production_ready_after: false,
      order_status_changed: orderStatusChanged,
      previous_order_status: order.status,
      order_status: nextOrderStatus,
    };
  } catch (error) {
    if (transactionOpen) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "[productionTaskSequenceService undo] rollback failed:",
          rollbackError.message,
        );
      }
    }

    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  PRODUCTION_TASK_STEPS,
  PRODUCTION_TASK_KEYS,
  ProductionTaskSequenceError,
  normalizeProductionTaskRole,
  isRequiredProductionTaskRole,
  getProductionTaskRoleLabel,
  transitionProductionTask,
  undoProductionTaskCompletion,
};
