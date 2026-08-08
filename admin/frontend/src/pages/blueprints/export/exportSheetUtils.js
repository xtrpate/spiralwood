// export/exportSheetUtils.js
// Shared technical-sheet labels, text formatting, SVG primitives, and callout helpers.
// Export output and furniture-detection rules are unchanged.

import { escapeHtml } from "../data/utils";

const EXPORT_SHEET_CODES = {
  "3d": "A-107",
  front: "A-101",
  back: "A-102",
  left: "A-103",
  right: "A-104",
  top: "A-105",
  exploded: "A-106",
  materials: "A-108",
};

const EXPORT_FURNITURE_FAMILIES = [
  { key: "dining_table", pattern: /dining\s+table|table\s+set|\bdt\b/i },
  { key: "wardrobe", pattern: /wardrobe|closet/i },
  { key: "bed", pattern: /bed|headboard/i },
  { key: "chair", pattern: /chair|stool/i },
  { key: "bench", pattern: /bench/i },
  { key: "sofa", pattern: /sofa|couch/i },
  { key: "cabinet", pattern: /cabinet|casework/i },
  { key: "coffee_table", pattern: /coffee\s+table/i },
];

function getExportSheetCode(view = "") {
  return EXPORT_SHEET_CODES[view] || "A-109";
}

function svgLine(x1, y1, x2, y2, extra = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra} />`;
}

function svgRect(x, y, w, h, extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${extra} />`;
}

function svgText(x, y, text, extra = "") {
  return `<text x="${x}" y="${y}" ${extra}>${escapeHtml(text)}</text>`;
}

function svgPolyline(points, extra = "") {
  const pts = points
    .map((p) => (Array.isArray(p) ? `${p[0]},${p[1]}` : `${p.x},${p.y}`))
    .join(" ");
  return `<polyline points="${pts}" ${extra} />`;
}

function compactText(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value = "", max = 32) {
  const text = compactText(value);
  if (!text) return "—";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function fitFontSize(text, base, softLimit, min = 8) {
  const len = compactText(text).length;
  if (!len || len <= softLimit) return base;
  return Math.max(min, base - Math.ceil((len - softLimit) / 10));
}

function getSheetViewLabel(view, fallbackLabel = "View") {
  switch (view) {
    case "front":
      return "Front View";
    case "back":
      return "Back View";
    case "left":
      return "Left View";
    case "right":
      return "Right View";
    case "top":
      return "Top View";
    case "exploded":
      return "Exploded View";
    default:
      return fallbackLabel || "View";
  }
}

function getPageHeaderTitle(view, fallbackLabel = "View") {
  return `TECHNICAL BLUEPRINT — ${String(
    getSheetViewLabel(view, fallbackLabel),
  ).toUpperCase()}`;
}

function getCommonGroupLabel(components = []) {
  const labels = [
    ...new Set(
      components.map((c) => compactText(c?.groupLabel || "")).filter(Boolean),
    ),
  ];
  return labels.length === 1 ? labels[0] : "";
}

const EXPORT_TITLE_STOP_WORDS = new Set([
  "template",
  "blueprint",
  "design",
  "view",
  "finish",
  "selected",
  "objects",
  "object",
  "project",
  "sheet",
  "wooden",
]);

function tokenizeComparableText(value = "") {
  return compactText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !EXPORT_TITLE_STOP_WORDS.has(token));
}

function hasMeaningfulTokenOverlap(left = "", right = "") {
  const leftTokens = new Set(tokenizeComparableText(left));
  const rightTokens = tokenizeComparableText(right);
  return rightTokens.some((token) => leftTokens.has(token));
}

function detectDiningTableSelection(components = []) {
  if (!Array.isArray(components) || components.length < 6) return false;
  const matches = components.filter((comp) => {
    const partCode = compactText(comp?.partCode);
    const type = compactText(comp?.type);
    const groupLabel = compactText(comp?.groupLabel);
    const templateType = compactText(comp?.templateType);
    const label = compactText(comp?.label);

    return (
      /^DT[-_]/i.test(partCode) ||
      /^dt_/i.test(type) ||
      /dining table/i.test(groupLabel) ||
      /dining table/i.test(templateType) ||
      /top panel|apron|leg/i.test(label)
    );
  }).length;

  return matches >= Math.max(5, Math.floor(components.length * 0.65));
}

