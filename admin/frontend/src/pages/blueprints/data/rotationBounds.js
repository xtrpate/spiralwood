// Rotation-aware axis-aligned bounds for Blueprint components.
// Matches Three.js Euler XYZ rotation used by the admin 3D viewer.
// Component x/y/z remain the unrotated box origin; rotation occurs around its center.

const EPSILON = 1e-10;
const ROUND_FACTOR = 1e9;

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const cleanNumber = (value) => {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) < EPSILON) return 0;
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
};

const normalizeDegrees = (value) => {
  const degrees = toFiniteNumber(value, 0);
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized < EPSILON || Math.abs(normalized - 360) < EPSILON) {
    return 0;
  }
  return normalized;
};

const getDimensions = (component = {}) => {
  const width = toFiniteNumber(
    component.width ?? component.w ?? component.width_mm,
    NaN,
  );
  const height = toFiniteNumber(
    component.height ?? component.h ?? component.height_mm,
    NaN,
  );
  const depth = toFiniteNumber(
    component.depth ?? component.d ?? component.depth_mm,
    NaN,
  );

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(depth) ||
    width <= 0 ||
    height <= 0 ||
    depth <= 0
  ) {
    return null;
  }

  return { width, height, depth };
};

const getPosition = (component = {}) => ({
  x: toFiniteNumber(component.x ?? component.position_x, 0),
  y: toFiniteNumber(component.y ?? component.position_y, 0),
  z: toFiniteNumber(component.z ?? component.position_z, 0),
});

const getRotation = (component = {}) => ({
  x: normalizeDegrees(component.rotationX ?? component.rotation_x),
  y: normalizeDegrees(component.rotationY ?? component.rotation_y),
  z: normalizeDegrees(component.rotationZ ?? component.rotation_z),
});

export function getRotatedComponentBounds3D(component = {}) {
  const dimensions = getDimensions(component);
  if (!dimensions) return null;

  const position = getPosition(component);
  const rotation = getRotation(component);

  const { width, height, depth } = dimensions;
  const centerX = position.x + width / 2;
  const centerY = position.y + height / 2;
  const centerZ = position.z + depth / 2;

  if (rotation.x === 0 && rotation.y === 0 && rotation.z === 0) {
    return {
      minX: position.x,
      minY: position.y,
      minZ: position.z,
      maxX: position.x + width,
      maxY: position.y + height,
      maxZ: position.z + depth,
      width,
      height,
      depth,
      centerX,
      centerY,
      centerZ,
    };
  }

  const x = (rotation.x * Math.PI) / 180;
  const y = (rotation.y * Math.PI) / 180;
  const z = (rotation.z * Math.PI) / 180;

  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);

  // Same XYZ Euler matrix layout used by THREE.Matrix4.makeRotationFromEuler.
  const m00 = c * e;
  const m01 = -c * f;
  const m02 = d;

  const m10 = a * f + b * e * d;
  const m11 = a * e - b * f * d;
  const m12 = -b * c;

  const m20 = b * f - a * e * d;
  const m21 = b * e + a * f * d;
  const m22 = a * c;

  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;

  const extentX =
    Math.abs(m00) * halfW +
    Math.abs(m01) * halfH +
    Math.abs(m02) * halfD;

  const extentY =
    Math.abs(m10) * halfW +
    Math.abs(m11) * halfH +
    Math.abs(m12) * halfD;

  const extentZ =
    Math.abs(m20) * halfW +
    Math.abs(m21) * halfH +
    Math.abs(m22) * halfD;

  const minX = cleanNumber(centerX - extentX);
  const minY = cleanNumber(centerY - extentY);
  const minZ = cleanNumber(centerZ - extentZ);
  const maxX = cleanNumber(centerX + extentX);
  const maxY = cleanNumber(centerY + extentY);
  const maxZ = cleanNumber(centerZ + extentZ);

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    width: cleanNumber(maxX - minX),
    height: cleanNumber(maxY - minY),
    depth: cleanNumber(maxZ - minZ),
    centerX,
    centerY,
    centerZ,
  };
}

export function getRotatedProjectedBox(component = {}, view = "front") {
  const bounds = getRotatedComponentBounds3D(component);
  if (!bounds) return null;

  if (view === "front" || view === "back") {
    return {
      x: bounds.minX,
      y: bounds.minY,
      w: bounds.width,
      h: bounds.height,
    };
  }

  if (view === "left" || view === "right") {
    return {
      x: bounds.minZ,
      y: bounds.minY,
      w: bounds.depth,
      h: bounds.height,
    };
  }

  if (view === "top") {
    return {
      x: bounds.minX,
      y: bounds.minZ,
      w: bounds.width,
      h: bounds.depth,
    };
  }

  return null;
}
