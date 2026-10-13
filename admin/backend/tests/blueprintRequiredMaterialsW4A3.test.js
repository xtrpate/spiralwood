"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const helper = path.resolve(__dirname, "../../frontend/src/pages/blueprints/requestedWoodMaterialsW4A3.mjs");
const ui = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/pages/blueprints/EstimationPage.jsx"), "utf8");
const catalog = [
  { id: "mahogany", name: "Mahogany Plank", raw_material_id: 46, source: "raw_materials.unit_cost" },
  { id: "pine", name: "Pine Plank", raw_material_id: 48, source: "raw_materials.unit_cost" },
];
const design = { components: [
  { requested_wood_type: "Mahogany" },
  { requested_wood_type: "Pine" },
  { requested_wood_type: "Mahogany" },
  { requested_wood_type: "" },
] };

test("W4-A3: requested wood appears once, quantity empty until Admin enters it", async () => {
 const { ensureRequestedWoodRows, getRequestedWoodTypesFromDesign } = await import(pathToFileURL(helper));
 assert.deepEqual(getRequestedWoodTypesFromDesign(design), ["mahogany", "pine"]);
 const existing = [{ source_type: "blueprint_part", name: "Side", quantity: 2 }];
 const rows = ensureRequestedWoodRows(existing, design, {woodCatalog:catalog});
 assert.equal(rows.length, 3);
 assert.deepEqual(rows.slice(1).map(row => [row.wood_type,row.quantity,row.raw_material_id,row.source_type,row.unit]), [
  ["mahogany", "", null, "wood_reference" , "plank"],
  ["pine", "", null, "wood_reference", "plank"],
 ]);
 assert.deepEqual(existing, [{ source_type: "blueprint_part", name: "Side", quantity: 2 }]);
 assert.strictEqual(ensureRequestedWoodRows(rows, design, {woodCatalog:catalog}), rows);
});

test("W4-A3: saved Inventory wood and locked historical quotes are never duplicated", async () => {
 const { ensureRequestedWoodRows } = await import(pathToFileURL(helper));
 const saved = [{ source_type: "inventory_material", wood_type: "mahogany", quantity: 4, raw_material_id: 46 }];
 const rows = ensureRequestedWoodRows(saved, design, {woodCatalog:catalog});
 assert.equal(rows.length, 2);
 assert.equal(rows[0].quantity, 4);
 assert.deepEqual(rows.slice(1).map(r => r.wood_type), ["pine"]);
 assert.strictEqual(ensureRequestedWoodRows(saved,design,{locked:true,woodCatalog:catalog}), saved);
});

test("W4-A3: only authoritative Inventory catalog links qualify for stock view", async () => {
 const {resolveWoodInventoryId} = await import(pathToFileURL(helper));
 assert.equal(resolveWoodInventoryId("mahogany",catalog),46);
 assert.equal(resolveWoodInventoryId("pine",catalog),48);
 assert.equal(resolveWoodInventoryId("pine",[{id:"pine", raw_material_id:48, source:"sample_catalog"}]),null);
 assert.equal(resolveWoodInventoryId("pine",[catalog[1],catalog[1]]),null);
 assert.equal(resolveWoodInventoryId("mahogany",[]),null);
});

test("W4-A3: one Required Materials panel, not separate Wood Planks; preserves Admin quantity, 20% and fulfillment", () => {
 assert.doesNotMatch(ui,/Wood Planks — Admin Quantity Estimate/);
 assert.doesNotMatch(ui, /title="Wood Planks"/);
 assert.match(ui, /title="Required Materials"/);
 assert.match(ui, /rows=\{\[\.\.\.woodReferenceItems, \.\.\.otherInventoryItems\]\}/);
 assert.match(ui, /ensureRequestedWoodRows\(/);
 assert.match(ui, /Customer-requested wood · Admin confirms quantity/);
 assert.match(ui, /!isRequiredWood/);
 assert.match(ui, /getQuotationInventoryIssues\(inventoryRequirementsForPreview, rawMaterials\)/);
 assert.match(ui, /const isPickup = isTransactionMode/);
 assert.match(ui, /const isDelivery = isTransactionMode/);
 assert.match(ui, /pricingPreview\.furniture_selling_total|pricingPreview\.ready/);
});
