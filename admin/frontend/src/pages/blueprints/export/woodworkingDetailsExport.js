// export/woodworkingDetailsExport.js
// WISDOM Blueprint Export Woodworking Details V2A
// Read-only production metadata sheet.
// No pricing, inventory reservation/deduction, backend, or estimation mutation.

import { escapeHtml, formatDims, getNowStamp } from "../data/utils";
import {
  EDGE_KEYS,
  EDGE_TREATMENT_OPTIONS,
  GRAIN_DIRECTION_OPTIONS,
  isWoodProductionMaterial,
  normalizeProductionMetadata,
} from "../data/productionMetadata";
import {
  getHardwareTypeLabel,
  normalizeHardwareRequirements,
} from "../data/hardwareMetadata";
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
  getWoodworkingOperationStatus,
  normalizeWoodworkingOperations,
} from "../data/woodworkingOperations";
import {
  getExportSheetCode,
  resolveExportProjectTitle,
} from "./exportSheetUtils";

const GRAIN_LABELS = Object.fromEntries(
  GRAIN_DIRECTION_OPTIONS.map((item) => [item.value, item.label]),
);
const EDGE_LABELS = Object.fromEntries(
  EDGE_TREATMENT_OPTIONS.map((item) => [item.value, item.label]),
);
const PRODUCTION_STATUS = "FOR REVIEW";
const COMPLEX_PART_WEIGHT = 7;

const cleanText = (value = "") =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const formatMm = (value, decimals = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return Number(numeric.toFixed(decimals)).toString();
};

const faceLabel = (surface = "") =>
  String(surface || "").toLowerCase() === "face_b" ? "Face B" : "Face A";

