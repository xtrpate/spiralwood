"use strict";

// PRICING-F1: internal cost snapshot ONLY. It does not alter invoice/quotation
// totals or turn tracked inventory materials into billable rows.
// Required materials are validated by Admin; supplier unit cost comes from DB.
// Hardware/finishing stock rows belong to materials, not a second surcharge.
const FIXED_MARKUP_RATE = 0.20;

function money(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1e12) {
    throw new RangeError("Invalid amount in pricing calculation.");
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeBlueprintProductionCost({ items = [], materialsById, laborCost = 0 } = {}) {
  if (!Array.isArray(items) || !(materialsById instanceof Map)) {
    throw new TypeError("Validated items and a server material map are required.");
  }

  const labor = Number(laborCost);
  if (!Number.isFinite(labor) || labor < 0) {
    throw new RangeError("Production labor must be a non-negative amount.");
  }

  let materialTotal = 0;
  let materialCount = 0;
  const missingPriceIds = [];
  const usedIds = new Set();

  for (const row of items) {
    if (String(row?.source_type || "").trim().toLowerCase() !== "inventory_material") {
      continue; // Furniture Parts rates are SELLING prices, not production inputs.
    }
    const id = Number(row.raw_material_id);
    const quantity = Number(row.quantity);
    if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id) ||
        !Number.isSafeInteger(quantity) || quantity < 1) {
      throw new RangeError("Invalid validated material identity or quantity.");
    }
    usedIds.add(id);
    materialCount++;

    const dbMaterial = materialsById.get(id);
    if (!dbMaterial) {
      throw new RangeError(`Required inventory material #${id} was not found.`);
    }
    const unitCost = Number(dbMaterial.unit_cost);
    if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 100000000) {
      throw new RangeError(`Invalid server unit cost for inventory material #${id}.`);
    }
    if (unitCost === 0) missingPriceIds.push(id);
    materialTotal = money(materialTotal + money(quantity * unitCost));
  }

  const costAvailable = materialCount > 0 && missingPriceIds.length === 0;
  const productionCost = costAvailable ? money(materialTotal + money(labor)) : null;
  const markup = costAvailable ? money(productionCost * FIXED_MARKUP_RATE) : null;

  return {
    version: "PRICING-F1",
    markup_rate_percent: 20,
    unit_cost_source: "raw_materials.unit_cost",
    required_material_count: materialCount,
    material_cost: materialTotal,
    production_labor_cost: money(labor),
    production_cost: productionCost,
    markup_amount: markup,
    proposed_furniture_selling_price: costAvailable ? money(productionCost + markup) : null,
    material_cost_status: costAvailable ? "priced" : "missing_prices_or_materials",
    unpriced_raw_material_ids: missingPriceIds,
    // Does NOT certify coverage of hardware, adhesives, finishing and shop overhead.
    requires_admin_cost_scope_review: true,
    // F2 must reconcile Admin quotation display, item rows and this formula.
    connected_to_quotation_totals: false,
  };
}

// PRICING-F2: Allocate the DB-backed materials selling amount into existing
// Blueprint Part lines. Previous part rates are allocation WEIGHTS only; they
// never determine the final selling price. The quoted labor includes its 20%
// markup plus, at most, a minor cent-rounding remainder from line quantities.
const BLUEPRINT_PART_TYPES = new Set(["component", "cutlist", "blueprint_part"]);
function allocateFixedMarkupQuote({ items = [], materialCost, productionLaborCost } = {}) {
  const material = money(Number(materialCost));
  const labor = money(Number(productionLaborCost));
  const parts = items.filter((row) => BLUEPRINT_PART_TYPES.has(String(row?.source_type || "").toLowerCase()));
  if (!parts.length) throw new RangeError("Furniture Parts are required to allocate the selling price.");
  const weights = parts.map((row) => {
    const quantity = Number(row.quantity);
    const rate = Number(row.unit_cost);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(rate) || rate <= 0) {
      throw new RangeError("Furniture Part rates and quantities must be positive allocation weights.");
    }
    return quantity * rate;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) throw new RangeError("Invalid part allocation weights.");
  const desiredPartTotal = money(material * (1 + FIXED_MARKUP_RATE));
  const desiredLaborTotal = money(labor * (1 + FIXED_MARKUP_RATE));
  const pricedParts = parts.map((row, index) => {
    const newRate = money((desiredPartTotal * weights[index] / totalWeight) / Number(row.quantity));
    if (newRate <= 0) throw new RangeError("Material selling price is too small to allocate to the furniture parts.");
    return { ...row, unit_cost: newRate, subtotal: money(Number(row.quantity) * newRate) };
  });
  let quotedPartsTotal = money(pricedParts.reduce((sum, part) => sum + Number(part.quantity) * part.unit_cost, 0));
  // Exact-cents allocation is possible on any quantity-one part. Prefer that
  // rather than moving a rounding penny to labor.
  let remainder = Math.round((desiredPartTotal - quotedPartsTotal) * 100) / 100;
  if (Math.abs(remainder) >= 0.01) {
    const eligible = pricedParts
      .filter((part) => Number(part.quantity) === 1 && part.unit_cost + remainder > 0)
      .sort((a, b) => b.unit_cost - a.unit_cost)[0];
    if (eligible) {
      eligible.unit_cost = money(eligible.unit_cost + remainder);
      eligible.subtotal = eligible.unit_cost;
      quotedPartsTotal = money(quotedPartsTotal + remainder);
      remainder = 0;
    }
  }
  const expectedFurnitureTotal = money(money(material + labor) + money(money(material + labor) * FIXED_MARKUP_RATE));
  if (quotedPartsTotal > expectedFurnitureTotal) throw new RangeError("Allocated part prices exceed the furniture selling price.");
  const quotedLaborTotal = money(expectedFurnitureTotal - quotedPartsTotal);
  const allocationRounding = Math.round((quotedLaborTotal - desiredLaborTotal) * 100) / 100;
  if (Math.abs(allocationRounding) > 1) throw new RangeError("Allocation rounding exceeds one peso; manual review required.");
  const actualFurnitureTotal = money(quotedPartsTotal + quotedLaborTotal);
  if (Math.abs(expectedFurnitureTotal - actualFurnitureTotal) > 0.001) {
    throw new RangeError("Allocated component rates do not reconcile to the 20% quoted price.");
  }
  let partIndex = 0;
  const quotedItems = items.map((row) =>
    BLUEPRINT_PART_TYPES.has(String(row?.source_type || "").toLowerCase())
      ? pricedParts[partIndex++]
      : row,
  );
  return {
    items: quotedItems,
    furniture_parts_total: quotedPartsTotal,
    billable_labor_cost: quotedLaborTotal,
    materials_selling_target: desiredPartTotal,
    production_labor_selling_target: desiredLaborTotal,
    price_allocation_rounding: allocationRounding,
    furniture_selling_total: actualFurnitureTotal,
  };
}

module.exports = { FIXED_MARKUP_RATE, computeBlueprintProductionCost, allocateFixedMarkupQuote };
