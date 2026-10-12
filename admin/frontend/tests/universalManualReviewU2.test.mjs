import test from 'node:test';
import assert from 'node:assert/strict';
import {
  U2_REVIEW_VERSION,
  manualReviewBoundsU2,
  proposeManualConstructionReviewU2 as propose,
  ruleChoiceToAnchorU2,
  reviewManualConstructionDraftU2 as review,
} from '../src/utils/universalManualReviewU2.mjs';
import {previewUniversalManualConstructionResize} from '../src/utils/universalManualConstructionU1.mjs';

const clone=v=>JSON.parse(JSON.stringify(v));
const p=(id,role,x,y,z,width,height,depth)=>({id,partCode:id,type:`manual_${role}_part`,partRole:role,material:'Pine',wood_type:'Pine',x,y,z,width,height,depth,qty:1,locked:false,finish:'clear',notes:'unchanged'});
const table=(width=800,depth=996,x=0,y=0,z=0)=>[
 p('TABLE-TOP','top',x,y,z,width,18,depth),
 p('TABLE-LEG-1','leg',x+40,y+9,z+60,40,700,40),
 p('TABLE-LEG-2','leg',x+width-60,y+9,z+60,40,700,40),
 p('TABLE-LEG-3','leg',x+40,y+9,z+depth-96,40,700,40),
 p('TABLE-LEG-4','leg',x+width-60,y+9,z+depth-96,40,700,40),
];
const cabinet=(withDoors=false)=>{
 const a=[p('CAB-L','side',0,0,0,18,750,450),p('CAB-R','side',782,0,0,18,750,450),p('CAB-T','top',18,0,0,764,18,450),p('CAB-B','bottom',18,732,0,764,18,450),p('CAB-S','shelf',18,360,0,764,18,432),p('CAB-BK','back',18,18,432,764,714,18)];
 if(withDoors)a.push(p('CAB-DL','door',0,18,-18,399,714,18),p('CAB-DR','door',401,18,-18,399,714,18));
 return a;
};
const confirmed=parts=>parts.map(p=>p.id);
const prepared=parts=>{const a=propose(parts);return {a,rulesByPartId:a.proposedRules,limits:a.suggestedLimits,confirmedPartIds:confirmed(parts)};};

