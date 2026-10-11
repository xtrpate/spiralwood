import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCustomerDiningTableResizeSupport as support,
  planCustomerDiningTableResize as plan,
} from '../src/utils/customerDiningTableResize.mjs';
import { getCustomerFurnitureDimensions } from '../src/pages/customer/customerGeometryBounds.mjs';

const basePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const original = () => {
  const x=200, y=2400, z=300, w=1800, h=760, d=900, t=40;
  const spec = [
    ['DT-TOP','dt_top_panel',x,y,z,w,t,d],
    ['DT-FL','dt_leg',x+70,y+t,z+70,80,h-t,80],
    ['DT-FR','dt_leg',x+w-150,y+t,z+70,80,h-t,80],
    ['DT-BL','dt_leg',x+70,y+t,z+d-150,80,h-t,80],
    ['DT-BR','dt_leg',x+w-150,y+t,z+d-150,80,h-t,80],
    ['DT-AF','dt_apron_long',x+150,y+t,z+70,w-300,90,25],
    ['DT-AR','dt_apron_long',x+150,y+t,z+d-95,w-300,90,25],
    ['DT-AL','dt_apron_short',x+70,y+t,z+150,25,90,d-300],
    ['DT-AR2','dt_apron_short',x+w-95,y+t,z+150,25,90,d-300],
  ];
  return spec.map(([partCode,type,cx,cy,cz,width,height,depth],i) => ({
    id: `table-${i+1}`, partCode, type, groupId:'dining-one', assemblyId:'dining-one',
    assemblyType:'dining_table', x:cx, y:cy, z:cz,
    width,height,depth, qty:1, material:'Oak Wood', wood_type:'Oak Wood',
    requested_wood_type: i===0 ? 'Mahogany' : '', finish_id:'oak-natural',
    finish_color:'#b88958', locked:false, rotationX:0,rotationY:0,rotationZ:0,
  }));
};
const by = (parts,code) => parts.find(p=>p.partCode===code);
const dims = (parts) => getCustomerFurnitureDimensions(parts);
const ids = (parts) => parts.map(p=>p.id).join('|');

test('C5-1 baseline 9-part Dining Table validates W1800 H760 D900',()=>{
  const b = original();
  const result=support(b);
  assert.equal(result.ok,true, result.error);
  assert.deepEqual([result.width,result.height,result.depth],[1800,760,900]);
  assert.deepEqual(dims(b),{width_mm:1800,height_mm:760,depth_mm:900});
});

test('C5-1 width: top and long aprons extend; right legs move, no section scaling',()=>{
  const b=original();const result=plan(b,'width',2000);
  assert.equal(result.ok,true,result.error);
  const p=result.parts;
  assert.deepEqual(dims(p),{width_mm:2000,height_mm:760,depth_mm:900});
  assert.equal(by(p,'DT-TOP').width,2000);
  assert.equal(by(p,'DT-AF').width,1700);
  assert.equal(by(p,'DT-AR').width,1700);
  assert.equal(by(p,'DT-FR').x,by(b,'DT-FR').x+200);
  assert.equal(by(p,'DT-BR').x,by(b,'DT-BR').x+200);
  assert.equal(by(p,'DT-AR2').x,by(b,'DT-AR2').x+200);
  assert.equal(by(p,'DT-FL').x,by(b,'DT-FL').x);
  assert.equal(by(p,'DT-FR').width,80);
  assert.equal(by(p,'DT-FR').depth,80);
  assert.equal(by(p,'DT-AF').depth,25);
});

