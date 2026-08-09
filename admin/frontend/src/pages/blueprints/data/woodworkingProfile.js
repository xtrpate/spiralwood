// data/woodworkingProfile.js
// WISDOM Blueprint Custom Shape Foundation V1
// Pure woodworking profile geometry shared by 2D and 3D.
// No inventory, pricing, backend, or estimation behavior lives here.

const WOODWORKING_PROFILE_VERSION = 5;

const PROFILE_KIND_BY_TYPE = Object.freeze({
  wood_profile_rectangle: "rectangle",
  wood_profile_rounded: "rounded",
  wood_profile_chamfer: "chamfer",
  wood_profile_notch: "notch",
  wood_profile_oval: "oval",
  wood_profile_trapezoid: "trapezoid",
  wood_profile_contour: "contour",
});

const PROFILE_KIND_LABELS = Object.freeze({
  rectangle: "Rectangle Board",
  rounded: "Rounded Board",
  chamfer: "Chamfered Board",
  notch: "Notched Board",
  oval: "Circle / Oval Board",
  trapezoid: "Trapezoid Board",
  contour: "Custom Contour Board",
});

const VALID_PROFILE_KINDS = new Set(Object.keys(PROFILE_KIND_LABELS));
const VALID_PROFILE_PLANES = new Set(["auto", "xy", "xz", "yz"]);
const VALID_NOTCH_EDGES = new Set(["top", "right", "bottom", "left"]);

const WOODWORKING_PROFILE_TYPES = [
  {
    label: "Rectangle Board",
    type: "wood_profile_rectangle",
    category: "Custom Shape Parts",
    partRole: "custom_profile",
    w: 800,
    h: 18,
    d: 450,
    fill: "#d7b58a",
    material: "Marine Plywood",
    unitPrice: 0,
    blueprintStyle: "profile_part",
  },
  {
    label: "Rounded Board",
    type: "wood_profile_rounded",
    category: "Custom Shape Parts",
    partRole: "custom_profile",
    w: 800,
    h: 18,
    d: 450,
    fill: "#d7b58a",
    material: "Marine Plywood",
    unitPrice: 0,
    blueprintStyle: "profile_part",
  },
  {
    label: "Chamfered Board",
    type: "wood_profile_chamfer",
    category: "Custom Shape Parts",
    partRole: "custom_profile",
    w: 800,
    h: 18,
    d: 450,
    fill: "#d7b58a",
    material: "Marine Plywood",
    unitPrice: 0,
    blueprintStyle: "profile_part",
  },
  {
    label: "Notched Board",
    type: "wood_profile_notch",
    category: "Custom Shape Parts",
    partRole: "custom_profile",
    w: 800,
    h: 18,
    d: 450,
    fill: "#d7b58a",
    material: "Marine Plywood",
    unitPrice: 0,
    blueprintStyle: "profile_part",
  },
  {
    label: "Circle / Oval Board",
    type: "wood_profile_oval",
    category: "Custom Shape Parts",
    partRole: "custom_profile",
    w: 700,
    h: 18,
    d: 450,
    fill: "#d7b58a",
    material: "Marine Plywood",
    unitPrice: 0,
    blueprintStyle: "profile_part",
  },
  {
    label: "Trapezoid Board",
    type: "wood_profile_trapezoid",
    category: "Custom Shape Parts",
    partRole: "custom_profile",
    w: 800,
    h: 18,
    d: 450,
    fill: "#d7b58a",
    material: "Marine Plywood",
    unitPrice: 0,
    blueprintStyle: "profile_part",
  },
  {
    label: "Custom Contour Board",
    type: "wood_profile_contour",
    category: "Custom Shape Parts",
    partRole: "custom_profile",
    w: 800,
    h: 18,
    d: 450,
    fill: "#d7b58a",
    material: "Marine Plywood",
    unitPrice: 0,
    blueprintStyle: "profile_part",
    profilePlane: "auto",
    profileContourPoints: [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.12],
      [0.18, 0.12],
      [0.18, 0.5],
      [-0.5, 0.5],
    ],
  },
];

function clampNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function cleanText(value) {
  return String(value ?? "").trim().toLowerCase();
}

const MAX_CONTOUR_POINTS = 24;
const DEFAULT_CONTOUR_POINT_RATIOS = Object.freeze([
  Object.freeze([-0.5, -0.5]),
  Object.freeze([0.5, -0.5]),
  Object.freeze([0.5, 0.12]),
  Object.freeze([0.18, 0.12]),
  Object.freeze([0.18, 0.5]),
  Object.freeze([-0.5, 0.5]),
]);

function cloneDefaultContourPointRatios() {
  return DEFAULT_CONTOUR_POINT_RATIOS.map(([u, v]) => [u, v]);
}

function normalizeContourPointRatios(value) {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }

  if (!Array.isArray(source)) {
    return cloneDefaultContourPointRatios();
  }

  const points = source
    .slice(0, MAX_CONTOUR_POINTS)
    .map((point) => {
      const rawU = Array.isArray(point)
        ? point[0]
        : point?.uRatio ?? point?.u ?? point?.x;
      const rawV = Array.isArray(point)
        ? point[1]
        : point?.vRatio ?? point?.v ?? point?.y;

      const u = clampNumber(rawU, -0.5, 0.5, 0);
      const v = clampNumber(rawV, -0.5, 0.5, 0);

      return [u, v];
    })
    .filter(
      (point, index, list) =>
        index === 0 ||
        Math.abs(point[0] - list[index - 1][0]) > 1e-6 ||
        Math.abs(point[1] - list[index - 1][1]) > 1e-6,
    );

  if (
    points.length > 2 &&
    Math.abs(points[0][0] - points[points.length - 1][0]) <= 1e-6 &&
    Math.abs(points[0][1] - points[points.length - 1][1]) <= 1e-6
  ) {
    points.pop();
  }

  return points.length >= 3 ? points : cloneDefaultContourPointRatios();
}

function contourSignedArea(points = []) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - next[0] * current[1];
  }

  return area / 2;
}

function contourOrientation(a, b, c) {
  const cross =
    (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);

  if (Math.abs(cross) <= 1e-8) return 0;
  return cross > 0 ? 1 : -1;
}

function contourPointOnSegment(a, b, point) {
  return (
    point[0] >= Math.min(a[0], b[0]) - 1e-8 &&
    point[0] <= Math.max(a[0], b[0]) + 1e-8 &&
    point[1] >= Math.min(a[1], b[1]) - 1e-8 &&
    point[1] <= Math.max(a[1], b[1]) + 1e-8
  );
}

function contourSegmentsIntersect(a, b, c, d) {
  const o1 = contourOrientation(a, b, c);
  const o2 = contourOrientation(a, b, d);
  const o3 = contourOrientation(c, d, a);
  const o4 = contourOrientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && contourPointOnSegment(a, b, c)) return true;
  if (o2 === 0 && contourPointOnSegment(a, b, d)) return true;
  if (o3 === 0 && contourPointOnSegment(c, d, a)) return true;
  if (o4 === 0 && contourPointOnSegment(c, d, b)) return true;

  return false;
}

