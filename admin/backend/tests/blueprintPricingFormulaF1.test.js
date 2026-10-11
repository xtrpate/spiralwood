"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeBlueprintProductionCost, FIXED_MARKUP_RATE } = require("../utils/blueprintPricingFormula");

const materialsById = new Map([
  [10, { unit_cost: 1000 }],
  [11, { unit_cost: 250.25 }],
]);
const inventory = (id, quantity, unit_cost = 999999) => ({
  source_type: "inventory_material",
  raw_material_id: id, quantity, unit_cost,
});

test("20% fixed markup uses database material costs; ignores browser prices", () => {
  const result = computeBlueprintProductionCost({
    items: [inventory(10, 2), inventory(11, 4),
      {source_type:"blueprint_part", quantity: 2, unit_cost: 1998}],
    materialsById, laborCost: 1000,
  });
  assert.equal(FIXED_MARKUP_RATE, 0.2);
  assert.equal(result.material_cost, 3001);
  assert.equal(result.production_labor_cost, 1000);
  assert.equal(result.production_cost, 4001);
  assert.equal(result.markup_amount, 800.2);
  assert.equal(result.proposed_furniture_selling_price, 4801.2);
  assert.equal(result.connected_to_quotation_totals, false);
  assert.equal(result.material_cost_status, "priced");
});

test("hardware/finishing stock is charged only once as material", () => {
  const result = computeBlueprintProductionCost({
    items: [inventory(11, 3)], materialsById, laborCost: 0,
  });
  assert.equal(result.material_cost, 750.75);
  assert.equal(result.proposed_furniture_selling_price, 900.9);
});

test("material without a unit cost does not invent a selling price", () => {
  const result = computeBlueprintProductionCost({
    items: [inventory(12, 2)],
    materialsById: new Map([[12, {unit_cost: 0}]]), laborCost: 1000,
  });
  assert.equal(result.proposed_furniture_selling_price, null);
  assert.deepEqual(result.unpriced_raw_material_ids, [12]);
  assert.equal(result.material_cost_status, "missing_prices_or_materials");
});

test("no material rows is not a valid completed pricing basis", () => {
  const result = computeBlueprintProductionCost({
    items: [{source_type:"component", unit_cost:1998, quantity:10}],
    materialsById:new Map(), laborCost:15000,
  });
  assert.equal(result.proposed_furniture_selling_price, null);
  assert.equal(result.required_material_count, 0);
});

test("rejects a missing DB material, duplicate ID, invalid count and negative labor", () => {
  const run = (items, cost=0, db=materialsById) => computeBlueprintProductionCost({
    items, laborCost:cost, materialsById:db,
  });
  assert.throws(()=>run([inventory(13, 1)]), /not found/);
  assert.throws(()=>run([inventory(10, 1), inventory(10, 2)]), /Invalid validated/);
  assert.throws(()=>run([inventory(10, 0)]), /Invalid validated/);
  assert.throws(()=>run([inventory(10, 1)], -1), /non-negative/);
  assert.throws(()=>run([inventory(10, 1)], 0, new Map([[10,{unit_cost:-1}]])), /Invalid server unit cost/);
});

test("retains currency precision for unit costs with decimals", () => {
  const result = computeBlueprintProductionCost({
    items: [inventory(42, 3)],
    materialsById: new Map([[42, {unit_cost: 99.99}]]),
    laborCost: 200.03,
  });
  assert.equal(result.material_cost, 299.97);
  assert.equal(result.production_cost, 500);
  assert.equal(result.markup_amount, 100);
  assert.equal(result.proposed_furniture_selling_price, 600);
});
