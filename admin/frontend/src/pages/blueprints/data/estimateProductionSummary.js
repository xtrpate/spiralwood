// data/estimateProductionSummary.js
// Read-only Blueprint -> Project Estimate production handoff.
// This helper never selects inventory, reserves stock, deducts stock, or prices
// production metadata. It only summarizes the latest saved Blueprint components.

import {
  EDGE_KEYS,
  EDGE_TREATMENT_OPTIONS,
  GRAIN_DIRECTION_OPTIONS,
  normalizeProductionMetadata,
} from "./productionMetadata";
import {
  getHardwareTypeLabel,
  normalizeHardwareRequirements,
} from "./hardwareMetadata";
import { getWoodworkingProfileDescriptor } from "./woodworkingProfile";
import { normalizeWoodworkingOperations } from "./woodworkingOperations";

const GRAIN_LABELS = Object.fromEntries(
  GRAIN_DIRECTION_OPTIONS.map((item) => [
    item.value,
    item.value === "none" ? "No Grain" : item.label,
  ]),
);

const FRIENDLY_OPERATION_LABELS = {
  dado: "Dado",
  rabbet: "Rabbet",
  groove: "Groove",
  recess: "Recess",
  bore: "Bore",
};

const EDGE_LABELS = Object.fromEntries(
  EDGE_TREATMENT_OPTIONS.map((item) => [item.value, item.label]),
);

const cleanText = (value = "") =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const cleanDisplayLabel = (value = "") =>
  cleanText(value).replace(/\s*\/\s*/g, " or ");

const formatMm = (value, decimals = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number(number.toFixed(decimals)).toString();
};

const plural = (count, singular, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

const getFaceLabel = (surface = "") =>
  String(surface || "").toLowerCase() === "face_b" ? "Face B" : "Face A";

const formatCutSize = (component = {}) =>
  `${formatMm(component.width)} × ${formatMm(component.height)} × ${formatMm(
    component.depth,
  )} mm`;

function getEdgeTreatmentLines(component = {}) {
  const production = normalizeProductionMetadata(component);

  return EDGE_KEYS.map((edge) => {
    const treatment = production.edgeTreatments?.[edge.key] || "none";
    if (treatment === "none") return null;
    return `${edge.label}: ${EDGE_LABELS[treatment] || treatment}`;
  }).filter(Boolean);
}

function getHardwareLines(component = {}) {
  return normalizeHardwareRequirements(
    component.hardwareRequirements ??
      component.hardware_requirements ??
      component.hardware ??
      [],
  ).map((item) => {
    const label = cleanDisplayLabel(
      cleanText(item.name) || getHardwareTypeLabel(item.type),
    );
    return `${formatMm(item.quantity)}× ${label}`;
  });
}

function getCutoutLines(descriptor = null) {
  if (!descriptor) return [];

  return (Array.isArray(descriptor.profileCutouts)
    ? descriptor.profileCutouts
    : []
  ).map((cutout) =>
    cutout.type === "rect"
      ? `${formatMm(cutout.width, 1)} × ${formatMm(
          cutout.height,
          1,
        )} mm THRU`
      : `Ø${formatMm(cutout.diameter, 1)} mm THRU`,
  );
}

function getNotchLines(descriptor = null) {
  if (!descriptor) return [];

  return (Array.isArray(descriptor.profileEdgeNotches)
    ? descriptor.profileEdgeNotches
    : []
  ).map(
    (notch) =>
      `Notch ${formatMm(notch.width, 1)}W × ${formatMm(
        notch.depth,
        1,
      )}D mm · Offset ${formatMm(notch.offset, 1)} mm`,
  );
}

function getOperationLines(component = {}) {
  return normalizeWoodworkingOperations(
    component.woodworkingOperations ??
      component.woodworking_operations ??
      [],
  ).map((operation) => {
    const type =
      FRIENDLY_OPERATION_LABELS[operation.type] || "Machining";

    if (operation.type === "bore") {
      return `${type}: Ø${formatMm(
        operation.diameter,
        1,
      )} × ${formatMm(operation.depth, 1)} mm deep · ${getFaceLabel(
        operation.surface,
      )}`;
    }

    const edge =
      operation.type === "rabbet"
        ? ` · ${cleanText(operation.edge).replace(/\b\w/g, (char) =>
            char.toUpperCase(),
          )} edge`
        : "";

    return `${type}: ${formatMm(operation.length, 1)}L × ${formatMm(
      operation.width,
      1,
    )}W × ${formatMm(operation.depth, 1)}D mm${edge} · ${getFaceLabel(
      operation.surface,
    )}`;
  });
}

function getProductionCompleteness(component = {}) {
  const issues = [];

  if (!cleanText(component.partCode)) {
    issues.push("Missing part code");
  }
  if (!cleanText(component.material)) {
    issues.push("Missing material");
  }

  ["width", "height", "depth"].forEach((key) => {
    const value = Number(component[key]);
    if (!Number.isFinite(value) || value <= 0) {
      issues.push(`Invalid ${key}`);
    }
  });

  const quantity = Number(component.qty ?? 1);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    issues.push("Invalid quantity");
  }

  return issues;
}