function isValidContourPolygon(points = []) {
  if (!Array.isArray(points) || points.length < 3) return false;
  if (Math.abs(contourSignedArea(points)) <= 0.001) return false;

  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const current = points[index];
    const next = points[nextIndex];

    if (
      Math.hypot(next[0] - current[0], next[1] - current[1]) <= 0.002
    ) {
      return false;
    }
  }

  for (let aIndex = 0; aIndex < points.length; aIndex += 1) {
    const aNext = (aIndex + 1) % points.length;
    const a = points[aIndex];
    const b = points[aNext];

    for (let bIndex = aIndex + 1; bIndex < points.length; bIndex += 1) {
      const bNext = (bIndex + 1) % points.length;

      if (
        aIndex === bIndex ||
        aNext === bIndex ||
        bNext === aIndex
      ) {
        continue;
      }

      const c = points[bIndex];
      const d = points[bNext];

      if (contourSegmentsIntersect(a, b, c, d)) {
        return false;
      }
    }
  }

  return true;
}

function getContourPointRatios(component = {}) {
  const source =
    component && typeof component === "object" && !Array.isArray(component)
      ? component
      : {};

  const points = normalizeContourPointRatios(source.profileContourPoints);
  return isValidContourPolygon(points)
    ? points
    : cloneDefaultContourPointRatios();
}

function getContourPointsMm(component = {}) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return [];

  return descriptor.contourPointsMm.map(([u, v]) => [u, v]);
}

function updateContourPointMm(
  component = {},
  pointIndex = 0,
  nextUmm,
  nextVmm,
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const index = Math.max(
    0,
    Math.min(
      descriptor.profileContourPoints.length - 1,
      Number(pointIndex) || 0,
    ),
  );

  const current = descriptor.contourPointsMm[index];
  const uMm = Number.isFinite(Number(nextUmm))
    ? Number(nextUmm)
    : current[0];
  const vMm = Number.isFinite(Number(nextVmm))
    ? Number(nextVmm)
    : current[1];

  const candidate = descriptor.profileContourPoints.map(([u, v]) => [u, v]);

  candidate[index] = [
    clampNumber(uMm / descriptor.u, -0.5, 0.5, 0),
    clampNumber(vMm / descriptor.v, -0.5, 0.5, 0),
  ];

  return isValidContourPolygon(candidate)
    ? candidate
    : descriptor.profileContourPoints;
}

function insertContourPointAfter(component = {}, pointIndex = 0) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const points = descriptor.profileContourPoints.map(([u, v]) => [u, v]);
  if (points.length >= MAX_CONTOUR_POINTS) return points;

  const index = Math.max(
    0,
    Math.min(points.length - 1, Number(pointIndex) || 0),
  );
  const nextIndex = (index + 1) % points.length;
  const current = points[index];
  const next = points[nextIndex];

  const midpoint = [
    (current[0] + next[0]) / 2,
    (current[1] + next[1]) / 2,
  ];

  points.splice(index + 1, 0, midpoint);

  return isValidContourPolygon(points)
    ? points
    : descriptor.profileContourPoints;
}

function deleteContourPointAt(component = {}, pointIndex = 0) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const points = descriptor.profileContourPoints.map(([u, v]) => [u, v]);
  if (points.length <= 3) return points;

  const index = Math.max(
    0,
    Math.min(points.length - 1, Number(pointIndex) || 0),
  );

  points.splice(index, 1);

  return isValidContourPolygon(points)
    ? points
    : descriptor.profileContourPoints;
}

function resetContourPointRatios() {
  return cloneDefaultContourPointRatios();
}

const MAX_CONTOUR_CURVE_RATIO = 1;

function normalizeContourCurveRatios(value, pointCount = 0) {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }

  const count = Math.max(0, Number(pointCount) || 0);

  return Array.from({ length: count }, (_, index) =>
    clampNumber(
      Array.isArray(source) ? source[index] : 0,
      -MAX_CONTOUR_CURVE_RATIO,
      MAX_CONTOUR_CURVE_RATIO,
      0,
    ),
  );
}

function getCircularArcPoints(
  start,
  end,
  requestedBulgeMm = 0,
  segments = 12,
) {
  const x1 = Number(start?.[0]) || 0;
  const y1 = Number(start?.[1]) || 0;
  const x2 = Number(end?.[0]) || 0;
  const y2 = Number(end?.[1]) || 0;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const chord = Math.hypot(dx, dy);

  if (chord <= 1e-6) {
    return [[x1, y1]];
  }

  const maxBulge = chord * 0.49;
  const bulge = clampNumber(
    requestedBulgeMm,
    -maxBulge,
    maxBulge,
    0,
  );

  if (Math.abs(bulge) <= 0.01) {
    return [
      [x1, y1],
      [x2, y2],
    ];
  }

  const midpoint = [(x1 + x2) / 2, (y1 + y2) / 2];
  const normal = [-dy / chord, dx / chord];
  const absBulge = Math.abs(bulge);

  // Circle radius from chord length + signed sagitta.
  const radius =
    (chord * chord) / (8 * absBulge) + absBulge / 2;

  // Positive bulge is on the left side of start -> end.
  const centerOffset =
    Math.sign(bulge) * (absBulge - radius);

  const center = [
    midpoint[0] + normal[0] * centerOffset,
    midpoint[1] + normal[1] * centerOffset,
  ];

  const startAngle = Math.atan2(
    y1 - center[1],
    x1 - center[0],
  );
  const endAngle = Math.atan2(
    y2 - center[1],
    x2 - center[0],
  );

  let delta = endAngle - startAngle;

  if (bulge > 0) {
    while (delta >= 0) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
  } else {
    while (delta <= 0) delta += Math.PI * 2;
    if (delta > Math.PI) delta -= Math.PI * 2;
  }

  const steps = Math.max(4, Number(segments) || 12);

  return Array.from({ length: steps + 1 }, (_, index) => {
    const ratio = index / steps;
    const angle = startAngle + delta * ratio;

    return [
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ];
  });
}

function buildContourCurvedPath(
  points = [],
  curveRatios = [],
  curveScaleMm = 1,
  segments = 12,
) {
  if (!Array.isArray(points) || points.length < 3) return [];

  const result = [];

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const ratio = Number(curveRatios[index]) || 0;
    const requestedBulge = ratio * Math.max(1, curveScaleMm);
    const arcPoints = getCircularArcPoints(
      start,
      end,
      requestedBulge,
      segments,
    );

    arcPoints.forEach((point) => appendUniquePoint(result, point));
  }

  if (
    result.length > 2 &&
    pointDistance(result[0], result[result.length - 1]) <= 1e-5
  ) {
    result.pop();
  }

  return result;
}

function getContourCurvePathPointsMm(
  component = {},
  segments = 12,
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return [];

  return buildContourProfilePath(
    descriptor,
    segments,
  );
}

function getContourEdgeCurveInfo(
  component = {},
  edgeIndex = 0,
  segments = 14,
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const count = descriptor.contourPointsMm.length;
  if (!count) return null;

  const index = Math.max(
    0,
    Math.min(count - 1, Number(edgeIndex) || 0),
  );
  const nextIndex = (index + 1) % count;
  const start = descriptor.contourPointsMm[index];
  const end = descriptor.contourPointsMm[nextIndex];

  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const chordMm = Math.max(0.001, Math.hypot(dx, dy));
  const maxBulgeMm = chordMm * 0.49;

  const requestedBulge =
    (Number(descriptor.profileContourBulges[index]) || 0) *
    descriptor.contourCurveScaleMm;

  const bulgeMm = clampNumber(
    requestedBulge,
    -maxBulgeMm,
    maxBulgeMm,
    0,
  );

  const absBulge = Math.abs(bulgeMm);
  const radiusMm =
    absBulge <= 0.01
      ? null
      : (chordMm * chordMm) / (8 * absBulge) +
        absBulge / 2;

  const normal = [-dy / chordMm, dx / chordMm];
  const midpoint = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
  ];
  const sagittaPoint = [
    midpoint[0] + normal[0] * bulgeMm,
    midpoint[1] + normal[1] * bulgeMm,
  ];

  return {
    index,
    nextIndex,
    start,
    end,
    chordMm,
    bulgeMm,
    radiusMm,
    maxBulgeMm,
    minRadiusMm: chordMm / 2,
    sagittaPoint,
    isCurved: absBulge > 0.01,
    side: bulgeMm < 0 ? -1 : 1,
    arcPoints: getCircularArcPoints(
      start,
      end,
      bulgeMm,
      segments,
    ),
  };
}

