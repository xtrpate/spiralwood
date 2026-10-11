"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { computeBlueprintProductionCost, allocateFixedMarkupQuote } = require("../utils/blueprintPricingFormula");

const parts = [
  {source_type:"blueprint_part", name:"Left side", quantity:1, unit_cost:1998},
  {source_type:"blueprint_part", name:"Shelves", quantity:2, unit_cost:1998},
  {source_type:"inventory_material", name:"Marine Plywood",raw_material_id:32,quantity:4,unit_cost:9999999},
  {source_type:"inventory_material", name:"Finishing consumables",raw_material_id:124,quantity:3,unit_cost:9999999},
];
const materialMap = new Map([[32,{unit_cost:1150}],[124,{unit_cost:125.50}]]);
const cents = x => Math.round((x+Number.EPSILON)*100)/100;
const getF2 = (rows=parts, db=materialMap, labor=15000) => {
  const snapshot = computeBlueprintProductionCost({items:rows,materialsById:db,laborCost:labor});
  return { snapshot, quote: allocateFixedMarkupQuote({items:rows,materialCost:snapshot.material_cost,productionLaborCost:labor}) };
};

test("F2 quotation uses verified materials + actual labor + EXACT fixed 20% markup", () => {
  const {snapshot,quote}=getF2();
  assert.equal(snapshot.material_cost,4976.5);
  assert.equal(snapshot.production_cost,19976.5);
  assert.equal(snapshot.markup_amount,3995.3);
  assert.equal(snapshot.proposed_furniture_selling_price,23971.8);
  assert.equal(quote.furniture_selling_total,23971.8);
  assert.equal(quote.furniture_parts_total+quote.billable_labor_cost,23971.8);
  assert.equal(quote.items.find(x=>x.source_type==='inventory_material').unit_cost,9999999);
  assert.ok(quote.items.filter(x=>x.source_type==='blueprint_part').every(x=>x.unit_cost<1998));
});

test("F2 rejects arbitrary customer prices; DB cost drives totals", () => {
  const doctored=parts.map(x=>({...x,unit_cost:x.source_type==='inventory_material'?99999999:x.unit_cost}));
  assert.equal(getF2(doctored).quote.furniture_selling_total,23971.8);
  const cheaper=new Map([[32,{unit_cost:1000}],[124,{unit_cost:125.50}]]);
  assert.equal(getF2(doctored,cheaper).quote.furniture_selling_total,23251.8);
});

test("F2 rounding reconciles to cents for furniture part quantities", () => {
  const fixtures=[
    [{source_type:'blueprint_part',quantity:1,unit_cost:7},{source_type:'blueprint_part',quantity:2,unit_cost:9}],
    [{source_type:'blueprint_part',quantity:2,unit_cost:7},{source_type:'blueprint_part',quantity:4,unit_cost:9}],
    [{source_type:'blueprint_part',quantity:1,unit_cost:103},{source_type:'blueprint_part',quantity:1,unit_cost:3},{source_type:'blueprint_part',quantity:3,unit_cost:3}],
  ];
  for (const rows of fixtures) {
    for (const material of [300.01,700.05,1000.07]) {
      for (const labor of [0,1000.01,500.77]) {
        const quote=allocateFixedMarkupQuote({items:rows,materialCost:material,productionLaborCost:labor});
        assert.equal(quote.furniture_selling_total,cents(cents(material+labor)+cents(cents(material+labor)*0.2)));
        assert.equal(quote.furniture_selling_total,cents(quote.furniture_parts_total+quote.billable_labor_cost));
        assert.ok(quote.items.every(row=>Number.isInteger(Math.round(row.unit_cost*100))));
        assert.ok(Math.abs(quote.price_allocation_rounding) <=1);
      }
    }
  }
});

test("F2 can't quote no blueprint parts or invalid allocation weights",()=>{
  assert.throws(()=>allocateFixedMarkupQuote({items:[],materialCost:500,productionLaborCost:200}),/Furniture Parts/);
  assert.throws(()=>allocateFixedMarkupQuote({items:[{source_type:'blueprint_part',quantity:0,unit_cost:500}],materialCost:500,productionLaborCost:200}),/positive/);
});

