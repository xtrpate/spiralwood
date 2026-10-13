import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { proposeManualConstructionReviewU2, reviewManualConstructionDraftU2 } from '../src/utils/universalManualReviewU2.mjs';
import { previewUniversalManualConstructionResize } from '../src/utils/universalManualConstructionU1.mjs';
import { manualWorldFrameU8 } from '../src/utils/universalManualWorldBoundsU8.mjs';
import { prepareReviewedManualCartSaveU13 } from '../src/utils/customerReviewedManualCartSaveU13.mjs';
const copy = value => JSON.parse(JSON.stringify(value));
const roundParts = items => items.map(p => ({...p,...Object.fromEntries(
  ['x','y','z','width','height','depth'].map(k => [k,Math.round(p[k])]))}));

// Exactly the seven physical cut dimensions, hinges and rotations used by
// Blueprint #297; explicit unique test codes instead of user-specific IDs.
function scene() {
  const common = {assemblyId:'cabinet',groupId:'cabinet',material:'Oak Wood',wood_type:'Oak Wood',qty:1,
    locked:false,rotationX:0,rotationY:0,rotationZ:0,partFunction:'auto',doorHinge:'auto',
    motionGroupId:'',motionReferencePartId:''};
  const make=(id,code,role,x,y,z,width,height,depth,rest={}) => ({...common,id,
    partCode:code,partRole:role,type:`furniture_${role}`,x,y,z,width,height,depth,...rest});
  return [
    make('high','TOP-A','top_panel',1800,3140,1440,800,18,560),
    make('back','BACK','back_panel',1800,2440,1437,800,720,6),
    make('left-side','SIDE-L','bottom_panel',1441,2791,1440,720,18,560,{rotationZ:-90}),
    make('right-side','SIDE-R','bottom_panel',2240,2791,1440,720,18,560,{rotationZ:-90}),
    make('low','TOP-B','top_panel',1791,2431,1440,818,18,560),
    make('left-door','DOOR-L','back_panel',1804,2440,1997,392,720,6,{partFunction:'door',doorHinge:'left'}),
    make('right-door','DOOR-R','back_panel',2206,2440,1997,389,720,6,{partFunction:'door',doorHinge:'right'}),
  ];
}
function verified() {
  const parts=scene(), proposal=proposeManualConstructionReviewU2(parts);
  assert.equal(proposal.ok,true,JSON.stringify(proposal));
  const review=reviewManualConstructionDraftU2(parts,{
    rulesByPartId:proposal.proposedRules,
    limits:{width:{min:737,max:899},height:{min:657,max:801},depth:{min:510,max:622}},
    confirmedPartIds:parts.map(p=>p.id),pivots:{width:'min',height:'max',depth:'min'},
  });
  assert.equal(review.ok,true,JSON.stringify(review));
  return {parts,authorization:{verified:true,previewOnly:true,sourceParts:parts,profile:review.draftProfile}};
}
function plan(parts,authorization,requested){
  const result=previewUniversalManualConstructionResize(parts,authorization.profile,requested);
  assert.equal(result.ok,true,JSON.stringify(result));return result.parts;
}
function dims(parts){const f=manualWorldFrameU8(parts);return Object.fromEntries(['width','height','depth'].map(a=>[a,f[a].size]));}

test('U13 reproduces actual #297 850x750 -> 851x751 when rounded side panel coordinates are saved',()=>{
  const {parts,authorization}=verified(), requested={width:850,height:750,depth:600};
  const exact=plan(parts,authorization,requested), snapped=roundParts(exact);
  assert.deepEqual(dims(exact),requested);
  assert.deepEqual(dims(snapped),{width:850.5,height:750.5,depth:600});
  assert.deepEqual(Object.fromEntries(Object.entries(dims(snapped)).map(([k,v])=>[k,Math.round(v)])),
    {width:851,height:751,depth:600});
});

test('U13 repairs ONLY verified reviewed half-mm geometry before Cart save, preserving customer wood and door hinges',()=>{
  const {parts,authorization}=verified(), requested={width:850,height:750,depth:600};
  const snapped=roundParts(plan(parts,authorization,requested));
  snapped[0].requested_wood_type='Acacia';snapped[2].requested_wood_type='Mahogany';
  const before=copy(snapped);
  const fixed=prepareReviewedManualCartSaveU13(authorization,snapped,requested);
  assert.equal(fixed.ok,true,JSON.stringify(fixed));assert.equal(fixed.applies,true);
  assert.deepEqual(dims(fixed.parts),requested);
  assert.equal(fixed.parts[0].requested_wood_type,'Acacia');
  assert.equal(fixed.parts[2].requested_wood_type,'Mahogany');
  assert.equal(fixed.parts.find(p=>p.id==='left-door').doorHinge,'left');
  assert.equal(fixed.parts.find(p=>p.id==='right-door').doorHinge,'right');
  assert.equal(fixed.parts.find(p=>p.id==='left-door').partFunction,'door');
  assert.equal(fixed.parts.find(p=>p.id==='right-door').partFunction,'door');
  assert.deepEqual(snapped,before,'incoming Cart draft must not mutate');
});

test('U13 preserves exact valid geometry unchanged for 899x800x566 and re-edited 850x750x600',()=>{
  const {parts,authorization}=verified();
  for(const requested of [{width:899,height:800,depth:566},{width:850,height:750,depth:600}]){
    const exact=plan(parts,authorization,requested);
    const fixed=prepareReviewedManualCartSaveU13(authorization,exact,requested);
    assert.equal(fixed.ok,true,JSON.stringify(fixed));
    assert.deepEqual(fixed.parts,exact);
    assert.deepEqual(dims(fixed.parts),requested);
  }
});

test('U13 rejects tampered parts, mismatched requested dimensions, and outside-reviewed ranges',()=>{
  const {parts,authorization}=verified(), requested={width:850,height:750,depth:600};
  const baseline=plan(parts,authorization,requested);
  for(const change of [
    p=>p[0].x+=3,
    p=>p[5].doorHinge='right',
    p=>p[0].material='Other wood',
    p=>p.pop(),
    p=>p[2].height=30,
  ]){
    const candidate=copy(baseline);change(candidate);
    const fixed=prepareReviewedManualCartSaveU13(authorization,candidate,requested);
    assert.equal(fixed.ok,false,JSON.stringify(candidate).slice(0,100));
  }
  assert.equal(prepareReviewedManualCartSaveU13(authorization,baseline,{...requested,width:851}).ok,false);
  assert.equal(prepareReviewedManualCartSaveU13(authorization,baseline,{...requested,height:802}).ok,false);
});

test('U13 never grants manual review to missing or unverified authorization',()=>{
  const parts=scene();
  for(const authorization of [null,{}, {verified:false}]){
    const result=prepareReviewedManualCartSaveU13(authorization,parts,{width:850,height:750,depth:600});
    assert.equal(result.ok,true);assert.equal(result.applies,false);assert.equal(result.parts,parts);
  }
});

test('U13 guarded Cart wiring saves exact reviewed parts without touching unrelated order paths',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const source=fs.readFileSync(path.join(root,'frontend/src/pages/customer/customcartpage.jsx'),'utf8');
  assert.match(source,/prepareReviewedManualCartSaveU13\(/);
  assert.match(source,/editBlueprint\?\.customer_universal_manual_resize/);
  assert.match(source,/if \(!reviewedSave\.ok\) throw new Error\(reviewedSave\.error\)/);
  assert.match(source,/const finalComponents = reviewedSave\.parts/);
  assert.match(source,/components: finalComponents/);
  assert.match(source,/setCustomCart\(\(current\) =>/);
});
