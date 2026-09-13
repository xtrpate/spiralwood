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

module.exports = {
  emitOrderStatusUpdate,
};
