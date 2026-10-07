const GRID_SIZE = 20;
const DIMENSION_PRECISION_MM = 1;
const MM_PER_INCH = 25.4;

function cloneComponents(list = []) {
  return JSON.parse(JSON.stringify(list || []));
}

const createObjectId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `obj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function roundToPrecision(value, precision = DIMENSION_PRECISION_MM) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;

  const safePrecision = Number(precision);
  if (!Number.isFinite(safePrecision) || safePrecision <= 0) {
    return numeric;
  }

  const rounded = Math.round(numeric / safePrecision) * safePrecision;
  const decimalPlaces = String(safePrecision).includes(".")
    ? String(safePrecision).split(".")[1].length
    : 0;

  return Number(rounded.toFixed(Math.min(decimalPlaces, 6)));
}

function snap(v, gridSize = GRID_SIZE) {
  return roundToPrecision(v, gridSize);
}

function normalizeDimensionMm(value, minimum = DIMENSION_PRECISION_MM) {
  return Math.max(minimum, roundToPrecision(value));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function makeId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeGroupId() {
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mmToDisplay(mm, unit) {
  return unit === "inch"
    ? Number((mm / MM_PER_INCH).toFixed(2))
    : Math.round(mm);
}

function displayToMm(value, unit) {
  const numeric = Number(value) || 0;
  return roundToPrecision(
    unit === "inch" ? numeric * MM_PER_INCH : numeric,
  );
}

function formatDim(mm, unit) {
  if (unit === "inch") return `${(mm / MM_PER_INCH).toFixed(2)} in`;
  return `${Math.round(mm)} mm`;
}

function formatDims(width, height, depth, unit) {
  return `${formatDim(width, unit)} × ${formatDim(height, unit)} × ${formatDim(depth, unit)}`;
}

function getNowStamp() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export {
  cloneComponents,
  escapeHtml,
  snap,
  roundToPrecision,
  normalizeDimensionMm,
  clamp,
  makeId,
  makeGroupId,
  mmToDisplay,
  displayToMm,
  formatDim,
  formatDims,
  getNowStamp,
};
