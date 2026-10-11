import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCustomerPartSchedule, resolvePartThicknessFromGeometry } from '../src/pages/customer/customerPartSchedule.mjs';

// Exact role, code and 864x100x18 mm geometry from the Mini Cabinet source.
const toeKick = Object.freeze({
  id: 'fixture-toe-kick',
  assemblyRole: 'toe_kick',
  partRole: 'toe_kick',
  type: 'cabinet_toe_kick',
  partCode: 'CB-TOE-KICK',
  label: 'Toe Kick',
  material: 'Marine Plywood',
  width: 864, height: 100, depth: 18, qty: 1,
});

test('C3-FIX2: real Mini Cabinet toe kick is 18 mm on depth axis', () => {
  assert.deepEqual(resolvePartThicknessFromGeometry(toeKick), { value: 18, axis: 'D' });
});

test('C3-FIX2: part schedule shows same thickness and exact multiplication for two furniture units', () => {
  const before = JSON.stringify(toeKick);
  const rows = buildCustomerPartSchedule([toeKick], 2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, 'CB-TOE-KICK');
  assert.equal(rows[0].thicknessMm, 18);
  assert.equal(rows[0].thicknessAxis, 'D');
  assert.equal(rows[0].quantityPerUnit, 1);
  assert.equal(rows[0].totalQuantity, 2);
  assert.deepEqual([rows[0].width,rows[0].height,rows[0].depth], [864,100,18]);
  assert.equal(JSON.stringify(toeKick), before);
});

test('C3-FIX2: no guess based solely on labels, unknown geometry or metal hardware', () => {
  assert.deepEqual(resolvePartThicknessFromGeometry({
    type:'unknown', label:'Toe Kick', material:'Marine Plywood',width:864,height:100,depth:18
  }), {value:null,axis:''});
  assert.deepEqual(resolvePartThicknessFromGeometry({
    type:'toe_kick_bracket', partRole:'toe_kick', label:'Toe Kick Bracket',material:'Metal',width:60,height:20,depth:10
  }), {value:null,axis:''});
  assert.deepEqual(resolvePartThicknessFromGeometry({
    type:'cabinet_toe_kick', partRole:'toe_kick', width:100,height:100,depth:100
  }), {value:null,axis:''});
  assert.deepEqual(resolvePartThicknessFromGeometry({
    type:'cabinet_toe_kick', partRole:'toe_kick', width:864,height:100,depth:0
  }), {value:null,axis:''});
});

test('C3-FIX2: original panel and hardware thickness rules remain unchanged', () => {
  assert.deepEqual(resolvePartThicknessFromGeometry({type:'side_panel', width:18,height:876,depth:620}),{value:18,axis:'W'});
  assert.deepEqual(resolvePartThicknessFromGeometry({type:'door_front_panel',width:417,height:720,depth:20}),{value:20,axis:'D'});
  assert.deepEqual(resolvePartThicknessFromGeometry({type:'metal_rod',width:600,height:20,depth:20}),{value:null,axis:''});
  assert.deepEqual(resolvePartThicknessFromGeometry({type:'cabinet_toe_kick',partRole:'toe_kick', width:864,height:100,depth:18, thicknessMm:16}),{value:16,axis:''});
});

test('C3-FIX2: cart, checkout and Admin consume the same read-only schedule', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const pages = path.resolve(currentDir, '../src/pages');
  const paths = [
    'customer/CartPartScheduleDialog.jsx',
    'customer/customcheckoutpage.jsx',
    'orders/AdminSubmittedDesignPreview.jsx',
  ];
  for (const relative of paths) {
    const text = fs.readFileSync(path.join(pages, relative), 'utf8');
    assert.match(text,/buildCustomerPartSchedule/,relative);
  }
});
