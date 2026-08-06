// data/smartAssemblyResize.js — Safe, exact-input smart resizing for furniture assemblies
import { normalizeDimensionMm, roundToPrecision } from "./utils";

const MIN_COMPONENT_DIMENSION_MM = 1;
const MIN_STRETCH_MEMBER_MM = 20;
const ROTATION_EPSILON_DEGREES = 0.1;
const SMART_RESIZE_VERSION = 1;

const VALID_ANCHORS = new Set(["left", "center", "right"]);

function normalizeAngleDegrees(value = 0) {
  const raw = Number(value) || 0;
  let angle = ((raw % 360) + 360) % 360;
  if (angle > 180) angle -= 360;
  return roundToPrecision(angle, 0.1);
}

function isEffectivelyZeroRotation(value = 0) {
  return Math.abs(normalizeAngleDegrees(value)) <= ROTATION_EPSILON_DEGREES;
}

function getAxisAlignedBounds(items = []) {
  if (!Array.isArray(items) || !items.length) return null;

  const minX = Math.min(...items.map((item) => Number(item?.x) || 0));
  const maxX = Math.max(
    ...items.map(
      (item) => (Number(item?.x) || 0) + (Number(item?.width) || 0),
    ),
  );

  return {
    minX: roundToPrecision(minX),
    maxX: roundToPrecision(maxX),
    centerX: roundToPrecision((minX + maxX) / 2),
    width: roundToPrecision(maxX - minX),
  };
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

function isDiningTableAssembly(items = []) {
  if (!Array.isArray(items) || !items.length) return false;

  const assemblyText = items.map(getComponentText).join(" ");
  const hasDiningTableMetadata =
    assemblyText.includes("dining table") ||
    assemblyText.includes("wooden dining table") ||
    assemblyText.includes("template dining table");

  const hasDiningTableCodes = items.some((item) =>
    getComponentCode(item).startsWith("DT-"),
  );

  const hasDiningTableTypes = items.some((item) =>
    String(item?.type || "")
      .toLowerCase()
      .startsWith("dt_"),
  );

  return hasDiningTableMetadata || hasDiningTableCodes || hasDiningTableTypes;
}

function getHorizontalSide(item, bounds) {
  const width = Number(item?.width) || 0;
  const centerX = (Number(item?.x) || 0) + width / 2;
  return centerX <= bounds.centerX ? "left" : "right";
}

function classifyDiningTablePart(item, bounds) {
  const code = getComponentCode(item);
  const type = String(item?.type || "").toLowerCase();
  const text = getComponentText(item);
  const savedRule = String(item?.resizeRuleX || "").toLowerCase();
  const savedRole = String(item?.assemblyRole || "").toLowerCase();

  if (savedRule === "stretch-preserve-margins") {
    return {
      role: "stretch",
      assemblyRole: savedRole || "stretch-member",
      resizeRuleX: savedRule,
    };
  }

  if (savedRule === "follow-left-edge") {
    return {
      role: "follow-left",
      assemblyRole: savedRole || "left-member",
      resizeRuleX: savedRule,
    };
  }

  if (savedRule === "follow-right-edge") {
    return {
      role: "follow-right",
      assemblyRole: savedRole || "right-member",
      resizeRuleX: savedRule,
    };
  }

  if (savedRule === "move-proportionally") {
    return {
      role: "proportional",
      assemblyRole: savedRole || "center-member",
      resizeRuleX: savedRule,
    };
  }

  if (
    code === "DT-TOP" ||
    type === "dt_top_panel" ||
    text.includes("top panel") ||
    text.includes("table top") ||
    text.includes("tabletop")
  ) {
    return {
      role: "stretch",
      assemblyRole: "table-top",
      resizeRuleX: "stretch-preserve-margins",
    };
  }

  if (
    code === "DT-AF" ||
    code === "DT-AR" ||
    type === "dt_apron_long" ||
    text.includes("front apron") ||
    text.includes("rear apron") ||
    text.includes("back apron")
  ) {
    return {
      role: "stretch",
      assemblyRole: "long-apron",
      resizeRuleX: "stretch-preserve-margins",
    };
  }

  if (
    code === "DT-FL" ||
    code === "DT-BL" ||
    code === "DT-AL" ||
    text.includes("front leg l") ||
    text.includes("back leg l") ||
    text.includes("left leg") ||
    text.includes("left apron")
  ) {
    return {
      role: "follow-left",
      assemblyRole: text.includes("apron") ? "left-apron" : "left-leg",
      resizeRuleX: "follow-left-edge",
    };
  }

  if (
    code === "DT-FR" ||
    code === "DT-BR" ||
    code === "DT-AR2" ||
    text.includes("front leg r") ||
    text.includes("back leg r") ||
    text.includes("right leg") ||
    text.includes("right apron")
  ) {
    return {
      role: "follow-right",
      assemblyRole: text.includes("apron") ? "right-apron" : "right-leg",
      resizeRuleX: "follow-right-edge",
    };
  }

  if (type === "dt_leg" || text.includes(" leg")) {
    const side = getHorizontalSide(item, bounds);
    return {
      role: `follow-${side}`,
      assemblyRole: `${side}-leg`,
      resizeRuleX: `follow-${side}-edge`,
    };
  }

  if (type === "dt_apron_short" || text.includes("apron")) {
    const side = getHorizontalSide(item, bounds);
    return {
      role: `follow-${side}`,
      assemblyRole: `${side}-apron`,
      resizeRuleX: `follow-${side}-edge`,
    };
  }

  const itemWidth = Number(item?.width) || 0;
  if (bounds.width > 0 && itemWidth >= bounds.width * 0.5) {
    return {
      role: "stretch",
      assemblyRole: "wide-support",
      resizeRuleX: "stretch-preserve-margins",
      inferred: true,
    };
  }

  return {
    role: "proportional",
    assemblyRole: "unclassified-support",
    resizeRuleX: "move-proportionally",
    inferred: true,
  };
}

function countRoles(classifications = []) {
  return classifications.reduce(
    (counts, item) => {
      counts[item.role] = (counts[item.role] || 0) + 1;
      if (item.inferred) counts.inferred += 1;
      return counts;
    },
    {
      stretch: 0,
      "follow-left": 0,
      "follow-right": 0,
      proportional: 0,
      inferred: 0,
    },
  );
}

function calculateMinimumWidth(bounds, classifications) {
  let minimumWidth = MIN_COMPONENT_DIMENSION_MM;
  let leftExtent = 0;
  let rightExtent = 0;

  classifications.forEach(({ item, role }) => {
    const x = Number(item?.x) || 0;
    const width = normalizeDimensionMm(
      Number(item?.width) || MIN_COMPONENT_DIMENSION_MM,
      MIN_COMPONENT_DIMENSION_MM,
    );

    if (role === "stretch") {
      const leftGap = x - bounds.minX;
      const rightGap = bounds.maxX - (x + width);
      minimumWidth = Math.max(
        minimumWidth,
        leftGap + rightGap + MIN_STRETCH_MEMBER_MM,
      );
    }

    if (role === "follow-left") {
      leftExtent = Math.max(leftExtent, x + width - bounds.minX);
    }

    if (role === "follow-right") {
      rightExtent = Math.max(rightExtent, bounds.maxX - x);
    }
  });

  if (leftExtent > 0 && rightExtent > 0) {
    minimumWidth = Math.max(
      minimumWidth,
      leftExtent + rightExtent + MIN_STRETCH_MEMBER_MM,
    );
  }

  return Math.ceil(minimumWidth);
}

function getAnchorGeometry(bounds, requestedWidth, anchor) {
  if (anchor === "left") {
    return {
      minX: roundToPrecision(bounds.maxX - requestedWidth),
      maxX: bounds.maxX,
      centerX: roundToPrecision(bounds.maxX - requestedWidth / 2),
      fixedEdge: "Right edge stays fixed",
    };
  }

  if (anchor === "right") {
    return {
      minX: bounds.minX,
      maxX: roundToPrecision(bounds.minX + requestedWidth),
      centerX: roundToPrecision(bounds.minX + requestedWidth / 2),
      fixedEdge: "Left edge stays fixed",
    };
  }

  return {
    minX: roundToPrecision(bounds.centerX - requestedWidth / 2),
    maxX: roundToPrecision(bounds.centerX + requestedWidth / 2),
    centerX: bounds.centerX,
    fixedEdge: "Center stays fixed; both sides resize evenly",
  };
}

function analyzeSmartWidthResizeAssembly(items = []) {
  const normalizedItems = (Array.isArray(items) ? items : []).filter(
    (item) => item?.id,
  );

  if (!normalizedItems.length) {
    return {
      supported: false,
      reason: "Select a dining table assembly first.",
      assemblyIds: [],
    };
  }

  if (!isDiningTableAssembly(normalizedItems)) {
    return {
      supported: false,
      reason:
        "Smart width resize currently supports Dining Table assemblies only.",
      assemblyIds: normalizedItems.map((item) => item.id),
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
        "Return the table assembly to 0° rotation before using Smart Width Resize.",
      assemblyIds: normalizedItems.map((item) => item.id),
    };
  }

  const bounds = getAxisAlignedBounds(normalizedItems);
  if (!bounds || bounds.width <= 0) {
    return {
      supported: false,
      reason: "The selected assembly has invalid width bounds.",
      assemblyIds: normalizedItems.map((item) => item.id),
    };
  }

  const classifications = normalizedItems.map((item) => ({
    item,
    ...classifyDiningTablePart(item, bounds),
  }));
  const roleCounts = countRoles(classifications);

  if (
    roleCounts.stretch < 1 ||
    roleCounts["follow-left"] < 1 ||
    roleCounts["follow-right"] < 1
  ) {
    return {
      supported: false,
      reason:
        "The Dining Table assembly is missing the parts needed for safe anchored resizing.",
      assemblyIds: normalizedItems.map((item) => item.id),
      bounds,
      roleCounts,
    };
  }

  const minimumWidth = calculateMinimumWidth(bounds, classifications);

  const primary = normalizedItems[0];
  const assemblyId =
    primary?.groupId ||
    normalizedItems.find((item) => item?.groupId)?.groupId ||
    normalizedItems.map((item) => item.id).sort().join("|");

  return {
    supported: true,
    assemblyType: "dining-table",
    assemblyId,
    assemblyLabel:
      primary?.groupLabel ||
      normalizedItems.find((item) => item?.groupLabel)?.groupLabel ||
      "Dining Table",
    assemblyIds: normalizedItems.map((item) => item.id),
    partCount: normalizedItems.length,
    currentWidth: bounds.width,
    minimumWidth,
    bounds,
    roleCounts,
    classifications,
    warning:
      roleCounts.inferred > 0
        ? `${roleCounts.inferred} part(s) use safe inferred resize behavior.`
        : "",
  };
}

function buildSmartWidthResizePlan(items = [], options = {}) {
  const analysis = analyzeSmartWidthResizeAssembly(items);
  if (!analysis.supported) return analysis;

  const anchor = VALID_ANCHORS.has(options?.anchor)
    ? options.anchor
    : "center";
  const requestedWidthRaw = Number(options?.newWidth);

  if (!Number.isFinite(requestedWidthRaw) || requestedWidthRaw <= 0) {
    return {
      ...analysis,
      supported: false,
      reason: "Enter a valid new width in millimeters.",
    };
  }

  const requestedWidth = normalizeDimensionMm(
    requestedWidthRaw,
    MIN_COMPONENT_DIMENSION_MM,
  );

  if (requestedWidth < analysis.minimumWidth) {
    return {
      ...analysis,
      supported: false,
      reason: `Minimum safe width is ${analysis.minimumWidth} mm for this table assembly.`,
      requestedWidth,
      anchor,
    };
  }

  const nextBounds = getAnchorGeometry(
    analysis.bounds,
    requestedWidth,
    anchor,
  );
  const changesById = {};
  let stretchedPartCount = 0;
  let movedPartCount = 0;

  analysis.classifications.forEach(
    ({ item, role, assemblyRole, resizeRuleX }) => {
      const x = Number(item?.x) || 0;
      const width = normalizeDimensionMm(
        Number(item?.width) || MIN_COMPONENT_DIMENSION_MM,
        MIN_COMPONENT_DIMENSION_MM,
      );
      let nextX = x;
      let nextWidth = width;

      if (role === "stretch") {
        const leftGap = x - analysis.bounds.minX;
        const rightGap = analysis.bounds.maxX - (x + width);
        nextX = nextBounds.minX + leftGap;
        nextWidth = requestedWidth - leftGap - rightGap;
        stretchedPartCount += 1;
      } else if (role === "follow-left") {
        nextX = nextBounds.minX + (x - analysis.bounds.minX);
        movedPartCount += 1;
      } else if (role === "follow-right") {
        const rightGap = analysis.bounds.maxX - (x + width);
        nextX = nextBounds.maxX - rightGap - width;
        movedPartCount += 1;
      } else {
        const oldCenter = x + width / 2;
        const centerRatio =
          analysis.currentWidth > 0
            ? (oldCenter - analysis.bounds.minX) / analysis.currentWidth
            : 0.5;
        const nextCenter = nextBounds.minX + centerRatio * requestedWidth;
        nextX = nextCenter - width / 2;
        movedPartCount += 1;
      }

      nextWidth = normalizeDimensionMm(
        nextWidth,
        MIN_COMPONENT_DIMENSION_MM,
      );
      nextX = roundToPrecision(nextX);

      changesById[item.id] = {
        x: nextX,
        ...(role === "stretch" ? { width: nextWidth } : {}),
        assemblyRole,
        resizeRuleX,
        smartResizeVersion: SMART_RESIZE_VERSION,
      };
    },
  );

  return {
    ...analysis,
    supported: true,
    anchor,
    requestedWidth,
    previousWidth: analysis.currentWidth,
    deltaWidth: roundToPrecision(requestedWidth - analysis.currentWidth),
    nextBounds: {
      ...nextBounds,
      width: requestedWidth,
    },
    changesById,
    stretchedPartCount,
    movedPartCount,
    fixedEdge: nextBounds.fixedEdge,
  };
}

export {
  analyzeSmartWidthResizeAssembly,
  buildSmartWidthResizePlan,
};
