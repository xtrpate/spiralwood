"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  computeProductionCostWithManualWood,
  validateRequestedWoodCoverage,
} = require("../utils/blueprintWoodCostingW4");
const { allocateFixedMarkupQuote, computeBlueprintProductionCost } = require("../utils/blueprintPricingFormula");
const { WOOD_REFERENCE_PRICES } = require("../utils/blueprintWoodReferencePrices");
const parts = [
  { source_type: "component", name: "Left Side Panel (Requested Mahogany)", quantity: 1, unit_cost: 1998 },
  { source_type: "component", name: "Cabinet Left Door (Requested Pine)", quantity: 2, unit_cost: 1998 },
];
const wood = [
  { source_type: "wood_reference", wood_type: "mahogany", name: "Mahogany Plank", unit: "plank", quantity: 2, unit_cost: 999999 },
  { source_type: "wood_reference", wood_type: "pine", name: "Pine Plank", unit: "plank", quantity: 1, unit_cost: 999999 },
];
const inventory = { source_type: "inventory_material", raw_material_id: 102, name: "Hinges", quantity: 2, unit_cost: 999999 };
const map = new Map([[102, { id: 102, name: "Hinges", unit_cost: 300 }]]);
const round = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const woodComponents = [{ requested_wood_type: "mahogany" }, { requested_wood_type: "pine" }];
const combined = [...parts, ...wood, inventory];

test("W4: Admin quantities and hardcoded wood rates, plus DB-priced hardware, are charged once", () => {
  const result = computeProductionCostWithManualWood({ items: combined, materialsById: map, laborCost: 26000 });
  // 2 Mahogany = 2,900; 1 Pine = 650; hinges = 600.
  assert.equal(result.wood_reference_cost, 3550);
  assert.equal(result.material_cost, 4150);
  assert.equal(result.production_cost, 30150);
  assert.equal(result.markup_amount, 6030);
  assert.equal(result.proposed_furniture_selling_price, 36180);
  assert.equal(result.material_cost_status, "priced");
  const alloc = allocateFixedMarkupQuote({ items: combined, materialCost: result.material_cost, productionLaborCost: 26000 });
  assert.equal(alloc.furniture_selling_total, 36180);
  assert.equal(round(alloc.furniture_parts_total + alloc.billable_labor_cost), 36180);
  assert.equal(round(alloc.furniture_selling_total + 500), 36680); // No delivery markup
  assert.equal(round(36680 * 1.12), 41081.60);
});

test("W4: No Inventory row is required to calculate Admin-entered reference planks", () => {
  const result = computeProductionCostWithManualWood({ items: [...parts, ...wood], materialsById: new Map(), laborCost: 1000 });
  assert.equal(result.material_cost, 3550);
  assert.equal(result.proposed_furniture_selling_price, 5460);
  assert.equal(result.wood_reference_supplier_prices_verified, false);
  assert.equal(result.requires_admin_wood_stock_and_construction_review, true);
});

test("W4: Browser-supplied wood unit cost is never authoritative", () => {
  const changed = combined.map((row) => ({ ...row, unit_cost: row.source_type === "component" ? row.unit_cost : 1000000 }));
  const quote = computeProductionCostWithManualWood({ items: changed, materialsById: map, laborCost: 26000 });
  assert.equal(quote.material_cost, 4150);
  assert.throws(() => computeProductionCostWithManualWood({ items: [...parts, wood[0], wood[0]], materialsById: new Map() }), /Repeated wood type/);
  assert.throws(() => computeProductionCostWithManualWood({ items: [...parts, { ...wood[0], unit: "sheet" }], materialsById: new Map() }), /planks only/);
  assert.throws(() => computeProductionCostWithManualWood({ items: [...parts, { ...wood[0], quantity: 2.3 }], materialsById: new Map() }), /whole number/);
});

test("W4: Selected species must match all requested species, never auto-estimate quantities", () => {
  assert.deepEqual(validateRequestedWoodCoverage({ blueprintComponents: woodComponents, items: combined }).missing, []);
  assert.throws(() => validateRequestedWoodCoverage({ blueprintComponents: woodComponents, items: [...parts, wood[0]] }), /Missing: pine/);
  assert.throws(() => validateRequestedWoodCoverage({ blueprintComponents: woodComponents, items: [...combined, { ...wood[0], wood_type: "narra" }] }), /extra: narra/);
  assert.deepEqual(validateRequestedWoodCoverage({ blueprintComponents: [], items: parts }).requested, []);
});

test("W4: F1 legacy Inventory-only quote remains mathematically identical", () => {
  const data = [...parts, inventory];
  const old = computeBlueprintProductionCost({ items: data, materialsById: map, laborCost: 500 });
  const current = computeProductionCostWithManualWood({ items: data, materialsById: map, laborCost: 500 });
  assert.deepEqual(current, old);
});

test("W4: Admin preview and server use the same internal wood + material + labor formula", async () => {
  const preview = (await import(pathToFileURL(path.resolve(__dirname, "../../frontend/src/pages/blueprints/blueprintPricingPreview.mjs")))).previewFixedMarkupQuote({
    items: combined,
    woodReferencePrices: WOOD_REFERENCE_PRICES,
    requestedWoodTypes: ["mahogany", "pine"],
    rawMaterials: [{ id: 102, unit_cost: 300, name: "Hinges" }],
    laborCost: 26000,
  });
  const backend = computeProductionCostWithManualWood({ items: combined, materialsById: map, laborCost: 26000 });
  assert.equal(preview.ready, true);
  assert.equal(preview.material_cost, backend.material_cost);
  assert.equal(preview.furniture_selling_total, backend.proposed_furniture_selling_price);
  assert.equal(preview.billable_labor_cost, 31200);
});

test("W4: Admin preview rejects missing species and invalid quantities", async () => {
  const { previewFixedMarkupQuote } = await import(pathToFileURL(path.resolve(__dirname, "../../frontend/src/pages/blueprints/blueprintPricingPreview.mjs")));
  const params = { items: [...parts, wood[0]], woodReferencePrices: WOOD_REFERENCE_PRICES, requestedWoodTypes: ["mahogany", "pine"], laborCost: 2000 };
  assert.equal(previewFixedMarkupQuote(params).ready, false);
  assert.equal(previewFixedMarkupQuote({ ...params, items: [...parts, { ...wood[0], quantity: 0 }], requestedWoodTypes: ["mahogany"] }).ready, false);
  assert.equal(previewFixedMarkupQuote({ ...params, items: [...parts, { ...wood[0], wood_type: "fake" }], requestedWoodTypes: [] }).ready, false);
});

test("W4: Save/Send integrity safeguards preserved, with hardcoded price revalidation", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../controllers/admin/blueprintController.estimation.js"), "utf8");
  const helpers = fs.readFileSync(path.resolve(__dirname, "../controllers/admin/blueprintController.helpers.js"), "utf8");
  const ui = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/pages/blueprints/EstimationPage.jsx"), "utf8");
  assert.match(source, /WOOD_REFERENCE_PRICE_VERSION_CHANGED/);
  assert.match(source, /PRICING_MATERIAL_COST_CHANGED/);
  assert.match(source, /validateRequestedWoodCoverage\(/);
  assert.match(source, /computeProductionCostWithManualWood\(/);
  assert.match(source, /Wood plank is counted twice/);
  assert.match(helpers, /"wood_reference"/);
  assert.match(ui, /section="wood_reference"/);
  assert.match(ui, /Wood Planks — Admin Quantity Estimate/);
  assert.match(ui, /getQuotationInventoryIssues\(inventoryItems, rawMaterials, woodReferenceItems\.length > 0\)/);
});