function buildPartProductionRow(component = {}, index = 0) {
  const production = normalizeProductionMetadata(component);
  const descriptor = getWoodworkingProfileDescriptor(component);
  const edgeLines = getEdgeTreatmentLines(component);
  const hardwareLines = getHardwareLines(component);
  const cutoutLines = getCutoutLines(descriptor);
  const notchLines = getNotchLines(descriptor);
  const operationLines = getOperationLines(component);
  const completenessIssues = getProductionCompleteness(component);

  const hardwareQty = normalizeHardwareRequirements(
    component.hardwareRequirements ??
      component.hardware_requirements ??
      component.hardware ??
      [],
  ).reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);

  const productionTags = [];


  if (edgeLines.length) {
    productionTags.push(plural(edgeLines.length, "treated edge"));
  }
  if (hardwareQty) {
    productionTags.push(plural(hardwareQty, "hardware item"));
  }
  if (cutoutLines.length) {
    productionTags.push(plural(cutoutLines.length, "cutout"));
  }
  if (notchLines.length) {
    productionTags.push(plural(notchLines.length, "edge notch"));
  }
  if (operationLines.length) {
    productionTags.push(plural(operationLines.length, "machining step"));
  }
  if (descriptor) {
    productionTags.push(
      `${cleanText(descriptor.kind || "custom").replace(/\b\w/g, (char) =>
        char.toUpperCase(),
      )} profile`,
    );
  }

  return {
    id:
      component.id ||
      component.partCode ||
      `production-part-${index + 1}`,
    code: cleanText(component.partCode) || `P${index + 1}`,
    name: cleanText(component.label) || "Component",
    quantity: Math.max(1, Number(component.qty) || 1),
    cutSize: formatCutSize(component),
    material: cleanText(component.material) || "Material not set",
    grain:
      GRAIN_LABELS[production.grainDirection] ||
      "No Grain",
    edgeLines,
    hardwareLines,
    cutoutLines,
    notchLines,
    operationLines,
    profileKind: descriptor
      ? cleanText(descriptor.kind || "Custom Profile")
      : "",
    productionTags,
    completenessIssues,
    hasSpecialDetails:
      edgeLines.length > 0 ||
      hardwareLines.length > 0 ||
      cutoutLines.length > 0 ||
      notchLines.length > 0 ||
      operationLines.length > 0 ||
      Boolean(descriptor),
    hardwareQty,
    machiningCount: operationLines.length,
    cutoutCount: cutoutLines.length,
    notchCount: notchLines.length,
    hasProfile: Boolean(descriptor),
  };
}

function buildEstimateProductionSnapshot(design = {}) {
  const components = Array.isArray(design?.components)
    ? design.components.filter(Boolean)
    : [];

  const parts = components.map(buildPartProductionRow);

  const materials = new Set(
    parts
      .map((part) => cleanText(part.material).toLowerCase())
      .filter((material) => material && material !== "material not set"),
  );

  const edgeTreatedParts = parts.filter(
    (part) => part.edgeLines.length > 0,
  ).length;

  const hardwareQty = parts.reduce(
    (sum, part) => sum + part.hardwareQty,
    0,
  );

  const customProfiles = parts.filter(
    (part) => part.hasProfile,
  ).length;

  const machiningOps = parts.reduce(
    (sum, part) => sum + part.machiningCount,
    0,
  );

  const cutouts = parts.reduce(
    (sum, part) => sum + part.cutoutCount,
    0,
  );

  const notches = parts.reduce(
    (sum, part) => sum + part.notchCount,
    0,
  );

  const incompleteParts = parts.filter(
    (part) => part.completenessIssues.length > 0,
  );

  return {
    parts,
    summary: {
      productionParts: parts.length,
      materialTypes: materials.size,
      edgeTreatedParts,
      hardwareQty,
      customProfiles,
      machiningOps,
      cutouts,
      notches,
      handoffStatus:
        parts.length > 0 && incompleteParts.length === 0
          ? "READY"
          : "REVIEW",
      incompletePartCount: incompleteParts.length,
    },
  };
}

export { buildEstimateProductionSnapshot };