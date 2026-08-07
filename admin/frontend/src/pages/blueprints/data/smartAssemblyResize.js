// data/smartAssemblyResize.js — Controlled assembly resizing for supported furniture
import { normalizeDimensionMm, roundToPrecision } from "./utils";

const MIN_COMPONENT_DIMENSION_MM = 1;
const MIN_STRETCH_MEMBER_MM = 20;
const ROTATION_EPSILON_DEGREES = 0.1;
const SMART_RESIZE_VERSION = 2;

const DIMENSION_META = {
  width: {
    posKey: "x",
    sizeKey: "width",
    minKey: "minX",
    maxKey: "maxX",
    centerKey: "centerX",
    label: "Width",
    moveMinAnchor: "left",
    moveMaxAnchor: "right",
    validAnchors: new Set(["left", "center", "right"]),
    minSideLabel: "Left",
    maxSideLabel: "Right",
    ruleKey: "resizeRuleX",
  },
  height: {
    posKey: "y",
    sizeKey: "height",
    minKey: "minY",
    maxKey: "maxY",
    centerKey: "centerY",
    label: "Height",
    moveMinAnchor: "top",
    moveMaxAnchor: "bottom",
    validAnchors: new Set(["bottom", "center", "top"]),
    minSideLabel: "Top",
    maxSideLabel: "Bottom",
    ruleKey: "resizeRuleY",
  },
  depth: {
    posKey: "z",
    sizeKey: "depth",
    minKey: "minZ",
    maxKey: "maxZ",
    centerKey: "centerZ",
    label: "Depth",
    moveMinAnchor: "front",
    moveMaxAnchor: "back",
    validAnchors: new Set(["front", "center", "back"]),
    minSideLabel: "Front",
    maxSideLabel: "Back",
    ruleKey: "resizeRuleZ",
  },
};

function normalizeAngleDegrees(value = 0) {
  const raw = Number(value) || 0;
  let angle = ((raw % 360) + 360) % 360;
  if (angle > 180) angle -= 360;
  return roundToPrecision(angle, 0.1);
}

function isEffectivelyZeroRotation(value = 0) {
  return Math.abs(normalizeAngleDegrees(value)) <= ROTATION_EPSILON_DEGREES;
}

