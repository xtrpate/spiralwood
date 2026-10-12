import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {manualWorldBoxU8,manualWorldFrameU8,manualPartFromWorldBoxU8} from '../src/utils/universalManualWorldBoundsU8.mjs';
import {proposeManualConstructionReviewU2,reviewManualConstructionDraftU2} from '../src/utils/universalManualReviewU2.mjs';
import {previewUniversalManualConstructionResize} from '../src/utils/universalManualConstructionU1.mjs';
import {getCustomerUniversalManualPreviewSupport,planCustomerUniversalManualPreviewResize} from '../src/utils/customerUniversalManualPreviewU5.mjs';
const require=createRequire(import.meta.url);
const {normalizeManualReviewForSave}=require('../../backend/services/universalManualReviewU4.js');
const {authorizeUniversalManualOrderU6}=require('../../backend/services/universalManualOrderU6.js');
const copy=v=>JSON.parse(JSON.stringify(v));
const part=(id,code,x,y,z,w,h,d,more={})=>({id,partCode:code,material:'Oak Wood',wood_type:'Oak Wood',type:'furniture_board_panel',partRole:'manual_panel',x,y,z,width:w,height:h,depth:d,qty:1,locked:false,...more});
// A representative manually built 6-board carcass, with 5-piece moving drawer.
// Coordinates reproduce the meaningful clearances and 90deg turns of the
// read-only #296 export, but use generic synthetic identities and data.
const drawer=()=>{
  const s={groupId:'assembly-test',assemblyId:'assembly-test'};
  const motion={...s,partFunction:'drawer',motionGroupId:'manual-drawer-example',motionReferencePartId:'d-side-r'};
  return [
    part('low','P-LOW',1980,2451,1040,800,18,560,s),
    part('mid','P-MID',1980,2811,1040,800,18,560,s),
    part('high','P-HIGH',1980,3140,1040,800,18,560,s),
    part('left','P-LEFT',1960,2440,1040,18,720,560,s),
    part('right','P-RIGHT',2780,2440,1040,18,720,560,s),
    part('back','P-BACK',1980,2440,1040,800,720,6,s),
    part('d-floor','D-FLOOR',2009,3111,1098,742,18,484,motion),
    part('d-side-l','D-SIDE',2011,2960,1123,18,160,474,motion),
    part('d-side-r','D-SIDE',2731,2960,1123,18,160,474,motion),
    part('d-front','D-FRONT',2371,2960,1244,18,160,712,{...motion,rotationY:90}),
    part('d-rear','D-FRONT',2371,2960,784,18,160,712,{...motion,rotationY:90}),
  ];
};
const settings=parts=>{
  const proposed=proposeManualConstructionReviewU2(parts);
  assert.equal(proposed.ok,true,JSON.stringify(proposed));
  return {rulesByPartId:proposed.proposedRules,limits:Object.fromEntries(
    ['width','height','depth'].map(a=>[a,{min:proposed.bounds[a].size,max:proposed.bounds[a].size}])),
    confirmedPartIds:parts.map(p=>p.id),pivots:{width:'min',height:'max',depth:'min'}};
};

