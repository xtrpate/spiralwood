export const normalizeDeliveryDimensions = (source = {}) => {
  const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0
      ? Math.round(number)
      : 0;
  };

  return {
    width_mm: toNumber(source?.width_mm ?? source?.width ?? source?.w),
    height_mm: toNumber(source?.height_mm ?? source?.height ?? source?.h),
    depth_mm: toNumber(source?.depth_mm ?? source?.depth ?? source?.d),
  };
};

export const assessOversizedDelivery = (
  dimensions = {},
  standardTruckLimits = null,
) => {
  const normalizedDimensions = normalizeDeliveryDimensions(dimensions);

  const limits = standardTruckLimits
    ? normalizeDeliveryDimensions(standardTruckLimits)
    : null;

  const configured = Boolean(
    limits?.width_mm &&
      limits?.height_mm &&
      limits?.depth_mm,
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
      additional_delivery_fee_status: "pending_admin_assessment",
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
      standard_truck_limits_mm: limits,
      exceeded_dimensions: [],
      additional_delivery_fee_status: "pending_admin_assessment",
    };
  }

  const checks = [
    {
      key: "width",
      label: "Width",
      actual_mm: normalizedDimensions.width_mm,
      limit_mm: limits.width_mm,
    },
    {
      key: "height",
      label: "Height",
      actual_mm: normalizedDimensions.height_mm,
      limit_mm: limits.height_mm,
    },
    {
      key: "depth",
      label: "Depth",
      actual_mm: normalizedDimensions.depth_mm,
      limit_mm: limits.depth_mm,
    },
  ];

  const exceededDimensions = checks
    .filter((item) => item.actual_mm > item.limit_mm)
    .map((item) => ({
      ...item,
      excess_mm: item.actual_mm - item.limit_mm,
    }));

  const oversized = exceededDimensions.length > 0;

  return {
    status: oversized ? "oversized" : "standard",
    oversized,
    requires_large_truck: oversized,
    requires_admin_decision: oversized,
    dimensions_mm: normalizedDimensions,
    standard_truck_limits_mm: limits,
    exceeded_dimensions: exceededDimensions,
    additional_delivery_fee_status: oversized
      ? "pending_admin_assessment"
      : "not_required",
  };
};

export const getDeliveryAssessmentSummary = (assessment = {}) => {
  if (assessment?.status === "oversized") {
    return {
      oversized: "Yes",
      truck_requirement: "Larger truck",
      additional_delivery_fee: "Pending admin assessment",
    };
  }

  if (
    assessment?.status === "manual_review" ||
    assessment?.status === "not_configured"
  ) {
    return {
      oversized: "Pending review",
      truck_requirement: "Pending admin assessment",
      additional_delivery_fee: "Pending admin assessment",
    };
  }

  return {
    oversized: "No",
    truck_requirement: "Standard delivery truck",
    additional_delivery_fee: "Not required",
  };
};