function getComponentText(item = {}) {
  return `${item?.partCode || ""} ${item?.type || ""} ${item?.label || ""} ${item?.groupLabel || ""} ${item?.templateType || ""}`
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getComponentCode(item = {}) {
  return String(item?.partCode || "").trim().toUpperCase();
}

function getAxisAlignedBounds(items = []) {
  if (!Array.isArray(items) || !items.length) return null;

  const minX = Math.min(...items.map((item) => Number(item?.x) || 0));
  const maxX = Math.max(
    ...items.map(
      (item) => (Number(item?.x) || 0) + (Number(item?.width) || 0),
    ),
  );
  const minY = Math.min(...items.map((item) => Number(item?.y) || 0));
  const maxY = Math.max(
    ...items.map(
      (item) => (Number(item?.y) || 0) + (Number(item?.height) || 0),
    ),
  );
  const minZ = Math.min(...items.map((item) => Number(item?.z) || 0));
  const maxZ = Math.max(
    ...items.map(
      (item) => (Number(item?.z) || 0) + (Number(item?.depth) || 0),
    ),
  );

  return {
    minX: roundToPrecision(minX),
    maxX: roundToPrecision(maxX),
    centerX: roundToPrecision((minX + maxX) / 2),
    width: roundToPrecision(maxX - minX),
    minY: roundToPrecision(minY),
    maxY: roundToPrecision(maxY),
    centerY: roundToPrecision((minY + maxY) / 2),
    height: roundToPrecision(maxY - minY),
    minZ: roundToPrecision(minZ),
    maxZ: roundToPrecision(maxZ),
    centerZ: roundToPrecision((minZ + maxZ) / 2),
    depth: roundToPrecision(maxZ - minZ),
  };
}

function hasCode(items, code) {
  return items.some((item) => getComponentCode(item) === code);
}

function detectAssemblyFamily(items = []) {
  const codes = items.map(getComponentCode);
  const templateTypes = items.map((item) =>
    String(item?.templateType || "").toLowerCase(),
  );
  const text = items.map(getComponentText).join(" ");

  const isCabinetBox =
    (codes.includes("CB-SIDE-L") && codes.includes("CB-SIDE-R")) ||
    text.includes("cabinet box");

  if (isCabinetBox) {
    return {
      key: "cabinet-box",
      label: "Cabinet Box",
      supportedDimensions: ["width", "height", "depth"],
    };
  }

  const isComplexCloset =
    templateTypes.includes("template_closet_wardrobe") ||
    codes.includes("WR-SPL") ||
    codes.includes("WR-SPR");

  if (isComplexCloset) {
    return {
      key: "complex-closet",
      label: "Closet / Wardrobe",
      supportedDimensions: [],
      reason:
        "Controlled resize for the complex closet template is intentionally disabled in this batch.",
    };
  }

  const isWardrobe =
    templateTypes.includes("template_wardrobe") ||
    (hasCode(items, "WR-SL") &&
      hasCode(items, "WR-SR") &&
      hasCode(items, "WR-TOP") &&
      hasCode(items, "WR-BOT"));

  if (isWardrobe) {
    return {
      key: "wardrobe",
      label: "Wardrobe",
      supportedDimensions: ["width", "height", "depth"],
    };
  }

  const isCoffeeTable =
    templateTypes.includes("template_coffee_table") ||
    codes.some((code) => code.startsWith("CT-"));

  if (isCoffeeTable) {
    return {
      key: "coffee-table",
      label: "Coffee Table",
      supportedDimensions: ["width", "height", "depth"],
    };
  }

  const isDiningTable =
    templateTypes.includes("template_dining_table") ||
    codes.some((code) => code.startsWith("DT-"));

  if (isDiningTable) {
    return {
      key: "dining-table",
      label: "Dining Table",
      supportedDimensions: ["width", "height", "depth"],
    };
  }

  return {
    key: "unsupported",
    label: "Assembly",
    supportedDimensions: [],
    reason:
      "Controlled assembly resize currently supports Dining Table, Coffee Table, Wardrobe, and Cabinet Box assemblies.",
  };
}

function role(roleName, assemblyRole = "", rule = "") {
  return {
    role: roleName,
    assemblyRole,
    resizeRule: rule || roleName,
  };
}

function classifyTablePart(item, dimension, bounds) {
  const code = getComponentCode(item);
  const type = String(item?.type || "").toLowerCase();
  const text = getComponentText(item);

  const isTop =
    code.endsWith("-TOP") ||
    type.includes("top_panel") ||
    text.includes("top panel") ||
    text.includes("table top") ||
    text.includes("tabletop");
  const isShelf =
    code === "CT-SH" ||
    type.includes("lower_shelf") ||
    text.includes("lower shelf");
  const isLeg =
    type.endsWith("_leg") ||
    /-(FL|FR|BL|BR)$/.test(code) ||
    text.includes(" leg");
  const isApron =
    type.includes("apron") || text.includes("apron") || /-(AF|AR|AL|AR2)$/.test(code);
  const isLongApron =
    type.includes("apron_long") ||
    type.includes("front_apron") ||
    type.includes("rear_apron") ||
    code === "DT-AF" ||
    code === "DT-AR" ||
    code === "CT-AF" ||
    code === "CT-AR";
  const isShortApron =
    type.includes("apron_short") || code === "DT-AL" || code === "DT-AR2";

  const isLeft =
    /-(FL|BL|AL)$/.test(code) ||
    text.includes("left leg") ||
    text.includes("left apron");
  const isRight =
    /-(FR|BR|AR2)$/.test(code) ||
    text.includes("right leg") ||
    text.includes("right apron");
  const isFront =
    /-(FL|FR|AF)$/.test(code) ||
    text.includes("front leg") ||
    text.includes("front apron");
  const isBack =
    /-(BL|BR|AR)$/.test(code) ||
    text.includes("back leg") ||
    text.includes("rear apron") ||
    text.includes("back apron");

  if (dimension === "width") {
    if (isTop || isShelf || isLongApron) {
      return role("stretch", isTop ? "table-top" : isShelf ? "shelf" : "long-apron");
    }
    if (isLeft) return role("follow-min", isLeg ? "left-leg" : "left-member");
    if (isRight) return role("follow-max", isLeg ? "right-leg" : "right-member");
    return role("proportional", "table-support");
  }

  if (dimension === "depth") {
    if (isTop || isShelf || isShortApron) {
      return role("stretch", isTop ? "table-top" : isShelf ? "shelf" : "side-apron");
    }
    if (isFront) return role("follow-min", isLeg ? "front-leg" : "front-member");
    if (isBack) return role("follow-max", isLeg ? "back-leg" : "back-member");
    return role("proportional", "table-support");
  }

  if (dimension === "height") {
    if (isLeg) return role("stretch", "leg");
    if (isTop || isApron) {
      return role("follow-min", isTop ? "table-top" : "apron");
    }
    if (isShelf) return role("follow-max", "lower-shelf");
    return role("proportional", "table-support");
  }

  return role("proportional", "table-support");
}

function classifyWardrobePart(item, dimension) {
  const code = getComponentCode(item);
  const type = String(item?.type || "").toLowerCase();
  const text = getComponentText(item);

  const isLeftSide = code === "WR-SL" || text.includes("left side panel");
  const isRightSide = code === "WR-SR" || text.includes("right side panel");
  const isTop = code === "WR-TOP" || type === "wr_top_panel";
  const isBottom = code === "WR-BOT" || type === "wr_bottom_panel";
  const isBack = code === "WR-BK" || type === "wr_back_panel";
  const isShelf = type === "wr_shelf" || code.startsWith("WR-SH");
  const isDoor = type === "wr_door" || code === "WR-DL" || code === "WR-DR";

  if (dimension === "width") {
    if (isLeftSide) return role("follow-min", "left-side");
    if (isRightSide) return role("follow-max", "right-side");
    if (isDoor) return role("ratio-scale", "door");
    if (isTop || isBottom || isBack || isShelf) {
      return role("stretch", "span-member");
    }
    return role("proportional", "wardrobe-member");
  }

  if (dimension === "depth") {
    if (isBack) return role("follow-min", "back-panel");
    if (isDoor) return role("follow-max", "door");
    if (isLeftSide || isRightSide || isTop || isBottom || isShelf) {
      return role("stretch", "depth-member");
    }
    return role("proportional", "wardrobe-member");
  }

  if (dimension === "height") {
    if (isTop) return role("follow-min", "top-panel");
    if (isBottom) return role("follow-max", "bottom-panel");
    if (isLeftSide || isRightSide || isBack || isDoor) {
      return role("stretch", "height-member");
    }
    if (isShelf) return role("proportional", "shelf");
    return role("proportional", "wardrobe-member");
  }

  return role("proportional", "wardrobe-member");
}

function classifyCabinetPart(item, dimension) {
  const code = getComponentCode(item);
  const type = String(item?.type || "").toLowerCase();

  const isLeftSide = code === "CB-SIDE-L";
  const isRightSide = code === "CB-SIDE-R";
  const isTop = code === "CB-TOP";
  const isBottom = code === "CB-BOT";
  const isBack = code === "CB-BACK";
  const isDivider = code.startsWith("CB-DIV") || type === "wr_divider";
  const isShelf = code.startsWith("CB-SH") || type === "wr_shelf";
  const isSplitShelf = /^CB-SH\d+(L|R)$/.test(code);
  const isFront =
    type.includes("door_front") ||
    type.includes("drawer_front") ||
    code.includes("FRONT") ||
    code.includes("DRAWER");

  if (dimension === "width") {
    if (isLeftSide) return role("follow-min", "left-side");
    if (isRightSide) return role("follow-max", "right-side");
    if (isTop || isBottom || isBack) return role("stretch", "span-member");
    if (isSplitShelf || isFront) return role("ratio-scale", "opening-member");
    if (isShelf) return role("stretch", "shelf");
    if (isDivider) return role("proportional", "divider");
    return role("proportional", "cabinet-member");
  }

  if (dimension === "depth") {
    if (isBack) return role("follow-min", "back-panel");
    if (isFront) return role("follow-max", "front");
    if (isLeftSide || isRightSide || isTop || isBottom || isDivider || isShelf) {
      return role("stretch", "depth-member");
    }
    return role("proportional", "cabinet-member");
  }

  if (dimension === "height") {
    if (isTop) return role("follow-min", "top-panel");
    if (isBottom) return role("follow-max", "bottom-panel");
    if (isLeftSide || isRightSide || isBack || isDivider) {
      return role("stretch", "height-member");
    }
    if (isFront) return role("ratio-scale", "front");
    if (isShelf) return role("proportional", "shelf");
    return role("proportional", "cabinet-member");
  }

  return role("proportional", "cabinet-member");
}

function classifyPart(item, family, dimension, bounds) {
  if (family.key === "dining-table" || family.key === "coffee-table") {
    return classifyTablePart(item, dimension, bounds);
  }

  if (family.key === "wardrobe") {
    return classifyWardrobePart(item, dimension, bounds);
  }

  if (family.key === "cabinet-box") {
    return classifyCabinetPart(item, dimension, bounds);
  }

  return role("proportional", "assembly-member");
}

function countRoles(classifications = []) {
  return classifications.reduce(
    (counts, entry) => {
      counts[entry.role] = (counts[entry.role] || 0) + 1;
      return counts;
    },
    {
      stretch: 0,
      "follow-min": 0,
      "follow-max": 0,
      "ratio-scale": 0,
      proportional: 0,
    },
  );
}

function getFamilyMinimumFloor(familyKey, dimension) {
  if (familyKey === "wardrobe") {
    if (dimension === "height") return 400;
    if (dimension === "width") return 300;
    return 200;
  }

  if (familyKey === "dining-table" || familyKey === "coffee-table") {
    if (dimension === "height") return 200;
    return 300;
  }

  if (familyKey === "cabinet-box") {
    return 200;
  }

  return MIN_COMPONENT_DIMENSION_MM;
}

function calculateMinimumSize(bounds, classifications, dimension, familyKey) {
  const meta = DIMENSION_META[dimension];
  const oldMin = bounds[meta.minKey];
  const oldMax = bounds[meta.maxKey];

  let minimumSize = getFamilyMinimumFloor(familyKey, dimension);
  let minExtent = 0;
  let maxExtent = 0;

  classifications.forEach(({ item, role: roleName }) => {
    const start = Number(item?.[meta.posKey]) || 0;
    const size = normalizeDimensionMm(
      Number(item?.[meta.sizeKey]) || MIN_COMPONENT_DIMENSION_MM,
      MIN_COMPONENT_DIMENSION_MM,
    );

    if (roleName === "stretch") {
      const minGap = start - oldMin;
      const maxGap = oldMax - (start + size);
      minimumSize = Math.max(
        minimumSize,
        minGap + maxGap + MIN_STRETCH_MEMBER_MM,
      );
    }

    if (roleName === "follow-min") {
      minExtent = Math.max(minExtent, start + size - oldMin);
    }

    if (roleName === "follow-max") {
      maxExtent = Math.max(maxExtent, oldMax - start);
    }
  });

  if (minExtent > 0 && maxExtent > 0) {
    minimumSize = Math.max(
      minimumSize,
      minExtent + maxExtent + MIN_STRETCH_MEMBER_MM,
    );
  }

  return Math.ceil(minimumSize);
}

function getAnchorGeometry(bounds, requestedSize, dimension, anchor) {
  const meta = DIMENSION_META[dimension];
  const oldMin = bounds[meta.minKey];
  const oldMax = bounds[meta.maxKey];
  const oldCenter = bounds[meta.centerKey];

  if (anchor === meta.moveMinAnchor) {
    return {
      min: roundToPrecision(oldMax - requestedSize),
      max: oldMax,
      center: roundToPrecision(oldMax - requestedSize / 2),
      fixedEdge: `${meta.maxSideLabel} edge stays fixed`,
    };
  }

  if (anchor === meta.moveMaxAnchor) {
    return {
      min: oldMin,
      max: roundToPrecision(oldMin + requestedSize),
      center: roundToPrecision(oldMin + requestedSize / 2),
      fixedEdge: `${meta.minSideLabel} edge stays fixed`,
    };
  }

  return {
    min: roundToPrecision(oldCenter - requestedSize / 2),
    max: roundToPrecision(oldCenter + requestedSize / 2),
    center: oldCenter,
    fixedEdge: "Center stays fixed; both sides resize evenly",
  };
}

function analyzeSmartAssemblyResize(items = []) {
  const normalizedItems = (Array.isArray(items) ? items : []).filter(
    (item) => item?.id,
  );

  if (!normalizedItems.length) {
    return {
      supported: false,
      reason: "Select a supported furniture assembly first.",
      assemblyIds: [],
      supportedDimensions: [],
    };
  }

  const family = detectAssemblyFamily(normalizedItems);

  if (!family.supportedDimensions.length) {
    return {
      supported: false,
      reason: family.reason,
      assemblyType: family.key,
      assemblyLabel: family.label,
      assemblyIds: normalizedItems.map((item) => item.id),
      supportedDimensions: [],
    };
  }

  const rotatedPart = normalizedItems.find(
    (item) =>
      !isEffectivelyZeroRotation(item?.rotationX) ||
      !isEffectivelyZeroRotation(item?.rotationY) ||
      !isEffectivelyZeroRotation(item?.rotationZ),
  );

  if (rotatedPart) {
    return {
      supported: false,
      reason:
        "Return the assembly to 0° rotation before changing Width, Height, or Depth. You can rotate it again after resizing.",
      assemblyType: family.key,
      assemblyLabel: family.label,
      assemblyIds: normalizedItems.map((item) => item.id),
      supportedDimensions: family.supportedDimensions,
    };
  }

  const bounds = getAxisAlignedBounds(normalizedItems);

  if (
    !bounds ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.depth <= 0
  ) {
    return {
      supported: false,
      reason: "The selected assembly has invalid 3D bounds.",
      assemblyType: family.key,
      assemblyLabel: family.label,
      assemblyIds: normalizedItems.map((item) => item.id),
      supportedDimensions: family.supportedDimensions,
    };
  }

  const classificationsByDimension = {};
  const minimumDimensions = {};

  family.supportedDimensions.forEach((dimension) => {
    const classifications = normalizedItems.map((item) => ({
      item,
      ...classifyPart(item, family, dimension, bounds),
    }));

    classificationsByDimension[dimension] = classifications;
    minimumDimensions[dimension] = calculateMinimumSize(
      bounds,
      classifications,
      dimension,
      family.key,
    );
  });

  const primary = normalizedItems[0];
  const assemblyId =
    primary?.groupId ||
    normalizedItems.find((item) => item?.groupId)?.groupId ||
    normalizedItems.map((item) => item.id).sort().join("|");

  const assemblyLabel =
    primary?.groupLabel ||
    normalizedItems.find((item) => item?.groupLabel)?.groupLabel ||
    family.label;

  return {
    supported: true,
    assemblyType: family.key,
    assemblyId,
    assemblyLabel,
    assemblyIds: normalizedItems.map((item) => item.id),
    partCount: normalizedItems.length,
    supportedDimensions: family.supportedDimensions,
    currentDimensions: {
      width: bounds.width,
      height: bounds.height,
      depth: bounds.depth,
    },
    minimumDimensions,
    currentWidth: bounds.width,
    minimumWidth: minimumDimensions.width || MIN_COMPONENT_DIMENSION_MM,
    bounds,
    classificationsByDimension,
    warning:
      "Controlled resize keeps structural thickness where possible and moves connected parts by assembly rules.",
  };
}

function buildSmartAssemblyResizePlan(items = [], options = {}) {
  const analysis = analyzeSmartAssemblyResize(items);
  if (!analysis.supported) return analysis;

  const dimension = DIMENSION_META[options?.dimension]
    ? options.dimension
    : "width";

  if (!analysis.supportedDimensions.includes(dimension)) {
    return {
      ...analysis,
      supported: false,
      reason: `${DIMENSION_META[dimension]?.label || dimension} resize is not supported for this assembly.`,
      dimension,
    };
  }

  const meta = DIMENSION_META[dimension];
  const anchor = meta.validAnchors.has(options?.anchor)
    ? options.anchor
    : "center";
  const requestedRaw = Number(options?.newValue ?? options?.newWidth);

  if (!Number.isFinite(requestedRaw) || requestedRaw <= 0) {
    return {
      ...analysis,
      supported: false,
      reason: `Enter a valid new ${meta.label.toLowerCase()} in millimeters.`,
      dimension,
      anchor,
    };
  }

  const requestedValue = normalizeDimensionMm(
    requestedRaw,
    MIN_COMPONENT_DIMENSION_MM,
  );
  const minimumValue =
    analysis.minimumDimensions?.[dimension] || MIN_COMPONENT_DIMENSION_MM;

  if (requestedValue < minimumValue) {
    return {
      ...analysis,
      supported: false,
      reason: `Minimum safe ${meta.label.toLowerCase()} is ${minimumValue} mm for this assembly.`,
      dimension,
      anchor,
      requestedValue,
      minimumValue,
    };
  }

  const previousValue = analysis.currentDimensions[dimension];
  const nextBounds = getAnchorGeometry(
    analysis.bounds,
    requestedValue,
    dimension,
    anchor,
  );
  const oldMin = analysis.bounds[meta.minKey];
  const oldMax = analysis.bounds[meta.maxKey];
  const oldSize = Math.max(previousValue, MIN_COMPONENT_DIMENSION_MM);
  const classifications =
    analysis.classificationsByDimension[dimension] || [];

  const changesById = {};
  let stretchedPartCount = 0;
  let resizedPartCount = 0;
  let movedPartCount = 0;

  classifications.forEach(
    ({ item, role: roleName, assemblyRole, resizeRule }) => {
      const start = Number(item?.[meta.posKey]) || 0;
      const size = normalizeDimensionMm(
        Number(item?.[meta.sizeKey]) || MIN_COMPONENT_DIMENSION_MM,
        MIN_COMPONENT_DIMENSION_MM,
      );

      let nextPos = start;
      let nextSize = size;

      if (roleName === "stretch") {
        const minGap = start - oldMin;
        const maxGap = oldMax - (start + size);
        nextPos = nextBounds.min + minGap;
        nextSize = requestedValue - minGap - maxGap;
        stretchedPartCount += 1;
        resizedPartCount += 1;
      } else if (roleName === "follow-min") {
        nextPos = nextBounds.min + (start - oldMin);
        movedPartCount += 1;
      } else if (roleName === "follow-max") {
        const maxGap = oldMax - (start + size);
        nextPos = nextBounds.max - maxGap - size;
        movedPartCount += 1;
      } else if (roleName === "ratio-scale") {
        const startRatio = (start - oldMin) / oldSize;
        const sizeRatio = size / oldSize;
        nextPos = nextBounds.min + startRatio * requestedValue;
        nextSize = Math.max(
          MIN_COMPONENT_DIMENSION_MM,
          sizeRatio * requestedValue,
        );
        movedPartCount += 1;
        resizedPartCount += 1;
      } else {
        const center = start + size / 2;
        const centerRatio = (center - oldMin) / oldSize;
        const nextCenter = nextBounds.min + centerRatio * requestedValue;
        nextPos = nextCenter - size / 2;
        movedPartCount += 1;
      }

      nextPos = roundToPrecision(nextPos);
      nextSize = normalizeDimensionMm(
        nextSize,
        MIN_COMPONENT_DIMENSION_MM,
      );

      changesById[item.id] = {
        [meta.posKey]: nextPos,
        ...(["stretch", "ratio-scale"].includes(roleName)
          ? { [meta.sizeKey]: nextSize }
          : {}),
        assemblyRole: item?.assemblyRole || assemblyRole,
        [meta.ruleKey]: resizeRule,
        smartResizeVersion: SMART_RESIZE_VERSION,
      };
    },
  );

  const result = {
    ...analysis,
    supported: true,
    dimension,
    dimensionLabel: meta.label,
    anchor,
    requestedValue,
    previousValue,
    deltaValue: roundToPrecision(requestedValue - previousValue),
    nextBounds: {
      ...analysis.bounds,
      [meta.minKey]: nextBounds.min,
      [meta.maxKey]: nextBounds.max,
      [meta.centerKey]: nextBounds.center,
      [dimension]: requestedValue,
    },
    changesById,
    stretchedPartCount,
    resizedPartCount,
    movedPartCount,
    fixedEdge: nextBounds.fixedEdge,
    roleCounts: countRoles(classifications),
  };

  if (dimension === "width") {
    result.requestedWidth = requestedValue;
    result.previousWidth = previousValue;
    result.deltaWidth = result.deltaValue;
  }

  return result;
}

// Backward-compatible names used by earlier Batch 19 wiring.
function analyzeSmartWidthResizeAssembly(items = []) {
  return analyzeSmartAssemblyResize(items);
}

function buildSmartWidthResizePlan(items = [], options = {}) {
  return buildSmartAssemblyResizePlan(items, {
    dimension: "width",
    newValue: options?.newWidth,
    anchor: options?.anchor,
  });
}

export {
  analyzeSmartAssemblyResize,
  buildSmartAssemblyResizePlan,
  analyzeSmartWidthResizeAssembly,
  buildSmartWidthResizePlan,
};
