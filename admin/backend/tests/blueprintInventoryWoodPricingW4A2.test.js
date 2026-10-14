"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { normalizeInventoryWoodEstimateRows } = require("../utils/blueprintInventoryWoodPricingW4A");
const { computeProductionCostWithManualWood, validateRequestedWoodCoverage } = require("../utils/blueprintWoodCostingW4");
const { allocateFixedMarkupQuote } = require("../utils/blueprintPricingFormula");

const stocks = [
 { id: 150, name: "Gmelina Wood Plank", unit: "pcs", material_form: "piece", length_mm: 2400, width_mm: 100, thickness_mm: 50, unit_cost: 650, quantity: 20, is_active: 1 },
 { id: 149, name: "Tanguile Wood Plank", unit: "pcs", material_form: "piece", length_mm: 2400, width_mm: 100, thickness_mm: 50, unit_cost: 1250, quantity: 18, is_active: 1 },
 { id: 48, name: "Pine Plank", unit: "pcs", material_form: "piece", length_mm: 2400, width_mm: 100, thickness_mm: 38, unit_cost: 650, quantity: 20, is_active: 1 },
 { id: 102, name: "Hinges", unit: "pcs", unit_cost: 50, quantity: 50, is_active: 1 },
];
const parts = [
 { source_type: "blueprint_part", quantity: 1, unit_cost: 2000, name: "Side panel" },
 { source_type: "blueprint_part", quantity: 1, unit_cost: 1000, name: "Top panel" },
];
const input = [
 ...parts,
 { source_type: "wood_reference", wood_type: "gmelina", name: "Gmelina", unit: "plank", quantity: 2, unit_cost: 999999, raw_material_id: null },
 { source_type: "wood_reference", wood_type: "tanguile", name: "Tanguile", unit: "plank", quantity: 3, unit_cost: 1, raw_material_id: null },
 { source_type: "inventory_material", raw_material_id: 102, name: "Hinges", unit: "pcs", quantity: 2, unit_cost: 10000000 },
];
const requested = ["gmelina", "tanguile"];
const map = new Map(stocks.map((r) => [r.id, r]));

function createQuote(items = input, materials = stocks, labor = 2000) {
 const converted = normalizeInventoryWoodEstimateRows({ items, rawMaterials: materials, requestedWoodTypes: requested });
 validateRequestedWoodCoverage({ blueprintComponents: requested.map(requested_wood_type => ({ requested_wood_type })), items: converted });
 const costs = computeProductionCostWithManualWood({ items: converted, materialsById: new Map(materials.map(row => [row.id, row])), laborCost: labor });
 const quote = allocateFixedMarkupQuote({ items: converted, materialCost: costs.material_cost, productionLaborCost: labor });
 return { converted, costs, quote };
}

test("W4-A2: legacy wood inputs become actual inventory links, no duplicate charge", () => {
 const { converted, costs, quote } = createQuote();
 const wood = converted.filter(row => row.wood_type && row.source_type === "inventory_material");
 assert.deepEqual(wood.map(row => [row.raw_material_id, row.unit, row.quantity, row.unit_cost]), [[150, "pcs", 2, 0], [149, "pcs", 3, 0]]);
 assert.equal(costs.material_cost, 5150); // 2*650 + 3*1250 + 2*50
 assert.equal(costs.production_cost, 7150);
 assert.equal(costs.markup_amount, 1430);
 assert.equal(costs.proposed_furniture_selling_price, 8580);
 assert.equal(quote.furniture_selling_total, 8580);
 assert.equal(quote.items.filter(row => row.source_type === "inventory_material").length, 3);
});

test("W4-A2: saved/reloaded Inventory wood keeps its identity and revalidates", () => {
 const { converted } = createQuote();
 const { converted: reopened, costs } = createQuote(converted);
 assert.deepEqual(reopened, converted);
 assert.equal(costs.material_cost, 5150);
});

