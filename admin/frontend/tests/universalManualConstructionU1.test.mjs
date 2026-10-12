import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNIVERSAL_MANUAL_CONSTRUCTION_VERSION,
  createUniversalManualConstructionDraft as make,
  inspectUniversalManualConstructionDraft as inspect,
  previewUniversalManualConstructionResize as plan,
} from '../src/utils/universalManualConstructionU1.mjs';

const clone=o=>JSON.parse(JSON.stringify(o));
const F=(fraction)=>({basis:'fraction',fraction});
const rule=(start,end)=>({start,end});
const fixedMin=()=>rule('min','min');
const fixedMax=()=>rule('max','max');
const span=()=>rule('min','max');
const middle=()=>rule(F(.5),F(.5));
const box=(code,type,role,x,y,z,width,height,depth)=>({
  id:`part-${code}`,partCode:code,type,partRole:role,material:'Pine',wood_type:'Pine',
  x,y,z,width,height,depth,rotationX:0,rotationY:0,rotationZ:0,qty:1,locked:false,
  finish:'clear',customNote:'kept',
});
const rulesFrom=(components, perPart)=>Object.fromEntries(components.map(p=>[p.id,perPart(p)]));
const limits=(w,h,d)=>({width:{min:Math.max(300,w-150),max:w+200},height:{min:Math.max(300,h-100),max:h+100},depth:{min:Math.max(300,d-100),max:d+150}});
const BOUNDS=(p,axis)=>{
 const k={width:'x',height:'y',depth:'z'}[axis];
 return [Math.min(...p.map(v=>v[k])),Math.max(...p.map(v=>v[k]+v[axis]))];
};

function makeTable() {
 const original=[box('X-TOP','arbitrary_flat_slab','deck',0,0,0,800,18,996)];
 for(const x of [40,740])for(const z of [60,900])original.push(box(`X-LEG-${x}-${z}`,'arbitrary_straight_support','post',x,9,z,40,700,40));
 const rules=rulesFrom(original,p=>p.partRole==='deck'
  ? {width:span(),height:fixedMin(),depth:span()}
  : {width:p.x>400?fixedMax():fixedMin(),height:span(),depth:p.z>450?fixedMax():fixedMin()});
 return {original,rules,dim:limits(800,709,996)};
}
function makeCase({doors=false}={}) {
 const original=[
  box('C-L','generic_board','side',0,0,0,18,750,450),
  box('C-R','generic_board','side',782,0,0,18,750,450),
  box('C-T','generic_board','top',18,0,0,764,18,450),
  box('C-B','generic_board','bottom',18,732,0,764,18,450),
  box('C-S','generic_board','shelf',18,360,0,764,18,432),
  box('C-BK','generic_board','back',18,18,432,764,714,18),
 ];
 if(doors){
  original.push(box('C-DL','generic_board','door-left',0,18,-18,399,714,18));
  original.push(box('C-DR','generic_board','door-right',401,18,-18,399,714,18));
 }
 const rules=rulesFrom(original,p=>{
  const r=p.partRole;
  if(r==='side')return {width:p.x===0?fixedMin():fixedMax(),height:span(),depth:span()};
  if(r==='top')return {width:span(),height:fixedMin(),depth:span()};
  if(r==='bottom')return {width:span(),height:fixedMax(),depth:span()};
  if(r==='shelf')return {width:span(),height:middle(),depth:span()};
  if(r==='back')return {width:span(),height:span(),depth:fixedMax()};
  if(r==='door-left')return {width:rule('min',F(.5)),height:span(),depth:fixedMin()};
  if(r==='door-right')return {width:rule(F(.5),'max'),height:span(),depth:fixedMin()};
  throw Error('unmapped');
 });
 return {original,rules,dim:limits(800,750,doors?468:450)};
}
function makeBedOrChair(family) {
 const chair=family==='chair';
 const w=chair?500:900, d=chair?500:1800, topTh=chair?24:40;
 const original=[box(`${family}-PLATFORM`,`manual_${family}_platform`,'surface',0,0,0,w,topTh,d)];
 for(const x of [40,w-80])for(const z of [40,d-80])original.push(box(`${family}-POST-${x}-${z}`,'custom_frame_part','support',x,topTh/2,z,40,650,40));
 original.push(box(`${family}-BACK`,'custom_upright_panel','backrest',0,-400,0,w,400,30));
 const floor=topTh/2+650;const height=floor+400;
 const rules=rulesFrom(original,p=>p.partRole==='backrest'
  ? {width:span(),height:rule('min','max'),depth:fixedMin()}
  : p.partRole==='surface'
    ? {width:span(),height:fixedMax(),depth:span()}
    : {width:p.x>200?fixedMax():fixedMin(),height:fixedMax(),depth:p.z>d/2?fixedMax():fixedMin()});
 return {original,rules,dim:limits(w,height,d)};
}
function compile(scene){return make(scene.original,{rulesByPartId:scene.rules,allowedDimensions:scene.dim})}

