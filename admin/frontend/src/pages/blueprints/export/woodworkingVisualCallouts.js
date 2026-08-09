// export/woodworkingVisualCallouts.js
// WISDOM Blueprint Export Woodworking Details V2B
// Visual, read-only production callouts for orthographic export sheets.
// Structured production details remain on A-109.x.
// No backend, DB, pricing, estimation, or inventory mutation.

import { normalizeProductionMetadata } from "../data/productionMetadata";
import {
  getProfileCutoutLocalPoints,
  getProfileCutoutStatus,
  getProfileEdgeNotchStatus,
  getWoodworkingProfileDescriptor,
  getWoodworkingProfileLocalPoints,
} from "../data/woodworkingProfile";
import {
  getOperationLabel,
  getOperationProfileDimensions,
  getWoodworkingOperationFootprint,
  getWoodworkingOperationStatus,
  normalizeWoodworkingOperations,
} from "../data/woodworkingOperations";
import {
  svgLine,
  svgPolyline,
  svgText,
  truncateText,
} from "./exportSheetUtils";

const SUPPORTED_VIEWS = new Set([
  "front",
  "back",
  "left",
  "right",
  "top",
]);

const MAX_VISUAL_CALLOUTS_PER_PART = 5;
const MAX_VISUAL_CALLOUTS_PER_SHEET = 12;

const clampValue = (value, min, max) =>
  Math.max(min, Math.min(max, value));

const formatMm = (value, decimals = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return Number(numeric.toFixed(decimals)).toString();
};

const faceLabel = (surface = "") =>
  String(surface || "").toLowerCase() === "face_b" ? "FACE B" : "FACE A";

const edgeLabel = (edge = "") =>
  String(edge || "")
    .replace(/_/g, " ")
    .trim()
    .toUpperCase();

function getViewPlane(view = "") {
  if (view === "front" || view === "back") return "xy";
  if (view === "left" || view === "right") return "yz";
  if (view === "top") return "xz";
  return "";
}

function localToScreen({
  localU = 0,
  localV = 0,
  descriptor,
  view,
  screenBox,
}) {
  if (!descriptor || !screenBox) return null;

  const mirrorU = view === "back" || view === "right";
  const u = mirrorU ? -Number(localU || 0) : Number(localU || 0);
  const v = Number(localV || 0);

  return {
    x:
      screenBox.x +
      (u / Math.max(1, descriptor.u) + 0.5) * screenBox.w,
    y:
      screenBox.y +
      (0.5 - v / Math.max(1, descriptor.v)) * screenBox.h,
  };
}

function getOperationContext(component = {}, descriptor = null) {
  if (!descriptor) {
    return {
      outerPoints: [],
      cutoutPolygons: [],
    };
  }

  const outerPoints =
    getWoodworkingProfileLocalPoints(component, {
      curveSegments: 56,
      cornerSegments: 10,
      filletSegments: 10,
    }) || [];

  const cutoutPolygons = descriptor.profileCutouts
    .filter((cutout) => getProfileCutoutStatus(component, cutout).valid)
    .map((cutout) =>
      getProfileCutoutLocalPoints(
        cutout,
        cutout.type === "round" ? 48 : 4,
      ),
    );

  return {
    outerPoints,
    cutoutPolygons,
  };
}

function getGrainScreenAxis(grainDirection = "", view = "") {
  const grain = String(grainDirection || "").toLowerCase();

  if (view === "front" || view === "back") {
    if (grain === "width") return { orientation: "horizontal", label: "WIDTH" };
    if (grain === "height") return { orientation: "vertical", label: "HEIGHT" };
    return null;
  }

  if (view === "top") {
    if (grain === "width") return { orientation: "horizontal", label: "WIDTH" };
    if (grain === "depth") return { orientation: "vertical", label: "DEPTH" };
    return null;
  }

  if (view === "left" || view === "right") {
    if (grain === "depth") return { orientation: "horizontal", label: "DEPTH" };
    if (grain === "height") return { orientation: "vertical", label: "HEIGHT" };
    return null;
  }

  return null;
}