test("W4-A2: reject duplicates, fake links, incomplete wood, changed stock data", () => {
 const base = { rawMaterials: stocks, requestedWoodTypes: requested };
 assert.throws(() => normalizeInventoryWoodEstimateRows({...base,items:[...input,input[2]]}), /one wood species/i);
 assert.throws(() => normalizeInventoryWoodEstimateRows({...base,items:[...input,{...input[4],raw_material_id:150}]}), /cannot be charged twice/i);
 assert.throws(() => normalizeInventoryWoodEstimateRows({...base,items:[...parts,input[2],input[4]]}), /do not match/i);
 const converted = createQuote().converted;
 assert.throws(() => normalizeInventoryWoodEstimateRows({...base,items:converted.map(row => row.wood_type === "gmelina" ? {...row,raw_material_id:48}:row)}), /does not match its Inventory material ID/i);
 assert.throws(() => normalizeInventoryWoodEstimateRows({...base,items:converted,rawMaterials:stocks.map(row => row.id === 150 ? {...row,unit_cost:0}:row)}), /valid unit cost/i);
 assert.throws(() => normalizeInventoryWoodEstimateRows({...base,items:converted,rawMaterials:stocks.map(row => row.id === 149 ? {...row,thickness_mm:18}:row)}), /dimensions/i);
});

test("W4-A2: frontend Inventory-based preview equals backend totals, no W3 fallback", async () => {
 const { previewFixedMarkupQuote } = await import(pathToFileURL(path.resolve(__dirname, "../../frontend/src/pages/blueprints/blueprintPricingPreview.mjs")));
 const woodReferencePrices = [
  { id: "gmelina", name: "Gmelina", raw_material_id: 150, source: "raw_materials.unit_cost", cost_per_plank: 650 },
  { id: "tanguile", name: "Tanguile", raw_material_id: 149, source: "raw_materials.unit_cost", cost_per_plank: 1250 },
 ];
 const base = { rawMaterials: stocks, woodReferencePrices, requestedWoodTypes: requested, laborCost: 2000 };
 const draft = previewFixedMarkupQuote({ ...base, items: input });
 const saved = previewFixedMarkupQuote({ ...base, items: createQuote().converted });
 assert.equal(draft.ready, true, draft.message);
 assert.equal(saved.ready, true, saved.message);
 assert.equal(saved.material_cost, 5150);
 assert.equal(saved.furniture_selling_total, 8580);
 assert.equal(draft.furniture_selling_total, saved.furniture_selling_total);
 const old = previewFixedMarkupQuote({ ...base, woodReferencePrices: woodReferencePrices.map(({source, ...row}) => row), items: input });
 assert.equal(old.ready, false);
});

test("W4-A2: pickup zero logistics; delivery outside markup with VAT and discount", () => {
 const { quote } = createQuote();
 const tax = v => Math.round((v + Number.EPSILON) * 100) / 100;
 const pickup = tax(quote.furniture_selling_total * 1.12);
 const delivery = tax((quote.furniture_selling_total + 350 + 100) * 1.12);
 assert.equal(pickup, 9609.6);
 assert.equal(delivery, 10113.6);
 const controller = fs.readFileSync(path.resolve(__dirname,"../controllers/admin/blueprintController.estimation.js"),"utf8");
 assert.match(controller, /const overheadCostInput = isPickupOrder \? 0/);
 assert.match(controller, /!isPickupOrder &&/);
 assert.match(controller, /PICKUP_DELIVERY_CHARGE_CONFLICT/);
});

test("W4-A2: Save/Send links Inventory wood and preserves reservation/consumption", () => {
 const root = path.resolve(__dirname,"../");
 const controller = fs.readFileSync(path.join(root,"controllers/admin/blueprintController.estimation.js"),"utf8");
 const reserve = fs.readFileSync(path.join(root,"services/blueprintMaterialReservationService.js"),"utf8");
 const ui = fs.readFileSync(path.resolve(__dirname,"../../frontend/src/pages/blueprints/EstimationPage.jsx"),"utf8");
 assert.match(controller, /normalizeInventoryWoodEstimateRows\(/);
 assert.match(controller, /costingMaterialMap/);
 assert.match(controller, /latestCostSnapshot = computeProductionCostWithManualWood/);
 assert.match(controller, /WOOD_REFERENCE_PRICE_VERSION_CHANGED/);
 assert.match(controller, /PRICING_MATERIAL_COST_CHANGED/);
 assert.match(reserve, /normalize\(item\?\.source_type \|\| item\?\.sourceType\) === "inventory_material"/);
 assert.match(ui, /isInventoryWoodItem/);
 assert.doesNotMatch(ui, /Wood Planks — Admin Quantity Estimate/);
 assert.match(ui, /rows=\{\[\.\.\.woodReferenceItems, \.\.\.otherInventoryItems\]\}/);
});
