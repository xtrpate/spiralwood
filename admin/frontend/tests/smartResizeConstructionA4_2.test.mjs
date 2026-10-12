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


const endY = p => p.y + p.height;
const get = (parts,code)=>parts.find(p=>p.partCode===code);
const span = (parts)=>({
  left:Math.min(...parts.map(p=>p.x)),right:Math.max(...parts.map(p=>p.x+p.width)),
  top:Math.min(...parts.map(p=>p.y)),bottom:Math.max(...parts.map(p=>endY(p))),
  front:Math.min(...parts.map(p=>p.z)),back:Math.max(...parts.map(p=>p.z+p.depth)),
});

for(const [label, make, target] of [
  ['dining',dining,{width:2000,height:860,depth:1000}],
  ['coffee',coffee,{width:1200,height:520,depth:700}],
  ['wardrobe',wardrobe,{width:2000,height:2400,depth:700}],
]) {
  test(`A4-2 ${label}: changing height keeps feet or cabinet base on exact same floor`,()=>{
    for(const anchor of ['center','top','bottom']){
      const parts=make();const original=deep(parts);const floor=span(parts).bottom;
      const plan=buildSmartAssemblyResizePlan(parts,{dimension:'height',newValue:target.height,anchor});
      assert.equal(plan.supported,true,`${label}/${anchor}: ${plan.reason}`);
      assert.equal(plan.anchor,'top','actual physical anchor must be fixed floor');
      assert.equal(plan.nextBounds.maxY,floor);
      const next=apply(parts,plan);
      assert.equal(span(next).bottom,floor);
      assert.equal(span(next).bottom-span(next).top,target.height);
      const contacts = label === 'wardrobe' ? ['WR-SL','WR-SR','WR-BOT'] :
        label==='dining'?['DT-FL','DT-FR','DT-BL','DT-BR']:['CT-FL','CT-FR','CT-BL','CT-BR'];
      for(const code of contacts)assert.equal(endY(get(next,code)),endY(get(parts,code)),code);
      assert.equal(reviewFurnitureGeometryA3({components:next}).geometryCandidateForReview,true);
      assert.deepEqual(parts,original,'source changed');
    }
  });
  test(`A4-2 ${label}: width and depth preserve other dimensions and fixed member sections`,()=>{
    for(const dimension of ['width','depth']){
      const parts=make();const original=deep(parts);
      const plan=buildSmartAssemblyResizePlan(parts,{dimension,newValue:target[dimension],anchor:'center'});
      assert.equal(plan.supported,true,`${label}/${dimension}: ${plan.reason}`);
      const next=apply(parts,plan);
      assert.equal(span(next).bottom,span(parts).bottom);
      assert.equal(reviewFurnitureGeometryA3({components:next}).geometryCandidateForReview,true);
      for(let i=0;i<parts.length;i++) {
        assert.equal(parts[i].height,next[i].height,parts[i].partCode+' fixed height');
        assert.equal(parts[i].y,next[i].y,parts[i].partCode+' fixed Y');
        if(label==='wardrobe') {
          if(['left_side_panel','right_side_panel'].includes(parts[i].partRole)) assert.equal(next[i].width,parts[i].width);
          if(['back_panel','door','support_panel'].includes(parts[i].partRole)) assert.equal(next[i].depth,parts[i].depth);
        }else{
          if(parts[i].partRole==='leg') {
            assert.equal(parts[i].width,next[i].width);assert.equal(parts[i].depth,next[i].depth);
          }
          if(parts[i].partRole==='apron_rail') {
            if(parts[i].width>parts[i].depth) assert.equal(parts[i].depth,next[i].depth);
            else assert.equal(parts[i].width,next[i].width);
          }
        }
      }
      assert.deepEqual(parts,original);
    }
  });
  test(`A4-2 ${label}: repeated height steps do not drift floor or thickness`,()=>{
    const original=make();let parts=original;
    for(const step of [target.height,span(original).bottom-span(original).top,target.height]) {
      const plan=buildSmartAssemblyResizePlan(parts,{dimension:'height',newValue:step,anchor:'center'});
      assert.equal(plan.supported,true,plan.reason);
      parts=apply(parts,plan);
      assert.equal(span(parts).bottom,span(original).bottom);
      assert.equal(reviewFurnitureGeometryA3({components:parts}).geometryCandidateForReview,true);
    }
    assert.deepEqual(original,make());
  });
}

test('A4-2 standard wardrobe door and back panels meet the opening with no width gaps',()=>{
 for(const width of [1901,2000,2153]){
  const parts=wardrobe();const plan=buildSmartAssemblyResizePlan(parts,{dimension:'width',newValue:width});
  assert.equal(plan.supported,true,`width ${width}: ${plan.reason}`);
  const next=apply(parts,plan);
  const left=get(next,'WR-SL'),right=get(next,'WR-SR');
  const innerLeft=left.x+left.width,innerRight=right.x;
  for(const [L,R] of [['WR-DL','WR-DR'],['WR-BKL','WR-BKR']]){
    const l=get(next,L),r=get(next,R);
    assert.equal(l.x,innerLeft);
    assert.equal(l.x+l.width,r.x,'center seam gap');
    assert.equal(r.x+r.width,innerRight,'outer seam gap');
    assert.equal(l.depth,get(parts,L).depth);
    assert.equal(r.depth,get(parts,R).depth);
  }
  assert.equal(reviewFurnitureGeometryA3({components:next}).geometryCandidateForReview,true);
 }
});

test('A4-2 must never expose runnable changes on invalid furniture',()=>{
 const parts=dining();parts[1].y+=3;
 const result=buildSmartAssemblyResizePlan(parts,{dimension:'height',newValue:860});
 assert.equal(result.supported,false);assert.equal('changesById' in result,false);
});
test('A4-2 read-only planning preserves actual wood, finish, quantities and stable part identities',()=>{
 const parts=wardrobe().map(p=>Object.freeze({...p,material:p.partCode.startsWith('WR-D')?'Mahogany':'Pine',wood_type:'Pine',qty:1,finish:'Natural'}));
 Object.freeze(parts);
 const plan=buildSmartAssemblyResizePlan(parts,{dimension:'width',newValue:2100});
 assert.equal(plan.supported,true,plan.reason);
 const next=apply(parts,plan);
 for(let i=0;i<parts.length;i++)for(const k of ['id','partCode','groupId','assemblyId','partRole','type','material','wood_type','qty','finish'])assert.equal(next[i][k],parts[i][k]);
});

test('A4-2 cannot authorize Customer resizing or approve manufacturing',()=>{
 const report=reviewFurnitureGeometryA3({components:wardrobe()});
 assert.equal(report.resizeEligible,false);
 assert.equal(report.manufacturingApproved,false);
 assert.deepEqual(report.customerEditable,{width:false,height:false,depth:false});
});
