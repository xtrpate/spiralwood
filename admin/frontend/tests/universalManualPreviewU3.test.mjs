import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planUniversalManualAdminPreviewU3 as preview} from '../src/utils/universalManualPreviewU3.mjs';
import {proposeManualConstructionReviewU2 as propose} from '../src/utils/universalManualReviewU2.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const part=(id,x,y,z,width,height,depth,role)=>({id,partCode:`MAN-${id}`,type:`manual_${role}`,partRole:role,material:'Oak Wood',wood_type:'Oak Wood',x,y,z,width,height,depth,qty:1,locked:false,notes:'intact',finish:'wax'});
const table=()=>[
  part('top',0,0,0,800,18,996,'top'),
  part('leg1',40,9,50,40,700,40,'leg'),
  part('leg2',720,9,50,40,700,40,'leg'),
  part('leg3',40,9,886,40,700,40,'leg'),
  part('leg4',720,9,886,40,700,40,'leg'),
];
const cabinet=()=>[
  part('left',0,0,0,18,750,450,'side'),
  part('right',782,0,0,18,750,450,'side'),
  part('top',18,0,0,764,18,450,'top'),
  part('bottom',18,732,0,764,18,450,'bottom'),
  part('shelf',18,360,0,764,18,432,'shelf'),
  part('back',18,18,432,764,714,18,'back'),
];
const review=components=>{const p=propose(components);return {rulesByPartId:p.proposedRules,limits:p.suggestedLimits,confirmedPartIds:components.map(c=>c.id),pivots:{width:'min',height:'max',depth:'min'}};};

test('U3 manual table new IDs, Width/Height/Depth preview is nonpersistent',()=>{
  const parts=table(),before=JSON.stringify(parts),q=preview(parts,review(parts),{width:850,height:760,depth:1070});
  assert.equal(q.ok,true,q.error);assert.equal(q.parts.length,5);
  assert.deepEqual(q.dimensions,{width:850,height:760,depth:1070});
  assert.equal(q.customerResizable,false);assert.equal(q.previewOnly,true);
  assert.equal(JSON.stringify(parts),before);assert.notEqual(q.parts[0],parts[0]);
  assert.equal(q.parts[0].height,18);assert.ok(q.parts.slice(1).every(x=>x.width===40&&x.depth===40));
  assert.ok(q.parts.every((x,i)=>x.id===parts[i].id&&x.material===parts[i].material&&x.qty===parts[i].qty));
});
test('U3 cabinet with shelf uses exactly the same generic engine',()=>{
  const parts=cabinet(),q=preview(parts,review(parts),{width:840,height:795,depth:470});
  assert.equal(q.ok,true,q.error);assert.equal(q.parts[2].height,18);
  assert.deepEqual(q.dimensions,{width:840,height:795,depth:470});
});
test('U3 baseline preview creates a new scene even without dimension change',()=>{
  const parts=table(),q=preview(parts,review(parts),{width:800,height:709,depth:996});
  assert.equal(q.ok,true,q.error);assert.deepEqual(q.parts,parts);assert.notEqual(q.parts[0],parts[0]);
});
test('U3 not approved when confirmations are incomplete',()=>{
  const parts=table(),data=review(parts);data.confirmedPartIds=[];
  const q=preview(parts,data,{width:800,height:709,depth:996});
  assert.equal(q.ok,false);assert.equal(q.code,'REVIEW_INCOMPLETE');
});
test('U3 rejects invalid/unknown/out-of-range targets with no mutation',()=>{
  const parts=table(),r=review(parts),original=JSON.stringify(parts);
  const bad=[{width:'850',height:709,depth:996},{width:800.5,height:709,depth:996},{width:100000,height:709,depth:996},{width:800,height:709,depth:996,other:99},{width:800,height:709},{width:null,height:709,depth:996}];
  for(const target of bad){const q=preview(parts,r,target);assert.equal(q.ok,false,JSON.stringify(target));assert.equal(q.customerResizable,false);}
  assert.equal(JSON.stringify(parts),original);
});
test('U3 rejects locked, detached, structurally drifted, or invalid-scene originals',()=>{
  for(const mutate of [a=>a[2].locked=true,a=>a[3].x+=9999,a=>a[0].rotationY=30,a=>a.push({...a[0],id:'new',partCode:'NEW'})]){
    const parts=table(),settings=review(parts);mutate(parts);
    const q=preview(parts,settings,{width:800,height:709,depth:996});assert.equal(q.ok,false);
  }
});
test('U3 changed rule must be re-reviewed instead of using old passing result',()=>{
  const parts=table(),s=review(parts);s.rulesByPartId[parts[0].id].width={start:'max',end:'max'};
  const q=preview(parts,s,{width:850,height:760,depth:1070});assert.equal(q.ok,false);
});
test('U3 source requires temporary Admin-only 3D scene and hard exit barrier',()=>{
  const design=fs.readFileSync(path.join(root,'admin/frontend/src/pages/blueprints/BlueprintDesign.jsx'),'utf8');
  const modal=fs.readFileSync(path.join(root,'admin/frontend/src/pages/blueprints/components/ManualConstructionReviewU2.jsx'),'utf8');
  assert.ok(design.includes('components={manualPreview3D?.parts ?? components}'));
  assert.ok(design.includes('pointerEvents: "auto"') && design.includes('manualPreview3D && view === "3d"'));
  assert.ok(design.includes('setManualPreview3D(null)'));
  assert.ok(modal.includes('planUniversalManualAdminPreviewU3') && modal.includes('onShowPreview({ parts:planned.parts'));
  assert.ok(modal.includes('setOpen(false)') && modal.includes('Preview Resized Furniture'));
  assert.ok(!design.includes('setComponents(manualPreview3D'));
});