for(const [name,fixture] of [
 ['new manual table',()=>makeTable()],
 ['six-part open bookshelf',()=>makeCase()],
 ['cabinet with pair doors',()=>makeCase({doors:true})],
 ['bed with headboard',()=>makeBedOrChair('bed')],
 ['chair with seat/back',()=>makeBedOrChair('chair')],
]) {
 test(`U1 ${name}: family-neutral explicit frame compiles as UNAPPROVED only`,()=>{
  const scene=fixture(),result=compile(scene);
  assert.ok(result.ok,JSON.stringify(result));
  assert.equal(result.profile.schemaVersion,UNIVERSAL_MANUAL_CONSTRUCTION_VERSION);
  assert.equal(result.profile.status,'draft');
  assert.equal(result.profile.customerResizable,false);
  assert.equal(result.profile.approval,'not_reviewed');
  assert.ok(inspect(scene.original,result.profile).ok);
 });
 test(`U1 ${name}: W/H/D preview is drift-free and preserves saved part metadata`,()=>{
  const scene=fixture(),before=JSON.stringify(scene.original),profile=compile(scene).profile;
  const target={
   width:scene.dim.width.max-30,
   height:scene.dim.height.max-20,
   depth:scene.dim.depth.max-40,
  };
  const result=plan(scene.original,profile,target);
  assert.ok(result.ok,JSON.stringify(result));
  assert.equal(result.customerResizable,false);
  assert.equal(result.previewOnly,true);
  for(const [key,val] of Object.entries(target)) {
   const b=BOUNDS(result.parts,key);
   assert.ok(Math.abs(b[1]-b[0]-val)<.1,`${name} ${key}: ${b}`);
  }
  assert.deepEqual(result.parts.map(p=>p.id),scene.original.map(p=>p.id));
  assert.deepEqual(result.parts.map(p=>p.material),scene.original.map(p=>p.material));
  assert.deepEqual(result.parts.map(p=>p.finish),scene.original.map(p=>p.finish));
  assert.deepEqual(result.parts.map(p=>p.customNote),scene.original.map(p=>p.customNote));
  assert.equal(JSON.stringify(scene.original),before);
  const second=plan(scene.original,profile,{height:target.height,width:target.width,depth:target.depth});
  assert.ok(second.ok,JSON.stringify(second));
  assert.deepEqual(second.parts,result.parts);
  const serial=JSON.parse(JSON.stringify(profile));
  assert.deepEqual(plan(scene.original,serial,target).parts,result.parts);
 });
}

