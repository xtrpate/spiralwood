// PRICING-F2 browser preview. The server recomputes every input using
// raw_materials.unit_cost; the browser never controls the saved selling price.
const FIXED_MARKUP_RATE = 0.20;
function money(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1e12) throw new RangeError("Invalid amount in pricing calculation.");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
// PRICING-F2: Allocate the DB-backed materials selling amount into existing
// Blueprint Part lines. Previous part rates are allocation WEIGHTS only; they
// never determine the final selling price. The quoted labor includes its 20%
// markup plus, at most, a minor cent-rounding remainder from line quantities.
const BLUEPRINT_PART_TYPES = new Set(["component", "cutlist", "blueprint_part"]);
export function allocateFixedMarkupQuote({ items = [], materialCost, productionLaborCost } = {}) {
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

export function previewFixedMarkupQuote({ items = [], rawMaterials = [], woodReferencePrices = [], requestedWoodTypes = [], laborCost = 0 } = {}) {
  const woodRows = items.filter((row) => String(row?.source_type || "").toLowerCase() === "wood_reference");
  const inventoryWoodRows = items.filter((row) =>
    String(row?.source_type || "").toLowerCase() === "inventory_material" && row.wood_type);
  const selectedWood = new Set([...woodRows, ...inventoryWoodRows]
    .map((row) => String(row.wood_type || "").toLowerCase()));
  if (selectedWood.size !== woodRows.length + inventoryWoodRows.length) {
    return { ready: false, message: "The same wood species is selected more than once." };
  }
  const requested = new Set(requestedWoodTypes.map((type) => String(type || "").toLowerCase()).filter(Boolean));
  if ([...requested].some((wood) => !selectedWood.has(wood)) || [...selectedWood].some((wood) => requested.size && !requested.has(wood))) {
    return { ready: false, message: "Add each customer-requested wood type in Wood Planks with Admin-estimated quantities." };
  }
  const selected = items.filter((row) => String(row?.source_type || "").toLowerCase() === "inventory_material");
  if (!selected.length && !woodRows.length) return { ready: false, message: "Select required production materials before pricing." };
  const serverMaterialData = new Map(rawMaterials.map((row) => [Number(row.id), row]));
  let materialCost = 0;
  const used = new Set();
  try {
    for (const row of selected) {
      const id = Number(row.raw_material_id);
      const quantity = Number(row.quantity);
      const material = serverMaterialData.get(id);
      if (!Number.isSafeInteger(id) || used.has(id) || !Number.isSafeInteger(quantity) || quantity < 1 || !material) {
        return { ready: false, message: "Invalid required material or quantity. Review Materials." };
      }
      used.add(id);
      if (row.wood_type) {
        const reference = woodReferencePrices.find((record) => record.id === String(row.wood_type).toLowerCase());
        if (!reference || Number(reference.raw_material_id) !== id) {
          return { ready: false, message: "Wood inventory selection changed. Refresh and review Required Materials." };
        }
      }
      const dbUnitCost = Number(material.unit_cost);
      if (!Number.isFinite(dbUnitCost) || dbUnitCost <= 0) {
        return { ready: false, message: `Required material ${material.name || '#' + id} has no confirmed unit cost.` };
      }
      materialCost = money(materialCost + money(quantity * dbUnitCost));
    }
    const usedWoodTypes = new Set();
    for (const row of woodRows) {
      const id = String(row.wood_type || "").toLowerCase();
      const reference = woodReferencePrices.find((record) => record.id === id);
      const qty = Number(row.quantity);
      if (!reference || reference.source !== "raw_materials.unit_cost" || !reference.raw_material_id ||
          row.unit !== "plank" || usedWoodTypes.has(id) || !Number.isSafeInteger(qty) || qty < 1 || qty > 100000 ||
          used.has(Number(reference.raw_material_id))) {
        return { ready: false, message: "Review wood type and whole plank quantities in Required Materials." };
      }
      usedWoodTypes.add(id);
      materialCost = money(materialCost + money(Number(reference.cost_per_plank) * qty));
    }
    const productionLaborCost = money(Number(laborCost));
    const allocation = allocateFixedMarkupQuote({ items, materialCost, productionLaborCost });
    return { ready: true, material_cost: materialCost, production_labor_cost: productionLaborCost,
      production_cost: money(materialCost + productionLaborCost), markup_amount: money(money(materialCost + productionLaborCost) * FIXED_MARKUP_RATE),
      ...allocation };
  } catch (err) {
    return { ready: false, message: err.message || "Unable to allocate fixed markup pricing." };
  }
}
