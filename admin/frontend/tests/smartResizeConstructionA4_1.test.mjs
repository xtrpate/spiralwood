import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { reviewFurnitureGeometryA3 } from '../src/pages/blueprints/data/constructionGeometryA3.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = path.join(repo, 'admin/frontend/src/pages/blueprints/data');
const smartSource = fs.readFileSync(path.join(dataDir, 'smartAssemblyResize.js'), 'utf8');
// Node tests read the actual source. The test adapter only resolves the
// existing bundler-style ./utils import without touching production files.
const sourceForNode = smartSource
  .replace('from "./utils"', `from "${pathToFileURL(path.join(dataDir, 'utils.js')).href}"`)
  .replace('from "./constructionGeometryA3.mjs"',
    `from "${pathToFileURL(path.join(dataDir, 'constructionGeometryA3.mjs')).href}"`);
assert.notEqual(sourceForNode, smartSource, 'test adapter did not resolve imports');
const { analyzeSmartAssemblyResize, buildSmartAssemblyResizePlan } = await import(
  'data:text/javascript;base64,' + Buffer.from(sourceForNode).toString('base64')
);

const part = (code, type, role, x, y, z, width, height, depth, family, templateType) => ({
  id: `id-${code}`, partCode: code, type, partRole: role, assemblyRole: role,
  label: code, groupId: `group-${family}`, assemblyId: `group-${family}`,
  assemblyType: family, templateType,
  x, y, z, width, height, depth, qty: 1, material: 'Oak Wood',
  rotationX: 0, rotationY: 0, rotationZ: 0,
});
function dining() {
  const p=(...xs)=>part(...xs,'dining_table','template_dining_table');
  const out=[p('DT-TOP','dt_top_panel','top_panel',0,0,0,1800,40,900)];
  for(const [code,x,z] of [['DT-FL',70,70],['DT-FR',1650,70],['DT-BL',70,750],['DT-BR',1650,750]])
    out.push(p(code,'dt_leg','leg',x,40,z,80,720,80));
  out.push(p('DT-AF','dt_apron_long','apron_rail',150,40,70,1500,90,25));
  out.push(p('DT-AR','dt_apron_long','apron_rail',150,40,805,1500,90,25));
  out.push(p('DT-AL','dt_apron_short','apron_rail',70,40,150,25,90,600));
  out.push(p('DT-AR2','dt_apron_short','apron_rail',1705,40,150,25,90,600));
  return out;
}
function coffee() {
  const p=(...xs)=>part(...xs,'coffee_table','template_coffee_table');
  const out=[p('CT-TOP','ct_top_panel','top_panel',0,0,0,1000,36,600)];
  for(const [code,x,z] of [['CT-FL',55,55],['CT-FR',875,55],['CT-BL',55,475],['CT-BR',875,475]])
    out.push(p(code,'ct_leg','leg',x,36,z,70,414,70));
  out.push(p('CT-SH','ct_lower_shelf','shelf',125,280,125,750,22,350));
  out.push(p('CT-AF','ct_front_apron','apron_rail',125,36,55,750,70,22));
  out.push(p('CT-AR','ct_rear_apron','apron_rail',125,36,523,750,70,22));
  out.push(p('CT-ASL','ct_apron_short','apron_rail',79,36,125,22,70,350));
  out.push(p('CT-ASR','ct_apron_short','apron_rail',899,36,125,22,70,350));
  return out;
}
function wardrobe() {
  const p=(...xs)=>part(...xs,'wardrobe','template_wardrobe');
  return [
    p('WR-SL','wr_side_panel','left_side_panel',0,0,0,18,2200,600),
    p('WR-SR','wr_side_panel','right_side_panel',1782,0,0,18,2200,600),
    p('WR-TOP','wr_top_panel','top_panel',18,0,0,1764,18,600),
    p('WR-BOT','wr_bottom_panel','bottom_panel',18,2182,0,1764,18,600),
    p('WR-BKL','wr_back_panel','back_panel',18,18,0,882,2164,18),
    p('WR-BKR','wr_back_panel','back_panel',900,18,0,882,2164,18),
    p('WR-BKS','wr_back_support','support_panel',870,18,18,60,2164,18),
    p('WR-SH1','wr_shelf','shelf',18,500,40,1764,18,560),
    p('WR-SH2','wr_shelf','shelf',18,1000,40,1764,18,560),
    p('WR-SH3','wr_shelf','shelf',18,1500,40,1764,18,560),
    p('WR-DL','wr_door','door',18,18,582,882,2164,18),
    p('WR-DR','wr_door','door',900,18,582,882,2164,18),
  ];
}
const deep = (x) => JSON.parse(JSON.stringify(x));
const apply = (xs, plan) => xs.map(p=>({...p,...(plan.changesById?.[p.id]||{})}));