test('U1 manual table keeps same physical floor while top rises on height change',()=>{
 const s=makeTable(),p=compile(s).profile;
 const r=plan(s.original,p,{height:760});assert.ok(r.ok,r.error);
 assert.equal(Math.max(...r.parts.map(v=>v.y+v.height)),709);
 assert.equal(Math.min(...r.parts.map(v=>v.y)),-51);
 assert.equal(r.parts[0].height,18);
 assert.ok(r.parts.slice(1).every(v=>v.width===40&&v.depth===40));
});
test('U1 cabinet double doors preserve 2mm central gap and panel thickness',()=>{
 const s=makeCase({doors:true}),p=compile(s).profile;
 const r=plan(s.original,p,{width:920,height:800,depth:520});assert.ok(r.ok,r.error);
 const a=r.parts.find(v=>v.partRole==='door-left');const b=r.parts.find(v=>v.partRole==='door-right');
 assert.ok(Math.abs(b.x-a.x-a.width-2)<.05);
 assert.equal(a.depth,18);assert.equal(b.depth,18);
 assert.equal(r.parts.find(v=>v.partRole==='shelf').height,18);
 assert.equal(r.parts.find(v=>v.partRole==='back').depth,18);
});
test('U1 requires complete explicit per-part relation and ranges',()=>{
 const s=makeTable();
 assert.equal(make(s.original,{rulesByPartId:{},allowedDimensions:s.dim}).code,'UNKNOWN_RULE');
 const noDepth=clone(s.rules);delete noDepth[s.original[0].id].depth;
 assert.equal(make(s.original,{rulesByPartId:noDepth,allowedDimensions:s.dim}).code,'MISSING_RULES');
 const invalid=clone(s.rules);invalid[s.original[0].id].width.start={basis:'fraction',fraction:1.5};
 assert.equal(make(s.original,{rulesByPartId:invalid,allowedDimensions:s.dim}).code,'INVALID_ANCHOR');
 assert.equal(make(s.original,{rulesByPartId:s.rules,allowedDimensions:{}}).code,'INVALID_LIMITS');
 const foreign=clone(s.rules);foreign.not_a_part={width:span(),height:span(),depth:span()};
 assert.equal(make(s.original,{rulesByPartId:foreign,allowedDimensions:s.dim}).code,'UNKNOWN_RULE');
});
test('U1 refuses float targets, out-of-range changes, malformed pivot and unknown axis',()=>{
 const s=makeCase(),p=compile(s).profile;
 for(const arg of [{width:3},{width:800.5},{height:NaN},{depth:Infinity},{bogus:600}])assert.equal(plan(s.original,p,arg).ok,false);
 const altered=clone(p);altered.framePivots.height='upsidedown';
 assert.equal(plan(s.original,altered,{height:780}).ok,false);
});
test('U1 rejects source drift, missing/new part, rotated/locked and fake approval',()=>{
 const s=makeTable(),p=compile(s).profile;
 for(const mutation of [
   parts=>{parts[0].width+=1}, parts=>{parts[0].partCode='changed'},
   parts=>{parts.pop()}, parts=>{parts[0].rotationY=25},
   parts=>{parts[1].locked=true},parts=>{parts[0].qty=2},
 ]) {const c=clone(s.original);mutation(c);assert.equal(plan(c,p,{width:900}).ok,false);}
 const fake=clone(p);fake.status='approved';fake.customerResizable=true;
 assert.equal(plan(s.original,fake,{width:900}).code,'NOT_DRAFT');
});
test('U1 rejects disconnected parts rather than guessing assembly joints',()=>{
 const s=makeTable();s.original[3].x+=3000;s.dim.width.max=4000;
 assert.equal(compile(s).code,'DISCONNECTED_CONSTRUCTION');
});
test('U1 refuses misaligned overall boundary from a bad edge-rule choice',()=>{
 const s=makeTable();
 // Bad Admin rule shifts the tabletop right while the left posts remain fixed.
 const tabletop=s.original.find(p=>p.partRole==='deck');
 s.rules[tabletop.id].width=fixedMax();
 const p=compile(s).profile;assert.ok(p);
 const result=plan(s.original,p,{width:1000});
 assert.ok(['BOUNDARY_MISMATCH','CONTACT_CHANGED','CONNECTION_LOST'].includes(result.code),JSON.stringify(result));
});
test('U1 rejects collapsed panels if changes exceed valid part geometry',()=>{
 const s=makeCase();
 // Thin left side (18mm) collapses if its near edge follows max and its far edge min.
 s.rules[s.original.find(p=>p.partRole==='side'&&p.x===0).id].width=rule('max','min');
 const p=compile(s).profile;assert.ok(p);
 assert.equal(plan(s.original,p,{width:950}).code,'INVALID_RESULT');
});
test('U1 original scenes remain unchanged on every unsuccessful preview',()=>{
 const s=makeTable(),p=compile(s).profile,str=JSON.stringify(s.original);
 assert.equal(plan(s.original,p,{width:100000}).ok,false);
 assert.equal(JSON.stringify(s.original),str);
});
