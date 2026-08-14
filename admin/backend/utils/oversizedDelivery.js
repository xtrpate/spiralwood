const STANDARD_TRUCK_SETTING_KEYS = {
  width: "standard_truck_limit_width_mm",
  height: "standard_truck_limit_height_mm",
  depth: "standard_truck_limit_depth_mm",
};

const parseJsonSafe = (value, fallback = {}) => {
  try {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
};

const toPositiveMm = (value) => {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? Math.round(number)
    : null;
};

const normalizeDimensions = (source = {}) => ({
  width_mm: toPositiveMm(source.width_mm ?? source.width ?? source.w),
  height_mm: toPositiveMm(source.height_mm ?? source.height ?? source.h),
  depth_mm: toPositiveMm(source.depth_mm ?? source.depth ?? source.d),
});

const toPositiveQuantity = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 1;
};

// WISDOM SAME-DESIGN DELIVERY CAPACITY V1.0.0
// Conservative estimate: identical furniture stays upright and is not stacked.
// We check both width/depth orientations against the truck floor.
const estimateUprightFloorCapacity = (dimensions = {}, limits = {}) => {
  const item = normalizeDimensions(dimensions);

  if (
    !limits?.configured ||
    !item.width_mm ||
    !item.height_mm ||
    !item.depth_mm ||
    !limits.width_mm ||
    !limits.height_mm ||
    !limits.depth_mm
  ) {
    return null;
  }

  if (
    item.width_mm > limits.width_mm ||
    item.height_mm > limits.height_mm ||
    item.depth_mm > limits.depth_mm
  ) {
    return 0;
  }

  const normalOrientation =
    Math.floor(limits.width_mm / item.width_mm) *
    Math.floor(limits.depth_mm / item.depth_mm);

  const rotatedOrientation =
    Math.floor(limits.width_mm / item.depth_mm) *
    Math.floor(limits.depth_mm / item.width_mm);

  return Math.max(1, normalOrientation, rotatedOrientation);
};

const computeBoundsFromComponents = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const normalized = items
    .map((item) => ({
      x: Number(item?.x ?? item?.position_x ?? 0) || 0,
      y: Number(item?.y ?? item?.position_y ?? 0) || 0,
      z: Number(item?.z ?? item?.position_z ?? 0) || 0,

      width: toPositiveMm(
        item?.width ?? item?.w ?? item?.width_mm,
      ),

      height: toPositiveMm(
        item?.height ?? item?.h ?? item?.height_mm,
      ),

      depth: toPositiveMm(
        item?.depth ?? item?.d ?? item?.depth_mm,
      ),
    }))
    .filter(
      (item) =>
        item.width !== null &&
        item.height !== null &&
        item.depth !== null,
    );

  if (normalized.length === 0) {
    return null;
  }

  const minX = Math.min(...normalized.map((item) => item.x));
  const minY = Math.min(...normalized.map((item) => item.y));
  const minZ = Math.min(...normalized.map((item) => item.z));

  const maxX = Math.max(
    ...normalized.map((item) => item.x + item.width),
  );

  const maxY = Math.max(
    ...normalized.map((item) => item.y + item.height),
  );

  const maxZ = Math.max(
    ...normalized.map((item) => item.z + item.depth),
  );

  return {
    width_mm: Math.max(1, Math.round(maxX - minX)),
    height_mm: Math.max(1, Math.round(maxY - minY)),
    depth_mm: Math.max(1, Math.round(maxZ - minZ)),
  };
};

const resolveItemDimensions = (item = {}) => {
  const editorSnapshot =
    item?.editor_snapshot &&
    typeof item.editor_snapshot === "object" &&
    !Array.isArray(item.editor_snapshot)
      ? item.editor_snapshot
      : {};

  return (
    computeBoundsFromComponents(editorSnapshot.components) ||
    normalizeDimensions(item)
  );
};

async function getStandardTruckLimits(conn) {
  const keys = Object.values(STANDARD_TRUCK_SETTING_KEYS);
  const placeholders = keys.map(() => "?").join(",");

  const [rows] = await conn.query(
    `SELECT
       content_key,
       content
     FROM website_content
     WHERE content_type = 'setting'
       AND content_key IN (${placeholders})`,
    keys,
  );

  const values = new Map(
    rows.map((row) => [
      String(row.content_key || ""),
      row.content,
    ]),
  );

  const limits = {
    width_mm: toPositiveMm(
      values.get(STANDARD_TRUCK_SETTING_KEYS.width),
    ),

    height_mm: toPositiveMm(
      values.get(STANDARD_TRUCK_SETTING_KEYS.height),
    ),

    depth_mm: toPositiveMm(
      values.get(STANDARD_TRUCK_SETTING_KEYS.depth),
    ),
  };

  return {
    ...limits,

    configured: Boolean(
      limits.width_mm &&
        limits.height_mm &&
        limits.depth_mm,
    ),
  };
}

