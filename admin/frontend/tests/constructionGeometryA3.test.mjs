import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewFurnitureGeometryA3 as review } from '../src/pages/blueprints/data/constructionGeometryA3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const paths = {
  a1: path.join(root, 'admin/frontend/src/pages/blueprints/data/constructionDiagnostic.mjs'),
  a2: path.join(root, 'admin/frontend/src/pages/blueprints/data/standardTemplateBuilders.js'),
};
const piece = (code, type, partRole, x, y, z, width, height, depth, family) => ({
  id: `part-${code}`, partCode: code, type, label: code,
  assemblyId: `assembly-${family}`, groupId: `assembly-${family}`,
  assemblyType: family, partRole, assemblyRole: partRole,
  x, y, z, width, height, depth, qty: 1, material: 'Oak Wood',
  rotationX: 0, rotationY: 0, rotationZ: 0,
});
function dining() {
  const f='dining_table'; const p=(...xs)=>piece(...xs,f);
  const out=[p('D-T','dt_top_panel','top_panel',0,0,0,1800,40,900)];
  for (const [code,x,z] of [['D-FL',70,70],['D-FR',1650,70],['D-BL',70,750],['D-BR',1650,750]]) {
    out.push(p(code,'dt_leg','leg',x,40,z,80,720,80));
  }
  out.push(p('D-AF','dt_apron_long','apron_rail',150,40,70,1500,90,25));
  out.push(p('D-AR','dt_apron_long','apron_rail',150,40,805,1500,90,25));
  out.push(p('D-AL','dt_apron_short','apron_rail',70,40,150,25,90,600));
  out.push(p('D-ASR','dt_apron_short','apron_rail',1705,40,150,25,90,600));
  return out;
}
function coffee() {
  const f='coffee_table'; const p=(...xs)=>piece(...xs,f);
  const out=[p('C-T','ct_top_panel','top_panel',0,0,0,1000,36,600)];
  for (const [code,x,z] of [['C-FL',55,55],['C-FR',875,55],['C-BL',55,475],['C-BR',875,475]]) {
    out.push(p(code,'ct_leg','leg',x,36,z,70,414,70));
  }
  out.push(p('C-SH','ct_lower_shelf','shelf',125,280,125,750,22,350));
  out.push(p('C-AF','ct_front_apron','apron_rail',125,36,55,750,70,22));
  out.push(p('C-AR','ct_rear_apron','apron_rail',125,36,523,750,70,22));
  out.push(p('C-ASL','ct_apron_short','apron_rail',79,36,125,22,70,350));
  out.push(p('C-ASR','ct_apron_short','apron_rail',899,36,125,22,70,350));
  return out;
}
function wardrobe() {
  const f='wardrobe';const p=(...xs)=>piece(...xs,f);
  return [
    p('W-L','wr_side_panel','left_side_panel',0,0,0,18,2200,600),
    p('W-R','wr_side_panel','right_side_panel',1782,0,0,18,2200,600),
    p('W-T','wr_top_panel','top_panel',18,0,0,1764,18,600),
    p('W-B','wr_bottom_panel','bottom_panel',18,2182,0,1764,18,600),
    p('W-BKL','wr_back_panel','back_panel',18,18,0,882,2164,18),
    p('W-BKR','wr_back_panel','back_panel',900,18,0,882,2164,18),
    p('W-BKS','wr_back_support','support_panel',870,18,18,60,2164,18),
    p('W-S1','wr_shelf','shelf',18,500,40,1764,18,560),
    p('W-S2','wr_shelf','shelf',18,1000,40,1764,18,560),
    p('W-S3','wr_shelf','shelf',18,1500,40,1764,18,560),
    p('W-DL','wr_door','door',18,18,582,882,2164,18),
    p('W-DR','wr_door','door',900,18,582,882,2164,18),
  ];
}
const seenCodes=(x)=>x.issues.map(i=>i.code);
const changed=(original, code, props)=>original.map(p=>p.partCode===code?{...p,...props}:p);

