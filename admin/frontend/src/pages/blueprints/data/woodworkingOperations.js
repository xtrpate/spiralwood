// data/woodworkingOperations.js
// WISDOM Blueprint Woodworking Operations V5A
// Exact production metadata only. V5B will apply validated operations to 3D geometry.

const WOODWORKING_OPERATIONS_VERSION = 1;
const MAX_WOODWORKING_OPERATIONS = 16;

const WOODWORKING_OPERATION_TYPES = Object.freeze([
  { value: "dado", label: "Dado" },
  { value: "rabbet", label: "Rabbet" },
  { value: "groove", label: "Groove" },
  { value: "recess", label: "Recess / Pocket" },
  { value: "bore", label: "Bore / Drill" },
]);

const VALID_TYPES = new Set(
  WOODWORKING_OPERATION_TYPES.map((item) => item.value),
);
const VALID_SURFACES = new Set(["face_a", "face_b"]);
const VALID_DIRECTIONS = new Set(["u", "v"]);
const VALID_EDGES = new Set(["top", "right", "bottom", "left"]);

function clampNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function cleanType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VALID_TYPES.has(normalized) ? normalized : "dado";
}

function makeOperationId() {
  return `woodop_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getOperationLabel(type = "") {
  const normalized = cleanType(type);
  return (
    WOODWORKING_OPERATION_TYPES.find(
      (item) => item.value === normalized,
    )?.label || "Woodworking Operation"
  );
}

function getOperationProfileDimensions(component = {}) {
  const width = Math.max(1, Number(component.width) || 1);
  const height = Math.max(1, Number(component.height) || 1);
  const depth = Math.max(1, Number(component.depth) || 1);
  const requested = String(component.profilePlane || "auto")
    .trim()
    .toLowerCase();

  let plane = requested;
  if (!["xy", "xz", "yz"].includes(plane)) {
    if (depth <= height && depth <= width) plane = "xy";
    else if (height <= width && height <= depth) plane = "xz";
    else plane = "yz";
  }

  if (plane === "xy") {
    return {
      plane,
      u: width,
      v: height,
      thickness: depth,
      uAxis: "Width",
      vAxis: "Height",
    };
  }

  if (plane === "yz") {
    return {
      plane,
      u: depth,
      v: height,
      thickness: width,
      uAxis: "Depth",
      vAxis: "Height",
    };
  }

  return {
    plane: "xz",
    u: width,
    v: depth,
    thickness: height,
    uAxis: "Width",
    vAxis: "Depth",
  };
}

function normalizeWoodworkingOperation(item = {}, index = 0) {
  const type = cleanType(item.type);
  const surface = VALID_SURFACES.has(item.surface)
    ? item.surface
    : "face_a";
  const direction = VALID_DIRECTIONS.has(item.direction)
    ? item.direction
    : "u";
  const edge = VALID_EDGES.has(item.edge)
    ? item.edge
    : "top";

  return {
    id:
      String(item.id || "").trim() ||
      `woodop_${index + 1}`,
    type,
    surface,
    direction,
    edge,
    u: clampNumber(item.u, -100000, 100000, 0),
    v: clampNumber(item.v, -100000, 100000, 0),
    offset: clampNumber(item.offset, 0, 100000, 0),
    length: clampNumber(item.length, 1, 100000, 160),
    width: clampNumber(item.width, 1, 100000, 18),
    depth: clampNumber(item.depth, 0.1, 100000, 6),
    diameter: clampNumber(item.diameter, 0.1, 100000, 8),
    note: String(item.note || "").slice(0, 240),
  };
}

function normalizeWoodworkingOperations(value) {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }

  if (!Array.isArray(source)) return [];

  return source
    .slice(0, MAX_WOODWORKING_OPERATIONS)
    .map((item, index) =>
      normalizeWoodworkingOperation(item, index),
    );
}

function createWoodworkingOperation(
  component = {},
  type = "dado",
) {
  const dims = getOperationProfileDimensions(component);
  const normalizedType = cleanType(type);
  const minProfile = Math.max(1, Math.min(dims.u, dims.v));

  const baseWidth = Math.max(3, Math.min(24, minProfile * 0.04));
  const baseLength = Math.max(40, Math.min(200, dims.u * 0.3));
  const baseDepth = Math.max(
    1,
    Math.min(6, Math.max(1, dims.thickness * 0.35)),
  );

  return normalizeWoodworkingOperation({
    id: makeOperationId(),
    type: normalizedType,
    surface: "face_a",
    direction: "u",
    edge: "top",
    u: 0,
    v: 0,
    offset: 0,
    length:
      normalizedType === "bore"
        ? baseWidth
        : baseLength,
    width:
      normalizedType === "recess"
        ? Math.max(30, Math.min(100, dims.v * 0.2))
        : baseWidth,
    depth: baseDepth,
    diameter: Math.max(3, Math.min(12, baseWidth)),
    note: "",
  });
}

function updateWoodworkingOperation(
  operations = [],
  operationId = "",
  attrs = {},
) {
  const id = String(operationId || "");
  return normalizeWoodworkingOperations(
    normalizeWoodworkingOperations(operations).map((item) =>
      item.id === id
        ? { ...item, ...attrs, id: item.id }
        : item,
    ),
  );
}

function deleteWoodworkingOperation(
  operations = [],
  operationId = "",
) {
  const id = String(operationId || "");
  return normalizeWoodworkingOperations(operations).filter(
    (item) => item.id !== id,
  );
}

function getWoodworkingOperationFootprint(
  component = {},
  operation = {},
) {
  const dims = getOperationProfileDimensions(component);
  const item = normalizeWoodworkingOperation(operation);

  if (item.type === "bore") {
    const radius = item.diameter / 2;
    return {
      shape: "circle",
      centerU: item.u,
      centerV: item.v,
      radius,
      minU: item.u - radius,
      maxU: item.u + radius,
      minV: item.v - radius,
      maxV: item.v + radius,
    };
  }

  if (item.type === "rabbet") {
    const horizontal =
      item.edge === "top" || item.edge === "bottom";
    const edgeLength = horizontal ? dims.u : dims.v;
    const inwardSpan = horizontal ? dims.v : dims.u;
    const start = item.offset;
    const end = start + item.length;

    let minU;
    let maxU;
    let minV;
    let maxV;

    if (item.edge === "top") {
      minU = -dims.u / 2 + start;
      maxU = -dims.u / 2 + end;
      maxV = dims.v / 2;
      minV = maxV - item.width;
    } else if (item.edge === "bottom") {
      minU = -dims.u / 2 + start;
      maxU = -dims.u / 2 + end;
      minV = -dims.v / 2;
      maxV = minV + item.width;
    } else if (item.edge === "left") {
      minU = -dims.u / 2;
      maxU = minU + item.width;
      minV = -dims.v / 2 + start;
      maxV = -dims.v / 2 + end;
    } else {
      maxU = dims.u / 2;
      minU = maxU - item.width;
      minV = -dims.v / 2 + start;
      maxV = -dims.v / 2 + end;
    }

    return {
      shape: "rect",
      minU,
      maxU,
      minV,
      maxV,
      edgeLength,
      inwardSpan,
      offsetLabel: horizontal
        ? "Offset From Left"
        : "Offset From Bottom",
    };
  }

  const alongU = item.direction === "u";
  const halfLength = item.length / 2;
  const halfWidth = item.width / 2;
  const halfU = alongU ? halfLength : halfWidth;
  const halfV = alongU ? halfWidth : halfLength;

  return {
    shape: "rect",
    minU: item.u - halfU,
    maxU: item.u + halfU,
    minV: item.v - halfV,
    maxV: item.v + halfV,
  };
}

function getWoodworkingOperationStatus(
  component = {},
  operation = {},
) {
  const dims = getOperationProfileDimensions(component);
  const item = normalizeWoodworkingOperation(operation);

  if (item.depth <= 0) {
    return {
      valid: false,
      code: "depth",
      message: "Operation depth must be greater than 0 mm.",
    };
  }

  if (item.depth >= dims.thickness) {
    return {
      valid: false,
      code: "through_depth",
      message:
        "Operation depth must stay below board thickness. Use Holes & Cutouts for through-cuts.",
    };
  }

  const footprint = getWoodworkingOperationFootprint(
    component,
    item,
  );

  if (item.type === "rabbet") {
    if (item.offset < 0) {
      return {
        valid: false,
        code: "offset",
        message: "Rabbet offset cannot be negative.",
      };
    }

    if (item.width <= 0 || item.length <= 0) {
      return {
        valid: false,
        code: "size",
        message: "Rabbet width and length must be greater than 0 mm.",
      };
    }

    if (item.offset + item.length > footprint.edgeLength) {
      return {
        valid: false,
        code: "edge_length",
        message:
          `Rabbet offset + length must stay within the ${Math.round(
            footprint.edgeLength,
          )} mm selected edge.`,
      };
    }

    if (item.width > footprint.inwardSpan) {
      return {
        valid: false,
        code: "width",
        message:
          `Rabbet width must stay within the ${Math.round(
            footprint.inwardSpan,
          )} mm board span inward from this edge.`,
      };
    }

    return {
      valid: true,
      code: "ok",
      message: "Valid rabbet metadata for V5B geometry.",
    };
  }

  if (
    footprint.minU < -dims.u / 2 ||
    footprint.maxU > dims.u / 2 ||
    footprint.minV < -dims.v / 2 ||
    footprint.maxV > dims.v / 2
  ) {
    return {
      valid: false,
      code: "outside",
      message: "Operation envelope is outside the board profile bounds.",
    };
  }

  return {
    valid: true,
    code: "ok",
    message: `Valid ${getOperationLabel(item.type)} metadata for V5B geometry.`,
  };
}

export {
  WOODWORKING_OPERATIONS_VERSION,
  MAX_WOODWORKING_OPERATIONS,
  WOODWORKING_OPERATION_TYPES,
  getOperationLabel,
  getOperationProfileDimensions,
  normalizeWoodworkingOperation,
  normalizeWoodworkingOperations,
  createWoodworkingOperation,
  updateWoodworkingOperation,
  deleteWoodworkingOperation,
  getWoodworkingOperationFootprint,
  getWoodworkingOperationStatus,
};