function validateContourCurveRatios(
  descriptor,
  candidateRatios,
) {
  const path = buildContourCurvedPath(
    descriptor.contourPointsMm,
    candidateRatios,
    descriptor.contourCurveScaleMm,
    8,
  );

  return isValidContourPolygon(path);
}

function updateContourEdgeBulgeMm(
  component = {},
  edgeIndex = 0,
  nextBulgeMm = 0,
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const info = getContourEdgeCurveInfo(component, edgeIndex);
  if (!info) return descriptor.profileContourBulges;

  const clampedBulge = clampNumber(
    nextBulgeMm,
    -info.maxBulgeMm,
    info.maxBulgeMm,
    0,
  );

  const candidate = [...descriptor.profileContourBulges];
  candidate[info.index] = clampNumber(
    clampedBulge / descriptor.contourCurveScaleMm,
    -MAX_CONTOUR_CURVE_RATIO,
    MAX_CONTOUR_CURVE_RATIO,
    0,
  );

  return validateContourCurveRatios(descriptor, candidate)
    ? candidate
    : descriptor.profileContourBulges;
}

function updateContourEdgeRadiusMm(
  component = {},
  edgeIndex = 0,
  nextRadiusMm = 0,
  requestedSide = null,
) {
  const info = getContourEdgeCurveInfo(component, edgeIndex);
  if (!info) return null;

  const numericRadius = Number(nextRadiusMm);

  if (!Number.isFinite(numericRadius) || numericRadius <= 0) {
    return updateContourEdgeBulgeMm(component, edgeIndex, 0);
  }

  const radius = Math.max(info.minRadiusMm, numericRadius);
  const halfChord = info.chordMm / 2;
  const root = Math.sqrt(
    Math.max(0, radius * radius - halfChord * halfChord),
  );
  const sagitta = Math.max(0, radius - root);
  const side =
    requestedSide === -1 || requestedSide === 1
      ? requestedSide
      : info.side;

  return updateContourEdgeBulgeMm(
    component,
    edgeIndex,
    sagitta * side,
  );
}

function insertContourCurveAfter(component = {}, pointIndex = 0) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const curves = [...descriptor.profileContourBulges];
  const index = Math.max(
    0,
    Math.min(curves.length - 1, Number(pointIndex) || 0),
  );

  // One curved edge becomes two straight edges after topology changes.
  curves[index] = 0;
  curves.splice(index + 1, 0, 0);

  return curves;
}

function deleteContourCurveAt(component = {}, pointIndex = 0) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const curves = [...descriptor.profileContourBulges];
  if (curves.length <= 3) return curves;

  const index = Math.max(
    0,
    Math.min(curves.length - 1, Number(pointIndex) || 0),
  );

  curves.splice(index, 1);

  if (index === 0) {
    curves[curves.length - 1] = 0;
  } else {
    curves[index - 1] = 0;
  }

  return curves;
}

function resetContourCurvesAroundPoint(
  component = {},
  pointIndex = 0,
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const curves = [...descriptor.profileContourBulges];
  if (!curves.length) return curves;

  const index = Math.max(
    0,
    Math.min(curves.length - 1, Number(pointIndex) || 0),
  );
  const previousEdge =
    (index - 1 + curves.length) % curves.length;

  curves[previousEdge] = 0;
  curves[index] = 0;

  return curves;
}

function resetContourCurveRatios(pointCount = 0) {
  return Array.from(
    { length: Math.max(0, Number(pointCount) || 0) },
    () => 0,
  );
}

const MAX_PROFILE_CUTOUTS = 12;
const PROFILE_CUTOUT_TYPES = new Set(["round", "rect"]);