test("F2 preview parity with backend calculation, using same materials and labor", async ()=>{
  const file=path.resolve(__dirname,'../../frontend/src/pages/blueprints/blueprintPricingPreview.mjs');
  const { previewFixedMarkupQuote }=await import(pathToFileURL(file));
  const preview=previewFixedMarkupQuote({items:parts,rawMaterials:[{id:32,unit_cost:1150},{id:124,unit_cost:125.50}],laborCost:15000});
  const backend=getF2();
  assert.equal(preview.ready,true);
  assert.equal(preview.furniture_selling_total,backend.quote.furniture_selling_total);
  assert.deepEqual(preview.items.map(x=>x.unit_cost),backend.quote.items.map(x=>x.unit_cost));
  assert.equal(preview.billable_labor_cost,backend.quote.billable_labor_cost);
  assert.equal(preview.material_cost,backend.snapshot.material_cost);
});

test("F2 incomplete price cannot generate a browser quotation preview", async ()=>{
  const file=path.resolve(__dirname,'../../frontend/src/pages/blueprints/blueprintPricingPreview.mjs');
  const { previewFixedMarkupQuote }=await import(pathToFileURL(file));
  assert.equal(previewFixedMarkupQuote({items:parts,rawMaterials:[{id:32,unit_cost:0},{id:124,unit_cost:125}],laborCost:5}).ready,false);
  assert.equal(previewFixedMarkupQuote({items:parts,rawMaterials:[],laborCost:5}).ready,false);
});

test("F2 server sends only DB-backed, repriced draft; legacy locked responses preserved",()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../controllers/admin/blueprintController.estimation.js'),'utf8');
  assert.match(source,/const priced = quoteMeta.costing_formula;/);
  assert.match(source,/PRICING_F2_NOT_READY/);
  assert.match(source,/if \(currentStatus === "sent"\)/);
  assert.match(source,/if \(currentStatus === "approved"\)/);
  assert.match(source,/validateBlueprintEstimateQuantities\(/);
  assert.match(source,/unit_cost: 0,/);
  assert.match(source,/billable_labor_cost: totals.labor_cost/);
});

test("Cabinet illustration: verified sheets + labor + 20% markup, logistics outside markup and 12% VAT", () => {
  const rows = [
    {source_type:'blueprint_part',quantity:1,unit_cost:1998},
    {source_type:'blueprint_part',quantity:2,unit_cost:1998},
    {source_type:'inventory_material',raw_material_id:32,quantity:4,unit_cost:0},
    {source_type:'inventory_material',raw_material_id:33,quantity:1,unit_cost:0},
  ];
  const db=new Map([[32,{unit_cost:1150}],[33,{unit_cost:1500}]]);
  const {snapshot,quote}=getF2(rows,db,15000);
  assert.equal(snapshot.material_cost,6100);
  assert.equal(snapshot.production_cost,21100);
  assert.equal(snapshot.markup_amount,4220);
  assert.equal(quote.furniture_parts_total,7320);
  assert.equal(quote.billable_labor_cost,18000);
  const subtotal=cents(quote.furniture_selling_total + 200); // delivery not marked up
  assert.equal(subtotal,25520);
  const tax=cents(subtotal*0.12);
  assert.equal(tax,3062.4);
  assert.equal(cents(subtotal+tax),28582.4);
});

test("F2 new draft must recheck material prices before send, after locked idempotence", () => {
  const source=fs.readFileSync(path.resolve(__dirname,'../controllers/admin/blueprintController.estimation.js'),'utf8');
  assert.match(source,/PRICING_MATERIAL_COST_CHANGED/);
  assert.match(source,/const \[currentMaterialPrices\] = await conn.query/);
  assert.ok(source.indexOf('if (currentStatus === "sent")') < source.indexOf('PRICING_MATERIAL_COST_CHANGED'));
});
