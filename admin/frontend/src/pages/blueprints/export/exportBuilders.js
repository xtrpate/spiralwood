import {
  getComponentsBounds3D,
  get2DBounds,
  getProjectedBox,
  shouldMirrorView,
  getMirroredBox,
  getViewSheetCode,
} from "../data/componentUtils";
import {
  getScaledExportItems,
  getExportDrawingArea,
  getExportRawItems,
} from "./placementHelpers";
import {
  escapeHtml,
  snap,
  clamp,
  formatDims,
  getNowStamp,
  formatDim,
} from "../data/utils";
import {
  VIEWS,
  CASEWORK_SET,
  TABLE_SET,
  BENCH_SET,
  CHAIR_PART_SET,
  WOOD_FINISHES,
} from "../data/furnitureTypes";
import {
  renderBlueprintShape,
  renderCaseworkBlueprint,
  renderSofaBlueprint,
  renderBedBlueprint,
  renderBenchBlueprint,
  renderLoungerBlueprint,
  renderOfficeChairBlueprint,
  renderPatioSetBlueprint,
  renderTableBlueprint,
  renderChairLegShape,
  getBlueprintStroke,
  buildBlueprintSvgMarkup,
} from "../2d/render2D";

import {
  getExportSheetCode,
  svgLine,
  svgRect,
  svgText,
  svgPolyline,
  truncateText,
  fitFontSize,
  getSheetViewLabel,
  getPageHeaderTitle,
  detectDiningTableSelection,
  getDiningTablePartRole,
  shouldRenderOrthographicLabel,
  resolveExportProjectTitle,
  get3DCalloutPlacement,
  build3DCalloutMarkup,
  resolveExportFocusLabel,
  formatDimsForTitleBlock,
} from "./exportSheetUtils";
import { buildWoodworkingDetailsPages } from "./woodworkingDetailsExport";
import { buildWoodworkingVisualCallouts } from "./woodworkingVisualCallouts";

const GRID_SIZE = 20;
const BOARD = 18;
const PAPER_MARGIN = 28;
const TITLE_BLOCK_H = 96;
const DRAWING_PADDING = 56;
const EXPORT_PAGE_W = 1200;
const EXPORT_PAGE_H = 820;
const PROFESSIONAL_DRAWING_STATUS = "FOR REVIEW";
const PROFESSIONAL_DRAWING_NOTE = "DO NOT SCALE DRAWING";

function buildExplodedLabelMarkup({ comp, screenBox, idx, drawingArea }) {
  const labelText = String(idx + 1);
  const balloonR = 11;

  const centerX = screenBox.x + screenBox.w / 2;
  const centerY = screenBox.y + screenBox.h / 2;
  const side =
    screenBox.labelSide ||
    (centerX >= drawingArea.x + drawingArea.w / 2 ? "right" : "left");
  const lane = Number.isFinite(screenBox.labelLane)
    ? screenBox.labelLane
    : idx % 4;

  const leftLaneY = drawingArea.y + 98 + lane * 78;
  const rightLaneY = drawingArea.y + 98 + lane * 78;
  const topTextY = drawingArea.y + 22 + lane * 22;
  const bottomTextY = drawingArea.y + drawingArea.h - 28 - lane * 22;
  const topLaneX = drawingArea.x + drawingArea.w / 2;
  const bottomLaneX = drawingArea.x + drawingArea.w / 2;

  if (side === "top") {
    const elbowY = Math.max(drawingArea.y + 44, screenBox.y - 16);
    const cx = topLaneX;
    const cy = topTextY + 6;

    return `
      ${svgPolyline(
        [
          { x: centerX, y: screenBox.y },
          { x: centerX, y: elbowY },
          { x: cx, y: elbowY },
          { x: cx, y: cy - balloonR },
        ],
        `fill="none" stroke="#475569" stroke-width="1"`,
      )}
      <circle cx="${cx}" cy="${cy}" r="${balloonR}" fill="#ffffff" stroke="#0f172a" stroke-width="1.2" />
      ${svgText(
        cx,
        cy + 3,
        labelText,
        `fill="#0f172a" font-size="9" font-weight="700" text-anchor="middle"`,
      )}
    `;
  }

  if (side === "bottom") {
    const elbowY = Math.min(
      drawingArea.y + drawingArea.h - 44,
      screenBox.y + screenBox.h + 16,
    );
    const cx = bottomLaneX;
    const cy = bottomTextY - 6;

    return `
      ${svgPolyline(
        [
          { x: centerX, y: screenBox.y + screenBox.h },
          { x: centerX, y: elbowY },
          { x: cx, y: elbowY },
          { x: cx, y: cy + balloonR },
        ],
        `fill="none" stroke="#475569" stroke-width="1"`,
      )}
      <circle cx="${cx}" cy="${cy}" r="${balloonR}" fill="#ffffff" stroke="#0f172a" stroke-width="1.2" />
      ${svgText(
        cx,
        cy + 3,
        labelText,
        `fill="#0f172a" font-size="9" font-weight="700" text-anchor="middle"`,
      )}
    `;
  }

  if (side === "right") {
    const startX = screenBox.x + screenBox.w;
    const elbowX = Math.min(startX + 20, drawingArea.x + drawingArea.w - 190);
    const cx = drawingArea.x + drawingArea.w - 22;
    const cy = rightLaneY;

    return `
      ${svgPolyline(
        [
          { x: startX, y: centerY },
          { x: elbowX, y: centerY },
          { x: elbowX, y: cy },
          { x: cx - balloonR, y: cy },
        ],
        `fill="none" stroke="#475569" stroke-width="1"`,
      )}
      <circle cx="${cx}" cy="${cy}" r="${balloonR}" fill="#ffffff" stroke="#0f172a" stroke-width="1.2" />
      ${svgText(
        cx,
        cy + 3,
        labelText,
        `fill="#0f172a" font-size="9" font-weight="700" text-anchor="middle"`,
      )}
    `;
  }

  const startX = screenBox.x;
  const elbowX = Math.max(startX - 20, drawingArea.x + 190);
  const cx = drawingArea.x + 22;
  const cy = leftLaneY;

  return `
    ${svgPolyline(
      [
        { x: startX, y: centerY },
        { x: elbowX, y: centerY },
        { x: elbowX, y: cy },
        { x: cx + balloonR, y: cy },
      ],
      `fill="none" stroke="#475569" stroke-width="1"`,
    )}
    <circle cx="${cx}" cy="${cy}" r="${balloonR}" fill="#ffffff" stroke="#0f172a" stroke-width="1.2" />
    ${svgText(
      cx,
      cy + 3,
      labelText,
      `fill="#0f172a" font-size="9" font-weight="700" text-anchor="middle"`,
    )}
  `;
}

