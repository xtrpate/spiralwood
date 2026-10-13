import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { proposeManualConstructionReviewU2, reviewManualConstructionDraftU2 } from '../src/utils/universalManualReviewU2.mjs';
import { previewUniversalManualConstructionResize } from '../src/utils/universalManualConstructionU1.mjs';
import { restoreReviewedManualCartGeometryU12 } from '../src/utils/customerReviewedManualCartEditU12.mjs';
import { getCustomerUniversalManualPreviewSupport, planCustomerUniversalManualPreviewResize } from '../src/utils/customerUniversalManualPreviewU5.mjs';
const copy = value => JSON.parse(JSON.stringify(value));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

function manualCabinet() {
  const common={assemblyId:'cabinet',groupId:'cabinet',material:'Oak Wood',wood_type:'Oak Wood',qty:1,locked:false,
    rotationX:0,rotationY:0,rotationZ:0,partFunction:'auto',doorHinge:'auto',motionGroupId:'',motionReferencePartId:''};
  const part=(id,code,role,x,y,z,width,height,depth,rest={})=>({
    ...common,id,partCode:code,partRole:role,type:`furniture_${role}`,x,y,z,width,height,depth,...rest});
  return [
    part('high','TOP-A','top_panel',1800,3140,1440,800,18,560),
    part('back','BACK','back_panel',1800,2440,1437,800,720,6),
    part('left-side','SIDE-L','bottom_panel',1441,2791,1440,720,18,560,{rotationZ:-90}),
    part('right-side','SIDE-R','bottom_panel',2240,2791,1440,720,18,560,{rotationZ:-90}),
    part('low','TOP-B','top_panel',1791,2431,1440,818,18,560),
    part('left-door','DOOR-L','back_panel',1804,2440,1997,392,720,6,{partFunction:'door',doorHinge:'left'}),
    part('right-door','DOOR-R','back_panel',2206,2440,1997,389,720,6,{partFunction:'door',doorHinge:'right'}),
  ];
}
function state() {
  const parts=manualCabinet(); const proposed=proposeManualConstructionReviewU2(parts);
  assert.equal(proposed.ok,true);
  const reviewed=reviewManualConstructionDraftU2(parts,{
    rulesByPartId:proposed.proposedRules,
    limits:{width:{min:737,max:899},height:{min:657,max:801},depth:{min:510,max:622}},
    confirmedPartIds:parts.map(p=>p.id),pivots:{width:'min',height:'max',depth:'min'},
  });
  assert.equal(reviewed.ok,true,JSON.stringify(reviewed));
  const auth={verified:true,previewOnly:true,sourceParts:parts,profile:reviewed.draftProfile};
  const target={width:850,height:750,depth:600};
  const plan=previewUniversalManualConstructionResize(parts,auth.profile,target);
  assert.equal(plan.ok,true,JSON.stringify(plan));
  return {auth,target,parts:plan.parts};
}
const rounded=items=>items.map(p=>({...p,...Object.fromEntries(['x','y','z','width','height','depth'].map(k=>[k,Math.round(p[k])]))}));

test('U12: already reviewed exact Cart snapshot round-trips without modification',()=>{
  const {auth,target,parts}=state();
  const a=restoreReviewedManualCartGeometryU12(auth,parts,target);
  assert.equal(a.ok,true,JSON.stringify(a)); assert.deepEqual(a.parts,parts);
  assert.deepEqual(a.dimensions,target);
});

test('U12: legacy 1mm-rounded Cart panels recover exact approved half-mm geometry',()=>{
  const {auth,target,parts}=state(); const old=rounded(parts);
  assert.ok(parts.some((p,i)=>p.x!==old[i].x || p.y!==old[i].y), 'needs a real half-mm repro');
  const saved=copy(old);saved[0].requested_wood_type='Mahogany';
  const result=restoreReviewedManualCartGeometryU12(auth,saved,target);
  assert.equal(result.ok,true,JSON.stringify(result));
  for(let i=0;i<parts.length;i++) for(const k of ['x','y','z','width','height','depth'])
    assert.equal(result.parts[i][k],parts[i][k],`physical ${i}/${k}`);
  assert.equal(result.parts[0].requested_wood_type,'Mahogany');
  assert.equal(result.parts.find(p=>p.id==='left-door').doorHinge,'left');
  assert.equal(result.parts.find(p=>p.id==='right-door').doorHinge,'right');
  assert.deepEqual(saved,old.map((p,i)=>i===0?{...p,requested_wood_type:'Mahogany'}:p),'no cart mutation');
});

