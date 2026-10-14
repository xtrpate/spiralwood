"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {pathToFileURL} = require("node:url");
const helper = path.resolve(__dirname, "../../frontend/src/pages/blueprints/retainedOriginalMaterialsW4A4.mjs");
const frontendPath = path.resolve(__dirname, "../../frontend/src/pages/blueprints/EstimationPage.jsx");
const backendPath = path.resolve(__dirname, "../controllers/admin/blueprintController.estimation.js");
const sku = {id:37,name:"Marine Plywood 18mm - 4x8 ft",unit:"sheet",material_form:"sheet",length_mm:2438,width_mm:1219,thickness_mm:18,is_active:1,unit_cost:1350,quantity:15};
const orderDesign={components:[
 {partCode:"WR-SL",material:"Marine Plywood",width:18,height:2100,depth:600},
 {partCode:"WR-SR",material:"Marine Plywood",width:18,height:2100,depth:600},
 {partCode:"WR-TOP",material:"Marine Plywood",width:1364,height:18,depth:600},
 {partCode:"WR-PLINTH",material:"Marine Plywood",width:1364,height:80,depth:18},
 {partCode:"WR-BOT",material:"Marine Plywood",width:1364,height:18,depth:600,requested_wood_type:"mahogany"},
 {partCode:"WR-BK",material:"Panel Board",width:1364,height:1984,depth:6,requested_wood_type:"pine"},
]};
const mod = () => import(pathToFileURL(helper).href);
const server = require("../utils/blueprintRetainedOriginalMaterialsW4A4");

test("W4-A4: retained 18mm marine plywood is grouped once; requested Mahogany/Pine are excluded", async()=>{
 const {getRetainedOriginalMaterialSpecs}=await mod();
 const specs=getRetainedOriginalMaterialSpecs(orderDesign);
 assert.equal(specs.length,1);
 assert.equal(specs[0].stock_name,sku.name);
 assert.equal(specs[0].thickness_mm,18);
 assert.ok(specs[0].key.startsWith("retained-original:"));
 assert.equal(getRetainedOriginalMaterialSpecs({components:[
  {...orderDesign.components[0],requested_wood_type:"mahogany"},
 ]}).length,0);
});

test("W4-A4: matches only active exact 4x8 sheet, never 4x6 or laminated", async()=>{
 const {matchRetainedOriginalMaterial,getRetainedOriginalMaterialSpecs}=await mod();
 const spec=getRetainedOriginalMaterialSpecs(orderDesign)[0];
 const wrong=[{...sku,id:32,name:"Marine Plywood 18mm - 4x6 ft",length_mm:1829},
  {...sku,id:44,name:"Laminated Marine Plywood 18mm - 4x8 ft"}];
 assert.equal(matchRetainedOriginalMaterial(spec,wrong),null);
 assert.equal(matchRetainedOriginalMaterial(spec,[...wrong,sku])?.id,37);
 assert.equal(matchRetainedOriginalMaterial(spec,[sku,{...sku,id:777}]),null);
 assert.equal(matchRetainedOriginalMaterial(spec,[{...sku,is_active:0}]),null);
 assert.equal(matchRetainedOriginalMaterial(spec,[{...sku,thickness_mm:15}]),null);
 assert.equal(matchRetainedOriginalMaterial(spec,[{...sku,unit_cost:0}]),null);
});

test("W4-A4: draft adds one empty quantity, no automatic plank/sheet count or duplicate", async()=>{
 const {ensureRetainedOriginalMaterialRows}=await mod();
 const existing=[{name:"Mahogany Plank",wood_type:"mahogany",quantity:2,source_type:"inventory_material",raw_material_id:46}];
 const populated=ensureRetainedOriginalMaterialRows(existing,orderDesign,[sku]);
 assert.equal(populated.length,2);
 assert.equal(populated[1].quantity,"");
 assert.equal(populated[1].unit,"sheet");
 assert.equal(populated[1].raw_material_id,37);
 assert.equal(populated[1].unit_cost,0);
 assert.equal(populated[0],existing[0]);
 assert.strictEqual(ensureRetainedOriginalMaterialRows(populated,orderDesign,[sku]),populated);
 assert.strictEqual(ensureRetainedOriginalMaterialRows(existing,orderDesign,[sku],{locked:true}),existing);
 assert.equal(ensureRetainedOriginalMaterialRows(existing,orderDesign,[])[1].raw_material_id,null);
});

