import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCustomerManualFivePartTableSupport as support,
  planCustomerManualFivePartTableResize as plan,
} from '../src/utils/customerManualFivePartTableResize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// Exact W/H/D and x/y/z from the user's read-only Blueprint #288 export.
// IDs are sanitized: tests do not need real production database identifiers.
const common = { qty: 1, locked: false, material: 'Oak Wood', wood_type: 'Oak Wood', groupId: null, assemblyId: null, assemblyType: '' };
const make = (id, partCode, type, partRole, x, y, z, width, height, depth) => ({
  ...common, id, partCode, type, partRole, x, y, z, width, height, depth,
});
const original = [
  make('top', 'PNL-QFLQRR', 'furniture_board_panel', 'board_panel', 1408,2451,1708,1064,18,985),
  make('leg-1', 'LEG-02RWAP', 'furniture_leg', 'leg', 1460,2460,2540,50,700,50),
  make('leg-2', 'LEG-QRKJXG', 'furniture_leg', 'leg', 2400,2460,2540,50,700,50),
  make('leg-3', 'LEG-KDRI08', 'furniture_leg', 'leg', 1460,2460,1855,50,700,50),
  make('leg-4', 'LEG-OM3O6E', 'furniture_leg', 'leg', 2400,2460,1855,50,700,50),
];
const unchanged = (before, after) => ['id', 'partCode', 'type', 'partRole', 'material', 'wood_type', 'qty', 'locked', 'constructionMethod', 'assemblyId', 'groupId', 'finish', 'requested_wood_type'].every(field => before[field] === after[field]);
const size = parts => support(parts);
const ends = parts => parts.filter(p => p.partRole === 'leg').map(p => Number(p.y) + Number(p.height));

 test('R1: user Blueprint #288 five-part layout is eligible; exact measured bounds', () => {
  const s = size(original);
  assert.equal(s.ok, true, s.error);
  assert.deepEqual([s.width, s.height, s.depth], [1064, 709, 985]);
  assert.equal(s.tabletopThickness, 18);
  assert.equal(s.legSection, 50);
  assert.equal(s.overlap, 9);
  assert.deepEqual(s.insets, {left:52, right:22, back:147, front:103});
 });

for (const [axis, wanted] of [['width', 1140], ['height', 750], ['depth', 1050]]) {
 test(`R1: change ${axis} while keeping parts, floor, joint overlap, and other axes`, () => {
  const originalSnapshot = JSON.stringify(original);
  const before = size(original);
  const result = plan(original, axis, wanted);
  assert.equal(result.ok, true, result.error);
  assert.equal(size(result.parts)[axis], wanted);
  for (const other of ['width', 'height', 'depth']) if (other !== axis) assert.equal(size(result.parts)[other], before[other]);
  assert.deepEqual(size(result.parts).insets, before.insets);
  assert.equal(size(result.parts).overlap, before.overlap);
  assert.deepEqual(ends(result.parts), ends(original));
  result.parts.forEach((part, index) => {
   assert.ok(unchanged(original[index], part));
   if (part.partRole === 'leg') {
    assert.equal(part.width, 50);
    assert.equal(part.depth, 50);
   } else assert.equal(part.height, 18);
  });
  assert.equal(JSON.stringify(original), originalSnapshot);
 });
}

test('R1: repeated edits and save/reload preserve supported physical geometry', () => {
 const wide = plan(original, 'width', 1190); assert.ok(wide.ok);
 const tall = plan(wide.parts, 'height', 780); assert.ok(tall.ok, tall.error);
 const deep = plan(tall.parts, 'depth', 1090); assert.ok(deep.ok, deep.error);
 const reload = JSON.parse(JSON.stringify(deep.parts));
 const check = size(reload);
 assert.equal(check.ok, true);
 assert.deepEqual([check.width, check.height, check.depth], [1190,780,1090]);
 assert.deepEqual(ends(reload), ends(original));
});

test('R1: bad requested targets never produce geometry or mutate original', () => {
 const snapshot=JSON.stringify(original);
 for (const [axis, target] of [['width', 899], ['height', 801], ['depth',1151], ['width',NaN],['depth',1.4],['foo',1000]]) {
   assert.equal(plan(original,axis,target).ok,false);
 }
 assert.equal(JSON.stringify(original),snapshot);
});

test('R1: foreign/unsupported furniture, hidden/locked, and missing structural parts fail closed', () => {
 assert.equal(size([]).ok,false);
 assert.equal(size(original.slice(0,4)).ok,false);
 assert.equal(size([...original, {...original[0],id:'extra'}]).ok,false);
 for (const change of [
   {locked:true}, {visible:false}, {rotationY:90}, {width:-1}, {groupId:'broken'},
   {assemblyType:'dining_table'}, {qty:2}, {partCode:'DT-TOP'}, {material:''},
 ]) {
   const altered=original.map((p,i)=>i===0?{...p,...change}:p);
   assert.equal(size(altered).ok,false,JSON.stringify(change));
 }
});

test('R1: one displaced leg or unequal section cannot silently unlock', () => {
 for (const [index, patch] of [[1,{x:1490}], [1,{y:2465}], [2,{width:70}], [3,{z:1709}], [4,{height:710}]]) {
  const altered=original.map((p,i)=>i===index?{...p,...patch}:p);
  assert.equal(size(altered).ok,false,JSON.stringify(patch));
 }
});

test('R1: existing nine-part verified tables are not treated as 5-part manual tables', () => {
 const nine = [...original,...[1,2,3,4].map(i=>({...original[1],id:`part${i}`,partCode:`X${i}`}))];
 assert.equal(size(nine).ok,false);
});

test('R1: customer viewer dispatches table resize without generic scaling or changing 9-part policy', () => {
 const source=fs.readFileSync(path.join(root,'admin/frontend/src/pages/customer/customer3dviewer.jsx'),'utf8');
 assert.match(source,/getCustomerManualFivePartTableSupport\(components\)/);
 assert.match(source,/tableSupport\.manualFivePart\s*\? planCustomerManualFivePartTableResize/);
 assert.match(source,/getCustomerDiningTableResizeSupport\(components\)/);
 assert.match(source,/!canResizeTable\("width"\)/);
 assert.match(source,/!canResizeTable\("height"\)/);
 assert.match(source,/!canResizeTable\("depth"\)/);
 assert.match(source,/Manual five-part table/);
 assert.match(source,/tableSupport\.ok \? "Smart table"/); // C5 compatibility
});
