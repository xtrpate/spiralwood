import { useState, useEffect } from "react";
import api from "../services/api";

// data/utils.js — Small shared utility functions
const GRID_SIZE = 20;
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

  const apiBase = String(api?.defaults?.baseURL || "");
  const serverBase = apiBase.replace(/\/api\/?$/i, "");
  const normalizedPath = String(url).startsWith("/") ? String(url) : `/${url}`;

  return serverBase ? `${serverBase}${normalizedPath}` : normalizedPath;
}

function isImageReferenceFile(referenceFile) {
  const type = String(
    referenceFile?.type || referenceFile?.file_type || "",
  ).toLowerCase();
  return ["png", "jpg", "jpeg", "svg", "webp"].includes(type);
}

function getReferenceFileFromBlueprint(savedData = {}, blueprintData = {}) {
  // eto
  const savedReference = savedData?.reference_file || savedData?.referenceFile;

  if (
    savedReference?.url &&
    (savedReference?.type || savedReference?.file_type)
  ) {
    return {
      url: savedReference.url,
      type: String(
        savedReference.type || savedReference.file_type,
      ).toLowerCase(),
      name: savedReference.name || blueprintData?.title || "Reference File",
      source: savedReference.source || "imported",
    };
  }

  if (blueprintData?.file_url && blueprintData?.file_type) {
    return {
      url: blueprintData.file_url,
      type: String(blueprintData.file_type).toLowerCase(),
      name: blueprintData.title || "Reference File",
      source: blueprintData.source || "imported",
    };
  }

  return null;
}
function getEditorMode(savedData = {}, referenceFile = null) {
  if (
    savedData?.editorMode === "reference" ||
    savedData?.editorMode === "editable"
  ) {
    return savedData.editorMode;
  }

  if (Array.isArray(savedData?.components) && savedData.components.length > 0) {
    return "editable";
  }

  if (referenceFile?.url) {
    return "reference";
  }

  return "editable";
}

function resolveInitialComponents(
  savedData = {},
  referenceFile = null,
  blueprintData = {},
  worldSize = { w: 6400, h: 3200, d: 5200 },
) {
  const savedComponents = Array.isArray(savedData?.components)
    ? savedData.components.map(normalizeComponent)
    : [];

  const hasOnlyReferenceProxy =
    savedComponents.length > 0 &&
    savedComponents.every((c) => c.type === "reference_proxy");

  if (savedComponents.length > 0 && !hasOnlyReferenceProxy) {
    return savedComponents;
  }

  if (referenceFile?.url) {
    return createImportedDiningChairComponents(
      savedData,
      referenceFile,
      blueprintData,
      worldSize,
    );
  }

  // fallback
  if (savedComponents.length > 0) {
    return savedComponents;
  }

  return [];
}

function useReferenceImage(src) {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = "anonymous";

    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return image;
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
  getReferenceFileFromBlueprint,
  getEditorMode,
  resolveInitialComponents,
  useReferenceImage,
};
