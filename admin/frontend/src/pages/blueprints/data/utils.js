const GRID_SIZE = 20;
const MM_PER_INCH = 25.4;
const REFERENCE_VIEWS = ["front", "back", "left", "right", "top"];

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

function snap(v) {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
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
  return unit === "inch" ? snap(numeric * MM_PER_INCH) : snap(numeric);
}

function formatDim(mm, unit) {
  if (unit === "inch") return `${(mm / MM_PER_INCH).toFixed(2)} in`;
  return `${Math.round(mm)} mm`;
}

function formatDims(width, height, depth, unit) {
  return `${formatDim(width, unit)} × ${formatDim(height, unit)} × ${formatDim(depth, unit)}`;
}

function getNowStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function resolveAssetUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;

  const normalizedPath = String(url).startsWith("/") ? String(url) : `/${url}`;
  return normalizedPath;
}

function isImageReferenceFile(referenceFile) {
  const type = String(
    referenceFile?.type || referenceFile?.file_type || "",
  ).toLowerCase();
  return ["png", "jpg", "jpeg", "svg", "webp"].includes(type);
}

function createEmptyReferenceFiles() {
  return {
    front: null,
    back: null,
    left: null,
    right: null,
    top: null,
  };
}

function normalizeReferenceMeta(value, fallbackName = "Reference File") {
  const url = value?.url || value?.file_url || null;
  const type = String(value?.type || value?.file_type || "")
    .trim()
    .toLowerCase();

  if (!url || !type) return null;

  return {
    url,
    type,
    name: value?.name || fallbackName,
    source: value?.source || "imported",
  };
}

function getReferenceFilesFromBlueprint(savedData = {}, blueprintData = {}) {
  const next = createEmptyReferenceFiles();

  const savedReferenceFiles =
    savedData?.reference_files || savedData?.referenceFiles || {};

  REFERENCE_VIEWS.forEach((view) => {
    const normalized = normalizeReferenceMeta(
      savedReferenceFiles?.[view],
      `${blueprintData?.title || "Reference"} ${view}`,
    );

    if (normalized) {
      next[view] = normalized;
    }
  });

  const savedReference = normalizeReferenceMeta(
    savedData?.reference_file || savedData?.referenceFile,
    blueprintData?.title || "Reference File",
  );

  const blueprintReference =
    blueprintData?.file_url && blueprintData?.file_type
      ? normalizeReferenceMeta(
          {
            url: blueprintData.file_url,
            type: blueprintData.file_type,
            name: blueprintData.title || "Reference File",
            source: blueprintData.source || "imported",
          },
          blueprintData?.title || "Reference File",
        )
      : null;

  if (!next.front) {
    next.front = savedReference || blueprintReference || null;
  }

  return next;
}

function getReferenceFileFromBlueprint(
  savedData = {},
  blueprintData = {},
  preferredView = "front",
) {
  const referenceFiles = getReferenceFilesFromBlueprint(
    savedData,
    blueprintData,
  );

  return (
    referenceFiles?.[preferredView] ||
    referenceFiles?.front ||
    referenceFiles?.back ||
    referenceFiles?.left ||
    referenceFiles?.right ||
    referenceFiles?.top ||
    null
  );
}

function getEditorMode(savedData = {}, referenceSource = null) {
  if (
    savedData?.editorMode === "reference" ||
    savedData?.editorMode === "editable"
  ) {
    return savedData.editorMode;
  }

  if (Array.isArray(savedData?.components) && savedData.components.length > 0) {
    return "editable";
  }

  if (referenceSource?.url) {
    return "reference";
  }

  if (
    referenceSource &&
    typeof referenceSource === "object" &&
    Object.values(referenceSource).some((item) => item?.url)
  ) {
    return "reference";
  }

  return "editable";
}

export {
  cloneComponents,
  escapeHtml,
  snap,
  clamp,
  makeId,
  makeGroupId,
  mmToDisplay,
  displayToMm,
  formatDim,
  formatDims,
  getNowStamp,
  resolveAssetUrl,
  isImageReferenceFile,
  createEmptyReferenceFiles,
  getReferenceFilesFromBlueprint,
  getReferenceFileFromBlueprint,
  getEditorMode,
};
