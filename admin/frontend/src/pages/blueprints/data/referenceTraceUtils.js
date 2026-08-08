// Reference-image tracing helpers used by the Blueprint editor.
import { makeId, snap } from "./utils";

const REFERENCE_GRID_SIZE = 20;

export const DEFAULT_IMPORT_TEMPLATE_TYPE = "template_closet_wardrobe";
export const DEFAULT_IMPORT_DIMENSIONS = { w: 2400, h: 2400, d: 600 };

export const TRACE_TYPE_OPTIONS = [
  { value: "drawer", label: "Drawer Section" },
  { value: "door", label: "Door Section" },
  { value: "body", label: "Body Only" },
];

export const TRACE_TYPE_LABELS = {
  drawer: "Drawer Section",
  door: "Door Section",
  body: "Body Only",
};

export const REFERENCE_TRACE_VIEWS = ["front", "back", "left", "right", "top"];

export function createEmptyReferenceCalibrationByView() {
  return REFERENCE_TRACE_VIEWS.reduce((acc, viewKey) => {
    acc[viewKey] = normalizeReferenceCalibration();
    return acc;
  }, {});
}

export function createEmptyTraceObjectsByView() {
  return REFERENCE_TRACE_VIEWS.reduce((acc, viewKey) => {
    acc[viewKey] = [];
    return acc;
  }, {});
}

export function normalizeReferenceCalibrationByView(value = {}) {
  const next = createEmptyReferenceCalibrationByView();

  const hasViewMap =
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    REFERENCE_TRACE_VIEWS.some((viewKey) => value?.[viewKey]);

  if (hasViewMap) {
    REFERENCE_TRACE_VIEWS.forEach((viewKey) => {
      next[viewKey] = normalizeReferenceCalibration(value?.[viewKey]);
    });
    return next;
  }

  next.front = normalizeReferenceCalibration(value);
  return next;
}

export function normalizeTraceObjectsByView(value = {}) {
  const next = createEmptyTraceObjectsByView();

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const viewKey = normalizeTraceView(
        item?.view || item?.traceView || item?.projectionView || "front",
      );
      next[viewKey].push(normalizeTraceObject(item, viewKey));
    });
    return next;
  }

  REFERENCE_TRACE_VIEWS.forEach((viewKey) => {
    next[viewKey] = normalizeTraceObjects(value?.[viewKey], viewKey);
  });

  return next;
}

export function flattenTraceObjectsByView(value = {}) {
  return REFERENCE_TRACE_VIEWS.flatMap((viewKey) =>
    normalizeTraceObjects(value?.[viewKey], viewKey),
  );
}

export function normalizeReferenceCalibration(value = {}) {
  const rawPoints = Array.isArray(value?.points)
    ? value.points.slice(0, 2)
    : [];

  const points = rawPoints
    .map((point) => ({
      x: Number(point?.x) || 0,
      y: Number(point?.y) || 0,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  const realDistanceMm = Math.max(0, Number(value?.realDistanceMm) || 0);
  const pixelsPerMm = Math.max(0, Number(value?.pixelsPerMm) || 0);

  return {
    points,
    realDistanceMm,
    pixelsPerMm,
    isCalibrated:
      points.length === 2 &&
      realDistanceMm > 0 &&
      pixelsPerMm > 0 &&
      Boolean(value?.isCalibrated),
  };
}

export function normalizeTraceView(rawView = "front") {
  const value = String(rawView || "front").toLowerCase();

  if (value === "back") return "back";
  if (value === "left") return "left";
  if (value === "right") return "right";
  if (value === "top") return "top";
  return "front";
}

export function normalizeProjectionView(rawView = "front") {
  const value = normalizeTraceView(rawView);

  if (value === "back") return "front";
  if (value === "right") return "left";
  return value;
}

export function normalizeTraceObject(obj = {}, fallbackView = "front") {
  const view = normalizeTraceView(
    obj?.view || obj?.traceView || obj?.projectionView || fallbackView,
  );

  const type = ["drawer", "door", "body"].includes(obj?.type)
    ? obj.type
    : ["drawer", "door", "body"].includes(obj?.traceType)
      ? obj.traceType
      : "door";

  const width = Math.max(REFERENCE_GRID_SIZE, snap(Number(obj?.width) || 0));
  const height = Math.max(REFERENCE_GRID_SIZE, snap(Number(obj?.height) || 0));

  return {
    id: obj?.id || makeId(),
    type,
    traceType: type,
    label: obj?.label || TRACE_TYPE_LABELS[type] || "Trace Object",
    x: snap(Number(obj?.x) || 0),
    y: snap(Number(obj?.y) || 0),
    width,
    height,
    view,
    traceView: view,
    projectionView: normalizeProjectionView(view),
  };
}

export function normalizeTraceObjects(list = [], fallbackView = "front") {
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => normalizeTraceObject(item, fallbackView))
    .filter((item) => item.width > 0 && item.height > 0);
}

export function sanitizeReferenceFile(file) {
  if (!file?.url) return null;

  const type = String(file?.type || file?.file_type || "")
    .trim()
    .toLowerCase();

  if (!type) return null;

  return {
    url: file.url,
    type,
    name: file.name || "Reference File",
    source: file.source || "imported",
  };
}

export function isLikelyChairReference({
  importTemplateType,
  importDimensions,
  traceObjectsByView,
}) {
  const dims = {
    w: Number(importDimensions?.w) || 0,
    h: Number(importDimensions?.h) || 0,
    d: Number(importDimensions?.d) || 0,
  };

  const perViewCounts = REFERENCE_TRACE_VIEWS.map(
    (viewKey) => (traceObjectsByView?.[viewKey] || []).length,
  );

  const hasSingleOutlinePerView = perViewCounts.every((count) => count === 1);

  const compactChairSized =
    dims.w > 0 &&
    dims.h > 0 &&
    dims.d > 0 &&
    dims.w <= 1100 &&
    dims.h <= 1400 &&
    dims.d <= 1100;

  const explicitChairTemplate = [
    "chair_template",
    "template_dining_chair",
    "template_accent_chair",
    "template_lounge_chair",
  ].includes(importTemplateType);

  return explicitChairTemplate || (compactChairSized && hasSingleOutlinePerView);
}

export function sanitizeReferenceFiles(files = {}) {
  return {
    front: sanitizeReferenceFile(files?.front),
    back: sanitizeReferenceFile(files?.back),
    left: sanitizeReferenceFile(files?.left),
    right: sanitizeReferenceFile(files?.right),
    top: sanitizeReferenceFile(files?.top),
  };
}

export function resolveImportTemplateType(savedData = {}, blueprintData = {}) {
  return (
    savedData?.importTemplateType ||
    savedData?.import_type ||
    blueprintData?.import_template_type ||
    DEFAULT_IMPORT_TEMPLATE_TYPE
  );
}

export function sanitizeImportDimensions(
  source = {},
  fallback = DEFAULT_IMPORT_DIMENSIONS,
) {
  return {
    w: Math.max(
      REFERENCE_GRID_SIZE,
      snap(Number(source?.w ?? source?.width ?? fallback.w) || fallback.w),
    ),
    h: Math.max(
      REFERENCE_GRID_SIZE,
      snap(Number(source?.h ?? source?.height ?? fallback.h) || fallback.h),
    ),
    d: Math.max(
      REFERENCE_GRID_SIZE,
      snap(Number(source?.d ?? source?.depth ?? fallback.d) || fallback.d),
    ),
  };
}