function makeProfileCutoutId() {
  return `cutout_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeProfileCutouts(value, axes = {}) {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }

  if (!Array.isArray(source)) return [];

  const defaultSize = Math.max(
    20,
    Math.min(80, Math.min(Number(axes.u) || 450, Number(axes.v) || 450) * 0.16),
  );

  return source
    .slice(0, MAX_PROFILE_CUTOUTS)
    .map((item, index) => {
      const type = PROFILE_CUTOUT_TYPES.has(
        cleanText(item?.type),
      )
        ? cleanText(item.type)
        : "round";

      const id =
        String(item?.id || "").trim() ||
        `cutout_${index + 1}`;

      return {
        id,
        type,
        u: clampNumber(item?.u, -100000, 100000, 0),
        v: clampNumber(item?.v, -100000, 100000, 0),
        diameter: clampNumber(
          item?.diameter,
          1,
          100000,
          defaultSize,
        ),
        width: clampNumber(
          item?.width,
          1,
          100000,
          defaultSize * 1.5,
        ),
        height: clampNumber(
          item?.height,
          1,
          100000,
          defaultSize,
        ),
      };
    });
}

function createProfileCutout(component = {}, type = "round") {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) return null;

  const normalizedType = cleanText(type) === "rect" ? "rect" : "round";
  const minEdge = Math.max(
    20,
    Math.min(descriptor.u, descriptor.v),
  );
  const baseSize = Math.max(20, Math.min(80, minEdge * 0.16));

  return {
    id: makeProfileCutoutId(),
    type: normalizedType,
    u: 0,
    v: 0,
    diameter: baseSize,
    width: Math.max(30, Math.min(140, baseSize * 1.5)),
    height: baseSize,
  };
}

function updateProfileCutout(
  component = {},
  cutoutId = "",
  attrs = {},
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) return null;

  const id = String(cutoutId || "");

  return normalizeProfileCutouts(
    descriptor.profileCutouts.map((item) =>
      item.id === id ? { ...item, ...attrs, id: item.id } : item,
    ),
    descriptor,
  );
}

function deleteProfileCutout(component = {}, cutoutId = "") {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) return null;

  const id = String(cutoutId || "");
  return descriptor.profileCutouts.filter((item) => item.id !== id);
}

function getProfileCutoutLocalPoints(
  cutout = {},
  segments = 36,
) {
  const type = cleanText(cutout?.type);

  if (type === "rect") {
    const halfW = Math.max(0.5, Number(cutout.width) || 1) / 2;
    const halfH = Math.max(0.5, Number(cutout.height) || 1) / 2;
    const u = Number(cutout.u) || 0;
    const v = Number(cutout.v) || 0;

    return [
      [u - halfW, v - halfH],
      [u + halfW, v - halfH],
      [u + halfW, v + halfH],
      [u - halfW, v + halfH],
    ];
  }

  const radius = Math.max(
    0.5,
    (Number(cutout.diameter) || 1) / 2,
  );
  const u = Number(cutout.u) || 0;
  const v = Number(cutout.v) || 0;
  const steps = Math.max(16, Number(segments) || 36);

  return Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    return [
      u + Math.cos(angle) * radius,
      v + Math.sin(angle) * radius,
    ];
  });
}

function pointInPolygon2(point, polygon = []) {
  const x = Number(point?.[0]) || 0;
  const y = Number(point?.[1]) || 0;
  let inside = false;

  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const xi = Number(polygon[index]?.[0]) || 0;
    const yi = Number(polygon[index]?.[1]) || 0;
    const xj = Number(polygon[previous]?.[0]) || 0;
    const yj = Number(polygon[previous]?.[1]) || 0;

    const onEdge =
      contourOrientation(
        [xi, yi],
        [xj, yj],
        [x, y],
      ) === 0 &&
      contourPointOnSegment(
        [xi, yi],
        [xj, yj],
        [x, y],
      );

    if (onEdge) return true;

    // Standard ray casting. Preserve the SIGN of (yj - yi).
    // The previous Math.max(1e-12, yj - yi) turned every negative
    // denominator into a tiny positive number and produced false OUTSIDE
    // results on many polygon edges (especially obvious on oval boards).
    const crossesHorizontalRay = (yi > y) !== (yj > y);
    if (!crossesHorizontalRay) continue;

    const denominator = yj - yi;
    if (Math.abs(denominator) <= 1e-12) continue;

    const intersectionX =
      xi + ((xj - xi) * (y - yi)) / denominator;

    if (x < intersectionX) {
      inside = !inside;
    }
  }

  return inside;
}

function polygonsIntersect2(a = [], b = []) {
  if (a.length < 3 || b.length < 3) return false;

  for (let ai = 0; ai < a.length; ai += 1) {
    const aNext = (ai + 1) % a.length;

    for (let bi = 0; bi < b.length; bi += 1) {
      const bNext = (bi + 1) % b.length;

      if (
        contourSegmentsIntersect(
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
    pointInPolygon2(a[0], b) ||
    pointInPolygon2(b[0], a)
  );
}

function isCutoutInsideOuterProfile(
  outerPoints = [],
  cutoutPoints = [],
) {
  if (outerPoints.length < 3 || cutoutPoints.length < 3) {
    return false;
  }

  if (
    !cutoutPoints.every((point) =>
      pointInPolygon2(point, outerPoints),
    )
  ) {
    return false;
  }

  for (let ci = 0; ci < cutoutPoints.length; ci += 1) {
    const cNext = (ci + 1) % cutoutPoints.length;

    for (let oi = 0; oi < outerPoints.length; oi += 1) {
      const oNext = (oi + 1) % outerPoints.length;

      if (
        contourSegmentsIntersect(
          cutoutPoints[ci],
          cutoutPoints[cNext],
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

function getProfileCutoutStatus(
  component = {},
  cutoutOrId = "",
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) {
    return {
      valid: false,
      code: "no_profile",
      message: "No woodworking profile is available.",
    };
  }

  const cutout =
    typeof cutoutOrId === "object" && cutoutOrId
      ? cutoutOrId
      : descriptor.profileCutouts.find(
          (item) => item.id === String(cutoutOrId || ""),
        );

  if (!cutout) {
    return {
      valid: false,
      code: "missing",
      message: "Cutout not found.",
    };
  }

  const outerPoints = getWoodworkingProfileLocalPoints(
    component,
    {
      curveSegments: 48,
      cornerSegments: 10,
      filletSegments: 10,
    },
  );

  const cutoutPoints = getProfileCutoutLocalPoints(
    cutout,
    36,
  );

  if (
    !isCutoutInsideOuterProfile(
      outerPoints || [],
      cutoutPoints,
    )
  ) {
    return {
      valid: false,
      code: "outside",
      message:
        "Cutout must stay fully inside the board profile.",
    };
  }

  const collides = descriptor.profileCutouts.some((other) => {
    if (other.id === cutout.id) return false;

    const otherPoints = getProfileCutoutLocalPoints(other, 36);

    // Do not let an already-invalid outside cutout make an otherwise valid
    // cutout fail with an overlap error. Only internal cutouts participate
    // in cutout-to-cutout collision validation.
    if (
      !isCutoutInsideOuterProfile(
        outerPoints || [],
        otherPoints,
      )
    ) {
      return false;
    }

    return polygonsIntersect2(
      cutoutPoints,
      otherPoints,
    );
  });

  if (collides) {
    return {
      valid: false,
      code: "overlap",
      message: "Cutouts cannot overlap each other.",
    };
  }

  return {
    valid: true,
    code: "ok",
    message: "Valid internal through-cutout.",
  };
}

function getValidProfileCutouts(component = {}) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) return [];

  return descriptor.profileCutouts.filter(
    (item) => getProfileCutoutStatus(component, item).valid,
  );
}

function getWoodworkingProfile2DCutouts(
  component = {},
  view = "front",
  box = {},
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) return [];

  if (getProjectionPlaneForView(view) !== descriptor.plane) {
    return [];
  }

  const boxWidth = Math.max(1, Number(box.w) || 1);
  const boxHeight = Math.max(1, Number(box.h) || 1);
  const mirrorU = view === "back" || view === "right";

  return descriptor.profileCutouts.map((cutout) => {
    const status = getProfileCutoutStatus(component, cutout);
    const localPoints = getProfileCutoutLocalPoints(
      cutout,
      36,
    );

    const points = localPoints.flatMap(([rawU, rawV]) => {
      const localU = mirrorU ? -rawU : rawU;
      return [
        (localU / descriptor.u + 0.5) * boxWidth,
        (0.5 - rawV / descriptor.v) * boxHeight,
      ];
    });

    return {
      ...cutout,
      valid: status.valid,
      status,
      points,
    };
  });
}

const MAX_PROFILE_EDGE_NOTCHES = 8;

function makeProfileEdgeNotchId() {
  return `edge_notch_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeProfileEdgeNotches(value, pointCount = 0) {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }

  if (!Array.isArray(source)) return [];

  const count = Math.max(0, Number(pointCount) || 0);

  return source
    .slice(0, MAX_PROFILE_EDGE_NOTCHES)
    .map((item, index) => ({
      id:
        String(item?.id || "").trim() ||
        `edge_notch_${index + 1}`,
      edgeIndex: Math.max(
        0,
        Math.min(
          Math.max(0, count - 1),
          Math.floor(Number(item?.edgeIndex) || 0),
        ),
      ),
      offset: clampNumber(item?.offset, 0, 100000, 20),
      width: clampNumber(item?.width, 1, 100000, 80),
      depth: clampNumber(item?.depth, 1, 100000, 40),
    }));
}

function getDescriptorContourEdgeInfo(
  descriptor,
  edgeIndex = 0,
) {
  if (!descriptor || descriptor.kind !== "contour") return null;

  const count = descriptor.contourPointsMm.length;
  if (!count) return null;

  const index = Math.max(
    0,
    Math.min(count - 1, Number(edgeIndex) || 0),
  );
  const nextIndex = (index + 1) % count;
  const start = descriptor.contourPointsMm[index];
  const end = descriptor.contourPointsMm[nextIndex];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthMm = Math.max(0.001, Math.hypot(dx, dy));
  const curveRatio =
    Number(descriptor.profileContourBulges[index]) || 0;

  return {
    index,
    nextIndex,
    start,
    end,
    dx,
    dy,
    lengthMm,
    isCurved: Math.abs(curveRatio) > 1e-6,
  };
}

