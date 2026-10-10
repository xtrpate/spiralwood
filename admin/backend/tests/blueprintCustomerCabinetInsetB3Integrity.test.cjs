'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const utilPath = path.resolve(__dirname, '../../frontend/src/utils/customerCabinetInsetFit.js');
const viewerPath = path.resolve(__dirname, '../../frontend/src/pages/customer/customer3dviewer.jsx');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'blueprintCustomerCabinetInsetB3Fixture.json'), 'utf8')).parts;
let api;
const load = async () => api ||= await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(utilPath)).toString('base64'));
const clone = x => structuredClone(x);
const get = (parts,code) => parts.find(p => p.partCode===code);
const bounds = parts => ({
 width: Math.max(...parts.map(p=>p.x+p.width))-Math.min(...parts.map(p=>p.x)),
 height: Math.max(...parts.map(p=>p.y+p.height))-Math.min(...parts.map(p=>p.y)),
 depth: Math.max(...parts.map(p=>p.z+p.depth))-Math.min(...parts.map(p=>p.z)),
});
const overlaps = (a,b) => ['x','y','z'].every((axis,index)=>{
 const dim=['width','height','depth'][index];
 return Math.max(a[axis],b[axis]) < Math.min(a[axis]+a[dim],b[axis]+b[dim]);
});
const doorCollisions = parts => {
 const doors=parts.filter(p=>p.partCode.startsWith('CAB-DOOR-'));
 return doors.flatMap(door=>parts.filter(part=>door!==part&&overlaps(door,part)).map(p=>[door.partCode,p.partCode]));
};

test('baseline is exact 10-part Cabinet #271 and collisions are reproducible',async()=>{
 const {getCustomerCabinetInsetFitSupport:support}=await load();
 assert.equal(support(fixture).ok,true);
 assert.equal(support(fixture).needsCorrection,true);
 assert.deepEqual(bounds(fixture),{width:900,height:876,depth:620});
 assert.equal(doorCollisions(fixture).length,6);
 assert.equal(get(fixture,'CAB-DOOR-L').height,820);
 assert.equal(get(fixture,'CAB-DOOR-R').height,820);
});

test('one explicit inset-fit correction preserves 10 IDs/finishes/thickness and outer dimensions',async()=>{
 const {planCustomerCabinetInsetFit:plan, getCustomerCabinetInsetFitSupport:support}=await load();
 const original=clone(fixture);
 const next=plan(fixture);
 assert.equal(next.ok,true,next.error);
 assert.deepEqual(bounds(next.parts),bounds(fixture));
 assert.equal(doorCollisions(next.parts).length,0);
 assert.equal(get(next.parts,'CAB-DOOR-L').height,734);
 assert.equal(get(next.parts,'CAB-DOOR-R').y,2305);
 for(const code of ['CB-SIDE-L','CB-SIDE-R','CB-TOP','CB-BOT'])
   assert.equal(get(next.parts,code).depth,620);
 for(const code of ['CB-SH-01','CB-SH-02']){
   assert.equal(get(next.parts,code).depth,578);
   assert.equal(get(next.parts,code).height,20);
 }
 assert.equal(get(next.parts,'CB-BACK').depth,6);
 assert.equal(get(next.parts,'CB-TOE-KICK').height,100);
 assert.equal(get(next.parts,'CAB-DOOR-L').width,415);
 assert.equal(get(next.parts,'CAB-DOOR-R').width,415);
 next.parts.forEach((p,i)=>{
   for(const k of ['id','partCode','partRole','type','material','woodFinish','finish','finish_id','finish_color','assemblyRole'])
     assert.equal(p[k],fixture[i][k],`${p.partCode}.${k} changed`);
 });
 assert.deepEqual(fixture,original,'the original input must never mutate');
 assert.equal(support(next.parts).ok,true);
 assert.equal(support(next.parts).needsCorrection,false);
 assert.equal(plan(next.parts).ok,false,'do not silently apply a second correction');
});

