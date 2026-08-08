// data/productionMetadata.js
// Blueprint-only production metadata for materials, grain, and edge treatment.
// This file does NOT perform inventory lookup or stock deduction.

const MATERIAL_SUGGESTIONS = [
  "Marine Plywood",
  "Plywood",
  "Laminated Plywood",
  "Panel Board",
  "MDF",
  "Particle Board",
  "Engineered Wood",
  "Solid Wood",
  "Oak Wood",
  "Pine Wood",
  "Walnut Wood",
  "Mahogany Wood",
  "Teak Wood",
];

const GRAIN_DIRECTION_OPTIONS = [
  { value: "width", label: "Along Width" },
  { value: "height", label: "Along Height" },
  { value: "depth", label: "Along Depth" },
  { value: "none", label: "No Grain / Not Applicable" },
];

const EDGE_TREATMENT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "pvc-0.5mm", label: "PVC 0.5 mm" },
  { value: "pvc-1mm", label: "PVC 1 mm" },
  { value: "pvc-2mm", label: "PVC 2 mm" },
  { value: "wood-lipping", label: "Solid Wood Lipping" },
];

const EDGE_KEYS = [
  { key: "front", label: "Front Edge" },
  { key: "back", label: "Back Edge" },
  { key: "left", label: "Left Edge" },
  { key: "right", label: "Right Edge" },
  { key: "top", label: "Top Edge" },
  { key: "bottom", label: "Bottom Edge" },
];

const VALID_GRAIN_DIRECTIONS = new Set(
  GRAIN_DIRECTION_OPTIONS.map((item) => item.value),
);

const VALID_EDGE_TREATMENTS = new Set(
  EDGE_TREATMENT_OPTIONS.map((item) => item.value),
);

function isWoodProductionMaterial(material = "") {
  return /wood|oak|teak|walnut|mahogany|pine|maple|beech|ash|veneer|plywood|marine|mdf|particle|panel board|engineered/i.test(
    String(material || ""),
  );
}

function inferDefaultGrainDirection(component = {}) {
  if (!isWoodProductionMaterial(component?.material)) {
    return "none";
  }

  const dimensions = [
    ["width", Number(component?.width) || 0],
    ["height", Number(component?.height) || 0],
    ["depth", Number(component?.depth) || 0],
  ].filter(([, value]) => value > 0);

  if (!dimensions.length) return "none";

  dimensions.sort((a, b) => b[1] - a[1]);

  // Default grain follows the longest board dimension. This gives sensible
  // defaults for side panels, shelves, doors, rails, and most rectangular
  // woodworking parts while remaining editable per part.
  return dimensions[0][0];
}

function normalizeGrainDirection(value, component = {}) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (VALID_GRAIN_DIRECTIONS.has(normalized)) {
    return normalized;
  }

  return inferDefaultGrainDirection(component);
}

function normalizeEdgeTreatment(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return VALID_EDGE_TREATMENTS.has(normalized) ? normalized : "none";
}

function normalizeEdgeTreatments(value = {}) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return EDGE_KEYS.reduce((result, edge) => {
    result[edge.key] = normalizeEdgeTreatment(source?.[edge.key]);
    return result;
  }, {});
}

function normalizeProductionMetadata(component = {}) {
  return {
    grainDirection: normalizeGrainDirection(
      component?.grainDirection ??
        component?.grain_direction ??
        component?.grain ??
        "",
      component,
    ),
    edgeTreatments: normalizeEdgeTreatments(
      component?.edgeTreatments ??
        component?.edge_treatments ??
        component?.edgeBanding ??
        component?.edge_banding ??
        {},
    ),
  };
}

export {
  MATERIAL_SUGGESTIONS,
  GRAIN_DIRECTION_OPTIONS,
  EDGE_TREATMENT_OPTIONS,
  EDGE_KEYS,
  isWoodProductionMaterial,
  inferDefaultGrainDirection,
  normalizeGrainDirection,
  normalizeEdgeTreatment,
  normalizeEdgeTreatments,
  normalizeProductionMetadata,
};