function buildContourPathWithEdgeNotchesRaw(
  descriptor,
  edgeNotches = [],
  segments = 12,
) {
  const points = descriptor?.contourPointsMm || [];
  if (points.length < 3) return [];

  const result = [];
  const orientation = contourSignedArea(points) >= 0 ? 1 : -1;
  const grouped = new Map();

  edgeNotches.forEach((notch) => {
    const edgeIndex = Math.max(
      0,
      Math.min(points.length - 1, Number(notch.edgeIndex) || 0),
    );
    if (!grouped.has(edgeIndex)) grouped.set(edgeIndex, []);
    grouped.get(edgeIndex).push(notch);
  });

  grouped.forEach((items) =>
    items.sort(
      (a, b) =>
        (Number(a.offset) || 0) - (Number(b.offset) || 0),
    ),
  );

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const ratio =
      Number(descriptor.profileContourBulges[index]) || 0;

    if (Math.abs(ratio) > 1e-6) {
      const arcPoints = getCircularArcPoints(
        start,
        end,
        ratio * descriptor.contourCurveScaleMm,
        segments,
      );
      arcPoints.forEach((point) =>
        appendUniquePoint(result, point),
      );
      continue;
    }

    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const dir = [dx / length, dy / length];
    const inward =
      orientation > 0
        ? [-dir[1], dir[0]]
        : [dir[1], -dir[0]];

    appendUniquePoint(result, start);

    const items = grouped.get(index) || [];
    let cursor = 0;

    items.forEach((notch) => {
      const offset = Number(notch.offset) || 0;
      const width = Math.max(1, Number(notch.width) || 1);
      const depth = Math.max(1, Number(notch.depth) || 1);
      const exit = offset + width;

      if (
        offset < 1 ||
        exit > length - 1 ||
        offset < cursor + 1
      ) {
        return;
      }

      const outerA = [
        start[0] + dir[0] * offset,
        start[1] + dir[1] * offset,
      ];
      const innerA = [
        outerA[0] + inward[0] * depth,
        outerA[1] + inward[1] * depth,
      ];
      const outerB = [
        start[0] + dir[0] * exit,
        start[1] + dir[1] * exit,
      ];
      const innerB = [
        outerB[0] + inward[0] * depth,
        outerB[1] + inward[1] * depth,
      ];

      appendUniquePoint(result, outerA);
      appendUniquePoint(result, innerA);
      appendUniquePoint(result, innerB);
      appendUniquePoint(result, outerB);

      cursor = exit;
    });

    appendUniquePoint(result, end);
  }

  if (
    result.length > 2 &&
    pointDistance(result[0], result[result.length - 1]) <= 1e-5
  ) {
    result.pop();
  }

  return result;
}

function getRenderableProfileEdgeNotchesFromDescriptor(
  descriptor,
  segments = 12,
) {
  if (!descriptor || descriptor.kind !== "contour") return [];

  const accepted = [];

  descriptor.profileEdgeNotches.forEach((notch) => {
    const edge = getDescriptorContourEdgeInfo(
      descriptor,
      notch.edgeIndex,
    );
    if (!edge || edge.isCurved) return;

    const offset = Number(notch.offset) || 0;
    const width = Math.max(1, Number(notch.width) || 1);
    const depth = Math.max(1, Number(notch.depth) || 1);

    if (
      offset < 1 ||
      offset + width > edge.lengthMm - 1 ||
      depth <= 0
    ) {
      return;
    }

    const overlaps = accepted.some((other) => {
      if (other.edgeIndex !== notch.edgeIndex) return false;
      const a0 = offset;
      const a1 = offset + width;
      const b0 = Number(other.offset) || 0;
      const b1 = b0 + (Number(other.width) || 0);
      return Math.max(a0, b0) < Math.min(a1, b1) + 1;
    });

    if (overlaps) return;

    const candidate = [...accepted, notch];
    const candidatePath = buildContourPathWithEdgeNotchesRaw(
      descriptor,
      candidate,
      segments,
    );

    if (isValidContourPolygon(candidatePath)) {
      accepted.push(notch);
    }
  });

  return accepted;
}

function buildContourProfilePath(
  descriptor,
  segments = 12,
) {
  if (!descriptor || descriptor.kind !== "contour") return [];

  const renderableNotches =
    getRenderableProfileEdgeNotchesFromDescriptor(
      descriptor,
      segments,
    );

  return buildContourPathWithEdgeNotchesRaw(
    descriptor,
    renderableNotches,
    segments,
  );
}

function createProfileEdgeNotch(
  component = {},
  edgeIndex = 0,
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const edge = getDescriptorContourEdgeInfo(
    descriptor,
    edgeIndex,
  );
  if (!edge || edge.isCurved) return null;

  const width = Math.max(
    20,
    Math.min(120, edge.lengthMm * 0.25),
  );
  const depth = Math.max(
    10,
    Math.min(60, Math.min(descriptor.u, descriptor.v) * 0.14),
  );
  const offset = Math.max(
    1,
    (edge.lengthMm - width) / 2,
  );

  return {
    id: makeProfileEdgeNotchId(),
    edgeIndex: edge.index,
    offset,
    width,
    depth,
  };
}

function updateProfileEdgeNotch(
  component = {},
  notchId = "",
  attrs = {},
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const id = String(notchId || "");

  return normalizeProfileEdgeNotches(
    descriptor.profileEdgeNotches.map((item) =>
      item.id === id
        ? { ...item, ...attrs, id: item.id }
        : item,
    ),
    descriptor.contourPointsMm.length,
  );
}

function deleteProfileEdgeNotch(
  component = {},
  notchId = "",
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") return null;

  const id = String(notchId || "");
  return descriptor.profileEdgeNotches.filter(
    (item) => item.id !== id,
  );
}

function getProfileEdgeNotchStatus(
  component = {},
  notchOrId = "",
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor || descriptor.kind !== "contour") {
    return {
      valid: false,
      code: "no_contour",
      message: "Edge notches require a Custom Contour Board.",
    };
  }

  const notch =
    typeof notchOrId === "object" && notchOrId
      ? notchOrId
      : descriptor.profileEdgeNotches.find(
          (item) => item.id === String(notchOrId || ""),
        );

  if (!notch) {
    return {
      valid: false,
      code: "missing",
      message: "Edge notch not found.",
    };
  }

  const edge = getDescriptorContourEdgeInfo(
    descriptor,
    notch.edgeIndex,
  );

  if (!edge) {
    return {
      valid: false,
      code: "edge_missing",
      message: "Selected contour edge is unavailable.",
    };
  }

  if (edge.isCurved) {
    return {
      valid: false,
      code: "curved_edge",
      message: "Straighten this edge before applying its notch.",
    };
  }

  const offset = Number(notch.offset) || 0;
  const width = Math.max(1, Number(notch.width) || 1);

  if (
    offset < 1 ||
    offset + width > edge.lengthMm - 1
  ) {
    return {
      valid: false,
      code: "outside_edge",
      message:
        "Notch must stay inside the selected edge with a small end margin.",
    };
  }

  const renderable =
    getRenderableProfileEdgeNotchesFromDescriptor(
      descriptor,
      12,
    );

  if (!renderable.some((item) => item.id === notch.id)) {
    return {
      valid: false,
      code: "collision",
      message:
        "Notch overlaps another notch or cuts across the contour.",
    };
  }

  return {
    valid: true,
    code: "ok",
    message: "Valid rectangular boundary notch.",
  };
}

function getValidProfileEdgeNotches(component = {}) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  return getRenderableProfileEdgeNotchesFromDescriptor(
    descriptor,
    12,
  );
}

