// data/woodworkingProfile.js
// WISDOM Blueprint Custom Shape Foundation V1
// Pure woodworking profile geometry shared by 2D and 3D.
// No inventory, pricing, backend, or estimation behavior lives here.

const WOODWORKING_PROFILE_VERSION = 1;

const PROFILE_KIND_BY_TYPE = Object.freeze({
  wood_profile_rectangle: "rectangle",
  wood_profile_rounded: "rounded",
  wood_profile_chamfer: "chamfer",
  wood_profile_notch: "notch",
  wood_profile_oval: "oval",
  wood_profile_trapezoid: "trapezoid",
});

const PROFILE_KIND_LABELS = Object.freeze({
  rectangle: "Rectangle Board",
  rounded: "Rounded Board",
  chamfer: "Chamfered Board",
  notch: "Notched Board",
  oval: "Circle / Oval Board",
  trapezoid: "Trapezoid Board",
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
];

function clampNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function cleanText(value) {
  return String(value ?? "").trim().toLowerCase();
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
  return ["rectangle", "chamfer", "notch", "trapezoid"].includes(
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

  return `<polygon points="${pairs.join(" ")}" fill="#f8fafc" stroke="${stroke}" stroke-width="1.5" />`;
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
  getWoodworkingProfileLocalPoints,
  getWoodworkingProfile2DPoints,
  buildWoodworkingProfileSvgMarkup,
};