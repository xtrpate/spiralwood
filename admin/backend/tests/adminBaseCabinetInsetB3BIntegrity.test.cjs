const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const helperPath = path.join(root, 'frontend/src/utils/adminBaseCabinetInsetDoors.js');
const source = fs.readFileSync(helperPath, 'utf8');
const sandbox = { module: {exports:{}}, Number, Math, String, Object, Array, Set, Map };
vm.runInNewContext(source.replace('export function planBaseCabinetInsetPair(', 'function planBaseCabinetInsetPair(')+'\nmodule.exports.planBaseCabinetInsetPair=planBaseCabinetInsetPair;', sandbox);
const plan = sandbox.module.exports.planBaseCabinetInsetPair;
const groupId = 'new-mini-cabinet-278';
const orig = { x:210, y:2264, z:600 };
const part = (code,type,x,y,z,width,height,depth) => ({ id:code, partCode:code, type, assemblyType:'base_cabinet', groupId, x,y,z,width,height,depth,material:'Marine Plywood',finish:'oak_natural' });
function fixture() {
  return [
    part('CB-SIDE-L','wr_side_panel',210,2264,600,18,876,620),
    part('CB-SIDE-R','wr_side_panel',1092,2264,600,18,876,620),
    part('CB-TOP','wr_top_panel',228,2264,600,864,18,620),
    part('CB-BOT','wr_bottom_panel',228,3022,600,864,18,620),
    part('CB-BACK','wr_back_panel',228,2282,600,864,740,6),
    part('CB-TOE-KICK','cabinet_toe_kick',228,3040,1152,864,100,18),
    part('CB-SH01','wr_shelf',228,2518,620,864,18,600),
    part('CB-SH02','wr_shelf',228,2760,620,864,18,600),
  ];
}
function collides(a,b){
 return ['x','y','z'].every((axis)=> {
   const dimension = axis==='x'?'width':axis==='y'?'height':'depth';
   return Math.min(a[axis]+a[dimension],b[axis]+b[dimension])-Math.max(a[axis],b[axis])>0.001;
 });
}
test('exact 8-part Base Cabinet yields inset doors and safely shortened shelves',()=>{
 const original=fixture(); const snapshot=JSON.stringify(original);
 const p=plan(original,{reveal:10,centerGap:10,doorThickness:20});
 assert.equal(p.supported,true,p.reason);assert.equal(p.doors.length,2);
 assert.equal(p.measurements.outerWidth,900);assert.equal(p.measurements.outerHeight,876);assert.equal(p.measurements.outerDepth,620);
 assert.equal(p.doors[0].width,417);assert.equal(p.doors[0].height,720);assert.equal(p.doors[0].depth,20);
 assert.equal(p.shelfUpdates[0].depth,578);assert.equal(p.shelfUpdates[1].depth,578);
 assert.equal(JSON.stringify(original),snapshot,'planning must remain read-only');
 const reconstructed=original.map(item => ({...item, ...(p.shelfUpdates.find(u=>u.id===item.id)||{})}));
 for(const door of p.doors){
  assert.equal(door.z+door.depth,1220,'inset door face flush with cabinet front');
  for(const panel of reconstructed) assert.equal(collides(door,panel),false,`Door intersects ${panel.partCode}`);
 }
 assert.equal(collides(p.doors[0],p.doors[1]),false);
});
test('legacy interior-preset shelf codes and 2 mm inset side margins are accepted',()=>{
 const a=fixture().map((p,i) => i>=6?{...p, partCode:i===6?'CB-SH-1-01':'CB-SH-1-02', x:230,width:860}:p);
 const result=plan(a);assert.equal(result.supported,true,result.reason);
 assert.equal(result.shelfUpdates[0].depth,578);
});
test('actual single-bay Shelf Layout CB-SH-01 and CB-SH-02 are accepted',()=>{
 // useBlueprintBuilderActions.buildCabinetShelfLayout3D creates CB-SH-01/02,
 // not CB-SH-1-01/02. New shelves use 20-mm snapping and inner bay width.
 const a=fixture().map((item,index)=>{
   if(index<6) return item;
   return {...item,
     partCode: index===6 ? 'CB-SH-01' : 'CB-SH-02',
     x:230, width:860, height:20, z:620, depth:600,
     y:index===6?2549.333:2834.667,
   };
 });
 const result=plan(a,{reveal:10,centerGap:10,doorThickness:20});
 assert.equal(result.supported,true,result.reason);
 assert.equal(result.doors.length,2);
 assert.equal(result.shelfUpdates.length,2);
 assert.deepEqual(Array.from(result.shelfUpdates,u=>u.depth),[578,578]);
 assert.equal(result.measurements.outerWidth,900);
 assert.equal(result.measurements.outerHeight,876);
 assert.equal(result.measurements.outerDepth,620);
 // A mixed pair is still rejected: the fix is not a generic layout bypass.
 const mixed=a.map((item,index)=>index===7?{...item,partCode:'CB-SH02'}:item);
 assert.equal(plan(mixed).supported,false);
});
test('after saved 10-part version, same geometry is deterministic and safe',()=>{
 const a=fixture();const p=plan(a);
 const doors=p.doors.map(d=>({ ...d, id:d.partCode, type:'door_front_panel', assemblyType:'base_cabinet', groupId}));
 const items=a.map(item=>({...item,...(p.shelfUpdates.find(s=>s.id===item.id)||{})})).concat(doors);
 const again=plan(items);
 assert.equal(again.supported,true,again.reason);assert.deepEqual([...again.shelfUpdates].map(s=>s.depth),[578,578]);
});
test('missing, extra, duplicate, incorrect types and mismatched assemblies are rejected',()=>{
 const a=fixture();for(const data of [a.slice(1),a.concat({...a[0],id:'extra',partCode:'CB-EXTRA'}),a.map((x,i)=>i===3?{...x,type:'wr_shelf'}:x),a.map((x,i)=>i===7?{...x,groupId:'other'}:x)]) assert.equal(plan(data).supported,false);
});
test('modified/unsafe geometry and invalid hinge gaps fail closed',()=>{
 const a=fixture(); const b=a.map((x,i)=>i===3?{...x,y:x.y-50}:x);
 assert.equal(plan(b,{reveal:2}).supported,false);
 assert.equal(plan(a,{centerGap:100}).supported,false);
 assert.equal(plan(a,{doorThickness:40}).supported,false);
 assert.equal(plan(a.map((x,i)=>i===6?{...x,z:1100}:x)).supported,false);
});
test('helper is Admin-only and does not touch customer code',()=>{
 const builder=fs.readFileSync(path.join(root,'frontend/src/pages/blueprints/hooks/useBlueprintBuilderActions.js'),'utf8');
 const ui=fs.readFileSync(path.join(root,'frontend/src/pages/blueprints/3d/components/FurnitureToolsPanel.jsx'),'utf8');
 assert.match(builder,/planBaseCabinetInsetPair/);
 assert.match(builder,/inset_pair/);
 assert.match(ui,/Inset Pair \(Base Cabinet\)/);
 assert.match(builder,/pushHistory\(/);
});
