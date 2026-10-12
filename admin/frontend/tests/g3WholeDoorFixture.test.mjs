import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {getCustomerCarcassWholeDoorSupport as support,planCustomerCarcassWholeDoorResize as plan} from '../src/utils/customerCarcassWholeDoorResize.mjs';
import {getCustomerValidatedPanelCarcassSupport as shellSupport} from '../src/utils/customerValidatedPanelCarcassResize.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
const clone=o=>structuredClone(o);
const src=JSON.parse(fs.readFileSync(path.join(base,'validatedPanelCarcassFixture_289.json'),'utf8')).parts;
const near=(a,b)=>Math.abs(a-b)<0.1;
function fixture({pair=true,withShelf=true}={}){
  const b=clone(src).filter(p=>p.partRole!=='toe_kick' && (withShelf || p.partRole!=='shelf'));
  // Cabinet with a true floor-contact bottom: no toe kick or base panel.
  for(const p of b.filter(p=>p.partRole==='left_side_panel'||p.partRole==='right_side_panel'))p.height=776;
  const shell=b.find(p=>p.partRole==='left_side_panel');
  const top=b.find(p=>p.partRole==='top_panel');
  const bottom=b.find(p=>p.partRole==='bottom_panel');
  const right=b.find(p=>p.partRole==='right_side_panel');
  const front=shell.z+shell.depth;
  for(const p of b.filter(p=>p.partRole==='shelf'))p.depth-=34;
  const x=shell.x+shell.width+10,y=top.y+top.height+10,z=front-18;
  const avail=right.x-10-x, height=bottom.y-10-y;
  const common={type:'door_front_panel',partRole:'door',partFunction:'door',doorLayoutScope:'whole',doorLayoutMode:pair?'pair':'single',doorReveal:10,doorGap:pair?10:0,groupId:shell.groupId,assemblyId:shell.assemblyId,assemblyType:shell.assemblyType,locked:false,qty:1,material:'Marine Plywood',rotationX:0,rotationY:0,rotationZ:0,x,y,z,depth:18,height};
  const doors=pair?[{...common,id:'door-left',partCode:'CAB-DOOR-L',doorLeaf:'left',width:(avail-10)/2},{...common,id:'door-right',partCode:'CAB-DOOR-R',doorLeaf:'right',x:x+(avail-10)/2+10,width:(avail-10)/2}]:[{...common,id:'door-single',partCode:'CAB-DOOR',doorLeaf:'single',width:avail}];
  return [...b,...doors];
}
test('G3-A: reusable whole-opening pair recognized without ID dependency',()=>{
  const p=fixture();const result=support(p);assert.equal(result.ok,true,result.error);assert.equal(result.doorCount,2);
  assert.equal(shellSupport(p).ok,false,'G1 original must not silently accept doors');
});
test('G3-A: single door supported only as verified whole opening',()=>{
  const p=fixture({pair:false});assert.equal(support(p).ok,true,support(p).error);
});
for(const axis of ['width','height','depth']) test(`G3-A: ${axis} keeps door gap, fixed sections, shelf clearance, original, and floor`,()=>{
  const p=fixture();const original=clone(p),before=support(p);assert.equal(before.ok,true,before.error);
  const requested=before[axis]+50;
  const outcome=plan(p,axis,requested);assert.equal(outcome.ok,true,outcome.error);
  const after=support(outcome.parts);assert.equal(after.ok,true,after.error);assert.equal(after[axis],requested);
  assert.deepEqual(p,original);
  const doors=outcome.parts.filter(q=>q.partRole==='door').sort((a,b)=>a.x-b.x);
  assert(near(doors[1].x-(doors[0].x+doors[0].width),10));
  assert.equal(doors[0].depth,18);
  const beforeFloor=Math.max(...p.filter(x=>x.partRole==='left_side_panel'||x.partRole==='right_side_panel').map(x=>x.y+x.height));
  const afterFloor=Math.max(...outcome.parts.filter(x=>x.partRole==='left_side_panel'||x.partRole==='right_side_panel').map(x=>x.y+x.height));
  assert(near(beforeFloor,afterFloor));
  for(const part of p){const newer=outcome.parts.find(x=>x.id===part.id);assert.equal(newer.material,part.material);assert.equal(newer.partCode,part.partCode);}
});
test('G3-A: repeated changes preserve original range and serialized snapshot',()=>{
 const p=fixture();const b=support(p);
 const first=plan(p,'width',b.width+30);assert.equal(first.ok,true,first.error);
 const saved=JSON.parse(JSON.stringify(first.parts));const second=plan(saved,'depth',b.depth+30);assert.equal(second.ok,true,second.error);
 const third=plan(second.parts,'width',b.width);assert.equal(third.ok,true,third.error);
 assert.equal(support(third.parts).width,b.width);
 assert.equal(plan(third.parts,'width',b.maxWidth+1).ok,false);
});
test('G3-A: invalid or unknown door and structural layouts are rejected before geometry mutation',()=>{
 const changes=[
  p=>p.find(x=>x.partRole==='door').doorLayoutScope='bay',
  p=>p.find(x=>x.partRole==='door').doorLeaf='unknown',
  p=>p.find(x=>x.partRole==='door').x+=70,
  p=>p.find(x=>x.partRole==='door').height+=120,
  p=>p.find(x=>x.partRole==='door').z-=40,
  p=>p.find(x=>x.partRole==='door').rotationY=90,
  p=>p.find(x=>x.partRole==='door').locked=true,
  p=>p.find(x=>x.partRole==='shelf').depth+=50,
  p=>p.find(x=>x.partRole==='door').groupId='foreign',
  p=>p.push({...p[0],id:'new-drawer',partCode:'DRAWER-1',type:'drawer_front_panel',partRole:'drawer'}),
  p=>p.push({...p[0],id:'new-door',partCode:'DOOR-3',type:'door_front_panel',partRole:'door'}),
  p=>p.find(x=>x.partRole==='right_side_panel').x+=100,
 ];
 for(const [index,alter] of changes.entries()){
  const p=fixture();alter(p);const before=clone(p);assert.equal(support(p).ok,false,`case ${index}`);
  assert.equal(plan(p,'width',950).ok,false,`case ${index}`);assert.deepEqual(p,before);
 }
});
test('G3-A: original 289 with toe kick is still protected with oversized generic doors',()=>{
  const p=fixture();const root=clone(src);
  const ids=new Set(root.map(x=>x.id));
  p.filter(x=>x.partRole==='door').forEach(x=>root.push(x));
  assert.equal(support(root).ok,false);
});
test('G3-A: no doors never overrides existing verified carcass sizing',()=>{
 const p=fixture().filter(x=>x.partRole!=='door');assert.equal(support(p).ok,false);
});