test('U2 family-neutral manual table from five independent parts (new ID, not a Blueprint special case)',()=>{
 const parts=table(),before=JSON.stringify(parts),s=prepared(parts);
 const r=review(parts,s);assert.ok(r.ok,JSON.stringify(r));
 assert.equal(r.cornerChecks,8);assert.equal(r.partCount,5);
 assert.equal(r.draftProfile.customerResizable,false);
 assert.equal(r.draftProfile.approval,'not_reviewed');
 assert.equal(JSON.stringify(parts),before);
 const future=previewUniversalManualConstructionResize(parts,r.draftProfile,{width:870,height:760,depth:1050});
 assert.ok(future.ok,future.error);
 assert.equal(future.parts[0].height,18);
 assert.ok(future.parts.slice(1).every(p=>p.width===40&&p.depth===40));
});
test('U2 same proposals are origin and unique-ID independent',()=>{
 const parts=table(920,1060,1511,201,-850).map((v,i)=>({...v,id:`fresh-${i}`,partCode:`MAN-${i}`}));
 const r=review(parts,prepared(parts));assert.ok(r.ok,r.error);
});
test('U2 panel carcass with shelf creates geometry-only review draft',()=>{
 const parts=cabinet(),r=review(parts,prepared(parts));assert.ok(r.ok,r.error);
 assert.equal(r.customerResizable,false);
 const s=previewUniversalManualConstructionResize(parts,r.draftProfile,{width:850,height:790,depth:460});
 assert.ok(s.ok,s.error);
});
test('U2 independent manual double doors preserve geometry for reviewed rules',()=>{
 const parts=cabinet(true),data=prepared(parts);
 const r=review(parts,data);
 assert.ok(r.ok,r.error);
 const next=previewUniversalManualConstructionResize(parts,r.draftProfile,{width:880,height:795,depth:500});
 assert.ok(next.ok,next.error);
 const l=next.parts.find(v=>v.id==='CAB-DL'),rr=next.parts.find(v=>v.id==='CAB-DR');
 assert.ok(Math.abs(rr.x-l.x-l.width-2)<0.01);
 assert.equal(l.depth,18);assert.equal(rr.depth,18);
});
test('U2 suggestions alone never count as Admin confirmation',()=>{
 const parts=table(),s=prepared(parts);
 let r=review(parts,{...s,confirmedPartIds:[]});assert.equal(r.code,'REVIEW_INCOMPLETE');
 r=review(parts,{...s,confirmedPartIds:confirmed(parts).slice(1)});assert.equal(r.code,'REVIEW_INCOMPLETE');
});
test('U2 protects draft against invalid per-part or axis choices',()=>{
 const parts=table(),s=prepared(parts);const broken=clone(s.rulesByPartId);
 broken[parts[0].id].width.start='unknown';assert.equal(review(parts,{...s,rulesByPartId:broken}).code,'UNKNOWN_ANCHOR');
 delete broken[parts[0].id].depth;assert.equal(review(parts,{...s,rulesByPartId:broken}).code,'RULES_INCOMPLETE');
});
test('U2 ranges are checked as explicit integers and include original size',()=>{
 const parts=table(),s=prepared(parts);
 for(const faulty of [{width:{min:100,max:200}}, {width:{min:800,max:800.5}}, {height:{min:1000,max:1300}}]){
   const limits={...s.limits,...faulty};assert.equal(review(parts,{...s,limits}).code,'INVALID_LIMITS');
 }
});
test('U2 individual selected edge rules can reject contact loss even after confirmation',()=>{
 const parts=table(),s=prepared(parts);const broken=clone(s.rulesByPartId);
 broken['TABLE-TOP'].width={start:'max',end:'max'};
 const r=review(parts,{...s,rulesByPartId:broken});
 assert.equal(r.ok,false);assert.equal(r.code,'PREVIEW_REJECTED');
});
test('U2 disallows detached, rotated or locked manual parts and cannot grant permission',()=>{
 for(const mutation of [a=>a[2].z+=5000,a=>a[0].rotationX=30,a=>a[0].locked=true]) {
   const parts=table();mutation(parts);const q=propose(parts);const r=review(parts,{rulesByPartId:q.proposedRules,limits:q.suggestedLimits,confirmedPartIds:confirmed(parts)});
   assert.equal(r.ok,false);
 }
});
test('U2 real editor reference proxy is ignored, but cannot be used as resize part',()=>{
 const parts=[...table(),{id:'ref',type:'reference_proxy',width:999,height:999,depth:999,x:0,y:0,z:0}];
 const s=propose(parts);assert.equal(s.ok,true);assert.equal(s.parts.length,5);
 const r=review(parts,{rulesByPartId:s.proposedRules,limits:s.suggestedLimits,confirmedPartIds:confirmed(s.parts)});assert.ok(r.ok,r.error);
});
test('U2 rejected inputs never mutate the editor scene',()=>{
 const parts=table(),before=JSON.stringify(parts),s=prepared(parts);s.limits.height.min='oops';
 assert.equal(review(parts,s).ok,false);assert.equal(JSON.stringify(parts),before);
});
test('U2 rules use exactly U1-known frame anchors',()=>{
 assert.equal(ruleChoiceToAnchorU2('min'),'min');assert.equal(ruleChoiceToAnchorU2('max'),'max');
 assert.deepEqual(ruleChoiceToAnchorU2('center'),{basis:'fraction',fraction:.5});
 assert.deepEqual(ruleChoiceToAnchorU2('quarter'),{basis:'fraction',fraction:.25});
 assert.deepEqual(ruleChoiceToAnchorU2('three-quarter'),{basis:'fraction',fraction:.75});
 assert.equal(ruleChoiceToAnchorU2('other'),null);
});
test('U2 bounds and version do not depend on furniture names',()=>{
 const scene=table(),bounds=manualReviewBoundsU2(scene);
 assert.equal(bounds.width.size,800);assert.equal(bounds.height.size,709);assert.equal(bounds.depth.size,996);
 assert.equal(propose(scene).version,U2_REVIEW_VERSION);
});
