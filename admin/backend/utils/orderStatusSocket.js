const emitOrderStatusUpdate = (
  io,
  { orderId, orderNumber = null, status, customerId = null } = {},
) => {
  if (!io) return;

  const payload = {
    order_id: Number(orderId),
    order_number: orderNumber || `#${orderId}`,
    status,
    updated_at: new Date().toISOString(),
  };

  try {
    if (customerId) {
      io.to(`user:${customerId}`).emit("order:status_updated", payload);
    }

    io.to("staff-updates").emit("order:status_updated", payload);

    console.log("[SOCKET EMIT] Sending order status:", payload);
  } catch (socketErr) {
    console.error(
      "[ORDER STATUS SOCKET EMIT]",
      socketErr?.message || socketErr,
    );
  }
};

const emitOrderCreated = (
  io,
  {
    orderId,
    orderNumber = null,
    status = null,
    orderType = null,
    customerId = null,
  } = {},
) => {
  if (!io) return;

  const payload = {
    order_id: Number(orderId),
    order_number: orderNumber || `#${orderId}`,
    status,
    order_type: orderType,
    customer_id: customerId ? Number(customerId) : null,
    created_at: new Date().toISOString(),
  };

  try {
    io.to("staff-updates").emit("order:created", payload);

    console.log("[SOCKET EMIT] Sending new order:", payload);
  } catch (socketErr) {
    console.error(
      "[ORDER CREATED SOCKET EMIT]",
      socketErr?.message || socketErr,
    );
  }
};

const emitOrderPaymentUpdate = (
  io,
  {
    orderId,
    orderNumber = null,
    paymentStatus,
    paymentMethod = null,
    paymentTransactionId = null,
    customerId = null,
  } = {},
) => {
  if (!io) return;

  const payload = {
    order_id: Number(orderId),
    order_number: orderNumber || `#${orderId}`,
    payment_status: paymentStatus,
    payment_method: paymentMethod || null,
    payment_transaction_id: paymentTransactionId
      ? Number(paymentTransactionId)
      : null,
    updated_at: new Date().toISOString(),
  };

  try {
    if (customerId) {
      io.to(`user:${customerId}`).emit("order:payment_updated", payload);
    }

    io.to("staff-updates").emit("order:payment_updated", payload);

    console.log("[SOCKET EMIT] Sending order payment update:", payload);
  } catch (socketErr) {
    console.error(
      "[ORDER PAYMENT SOCKET EMIT]",
      socketErr?.message || socketErr,
    );
  }
};

const emitDeliveryUpdate = (
  io,
  {
    deliveryId,
    orderId,
    orderNumber = null,
    status = null,
    driverId = null,
    scheduledDate = null,
    customerId = null,
    changeType = "updated",
    orderStatusChanged = false,
    notifyCustomer = true,
    notifyDriver = false,
  } = {},
) => {
  if (!io) return;

  const payload = {
    delivery_id: Number(deliveryId),
    order_id: Number(orderId),
    order_number: orderNumber || `#${orderId}`,
    status: status || null,
    driver_id: driverId ? Number(driverId) : null,
    scheduled_date: scheduledDate || null,
    change_type: changeType,
    order_status_changed: Boolean(orderStatusChanged),
    updated_at: new Date().toISOString(),
  };

  try {
    io.to("staff-updates").emit("delivery:updated", payload);

    if (customerId && notifyCustomer) {
      io.to(`user:${customerId}`).emit("delivery:updated", payload);
    }

    if (driverId && notifyDriver) {
      io.to(`user:${driverId}`).emit("delivery:updated", payload);
    }

    console.log("[SOCKET EMIT] Sending delivery update:", payload);
  } catch (socketErr) {
    console.error("[DELIVERY SOCKET EMIT]", socketErr?.message || socketErr);
  }
};