function getProfileKind(component = {}) {
  // React inspector can call this helper while there is temporarily no
  // selected component. Default parameters do not protect against explicit
  // null, so normalize the input before reading profile fields.
  const source =
    component && typeof component === "object" && !Array.isArray(component)
      ? component
      : {};

  const explicit = cleanText(source.profileKind);
  if (VALID_PROFILE_KINDS.has(explicit)) return explicit;
  return PROFILE_KIND_BY_TYPE[source.type] || "";
}

function isWoodworkingProfileType(type = "") {
  return Boolean(PROFILE_KIND_BY_TYPE[String(type || "")]);
}

function isWoodworkingProfileComponent(component = {}) {
  return Boolean(getProfileKind(component));
}

function getRequestedProfilePlane(component = {}) {
  const value = cleanText(component.profilePlane);
  return VALID_PROFILE_PLANES.has(value) ? value : "auto";
}

function inferProfilePlane(component = {}) {
  const width = Math.max(1, Number(component.width) || 1);
  const height = Math.max(1, Number(component.height) || 1);
  const depth = Math.max(1, Number(component.depth) || 1);

  // The thinnest local dimension is treated as board thickness.
  // depth -> front/back profile (XY)
  // height -> top/bottom profile (XZ)
  // width -> left/right profile (YZ)
  if (depth <= height && depth <= width) return "xy";
  if (height <= width && height <= depth) return "xz";
  return "yz";
}

function resolveProfilePlane(component = {}) {
  const requested = getRequestedProfilePlane(component);
  return requested === "auto" ? inferProfilePlane(component) : requested;
}

function getProfileAxisDimensions(component = {}, plane = resolveProfilePlane(component)) {
  const width = Math.max(1, Number(component.width) || 1);
  const height = Math.max(1, Number(component.height) || 1);
  const depth = Math.max(1, Number(component.depth) || 1);

  if (plane === "xy") {
    return {
      plane,
      u: width,
      v: height,
      thickness: depth,
      uAxis: "width",
      vAxis: "height",
      thicknessAxis: "depth",
    };
  }

  if (plane === "yz") {
    return {
      plane,
      u: depth,
      v: height,
      thickness: width,
      uAxis: "depth",
      vAxis: "height",
      thicknessAxis: "width",
    };
  }

  return {
    plane: "xz",
    u: width,
    v: depth,
    thickness: height,
    uAxis: "width",
    vAxis: "depth",
    thicknessAxis: "height",
  };
}

function supportsProfileFillet(kind = "") {
  return ["rectangle", "chamfer", "notch", "trapezoid", "contour"].includes(
    String(kind || "").toLowerCase(),
  );
}

function getWoodworkingProfileDescriptor(component = {}) {
  const kind = getProfileKind(component);
  if (!kind) return null;

  const requestedPlane = getRequestedProfilePlane(component);
  const plane = resolveProfilePlane(component);
  const axes = getProfileAxisDimensions(component, plane);
  const minProfileEdge = Math.max(1, Math.min(axes.u, axes.v));

  const radiusMax = Math.max(0, minProfileEdge / 2 - 0.5);
  const defaultRadius = Math.min(60, minProfileEdge * 0.12);
  const radius = clampNumber(
    component.profileRadius,
    0,
    radiusMax,
    defaultRadius,
  );

  const chamferMax = Math.max(0, minProfileEdge / 2 - 0.5);
  const defaultChamfer = Math.min(60, minProfileEdge * 0.12);
  const chamferSize = clampNumber(
    component.chamferSize,
    0,
    chamferMax,
    defaultChamfer,
  );

  const notchEdgeRaw = cleanText(component.notchEdge);
  const notchEdge = VALID_NOTCH_EDGES.has(notchEdgeRaw)
    ? notchEdgeRaw
    : "right";

  const notchRunsAlongU = notchEdge === "top" || notchEdge === "bottom";
  const notchSpanMax = Math.max(
    1,
    (notchRunsAlongU ? axes.u : axes.v) * 0.8,
  );
  const notchDepthMax = Math.max(
    1,
    (notchRunsAlongU ? axes.v : axes.u) * 0.8,
  );

  const notchWidth = clampNumber(
    component.notchWidth,
    1,
    notchSpanMax,
    Math.min(160, notchSpanMax * 0.35),
  );
  const notchDepth = clampNumber(
    component.notchDepth,
    1,
    notchDepthMax,
    Math.min(100, notchDepthMax * 0.25),
  );

  const profileTopRatio = clampNumber(
    component.profileTopRatio,
    0.05,
    1,
    0.65,
  );

  // 100 = true ellipse/oval. Lower values make the outline more
  // rounded-rect-like while preserving the same width/depth envelope.
  const profileOvalRoundness = clampNumber(
    component.profileOvalRoundness,
    0,
    100,
    100,
  );

  const profileContourPoints =
    kind === "contour"
      ? getContourPointRatios(component)
      : [];

  const contourPointsMm =
    kind === "contour"
      ? profileContourPoints.map(([uRatio, vRatio]) => [
          uRatio * axes.u,
          vRatio * axes.v,
        ])
      : [];

  const profileContourBulges =
    kind === "contour"
      ? normalizeContourCurveRatios(
          component.profileContourBulges,
          profileContourPoints.length,
        )
      : [];

  // Signed contour-edge bulges are saved relative to the smaller profile
  // dimension so resizing the board scales its arc geometry parametrically.
  const contourCurveScaleMm = minProfileEdge;
  const hasContourCurves = profileContourBulges.some(
    (value) => Math.abs(Number(value) || 0) > 1e-6,
  );

  const profileCutouts = normalizeProfileCutouts(
    component.profileCutouts,
    axes,
  );

  const profileEdgeNotches =
    kind === "contour"
      ? normalizeProfileEdgeNotches(
          component.profileEdgeNotches,
          profileContourPoints.length,
        )
      : [];

  const filletRadiusMax = Math.max(0, minProfileEdge / 2 - 0.5);
  const profileFilletRadius = supportsProfileFillet(kind)
    ? clampNumber(
        component.profileFilletRadius,
        0,
        filletRadiusMax,
        0,
      )
    : 0;

  return {
    version: WOODWORKING_PROFILE_VERSION,
    kind,
    label: PROFILE_KIND_LABELS[kind] || "Custom Board",
    requestedPlane,
    plane,
    ...axes,
    radius,
    chamferSize,
    notchEdge,
    notchWidth,
    notchDepth,
    profileTopRatio,
    profileOvalRoundness,
    profileContourPoints,
    contourPointsMm,
    profileContourBulges,
    contourCurveScaleMm,
    hasContourCurves,
    profileCutouts,
    profileEdgeNotches,
    profileFilletRadius,
    limits: {
      radiusMax,
      chamferMax,
      notchSpanMax,
      notchDepthMax,
      filletRadiusMax,
    },
  };
}

function normalizeWoodworkingProfileMetadata(component = {}) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) return null;

  return {
    profileVersion: Math.max(
      WOODWORKING_PROFILE_VERSION,
      Number(component.profileVersion) || 0,
    ),
    profileKind: descriptor.kind,
    // Keep "auto" saved so the profile follows the thinnest dimension after
    // future Width / Height / Depth edits.
    profilePlane: descriptor.requestedPlane,
    profileRadius: descriptor.radius,
    chamferSize: descriptor.chamferSize,
    notchEdge: descriptor.notchEdge,
    notchWidth: descriptor.notchWidth,
    notchDepth: descriptor.notchDepth,
    profileTopRatio: descriptor.profileTopRatio,
    profileOvalRoundness: descriptor.profileOvalRoundness,
    ...(descriptor.kind === "contour"
      ? {
          profileContourPoints: descriptor.profileContourPoints.map(
            ([u, v]) => [u, v],
          ),
          profileContourBulges: [...descriptor.profileContourBulges],
          profileEdgeNotches: descriptor.profileEdgeNotches.map(
            (item) => ({ ...item }),
          ),
        }
      : {}),
    profileCutouts: descriptor.profileCutouts.map((item) => ({
      ...item,
    })),
    profileFilletRadius: descriptor.profileFilletRadius,
  };
}