test('U8 Y=90 world box uses center rotation and fixes false 1172 mm depth',()=>{
 const p=drawer();const world=manualWorldFrameU8(p);
 assert.equal(world.width.size,838);assert.equal(world.height.size,720);assert.equal(world.depth.size,569);
 assert.deepEqual(manualWorldBoxU8(p[9]),{minX:2024,maxX:2736,minY:2960,maxY:3120,minZ:1591,maxZ:1609});
 assert.deepEqual(manualPartFromWorldBoxU8(p[9],manualWorldBoxU8(p[9])),p[9]);
});
test('U8 geometry proposals remain unapproved and anchor rotated panel world edges',()=>{
 const p=drawer();const s=proposeManualConstructionReviewU2(p);
 assert.equal(s.bounds.depth.size,569);assert.equal(s.proposedRules['d-front'].depth.start,'max');
 const r=reviewManualConstructionDraftU2(p,settings(p));
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.cornerChecks,8);
 assert.equal(r.draftProfile.customerResizable,false);assert.equal(r.draftProfile.motionReview,'manual-drawer-world-aabb-u8');
 assert.deepEqual(previewUniversalManualConstructionResize(p,r.draftProfile,{width:838,height:720,depth:569}).parts,p);
});
test('U8 permits codes shared by identical cuts but rejects different cuts under one code',()=>{
 const a=drawer();a[6].partCode='P-MID';
 assert.equal(reviewManualConstructionDraftU2(a,settings(a)).code,'PART_CODE_CUT_MISMATCH');
 const b=drawer();b[9].partCode='D-SIDE';
 assert.equal(reviewManualConstructionDraftU2(b,settings(b)).code,'PART_CODE_CUT_MISMATCH');
});
test('U8 confirms original geometry in U5 and U6 without granting manufacturing approval',async()=>{
 const a=drawer(),s=settings(a),review=await normalizeManualReviewForSave({parts:a,
   incoming:{status:'submitted_for_review',customerResizable:false,settings:s},actorId:3,now:'2026-10-12T12:00:00Z'});
 assert.equal(review.ok,true,JSON.stringify(review));
 const auth={verified:true,previewOnly:true,sourceParts:copy(a),profile:copy(review.value.draftProfile)};
 const front=getCustomerUniversalManualPreviewSupport(auth,copy(a));
 assert.equal(front.ok,true,JSON.stringify(front));assert.equal(front.current.depth,569);
 const plan=planCustomerUniversalManualPreviewResize(auth,copy(a),'depth',569);
 assert.equal(plan.ok,true,JSON.stringify(plan));
 const item={width:838,height:720,depth:569,unit:'mm',editor_snapshot:{components:copy(a)},
    customization_snapshot:{width_mm:838,height_mm:720,depth_mm:569}};
 const server=await authorizeUniversalManualOrderU6({designData:{components:a,manualConstructionReviewU4:review.value},item});
 assert.equal(server.ok,true,JSON.stringify(server));
 assert.equal(server.applies,true);assert.equal(review.value.customerResizable,false);
 const stale=copy(a);stale[8].motionGroupId='manual-drawer-forged';
 const revoked=await normalizeManualReviewForSave({parts:stale,incoming:review.value,previous:review.value});
 assert.equal(revoked.ok,true);assert.equal(revoked.action,'invalidated');
 const forgedItem=copy(item);forgedItem.editor_snapshot.components[9].rotationY=0;
 const rejected=await authorizeUniversalManualOrderU6({designData:{components:a,manualConstructionReviewU4:review.value},item:forgedItem});
 assert.equal(rejected.ok,false);
});
test('U8 rotated panel keeps original thickness when following its world minimum edge',()=>{
 const a=[part('table','TOP',0,200,0,800,18,500),
 part('rot','SIDE',391,218,0,18,200,400,{rotationY:90})];
 const p=proposeManualConstructionReviewU2(a),s=settings(a);
 s.limits.width.max=900;
 s.rulesByPartId.table.width={start:'min',end:'max'};
 s.rulesByPartId.rot.width={start:'max',end:'max'};
 s.rulesByPartId.rot.height={start:'max',end:'max'};
 s.rulesByPartId.rot.depth={start:'min',end:'min'};
 s.rulesByPartId.table.height={start:'min',end:'min'};
 s.rulesByPartId.rot.height={start:'max',end:'max'};
 s.rulesByPartId.table.depth={start:'min',end:'max'};
 const reviewed=reviewManualConstructionDraftU2(a,s);
 assert.equal(reviewed.ok,true,JSON.stringify(reviewed));
 const pre=previewUniversalManualConstructionResize(a,reviewed.draftProfile,{width:900,height:218,depth:500});
 assert.equal(pre.ok,true,JSON.stringify(pre));
 assert.equal(pre.dimensions.width,900);assert.equal(pre.parts[1].x,491);
 assert.equal(pre.parts[1].width,18);assert.equal(pre.parts[1].depth,400);assert.equal(pre.parts[1].rotationY,90);
});
test('U8 fails closed for arbitrary rotations, moving reference tampering, and collision',()=>{
 for(const rotation of [{rotationX:30},{rotationY:47},{rotationZ:90}]){
  const a=drawer();Object.assign(a[9],rotation);
  const r=reviewManualConstructionDraftU2(a,settings(drawer()));assert.equal(r.ok,false);assert.ok(['SCENE_EMPTY','ROTATED_PART'].includes(r.code));
 }
 const invalid=drawer();invalid[10].motionReferencePartId='made-up';
 assert.equal(reviewManualConstructionDraftU2(invalid,settings(invalid)).code,'MOTION_INVALID');
 const crash=drawer();crash[6].y=3142;
 const rejected=reviewManualConstructionDraftU2(crash,settings(crash));
 assert.equal(rejected.ok,false);
});
