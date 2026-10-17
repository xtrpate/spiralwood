import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateBlueprintCabinetRebuild } from '../src/pages/blueprints/data/floorWorkspaceA3B2A.mjs';
import { validateBlueprintFloorEdits } from '../src/pages/blueprints/data/floorWorkspaceA3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/pages/blueprints');
const load = relative => readFileSync(path.join(root, relative), 'utf8');
const arr = load('hooks/useBlueprintArrangementActions.js');
const dup = load('hooks/useBlueprintDuplicateActions.js');
const design = load('BlueprintDesign.jsx');
const count = (source, needle) => source.split(needle).length - 1;
const make = (id, x, z, overrides = {}) => ({
  id, x, y: 2950, z, width: 250, height: 210, depth: 170,
  rotationX: 0, rotationY: 0, rotationZ: 0,
  groupId: 'example', type: 'furniture_panel', ...overrides,
});
const floor = { worldWidth: 6400, worldDepth: 5200, floorComponentY: 3160 };
const cab = (before, after) => validateBlueprintCabinetRebuild({ before, after, ...floor });
const batch = (before, changes) => validateBlueprintFloorEdits({
  components: before, updatesById: changes, ...floor,
});

test('A3B2B exact actual editor workspace forwarded into duplicate + arrangement hooks', () => {
  assert.match(design, /useBlueprintDuplicateActions\(\{[\s\S]*?worldWidth: WORLD_W,[\s\S]*?worldDepth: WORLD_D,[\s\S]*?worldHeight: WORLD_H,[\s\S]*?floorOffset: FLOOR_OFFSET,/);
  assert.match(design, /useBlueprintArrangementActions\(\{[\s\S]*?worldWidth: WORLD_W,[\s\S]*?worldDepth: WORLD_D,/);
});

test('A3B2B all duplicate operations reject before pushing undo or modifying selection', () => {
  assert.equal(count(dup, 'if (!allowDuplicateFloor(duplicated)) return;'), 3);
  assert.equal(count(dup, 'pushHistory(components);'), 3);
  assert.equal(count(dup, 'setComponents((prev) => [...prev, ...duplicated]);'), 3);
  assert.equal(count(dup, 'allowDuplicateFloor,'), 3);
  for (const segment of dup.split('if (!allowDuplicateFloor(duplicated)) return;').slice(1)) {
    assert.ok(segment.indexOf('pushHistory(components);') >= 0);
    assert.ok(segment.indexOf('pushHistory(components);') < segment.indexOf('setComponents((prev) => [...prev, ...duplicated]);'));
  }
});

test('A3B2B all mirror + eight direct arrangement setters preflight before history', () => {
  assert.equal(count(arr, 'if (!allowSceneFloorProposal(proposeFloorChange(components))) return;'), 7);
  assert.equal(count(arr, 'setComponents(proposeFloorChange);'), 7);
  assert.equal(count(arr, 'if (!allowSceneFloorProposal([...components, ...generatedLegs])) return;'), 1);
  assert.equal(count(arr, 'if (!allowSceneFloorProposal([...components, ...duplicated])) return;'), 1);
  assert.equal(count(arr, 'allowSceneFloorProposal,'), 8);
  for (const segment of arr.split('if (!allowSceneFloorProposal(proposeFloorChange(components))) return;').slice(1)) {
    assert.ok(segment.indexOf('pushHistory(') >= 0);
    assert.ok(segment.indexOf('pushHistory(') < segment.indexOf('setComponents(proposeFloorChange);'));
  }
});

test('A3B2B eight arrangement batch updates preflight before showing a success', () => {
  assert.equal(count(arr, 'allowBatchFloorEdit,'), 8);
  assert.equal(count(arr, 'if (!allowBatchFloorEdit(changesById)) return;'), 6);
  assert.equal(count(arr, 'if (!allowBatchFloorEdit(plan.changesById)) return null;'), 1);
  assert.match(arr, /const flushChangesById = \{ \[movingComp\.id\]: nextAttrs \};\s*if \(!allowBatchFloorEdit\(flushChangesById\)\) return;\s*updateManyComps\(flushChangesById\);/);
});

test('A3B2B original wood finish and dimensions stay untouched in a valid duplicate', () => {
  const before = [make('original', 450, 700, {wood_type:'Mahogany', finish:'Natural'})];
  const after = [...before, {...before[0], id:'clone', x:900, groupId:'clone-group'}];
  assert.equal(cab(before, after).ok, true);
  assert.equal(before[0].x,450);
  assert.equal(before[0].wood_type,'Mahogany');
  assert.equal(before[0].width,250);
});

test('A3B2B duplicate over right X boundary fails with zero mutation', () => {
  const before = [make('a',6100,1000)];
  const unchanged = structuredClone(before);
  const result = cab(before,[...before,make('copy',6250,1000)]);
  assert.equal(result.ok,false);
  assert.equal(result.code,'PART_OUTSIDE_FLOOR');
  assert.deepEqual(before,unchanged);
});

test('A3B2B array duplicate over Z boundary rejects the whole proposed array', () => {
  const before=[make('a',100,4730)];
  const after=[...before,make('c1',100,4940),make('c2',100,5210)];
  assert.equal(cab(before,after).ok,false);
});

test('A3B2B exact edge touch X=6400 and Z=5200 accepted', () => {
  const before=[make('old',100,100)];
  assert.equal(cab(before,[...before,make('edge',6150,5030)]).ok,true);
});

test('A3B2B mirror across near-end axis rejected without deleting original', () => {
  const original=make('original',6000,100);
  const reflected=make('mirror',6350,100);
  assert.equal(cab([original],[original,reflected]).ok,false);
  assert.equal(original.x,6000);
});

test('A3B2B layout replacing an inbounds panel with an outside panel is rejected', () => {
  const before=[make('panel',140,150)];
  assert.equal(cab(before,[{...before[0],x:-25}]).code,'PART_OUTSIDE_FLOOR');
});

test('A3B2B duplicate batch ID collision rejects all before mutation', () => {
  const a=make('same',100,100);
  assert.equal(cab([a],[a,{...a,x:600}]).code,'DUPLICATE_PART');
});

test('A3B2B unchanged legacy outside part does not block adding valid furniture', () => {
  const legacy=make('legacy',-200,100);
  const original=structuredClone(legacy);
  const result=cab([legacy],[legacy,make('inside',300,400)]);
  assert.equal(result.ok,true);
  assert.deepEqual(legacy,original);
});

test('A3B2B edited old out-of-bounds part is blocked rather than silently moved', () => {
  const legacy=make('legacy',-200,100);
  const result=cab([legacy],[{...legacy,x:-180}]);
  assert.equal(result.code,'PART_OUTSIDE_FLOOR');
});

test('A3B2B arrangement batch cannot place object outside X and Z', () => {
  const before=[make('panel',300,400)];
  assert.equal(batch(before,{panel:{x:-1}}).code,'PART_OUTSIDE_FLOOR');
  assert.equal(batch(before,{panel:{z:5150}}).code,'PART_OUTSIDE_FLOOR');
});

test('A3B2B arrangement batch full valid change is accepted', () => {
  const before=[make('panel',300,400)];
  assert.equal(batch(before,{panel:{x:500,z:900}}).ok,true);
});

test('A3B2B below-floor cabinet replacement cannot be committed', () => {
  const before=[make('panel',300,400)];
  assert.equal(cab(before,[{...before[0],y:3000}]).code,'PART_BELOW_FLOOR');
});

test('A3B2B array duplicating upward cannot sink a cloned part below floor', () => {
  const before=[make('a',300,400)];
  const aboveFloor = make('new',300,400,{y:3000});
  assert.equal(cab(before,[...before,aboveFloor]).code,'PART_BELOW_FLOOR');
});
