"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  WOOD_MATERIALS,
  resolveInventoryWoodMaterial,
  priceAdminConfirmedInventoryWood,
} = require("../utils/blueprintInventoryWoodPricingW4A");

// Verified Aiven query, 2026-10-13: standard inventory plank species.
const actual = Object.freeze([
  [49, "Acacia Plank", 1250, 9, 50],
  [150, "Gmelina Wood Plank", 650, 20, 50],
  [46, "Mahogany Plank", 1450, 16, 50],
  [52, "Maple Plank", 2350, 16, 50],
  [47, "Narra Plank", 3500, 18, 50],
  [50, "Oak Plank", 2650, 12, 50],
  [48, "Pine Plank", 650, 20, 38],
  [57, "Rubberwood Plank", 850, 14, 50],
  [149, "Tanguile Wood Plank", 1250, 18, 50],
  [53, "Teak Plank", 3100, 18, 50],
].map(([id, name, unit_cost, quantity, thickness_mm]) => ({
  id, name, unit: "pcs", material_form: "piece", length_mm: 2400,
  width_mm: 100, thickness_mm, unit_cost, quantity, is_active: 1,
})));

test("W4-A1: exactly the 10 customer wood types match active inventory rows", () => {
  assert.equal(Object.keys(WOOD_MATERIALS).length, 10);
  for (const type of Object.keys(WOOD_MATERIALS)) {
    const item = resolveInventoryWoodMaterial(type, actual);
    assert.equal(item.name.toLowerCase(), WOOD_MATERIALS[type].inventoryName.toLowerCase());
    assert.equal(item.unit, "pcs");
    assert.equal(item.thickness_mm, type === "pine" ? 38 : 50);
  }
});

test("W4-A1: Gmelina and Tanguile use inventory rates, not stale W3 rates", () => {
  const r = priceAdminConfirmedInventoryWood({
    items: [{wood_type: "gmelina", quantity: 2, unit_cost: 1},
            {wood_type: "tanguile", quantity: 3, unit_cost: 999999}],
    rawMaterials: actual,
    adminConfirmed: true,
    requestedWoodTypes: ["Tanguile", "GMELINA"],
  });
  assert.equal(r.material_cost, 5050);  // 2 * 650 + 3 * 1250
  assert.deepEqual(r.rows.map(x => x.raw_material_id), [150, 149]);
  assert.deepEqual(r.rows.map(x => x.quote_item.unit_cost), [0, 0]);
  assert.ok(r.rows.every(x => x.quote_item.source_type === "inventory_material"));
  assert.equal(r.stock_verified, false);
});

test("W4-A1: Admin quantity, customer wood coverage and unique species are mandatory", () => {
  const p = {rawMaterials: actual, adminConfirmed: true};
  assert.throws(() => priceAdminConfirmedInventoryWood({items:[{wood_type:"pine",quantity:2}],rawMaterials:actual}), /confirmation/i);
  assert.throws(() => priceAdminConfirmedInventoryWood({...p,items:[{wood_type:"pine",quantity:0}]}), /positive whole/);
  assert.throws(() => priceAdminConfirmedInventoryWood({...p,items:[{wood_type:"pine",quantity:2.5}]}), /positive whole/);
  assert.throws(() => priceAdminConfirmedInventoryWood({...p,items:[{wood_type:"pine",quantity:1},{wood_type:"pine",quantity:2}]}), /Repeated/);
  assert.throws(() => priceAdminConfirmedInventoryWood({...p,items:[{wood_type:"pine",quantity:1}], requestedWoodTypes:["mahogany"]}), /do not match/);
});

test("W4-A1: mismatched inventory material, thickness or unit fail closed", () => {
  const variant = (patch) => actual.map(x => x.name === "Pine Plank" ? {...x,...patch} : x);
  assert.throws(() => resolveInventoryWoodMaterial("pine", variant({thickness_mm:50})), /dimensions or units/);
  assert.throws(() => resolveInventoryWoodMaterial("pine", variant({unit:"sheet"})), /dimensions or units/);
  assert.throws(() => resolveInventoryWoodMaterial("pine", variant({unit_cost:0})), /valid unit cost/);
  assert.throws(() => resolveInventoryWoodMaterial("pine", variant({is_active:0})), /active ID/);
  assert.throws(() => resolveInventoryWoodMaterial("pine", variant({name:"Pine Bed Slat 1500x70x18mm"})), /missing or ambiguous/);
  assert.throws(() => resolveInventoryWoodMaterial("pine", [...actual, actual.find(x=>x.name === "Pine Plank")]), /ambiguous/);
  assert.throws(() => resolveInventoryWoodMaterial("walnut", actual), /Unsupported requested/);
});