function buildSvgDimensionLine(
  x1,
  y1,
  x2,
  y2,
  text,
  orientation = "horizontal",
  offset = 24,
) {
  const dimColor = "#0f172a";
  const extColor = "#475569";

  if (orientation === "horizontal") {
    const y = y1 - offset;
    return `
      ${svgLine(x1, y1, x1, y, `stroke="${extColor}" stroke-width="1"`)}
      ${svgLine(x2, y2, x2, y, `stroke="${extColor}" stroke-width="1"`)}
      ${svgLine(x1, y, x2, y, `stroke="${dimColor}" stroke-width="1"`)}
      ${svgLine(x1, y, x1 + 8, y - 4, `stroke="${dimColor}" stroke-width="1"`)}
      ${svgLine(x1, y, x1 + 8, y + 4, `stroke="${dimColor}" stroke-width="1"`)}
      ${svgLine(x2, y, x2 - 8, y - 4, `stroke="${dimColor}" stroke-width="1"`)}
      ${svgLine(x2, y, x2 - 8, y + 4, `stroke="${dimColor}" stroke-width="1"`)}
      ${svgText((x1 + x2) / 2, y - 8, text, `fill="${dimColor}" font-size="10" text-anchor="middle"`)}
    `;
  }

  const x = offset >= 0 ? x1 + offset : x1 + offset;
  const textAnchor = offset >= 0 ? "start" : "end";
  const textX = offset >= 0 ? x + 8 : x - 8;

  return `
    ${svgLine(x1, y1, x, y1, `stroke="${extColor}" stroke-width="1"`)}
    ${svgLine(x2, y2, x, y2, `stroke="${extColor}" stroke-width="1"`)}
    ${svgLine(x, y1, x, y2, `stroke="${dimColor}" stroke-width="1"`)}
    ${svgLine(x, y1, x - 4, y1 + 8, `stroke="${dimColor}" stroke-width="1"`)}
    ${svgLine(x, y1, x + 4, y1 + 8, `stroke="${dimColor}" stroke-width="1"`)}
    ${svgLine(x, y2, x - 4, y2 - 8, `stroke="${dimColor}" stroke-width="1"`)}
    ${svgLine(x, y2, x + 4, y2 - 8, `stroke="${dimColor}" stroke-width="1"`)}
    ${svgText(textX, (y1 + y2) / 2, text, `fill="${dimColor}" font-size="10" text-anchor="${textAnchor}" dominant-baseline="middle"`)}
  `;
}

function buildSvgPaperMarkup(pageW, pageH) {
  const refs = [];
  const refStep = 80;

  for (let x = PAPER_MARGIN + refStep; x < pageW - PAPER_MARGIN; x += refStep) {
    refs.push(
      svgText(
        x - 4,
        PAPER_MARGIN - 8,
        `${Math.round((x - PAPER_MARGIN) / refStep)}`,
        `fill="#64748b" font-size="9"`,
      ),
    );
  }

  for (
    let y = PAPER_MARGIN + refStep;
    y < pageH - PAPER_MARGIN - TITLE_BLOCK_H;
    y += refStep
  ) {
    refs.push(
      svgText(
        PAPER_MARGIN - 18,
        y + 4,
        String.fromCharCode(64 + Math.round((y - PAPER_MARGIN) / refStep)),
        `fill="#64748b" font-size="9"`,
      ),
    );
  }

  return `
    ${svgRect(0, 0, pageW, pageH, `fill="#ffffff"`)}
    ${svgRect(
      PAPER_MARGIN,
      PAPER_MARGIN,
      pageW - PAPER_MARGIN * 2,
      pageH - PAPER_MARGIN * 2,
      `fill="none" stroke="#0f172a" stroke-width="1.6"`,
    )}
    ${svgRect(
      PAPER_MARGIN + 8,
      PAPER_MARGIN + 8,
      pageW - PAPER_MARGIN * 2 - 16,
      pageH - PAPER_MARGIN * 2 - 16,
      `fill="none" stroke="#94a3b8" stroke-width="0.65"`,
    )}
    ${refs.join("")}
  `;
}

function buildSvgSheetMetaMarkup({ pageW, unit }) {
  const unitText = String(unit || "mm").toUpperCase();

  return `
    ${svgText(
      pageW - PAPER_MARGIN - 12,
      PAPER_MARGIN + 20,
      `${PROFESSIONAL_DRAWING_STATUS}  |  ${PROFESSIONAL_DRAWING_NOTE}`,
      `font-size="9" font-weight="700" fill="#334155" text-anchor="end"`,
    )}
    ${svgText(
      pageW - PAPER_MARGIN - 12,
      PAPER_MARGIN + 36,
      `ALL WRITTEN DIMENSIONS IN ${unitText}`,
      `font-size="8.5" fill="#64748b" text-anchor="end"`,
    )}
  `;
}

