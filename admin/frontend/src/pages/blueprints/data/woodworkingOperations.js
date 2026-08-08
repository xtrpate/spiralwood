// data/woodworkingOperations.js
// WISDOM Blueprint Woodworking Operations V5A
// Exact production metadata only. V5B will apply validated operations to 3D geometry.

const WOODWORKING_OPERATIONS_VERSION = 2;
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

function operationPointOnSegment(a, b, point, tolerance = 1e-6) {
  const ax = Number(a?.[0]) || 0;
  const ay = Number(a?.[1]) || 0;
  const bx = Number(b?.[0]) || 0;
  const by = Number(b?.[1]) || 0;
  const px = Number(point?.[0]) || 0;
  const py = Number(point?.[1]) || 0;

  const cross =
    (bx - ax) * (py - ay) -
    (by - ay) * (px - ax);

  if (Math.abs(cross) > tolerance) return false;

  return (
    px >= Math.min(ax, bx) - tolerance &&
    px <= Math.max(ax, bx) + tolerance &&
    py >= Math.min(ay, by) - tolerance &&
    py <= Math.max(ay, by) + tolerance
  );
}

function operationOrientation(a, b, c, tolerance = 1e-8) {
  const value =
    ((Number(b?.[0]) || 0) - (Number(a?.[0]) || 0)) *
      ((Number(c?.[1]) || 0) - (Number(a?.[1]) || 0)) -
    ((Number(b?.[1]) || 0) - (Number(a?.[1]) || 0)) *
      ((Number(c?.[0]) || 0) - (Number(a?.[0]) || 0));

  if (Math.abs(value) <= tolerance) return 0;
  return value > 0 ? 1 : -1;
}

function operationSegmentsIntersect(a, b, c, d) {
  const o1 = operationOrientation(a, b, c);
  const o2 = operationOrientation(a, b, d);
  const o3 = operationOrientation(c, d, a);
  const o4 = operationOrientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && operationPointOnSegment(a, b, c)) return true;
  if (o2 === 0 && operationPointOnSegment(a, b, d)) return true;
  if (o3 === 0 && operationPointOnSegment(c, d, a)) return true;
  if (o4 === 0 && operationPointOnSegment(c, d, b)) return true;

  return false;
}

function operationPointInPolygon(point, polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;

  const x = Number(point?.[0]) || 0;
  const y = Number(point?.[1]) || 0;
  let inside = false;

  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const current = polygon[index];
    const prior = polygon[previous];

    if (operationPointOnSegment(prior, current, point)) {
      return true;
    }

    const xi = Number(current?.[0]) || 0;
    const yi = Number(current?.[1]) || 0;
    const xj = Number(prior?.[0]) || 0;
    const yj = Number(prior?.[1]) || 0;

    const crosses = (yi > y) !== (yj > y);
    if (!crosses) continue;

    const denominator = yj - yi;
    if (Math.abs(denominator) <= 1e-12) continue;

    const intersectionX =
      xi + ((xj - xi) * (y - yi)) / denominator;

    if (x < intersectionX) inside = !inside;
  }

  return inside;
}

function operationPolygonsOverlap(a = [], b = []) {
  if (a.length < 3 || b.length < 3) return false;

  for (let ai = 0; ai < a.length; ai += 1) {
    const aNext = (ai + 1) % a.length;

    for (let bi = 0; bi < b.length; bi += 1) {
      const bNext = (bi + 1) % b.length;

      if (
        operationSegmentsIntersect(
          a[ai],
          a[aNext],
          b[bi],
          b[bNext],
        )
      ) {
        return true;
      }
    }
  }

  return (
    operationPointInPolygon(a[0], b) ||
    operationPointInPolygon(b[0], a)
  );
}

