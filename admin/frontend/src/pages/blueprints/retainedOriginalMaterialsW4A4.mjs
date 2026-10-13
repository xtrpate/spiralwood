// WISDOM W4-A4: canonical retained Marine Plywood requirements.
// Both Admin UI and server use this pure detector. Never infer sheet counts.
// Other/unresolved structural materials are intentionally NOT auto-substituted.
const norm = (value) => String(value ?? "").trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");

const CANONICAL_MARINE_SHEETS = Object.freeze({
  6: "Marine Plywood 6mm - 4x8 ft",
  9: "Marine Plywood 9mm - 4x8 ft",
  12: "Marine Plywood 12mm - 4x8 ft",
  15: "Marine Plywood 15mm - 4x8 ft",
  18: "Marine Plywood 18mm - 4x8 ft",
});

function thicknessOf(part) {
  const explicit = Number(part?.thickness_mm ?? part?.thicknessMm);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const dimensions = [part?.width, part?.height, part?.depth].map(Number);
  return dimensions.length === 3 && dimensions.every((value) => Number.isFinite(value) && value > 0)
    ? Math.min(...dimensions)
    : null;
}

export function getRetainedOriginalMaterialSpecs(design = {}) {
  const parts = Array.isArray(design?.components) ? design.components : [];
  const retained = new Map();
  for (const part of parts) {
    if (norm(part?.requested_wood_type)) continue; // customer replacement is NOT original plywood
    const material = norm(part?.material);
    if (!/^marine plywood(?: \d+(?:\.\d+)?\s*mm)?$/.test(material)) continue;
    const thickness = thicknessOf(part);
    const stockName = CANONICAL_MARINE_SHEETS[thickness] || null;
    const key = `retained-original:marine-plywood:${thickness ?? "unknown"}:4x8`;
    if (!retained.has(key)) {
      retained.set(key, {
        key,
        material_type: "marine_plywood",
        thickness_mm: thickness,
        stock_name: stockName,
        label: stockName || `Marine Plywood (${thickness ?? "unknown"}mm) — review stock specification`,
      });
    }
  }
  return [...retained.values()];
}

export function matchRetainedOriginalMaterial(spec, rawMaterials = []) {
  if (!spec?.stock_name || !Array.isArray(rawMaterials)) return null;
  const matches = rawMaterials.filter((row) =>
    norm(row?.name) === norm(spec.stock_name) &&
    norm(row?.unit) === "sheet" &&
    norm(row?.material_form) === "sheet" &&
    Math.abs(Number(row?.length_mm) - 2438) <= 2 &&
    Math.abs(Number(row?.width_mm) - 1219) <= 2 &&
    Number(row?.thickness_mm) === spec.thickness_mm &&
    Number(row?.is_active) === 1 &&
    Number.isFinite(Number(row?.unit_cost)) && Number(row.unit_cost) > 0
  );
  return matches.length === 1 ? matches[0] : null;
}

export function ensureRetainedOriginalMaterialRows(items = [], design = {}, rawMaterials = [], { locked = false } = {}) {
  if (!Array.isArray(items) || locked) return items;
  const specs = getRetainedOriginalMaterialSpecs(design);
  if (!specs.length) return items;
  const additions = [];
  for (const spec of specs) {
    const material = matchRetainedOriginalMaterial(spec, rawMaterials);
    const alreadyPresent = items.some((row) =>
      norm(row?.source_type) === "inventory material" &&
      (norm(row?.source_key) === norm(spec.key) ||
        (material && Number(row?.raw_material_id) === Number(material.id)))
    );
    if (alreadyPresent) continue;
    additions.push({
      id: null,
      component_id: null,
      raw_material_id: material ? Number(material.id) : null,
      wood_type: "",
      name: spec.label,
      quantity: "", // deliberately blank until Admin confirms full-order sheet count
      unit: "sheet",
      unit_cost: 0, // DB is the ONLY authority on cost
      note: "Retained original panel material; verify dimensions and cutting plan.",
      source_type: "inventory_material",
      source_key: spec.key,
      _row_key: spec.key,
    });
  }
  return additions.length ? [...items, ...additions] : items;
}

// Invoked on Save and again on Send against the persisted authoritative Blueprint.
// It does not automatically allocate or reserve stock, and cannot certify fabrication.
export function validateRetainedOriginalMaterialCoverage({ design = {}, items = [], rawMaterials = [] } = {}) {
  for (const spec of getRetainedOriginalMaterialSpecs(design)) {
    const material = matchRetainedOriginalMaterial(spec, rawMaterials);
    if (!material) {
      throw new Error(`${spec.label}: no single active matching 4x8 Inventory sheet. Admin must review the stock specification.`);
    }
    const linked = items.filter((row) =>
      norm(row?.source_type) === "inventory material" &&
      Number(row?.raw_material_id) === Number(material.id)
    );
    if (linked.length !== 1) {
      throw new Error(`${spec.label}: add exactly one Required Materials row for the retained original material.`);
    }
    const qty = Number(linked[0]?.quantity);
    if (!Number.isSafeInteger(qty) || qty < 1) {
      throw new Error(`${spec.label}: Admin must enter a whole-number sheet quantity for the entire order.`);
    }
  }
  return true;
}
