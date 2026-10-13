"use strict";

// W4: Admin-selected wood rows use backend-only W3 reference rates.
// Inventory material rows keep their existing DB-derived cost. Both are charged ONCE
// through the F2 furniture-part allocation; neither is added as a second invoice row.
const { computeBlueprintProductionCost } = require("./blueprintPricingFormula");
const {
  calculateAdminConfirmedWoodReferenceCost,
  WOOD_REFERENCE_PRICE_VERSION,
  findWoodReference,
} = require("./blueprintWoodReferencePrices");

const isWoodRow = (row) => String(row?.source_type || "").toLowerCase() === "wood_reference";
const money = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

function validateRequestedWoodCoverage({ blueprintComponents = [], items = [] } = {}) {
  const requested = new Set((Array.isArray(blueprintComponents) ? blueprintComponents : [])
    .map((part) => String(part?.requested_wood_type || "").trim().toLowerCase())
    .filter(Boolean));
  for (const id of requested) {
    if (!findWoodReference(id)) throw new RangeError(`Unsupported requested wood ${id}; Admin review required.`);
  }
  if (!requested.size) return { requested: [], missing: [], extra: [] }; // Legacy designs use F2 unchanged.
  const selected = new Set((Array.isArray(items) ? items : [])
    .filter((row) => isWoodRow(row) ||
      (String(row?.source_type || "").toLowerCase() === "inventory_material" && row.wood_type))
    .map((row) => String(row.wood_type || "").trim().toLowerCase()));
  const missing = [...requested].filter((id) => !selected.has(id));
  const extra = [...selected].filter((id) => !requested.has(id));
  if (missing.length || extra.length) {
    throw new RangeError(`Wood materials must match the customer requested wood types. Missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}.`);
  }
  return { requested: [...requested], missing, extra };
}

function computeProductionCostWithManualWood({ items = [], materialsById = new Map(), laborCost = 0 } = {}) {
  const inventoryBasis = computeBlueprintProductionCost({ items, materialsById, laborCost });
  const woodRows = items.filter(isWoodRow);
  if (!woodRows.length) return inventoryBasis; // exact F1/F2 legacy parity
  const wood = calculateAdminConfirmedWoodReferenceCost({
    adminConfirmed: true, // Admin manually selected wood + typed physical plank quantities
    materials: woodRows.map((row) => ({
      wood_type: row.wood_type,
      unit: row.unit,
      quantity: Number(row.quantity),
    })),
  });
  const woodCost = wood.material_reference_cost;
  const materialCost = money(inventoryBasis.material_cost + woodCost);
  const priced = inventoryBasis.unpriced_raw_material_ids.length === 0 && materialCost > 0;
  const productionCost = priced ? money(materialCost + inventoryBasis.production_labor_cost) : null;
  const markup = priced ? money(productionCost * 0.20) : null;
  return {
    ...inventoryBasis,
    version: "PRICING-F1",
    wood_reference_version: WOOD_REFERENCE_PRICE_VERSION,
    wood_reference_cost: woodCost,
    wood_reference_lines: wood.lines,
    wood_reference_supplier_prices_verified: false,
    unit_cost_source: "backend_wood_reference_plus_raw_materials.unit_cost",
    required_material_count: inventoryBasis.required_material_count + woodRows.length,
    material_cost: materialCost,
    production_cost: productionCost,
    markup_amount: markup,
    proposed_furniture_selling_price: priced ? money(productionCost + markup) : null,
    material_cost_status: priced ? "priced" : "missing_prices_or_materials",
    // Separate warning: wood reference rows are NOT inventory reservations / proof of stock.
    requires_admin_wood_stock_and_construction_review: true,
  };
}

module.exports = { isWoodRow, validateRequestedWoodCoverage, computeProductionCostWithManualWood };