test('C5-1 height: legs lengthen, feet stay on floor and tabletop stays 40 mm',()=>{
  const b=original();const result=plan(b,'height',840);
  assert.equal(result.ok,true,result.error);
  const p=result.parts;
  assert.deepEqual(dims(p),{width_mm:1800,height_mm:840,depth_mm:900});
  assert.equal(by(p,'DT-TOP').y,by(b,'DT-TOP').y-80);
  assert.equal(by(p,'DT-TOP').height,40);
  for(const code of ['DT-FL','DT-FR','DT-BL','DT-BR']) {
    assert.equal(by(p,code).height,800);
    assert.equal(by(p,code).y + by(p,code).height,by(b,code).y+by(b,code).height);
    assert.equal(by(p,code).width,80);
    assert.equal(by(p,code).depth,80);
  }
  assert.equal(by(p,'DT-AF').height,90);
  assert.equal(by(p,'DT-AF').y,by(b,'DT-AF').y-80);
});

test('C5-1 depth: top and side aprons extend; rear legs and rear apron move',()=>{
  const b=original();const result=plan(b,'depth',1050);
  assert.equal(result.ok,true,result.error);
  const p=result.parts;
  assert.deepEqual(dims(p),{width_mm:1800,height_mm:760,depth_mm:1050});
  assert.equal(by(p,'DT-TOP').depth,1050);
  assert.equal(by(p,'DT-AL').depth,750);
  assert.equal(by(p,'DT-AR2').depth,750);
  assert.equal(by(p,'DT-BR').z,by(b,'DT-BR').z+150);
  assert.equal(by(p,'DT-BL').z,by(b,'DT-BL').z+150);
  assert.equal(by(p,'DT-AR').z,by(b,'DT-AR').z+150);
  assert.equal(by(p,'DT-FL').z,by(b,'DT-FL').z);
  assert.equal(by(p,'DT-AL').width,25);
});

test('C5-1 combined W/H/D sequence remains valid without drift',()=>{
  let parts=original();
  for(const [axis,target] of [['width',2100],['height',710],['depth',1080],['width',1400],['height',900],['depth',750]]) {
    const next=plan(parts,axis,target);
    assert.equal(next.ok,true, `${axis}=${target} ${next.error}`);
    assert.equal(support(next.parts).ok,true);
    parts=next.parts;
  }
  assert.deepEqual(dims(parts),{width_mm:1400,height_mm:900,depth_mm:750});
  for(const [axis,target] of [['width',1800],['height',760],['depth',900]]) {
    const next=plan(parts,axis,target);assert.equal(next.ok,true,next.error);parts=next.parts;
  }
  assert.deepEqual(dims(parts),dims(original()));
  assert.deepEqual(parts.map(p=>[p.x,p.y,p.z,p.width,p.height,p.depth]),original().map(p=>[p.x,p.y,p.z,p.width,p.height,p.depth]));
});

test('C5-1 identity, qty, materials, finishes, requested wood never change',()=>{
  const b=original();const frozen=b.map(p=>Object.freeze({...p}));Object.freeze(frozen);
  const p=plan(frozen,'width',1900).parts;
  assert.equal(ids(p),ids(frozen));
  assert.equal(p.length,9);
  for(let i=0;i<p.length;i++){
    for(const k of ['id','partCode','type','groupId','assemblyId','assemblyType','qty','material','wood_type','requested_wood_type','finish_id','finish_color','locked']) {
      assert.deepEqual(p[i][k],frozen[i][k],`${k} changed for ${i}`);
    }
    assert.notEqual(p[i],frozen[i]);
  }
  assert.equal(frozen[0].width,1800);
});

test('C5-1 rejected bad target and 1mm invalid/unsafe input before mutation',()=>{
  const b=original();
  for(const [axis,v] of [['width',1399],['width',2201],['height',699],['height',901],['depth',749],['depth',1101],['width',-10],['height',760.5],['depth',''],['width',null],['height','Infinity'],['height',NaN],['thickness',20]]) {
    const result=plan(b,axis,v);assert.equal(result.ok,false,`${axis} ${v}`);
  }
  assert.deepEqual(dims(b),{width_mm:1800,height_mm:760,depth_mm:900});
});

