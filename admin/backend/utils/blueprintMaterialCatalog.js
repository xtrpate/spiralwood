// Phase A: read-only approved material catalog for blueprint component selection.
// This list limits the customer/editor choices, NOT the raw materials inventory.
// Match full saved specifications; never infer an ID from a partial material name.
const PANEL_SIZE = { length_mm: 2438, width_mm: 1219 };
const SHEETS = [
  ["versaboard-pvc-18", "Particleboard PVC Versaboard 2F 18mm - 4x8 ft"],
  ["ordinary-plywood-18", "Ordinary Plywood 18mm - 4x8 ft"],
  ["marine-plywood-18", "Marine Plywood 18mm - 4x8 ft"],
  ["mdf-board-18", "MDF Board 18mm - 4x8 ft"],
  ["particle-board-18", "Particle Board 18mm - 4x8 ft"],
  ["melamine-particle-18", "Melamine Particle Board 18mm - 4x8 ft"],
  ["laminated-marine-18", "Laminated Marine Plywood 18mm - 4x8 ft"],
  ["white-laminated-18", "White Laminated Plywood 18mm - 4x8 ft"],
  ["oak-laminated-18", "Oak Woodgrain Laminated Plywood 18mm - 4x8 ft"],
  ["moisture-mdf-18", "Moisture-Resistant MDF 18mm - 4x8 ft"],
  ["moisture-particle-18", "Moisture-Resistant Particle Board 18mm - 4x8 ft"],
  ["blockboard-18", "Blockboard 18mm - 4x8 ft"],
].map(([key, name]) => ({
  key, name, material_form: "sheet", unit: "sheet", ...PANEL_SIZE, thickness_mm: 18,
}));
const PLANKS = [
  ["mahogany-plank", "Mahogany Plank", 50],
  ["pine-plank", "Pine Plank", 38],
  ["acacia-plank", "Acacia Plank", 50],
].map(([key, name, thickness_mm]) => ({
  key, name, material_form: "piece", unit: "pcs",
  length_mm: 2400, width_mm: 100, thickness_mm,
}));
const APPROVED_BLUEPRINT_MATERIALS = Object.freeze([...SHEETS, ...PLANKS]);
const normalizedName = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
const matchingMaterial = (candidate, row) =>
  normalizedName(row.name) === normalizedName(candidate.name) &&
  normalizedName(row.unit) === candidate.unit &&
  normalizedName(row.material_form) === candidate.material_form &&
  ["length_mm", "width_mm", "thickness_mm"].every(
    (field) => Math.abs(Number(row[field]) - candidate[field]) < 0.01,
  );
function buildBlueprintMaterialCatalog(rawMaterials = []) {
  const active = (Array.isArray(rawMaterials) ? rawMaterials : []).filter(
    (row) => Number(row.is_active) === 1,
  );
  return APPROVED_BLUEPRINT_MATERIALS.map((entry) => {
    const matches = active.filter((row) => matchingMaterial(entry, row));
    const match = matches.length === 1 ? matches[0] : null;
    const id = Number(match?.id);
    return {
      key: entry.key,
      label: entry.name,
      raw_material_id: Number.isSafeInteger(id) && id > 0 ? id : null,
      unit: entry.unit,
      material_form: entry.material_form,
      length_mm: entry.length_mm,
      width_mm: entry.width_mm,
      thickness_mm: entry.thickness_mm,
      status: matches.length > 1 ? "ambiguous" : match ? "available" : "missing",
    };
  });
}
module.exports = { APPROVED_BLUEPRINT_MATERIALS, buildBlueprintMaterialCatalog };