function buildGrainArrowMarkup({
  component,
  screenBox,
  view,
  showGrain,
}) {
  if (!showGrain || !screenBox) return "";

  const production = normalizeProductionMetadata(component);
  const axis = getGrainScreenAxis(production.grainDirection, view);
  if (!axis) return "";

  const minVisible = Math.min(screenBox.w, screenBox.h);
  if (minVisible < 32) return "";

  const stroke = "#334155";
  const textStyle =
    'fill="#334155" font-size="7.5" font-weight="700" ' +
    'paint-order="stroke" stroke="#ffffff" stroke-width="3"';

  if (axis.orientation === "horizontal") {
    const y = screenBox.y + screenBox.h * 0.5;
    const x1 = screenBox.x + screenBox.w * 0.28;
    const x2 = screenBox.x + screenBox.w * 0.72;
    const head = Math.min(7, Math.max(4, screenBox.h * 0.05));

    return `
      ${svgLine(
        x1,
        y,
        x2,
        y,
        `stroke="${stroke}" stroke-width="1.15"`,
      )}
      ${svgLine(
        x2,
        y,
        x2 - head,
        y - head * 0.65,
        `stroke="${stroke}" stroke-width="1.15"`,
      )}
      ${svgLine(
        x2,
        y,
        x2 - head,
        y + head * 0.65,
        `stroke="${stroke}" stroke-width="1.15"`,
      )}
      ${svgText(
        (x1 + x2) / 2,
        y - 7,
        `GRAIN → ${axis.label}`,
        `${textStyle} text-anchor="middle"`,
      )}
    `;
  }

  const x = screenBox.x + screenBox.w * 0.5;
  const y1 = screenBox.y + screenBox.h * 0.72;
  const y2 = screenBox.y + screenBox.h * 0.28;
  const head = Math.min(7, Math.max(4, screenBox.w * 0.05));

  return `
    ${svgLine(
      x,
      y1,
      x,
      y2,
      `stroke="${stroke}" stroke-width="1.15"`,
    )}
    ${svgLine(
      x,
      y2,
      x - head * 0.65,
      y2 + head,
      `stroke="${stroke}" stroke-width="1.15"`,
    )}
    ${svgLine(
      x,
      y2,
      x + head * 0.65,
      y2 + head,
      `stroke="${stroke}" stroke-width="1.15"`,
    )}
    ${svgText(
      x + 7,
      (y1 + y2) / 2,
      `GRAIN ↑ ${axis.label}`,
      `${textStyle} text-anchor="start"`,
    )}
  `;
}

function getNotchAnchorLocal(descriptor, notch) {
  const points = descriptor?.contourPointsMm || [];
  if (points.length < 2) return null;

  const index = clampValue(
    Math.floor(Number(notch.edgeIndex) || 0),
    0,
    points.length - 1,
  );
  const nextIndex = (index + 1) % points.length;
  const start = points[index];
  const end = points[nextIndex];

  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const centerOffset =
    (Number(notch.offset) || 0) +
    Math.max(1, Number(notch.width) || 1) / 2;
  const t = clampValue(centerOffset / length, 0, 1);

  return [
    start[0] + dx * t,
    start[1] + dy * t,
  ];
}

function describeOperation(operation = {}) {
  const label = String(getOperationLabel(operation.type) || "Operation").toUpperCase();

  if (operation.type === "bore") {
    return `${label} Ø${formatMm(operation.diameter, 1)} × ${formatMm(
      operation.depth,
      1,
    )} DEEP · ${faceLabel(operation.surface)}`;
  }

  if (operation.type === "rabbet") {
    return `${label} ${formatMm(operation.length, 1)}L × ${formatMm(
      operation.width,
      1,
    )}W × ${formatMm(operation.depth, 1)}D · ${edgeLabel(
      operation.edge,
    )} · ${faceLabel(operation.surface)}`;
  }

  return `${label} ${formatMm(operation.length, 1)}L × ${formatMm(
    operation.width,
    1,
  )}W × ${formatMm(operation.depth, 1)}D · ${faceLabel(
    operation.surface,
  )}`;
}