test('C5-1 no-op makes an independent copy, preserving original',()=>{
  const b=original();const result=plan(b,'width',1800);
  assert.equal(result.ok,true);assert.equal(result.unchanged,true);
  assert.notEqual(result.parts,b);assert.notEqual(result.parts[0],b[0]);
});

test('C5-1 does not authorize missing, extra, repeated or mixed assembly parts',()=>{
  const b=original();
  const cases=[b.slice(1),[...b,b[0]],b.map((p,i)=>i===1?{...p,partCode:'DT-TOP'}:p),b.map((p,i)=>i===1?{...p,id:b[0].id}:p),b.map((p,i)=>i===1?{...p,groupId:'other',assemblyId:'other'}:p)];
  cases.forEach(c=>assert.equal(support(c).ok,false));
});

test('C5-1 rejects rotated, locked, hidden, deleted, invalid/unknown parts',()=>{
  for(const change of [
    {rotationY:45},{rotationX:90},{locked:true},{visible:false},{is_deleted:1},
    {type:'custom_component'},{assemblyType:'cabinet'},{width:0},{height:-1},
    {qty:2},{x:'bad'},{groupId:'other'},
  ]) {
    const parts=original();Object.assign(parts[1],change);
    assert.equal(support(parts).ok,false,JSON.stringify(change));
  }
});

test('C5-1 rejects geometry with changed joinery, leg cross section or apron thickness',()=>{
  const cases=[
    ['DT-TOP',{height:41}],['DT-FL',{width:100}],['DT-FR',{depth:70}],
    ['DT-AR',{depth:30}],['DT-AL',{width:30}],['DT-BL',{z:9999}],
    ['DT-AF',{width:1499}],['DT-AR2',{x:0}],
  ];
  for(const [code,props] of cases){const p=original();Object.assign(by(p,code),props);assert.equal(support(p).ok,false,code);}
});

test('C5-1 independently supports translated table assembly without moving its center origin',()=>{
 const p=original().map(x=>({...x,x:x.x+501,y:x.y-91,z:x.z+303}));
 assert.equal(support(p).ok,true);
 const r=plan(p,'width',2050);
 assert.equal(r.ok,true,r.error);
 assert.equal(by(r.parts,'DT-TOP').x,by(p,'DT-TOP').x);
 assert.equal(by(r.parts,'DT-TOP').z,by(p,'DT-TOP').z);
});

test('C5-1 rejects other furniture family even with nine components',()=>{
 const b=original().map(p=>({...p,partCode:p.partCode.replace('DT-','CT-')}));
 assert.equal(support(b).ok,false);
});

test('C5-1 Customer 3D viewer integrates safe Table planner without enabling raw part editing',()=>{
 const v=fs.readFileSync(path.join(basePath,'admin/frontend/src/pages/customer/customer3dviewer.jsx'),'utf8');
 for(const anchor of ['getCustomerDiningTableResizeSupport(components)','planCustomerDiningTableResize(components, axis, mm)','const applySmartTable = axis => {','commitComponents(next.parts)','!canResizeTable("width")','!canResizeTable("height")','!canResizeTable("depth")','Apply {label}','const CUSTOMER_PART_GEOMETRY_EDITING_ENABLED = false;']) assert.ok(v.includes(anchor),anchor);
 assert.match(v,/tableSupport\.ok \? "Smart table"/);
});

test('C5-1 verified Admin nine-part Dining Table codes and fixed section values remain unchanged',()=>{
 const v=fs.readFileSync(path.join(basePath,'admin/frontend/src/pages/blueprints/data/standardTemplateBuilders.js'),'utf8');
 for (const code of ['DT-TOP','DT-FL','DT-FR','DT-BL','DT-BR','DT-AF','DT-AR','DT-AL','DT-AR2']) assert.ok(v.includes(`partCode: "${code}"`),code);
 for(const def of ['const topT = 40','const legW = 80','const apronH = 90','const apronT = 25','const inset = 70']) assert.ok(v.includes(def),def);
});
