// data/technicalOutputUtils.js
// Pure helpers for Blueprint technical-output safety and layout hardening.
// No React, DOM, pricing, inventory, backend, or database behavior lives here.

const ROTATION_EPSILON_DEGREES = 0.001;
const BLUEPRINT_METADATA_BAND_H = 56;
const MATERIALS_SINGLE_PAGE_PART_LIMIT = 9;
const MATERIALS_SUMMARY_ROWS_PER_PAGE = 10;
const MATERIALS_CONTINUATION_PART_LIMIT = 13;

const toFinite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

function hasMeaningfulRotation(component = {}) {
  return [
    component.rotationX ?? component.rotation_x,
    component.rotationY ?? component.rotation_y,
    component.rotationZ ?? component.rotation_z,
  ].some((value) => Math.abs(toFinite(value, 0)) > ROTATION_EPSILON_DEGREES);
}

function hasCustomProfileGeometry(component = {}) {
  const type = String(component?.type || "").trim().toLowerCase();
  if (type.startsWith("wood_profile_")) return true;

  return Boolean(
    String(component?.profileKind || component?.profile_kind || "").trim() ||
      (Array.isArray(component?.profileContourPoints) &&
        component.profileContourPoints.length > 0) ||
      (Array.isArray(component?.profileCutouts) &&
        component.profileCutouts.length > 0) ||
      (Array.isArray(component?.profileEdgeNotches) &&
        component.profileEdgeNotches.length > 0),
  );
}

function getOfficialOutputFidelityIssues(components = []) {
  if (!Array.isArray(components)) return [];

  return components.flatMap((component, index) => {
    if (!component || component.type === "reference_proxy") return [];

    const reasons = [];
    if (hasMeaningfulRotation(component)) reasons.push("rotation");
    if (hasCustomProfileGeometry(component)) reasons.push("custom_profile");

    if (!reasons.length) return [];

    return [
      {
        componentId: component.id || null,
        partCode: String(component.partCode || "").trim(),
        label: String(component.label || `Part ${index + 1}`).trim(),
        reasons,
      },
    ];
  });
}

function chunkRows(rows = [], limit = 1) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeLimit = Math.max(1, Math.floor(toFinite(limit, 1)));
  const groups = [];

  for (let index = 0; index < safeRows.length; index += safeLimit) {
    groups.push(safeRows.slice(index, index + safeLimit));
  }

  return groups;
}

function buildMaterialsPaginationPlan(
  componentRows = [],
  materialRows = [],
) {
  const safeComponentRows = Array.isArray(componentRows) ? componentRows : [];
  const safeMaterialRows = Array.isArray(materialRows) ? materialRows : [];

  const canUseSinglePage =
    safeComponentRows.length <= MATERIALS_SINGLE_PAGE_PART_LIMIT &&
    safeMaterialRows.length <= MATERIALS_SUMMARY_ROWS_PER_PAGE;

  if (canUseSinglePage) {
    return {
      combined: true,
      materialPages: [safeMaterialRows],
      partPages: [safeComponentRows],
      totalPages: 1,
    };
  }

  const materialPages = chunkRows(
    safeMaterialRows,
    MATERIALS_SUMMARY_ROWS_PER_PAGE,
  );
  const partPages = chunkRows(
    safeComponentRows,
    MATERIALS_CONTINUATION_PART_LIMIT,
  );

  return {
    combined: false,
    materialPages: materialPages.length ? materialPages : [[]],
    partPages: partPages.length ? partPages : [[]],
    totalPages:
      Math.max(1, materialPages.length) + Math.max(1, partPages.length),
  };
}

function getSafeVerticalDimensionPlacement(
  overallScreenBounds,
  drawingArea,
  preferred = 28,
  textClearance = 20,
) {
  const preferredOffset = Math.max(1, Math.abs(toFinite(preferred, 28)));
  const clearance = Math.max(0, toFinite(textClearance, 20));

  if (!overallScreenBounds || !drawingArea) {
    return {
      side: "right",
      anchorX: toFinite(overallScreenBounds?.maxX, 0),
      offset: preferredOffset,
    };
  }

  const rightAllowance =
    toFinite(drawingArea.x, 0) +
    toFinite(drawingArea.w, 0) -
    toFinite(overallScreenBounds.maxX, 0);
  const leftAllowance =
    toFinite(overallScreenBounds.minX, 0) - toFinite(drawingArea.x, 0);
  const required = preferredOffset + clearance;

  const useRight =
    rightAllowance >= required ||
    (leftAllowance < required && rightAllowance >= leftAllowance);

  if (useRight) {
    return {
      side: "right",
      anchorX: toFinite(overallScreenBounds.maxX, 0),
      offset: preferredOffset,
    };
  }

  return {
    side: "left",
    anchorX: toFinite(overallScreenBounds.minX, 0),
    offset: -preferredOffset,
  };
}

export {
  ROTATION_EPSILON_DEGREES,
  BLUEPRINT_METADATA_BAND_H,
  MATERIALS_SINGLE_PAGE_PART_LIMIT,
  MATERIALS_SUMMARY_ROWS_PER_PAGE,
  MATERIALS_CONTINUATION_PART_LIMIT,
  hasMeaningfulRotation,
  hasCustomProfileGeometry,
  getOfficialOutputFidelityIssues,
  buildMaterialsPaginationPlan,
  getSafeVerticalDimensionPlacement,
};