function collectFeatureCallouts({
  component,
  screenBox,
  view,
}) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  const viewPlane = getViewPlane(view);
  const features = [];
  let invalidCount = 0;

  if (descriptor && descriptor.plane === viewPlane) {
    descriptor.profileCutouts.forEach((cutout) => {
      const status = getProfileCutoutStatus(component, cutout);
      if (!status.valid) {
        invalidCount += 1;
        return;
      }

      const anchor = localToScreen({
        localU: cutout.u,
        localV: cutout.v,
        descriptor,
        view,
        screenBox,
      });
      if (!anchor) return;

      const label =
        cutout.type === "rect"
          ? `${formatMm(cutout.width, 1)} × ${formatMm(
              cutout.height,
              1,
            )} THRU`
          : `Ø${formatMm(cutout.diameter, 1)} THRU`;

      features.push({
        kind: "cutout",
        anchor,
        label,
      });
    });

    descriptor.profileEdgeNotches.forEach((notch) => {
      const status = getProfileEdgeNotchStatus(component, notch);
      if (!status.valid) {
        invalidCount += 1;
        return;
      }

      const local = getNotchAnchorLocal(descriptor, notch);
      if (!local) return;

      const anchor = localToScreen({
        localU: local[0],
        localV: local[1],
        descriptor,
        view,
        screenBox,
      });
      if (!anchor) return;

      features.push({
        kind: "notch",
        anchor,
        label:
          `NOTCH ${formatMm(notch.width, 1)}W × ${formatMm(
            notch.depth,
            1,
          )}D · OFF ${formatMm(notch.offset, 1)}`,
      });
    });
  }

  const operations = normalizeWoodworkingOperations(
    component.woodworkingOperations,
  );
  const operationDims = getOperationProfileDimensions(component);

  if (operations.length && operationDims.plane === viewPlane) {
    const context = getOperationContext(component, descriptor);

    operations.forEach((operation) => {
      const status = getWoodworkingOperationStatus(
        component,
        operation,
        context,
      );
      if (!status.valid) {
        invalidCount += 1;
        return;
      }

      const footprint = getWoodworkingOperationFootprint(
        component,
        operation,
      );
      const centerU =
        footprint.shape === "circle"
          ? footprint.centerU
          : (footprint.minU + footprint.maxU) / 2;
      const centerV =
        footprint.shape === "circle"
          ? footprint.centerV
          : (footprint.minV + footprint.maxV) / 2;

      const projectionDescriptor =
        descriptor ||
        {
          plane: operationDims.plane,
          u: operationDims.u,
          v: operationDims.v,
        };

      const anchor = localToScreen({
        localU: centerU,
        localV: centerV,
        descriptor: projectionDescriptor,
        view,
        screenBox,
      });
      if (!anchor) return;

      features.push({
        kind: "operation",
        anchor,
        label: describeOperation(operation),
      });
    });
  }

  return {
    descriptor,
    features,
    invalidCount,
  };
}

function buildLeaderLabelMarkup({
  anchor,
  label,
  screenBox,
  drawingArea,
  localIndex,
  prefix,
}) {
  const rightSpace =
    drawingArea.x + drawingArea.w - (screenBox.x + screenBox.w);
  const leftSpace = screenBox.x - drawingArea.x;
  const side =
    rightSpace >= 118 || rightSpace >= leftSpace ? "right" : "left";

  const labelX =
    side === "right"
      ? clampValue(
          screenBox.x + screenBox.w + 18,
          drawingArea.x + 12,
          drawingArea.x + drawingArea.w - 12,
        )
      : clampValue(
          screenBox.x - 18,
          drawingArea.x + 12,
          drawingArea.x + drawingArea.w - 12,
        );

  const baseY = screenBox.y + 16 + localIndex * 15;
  const labelY = clampValue(
    baseY,
    drawingArea.y + 54,
    drawingArea.y + drawingArea.h - 18,
  );

  const elbowX =
    side === "right"
      ? Math.min(labelX - 8, anchor.x + 18)
      : Math.max(labelX + 8, anchor.x - 18);

  const finalText = truncateText(`${prefix}${label}`, 46);
  const textAnchor = side === "right" ? "start" : "end";

  return `
    ${svgPolyline(
      [
        { x: anchor.x, y: anchor.y },
        { x: elbowX, y: anchor.y },
        { x: elbowX, y: labelY - 3 },
        { x: labelX, y: labelY - 3 },
      ],
      'fill="none" stroke="#475569" stroke-width="0.9"',
    )}
    <circle
      cx="${anchor.x}"
      cy="${anchor.y}"
      r="2.5"
      fill="#ffffff"
      stroke="#0f172a"
      stroke-width="1"
    />
    ${svgText(
      labelX,
      labelY,
      finalText,
      `fill="#0f172a" font-size="7.8" font-weight="700" text-anchor="${textAnchor}" paint-order="stroke" stroke="#ffffff" stroke-width="3"`,
    )}
  `;
}