function getWoodworkingOperationFootprintPoints(
  component = {},
  operation = {},
  circleSegments = 36,
) {
  const item = normalizeWoodworkingOperation(operation);
  const footprint = getWoodworkingOperationFootprint(
    component,
    item,
  );

  if (footprint.shape === "circle") {
    const steps = Math.max(16, Number(circleSegments) || 36);
    return Array.from({ length: steps }, (_, index) => {
      const angle = (index / steps) * Math.PI * 2;
      return [
        footprint.centerU +
          Math.cos(angle) * footprint.radius,
        footprint.centerV +
          Math.sin(angle) * footprint.radius,
      ];
    });
  }

  return [
    [footprint.minU, footprint.minV],
    [footprint.maxU, footprint.minV],
    [footprint.maxU, footprint.maxV],
    [footprint.minU, footprint.maxV],
  ];
}

function operationFootprintStrictlyInsideOuter(
  footprintPoints = [],
  outerPoints = [],
) {
  if (
    footprintPoints.length < 3 ||
    !Array.isArray(outerPoints) ||
    outerPoints.length < 3
  ) {
    return false;
  }

  if (
    !footprintPoints.every((point) =>
      operationPointInPolygon(point, outerPoints),
    )
  ) {
    return false;
  }

  for (
    let fi = 0;
    fi < footprintPoints.length;
    fi += 1
  ) {
    const fNext = (fi + 1) % footprintPoints.length;

    for (let oi = 0; oi < outerPoints.length; oi += 1) {
      const oNext = (oi + 1) % outerPoints.length;

      if (
        operationSegmentsIntersect(
          footprintPoints[fi],
          footprintPoints[fNext],
          outerPoints[oi],
          outerPoints[oNext],
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

function getRabbetBoundarySupport(
  component = {},
  operation = {},
  outerPoints = [],
) {
  const item = normalizeWoodworkingOperation(operation);
  if (item.type !== "rabbet") return null;
  if (!Array.isArray(outerPoints) || outerPoints.length < 3) {
    return null;
  }

  const dims = getOperationProfileDimensions(component);
  const footprint = getWoodworkingOperationFootprint(
    component,
    item,
  );
  const horizontal =
    item.edge === "top" || item.edge === "bottom";
  const tolerance = Math.max(
    0.01,
    Math.min(dims.u, dims.v) * 1e-5,
  );

  const boundaryValue =
    item.edge === "top"
      ? dims.v / 2
      : item.edge === "bottom"
        ? -dims.v / 2
        : item.edge === "right"
          ? dims.u / 2
          : -dims.u / 2;

  const targetMin = horizontal
    ? footprint.minU
    : footprint.minV;
  const targetMax = horizontal
    ? footprint.maxU
    : footprint.maxV;

  for (
    let index = 0;
    index < outerPoints.length;
    index += 1
  ) {
    const nextIndex = (index + 1) % outerPoints.length;
    const start = outerPoints[index];
    const end = outerPoints[nextIndex];

    const startBoundary = horizontal ? start[1] : start[0];
    const endBoundary = horizontal ? end[1] : end[0];

    if (
      Math.abs(startBoundary - boundaryValue) > tolerance ||
      Math.abs(endBoundary - boundaryValue) > tolerance
    ) {
      continue;
    }

    const startAlong = horizontal ? start[0] : start[1];
    const endAlong = horizontal ? end[0] : end[1];
    const segmentMin = Math.min(startAlong, endAlong);
    const segmentMax = Math.max(startAlong, endAlong);

    if (
      targetMin >= segmentMin - tolerance &&
      targetMax <= segmentMax + tolerance
    ) {
      return {
        index,
        nextIndex,
        start,
        end,
        horizontal,
        boundaryValue,
      };
    }
  }

  return null;
}

function getBasicWoodworkingOperationStatus(
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
      message: "Valid rabbet operation.",
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
    message: `Valid ${getOperationLabel(item.type)} operation.`,
  };
}

function getWoodworkingOperationStatus(
  component = {},
  operation = {},
  context = {},
) {
  const dims = getOperationProfileDimensions(component);
  const item = normalizeWoodworkingOperation(operation);
  const basic = getBasicWoodworkingOperationStatus(
    component,
    item,
  );

  if (!basic.valid) return basic;

  const outerPoints = Array.isArray(context?.outerPoints)
    ? context.outerPoints
    : [];
  const cutoutPolygons = Array.isArray(
    context?.cutoutPolygons,
  )
    ? context.cutoutPolygons
    : [];
  const footprintPoints =
    getWoodworkingOperationFootprintPoints(
      component,
      item,
      item.type === "bore" ? 48 : 4,
    );

  if (outerPoints.length >= 3) {
    if (item.type === "rabbet") {
      const support = getRabbetBoundarySupport(
        component,
        item,
        outerPoints,
      );

      if (!support) {
        return {
          valid: false,
          code: "profile_edge",
          message:
            "Rabbet needs one straight outer profile edge covering its full offset and length.",
        };
      }

      const footprint = getWoodworkingOperationFootprint(
        component,
        item,
      );
      const innerPoints =
        item.edge === "top"
          ? [
              [footprint.minU, footprint.minV],
              [footprint.maxU, footprint.minV],
            ]
          : item.edge === "bottom"
            ? [
                [footprint.minU, footprint.maxV],
                [footprint.maxU, footprint.maxV],
              ]
            : item.edge === "left"
              ? [
                  [footprint.maxU, footprint.minV],
                  [footprint.maxU, footprint.maxV],
                ]
              : [
                  [footprint.minU, footprint.minV],
                  [footprint.minU, footprint.maxV],
                ];

      if (
        !innerPoints.every((point) =>
          operationPointInPolygon(point, outerPoints),
        )
      ) {
        return {
          valid: false,
          code: "profile_outside",
          message:
            "Rabbet depth/width footprint leaves the actual board profile.",
        };
      }
    } else if (
      !operationFootprintStrictlyInsideOuter(
        footprintPoints,
        outerPoints,
      )
    ) {
      return {
        valid: false,
        code: "profile_outside",
        message:
          "Operation must stay fully inside the actual board profile.",
      };
    }
  }

  const overlapsThroughCutout = cutoutPolygons.some(
    (polygon) =>
      Array.isArray(polygon) &&
      operationPolygonsOverlap(
        footprintPoints,
        polygon,
      ),
  );

  if (overlapsThroughCutout) {
    return {
      valid: false,
      code: "through_cutout_overlap",
      message:
        "Operation cannot overlap an existing through-hole/cutout.",
    };
  }

  const operations = normalizeWoodworkingOperations(
    component?.woodworkingOperations,
  );

  for (const other of operations) {
    if (other.id === item.id) continue;

    const otherBasic = getBasicWoodworkingOperationStatus(
      component,
      other,
    );
    if (!otherBasic.valid) continue;

    if (outerPoints.length >= 3) {
      if (other.type === "rabbet") {
        if (
          !getRabbetBoundarySupport(
            component,
            other,
            outerPoints,
          )
        ) {
          continue;
        }
      } else {
        const otherPoints =
          getWoodworkingOperationFootprintPoints(
            component,
            other,
            other.type === "bore" ? 48 : 4,
          );

        if (
          !operationFootprintStrictlyInsideOuter(
            otherPoints,
            outerPoints,
          )
        ) {
          continue;
        }
      }
    }

    const otherPoints =
      getWoodworkingOperationFootprintPoints(
        component,
        other,
        other.type === "bore" ? 48 : 4,
      );

    if (
      !operationPolygonsOverlap(
        footprintPoints,
        otherPoints,
      )
    ) {
      continue;
    }

    if (other.surface === item.surface) {
      return {
        valid: false,
        code: "operation_overlap",
        message:
          "Woodworking operations on the same face cannot overlap in V5B.",
      };
    }

    if (item.depth + other.depth >= dims.thickness) {
      return {
        valid: false,
        code: "opposite_face_breakthrough",
        message:
          "Opposite-face operations overlap deeply enough to break through the board.",
      };
    }
  }

  return {
    valid: true,
    code: "ok",
    message:
      `Valid ${getOperationLabel(item.type)} · actual V5B 3D cut enabled.`,
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
  getWoodworkingOperationFootprintPoints,
  operationPolygonsOverlap,
  getRabbetBoundarySupport,
  getWoodworkingOperationStatus,
};