"use strict";

// W4-A1: Pure, server-only inventory wood resolver. A future quote-save card
// may use these validated inventory_material rows to let existing BPI stock
// reservation/consumption services track the wood consumed by production.
// This helper does not read/write the database, save a quote, or count planks.
const WOOD_MATERIALS = Object.freeze({
  mahogany: { inventoryName: "Mahogany Plank", thicknessMm: 50 },
  pine: { inventoryName: "Pine Plank", thicknessMm: 38 },
  acacia: { inventoryName: "Acacia Plank", thicknessMm: 50 },
  narra: { inventoryName: "Narra Plank", thicknessMm: 50 },
  tanguile: { inventoryName: "Tanguile Wood Plank", thicknessMm: 50 },
  gmelina: { inventoryName: "Gmelina Wood Plank", thicknessMm: 50 },
  rubberwood: { inventoryName: "Rubberwood Plank", thicknessMm: 50 },
  teak: { inventoryName: "Teak Plank", thicknessMm: 50 },
  oak: { inventoryName: "Oak Plank", thicknessMm: 50 },
  maple: { inventoryName: "Maple Plank", thicknessMm: 50 },
});

const normalize = (value) => String(value ?? "").trim().toLowerCase();
function money(amount) {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) {
    throw new RangeError("Invalid inventory wood price or subtotal.");
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function resolveInventoryWoodMaterial(woodType, rawMaterials = []) {
  const species = normalize(woodType);
  const expected = WOOD_MATERIALS[species];
  if (!Object.prototype.hasOwnProperty.call(WOOD_MATERIALS, species) || !expected) {
    throw new RangeError("Unsupported requested wood type. Admin review required.");
  }
  if (!Array.isArray(rawMaterials)) {
    throw new TypeError("Server inventory material rows are required.");
  }

  const matches = rawMaterials.filter((row) => normalize(row?.name) === normalize(expected.inventoryName));
  if (matches.length !== 1) {
    throw new RangeError(`Inventory mapping for ${expected.inventoryName} is missing or ambiguous.`);
  }
  const row = matches[0];
  const id = Number(row?.id);
  if (!Number.isSafeInteger(id) || id < 1 || Number(row?.is_active) !== 1) {
    throw new RangeError(`Inventory wood ${expected.inventoryName} is missing a valid active ID.`);
  }
  if (normalize(row?.unit) !== "pcs" || normalize(row?.material_form) !== "piece" ||
      Number(row?.length_mm) !== 2400 || Number(row?.width_mm) !== 100 ||
      Number(row?.thickness_mm) !== expected.thicknessMm) {
    throw new RangeError(`Inventory plank dimensions or units for ${expected.inventoryName} changed; Admin review required.`);
  }
  const unitCost = money(Number(row?.unit_cost));
  if (unitCost <= 0) {
    throw new RangeError(`Inventory wood ${expected.inventoryName} has no valid unit cost.`);
  }
  return Object.freeze({
    wood_type: species,
    raw_material_id: id,
    name: expected.inventoryName,
    unit: "pcs",
    unit_cost: unitCost,
    length_mm: 2400,
    width_mm: 100,
    thickness_mm: expected.thicknessMm,
  });
}

function priceAdminConfirmedInventoryWood({
  items = [], rawMaterials = [], adminConfirmed = false, requestedWoodTypes = null,
} = {}) {
  if (adminConfirmed !== true) {
    throw new RangeError("Admin confirmation of real wood plank quantities is required.");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new RangeError("At least one Admin-confirmed wood requirement is required.");
  }

  const seen = new Set();
  const rows = items.map((item) => {
    const woodType = normalize(item?.wood_type);
    if (seen.has(woodType)) {
      throw new RangeError("Repeated wood species must use one combined Admin quantity.");
    }
    seen.add(woodType);
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) {
      throw new RangeError("Admin wood plank quantity must be a positive whole number.");
    }
    const material = resolveInventoryWoodMaterial(woodType, rawMaterials);
    return Object.freeze({
      ...material,
      quantity,
      material_cost: money(quantity * material.unit_cost),
      // Inventory input rate is intentionally nonbillable. Furniture Parts
      // receive the final 20% materials-price allocation ONCE in Pricing-F2.
      quote_item: Object.freeze({
        source_type: "inventory_material",
        raw_material_id: material.raw_material_id,
        wood_type: woodType,
        name: material.name,
        description: material.name,
        unit: material.unit,
        quantity,
        unit_cost: 0,
        subtotal: 0,
      }),
    });
  });

  if (requestedWoodTypes !== null) {
    if (!Array.isArray(requestedWoodTypes)) {
      throw new TypeError("Requested wood types must be a list.");
    }
    const requested = new Set(requestedWoodTypes.map(normalize).filter(Boolean));
    const missing = [...requested].filter((type) => !seen.has(type));
    const extra = [...seen].filter((type) => !requested.has(type));
    if (missing.length || extra.length) {
      throw new RangeError(`Wood requirements do not match customer choices. Missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}.`);
    }
  }

  return Object.freeze({
    source: "raw_materials.unit_cost",
    material_cost: money(rows.reduce((total, row) => total + row.material_cost, 0)),
    rows: Object.freeze(rows),
    // Stock eligibility requires the live reservation-aware server check.
    stock_verified: false,
    supplier_invoice_verified: false,
  });
}

