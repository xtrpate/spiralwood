import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCustomerPartSchedule, resolvePartThicknessFromGeometry,formatCustomerPartThickness} from '../src/pages/customer/customerPartSchedule.mjs';

const wardrobeDoors = [
  {partCode:'WR-DL', type:'wr_door', width:882, height:2164, depth:18, material:'Laminated Board'},
  {partCode:'WR-DR', type:'wr_door', width:882, height:2164, depth:18, material:'Laminated Board'},
];
const tableAprons = [
  {partCode:'DT-AF', type:'dt_apron_long', width:1500, height:90, depth:25, material:'Oak Wood'},
  {partCode:'DT-AR', type:'dt_apron_long', width:1500, height:90, depth:25, material:'Oak Wood'},
  {partCode:'DT-AL', type:'dt_apron_short', width:25, height:90, depth:600, material:'Oak Wood'},
  {partCode:'DT-AR2', type:'dt_apron_short', width:25, height:90, depth:600, material:'Oak Wood'},
];
const tableLegs = ['FL','FR','BL','BR'].map(code=>({partCode:`DT-${code}`,type:'dt_leg',width:80,height:720,depth:80,material:'Oak Wood'}));

test('C3-FIX3: verified wardrobe doors are 18 mm (D)',()=>{
 for (const part of wardrobeDoors) {
   assert.deepEqual(resolvePartThicknessFromGeometry(part),{value:18,axis:'D'});
   const row=buildCustomerPartSchedule([part],2)[0];
   assert.equal(formatCustomerPartThickness(row),'18 mm (D)');
   assert.equal(row.totalQuantity,2);
 }
});

test('C3-FIX3: verified long and short table aprons are 25 mm on correct axis',()=>{
 for (const [i,part] of tableAprons.entries()) {
   const axis=i<2?'D':'W';
   assert.deepEqual(resolvePartThicknessFromGeometry(part),{value:25,axis});
   assert.equal(formatCustomerPartThickness(buildCustomerPartSchedule([part])[0]),`25 mm (${axis})`);
 }
});

test('C3-FIX3: solid table legs use a section, not false board thickness',()=>{
 const before=JSON.stringify(tableLegs);
 const rows=buildCustomerPartSchedule(tableLegs);
 assert.equal(rows.length,4);
 rows.forEach(row=>{
   assert.equal(row.thicknessMm,null);
   assert.equal(formatCustomerPartThickness(row),'80 × 80 mm (section)');
 });
 assert.equal(JSON.stringify(tableLegs),before);
});

test('C3-FIX3: no guessing on metal hardware, unsupported codes, or invalid component sizes',()=>{
 for (const p of [
   {partCode:'DT-AF',type:'dt_apron_long',width:1500,height:90,depth:25,material:'Steel'},
   {partCode:'DT-AF',type:'dt_apron_long',width:1500,height:90,depth:80,material:'Oak Wood'},
   {label:'Front Apron',type:'unknown',width:1500,height:90,depth:25},
   {partCode:'WR-DL',type:'wr_door',width:882,height:2164,depth:0},
 ]) {
   assert.deepEqual(resolvePartThicknessFromGeometry(p),{value:null,axis:''});
 }
 const unknown=buildCustomerPartSchedule([{type:'unknown',width:80,height:720,depth:80}])[0];
 assert.equal(formatCustomerPartThickness(unknown),'—');
});

test('C3-FIX3: C3-FIX2 Mini Cabinet and original panel rules preserved',()=>{
 const toe={partCode:'CB-TOE-KICK',type:'cabinet_toe_kick',partRole:'toe_kick',width:864,height:100,depth:18};
 assert.deepEqual(resolvePartThicknessFromGeometry(toe),{value:18,axis:'D'});
 const panel={type:'side_panel',width:18,height:876,depth:620};
 assert.deepEqual(resolvePartThicknessFromGeometry(panel),{value:18,axis:'W'});
});

test('C3-FIX3: all four existing displays use the same helper, no geometry mutation',()=>{
 const here=path.dirname(fileURLToPath(import.meta.url));
 const root=path.resolve(here,'../src/pages');
 for(const name of ['customer/CartPartScheduleDialog.jsx','customer/customcartpage.jsx','customer/customcheckoutpage.jsx','orders/AdminSubmittedDesignPreview.jsx']){
    const s=fs.readFileSync(path.join(root,name),'utf8');
    assert.match(s, /formatCustomerPartThickness/);
    assert.match(s, /Thickness \/ Section/);
 }
});