test("W4-A4: server refuses missing, forged, invalid, or duplicate original material rows", async()=>{
 const {validateRetainedOriginalMaterialCoverage}=await mod();
 const rows=[{source_type:"inventory_material",raw_material_id:37,quantity:2,unit:"sheet"}];
 assert.equal(validateRetainedOriginalMaterialCoverage({design:orderDesign,items:rows,rawMaterials:[sku]}),true);
 assert.throws(()=>validateRetainedOriginalMaterialCoverage({design:orderDesign,items:[],rawMaterials:[sku]}),/Required Materials row/);
 assert.throws(()=>validateRetainedOriginalMaterialCoverage({design:orderDesign,items:[{...rows[0],raw_material_id:32}],rawMaterials:[sku]}),/Required Materials row/);
 assert.throws(()=>validateRetainedOriginalMaterialCoverage({design:orderDesign,items:[{...rows[0],quantity:0}],rawMaterials:[sku]}),/whole-number/);
 assert.throws(()=>validateRetainedOriginalMaterialCoverage({design:orderDesign,items:[{...rows[0],quantity:1.5}],rawMaterials:[sku]}),/whole-number/);
 assert.throws(()=>validateRetainedOriginalMaterialCoverage({design:orderDesign,items:[...rows,...rows],rawMaterials:[sku]}),/exactly one/);
 assert.throws(()=>validateRetainedOriginalMaterialCoverage({design:orderDesign,items:rows,rawMaterials:[{...sku,is_active:0}]}),/no single active/);
 assert.equal(validateRetainedOriginalMaterialCoverage({design:{components:[]},items:[],rawMaterials:[]}),true);
});

test("W4-A4: save/send use same canonical validator; locked quotes remain idempotent",()=>{
 const source=fs.readFileSync(backendPath,"utf8");
 const front=fs.readFileSync(frontendPath,"utf8");
 assert.match(source,/const canonicalDesign = safeJsonParse\(quantityBlueprint\?\.design_data/);
 assert.match(source,/validateRetainedOriginalMaterialCoverage\(\{\s*design: canonicalDesign/);
 assert.match(source,/validateRetainedOriginalMaterialCoverage\(\{\s*design: quoteDesign/);
 assert.ok(source.indexOf('if (currentStatus === "sent")') < source.lastIndexOf('validateRetainedOriginalMaterialCoverage({'));
 assert.match(front,/ensureRetainedOriginalMaterialRows\(/);
 assert.match(front,/Retained original panel material · Admin confirms actual sheets/);
 assert.match(front,/ensureRequestedWoodRows\(/);
 assert.match(front,/getQuotationInventoryIssues\(inventoryRequirementsForPreview, rawMaterials\)/);
 assert.match(front,/const isPickup = isTransactionMode/);
 assert.match(front,/const isDelivery = isTransactionMode/);
});

test("W4-A4: frontend suggestions and backend coverage use matching pure rules", async()=>{
 const front=await mod();
 assert.deepEqual(front.getRetainedOriginalMaterialSpecs(orderDesign),server.getRetainedOriginalMaterialSpecs(orderDesign));
 assert.equal(front.matchRetainedOriginalMaterial(front.getRetainedOriginalMaterialSpecs(orderDesign)[0],[sku]).id,
   server.matchRetainedOriginalMaterial(server.getRetainedOriginalMaterialSpecs(orderDesign)[0],[sku]).id);
 const rows=[{source_type:"inventory_material",raw_material_id:37,quantity:2}];
 assert.equal(server.validateRetainedOriginalMaterialCoverage({design:orderDesign,items:rows,rawMaterials:[sku]}),true);
 assert.throws(()=>server.validateRetainedOriginalMaterialCoverage({design:orderDesign,items:[],rawMaterials:[sku]}),/Required Materials row/);
});