function getDiningTablePartRole(comp = {}) {
  const partCode = compactText(comp?.partCode).toLowerCase();
  const label = compactText(comp?.label).toLowerCase();
  const type = compactText(comp?.type).toLowerCase();

  if (
    /top/.test(partCode) ||
    /top panel/.test(label) ||
    /table top/.test(type)
  ) {
    return "top";
  }
  if (/af/.test(partCode) || /front apron/.test(label)) return "frontApron";
  if (/ar2/.test(partCode) || /right apron/.test(label)) return "rightApron";
  if (/\bal\b/.test(partCode) || /left apron/.test(label)) return "leftApron";
  if (
    /\bar\b/.test(partCode) ||
    /rear apron/.test(label) ||
    /back apron/.test(label)
  ) {
    return "rearApron";
  }
  if (/\bfl\b/.test(partCode) || /front leg l/.test(label)) return "frontLegL";
  if (/\bfr\b/.test(partCode) || /front leg r/.test(label)) return "frontLegR";
  if (/\bbl\b/.test(partCode) || /back leg l/.test(label)) return "backLegL";
  if (/\bbr\b/.test(partCode) || /back leg r/.test(label)) return "backLegR";
  return "other";
}

function shouldRenderOrthographicLabel(comp, view, selectedComponents = []) {
  const total = Array.isArray(selectedComponents)
    ? selectedComponents.length
    : 0;

  // Professional sheets:
  // - assembly orthographic pages stay clean
  // - labels live in exploded view / BOM
  // - only allow inline label if single loose part ang ini-export
  if (view === "exploded") return true;

  if (["front", "back", "left", "right", "top"].includes(view)) {
    return total <= 1;
  }

  return true;
}

function detectFurnitureFamily(value = "") {
  const text = compactText(value);
  const match = EXPORT_FURNITURE_FAMILIES.find(({ pattern }) =>
    pattern.test(text),
  );
  return match?.key || "";
}

function resolveExportProjectTitle({
  blueprintTitle,
  objectLabel,
  selectedComponents,
}) {
  const projectText = compactText(blueprintTitle);
  const objectText = compactText(
    objectLabel || getCommonGroupLabel(selectedComponents),
  );

  if (!projectText) return objectText || "Blueprint Design";
  if (!objectText) return projectText;

  const projectFamily = detectFurnitureFamily(projectText);
  const objectFamily =
    detectFurnitureFamily(objectText) ||
    (detectDiningTableSelection(selectedComponents) ? "dining_table" : "");
  const hasOverlap = hasMeaningfulTokenOverlap(projectText, objectText);
  const looksTemplateLike = /\btemplate\b|\bmockup\b|\bdraft\b|\btest\b/i.test(
    projectText,
  );

  if (projectFamily && objectFamily && projectFamily !== objectFamily) {
    return objectText;
  }

  if (!hasOverlap && (looksTemplateLike || objectFamily)) {
    return objectText;
  }

  return projectText;
}

function get3DCalloutPlacement(
  comp,
  selectedComponents = [],
  idx = 0,
  drawingArea,
) {
  if (!detectDiningTableSelection(selectedComponents)) {
    const side = idx % 2 === 0 ? "left" : "right";
    return {
      side,
      lane: Math.min(5, Math.floor(idx / 2)),
    };
  }

  switch (getDiningTablePartRole(comp)) {
    case "top":
      return { side: "top", lane: 0 };
    case "frontApron":
      return { side: "left", lane: 1 };
    case "leftApron":
      return { side: "left", lane: 0 };
    case "rearApron":
      return { side: "right", lane: 1 };
    case "rightApron":
      return { side: "right", lane: 0 };
    case "frontLegL":
      return { side: "left", lane: 2 };
    case "backLegL":
      return { side: "left", lane: 3 };
    case "frontLegR":
      return { side: "right", lane: 2 };
    case "backLegR":
      return { side: "right", lane: 3 };
    default:
      return {
        side: idx % 2 === 0 ? "left" : "right",
        lane: Math.min(5, Math.floor(idx / 2)),
      };
  }
}