function buildSvgTitleBlockMarkup({
  pageW,
  pageH,
  blueprintTitle,
  objectLabel,
  viewLabel,
  materialText,
  dimsText,
  unit,
  scaleText = "NTS",
  sheetCode = "A-101",
}) {
  const x = PAPER_MARGIN;
  const y = pageH - PAPER_MARGIN - TITLE_BLOCK_H;
  const w = pageW - PAPER_MARGIN * 2;
  const h = TITLE_BLOCK_H;

  const projectText = truncateText(blueprintTitle || "Blueprint Design", 58);
  const objectText = truncateText(objectLabel || "No Selection", 30);
  const viewText = truncateText(viewLabel || "View", 18);
  const unitText = truncateText(String(unit || "mm").toUpperCase(), 8);
  const rawMaterialValue = String(materialText || "—").trim();
  const materialValue = rawMaterialValue.includes(",")
    ? "MULTIPLE MATERIALS"
    : truncateText(rawMaterialValue, 20);
  const dimsValue = truncateText(dimsText || "—", 18);
  const scaleValue = truncateText(scaleText || "NTS", 8);
  const sheetValue = truncateText(sheetCode || "A-101", 10);

  const projectFont = fitFontSize(projectText, 15, 34, 11);
  const objectFont = fitFontSize(objectText, 12, 20, 9);
  const materialFont = fitFontSize(materialValue, 9.5, 18, 8);
  const dimsFont = fitFontSize(dimsValue, 9.5, 18, 8);

  return `
    ${svgRect(x, y, w, h, `fill="#ffffff" stroke="#0f172a" stroke-width="1.4"`)}
    ${svgLine(x + w - 410, y, x + w - 410, y + h, `stroke="#0f172a" stroke-width="1"`)}
    ${svgLine(x + w - 205, y, x + w - 205, y + h, `stroke="#0f172a" stroke-width="1"`)}
    ${svgLine(x + w - 95, y, x + w - 95, y + h, `stroke="#0f172a" stroke-width="1"`)}
    ${svgLine(x, y + 32, x + w, y + 32, `stroke="#0f172a" stroke-width="1"`)}
    ${svgLine(x + w - 390, y + 54, x + w, y + 54, `stroke="#0f172a" stroke-width="1"`)}
    ${svgLine(x + w - 390, y + 76, x + w, y + 76, `stroke="#0f172a" stroke-width="1"`)}

    ${svgText(x + 10, y + 16, "PROJECT / BLUEPRINT TITLE", `font-size="9" fill="#64748b"`)}
    ${svgText(
      x + 10,
      y + 48,
      projectText,
      `font-size="${projectFont}" font-weight="700" fill="#0f172a"`,
    )}
    ${svgText(x + w - 400, y + 16, "OBJECT", `font-size="9" fill="#64748b"`)}
    ${svgText(
      x + w - 400,
      y + 48,
      objectText,
      `font-size="${objectFont}" font-weight="700" fill="#0f172a"`,
    )}
    ${svgText(x + w - 195, y + 16, "VIEW", `font-size="9" fill="#64748b"`)}
    ${svgText(x + w - 195, y + 48, viewText, `font-size="12" font-weight="700" fill="#0f172a"`)}
    ${svgText(x + w - 85, y + 16, "UNIT", `font-size="9" fill="#64748b"`)}
    ${svgText(x + w - 85, y + 48, unitText, `font-size="12" font-weight="700" fill="#0f172a"`)}
    ${svgText(x + w - 400, y + 68, "MATERIAL / FINISH", `font-size="9" fill="#64748b"`)}
    ${svgText(
      x + w - 400,
      y + 90,
      materialValue,
      `font-size="${materialFont}" fill="#0f172a"`,
    )}
    ${svgText(x + w - 195, y + 68, "DIMENSIONS", `font-size="9" fill="#64748b"`)}
    ${svgText(
      x + w - 195,
      y + 90,
      dimsValue,
      `font-size="${dimsFont}" fill="#0f172a"`,
    )}
    ${svgText(x + w - 85, y + 68, "SCALE", `font-size="9" fill="#64748b"`)}
    ${svgText(x + w - 85, y + 90, scaleValue, `font-size="10" fill="#0f172a"`)}
    ${svgText(x + 10, y + 68, "DATE", `font-size="9" fill="#64748b"`)}
    ${svgText(x + 10, y + 90, getNowStamp(), `font-size="10" fill="#0f172a"`)}
    ${svgText(x + 120, y + 68, "SHEET", `font-size="9" fill="#64748b"`)}
    ${svgText(x + 120, y + 90, sheetValue, `font-size="10" fill="#0f172a"`)}
    ${svgText(x + 220, y + 68, "STATUS", `font-size="9" fill="#64748b"`)}
    ${svgText(
      x + 220,
      y + 90,
      PROFESSIONAL_DRAWING_STATUS,
      `font-size="10" font-weight="700" fill="#0f172a"`,
    )}
    ${svgText(x + 350, y + 68, "DRAWN BY", `font-size="9" fill="#64748b"`)}
    ${svgText(
      x + 350,
      y + 90,
      "WISDOM",
      `font-size="10" font-weight="700" fill="#0f172a"`,
    )}
  `;
}

function getRoleComponentMap(components = []) {
  const map = new Map();
  components.forEach((comp) => {
    const role = getDiningTablePartRole(comp);
    if (role !== "other" && !map.has(role)) {
      map.set(role, comp);
    }
  });
  return map;
}

function getSafeVerticalDimOffset(
  overallScreenBounds,
  drawingArea,
  preferred = 28,
) {
  if (!overallScreenBounds || !drawingArea) return preferred;
  const rightAllowance =
    drawingArea.x + drawingArea.w - overallScreenBounds.maxX;
  return rightAllowance >= preferred + 20 ? preferred : -preferred;
}

function buildOrthographicTechnicalNotes({
  view,
  selectedComponents,
  drawingArea,
  unit,
}) {
  if (!detectDiningTableSelection(selectedComponents)) {
    return "";
  }

  // Professional cleanup:
  // keep general notes on Front View only
  if (view !== "front") {
    return "";
  }

  const roles = getRoleComponentMap(selectedComponents);
  const top = roles.get("top");
  const frontApron = roles.get("frontApron");
  const rearApron = roles.get("rearApron");
  const leftApron = roles.get("leftApron");
  const rightApron = roles.get("rightApron");
  const sampleApron = frontApron || rearApron || leftApron || rightApron;
  const leg =
    roles.get("frontLegL") ||
    roles.get("frontLegR") ||
    roles.get("backLegL") ||
    roles.get("backLegR");

  const noteLines = [];
  if (top) {
    noteLines.push(`Top thickness: ${formatDim(top.height, unit)}`);
  }
  if (sampleApron) {
    noteLines.push(
      view === "left" || view === "right"
        ? `Apron section: ${formatDim(sampleApron.depth, unit)} × ${formatDim(sampleApron.height, unit)}`
        : `Apron section: ${formatDim(sampleApron.width, unit)} × ${formatDim(sampleApron.height, unit)}`,
    );
  }
  if (leg) {
    noteLines.push(
      `Leg section: ${formatDim(leg.width, unit)} × ${formatDim(leg.depth, unit)}`,
    );
  }

  if (!noteLines.length) return "";

  const boxW = 250;
  const boxH = 30 + noteLines.length * 16;
  const boxX = drawingArea.x + drawingArea.w - boxW - 14;
  const boxY = drawingArea.y + drawingArea.h - boxH - 10;

  return `
    ${svgRect(boxX, boxY, boxW, boxH, `fill="#ffffff" stroke="#94a3b8" stroke-width="1"`)}
    ${svgText(boxX + 10, boxY + 16, "DETAIL NOTES", `font-size="9" fill="#64748b"`)}
    ${noteLines
      .map((line, index) =>
        svgText(
          boxX + 10,
          boxY + 34 + index * 16,
          line,
          `font-size="10" fill="#0f172a"`,
        ),
      )
      .join("")}
  `;
}