function buildSourceCheckMarkup({
  screenBox,
  drawingArea,
  invalidCount,
  prefix,
}) {
  if (!invalidCount) return "";

  const x = clampValue(
    screenBox.x + 6,
    drawingArea.x + 8,
    drawingArea.x + drawingArea.w - 170,
  );
  const y = clampValue(
    screenBox.y - 10,
    drawingArea.y + 52,
    drawingArea.y + drawingArea.h - 12,
  );

  return svgText(
    x,
    y,
    truncateText(`${prefix}CHECK ${invalidCount} SOURCE ITEM(S) — SEE A-109`, 50),
    'fill="#7c2d12" font-size="7.5" font-weight="800" paint-order="stroke" stroke="#ffffff" stroke-width="3"',
  );
}

function buildWoodworkingVisualCallouts({
  view,
  selectedComponents = [],
  scaledItems = [],
  drawingArea,
  selectedCompId = null,
}) {
  if (
    !SUPPORTED_VIEWS.has(view) ||
    !Array.isArray(scaledItems) ||
    !scaledItems.length ||
    !drawingArea
  ) {
    return "";
  }

  let sheetCount = 0;
  const assembly = selectedComponents.length > 1;

  return scaledItems
    .map(({ comp, screenBox }) => {
      const { descriptor, features, invalidCount } =
        collectFeatureCallouts({
          component: comp,
          screenBox,
          view,
        });

      const hasSpecialDetails =
        Boolean(descriptor) ||
        features.length > 0 ||
        invalidCount > 0;

      const showGrain =
        selectedComponents.length === 1 ||
        comp?.id === selectedCompId ||
        hasSpecialDetails;

      const grainMarkup = buildGrainArrowMarkup({
        component: comp,
        screenBox,
        view,
        showGrain,
      });

      if (!features.length && !invalidCount && !grainMarkup) {
        return "";
      }

      const prefix = assembly
        ? `${String(comp?.partCode || comp?.label || "PART").trim()}: `
        : "";

      const roomLeft = Math.max(
        0,
        MAX_VISUAL_CALLOUTS_PER_SHEET - sheetCount,
      );
      const visibleFeatures = features.slice(
        0,
        Math.min(MAX_VISUAL_CALLOUTS_PER_PART, roomLeft),
      );
      sheetCount += visibleFeatures.length;

      const featureMarkup = visibleFeatures
        .map((feature, index) =>
          buildLeaderLabelMarkup({
            anchor: feature.anchor,
            label: feature.label,
            screenBox,
            drawingArea,
            localIndex: index,
            prefix,
          }),
        )
        .join("");

      const hiddenCount = features.length - visibleFeatures.length;
      const overflowMarkup =
        hiddenCount > 0
          ? svgText(
              clampValue(
                screenBox.x + screenBox.w / 2,
                drawingArea.x + 90,
                drawingArea.x + drawingArea.w - 90,
              ),
              clampValue(
                screenBox.y + screenBox.h + 13,
                drawingArea.y + 60,
                drawingArea.y + drawingArea.h - 10,
              ),
              `${prefix}+${hiddenCount} MORE DETAIL(S) — SEE A-109`,
              'fill="#475569" font-size="7.5" font-weight="700" text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="3"',
            )
          : "";

      return `
        ${grainMarkup}
        ${featureMarkup}
        ${overflowMarkup}
        ${buildSourceCheckMarkup({
          screenBox,
          drawingArea,
          invalidCount,
          prefix,
        })}
      `;
    })
    .join("");
}

export { buildWoodworkingVisualCallouts };