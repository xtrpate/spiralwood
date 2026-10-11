"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  WOOD_REFERENCE_PRICES,
  findWoodReference,
  calculateAdminConfirmedWoodReferenceCost,
} = require("../utils/blueprintWoodReferencePrices");

const expected = {
  Mahogany: 1450, Pine: 650, Acacia: 1250, Narra: 3500,
  Tanguile: 500, Gmelina: 300, Rubberwood: 850,
  Teak: 3100, Oak: 2650, Maple: 2350,
};

test("W3: exactly ten approved woods and exact development reference costs", () => {
  assert.equal(WOOD_REFERENCE_PRICES.length, 10);
  assert.deepEqual(Object.fromEntries(WOOD_REFERENCE_PRICES.map((r) => [r.name, r.cost_per_plank])), expected);
  assert.equal(new Set(WOOD_REFERENCE_PRICES.map((r) => r.id)).size, 10);
  assert.equal(findWoodReference("  MAHOGANY ").cost_per_plank, 1450);
  assert.equal(findWoodReference("walnut"), null);
});

test("W3: unit is a real stock plank, Pine thickness differs, all prices explicitly unverified", () => {
  for (const record of WOOD_REFERENCE_PRICES) {
    assert.equal(record.unit, "plank");
    assert.equal(record.length_mm, 2400);
    assert.equal(record.width_mm, 100);
    assert.equal(record.thickness_mm, record.id === "pine" ? 38 : 50);
    assert.equal(record.supplier_price_verified, false);
    assert.equal(record.price_use, "development_reference_only");
  }
  for (const name of ["Tanguile", "Gmelina"]) {
    assert.equal(findWoodReference(name).evidence, "provisional_research_estimate");
  }
});

test("W3: only Admin-entered plank counts drive internal reference costs", () => {
  const result = calculateAdminConfirmedWoodReferenceCost({adminConfirmed: true, materials: [
    {wood_type: "Mahogany", unit: "plank", quantity: 3},
    {wood_type: "Pine", unit: "plank", quantity: 2},
  ]});
  assert.equal(result.material_reference_cost, 5650);
  assert.deepEqual(result.lines.map((row) => row.subtotal), [4350, 1300]);
  assert.equal(result.connected_to_customer_quotation, false);
  assert.equal(result.requires_admin_construction_and_price_review, true);
  assert.equal(result.supplier_prices_verified, false);
});

test("W3: no automatic counts, no wrong units, no duplicates or invalid money", () => {
  const run = (materials) => calculateAdminConfirmedWoodReferenceCost({adminConfirmed: true, materials});
  assert.throws(() => calculateAdminConfirmedWoodReferenceCost({materials: [{wood_type: "Pine",unit:"plank",quantity:1}]}), /Admin confirmation/);
  assert.throws(() => run([]), /Admin-confirmed/);
  assert.throws(() => run([{wood_type: "Pine",unit:"sheet",quantity:1}]), /planks only/);
  assert.throws(() => run([{wood_type: "Oak",unit:"plank",quantity:1.5}]), /whole number/);
  assert.throws(() => run([{wood_type: "Oak",unit:"plank",quantity:-2}]), /whole number/);
  assert.throws(() => run([{wood_type: "Oak",unit:"plank"}]), /whole number/);
  assert.throws(() => run([{wood_type: "Oak",unit:"plank",quantity:"2"}]), /whole number/);
  assert.throws(() => run([{wood_type: "Unknown",unit:"plank",quantity:2}]), /Unknown wood/);
  assert.throws(() => run([
    {wood_type: "Pine",unit:"plank",quantity:1},
    {wood_type: "pine",unit:"plank",quantity:1},
  ]), /duplicate charging/);
});

test("W3: costs remain on backend; existing F2 quotation and delivery are unchanged", () => {
  const backend = fs.readFileSync(path.join(__dirname, "../utils/blueprintPricingFormula.js"), "utf8");
  assert.match(backend, /const FIXED_MARKUP_RATE = 0\.20/);
  assert.match(backend, /materialsById\.get\(id\)/);
  assert.doesNotMatch(backend, /blueprintWoodReferencePrices/);
  const frontend = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/customer/customerWoodTypes.mjs"), "utf8");
  assert.doesNotMatch(frontend, /cost_per_plank|reference_unit_cost|1450|3500/);
});
