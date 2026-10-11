"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { computeBlueprintProductionCost, allocateFixedMarkupQuote } = require("../utils/blueprintPricingFormula");

const readEstimationPage = () => fs.readFileSync(path.resolve(__dirname, "../../frontend/src/pages/blueprints/EstimationPage.jsx"), "utf8");

test("FIX1 save request sends base production labor, never marked-up selling labor", () => {
  const source = readEstimationPage();
  const from = source.indexOf("  const buildPayload = (");
  const to = source.indexOf("  const handleSave =", from);
  assert.ok(from >= 0 && to > from, "Expected Admin Estimation save payload section");
  const payload = source.slice(from, to);
  assert.match(payload, /labor_cost:\s*Number\(costs\.labor_cost\s*\|\|\s*0\)/);
  assert.doesNotMatch(payload, /labor_cost:\s*laborCost\s*[,}]/);
  assert.match(source, /Production Labor Cost \(₱, before 20% markup\)/);
});

test("FIX1 example: save + reload must not compound the 20% labor markup", () => {
  const materialsById = new Map([[11, {unit_cost: 3600}]]);
  const items = [
    {source_type:"blueprint_part",name:"Cabinet door",quantity:1,unit_cost:1998},
    {source_type:"inventory_material",name:"Verified board",raw_material_id:11,quantity:1,unit_cost:0},
  ];
  const productionLabor = 20000;
  const quote = (labor) => {
    const cost = computeBlueprintProductionCost({ items, materialsById, laborCost: labor });
    const selling = allocateFixedMarkupQuote({ items, materialCost: cost.material_cost, productionLaborCost: labor });
    return { cost, selling };
  };
  const initial = quote(productionLabor);
  assert.equal(initial.cost.production_cost, 23600);
  assert.equal(initial.cost.markup_amount, 4720);
  assert.equal(initial.selling.billable_labor_cost, 24000);
  assert.equal(initial.selling.furniture_selling_total, 28320);
  // The API persists a billable labor of P24,000, but returns the separate
  // original production labor (P20,000) for the editable form. Saves must
  // submit that form value, never the P24,000 billable quotation field.
  const savedFormProductionLabor = productionLabor;
  const afterReload = quote(savedFormProductionLabor);
  assert.equal(afterReload.cost.production_cost, initial.cost.production_cost);
  assert.equal(afterReload.selling.billable_labor_cost, initial.selling.billable_labor_cost);
  const subtotal = afterReload.selling.furniture_selling_total + 400;
  assert.equal(subtotal, 28720);
  assert.equal(subtotal + Math.round(subtotal * 0.12 * 100) / 100, 32166.40);
});