test('A4-1 guards real Admin analyze and plan entrypoints, no UI bypass', () => {
  assert.match(smartSource, /import \{ reviewFurnitureGeometryA3 \}/);
  assert.match(smartSource, /const constructionBefore = reviewFurnitureGeometryA3/);
  assert.match(smartSource, /const constructionAfter = reviewFurnitureGeometryA3/);
  assert.equal((smartSource.match(/reviewFurnitureGeometryA3\(/g) || []).length, 2);
});
for (const [label,make] of [['dining',dining],['coffee',coffee],['wardrobe',wardrobe]]) {
 test(`A4-1 ${label}: unmodified template passes precheck`,()=>{
  const parts=make(); assert.equal(reviewFurnitureGeometryA3({components:parts}).geometryCandidateForReview,true);
  assert.equal(analyzeSmartAssemblyResize(parts).supported,true);
 });
 test(`A4-1 ${label}: missing role blocks preview and apply before planning`,()=>{
  const parts=make();delete parts[0].partRole;delete parts[0].assemblyRole;
  const snapshot=deep(parts);
  const analysis=analyzeSmartAssemblyResize(parts);
  const plan=buildSmartAssemblyResizePlan(parts,{dimension:'width',newValue:2000});
  assert.equal(analysis.supported,false);
  assert.equal(plan.supported,false);
  assert.deepEqual(parts,snapshot);
  assert.equal('changesById' in plan,false);
 });
}
test('A4-1 invalid geometry must block preview and returned plan',()=>{
 const parts=dining();parts[1].y+=2;
 assert.equal(analyzeSmartAssemblyResize(parts).supported,false);
 const plan=buildSmartAssemblyResizePlan(parts,{dimension:'width',newValue:2000});
 assert.equal(plan.supported,false);
 assert.equal('changesById' in plan,false);
});
test('A4-1 invalid changed result must never return executable changesById',()=>{
 const parts=dining();
 const snapshot=deep(parts);
 const plan=buildSmartAssemblyResizePlan(parts,{dimension:'height',newValue:860,anchor:'center'});
 if(plan.supported){
   const review=reviewFurnitureGeometryA3({components:apply(parts,plan)});
   assert.equal(review.geometryCandidateForReview,true,JSON.stringify(review.issues));
 } else {
   assert.equal('changesById' in plan,false);
   assert.match(plan.reason,/construction|resize|not supported/i);
 }
 assert.deepEqual(parts,snapshot);
});
test('A4-1 rejects a bad post-resize role alias without exposing any changes',()=>{
 const parts=dining().map(part=>{const copy={...part};delete copy.assemblyRole;return copy;});
 assert.equal(analyzeSmartAssemblyResize(parts).supported,true);
 assert.equal(reviewFurnitureGeometryA3({components:parts}).geometryCandidateForReview,true);
 const snapshot=deep(parts);
 const plan=buildSmartAssemblyResizePlan(parts,{dimension:'width',newValue:2100});
 assert.equal(plan.supported,false);
 assert.equal(plan.constructionReviewStatus,'blocked_metadata');
 assert.equal('changesById' in plan,false);
 assert.deepEqual(parts,snapshot);
});
test('A4-1 no-op size never mutates frozen source',()=>{
 const parts=dining().map(p=>Object.freeze(p));Object.freeze(parts);
 const p=buildSmartAssemblyResizePlan(parts,{dimension:'width',newValue:1800});
 assert.equal(p.supported,true,p.reason);
 assert.ok(p.changesById);
 assert.equal(reviewFurnitureGeometryA3({components:apply(parts,p)}).geometryCandidateForReview,true);
});
test('A4-1 rejects an additional malformed part that has no ID instead of silently filtering it',()=>{
 const parts=[...dining(),{...dining()[0],id:null,partCode:'bad-extra'}];
 const r=analyzeSmartAssemblyResize(parts);
 assert.equal(r.supported,false);
 assert.match(r.reason,/Construction review required/);
});
test('A4-1 cannot authorize Customer resize or certify construction',()=>{
 const r=reviewFurnitureGeometryA3({components:dining()});
 assert.equal(r.resizeEligible,false);assert.deepEqual(r.customerEditable,{width:false,height:false,depth:false});
 assert.equal(r.manufacturingApproved,false);
});