test('U12: recovered exact Cart design regains U5 editing, including sequential W/H/D updates',()=>{
  const {auth,target,parts}=state();
  const legacy=rounded(parts);
  assert.equal(getCustomerUniversalManualPreviewSupport(auth,legacy).ok,false,
    'legacy snapped geometry must not pass U5 without verified recovery');
  const recovered=restoreReviewedManualCartGeometryU12(auth,legacy,target);
  assert.equal(recovered.ok,true);
  const support=getCustomerUniversalManualPreviewSupport(auth,recovered.parts);
  assert.equal(support.ok,true,JSON.stringify(support));
  let next=recovered.parts;
  for(const [axis,mm] of [['width',860],['height',760],['depth',610]]){
    const preview=planCustomerUniversalManualPreviewResize(auth,next,axis,mm);
    assert.equal(preview.ok,true,JSON.stringify(preview));
    next=preview.parts;
  }
  const resized=getCustomerUniversalManualPreviewSupport(auth,next);
  assert.equal(resized.ok,true,JSON.stringify(resized));
  assert.deepEqual(resized.current,{width:860,height:760,depth:610});
  assert.equal(next.find(p=>p.id==='left-door').doorHinge,'left');
  assert.equal(next.find(p=>p.id==='right-door').doorHinge,'right');
});

test('U12: fails closed for invalid, stale, or missing backend verification',()=>{
  const {auth,target,parts}=state();
  for(const a of [null,{...auth,verified:false},{...auth,previewOnly:false},
    {...auth,profile:{...auth.profile,customerResizable:true}}])
    assert.equal(restoreReviewedManualCartGeometryU12(a,parts,target).ok,false);
  assert.equal(restoreReviewedManualCartGeometryU12(auth,parts,{...target,width:900}).ok,false);
  assert.equal(restoreReviewedManualCartGeometryU12(auth,parts,{...target,height:750.5}).ok,false);
});

test('U12: no forged part count, ID, codes, hinges, wood substrate or moving groups',()=>{
  const {auth,target,parts}=state();
  const cases=[p=>p.pop(),p=>p.push(copy(p[0])),p=>p[0].partCode='INJECT',
    p=>p[5].doorHinge='right',p=>p[0].material='Other',p=>p[0].motionGroupId='evil',
    p=>p[2].rotationZ=0,p=>p[2].qty=2];
  for(const change of cases){const draft=rounded(copy(parts));change(draft);
    assert.equal(restoreReviewedManualCartGeometryU12(auth,draft,target).ok,false,JSON.stringify(draft).slice(0,130));}
});

test('U12: cannot silently repair shifted or stretched Cart geometry',()=>{
  const {auth,target,parts}=state();
  for(const [index,key,value] of [[0,'x',3],[1,'height',2],[2,'y',2],[5,'depth',1]]){
    const draft=rounded(copy(parts));draft[index][key]+=value;
    assert.equal(restoreReviewedManualCartGeometryU12(auth,draft,target).ok,false,`${index}/${key}`);
  }
});

test('U12: scoped wiring preserves verified Cart scene and unverified protected flow',()=>{
  const cart=fs.readFileSync(path.join(root,'frontend/src/pages/customer/customcartpage.jsx'),'utf8');
  const wb=fs.readFileSync(path.join(root,'frontend/src/pages/customer/CustomerTemplateWorkbench.jsx'),'utf8');
  assert.match(cart,/restoreReviewedManualCartGeometryU12\(/);
  assert.match(cart,/baseBlueprint\?\.customer_universal_manual_resize/);
  assert.match(cart,/const editComponents = restored\.ok \? restored\.parts : savedComponents/);
  assert.match(wb,/sceneData\?\.universalManualPreview\?\.verified === true/);
  assert.match(wb,/\.\.\.exactGeometry/);
  assert.match(wb,/sceneData\?\.universalManualPreview \|\| null/);
});
