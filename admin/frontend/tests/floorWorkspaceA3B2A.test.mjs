import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBlueprintCabinetRebuild as check } from '../src/pages/blueprints/data/floorWorkspaceA3B2A.mjs';
const part = (id='part', options={}) => ({
  id, type:'wr_shelf',x:100,y:2900,z:100,width:500,height:20,depth:250,
  rotationX:0,rotationY:0,rotationZ:0,visible:true,...options,
});
const run=(before,after)=>check({before,after,worldWidth:6400,worldDepth:5200,floorComponentY:3160});

test('A3B2-A accepts valid shelf replacement',()=>{
  const old=part('old'); const result=run([old],[part('new',{x:6000,width:400})]);
  assert.equal(result.ok,true);
  assert.equal(result.checkedParts,1);
});
test('A3B2-A rejects a replacement shelf beyond X',()=>{
  const result=run([part('old')],[part('new',{x:6100,width:400})]);
  assert.equal(result.code,'PART_OUTSIDE_FLOOR');
});
test('A3B2-A rejects generated drawer beyond Z',()=>{
  assert.equal(run([part('old')],[part('new',{z:5000,depth:300})]).code,'PART_OUTSIDE_FLOOR');
});
test('A3B2-A rotated door footprint checked',()=>{
  assert.equal(run([],[part('door',{x:10,z:5050,depth:500,width:20,rotationY:90})]).code,'PART_OUTSIDE_FLOOR');
});
test('A3B2-A allows valid edge contact',()=>{
  assert.equal(run([],[part('edge',{x:5900,width:500,z:4950,depth:250})]).ok,true);
});
test('A3B2-A supports clearing all shelves/fronts',()=>{
  assert.equal(run([part('old')],[]).ok,true);
});
test('A3B2-A checks geometry-modified existing shelf used by Safe Inset Pair',()=>{
  const previous=part('shelf',{x:100,z:5050,depth:100});
  assert.equal(run([previous],[{...previous,depth:160}]).code,'PART_OUTSIDE_FLOOR');
});
test('A3B2-A does not block original unchanged out-of-bounds legacy furniture',()=>{
  const legacy=part('legacy',{x:-10});
  assert.equal(run([legacy],[legacy,part('door')]).ok,true);
  assert.equal(run([legacy],[{...legacy,material:'Oak'}]).ok,true);
});
test('A3B2-A rejects any changed legacy part still out of bounds',()=>{
  const legacy=part('legacy',{x:-10});
  assert.equal(run([legacy],[{...legacy,x:-5}]).code,'PART_OUTSIDE_FLOOR');
});
test('A3B2-A change below floor blocked',()=>{
  const old=part('x'); assert.equal(run([old],[{...old,y:3150}]).code,'PART_BELOW_FLOOR');
});
test('A3B2-A rejects invalid geometry and duplicate output IDs',()=>{
  assert.equal(run([],[part('x',{width:NaN})]).code,'INVALID_PART_GEOMETRY');
  assert.equal(run([],[part('a'),part('a')]).code,'DUPLICATE_PART');
});
test('A3B2-A does not mutate builder proposal or existing parts',()=>{
  const old=Object.freeze(part('old')),current=Object.freeze(part('new'));
  const before=Object.freeze([old]), after=Object.freeze([current]);
  assert.equal(run(before,after).ok,true);
  assert.equal(old.x,100);assert.equal(current.y,2900);
});
test('A3B2-A untouched nonphysical reference does not block replacements',()=>{
  const proxy=part('proxy',{x:-10000,isReference:true});
  assert.equal(run([proxy],[proxy,part('door')]).ok,true);
});

test('A3B2-A all 8 cabinet replacement paths validate before any history or mutation',()=>{
  const file=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src/pages/blueprints/hooks/useBlueprintBuilderActions.js');
  const src=fs.readFileSync(file,'utf8');
  assert.equal((src.match(/if \(!canApplyCabinetRebuild\(nextComponents\)\) return;/g)||[]).length,8);
  const names=['buildCabinetShelfLayout3D','buildCabinetInteriorPreset3D','buildCabinetDoorLayout3D',
    'buildCabinetDrawerLayout3D','buildCabinetFrontPreset3D',
    'buildCabinetCustomBayFronts3D','buildCabinetCustomCellFronts3D'];
  for(let i=0;i<names.length;i++){
    const chunk=src.split(`const ${names[i]} = useCallback(`)[1].split(i+1<names.length ? `const ${names[i+1]} = useCallback(` : '  return {\n    buildSimpleTable3D,')[0];
    const count=names[i]==='buildCabinetDoorLayout3D'?2:1;
    assert.equal((chunk.match(/if \(!canApplyCabinetRebuild\(nextComponents\)\) return;/g)||[]).length,count,names[i]);
    // Every state-changing setComponents(nextComponents) must have the guard and
    // history after guard in the same branch; special inset is separately tested.
  }
  assert.ok(src.includes('const nextComponents = components\r\n          .filter((item) => !oldDoorIds.has') || src.includes('const nextComponents = components\n          .filter((item) => !oldDoorIds.has'));
});