for(const [name, make, type, count] of [
 ['dining table',dining,'table',9],['coffee table',coffee,'table',10],['wardrobe',wardrobe,'cabinet',12],
]) {
 test(`A3 ${name} normal template geometry is a manual-review candidate only`,()=>{
   const parts=make();const r=review({components:parts,furnitureType:type});
   assert.equal(parts.length,count);
   assert.equal(r.status,'geometry_candidate_for_manual_review',JSON.stringify(r.issues));
   assert.equal(r.inspectedPartCount,count);
   assert.equal(r.resizeEligible,false);assert.equal(r.fixedSectionResizingApproved,false);
   assert.equal(r.manufacturingApproved,false);assert.equal(r.carpenterReviewRequired,true);
   assert.deepEqual(r.customerEditable,{width:false,height:false,depth:false});
 });
 test(`A3 ${name} translated assembly keeps same geometry assessment`,()=>{
   const parts=make().map(p=>({...p,x:p.x+512,y:p.y+99,z:p.z-41}));
   const r=review({components:parts,furnitureType:type});
   assert.equal(r.geometryCandidateForReview,true,JSON.stringify(r.issues));
 });
}

test('A3 never mutates frozen components, including material, qty, coordinates or wood',()=>{
 const parts=dining().map(p=>Object.freeze({...p,requested_wood_type:'Mahogany'}));
 Object.freeze(parts);
 const snapshot=JSON.stringify(parts);
 review({components:parts,furnitureType:'table'});
 assert.equal(JSON.stringify(parts),snapshot);
});
test('A3 excludes 1700mm human reference and generic reference proxies',()=>{
 const parts=[...dining(),{type:'human_reference',height:1700},{type:'reference_proxy',height:1700}];
 assert.equal(review({components:parts,furnitureType:'table'}).inspectedPartCount,9);
});
test('A3 never treats a correct geometry candidate as editable',()=>{
 for(const parts of [dining(),coffee(),wardrobe()]) {
  const r=review({components:parts});assert.deepEqual(Object.values(r.customerEditable),[false,false,false]);
 }
});
test('A3 requires A1 valid metadata before any family geometry review',()=>{
 const broken=dining();delete broken[2].partRole;delete broken[2].assemblyRole;
 const r=review({components:broken,furnitureType:'table'});
 assert.equal(r.status,'blocked_metadata');assert.ok(seenCodes(r).includes('A1_METADATA_NOT_READY'));
});
test('A3 rejects conflicting family declaration before geometry',()=>{
 const parts=dining();parts[1].assemblyType='wardrobe';
 assert.equal(review({components:parts}).status,'blocked_metadata');
});
test('A3 never assumes Bed, Chair or unknown family has reviewed geometry',()=>{
 const parts=dining().map(p=>({...p,assemblyType:'bed_frame',type:'custom_part',partCode:'B-'+p.partCode,
  assemblyId:'bed-1',groupId:'bed-1'}));
 assert.equal(review({components:parts}).status,'family_profile_pending');
 assert.equal(review({components:parts}).resizeEligible,false);
});
test('A3 does not accept nonarray parts as constructed furniture',()=>{
 assert.equal(review({components:undefined}).status,'blocked_metadata');
});
const tableCases=[
 ['missing top',p=>p.filter(q=>q.partCode!=='D-T'),'REQUIRED_PART_ROLE_COUNT'],
 ['3 legs only',p=>p.filter(q=>q.partCode!=='D-FR'),'FOUR_LEG_PROFILE_REQUIRED'],
 ['leg not joined',p=>changed(p,'D-FL',{y:41}),'LEG_TOP_NOT_JOINED'],
 ['leg misses floor',p=>changed(p,'D-BR',{height:719}),'UNEVEN_FLOOR_CONTACT'],
 ['leg section mismatch',p=>changed(p,'D-FR',{width:84}),'LEG_SECTION_CONFLICT'],
 ['leg outside top',p=>changed(p,'D-BL',{z:850}),'LEG_OUTSIDE_TOP'],
 ['duplicate leg corner',p=>changed(p,'D-FR',{x:71,z:75}),'MISSING_SUPPORT_CORNER'],
 ['apron vertically detached',p=>changed(p,'D-AF',{y:70}),'APRON_NOT_UNDER_TOP'],
 ['apron outside table',p=>changed(p,'D-AR',{x:-20}),'APRON_OUTSIDE_TOP'],
 ['apron height altered',p=>changed(p,'D-AR',{height:85}),'APRON_HEIGHT_MISMATCH'],
 ['apron fixed section altered',p=>changed(p,'D-AF',{depth:35}),'APRON_SECTION_CONFLICT'],
];
for(const [label,mutate,code] of tableCases){
 test('A3 table rejects '+label,()=>{
  const r=review({components:mutate(dining()),furnitureType:'table'});
  assert.equal(r.status,'geometry_review_required',label);
  assert.ok(seenCodes(r).includes(code),`${label}: ${seenCodes(r)}`);
  assert.equal(r.resizeEligible,false);
 });
}
test('A3 coffee table catches lower shelf extending past leg structure',()=>{
 const r=review({components:changed(coffee(),'C-SH',{z:590}),furnitureType:'table'});
 assert.ok(seenCodes(r).includes('SHELF_OUTSIDE_TABLE_INTERIOR'));
});
const cabinetCases=[
 ['missing right side',p=>p.filter(x=>x.partCode!=='W-R'),'REQUIRED_PART_ROLE_COUNT'],
 ['mismatched side thickness',p=>changed(p,'W-R',{width:22}),'SIDE_PANEL_MISMATCH'],
 ['top too wide',p=>changed(p,'W-T',{width:1800}),'TOP_BOTTOM_FIT'],
 ['top too thick',p=>changed(p,'W-T',{height:22}),'TOP_BOTTOM_FIT'],
 ['bottom floats above floor',p=>changed(p,'W-B',{y:2170}),'TOP_BOTTOM_VERTICAL_FIT'],
 ['shelf outside sides',p=>changed(p,'W-S1',{x:0}),'SHELF_OUTSIDE_OPENING'],
 ['shelf wrong thickness',p=>changed(p,'W-S1',{height:50}),'SHELF_SECTION_MISMATCH'],
 ['door outside shell',p=>changed(p,'W-DL',{z:601}),'DOOR_OUTSIDE_SHELL'],
 ['overlapping doors',p=>changed(p,'W-DR',{x:850}),'OVERLAPPING_DOORS'],
 ['back outside shell',p=>changed(p,'W-BKL',{z:-5}),'BACK_PANEL_OUTSIDE_SHELL'],
];
for(const [label,mutate,code] of cabinetCases){
 test('A3 wardrobe rejects '+label,()=>{
  const r=review({components:mutate(wardrobe()),furnitureType:'cabinet'});
  assert.equal(r.status,'geometry_review_required');
  assert.ok(seenCodes(r).includes(code),`${label}: ${seenCodes(r)}`);
  assert.equal(r.customerEditable.width,false);
 });
}
test('A3 uses roles and geometry rather than fixed blueprint IDs',()=>{
 const parts=wardrobe().map((p,i)=>({...p,id:`arbitrary-${i+23}`,partCode:`CUSTOM-${i+23}`,type:'generic_furniture_part'}));
 assert.equal(review({components:parts,furnitureType:'cabinet'}).geometryCandidateForReview,true);
});
test('A3 source explicitly imports A1 and has no save, publish, stock, price or resize engine integration',()=>{
 const source=fs.readFileSync(path.join(root,'admin/frontend/src/pages/blueprints/data/constructionGeometryA3.mjs'),'utf8');
 assert.match(source,/import \{ diagnoseConstructionA1 \}/);
 assert.match(source,/resizeEligible: false/);
 for (const forbidden of ['api.put(', 'api.post(', 'fetch(', 'localStorage', 'INSERT INTO', 'UPDATE blueprints', 'customerEditable: { width: true']){
  assert.ok(!source.includes(forbidden),forbidden);
 }
 for (const originalFile of Object.values(paths))assert.ok(fs.existsSync(originalFile),'missing baseline '+originalFile);
});