function pushArc(points, cx, cy, radius, startAngle, endAngle, segments = 6) {
  const steps = Math.max(2, Number(segments) || 6);

  for (let i = 0; i <= steps; i += 1) {
    const ratio = i / steps;
    const angle = startAngle + (endAngle - startAngle) * ratio;
    points.push([
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
    ]);
  }
}

function pointDistance(a, b) {
  return Math.hypot(
    Number(a?.[0] || 0) - Number(b?.[0] || 0),
    Number(a?.[1] || 0) - Number(b?.[1] || 0),
  );
}

function normalizeVector2(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 1e-9) return null;
  return [x / length, y / length];
}

function cross2(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}

function lineIntersection2(pointA, dirA, pointB, dirB) {
  const denominator = cross2(dirA, dirB);
  if (Math.abs(denominator) <= 1e-9) return null;

  const delta = [
    pointB[0] - pointA[0],
    pointB[1] - pointA[1],
  ];

  const t = cross2(delta, dirB) / denominator;

  return [
    pointA[0] + dirA[0] * t,
    pointA[1] + dirA[1] * t,
  ];
}

function projectPointToLine2(point, linePoint, lineDir) {
  const t =
    (point[0] - linePoint[0]) * lineDir[0] +
    (point[1] - linePoint[1]) * lineDir[1];

  return [
    linePoint[0] + lineDir[0] * t,
    linePoint[1] + lineDir[1] * t,
  ];
}

function appendUniquePoint(points, point) {
  const last = points[points.length - 1];

  if (
    last &&
    Math.abs(last[0] - point[0]) <= 1e-6 &&
    Math.abs(last[1] - point[1]) <= 1e-6
  ) {
    return;
  }

  points.push(point);
}

function applyPolygonFillet(points = [], requestedRadius = 0, segments = 7) {
  const source = Array.isArray(points) ? points : [];
  const radius = Math.max(0, Number(requestedRadius) || 0);

  if (source.length < 3 || radius <= 0) {
    return source;
  }

  const result = [];
  const steps = Math.max(3, Number(segments) || 7);

  for (let index = 0; index < source.length; index += 1) {
    const previous = source[(index - 1 + source.length) % source.length];
    const current = source[index];
    const next = source[(index + 1) % source.length];

    const incoming = normalizeVector2(
      current[0] - previous[0],
      current[1] - previous[1],
    );
    const outgoing = normalizeVector2(
      next[0] - current[0],
      next[1] - current[1],
    );

    if (!incoming || !outgoing) {
      appendUniquePoint(result, current);
      continue;
    }

    const turn = cross2(incoming, outgoing);

    if (Math.abs(turn) <= 1e-7) {
      appendUniquePoint(result, current);
      continue;
    }

    // For convex corners the center is on the material/interior side.
    // For concave corners (for example an inside notch) it is on the
    // opposite side. Using the turn sign keeps both cases exact.
    const side = turn > 0 ? 1 : -1;
    const normalIncoming = [
      -incoming[1] * side,
      incoming[0] * side,
    ];
    const normalOutgoing = [
      -outgoing[1] * side,
      outgoing[0] * side,
    ];

    const offsetIncoming = [
      current[0] + normalIncoming[0],
      current[1] + normalIncoming[1],
    ];
    const offsetOutgoing = [
      current[0] + normalOutgoing[0],
      current[1] + normalOutgoing[1],
    ];

    const unitCenter = lineIntersection2(
      offsetIncoming,
      incoming,
      offsetOutgoing,
      outgoing,
    );

    if (!unitCenter) {
      appendUniquePoint(result, current);
      continue;
    }

    const unitTangentIncoming = projectPointToLine2(
      unitCenter,
      current,
      incoming,
    );
    const unitTangentOutgoing = projectPointToLine2(
      unitCenter,
      current,
      outgoing,
    );

    const tangentPerRadius = Math.max(
      pointDistance(current, unitTangentIncoming),
      pointDistance(current, unitTangentOutgoing),
      1e-6,
    );

    const incomingLength = pointDistance(previous, current);
    const outgoingLength = pointDistance(current, next);

    // Prevent adjacent fillets from crossing each other on short edges.
    const maxRadiusForEdges =
      Math.min(incomingLength, outgoingLength) * 0.45 / tangentPerRadius;

    const effectiveRadius = Math.max(
      0,
      Math.min(radius, maxRadiusForEdges),
    );

    if (effectiveRadius <= 1e-6) {
      appendUniquePoint(result, current);
      continue;
    }

    const center = [
      current[0] + (unitCenter[0] - current[0]) * effectiveRadius,
      current[1] + (unitCenter[1] - current[1]) * effectiveRadius,
    ];

    const tangentIncoming = projectPointToLine2(
      center,
      current,
      incoming,
    );
    const tangentOutgoing = projectPointToLine2(
      center,
      current,
      outgoing,
    );

    const arcRadius = pointDistance(center, tangentIncoming);
    let startAngle = Math.atan2(
      tangentIncoming[1] - center[1],
      tangentIncoming[0] - center[0],
    );
    let endAngle = Math.atan2(
      tangentOutgoing[1] - center[1],
      tangentOutgoing[0] - center[0],
    );
    let delta = endAngle - startAngle;

    if (turn > 0) {
      while (delta <= 0) delta += Math.PI * 2;
    } else {
      while (delta >= 0) delta -= Math.PI * 2;
    }

    // With the turn-side center above, the required fillet is the short arc.
    if (turn > 0 && delta > Math.PI) {
      delta -= Math.PI * 2;
    } else if (turn < 0 && delta < -Math.PI) {
      delta += Math.PI * 2;
    }

    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const angle = startAngle + delta * ratio;

      appendUniquePoint(result, [
        center[0] + Math.cos(angle) * arcRadius,
        center[1] + Math.sin(angle) * arcRadius,
      ]);
    }
  }

  return result;
}

