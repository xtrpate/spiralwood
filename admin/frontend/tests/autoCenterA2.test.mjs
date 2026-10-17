// A2 integration contract tests. A1 runs its 12 dynamic geometry tests separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planBlueprintAutoCenter } from '../src/pages/blueprints/data/floorWorkspaceA1.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => fs.readFileSync(path.join(repo,file),'utf8');
const controls = read('admin/frontend/src/pages/blueprints/3d/components/QuickControlsBar.jsx');
const viewer = read('admin/frontend/src/pages/blueprints/3d/threeDViewer.jsx');
const design = read('admin/frontend/src/pages/blueprints/BlueprintDesign.jsx');
const W=6400,D=5200;
const part = (id, groupId, x, z, extra={})=>({
  id,groupId, type:'furniture_bottom_panel',x,y:2800,z,
  width:100,height:18,depth:100,rotationX:0,rotationY:0,rotationZ:0,
  ...extra,
});
const propose = (components,selectedIds)=>planBlueprintAutoCenter({
  components,selectedIds,worldWidth:W,worldDepth:D,
});

test('A2 button is a sibling BEFORE Controls and shares the same two equal-width grid columns',()=>{
  assert.match(controls,/export function QuickControlsBar\(\{ onAutoCenter, canAutoCenter = false \}\)/);
  assert.match(controls,/gridTemplateColumns: "repeat\(2, minmax\(0, 1fr\)\)"/);
  const auto=controls.indexOf('onClick={onAutoCenter}');
  const existing=controls.indexOf('aria-expanded={open}');
  assert.ok(auto>0 && existing>auto,'Auto Center must sit before Controls');
  assert.match(controls,/disabled=\{!canAutoCenter\}/);
  assert.match(controls,/height: 30,[\s\S]*?Auto Center/);
  assert.match(controls,/onMouseDown=\{stopWorkspaceInteraction\}/);
  assert.match(controls,/onPointerDown=\{stopWorkspaceInteraction\}/);
  assert.match(controls,/aria-controls="wisdom-3d-controls-panel"/);
});

test('A2 viewer disables button outside editing and during exploded/placement workflows',()=>{
  assert.match(viewer,/onAutoCenter,\s*canAutoCenter = false,/);
  assert.match(viewer,/onAutoCenter=\{onAutoCenter\}/);
  assert.match(viewer,/canAutoCenter=\{Boolean\(canAutoCenter && !isExploded3D && !pendingPlacement && !isLibraryDragPlacing && editorMode === "editable"\)\}/);
});

test('A2 editor uses real selection and the A1 pure planner, never moves the full scene implicitly',()=>{
  assert.match(design,/import \{ planBlueprintAutoCenter \} from "\.\/data\/floorWorkspaceA1\.mjs"/);
  assert.match(design,/selectedIds\.length\s*\? \[\.\.\.new Set\(selectedIds\.filter\(Boolean\)\)\]/);
  assert.match(design,/selectedIds: chosenIds/);
  assert.match(design,/worldWidth: WORLD_W, worldDepth: WORLD_D/);
  assert.match(design,/onAutoCenter=\{handleAutoCenter3D\}/);
  assert.match(design,/canAutoCenter=\{canAutoCenter3D\}/);
  assert.match(design,/updateManyComps\(proposal\.updatesById\)/);
  assert.doesNotMatch(design,/setComponents\(.*proposal\.updatesById/);
});

test('A2 disables selection while locked, saving, pending placement, manual preview or staged review',()=>{
  assert.match(design,/const canAutoCenter3D =\s*editorMode === "editable" &&\s*!saving &&\s*!pendingPlacement &&\s*!manualPreview3D &&\s*!stagedManualReviewU4 &&/);
  assert.match(design,/!activeSelectedComponents3D\.some\(\(part\) => isLocked\(part\)\)/);
  assert.match(design,/chosen\.some\(\(part\) => isLocked\(part\)\)/);
  assert.match(design,/hasStoredManualReviewU4 && !window\.confirm\(/);
});

test('A2 keeps existing batch Undo/Redo integration and saves manually',()=>{
  assert.match(design,/const updateManyComps = useCallback/);
  assert.match(design,/if \(!options\.skipHistory\) \{\s*pushHistory\(components\);\s*\}/);
  assert.match(design,/updateManyComps\(proposal\.updatesById\)/);
  assert.doesNotMatch(design,/handleAutoCenter3D[\s\S]*?api\.put\(/);
});

test('A2 operational proposal only changes selected grouped furniture, and collision blocks all updates',()=>{
  const a=[part('left','A',100,100),part('right','A',200,100)];
  const other=part('other','B',5300,4500);
  const before=structuredClone([...a,other]);
  const proposal=propose(before,['left','right']);
  assert.equal(proposal.ok,true,JSON.stringify(proposal));
  assert.deepEqual(Object.keys(proposal.updatesById).sort(),['left','right']);
  assert.deepEqual(before,[...a,other]);
  assert.equal(propose(before,['left']).code,'INCOMPLETE_ASSEMBLY');
  assert.equal(propose([...a,part('block','B',3150,2550)],['left','right']).code,'CENTER_OCCUPIED');
  const moved=before.map(p=>({...p,...(proposal.updatesById[p.id]||{})}));
  assert.equal(moved[2].x,other.x);assert.equal(moved[2].z,other.z);
  assert.equal(moved[1].x-moved[0].x,100);
  assert.equal(moved[0].y,a[0].y);
});