const emitTaskUpdate = (
  io,
  {
    taskId = null,
    taskIds = [],
    orderId = null,
    orderNumber = null,
    taskRole = null,
    status = null,
    assignedTo = null,
    previousAssigneeIds = [],
    changeType = "updated",
    productionReady = false,
    orderStatusChanged = false,
  } = {},
) => {
  if (!io) return;

  const normalizedTaskIds = [
    ...new Set(
      [...(Array.isArray(taskIds) ? taskIds : []), taskId]
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ];

  const normalizedPreviousAssigneeIds = [
    ...new Set(
      (Array.isArray(previousAssigneeIds) ? previousAssigneeIds : [])
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ];

  const payload = {
    task_id: normalizedTaskIds[0] || null,
    task_ids: normalizedTaskIds,
    order_id: Number(orderId) || null,
    order_number: orderNumber || (orderId ? `#${orderId}` : null),
    task_role: taskRole || null,
    status: status || null,
    assigned_to: assignedTo ? Number(assignedTo) : null,
    previous_assignee_ids: normalizedPreviousAssigneeIds,
    change_type: changeType,
    production_ready: Boolean(productionReady),
    order_status_changed: Boolean(orderStatusChanged),
    updated_at: new Date().toISOString(),
  };

  try {
    io.to("staff-updates").emit("task:updated", payload);

    const recipientIds = [assignedTo, ...normalizedPreviousAssigneeIds]
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0);

    for (const recipientId of new Set(recipientIds)) {
      io.to(`user:${recipientId}`).emit("task:updated", payload);
    }

    console.log("[SOCKET EMIT] Sending task update:", payload);
  } catch (socketErr) {
    console.error("[TASK SOCKET EMIT]", socketErr?.message || socketErr);
  }
};

const emitBlueprintUpdate = (
  io,
  {
    blueprintId,
    orderId = null,
    orderNumber = null,
    customerId = null,
    changeType = "updated",
    notifyCustomer = false,
  } = {},
) => {
  if (!io) return;

  const payload = {
    blueprint_id: Number(blueprintId) || null,
    order_id: Number(orderId) || null,
    order_number: orderNumber || (orderId ? `#${orderId}` : null),
    change_type: changeType,
    updated_at: new Date().toISOString(),
  };

  try {
    io.to("staff-updates").emit("blueprint:updated", payload);

    if (customerId && notifyCustomer) {
      io.to(`user:${customerId}`).emit("blueprint:updated", payload);
    }

    console.log("[SOCKET EMIT] Sending blueprint update:", payload);
  } catch (socketErr) {
    console.error("[BLUEPRINT SOCKET EMIT]", socketErr?.message || socketErr);
  }
};

const emitDiscussionMessage = (io, { orderId, discussionMessage } = {}) => {
  if (!io || !discussionMessage) return;

  try {
    io.to(`discussion:order:${orderId}`).emit(
      "discussion:message",
      discussionMessage,
    );

    console.log("[SOCKET EMIT] Sending discussion message:", {
      order_id: Number(orderId),
      message_id: discussionMessage?.id || null,
    });
  } catch (socketErr) {
    console.error("[DISCUSSION SOCKET EMIT]", socketErr?.message || socketErr);
  }
};

const emitDeliveryAssigned = ({
  io,
  deliveryId,
  orderId,
  orderNumber,
  driverId,
  scheduledDate,
  status = "scheduled",
}) => {
  if (!io || !driverId) return;

  try {
    const payload = {
      delivery_id: Number(deliveryId),
      order_id: Number(orderId),
      order_number: orderNumber || `#${orderId}`,
      driver_id: Number(driverId),
      status,
      scheduled_date: scheduledDate || null,
    };

    io.to(`user:${driverId}`).emit("delivery:assigned", payload);

    console.log("[SOCKET EMIT] Delivery assigned:", payload);
  } catch (socketErr) {
    console.error(
      "[DELIVERY ASSIGNMENT SOCKET EMIT]",
      socketErr?.message || socketErr,
    );
  }
};

const emitDeliveryUnassigned = ({
  io,
  deliveryId,
  orderId,
  orderNumber,
  previousDriverId,
  newDriverId,
  scheduledDate,
}) => {
  if (!io || !previousDriverId) return;

  try {
    const payload = {
      delivery_id: Number(deliveryId),
      order_id: Number(orderId),
      order_number: orderNumber || `#${orderId}`,
      previous_driver_id: Number(previousDriverId),
      new_driver_id: Number(newDriverId),
      status: "scheduled",
      scheduled_date: scheduledDate || null,
    };

    io.to(`user:${previousDriverId}`).emit("delivery:unassigned", payload);

    console.log("[SOCKET EMIT] Delivery unassigned:", payload);
  } catch (socketErr) {
    console.error(
      "[DELIVERY UNASSIGNMENT SOCKET EMIT]",
      socketErr?.message || socketErr,
    );
  }
};

module.exports = {
  emitOrderStatusUpdate,
  emitOrderCreated,
  emitOrderPaymentUpdate,
  emitDeliveryUpdate,
  emitTaskUpdate,
  emitBlueprintUpdate,
  emitDiscussionMessage,
  emitDeliveryAssigned,
  emitDeliveryUnassigned,
};