function getWoodworkingProfileLocalPoints(component = {}, options = {}) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) return null;

  const { kind, u, v } = descriptor;
  const left = -u / 2;
  const right = u / 2;
  const bottom = -v / 2;
  const top = v / 2;

  if (kind === "contour") {
    const basePoints = descriptor.contourPointsMm.map(([u, v]) => [u, v]);
    const validEdgeNotches =
      getRenderableProfileEdgeNotchesFromDescriptor(
        descriptor,
        options.curveSegments || 14,
      );

    if (
      descriptor.hasContourCurves ||
      validEdgeNotches.length > 0
    ) {
      return buildContourPathWithEdgeNotchesRaw(
        descriptor,
        validEdgeNotches,
        options.curveSegments || 14,
      );
    }

    return supportsProfileFillet(kind)
      ? applyPolygonFillet(
          basePoints,
          descriptor.profileFilletRadius,
          options.filletSegments,
        )
      : basePoints;
  }

  if (kind === "oval") {
    const segments = Math.max(24, Number(options.curveSegments) || 56);
    const roundness = Math.max(
      0,
      Math.min(100, Number(descriptor.profileOvalRoundness) || 0),
    );

    // Superellipse:
    // 100% => exponent 2 => true ellipse.
    // 0%   => exponent 8 => more rounded-rectangle-like.
    const exponent = 2 + ((100 - roundness) / 100) * 6;
    const power = 2 / exponent;

    return Array.from({ length: segments }, (_, index) => {
      const angle = (index / segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      return [
        Math.sign(cos) * Math.pow(Math.abs(cos), power) * (u / 2),
        Math.sign(sin) * Math.pow(Math.abs(sin), power) * (v / 2),
      ];
    });
  }

  if (kind === "rounded") {
    const radius = descriptor.radius;
    if (radius <= 0) {
      return [
        [left, bottom],
        [right, bottom],
        [right, top],
        [left, top],
      ];
    }

    const segments = Math.max(3, Number(options.cornerSegments) || 7);
    const points = [];

    pushArc(
      points,
      right - radius,
      bottom + radius,
      radius,
      -Math.PI / 2,
      0,
      segments,
    );
    pushArc(
      points,
      right - radius,
      top - radius,
      radius,
      0,
      Math.PI / 2,
      segments,
    );
    pushArc(
      points,
      left + radius,
      top - radius,
      radius,
      Math.PI / 2,
      Math.PI,
      segments,
    );
    pushArc(
      points,
      left + radius,
      bottom + radius,
      radius,
      Math.PI,
      (Math.PI * 3) / 2,
      segments,
    );

    return points;
  }

  let basePoints = null;

  if (kind === "chamfer") {
    const c = descriptor.chamferSize;

    basePoints = [
      [left + c, bottom],
      [right - c, bottom],
      [right, bottom + c],
      [right, top - c],
      [right - c, top],
      [left + c, top],
      [left, top - c],
      [left, bottom + c],
    ];
  } else if (kind === "notch") {
    const halfNotch = descriptor.notchWidth / 2;
    const notchDepth = descriptor.notchDepth;

    if (descriptor.notchEdge === "top") {
      basePoints = [
        [left, bottom],
        [right, bottom],
        [right, top],
        [halfNotch, top],
        [halfNotch, top - notchDepth],
        [-halfNotch, top - notchDepth],
        [-halfNotch, top],
        [left, top],
      ];
    } else if (descriptor.notchEdge === "bottom") {
      basePoints = [
        [left, bottom],
        [-halfNotch, bottom],
        [-halfNotch, bottom + notchDepth],
        [halfNotch, bottom + notchDepth],
        [halfNotch, bottom],
        [right, bottom],
        [right, top],
        [left, top],
      ];
    } else if (descriptor.notchEdge === "left") {
      basePoints = [
        [left, bottom],
        [right, bottom],
        [right, top],
        [left, top],
        [left, halfNotch],
        [left + notchDepth, halfNotch],
        [left + notchDepth, -halfNotch],
        [left, -halfNotch],
      ];
    } else {
      basePoints = [
        [left, bottom],
        [right, bottom],
        [right, -halfNotch],
        [right - notchDepth, -halfNotch],
        [right - notchDepth, halfNotch],
        [right, halfNotch],
        [right, top],
        [left, top],
      ];
    }
  } else if (kind === "trapezoid") {
    const topWidth = u * descriptor.profileTopRatio;

    basePoints = [
      [left, bottom],
      [right, bottom],
      [topWidth / 2, top],
      [-topWidth / 2, top],
    ];
  } else {
    basePoints = [
      [left, bottom],
      [right, bottom],
      [right, top],
      [left, top],
    ];
  }

  return supportsProfileFillet(kind)
    ? applyPolygonFillet(
        basePoints,
        descriptor.profileFilletRadius,
        options.filletSegments,
      )
    : basePoints;
}

function getProjectionPlaneForView(view = "front") {
  const normalizedView = view === "exploded" ? "front" : view;
  if (normalizedView === "front" || normalizedView === "back") return "xy";
  if (normalizedView === "left" || normalizedView === "right") return "yz";
  if (normalizedView === "top") return "xz";
  return "";
}

function getWoodworkingProfile2DPoints(component = {}, view = "front", box = {}) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) return null;

  if (getProjectionPlaneForView(view) !== descriptor.plane) {
    return null;
  }

  const localPoints = getWoodworkingProfileLocalPoints(component);
  if (!localPoints?.length) return null;

  const boxWidth = Math.max(1, Number(box.w) || 1);
  const boxHeight = Math.max(1, Number(box.h) || 1);
  const mirrorU = view === "back" || view === "right";

  return localPoints.flatMap(([rawU, rawV]) => {
    const localU = mirrorU ? -rawU : rawU;
    const screenX = (localU / descriptor.u + 0.5) * boxWidth;
    const screenY = (0.5 - rawV / descriptor.v) * boxHeight;
    return [screenX, screenY];
  });
}

function buildWoodworkingProfileSvgMarkup(
  component = {},
  view = "front",
  box = {},
  stroke = "#1e3a8a",
) {
  const points = getWoodworkingProfile2DPoints(component, view, box);
  if (!points?.length) return "";

  const pairs = [];
  for (let i = 0; i < points.length; i += 2) {
    pairs.push(`${points[i].toFixed(3)},${points[i + 1].toFixed(3)}`);
  }

  const cutoutMarkup = getWoodworkingProfile2DCutouts(
    component,
    view,
    box,
  )
    .filter((cutout) => cutout.valid)
    .map((cutout) => {
      const cutoutPairs = [];
      for (let i = 0; i < cutout.points.length; i += 2) {
        cutoutPairs.push(
          `${cutout.points[i].toFixed(3)},${cutout.points[
            i + 1
          ].toFixed(3)}`,
        );
      }

      return `<polygon points="${cutoutPairs.join(
        " ",
      )}" fill="#ffffff" stroke="${stroke}" stroke-width="1.2" />`;
    })
    .join("");

  return `<polygon points="${pairs.join(
    " ",
  )}" fill="#f8fafc" stroke="${stroke}" stroke-width="1.5" />${cutoutMarkup}`;
}

export {
  WOODWORKING_PROFILE_VERSION,
  WOODWORKING_PROFILE_TYPES,
  PROFILE_KIND_LABELS,
  isWoodworkingProfileType,
  isWoodworkingProfileComponent,
  supportsProfileFillet,
  inferProfilePlane,
  resolveProfilePlane,
  getProfileAxisDimensions,
  getWoodworkingProfileDescriptor,
  normalizeWoodworkingProfileMetadata,
  getContourPointsMm,
  updateContourPointMm,
  insertContourPointAfter,
  deleteContourPointAt,
  resetContourPointRatios,
  getContourCurvePathPointsMm,
  getContourEdgeCurveInfo,
  updateContourEdgeBulgeMm,
  updateContourEdgeRadiusMm,
  insertContourCurveAfter,
  deleteContourCurveAt,
  resetContourCurvesAroundPoint,
  resetContourCurveRatios,
  MAX_PROFILE_CUTOUTS,
  createProfileCutout,
  updateProfileCutout,
  deleteProfileCutout,
  getProfileCutoutLocalPoints,
  getProfileCutoutStatus,
  getValidProfileCutouts,
  getWoodworkingProfile2DCutouts,
  MAX_PROFILE_EDGE_NOTCHES,
  createProfileEdgeNotch,
  updateProfileEdgeNotch,
  deleteProfileEdgeNotch,
  getProfileEdgeNotchStatus,
  getValidProfileEdgeNotches,
  isValidContourPolygon,
  getWoodworkingProfileLocalPoints,
  getWoodworkingProfile2DPoints,
  buildWoodworkingProfileSvgMarkup,
};