function build3DCalloutMarkup({
  labelAnchor,
  labelText,
  placement,
  drawingArea,
}) {
  const side = placement?.side || "right";
  const lane = Number.isFinite(placement?.lane) ? placement.lane : 0;

  const leftTextX = drawingArea.x + 20;
  const rightTextX = drawingArea.x + drawingArea.w - 20;
  const topTextY = drawingArea.y + 18 + lane * 18;
  const leftLaneY = drawingArea.y + 92 + lane * 74;
  const rightLaneY = drawingArea.y + 92 + lane * 74;

  if (side === "top") {
    const elbowY = Math.max(drawingArea.y + 36, labelAnchor.y - 18);
    const topX = drawingArea.x + drawingArea.w * 0.5;
    return `
      ${svgPolyline(
        [
          { x: labelAnchor.x, y: labelAnchor.y },
          { x: labelAnchor.x, y: elbowY },
          { x: topX, y: elbowY },
          { x: topX, y: topTextY + 7 },
        ],
        `fill="none" stroke="#475569" stroke-width="1"`,
      )}
      ${svgText(
        topX,
        topTextY,
        labelText,
        `fill="#0f172a" font-size="10" text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="3"`,
      )}
    `;
  }

  if (side === "left") {
    const elbowX = Math.max(labelAnchor.x - 22, leftTextX + 162);
    return `
      ${svgPolyline(
        [
          { x: labelAnchor.x, y: labelAnchor.y },
          { x: elbowX, y: labelAnchor.y },
          { x: elbowX, y: leftLaneY },
          { x: leftTextX + 8, y: leftLaneY },
        ],
        `fill="none" stroke="#475569" stroke-width="1"`,
      )}
      ${svgText(
        leftTextX,
        leftLaneY + 1,
        labelText,
        `fill="#0f172a" font-size="10" text-anchor="start" dominant-baseline="middle" paint-order="stroke" stroke="#ffffff" stroke-width="3"`,
      )}
    `;
  }

  const elbowX = Math.min(labelAnchor.x + 22, rightTextX - 162);
  return `
    ${svgPolyline(
      [
        { x: labelAnchor.x, y: labelAnchor.y },
        { x: elbowX, y: labelAnchor.y },
        { x: elbowX, y: rightLaneY },
        { x: rightTextX - 8, y: rightLaneY },
      ],
      `fill="none" stroke="#475569" stroke-width="1"`,
    )}
    ${svgText(
      rightTextX,
      rightLaneY + 1,
      labelText,
      `fill="#0f172a" font-size="10" text-anchor="end" dominant-baseline="middle" paint-order="stroke" stroke="#ffffff" stroke-width="3"`,
    )}
  `;
}

function resolveExportFocusLabel({
  selectedLabel,
  selectedComp,
  selectedComponents,
  blueprintTitle,
}) {
  const raw = compactText(selectedLabel);
  const looksLikeCount = /^\d+\s+selected\s+objects?$/i.test(raw);

  if (selectedComp?.groupLabel) return selectedComp.groupLabel;
  if (selectedComp?.label && (selectedComponents?.length || 0) <= 1) {
    return selectedComp.label;
  }

  const commonGroupLabel = getCommonGroupLabel(selectedComponents);
  if (commonGroupLabel) return commonGroupLabel;

  if (raw && !looksLikeCount) return raw;

  return compactText(blueprintTitle) || "Full Blueprint Layout";
}

function formatDimsForTitleBlock(dimsText = "") {
  const cleaned = compactText(dimsText);
  if (!cleaned || cleaned === "—") return "—";

  const parts = cleaned.split("×").map((p) => compactText(p));
  if (parts.length < 3) return cleaned;

  const stripUnit = (value) =>
    compactText(value).replace(/\s*(mm|cm|in|inch|inches)$/i, "");

  return `${stripUnit(parts[0])} × ${stripUnit(parts[1])} × ${stripUnit(parts[2])}`;
}

export {
  getExportSheetCode,
  svgLine,
  svgRect,
  svgText,
  svgPolyline,
  compactText,
  truncateText,
  fitFontSize,
  getSheetViewLabel,
  getPageHeaderTitle,
  getCommonGroupLabel,
  tokenizeComparableText,
  hasMeaningfulTokenOverlap,
  detectDiningTableSelection,
  getDiningTablePartRole,
  shouldRenderOrthographicLabel,
  detectFurnitureFamily,
  resolveExportProjectTitle,
  get3DCalloutPlacement,
  build3DCalloutMarkup,
  resolveExportFocusLabel,
  formatDimsForTitleBlock,
};
