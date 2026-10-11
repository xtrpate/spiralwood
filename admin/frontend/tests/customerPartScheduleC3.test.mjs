import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCustomerPartSchedule,
  resolvePartThicknessFromGeometry,
  summarizeCustomerPartQuantities,
} from '../src/pages/customer/customerPartSchedule.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(dirname, '../src/pages', name), 'utf8');
const parts = [
  {id:'side-1',partCode:'SIDE-L',label:'Left Panel',type:'side_panel',width:18,height:876,depth:620,qty:2,material:'Marine Plywood',requested_wood_type:'Mahogany'},
  {id:'door-1',partCode:'DOOR-1',label:'Door',type:'door_front_panel',width:440,height:720,depth:20,qty:1,material:'Plywood',requested_wood_type:'Pine'},
  {id:'rod-1',partCode:'ROD-1',label:'Rod',type:'metal_rod',width:600,height:20,depth:20,qty:3,material:'Metal',requested_wood_type:''},
];

test('C3: physical per-unit part qty is preserved and multiplied exactly once by furniture quantity', () => {
  const rows=buildCustomerPartSchedule(parts,2);
  assert.deepEqual(rows.map(x=>x.quantityPerUnit),[2,1,3]);
  assert.deepEqual(rows.map(x=>x.totalQuantity),[4,2,6]);
  assert.deepEqual(summarizeCustomerPartQuantities(rows),{entries:3,piecesPerFurniture:6,totalPieces:12});
  assert.equal(rows[0].raw,parts[0]);
});

test('C3: part identity, material, requested wood and dimensions are unchanged', () => {
  const rows=buildCustomerPartSchedule(parts,1);
  assert.equal(rows[0].id,'side-1');
  assert.equal(rows[0].code,'SIDE-L');
  assert.equal(rows[0].material,'Marine Plywood');
  assert.equal(rows[0].requestedWood,'Mahogany');
  assert.deepEqual([rows[0].width,rows[0].height,rows[0].depth],[18,876,620]);
  assert.equal(rows[2].requestedWood,'');
  assert.equal(parts[0].qty,2);
});

test('C3: thickness is derived only for clear, flat geometry or explicit metadata', () => {
  assert.deepEqual(resolvePartThicknessFromGeometry(parts[0]),{value:18,axis:'W'});
  assert.deepEqual(resolvePartThicknessFromGeometry(parts[1]),{value:20,axis:'D'});
  assert.deepEqual(resolvePartThicknessFromGeometry(parts[2]),{value:null,axis:''});
  assert.deepEqual(resolvePartThicknessFromGeometry({width:30,height:30,depth:30,type:'panel'}),{value:null,axis:''});
  assert.deepEqual(resolvePartThicknessFromGeometry({width:90,height:90,depth:90,thicknessMm:18}),{value:18,axis:''});
});

test('C3: unknown reference geometry is never presented as a manufacturing part', () => {
  const rows=buildCustomerPartSchedule([null,{id:'r',type:'reference_proxy',qty:100},{id:'deleted',type:'panel',is_deleted:1},parts[0]],1);
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,'side-1');
});

test('C3: no cart checkout or Admin read-only mutation and no auto materials pricing', () => {
  const original=JSON.stringify(parts);
  buildCustomerPartSchedule(parts,4);
  assert.equal(JSON.stringify(parts),original);
  const helper=read('customer/customerPartSchedule.mjs');
  assert.ok(!/raw_material_id|unit_cost|price|stock_deduct|UPDATE\s+/.test(helper));
});

test('C3: Cart visibly renders part schedule and two different quantity columns', () => {
  const src=read('customer/customcartpage.jsx');
  assert.ok(src.includes('buildCustomerPartSchedule(item?.editor_snapshot?.components, item.quantity)'));
  assert.ok(src.includes('Parts &amp; Measurements'));
  for(const field of ['part.quantityPerUnit','part.totalQuantity','part.code','part.requestedWood','part.thicknessMm']) assert.ok(src.includes(field),field);
});

test('C3: Checkout parts modal uses the exact component snapshot schedule', () => {
  const src=read('customer/customcheckoutpage.jsx');
  assert.ok(src.includes('buildCustomerPartSchedule(components, item.quantity)'));
  for(const field of ['part.quantityPerUnit','part.totalQuantity','part.thickness','part.code']) assert.ok(src.includes(field),field);
  assert.ok(src.includes('editorSnapshot?.components'));
});

test('C3: Admin submitted design displays same per-part and multiplied quantities', () => {
  const src=read('orders/AdminSubmittedDesignPreview.jsx');
  assert.ok(src.includes('buildCustomerPartSchedule(parts, item?.quantity)'));
  assert.ok(src.includes('partSchedule.map((part)'));
  for(const field of ['part.quantityPerUnit','part.totalQuantity','part.code','part.thicknessMm']) assert.ok(src.includes(field),field);
  assert.ok(src.includes('StaffProductionBlueprintViewer'));
});
