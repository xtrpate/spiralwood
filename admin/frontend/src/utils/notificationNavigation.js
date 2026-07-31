const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const withQuery = (path, key, value) => {
  if (value === null || value === undefined || value === "") {
    return path;
  }

  const params = new URLSearchParams({
    [key]: String(value),
  });

  return `${path}?${params.toString()}`;
};

const getNotificationDestination = (notification, user) => {
  const role = normalize(user?.role);
  const staffType = normalize(user?.staff_type);
  const targetType = normalize(notification?.target_type);

  const targetId = Number(notification?.target_id) || null;
  const targetOrderId =
    Number(notification?.target_order_id) || targetId || null;

  // Admin
  if (role === "admin") {
    if (
      targetType === "order" ||
      targetType === "custom_request"
    ) {
      return targetOrderId
        ? `/admin/orders/${targetOrderId}`
        : "/admin/orders";
    }

    if (targetType === "blueprint_estimation") {
      return targetId
        ? `/admin/blueprints/${targetId}/estimation`
        : "/admin/blueprints";
    }

    if (targetType === "task") {
      return withQuery(
        "/admin/tasks",
        "focus_task_id",
        targetId,
      );
    }

    if (targetType === "delivery") {
      return withQuery(
        "/admin/delivery",
        "focus_delivery_id",
        targetId,
      );
    }

    if (targetType === "appointment") {
      return withQuery(
        "/admin/appointments",
        "focus_appointment_id",
        targetId,
      );
    }

    return "/admin/dashboard";
  }

  // Delivery rider
  if (role === "staff" && staffType === "delivery_rider") {
    if (targetType === "delivery") {
      return withQuery(
        "/staff/deliveries",
        "focus_delivery_id",
        targetId,
      );
    }

    return "/staff/rider-dashboard";
  }

  // Indoor staff and other staff roles that already use the bell
  if (role === "staff") {
    if (targetType === "task") {
      return withQuery(
        "/staff/tasks",
        "focus_task_id",
        targetId,
      );
    }

    if (targetType === "appointment") {
      return withQuery(
        "/staff/appointment",
        "focus_appointment_id",
        targetId,
      );
    }

    if (targetType === "delivery") {
      return withQuery(
        "/staff/deliveries",
        "focus_delivery_id",
        targetId,
      );
    }

    return "/staff/dashboard";
  }

  return null;
};

const getCustomerNotificationDestination = (notification) => {
  const targetType = normalize(notification?.target_type);
  const targetId = Number(notification?.target_id) || null;
  const targetOrderId =
    Number(notification?.target_order_id) || targetId || null;

  if (targetType === "custom_request") {
    return targetOrderId
      ? `/custom-requests/${targetOrderId}`
      : "/custom-requests";
  }

  if (
    targetType === "order" ||
    targetType === "delivery"
  ) {
    return withQuery(
      "/orders",
      "focus_order_id",
      targetOrderId,
    );
  }

  if (targetType === "appointment") {
    return withQuery(
      "/appointment",
      "focus_appointment_id",
      targetId,
    );
  }

  return "/orders";
};

export {
  getNotificationDestination,
  getCustomerNotificationDestination,
};