function assessDimensions(dimensions = {}, limits = {}) {
  const normalizedDimensions = normalizeDimensions(dimensions);

  const configured = Boolean(
    limits?.configured &&
      limits.width_mm &&
      limits.height_mm &&
      limits.depth_mm,
  );

  if (!configured) {
    return {
      status: "not_configured",
      oversized: null,
      requires_large_truck: false,
      requires_admin_decision: true,

      dimensions_mm: normalizedDimensions,
      standard_truck_limits_mm: null,
      exceeded_dimensions: [],

      additional_delivery_fee_status:
        "pending_admin_assessment",
    };
  }

  if (
    !normalizedDimensions.width_mm ||
    !normalizedDimensions.height_mm ||
    !normalizedDimensions.depth_mm
  ) {
    return {
      status: "manual_review",
      oversized: null,
      requires_large_truck: false,
      requires_admin_decision: true,

      dimensions_mm: normalizedDimensions,

      standard_truck_limits_mm: {
        width_mm: limits.width_mm,
        height_mm: limits.height_mm,
        depth_mm: limits.depth_mm,
      },

      exceeded_dimensions: [],

      additional_delivery_fee_status:
        "pending_admin_assessment",
    };
  }

  const checks = [
    [
      "width",
      "Width",
      normalizedDimensions.width_mm,
      limits.width_mm,
    ],

    [
      "height",
      "Height",
      normalizedDimensions.height_mm,
      limits.height_mm,
    ],

    [
      "depth",
      "Depth",
      normalizedDimensions.depth_mm,
      limits.depth_mm,
    ],
  ];

  const exceededDimensions = checks
    .filter(([, , actual, limit]) => actual > limit)
    .map(([key, label, actual, limit]) => ({
      key,
      label,
      actual_mm: actual,
      limit_mm: limit,
      excess_mm: actual - limit,
    }));

  const oversized = exceededDimensions.length > 0;

  return {
    status: oversized ? "oversized" : "standard",
    oversized,

    requires_large_truck: oversized,
    requires_admin_decision: oversized,

    dimensions_mm: normalizedDimensions,

    standard_truck_limits_mm: {
      width_mm: limits.width_mm,
      height_mm: limits.height_mm,
      depth_mm: limits.depth_mm,
    },

    exceeded_dimensions: exceededDimensions,

    additional_delivery_fee_status: oversized
      ? "pending_admin_assessment"
      : "not_required",
  };
}

function assessCustomOrderItem(item = {}, limits = {}) {
  const dimensions = resolveItemDimensions(item);
  const quantity = toPositiveQuantity(item.quantity);
  const baseAssessment = assessDimensions(dimensions, limits);

  const estimatedCapacity =
    baseAssessment.status === "standard"
      ? estimateUprightFloorCapacity(dimensions, limits)
      : null;

  const quantityExceedsCapacity =
    baseAssessment.status === "standard" &&
    Number.isInteger(estimatedCapacity) &&
    estimatedCapacity > 0 &&
    quantity > estimatedCapacity;

  if (!quantityExceedsCapacity) {
    return {
      ...baseAssessment,
      quantity,
      estimated_standard_truck_capacity_units: estimatedCapacity,
      quantity_exceeds_capacity: false,
      quantity_excess_units: 0,
      capacity_method:
        estimatedCapacity === null ? null : "upright_floor_fit",
    };
  }

  return {
    ...baseAssessment,
    status: "oversized",
    oversized: true,
    requires_large_truck: true,
    requires_admin_decision: true,
    quantity,
    estimated_standard_truck_capacity_units: estimatedCapacity,
    quantity_exceeds_capacity: true,
    quantity_excess_units: quantity - estimatedCapacity,
    capacity_method: "upright_floor_fit",
    additional_delivery_fee_status: "pending_admin_assessment",
  };
}

async function assessOrderDelivery(
  conn,
  orderId,
  suppliedLimits = null,
) {
  const limits =
    suppliedLimits || (await getStandardTruckLimits(conn));

  const [rows] = await conn.query(
    `SELECT
       id,
       product_name,
       quantity,
       customization_json
     FROM order_items
     WHERE order_id = ?
     ORDER BY id ASC`,
    [Number(orderId)],
  );

  const items = rows.map((row) => {
    const customization =
      parseJsonSafe(row.customization_json, {}) || {};

    const assessment = assessCustomOrderItem(
      {
        ...customization,
        quantity: row.quantity,
      },
      limits,
    );

    return {
      order_item_id: row.id,

      product_name:
        String(
          customization.product_name ||
            row.product_name ||
            "",
        ).trim() || "Custom Furniture",

      ...assessment,
    };
  });

  const hasManualReview = items.some(
    (item) =>
      item.status === "not_configured" ||
      item.status === "manual_review",
  );

  const oversizedItems = items.filter(
    (item) => item.status === "oversized",
  );

  let status = "standard";

  if (hasManualReview) {
    status = limits.configured
      ? "manual_review"
      : "not_configured";
  } else if (oversizedItems.length > 0) {
    status = "oversized";
  }

  return {
    status,

    oversized:
      status === "oversized"
        ? true
        : status === "standard"
          ? false
          : null,

    requires_large_truck: status === "oversized",
    requires_admin_decision: status !== "standard",

    standard_truck_limits_mm: limits.configured
      ? {
          width_mm: limits.width_mm,
          height_mm: limits.height_mm,
          depth_mm: limits.depth_mm,
        }
      : null,

    exceeded_dimensions: oversizedItems.flatMap(
      (item) => item.exceeded_dimensions || [],
    ),

    items,

    additional_delivery_fee_status:
      status === "standard"
        ? "not_required"
        : "pending_admin_assessment",
  };
}

module.exports = {
  STANDARD_TRUCK_SETTING_KEYS,
  getStandardTruckLimits,
  assessDimensions,
  assessCustomOrderItem,
  assessOrderDelivery,
};