test('live browser Cabinet #271 blank partRole layout is accepted ONLY at exact geometry',async()=>{
 const {getCustomerCabinetInsetFitSupport:support,planCustomerCabinetInsetFit:plan}=await load();
 const browserParts=clone(fixture).map(p=>({...p,partRole:''}));
 assert.equal(browserParts.length,10);
 assert.equal(support(browserParts).ok,true,'live 10-part geometry should be recognized');
 assert.equal(support(browserParts).needsCorrection,true);
 const next=plan(browserParts);
 assert.equal(next.ok,true,next.error);
 assert.equal(next.parts.length,10);
 assert.equal(support(next.parts).ok,true);
 assert.equal(support(next.parts).needsCorrection,false);
 assert.equal(doorCollisions(next.parts).length,0);
 assert.deepEqual(bounds(next.parts),{width:900,height:876,depth:620});
 next.parts.forEach((p,i)=>{
   assert.equal(p.id,browserParts[i].id);
   assert.equal(p.partRole,'','customer metadata must not be manufactured');
   assert.equal(p.type,browserParts[i].type);
   assert.equal(p.finish,browserParts[i].finish);
 });
 const invalid=[];
 const alter=(fn)=>{const p=clone(browserParts);fn(p);invalid.push(p)};
 alter(p=>p[0].partRole='left_side_panel'); // mixed role modes: reject
 alter(p=>p[0].partRole='wrong_role'); // unexpected role: reject
 alter(p=>p[0].depth=611);
 alter(p=>p[6].height=21);
 alter(p=>p[8].rotationY=1);
 alter(p=>p[8].partCode='CAB-DOOR-UNKNOWN');
 alter(p=>p[8].type='wr_shelf');
 alter(p=>p[8].id=p[9].id);
 alter(p=>p.pop());
 for(const parts of invalid){
   assert.equal(support(parts).ok,false,'unknown / mutated live parts must be blocked');
   assert.equal(plan(parts).ok,false);
 }
});

test('incorrect or unverified cabinet fixtures fail closed',async()=>{
 const {getCustomerCabinetInsetFitSupport:support,planCustomerCabinetInsetFit:plan}=await load();
 const variants=[];
 variants.push(fixture.slice(1));
 variants.push([...fixture, {...fixture[0],id:'new-extra',partCode:'EXTRA'}]);
 const mutated=(change)=>{const p=clone(fixture);change(p);variants.push(p);};
 mutated(p=>p[0].width=21);
 mutated(p=>p[0].depth=615);
 mutated(p=>p[8].height=819);
 mutated(p=>p[7].z=181);
 mutated(p=>p[8].rotationY=90);
 mutated(p=>p[9].partCode=p[8].partCode);
 mutated(p=>p[9].id=p[8].id);
 mutated(p=>p[6].partRole='left_side_panel');
 mutated(p=>p[8].type='drawer_front_panel');
 mutated(p=>p[9].y=2305);
 mutated(p=>p[8].height=734);
 for(const v of variants){
   assert.equal(support(v).ok,false,'damaged fixture passed support check');
   assert.equal(plan(v).ok,false,'damaged fixture was transformed');
 }
});

test('bookshelf, wardrobe, unrelated product layouts are untouched by inset correction',async()=>{
 const {getCustomerCabinetInsetFitSupport:support,planCustomerCabinetInsetFit:plan}=await load();
 const otherFixture=JSON.parse(fs.readFileSync(path.join(__dirname,'blueprintCustomerBookshelfB2Fixture.json'),'utf8'));
 for(const parts of [otherFixture.parts,Array.from({length:43},(_,i)=>({id:String(i),partCode:`WR-${i}`,width:18,height:100,depth:600,x:i,y:0,z:0})), []]){
   const before=clone(parts);
   assert.equal(support(parts).ok,false);
   assert.equal(plan(parts).ok,false);
   assert.deepEqual(parts,before);
 }
});

test('Admin owns inset-fit corrections; customer viewer preserves B2, door preview and finishes',()=>{
  const viewer=fs.readFileSync(viewerPath,'utf8');
  // Inset-fit construction correction must never run from Customer Customize.
  for(const token of [
    'Apply Inset Fit',
    'cabinetInsetFitSupport',
    'applyCabinetInsetFit',
    'getCustomerCabinetInsetFitSupport',
    'planCustomerCabinetInsetFit',
    'customerCabinetInsetFit',
    'Provisional inset fit applied',
  ]) {
    assert.equal(viewer.includes(token), false, `Customer viewer still exposes ${token}`);
  }
  assert.match(viewer,/getCustomerBookshelfResizeSupport\(components\)/);
  assert.match(viewer,/planCustomerBookshelfResize\(components, axis, mm\)/);
  assert.match(viewer,/buildCustomerDoorPreviewSets\(components\)/);
  assert.match(viewer,/getCustomerFinishGroupTargetIds/);
  assert.match(viewer,/getCustomerWardrobeWidthSupport\(components\)/);
  assert.match(viewer,/needsSafeWardrobeResize\(components\)/);
  // The existing safety lock stays active for unverified cabinet resizing.
  assert.match(viewer,/Automatic resizing is not verified for this furniture/);
});
