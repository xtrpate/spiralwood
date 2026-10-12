import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 getCustomerGeometricManualTableSupport as support,
 planCustomerGeometricManualTableResize as plan,
} from '../src/utils/customerGeometricManualTableResize.mjs';
import {getCustomerManualFivePartTableSupport as originalSupport} from '../src/utils/customerManualFivePartTableResize.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const mk=(code,type,role,x,y,z,width,height,depth)=>({id:code,partCode:code,type,partRole:role,x,y,z,width,height,depth,locked:false,qty:1,material:'Pine',wood_type:'Pine'});
// A NEW 800x709x782 table, NOT the old 1064x709x985 saved #288.
const sample=(w=800,d=782)=>[
 mk('PNL-NEW1','furniture_board_panel','board_panel',1408,2451,1708,w,18,d),
 mk('LEG-NEW1','furniture_leg','leg',1460,2460,1708+147,50,700,50),
 mk('LEG-NEW2','furniture_leg','leg',1408+w-72,2460,1708+147,50,700,50),
 mk('LEG-NEW3','furniture_leg','leg',1460,2460,1708+d-153,50,700,50),
 mk('LEG-NEW4','furniture_leg','leg',1408+w-72,2460,1708+d-153,50,700,50),
];
const original=sample();
const clone=(x)=>JSON.parse(JSON.stringify(x));
const invariantKeys=['id','partCode','type','partRole','material','wood_type','qty','locked','finish','requested_wood_type','groupId','assemblyId','assemblyType'];
const invariant=(a,b)=>a.forEach((x,i)=>invariantKeys.forEach(k=>assert.deepEqual(x[k],b[i][k],`part ${i} ${k}`)));
const footPositions=a=>a.filter(p=>p.partRole==='leg').map(p=>p.y+p.height);
test('G2 accepts new 800x709x782 manual tabletop + 4 legs, not keyed to #288',()=>{
 const check=support(original);
 assert.ok(check.ok,check.error);
 assert.deepEqual([check.width,check.height,check.depth],[800,709,782]);
 assert.ok(!originalSupport(original).ok,'Old 900/850 hard limits reject this table');
});
for(const [axis,target] of [['width',950],['height',780],['depth',880]]){
 test(`G2 ${axis}: retain leg sections, corner attachment, thickness, floor and other axes`,()=>{
  const before=support(original), snapshot=JSON.stringify(original);
  const next=plan(original,axis,target);
  assert.ok(next.ok,next.error);
  const after=support(next.parts);
  assert.equal(after[axis],target);
  for(const other of ['width','height','depth']) if(other!==axis) assert.equal(after[other],before[other]);
  assert.deepEqual(after.insets,before.insets);
  assert.equal(after.overlap,before.overlap);
  assert.equal(after.tabletopThickness,before.tabletopThickness);
  assert.deepEqual(footPositions(next.parts),footPositions(original));
  invariant(original,next.parts);
  assert.equal(JSON.stringify(original),snapshot);
 });
}
test('G2 supports repeated resize and serialized saved customer snapshot',()=>{
 let s=clone(original);for(const [axis,w] of [['width',1010],['height',750],['depth',880],['width',760]]){
  const r=plan(s,axis,w);assert.ok(r.ok,r.error);s=clone(r.parts);
  assert.equal(support(s)[axis],w);
 }
 assert.deepEqual(footPositions(s),footPositions(original));
});
test('G2 accepts translated, re-coded coherent five-part manual table without ID assumptions',()=>{
 const p=sample().map((v,i)=>({...v,id:`fresh-${i}`,partCode:v.partCode.replace('NEW','OTHER'),x:v.x+77,y:v.y-40,z:v.z+123}));
 assert.ok(support(p).ok,support(p).error);
});
test('G2 allows coherent manually grouped tables, not mixed groups',()=>{
 const p=sample().map(p=>({...p,groupId:'custom-group',assemblyId:'custom-group',assemblyType:'custom'}));
 assert.ok(support(p).ok,support(p).error);
 p[0].groupId='different';assert.equal(support(p).ok,false);
});
test('G2 rejects unrelated layouts, floating legs, duplicate corner, nonuniform legs',()=>{
 for(const [index,changes] of [[0,{type:'wr_top_panel'}],[0,{height:4}],[1,{y:2420}],[1,{z:2000}],[2,{x:1460}],[3,{width:60}],[4,{height:690}],[2,{rotationY:12}],[0,{visible:false}],[2,{locked:true}],[1,{qty:2}],[0,{material:'',wood_type:''}],[0,{groupId:'different'}],[0,{isHumanReference:true}]]){
  const copy=clone(original);Object.assign(copy[index],changes);
  assert.equal(support(copy).ok,false,JSON.stringify({index,changes}));
 }
});
test('G2 fails closed for impossible target and never mutates source',()=>{
 const snapshot=JSON.stringify(original);
 for(const [axis,val] of [['width',499],['width',1601],['height',540],['depth',1301],['depth',1],['width',Infinity],['height',NaN],['width', ''],['random',800]])
  assert.equal(plan(original,axis,val).ok,false,`${axis}:${val}`);
 assert.equal(JSON.stringify(original),snapshot);
});
test('G2 no-op returns new copies without moving geometry',()=>{
 const result=plan(original,'width',800);
 assert.ok(result.ok,result.error);
 assert.ok(result.unchanged);
 assert.notEqual(result.parts,original);
 assert.notEqual(result.parts[0],original[0]);
});
test('G2 does not classify a 7-part cabinet or 9-part dining table as manual',()=>{
 assert.equal(support([...original,clone(original[0])]).ok,false);
 assert.equal(support(original.slice(0,4)).ok,false);
});
test('G2 source checks preserve C5 9-part and R1 manual paths',()=>{
 const v=fs.readFileSync(path.join(root,'admin/frontend/src/pages/customer/customer3dviewer.jsx'),'utf8');
 for(const anchor of ['getCustomerGeometricManualTableSupport(components)','planCustomerGeometricManualTableResize(components, axis, mm)','tableSupport.manualFivePart ? planCustomerManualFivePartTableResize','getCustomerDiningTableResizeSupport(components)','tableSupport.ok ? "Smart table"','CUSTOMER_PART_GEOMETRY_EDITING_ENABLED = false'])
  assert.ok(v.includes(anchor),anchor);
});