// W4-A2: migrate editable legacy wood_reference rows into normal Inventory rows.
// Existing Inventory rows with a wood_type marker are revalidated against their
// exact species/material identity. Quotes without wood requests are unchanged.
function normalizeInventoryWoodEstimateRows({ items = [], rawMaterials = [], requestedWoodTypes = [] } = {}) {
  if (!Array.isArray(items) || !Array.isArray(requestedWoodTypes)) {
    throw new TypeError("Validated estimation rows and requested woods are required.");
  }
  const woodRows = items.filter((row) =>
    normalize(row?.source_type) === "wood_reference" ||
    (normalize(row?.source_type) === "inventory_material" && normalize(row?.wood_type)));
  const selectedSpecies = new Set(woodRows.map((row) => normalize(row.wood_type)));
  if (selectedSpecies.size !== woodRows.length) {
    throw new RangeError("One wood species may be entered only once in Required Materials.");
  }
  const requested = new Set(requestedWoodTypes.map(normalize).filter(Boolean));
  if (requested.size) {
    const missing = [...requested].filter((type) => !selectedSpecies.has(type));
    const extra = [...selectedSpecies].filter((type) => !requested.has(type));
    if (missing.length || extra.length) {
      throw new RangeError(`Wood requirements do not match customer choices. Missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}.`);
    }
  }
  const validated = new Map();
  for (const row of woodRows) {
    const material = resolveInventoryWoodMaterial(row.wood_type, rawMaterials);
    const qty = Number(row.quantity);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 100000) {
      throw new RangeError("Admin wood plank quantity must be a positive whole number.");
    }
    if (normalize(row.source_type) === "wood_reference" &&
        (normalize(row.unit) !== "plank" || row.raw_material_id != null)) {
      throw new RangeError("Legacy wood rows must be manually entered plank quantities.");
    }
    if (normalize(row.source_type) === "inventory_material" &&
        Number(row.raw_material_id) !== material.raw_material_id) {
      throw new RangeError("Saved wood species does not match its Inventory material ID.");
    }
    validated.set(normalize(row.wood_type), {
      ...row,
      source_type: "inventory_material",
      raw_material_id: material.raw_material_id,
      name: material.name,
      description: material.name,
      unit: material.unit,
      unit_cost: 0,
      subtotal: 0,
    });
  }
  const converted = items.map((row) => {
    const isWood = normalize(row.source_type) === "wood_reference" ||
      (normalize(row.source_type) === "inventory_material" && normalize(row.wood_type));
    return isWood ? validated.get(normalize(row.wood_type)) : row;
  });
  const ids = converted.filter((row) => normalize(row.source_type) === "inventory_material")
    .map((row) => Number(row.raw_material_id));
  if (new Set(ids).size !== ids.length) {
    throw new RangeError("The same Inventory material cannot be charged twice.");
  }
  return converted;
}

module.exports = {
  normalizeInventoryWoodEstimateRows,
  WOOD_MATERIALS,
  resolveInventoryWoodMaterial,
  priceAdminConfirmedInventoryWood,
};