test('G3-A: verified legacy Admin whole doors without dropped layout metadata can be recognized',()=>{
  const p=fixture();for(const door of p.filter(q=>q.partRole==='door')){
    delete door.doorLayoutScope;delete door.doorLayoutMode;delete door.doorLeaf;
    delete door.doorReveal;delete door.doorGap;
  }
  const before=support(p);assert.equal(before.ok,true,before.error);
  const planResult=plan(p,'width',before.width+40);assert.equal(planResult.ok,true,planResult.error);
  assert.equal(support(planResult.parts).width,before.width+40);
});
test('G3-A: noncanonical old doors without relationship metadata remain protected',()=>{
  const p=fixture();for(const door of p.filter(q=>q.partRole==='door')){
    door.partCode='PNL-'+door.id;
    delete door.doorLayoutScope;delete door.doorLayoutMode;delete door.doorLeaf;
    delete door.doorReveal;delete door.doorGap;
  }
  assert.equal(support(p).ok,false);
});

// Customer and Admin integration anchors: checked against real repo files after ZIP apply.
test('G3-A: customer dispatch and Door Builder Save/Reload integration are present',()=>{
  const root=path.resolve(base,'..');
  const viewer=fs.readFileSync(path.join(root,'src/pages/customer/customer3dviewer.jsx'),'utf8');
  const normalized=fs.readFileSync(path.join(root,'src/pages/blueprints/data/componentUtils.js'),'utf8');
  for(const needle of [
    'getCustomerCarcassWholeDoorSupport(components)',
    'planCustomerCarcassWholeDoorResize(components, axis, mm)',
    'getCustomerValidatedPanelCarcassSupport(components)',
    'planCustomerValidatedPanelCarcassResize(components, axis, mm)',
    'const CUSTOMER_PART_GEOMETRY_EDITING_ENABLED = false;',
  ])assert.equal(viewer.includes(needle),true,needle);
  for(const needle of ['doorLayoutMode: String(c.doorLayoutMode || "")',
    'doorLayoutScope: String(c.doorLayoutScope || "")',
    'doorLeaf: String(c.doorLeaf || "")',
    'doorReveal: Number(c.doorReveal)',
    'doorGap: Number(c.doorGap)'])assert.equal(normalized.includes(needle),true,needle);
});
