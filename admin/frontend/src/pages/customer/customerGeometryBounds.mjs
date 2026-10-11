// WISDOM C4: one read-only, rotation-aware geometry measurement source.
// Reuses the same Euler XYZ bounds function as the Admin Blueprint Editor.
// Does NOT resize parts, infer thickness, change stock, or write saved geometry.
import { getRotatedComponentBounds3D } from "../blueprints/data/rotationBounds.js";

const positiveMm = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return Math.round(number);
  }
  return 0;
};

const readSnapshot = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

// Invalid visible geometry fails closed: do not silently omit manufacturing parts
// when calculating customer overall dimensions. Hidden/deleted parts are excluded.
export const getCustomerFurnitureBounds = (components = []) => {
  if (!Array.isArray(components) || !components.length) return null;
  const boxes = [];
  for (const part of components) {
    if (!part || typeof part !== "object" || Array.isArray(part)) return null;
    if (part.visible === false || Number(part.is_deleted || 0) === 1) continue;
    const bounds = getRotatedComponentBounds3D(part);
    if (!bounds) return null;
    boxes.push(bounds);
  }
  if (!boxes.length) return null;

  const minX = Math.min(...boxes.map((b) => b.minX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const minZ = Math.min(...boxes.map((b) => b.minZ));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  const maxZ = Math.max(...boxes.map((b) => b.maxZ));
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
    return null;
  }
  return {
    minX, minY, minZ, maxX, maxY, maxZ,
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
    depth: Math.max(1, Math.round(maxZ - minZ)),
  };
};

export const getCustomerFurnitureDimensions = (components = [], fallback = {}) => {
  const bounds = getCustomerFurnitureBounds(components);
  return {
    width_mm: bounds ? bounds.width : positiveMm(fallback?.width_mm, fallback?.width, fallback?.w),
    height_mm: bounds ? bounds.height : positiveMm(fallback?.height_mm, fallback?.height, fallback?.h),
    depth_mm: bounds ? bounds.depth : positiveMm(fallback?.depth_mm, fallback?.depth, fallback?.d),
  };
};

// Used by Cart, Checkout and Admin order display; returns their established W/H/D shape.
export const getCustomerItemDimensions = (item = {}) => {
  const snapshot = readSnapshot(item?.editor_snapshot);
  const fallback = {
    width_mm: positiveMm(
      item?.requested_width, item?.width,
      item?.defaultDimensions?.width_mm, item?.bounds?.width,
      item?.customization_snapshot?.width_mm,
    ),
    height_mm: positiveMm(
      item?.requested_height, item?.height,
      item?.defaultDimensions?.height_mm, item?.bounds?.height,
      item?.customization_snapshot?.height_mm,
    ),
    depth_mm: positiveMm(
      item?.requested_depth, item?.depth,
      item?.defaultDimensions?.depth_mm, item?.bounds?.depth,
      item?.customization_snapshot?.depth_mm,
    ),
  };
  const dimensions = getCustomerFurnitureDimensions(snapshot?.components, fallback);
  return {
    width: dimensions.width_mm,
    height: dimensions.height_mm,
    depth: dimensions.depth_mm,
  };
};