function buildOrthographicPartCallouts({
  view,
  selectedComponents,
  scaledItems,
  unit,
}) {
  if (!detectDiningTableSelection(selectedComponents) || view === "exploded") {
    return "";
  }

  const byRole = new Map();
  scaledItems.forEach((item) => {
    byRole.set(getDiningTablePartRole(item.comp), item);
  });

  const callouts = [];

  if (view === "front" || view === "back") {
    const topItem = byRole.get("top");
    const apronItem = byRole.get(view === "front" ? "frontApron" : "rearApron");
    const legItem = byRole.get(view === "front" ? "frontLegL" : "backLegL");

    if (topItem) {
      callouts.push(
        buildSvgDimensionLine(
          topItem.screenBox.x - 16,
          topItem.screenBox.y,
          topItem.screenBox.x - 16,
          topItem.screenBox.y + topItem.screenBox.h,
          formatDim(topItem.comp.height, unit),
          "vertical",
          -18,
        ),
      );
    }

    if (apronItem) {
      callouts.push(
        buildSvgDimensionLine(
          apronItem.screenBox.x + apronItem.screenBox.w + 14,
          apronItem.screenBox.y,
          apronItem.screenBox.x + apronItem.screenBox.w + 14,
          apronItem.screenBox.y + apronItem.screenBox.h,
          formatDim(apronItem.comp.height, unit),
          "vertical",
          18,
        ),
      );
    }

    if (legItem) {
      callouts.push(
        buildSvgDimensionLine(
          legItem.screenBox.x,
          legItem.screenBox.y + legItem.screenBox.h + 14,
          legItem.screenBox.x + legItem.screenBox.w,
          legItem.screenBox.y + legItem.screenBox.h + 14,
          formatDim(legItem.comp.width, unit),
          "horizontal",
          -10,
        ),
      );
    }
  }

  if (view === "left" || view === "right") {
    const topItem = byRole.get("top");
    const apronItem = byRole.get(view === "left" ? "leftApron" : "rightApron");
    const legItem = byRole.get(view === "left" ? "frontLegL" : "frontLegR");

    if (topItem) {
      callouts.push(
        buildSvgDimensionLine(
          topItem.screenBox.x - 16,
          topItem.screenBox.y,
          topItem.screenBox.x - 16,
          topItem.screenBox.y + topItem.screenBox.h,
          formatDim(topItem.comp.height, unit),
          "vertical",
          -18,
        ),
      );
    }

    if (apronItem) {
      callouts.push(
        buildSvgDimensionLine(
          apronItem.screenBox.x + apronItem.screenBox.w + 14,
          apronItem.screenBox.y,
          apronItem.screenBox.x + apronItem.screenBox.w + 14,
          apronItem.screenBox.y + apronItem.screenBox.h,
          formatDim(apronItem.comp.height, unit),
          "vertical",
          18,
        ),
      );
    }

    if (legItem) {
      callouts.push(
        buildSvgDimensionLine(
          legItem.screenBox.x,
          legItem.screenBox.y + legItem.screenBox.h + 14,
          legItem.screenBox.x + legItem.screenBox.w,
          legItem.screenBox.y + legItem.screenBox.h + 14,
          formatDim(legItem.comp.depth, unit),
          "horizontal",
          -10,
        ),
      );
    }
  }

  if (view === "top") {
    const frontApron = byRole.get("frontApron");
    const leftApron = byRole.get("leftApron");

    if (frontApron) {
      callouts.push(
        buildSvgDimensionLine(
          frontApron.screenBox.x,
          frontApron.screenBox.y - 12,
          frontApron.screenBox.x + frontApron.screenBox.w,
          frontApron.screenBox.y - 12,
          formatDim(frontApron.comp.width, unit),
          "horizontal",
          18,
        ),
      );
    }

    if (leftApron) {
      callouts.push(
        buildSvgDimensionLine(
          leftApron.screenBox.x - 12,
          leftApron.screenBox.y,
          leftApron.screenBox.x - 12,
          leftApron.screenBox.y + leftApron.screenBox.h,
          formatDim(leftApron.comp.depth, unit),
          "vertical",
          -18,
        ),
      );
    }
  }

  return callouts.join("");
}
function build2DViewPageSvg({
  selectedComponents,
  selectedComp,
  selectedLabel,
  selectedMaterialText,
  selectedBounds3D,
  selectedDimsText,
  blueprintTitle,
  unit,
  view,
  pageW = EXPORT_PAGE_W,
  pageH = EXPORT_PAGE_H,
}) {
  const { drawingArea, scaledItems, overallScreenBounds } =
    getScaledExportItems(selectedComponents, view, pageW, pageH);

  const rawViewLabel = VIEWS.find((v) => v.key === view)?.label || "View";
  const viewLabel = getSheetViewLabel(view, rawViewLabel);
  const focusLabel =
    selectedLabel ||
    selectedComp?.groupLabel ||
    selectedComp?.label ||
    "Full Blueprint Layout";

  const resolvedProjectTitle = resolveExportProjectTitle({
    blueprintTitle,
    objectLabel: focusLabel,
    selectedComponents,
  });

  const dimSource =
    selectedBounds3D || getComponentsBounds3D(selectedComponents);

  const verticalDimOffset =
    view !== "exploded"
      ? getSafeVerticalDimOffset(overallScreenBounds, drawingArea, 28)
      : 28;

  const itemsMarkup = scaledItems
    .map(({ comp, screenBox }, idx) => {
      const shouldShowLabel = shouldRenderOrthographicLabel(
        comp,
        view,
        selectedComponents,
      );

      const labelMarkup = !shouldShowLabel
        ? ""
        : view === "exploded"
          ? buildExplodedLabelMarkup({
              comp,
              screenBox,
              idx,
              drawingArea,
            })
          : svgText(
              screenBox.x + screenBox.w / 2,
              screenBox.y + screenBox.h + 16,
              truncateText(comp.partCode || comp.label, 18),
              `fill="#475569" font-size="9" text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="3"`,
            );

      return `
        <g transform="translate(${screenBox.x}, ${screenBox.y})">
          ${buildBlueprintSvgMarkup(comp, screenBox, view)}
        </g>
        
        ${labelMarkup}
      `;
    })
    .join("");

  const dimMarkup =
    view !== "exploded" && overallScreenBounds && dimSource
      ? `
        ${buildSvgDimensionLine(
          overallScreenBounds.minX,
          overallScreenBounds.minY,
          overallScreenBounds.maxX,
          overallScreenBounds.minY,
          view === "left" || view === "right"
            ? formatDim(dimSource.depth, unit)
            : formatDim(dimSource.width, unit),
          "horizontal",
          24,
        )}
        ${buildSvgDimensionLine(
          verticalDimOffset >= 0
            ? overallScreenBounds.maxX
            : overallScreenBounds.minX,
          overallScreenBounds.minY,
          verticalDimOffset >= 0
            ? overallScreenBounds.maxX
            : overallScreenBounds.minX,
          overallScreenBounds.maxY,
          view === "top"
            ? formatDim(dimSource.depth, unit)
            : formatDim(dimSource.height, unit),
          "vertical",
          verticalDimOffset,
        )}
        ${svgLine(
          drawingArea.x,
          (overallScreenBounds.minY + overallScreenBounds.maxY) / 2,
          drawingArea.x + drawingArea.w,
          (overallScreenBounds.minY + overallScreenBounds.maxY) / 2,
          `stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="4 4"`,
        )}
        ${svgLine(
          (overallScreenBounds.minX + overallScreenBounds.maxX) / 2,
          drawingArea.y,
          (overallScreenBounds.minX + overallScreenBounds.maxX) / 2,
          drawingArea.y + drawingArea.h,
          `stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="4 4"`,
        )}
      `
      : "";
  const technicalNotes =
    view === "exploded"
      ? ""
      : buildOrthographicTechnicalNotes({
          view,
          selectedComponents,
          drawingArea,
          unit,
        });

  const partCallouts = buildOrthographicPartCallouts({
    view,
    selectedComponents,
    scaledItems,
    unit,
  });

  const woodworkingVisualCallouts = buildWoodworkingVisualCallouts({
    view,
    selectedComponents,
    scaledItems,
    drawingArea,
    selectedCompId: selectedComp?.id ?? null,
  });

  const explodedNotes = "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">
      ${buildSvgPaperMarkup(pageW, pageH)}
      ${svgText(
        PAPER_MARGIN + 12,
        PAPER_MARGIN + 22,
        getPageHeaderTitle(view, rawViewLabel),
        `font-size="12" font-weight="700" fill="#0f172a"`,
      )}
      ${buildSvgSheetMetaMarkup({ pageW, unit })}
      ${svgText(
        PAPER_MARGIN + 12,
        PAPER_MARGIN + 40,
        truncateText(focusLabel, 52).toUpperCase(),
        `font-size="10" fill="#475569"`,
      )}
      
      ${itemsMarkup}
      ${dimMarkup}
      ${partCallouts}
      ${woodworkingVisualCallouts}
      ${technicalNotes}
      ${explodedNotes}
      ${buildSvgTitleBlockMarkup({
        pageW,
        pageH,
        blueprintTitle: resolvedProjectTitle,
        objectLabel: focusLabel,
        viewLabel,
        materialText: selectedMaterialText,
        dimsText: formatDimsForTitleBlock(selectedDimsText),
        unit,
        scaleText: "NTS",
        sheetCode: getExportSheetCode(view),
      })}
    </svg>
  `;
}

function build3DViewPageSvg({
  selectedComponents,
  selectedLabel,
  selectedMaterialText,
  selectedBounds3D,
  selectedDimsText,
  blueprintTitle,
  unit,
  pageW = EXPORT_PAGE_W,
  pageH = EXPORT_PAGE_H,
}) {
  const drawingArea = getExportDrawingArea(pageW, pageH);
  const bounds = getComponentsBounds3D(selectedComponents);

  const resolvedProjectTitle = resolveExportProjectTitle({
    blueprintTitle,
    objectLabel: selectedLabel,
    selectedComponents,
  });

  const dimSource = selectedBounds3D || bounds;

  if (!bounds || !selectedComponents?.length) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">
        ${buildSvgPaperMarkup(pageW, pageH)}
        ${svgText(
          pageW / 2,
          pageH / 2,
          "NO COMPONENTS TO EXPORT",
          `font-size="20" fill="#64748b" text-anchor="middle"`,
        )}
        ${buildSvgTitleBlockMarkup({
          pageW,
          pageH,
          blueprintTitle: resolvedProjectTitle || "Blueprint Design",
          objectLabel: selectedLabel || "No Selection",
          viewLabel: "3D View",
          materialText: selectedMaterialText || "—",
          dimsText: formatDimsForTitleBlock(selectedDimsText),
          unit,
          scaleText: "NTS",
          sheetCode: getExportSheetCode("3d"),
        })}
      </svg>
    `;
  }

  const iso = (x, y, z) => {
    const localX = x - bounds.minX;
    const localZ = z - bounds.minZ;
    const worldTop = bounds.maxY - y;

    return {
      x: (localX - localZ) * 0.866,
      y: (localX + localZ) * 0.5 - worldTop,
    };
  };

  const allCorners = [];

  selectedComponents.forEach((comp) => {
    const pts = [
      iso(comp.x, comp.y, comp.z),
      iso(comp.x + comp.width, comp.y, comp.z),
      iso(comp.x + comp.width, comp.y, comp.z + comp.depth),
      iso(comp.x, comp.y, comp.z + comp.depth),
      iso(comp.x, comp.y + comp.height, comp.z),
      iso(comp.x + comp.width, comp.y + comp.height, comp.z),
      iso(comp.x + comp.width, comp.y + comp.height, comp.z + comp.depth),
      iso(comp.x, comp.y + comp.height, comp.z + comp.depth),
    ];
    allCorners.push(...pts);
  });

  const minPx = Math.min(...allCorners.map((p) => p.x));
  const maxPx = Math.max(...allCorners.map((p) => p.x));
  const minPy = Math.min(...allCorners.map((p) => p.y));
  const maxPy = Math.max(...allCorners.map((p) => p.y));

  const rawW = Math.max(1, maxPx - minPx);
  const rawH = Math.max(1, maxPy - minPy);

  const scale = Math.min(drawingArea.w / rawW, drawingArea.h / rawH) * 0.96;

  const offsetX =
    drawingArea.x + (drawingArea.w - rawW * scale) / 2 - minPx * scale;
  const offsetY =
    drawingArea.y + (drawingArea.h - rawH * scale) / 2 - minPy * scale;

  const project = (x, y, z) => {
    const pt = iso(x, y, z);
    return {
      x: offsetX + pt.x * scale,
      y: offsetY + pt.y * scale,
    };
  };

  const sortedComponents = [...selectedComponents].sort((a, b) => {
    const depthA = a.x + a.z - a.y * 0.35;
    const depthB = b.x + b.z - b.y * 0.35;
    return depthA - depthB;
  });

  const shapes = sortedComponents
    .map((comp, idx) => {
      const stroke = getBlueprintStroke(comp) || "#334155";

      const p000 = project(comp.x, comp.y + comp.height, comp.z);
      const p100 = project(comp.x + comp.width, comp.y + comp.height, comp.z);
      const p110 = project(
        comp.x + comp.width,
        comp.y + comp.height,
        comp.z + comp.depth,
      );
      const p010 = project(comp.x, comp.y + comp.height, comp.z + comp.depth);

      const p001 = project(comp.x, comp.y, comp.z);
      const p101 = project(comp.x + comp.width, comp.y, comp.z);
      const p111 = project(comp.x + comp.width, comp.y, comp.z + comp.depth);
      const p011 = project(comp.x, comp.y, comp.z + comp.depth);

      const top = `${p001.x},${p001.y} ${p101.x},${p101.y} ${p111.x},${p111.y} ${p011.x},${p011.y}`;
      const left = `${p001.x},${p001.y} ${p011.x},${p011.y} ${p010.x},${p010.y} ${p000.x},${p000.y}`;
      const right = `${p001.x},${p001.y} ${p101.x},${p101.y} ${p100.x},${p100.y} ${p000.x},${p000.y}`;

      const labelAnchor = project(
        comp.x + comp.width / 2,
        comp.y,
        comp.z + comp.depth / 2,
      );

      const labelText = truncateText(comp.partCode || `P${idx + 1}`, 12);
      const placement = get3DCalloutPlacement(
        comp,
        selectedComponents,
        idx,
        drawingArea,
      );

      return `
        <polygon points="${top}" fill="#f8fafc" stroke="${stroke}" stroke-width="1.2" />
        <polygon points="${left}" fill="#ffffff" stroke="${stroke}" stroke-width="1.2" opacity="0.95" />
        <polygon points="${right}" fill="#e2e8f0" stroke="${stroke}" stroke-width="1.2" opacity="0.98" />
        ${build3DCalloutMarkup({
          labelAnchor,
          labelText,
          placement,
          drawingArea,
        })}
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">
      ${buildSvgPaperMarkup(pageW, pageH)}
      ${svgText(
        PAPER_MARGIN + 12,
        PAPER_MARGIN + 22,
        "TECHNICAL BLUEPRINT — 3D ISOMETRIC VIEW",
        `font-size="12" font-weight="700" fill="#0f172a"`,
      )}
      ${buildSvgSheetMetaMarkup({ pageW, unit })}
      ${svgText(
        PAPER_MARGIN + 12,
        PAPER_MARGIN + 40,
        truncateText(selectedLabel || "No Selected Object", 52).toUpperCase(),
        `font-size="10" fill="#475569"`,
      )}
      
      ${shapes}
      ${buildSvgTitleBlockMarkup({
        pageW,
        pageH,
        blueprintTitle: resolvedProjectTitle,
        objectLabel: selectedLabel || "No Selection",
        viewLabel: "3D View",
        materialText: selectedMaterialText || "—",
        dimsText: formatDimsForTitleBlock(selectedDimsText),
        unit,
        scaleText: "NTS",
        sheetCode: getExportSheetCode("3d"),
      })}
    </svg>
  `;
}

const WOOD_FINISH_PRICE_MAP = {
  "oak-natural": 1.0,
  "pine-light": 0.92,
  "maple-cream": 1.08,
  "beech-honey": 1.05,
  "walnut-dark": 1.22,
  "mahogany-rich": 1.18,
  "teak-golden": 1.28,
  "ash-beige": 1.1,
};

const TEMPLATE_GROUP_PRICE_MAP = {
  template_dining_table: 16200,
  template_bed_frame: 19800,
  template_wardrobe: 24800,
  template_coffee_table: 7800,
  template_closet_wardrobe: 0,
};

const PART_PREFIX_GROUP_PRICE_MAP = {
  dt_: TEMPLATE_GROUP_PRICE_MAP.template_dining_table,
  bed_: TEMPLATE_GROUP_PRICE_MAP.template_bed_frame,
  wr_: TEMPLATE_GROUP_PRICE_MAP.template_wardrobe,
  ct_: TEMPLATE_GROUP_PRICE_MAP.template_coffee_table,
};

const getComponentVolume = (comp = {}) =>
  Math.max(1, Number(comp?.width) || 0) *
  Math.max(1, Number(comp?.height) || 0) *
  Math.max(1, Number(comp?.depth) || 0);

const getWoodFinishMultiplier = (comp = {}) => {
  const finishId = String(comp?.finish || "").trim();

  if (finishId && WOOD_FINISH_PRICE_MAP[finishId]) {
    return Number(WOOD_FINISH_PRICE_MAP[finishId]) || 1;
  }

  const material = String(comp?.material || "").toLowerCase();

  if (material.includes("pine")) return 0.92;
  if (material.includes("oak")) return 1.0;
  if (material.includes("maple")) return 1.08;
  if (material.includes("beech")) return 1.05;
  if (material.includes("walnut")) return 1.22;
  if (material.includes("mahogany")) return 1.18;
  if (material.includes("teak")) return 1.28;
  if (material.includes("ash")) return 1.1;

  return 1;
};

const getRecoveredGroupUnitPrice = (comp = {}) => {
  const explicit = Number(comp?.groupUnitPrice) || 0;
  if (explicit > 0) return explicit;

  const templateType = String(comp?.templateType || "").trim();
  if (templateType && TEMPLATE_GROUP_PRICE_MAP[templateType]) {
    return Number(TEMPLATE_GROUP_PRICE_MAP[templateType]) || 0;
  }

  const type = String(comp?.type || "").toLowerCase();
  const matchedPrefix = Object.keys(PART_PREFIX_GROUP_PRICE_MAP).find(
    (prefix) => type.startsWith(prefix),
  );
  if (matchedPrefix) {
    return Number(PART_PREFIX_GROUP_PRICE_MAP[matchedPrefix]) || 0;
  }

  const label = String(comp?.groupLabel || comp?.label || "").toLowerCase();
  if (label.includes("dining table"))
    return TEMPLATE_GROUP_PRICE_MAP.template_dining_table;
  if (label.includes("bed")) return TEMPLATE_GROUP_PRICE_MAP.template_bed_frame;
  if (label.includes("wardrobe"))
    return TEMPLATE_GROUP_PRICE_MAP.template_wardrobe;
  if (label.includes("coffee table"))
    return TEMPLATE_GROUP_PRICE_MAP.template_coffee_table;

  return 0;
};

const getResolvedComponentPrice = (comp = {}, allComponents = []) => {
  const qty = Number(comp.qty || 1);
  const multiplier = getWoodFinishMultiplier(comp);

  const direct = Number(comp?.unitPrice) || 0;
  if (direct > 0) {
    return Number((qty * direct * multiplier).toFixed(2));
  }

  const groupUnitPrice = getRecoveredGroupUnitPrice(comp);
  if (!comp?.groupId || groupUnitPrice <= 0) return 0;

  const volume = getComponentVolume(comp);
  const groupItems = allComponents.filter((c) => c.groupId === comp.groupId);
  const totalVolume = groupItems.reduce(
    (sum, c) => sum + getComponentVolume(c),
    0,
  );

  if (!volume || !totalVolume) return 0;

  const allocatedBase = groupUnitPrice * (volume / totalVolume);
  return Number((qty * allocatedBase * multiplier).toFixed(2));
};

function formatCurrency(value = 0) {
  return `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getMaterialsSummary(components) {
  const byMaterial = new Map();
  const byComponent = [];
  let totalQty = 0;
  let grandTotal = 0;

  components.forEach((c) => {
    const key = c.material || "Unspecified";
    const resolvedPrice = getResolvedComponentPrice(c, components);
    const qty = Number(c.qty || 1);
    const unitCost = qty > 0 ? resolvedPrice / qty : resolvedPrice;

    if (!byMaterial.has(key)) {
      byMaterial.set(key, {
        material: key,
        qty: 0,
        estimatedCost: 0,
      });
    }

    const entry = byMaterial.get(key);
    entry.qty += qty;
    entry.estimatedCost += resolvedPrice;

    totalQty += qty;
    grandTotal += resolvedPrice;

    byComponent.push({
      partCode: c.partCode || "—",
      label: c.label || "Part",
      material: c.material || "—",
      qty,
      size: formatDims(c.width, c.height, c.depth, "mm"),
      unitCost,
      price: resolvedPrice,
    });
  });

  const materialRows = [...byMaterial.values()].map((row) => ({
    ...row,
    sharePct: grandTotal > 0 ? (row.estimatedCost / grandTotal) * 100 : 0,
  }));

  return {
    materialRows,
    componentRows: byComponent,
    totalQty,
    grandTotal,
  };
}

function buildMaterialsPageHtml({
  selectedComponents,
  selectedLabel,
  selectedDimsText,
  selectedMaterialText,
  blueprintTitle,
  unit,
}) {
  const { materialRows, componentRows, totalQty } =
    getMaterialsSummary(selectedComponents);

  const materialTypes = materialRows.length;

  const resolvedProjectTitle = resolveExportProjectTitle({
    blueprintTitle,
    objectLabel: selectedLabel,
    selectedComponents,
  });

  const materialTable = `
    <table class="bp-table">
      <thead>
        <tr>
          <th>Material</th>
          <th>Qty</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        ${materialRows
          .map(
            (row) => `
          <tr>
            <td>${escapeHtml(row.material)}</td>
            <td>${row.qty}</td>
            <td>${row.sharePct.toFixed(1)}%</td>
          </tr>
        `,
          )
          .join("")}
        <tr class="table-total">
          <td><b>Total</b></td>
          <td><b>${totalQty}</b></td>
          <td><b>100%</b></td>
        </tr>
      </tbody>
    </table>
  `;

  const partTable = `
    <table class="bp-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Part Code</th>
          <th>Description</th>
          <th>Material</th>
          <th>Qty</th>
          <th>Cut Size</th>
        </tr>
      </thead>
      <tbody>
        ${componentRows
          .map(
            (row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.partCode)}</td>
          <td>${escapeHtml(row.label)}</td>
          <td>${escapeHtml(row.material)}</td>
          <td>${row.qty}</td>
          <td>${escapeHtml(row.size)}</td>
        </tr>
      `,
          )
          .join("")}
        <tr class="table-total">
          <td colspan="4"><b>Total</b></td>
          <td><b>${totalQty}</b></td>
          <td></td>
        </tr>
      </tbody>
    </table>
  `;

  return `
    <div class="page">
      <div class="page-inner">
        <div class="sheet-header">
          <div>
            <div class="sheet-title">TECHNICAL BLUEPRINT — MATERIALS / CUT LIST</div>
            <div class="sheet-subtitle">${escapeHtml(selectedLabel || "No Selection")}</div>
          </div>
          <div class="sheet-meta">
            <div><b>Status:</b> ${PROFESSIONAL_DRAWING_STATUS}</div>
            <div><b>Unit:</b> ${escapeHtml(unit.toUpperCase())}</div>
            <div><b>Sheet:</b> ${getExportSheetCode("materials")}</div>
            <div><b>Date:</b> ${escapeHtml(getNowStamp())}</div>
          </div>
        </div>

        <div class="info-grid">
          <div><b>Project:</b> ${escapeHtml(resolvedProjectTitle || "Blueprint Design")}</div>
          <div><b>Object:</b> ${escapeHtml(selectedLabel || "No Selection")}</div>
          <div><b>Dimensions:</b> ${escapeHtml(selectedDimsText || "—")}</div>
          <div><b>Material / Finish:</b> ${escapeHtml(selectedMaterialText || "—")}</div>
        </div>

        <div class="summary-strip">
          <div class="summary-card">
            <span class="summary-label">Parts</span>
            <strong>${selectedComponents.length}</strong>
          </div>
          <div class="summary-card">
            <span class="summary-label">Total Qty</span>
            <strong>${totalQty}</strong>
          </div>
          <div class="summary-card">
            <span class="summary-label">Material Types</span>
            <strong>${materialTypes}</strong>
          </div>
        </div>

        <div class="drawing-note">
          <b>GENERAL DRAWING NOTES</b>
          <span>Verify written dimensions and material specifications before production.</span>
          <span>Do not scale the drawing from screen or print.</span>
        </div>

        <h3 class="section-head">Materials Summary</h3>
        ${materialTable}

        <h3 class="section-head">Parts / Cut List</h3>
        ${partTable}
      </div>
    </div>
  `;
}
function buildSvgPageHtml(svgMarkup) {
  return `
    <div class="page">
      <div class="page-inner svg-page">
        ${svgMarkup}
      </div>
    </div>
  `;
}

function buildBlueprintDocumentHtml(pages) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Blueprint Sheets</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #cbd5e1;
            font-family: Arial, Helvetica, sans-serif;
            color: #0f172a;
          }
          .page {
            width: ${EXPORT_PAGE_W}px;
            min-height: ${EXPORT_PAGE_H}px;
            margin: 18px auto;
            background: #fff;
            box-shadow: 0 6px 28px rgba(0,0,0,.18);
            page-break-after: always;
            break-after: page;
          }
          .page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .page-inner {
            width: 100%;
            min-height: ${EXPORT_PAGE_H}px;
            padding: 0;
          }
          .svg-page {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sheet-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 30px 34px 12px;
            border-bottom: 2px solid #0f172a;
          }
          .sheet-title {
            font-size: 18px;
            font-weight: 700;
            letter-spacing: .5px;
          }
          .sheet-subtitle {
            font-size: 12px;
            color: #475569;
            margin-top: 4px;
          }
          .sheet-meta {
            font-size: 12px;
            line-height: 1.8;
            text-align: right;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px 20px;
            padding: 16px 34px;
            font-size: 12px;
            border-bottom: 1px solid #cbd5e1;
          }
          .summary-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            padding: 16px 34px 4px;
          }
          .summary-card {
            border: 1px solid #cbd5e1;
            padding: 12px 14px;
            background: #f8fafc;
          }
          .summary-label {
            display: block;
            font-size: 11px;
            color: #64748b;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: .6px;
          }
          .drawing-note {
            margin: 16px 34px 4px;
            padding: 10px 12px;
            border: 1px solid #94a3b8;
            border-left: 4px solid #0f172a;
            background: #f8fafc;
            display: grid;
            gap: 4px;
            font-size: 11px;
            line-height: 1.45;
          }
          .drawing-note b {
            font-size: 10px;
            letter-spacing: .8px;
          }
          .section-head {
            margin: 18px 34px 8px;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: .8px;
            color: #334155;
          }
          .bp-table {
            width: calc(100% - 68px);
            margin: 0 34px 18px;
            border-collapse: collapse;
            font-size: 12px;
          }
          .bp-table th,
          .bp-table td {
            border: 1px solid #94a3b8;
            padding: 7px 8px;
            vertical-align: top;
          }
          .bp-table th {
            background: #e2e8f0;
            text-align: left;
          }
          .bp-table .table-total td {
            background: #f8fafc;
          }
          .ww-summary-strip {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            padding: 14px 34px 0;
          }
          .ww-summary-strip > div {
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            padding: 9px 11px;
            display: grid;
            gap: 3px;
          }
          .ww-summary-strip span {
            color: #64748b;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: .5px;
            text-transform: uppercase;
          }
          .ww-summary-strip b {
            font-size: 14px;
          }
          .ww-page-note {
            margin: 12px 34px 10px;
            border: 1px solid #94a3b8;
            border-left: 4px solid #0f172a;
            background: #f8fafc;
            padding: 8px 10px;
            display: grid;
            gap: 3px;
            font-size: 9.5px;
            line-height: 1.35;
          }
          .ww-page-note b {
            font-size: 9px;
            letter-spacing: .7px;
          }
          .ww-cards {
            padding: 0 34px 24px;
            display: grid;
            gap: 10px;
          }
          .ww-compact-part {
            border: 1px solid #94a3b8;
            background: #fff;
            display: grid;
            grid-template-columns: 1.15fr .35fr 1.45fr 1.35fr 1fr 1.65fr auto;
            align-items: center;
            min-height: 48px;
          }
          .ww-compact-part > div {
            min-width: 0;
            padding: 6px 8px;
            border-right: 1px solid #e2e8f0;
            font-size: 8.8px;
            overflow-wrap: anywhere;
          }
          .ww-compact-part > div:last-child {
            border-right: 0;
          }
          .ww-compact-id {
            display: grid;
            gap: 2px;
          }
          .ww-compact-id b {
            font-size: 9px;
            letter-spacing: .45px;
          }
          .ww-compact-id span {
            font-size: 9.2px;
            font-weight: 700;
          }
          .ww-compact-label {
            display: block;
            color: #64748b;
            font-size: 7.5px;
            text-transform: uppercase;
            letter-spacing: .4px;
            margin-bottom: 2px;
          }
          .ww-compact-note {
            color: #64748b;
            font-size: 8px !important;
            line-height: 1.25;
          }
          .ww-part-card {
            border: 1.2px solid #64748b;
            background: #fff;
          }
          .ww-part-head {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: center;
            padding: 8px 10px;
            border-bottom: 1px solid #cbd5e1;
            background: #f8fafc;
          }
          .ww-part-code {
            font-size: 9px;
            color: #64748b;
            font-weight: 700;
            letter-spacing: .6px;
          }
          .ww-part-name {
            font-size: 13px;
            font-weight: 800;
            margin-top: 2px;
          }
          .ww-status {
            min-width: 54px;
            padding: 4px 8px;
            border: 1px solid #475569;
            font-size: 9px;
            font-weight: 800;
            text-align: center;
            letter-spacing: .6px;
          }
          .ww-status.is-ok {
            background: #f8fafc;
          }
          .ww-status.is-check {
            background: #fff7ed;
            border-color: #c2410c;
            color: #9a3412;
          }
          .ww-core-grid {
            display: grid;
            grid-template-columns: .5fr 1.15fr 1.15fr 1fr;
            border-bottom: 1px solid #cbd5e1;
          }
          .ww-core-grid > div {
            padding: 6px 8px;
            border-right: 1px solid #e2e8f0;
            min-width: 0;
          }
          .ww-core-grid > div:nth-child(4) {
            border-right: 0;
          }
          .ww-core-grid .ww-wide {
            grid-column: 1 / -1;
            border-top: 1px solid #e2e8f0;
            border-right: 0;
          }
          .ww-core-grid span {
            display: block;
            color: #64748b;
            font-size: 8px;
            text-transform: uppercase;
            letter-spacing: .5px;
            margin-bottom: 2px;
          }
          .ww-core-grid b {
            font-size: 9.5px;
            overflow-wrap: anywhere;
          }
          .ww-detail-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }
          .ww-section {
            padding: 7px 9px;
            border-right: 1px solid #e2e8f0;
            border-bottom: 1px solid #e2e8f0;
            min-height: 50px;
          }
          .ww-section:nth-child(even) {
            border-right: 0;
          }
          .ww-section-title {
            font-size: 8.5px;
            font-weight: 800;
            letter-spacing: .55px;
            text-transform: uppercase;
            color: #334155;
            margin-bottom: 4px;
          }
          .ww-list {
            margin: 0;
            padding-left: 14px;
            display: grid;
            gap: 2px;
            font-size: 8.8px;
            line-height: 1.25;
          }
          .ww-empty {
            color: #94a3b8;
            font-size: 8.8px;
          }
          .ww-span-2 {
            grid-column: 1 / -1;
          }
          .ww-span-2 .ww-section {
            border-right: 0;
          }
          .ww-check-note {
            padding: 6px 9px;
            background: #fff7ed;
            color: #9a3412;
            border-top: 1px solid #fdba74;
            font-size: 8.8px;
          }
          @page {
            size: ${EXPORT_PAGE_W}px ${EXPORT_PAGE_H}px;
            margin: 0;
          }
          @media print {
            body {
              background: #fff;
            }
            .page {
              margin: 0;
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        ${pages.join("")}
      </body>
    </html>
  `;
}

function buildAllExportPages({
  exportComponents,
  selectedComp,
  selectedLabel,
  selectedMaterialText,
  selectedBounds3D,
  selectedDimsText,
  blueprintTitle,
  unit,
}) {
  const pages = [];

  const resolvedObjectLabel = resolveExportFocusLabel({
    selectedLabel,
    selectedComp,
    selectedComponents: exportComponents,
    blueprintTitle,
  });

  pages.push(
    buildSvgPageHtml(
      build3DViewPageSvg({
        selectedComponents: exportComponents,
        selectedLabel: resolvedObjectLabel,
        selectedMaterialText,
        selectedBounds3D,
        selectedDimsText,
        blueprintTitle,
        unit,
      }),
    ),
  );

  ["front", "back", "left", "right", "top", "exploded"].forEach((view) => {
    pages.push(
      buildSvgPageHtml(
        build2DViewPageSvg({
          selectedComponents: exportComponents,
          selectedComp,
          selectedLabel: resolvedObjectLabel,
          selectedMaterialText,
          selectedBounds3D,
          selectedDimsText,
          blueprintTitle,
          unit,
          view,
        }),
      ),
    );
  });

  pages.push(
    buildMaterialsPageHtml({
      selectedComponents: exportComponents,
      selectedLabel: resolvedObjectLabel,
      selectedDimsText,
      selectedMaterialText,
      blueprintTitle,
      unit,
    }),
  );

  pages.push(
    ...buildWoodworkingDetailsPages({
      selectedComponents: exportComponents,
      selectedLabel: resolvedObjectLabel,
      blueprintTitle,
    }),
  );

  return pages;
}

export {
  svgLine,
  svgRect,
  build2DViewPageSvg,
  buildSvgPaperMarkup,
  buildMaterialsPageHtml,
  buildBlueprintDocumentHtml,
  buildAllExportPages,
};