const edgeName = (edge = "") =>
  String(edge || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const operationDirectionLabel = (component = {}, operation = {}) => {
  const dims = getOperationProfileDimensions(component);
  return operation.direction === "v"
    ? `Along ${dims.vAxis}`
    : `Along ${dims.uAxis}`;
};

const getOperationContext = (component = {}, descriptor = null) => {
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
};

const describeCutout = (component = {}, cutout = {}, index = 0) => {
  const status = getProfileCutoutStatus(component, cutout);
  const prefix = status.valid ? "OK" : "CHECK";
  const position = `U ${formatMm(cutout.u, 1)} · V ${formatMm(cutout.v, 1)}`;

  const spec =
    cutout.type === "rect"
      ? `${formatMm(cutout.width, 1)} × ${formatMm(cutout.height, 1)} THRU`
      : `Ø${formatMm(cutout.diameter, 1)} THRU`;

  return {
    valid: status.valid,
    text: `${prefix} · Cutout ${index + 1} — ${spec} · ${position}${
      status.valid ? "" : ` · ${status.message}`
    }`,
  };
};

const describeEdgeNotch = (component = {}, notch = {}, index = 0) => {
  const status = getProfileEdgeNotchStatus(component, notch);
  const prefix = status.valid ? "OK" : "CHECK";
  const edgeIndex = Math.max(0, Number(notch.edgeIndex) || 0);

  return {
    valid: status.valid,
    text:
      `${prefix} · Edge Notch ${index + 1} — P${edgeIndex + 1}→P${
        edgeIndex + 2
      } · ` +
      `${formatMm(notch.width, 1)} W × ${formatMm(notch.depth, 1)} D · ` +
      `Offset ${formatMm(notch.offset, 1)}${
        status.valid ? "" : ` · ${status.message}`
      }`,
  };
};

const describeOperation = (
  component = {},
  operation = {},
  index = 0,
  context = {},
) => {
  const status = getWoodworkingOperationStatus(
    component,
    operation,
    context,
  );
  const prefix = status.valid ? "OK" : "CHECK";
  const label = getOperationLabel(operation.type);
  const face = faceLabel(operation.surface);
  const center = `U ${formatMm(operation.u, 1)} · V ${formatMm(
    operation.v,
    1,
  )}`;

  let spec = "";

  if (operation.type === "bore") {
    spec =
      `Ø${formatMm(operation.diameter, 1)} × ` +
      `${formatMm(operation.depth, 1)} DEEP · ${face} · ${center}`;
  } else if (operation.type === "rabbet") {
    spec =
      `${formatMm(operation.length, 1)} L × ` +
      `${formatMm(operation.width, 1)} W × ` +
      `${formatMm(operation.depth, 1)} D · ` +
      `${edgeName(operation.edge)} Edge · Offset ${formatMm(
        operation.offset,
        1,
      )} · ${face}`;
  } else {
    spec =
      `${formatMm(operation.length, 1)} L × ` +
      `${formatMm(operation.width, 1)} W × ` +
      `${formatMm(operation.depth, 1)} D · ` +
      `${operationDirectionLabel(component, operation)} · ` +
      `${face} · ${center}`;
  }

  const note = cleanText(operation.note);

  return {
    valid: status.valid,
    text:
      `${prefix} · ${label} ${index + 1} — ${spec}` +
      `${note ? ` · Note: ${note}` : ""}` +
      `${status.valid ? "" : ` · ${status.message}`}`,
  };
};

const buildPartProductionDetails = (component = {}) => {
  const descriptor = getWoodworkingProfileDescriptor(component);
  const production = normalizeProductionMetadata(component);
  const hardware = normalizeHardwareRequirements(
    component.hardwareRequirements,
  );
  const operations = normalizeWoodworkingOperations(
    component.woodworkingOperations,
  );
  const operationContext = getOperationContext(component, descriptor);

  const edgeTreatments = EDGE_KEYS.map((edge) => {
    const value = production.edgeTreatments?.[edge.key] || "none";
    if (value === "none") return null;
    return `${edge.label}: ${EDGE_LABELS[value] || edgeName(value)}`;
  }).filter(Boolean);

  const cutouts = (descriptor?.profileCutouts || []).map((cutout, index) =>
    describeCutout(component, cutout, index),
  );
  const notches = (descriptor?.profileEdgeNotches || []).map((notch, index) =>
    describeEdgeNotch(component, notch, index),
  );
  const machining = operations.map((operation, index) =>
    describeOperation(
      component,
      operation,
      index,
      operationContext,
    ),
  );

  const hardwareLines = hardware.map((item) => {
    const normalizedName =
      cleanText(item.name) || getHardwareTypeLabel(item.type);
    const note = cleanText(item.installationNote);
    return `${normalizedName} ×${item.quantity}${note ? ` · ${note}` : ""}`;
  });

  const invalidCount = [...cutouts, ...notches, ...machining].filter(
    (item) => !item.valid,
  ).length;

  const grain =
    GRAIN_LABELS[production.grainDirection] ||
    edgeName(production.grainDirection) ||
    "—";

  const profileText = descriptor
    ? `${descriptor.label} · ${String(descriptor.plane || "").toUpperCase()} profile`
    : "Standard rectangular / library part";

  const detailWeight =
    edgeTreatments.length +
    cutouts.length +
    notches.length +
    machining.length +
    hardwareLines.length;

  const hasSpecialDetails =
    Boolean(descriptor) ||
    edgeTreatments.length > 0 ||
    cutouts.length > 0 ||
    notches.length > 0 ||
    machining.length > 0 ||
    hardwareLines.length > 0;

  const hasProductionIdentity =
    Boolean(cleanText(component.partCode)) ||
    Boolean(
      cleanText(component.label) &&
        [component.width, component.height, component.depth].some(
          (value) => Number(value) > 0,
        ),
    );

  const relevant =
    hasProductionIdentity ||
    hasSpecialDetails ||
    isWoodProductionMaterial(component.material);

  return {
    component,
    relevant,
    compact: !hasSpecialDetails,
    status: invalidCount > 0 ? "CHECK" : "OK",
    invalidCount,
    detailWeight,
    pageWeight: hasSpecialDetails
      ? Math.min(10, 5 + Math.ceil(detailWeight / 2))
      : 1,
    profileText,
    grain,
    edgeTreatments,
    cutouts: cutouts.map((item) => item.text),
    notches: notches.map((item) => item.text),
    machining: machining.map((item) => item.text),
    hardware: hardwareLines,
  };
};

const buildDetailGroups = (details = []) => {
  const groups = [];
  let pending = [];
  let usedWeight = 0;
  const maxPageWeight = 10;

  details.forEach((detail) => {
    const weight = Math.max(
      1,
      Math.min(
        maxPageWeight,
        Number(detail.pageWeight) || (detail.compact ? 1 : COMPLEX_PART_WEIGHT),
      ),
    );

    if (pending.length && usedWeight + weight > maxPageWeight) {
      groups.push(pending);
      pending = [];
      usedWeight = 0;
    }

    pending.push(detail);
    usedWeight += weight;

    if (usedWeight >= maxPageWeight) {
      groups.push(pending);
      pending = [];
      usedWeight = 0;
    }
  });

  if (pending.length) groups.push(pending);
  return groups;
};

const renderList = (title, rows = [], emptyText = "None assigned") => `
  <div class="ww-section">
    <div class="ww-section-title">${escapeHtml(title)}</div>
    ${
      rows.length
        ? `<ul class="ww-list">${rows
            .map((row) => `<li>${escapeHtml(row)}</li>`)
            .join("")}</ul>`
        : `<div class="ww-empty">${escapeHtml(emptyText)}</div>`
    }
  </div>
`;

const renderPartCard = (detail = {}) => {
  const component = detail.component || {};
  const partCode = cleanText(component.partCode) || "—";
  const label = cleanText(component.label) || "Part";
  const material = cleanText(component.material) || "Unspecified";
  const qty = Math.max(1, Number(component.qty) || 1);
  const size = formatDims(
    component.width || 0,
    component.height || 0,
    component.depth || 0,
    "mm",
  );

  if (detail.compact) {
    return `
      <section class="ww-compact-part">
        <div class="ww-compact-id">
          <b>${escapeHtml(partCode)}</b>
          <span>${escapeHtml(label)}</span>
        </div>
        <div>
          <span class="ww-compact-label">Qty</span>
          <b>${qty}</b>
        </div>
        <div>
          <span class="ww-compact-label">Cut Size</span>
          <b>${escapeHtml(size)}</b>
        </div>
        <div>
          <span class="ww-compact-label">Material</span>
          <b>${escapeHtml(material)}</b>
        </div>
        <div>
          <span class="ww-compact-label">Grain</span>
          <b>${escapeHtml(detail.grain)}</b>
        </div>
        <div class="ww-compact-note">No special machining / hardware / edge treatment</div>
        <div class="ww-status is-ok">OK</div>
      </section>
    `;
  }

  const sections = [
    detail.edgeTreatments.length
      ? renderList("Edge Treatment", detail.edgeTreatments)
      : "",
    detail.hardware.length
      ? renderList("Hardware", detail.hardware)
      : "",
    detail.cutouts.length
      ? renderList("Holes / Cutouts", detail.cutouts)
      : "",
    detail.notches.length
      ? renderList("Edge Notches", detail.notches)
      : "",
  ].filter(Boolean);

  return `
    <section class="ww-part-card">
      <div class="ww-part-head">
        <div>
          <div class="ww-part-code">${escapeHtml(partCode)}</div>
          <div class="ww-part-name">${escapeHtml(label)}</div>
        </div>
        <div class="ww-status ${detail.status === "CHECK" ? "is-check" : "is-ok"}">
          ${escapeHtml(detail.status)}
        </div>
      </div>

      <div class="ww-core-grid">
        <div><span>Qty</span><b>${qty}</b></div>
        <div><span>Cut Size</span><b>${escapeHtml(size)}</b></div>
        <div><span>Material</span><b>${escapeHtml(material)}</b></div>
        <div><span>Grain</span><b>${escapeHtml(detail.grain)}</b></div>
        <div class="ww-wide"><span>Profile</span><b>${escapeHtml(detail.profileText)}</b></div>
      </div>

      ${
        sections.length || detail.machining.length
          ? `
            <div class="ww-detail-grid">
              ${sections.join("")}
              ${
                detail.machining.length
                  ? `<div class="ww-span-2">${renderList(
                      "Woodworking Operations",
                      detail.machining,
                    )}</div>`
                  : ""
              }
            </div>
          `
          : ""
      }

      ${
        detail.invalidCount > 0
          ? `<div class="ww-check-note"><b>CHECK BEFORE PRODUCTION:</b> ${detail.invalidCount} invalid woodworking item(s) detected in this part.</div>`
          : ""
      }
    </section>
  `;
};

function buildWoodworkingDetailsPages({
  selectedComponents = [],
  selectedLabel = "",
  blueprintTitle = "",
}) {
  const details = selectedComponents
    .map(buildPartProductionDetails)
    .filter((item) => item.relevant);

  if (!details.length) return [];

  const groups = buildDetailGroups(details);
  const resolvedProjectTitle = resolveExportProjectTitle({
    blueprintTitle,
    objectLabel: selectedLabel,
    selectedComponents,
  });

  const customProfileCount = details.filter(
    (item) => Boolean(getWoodworkingProfileDescriptor(item.component)),
  ).length;
  const operationCount = details.reduce(
    (sum, item) => sum + item.machining.length,
    0,
  );
  const hardwareQty = details.reduce(
    (sum, item) =>
      sum +
      normalizeHardwareRequirements(
        item.component?.hardwareRequirements,
      ).reduce(
        (subtotal, hardware) =>
          subtotal + Math.max(1, Number(hardware.quantity) || 1),
        0,
      ),
    0,
  );
  const checkCount = details.reduce(
    (sum, item) => sum + item.invalidCount,
    0,
  );

  return groups.map((group, pageIndex) => `
    <div class="page">
      <div class="page-inner">
        <div class="sheet-header">
          <div>
            <div class="sheet-title">TECHNICAL BLUEPRINT — WOODWORKING DETAILS</div>
            <div class="sheet-subtitle">${escapeHtml(
              selectedLabel || "Production Parts",
            )}</div>
          </div>
          <div class="sheet-meta">
            <div><b>Status:</b> ${checkCount > 0 ? "CHECK" : PRODUCTION_STATUS}</div>
            <div><b>Production Unit:</b> MM</div>
            <div><b>Sheet:</b> ${getExportSheetCode("woodworking")}.${pageIndex + 1}</div>
            <div><b>Page:</b> ${pageIndex + 1} / ${groups.length}</div>
            <div><b>Date:</b> ${escapeHtml(getNowStamp())}</div>
          </div>
        </div>

        <div class="info-grid">
          <div><b>Project:</b> ${escapeHtml(resolvedProjectTitle || "Blueprint Design")}</div>
          <div><b>Object:</b> ${escapeHtml(selectedLabel || "Production Parts")}</div>
          <div><b>Source:</b> Saved Blueprint component metadata</div>
          <div><b>Review Rule:</b> Written dimensions control; do not scale drawing</div>
        </div>

        <div class="ww-summary-strip">
          <div><span>Production Parts</span><b>${details.length}</b></div>
          <div><span>Custom Profiles</span><b>${customProfileCount}</b></div>
          <div><span>Machining Ops</span><b>${operationCount}</b></div>
          <div><span>Hardware Qty</span><b>${hardwareQty}</b></div>
        </div>

        <div class="ww-page-note">
          <b>PRODUCTION REFERENCE</b>
          <span>OK = valid against current Blueprint geometry rules. CHECK = correct the source Blueprint before production.</span>
          <span>Blueprint export is read-only. Inventory selection and deduction remain controlled in Project Estimate / Create Estimation.</span>
        </div>

        <div class="ww-cards">
          ${group.map(renderPartCard).join("")}
        </div>
      </div>
    </div>
  `);
}

export { buildWoodworkingDetailsPages };