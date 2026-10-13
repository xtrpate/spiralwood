import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const hookSource = read('admin/frontend/src/pages/blueprints/hooks/useBlueprintComponentInsertion.js');
const viewerSource = read('admin/frontend/src/pages/blueprints/3d/threeDViewer.jsx');

function runHookFor(typeDef) {
  let identityCount = 0;
  const state = { components: [], pending: null, activeChairBuild: null, history: 0, notices: [] };
  const ctx = {
    useCallback: (callback) => callback,
    toast: { success: (m) => state.notices.push(m), error: (m) => state.notices.push(m) },
    FURNITURE_TEMPLATE_SET: new Set(),
    normalizeComponent: (part) => part,
    isChairPartType: (type) => type === 'chair_seat_panel' || type === 'chair_back_slat',
    applyWoodFinish: () => ({}),
    getDefaultFinishId: () => null,
    getNextChairOrigin: () => ({x:100,z:100}),
    getNextAssemblyOrigin: () => ({x:100,z:100}),
    snap: (value) => Math.round(value),
    makeId: () => 'test-' + ++identityCount,
    makeGroupId: () => 'test-chair-group',
    buildFurnitureTemplateParts: () => [],
    buildDiningChairParts: () => ({parts: []}),
    getPlacedGenericComponentData: () => ({x: 0, y: 0, z: 0}),
    getChairManualPlacement: (def, groupParts) => ({
      label: def.type === 'chair_seat_panel' ? 'Seat Panel' : `Back Slat ${groupParts.length + 1}`,
      partCode: def.type === 'chair_seat_panel' ? 'SP' : `BS${groupParts.length + 1}`,
      // Stale legacy automatic coordinates must NOT win over mouse drop.
      x: 10, y: 20, z: 30,
      width: def.w, height: def.h, depth: def.d,
    }),
  };
  const hookCode = hookSource.slice(hookSource.indexOf('export function useBlueprintComponentInsertion'))
    .replace(/^export function /, 'function ');
  assert.ok(hookCode.startsWith('function useBlueprintComponentInsertion'), 'hook found');
  vm.runInNewContext(hookCode + '\nthis.useTestHook = useBlueprintComponentInsertion;', ctx, {timeout: 1500});
  const makeProps = () => ({
    components: state.components,
    setComponents: (updater) => { state.components = updater(state.components); },
    selectedComp: null,
    activeChairBuild: state.activeChairBuild,
    setActiveChairBuild: (value) => { state.activeChairBuild = value; },
    pendingPlacement: state.pending,
    setPendingPlacement: (value) => { state.pending = value; },
    editorMode: 'editable',
    view: '3d',
    pushHistory: () => { state.history++; },
    setSelectedId: () => {},
    setEdit3DId: () => {},
    setSelectedIds: () => {},
    setTransformMode: () => {},
    worldDimensions: {w: 4000, h: 3000, d: 4000},
    floorOffset: 40,
  });
  const first = ctx.useTestHook(makeProps());
  first.addComponent(typeDef, {source: 'drag', silent: true});
  return {state, drop: (point) => ctx.useTestHook(makeProps()).placePendingComponent(point)};
}

test('B3: Seat Panel is pending on mouse-down, placed only after actual drop, retaining chair group and code', () => {
  const {state,drop} = runHookFor({type:'chair_seat_panel',label:'Seat Panel',w:420,h:20,d:420,material:'Oak Wood',category:'Chair Parts'});
  assert.equal(state.components.length, 0, 'must not add immediately');
  assert.equal(state.history, 0, 'must not change undo history until drop');
  assert.equal(state.activeChairBuild, null, 'must not create a build immediately');
  assert.equal(state.pending?.type,'chair_seat_panel');
  drop({worldX: 500, worldZ: 600});
  assert.equal(state.components.length, 1);
  assert.equal(state.history, 1);
  assert.equal(state.pending, null);
  assert.equal(state.components[0].x, 2290); // worldX - half width + half workspace
  assert.equal(state.components[0].y, 2940); // floor (3000 - 40) - 20
  assert.equal(state.components[0].z, 2390); // worldZ - half depth + half workspace
  assert.equal(state.components[0].partCode, 'SP');
  assert.equal(state.components[0].groupType, 'chair');
});

test('B3: Back Slat is not inserted until dropped at the requested coordinate', () => {
  const {state,drop} = runHookFor({type:'chair_back_slat',label:'Back Slat',w:320,h:18,d:20,material:'Oak Wood',category:'Chair Parts'});
  assert.equal(state.components.length, 0);
  assert.equal(state.pending?.placementSource, 'drag');
  drop({worldX: -200, worldZ: 300});
  assert.equal(state.components.length, 1);
  assert.equal(state.components[0].x, 1640);
  assert.equal(state.components[0].y, 2942);
  assert.equal(state.components[0].z, 2290);
  assert.equal(state.components[0].partCode, 'BS1');
});

test('B3: drag cancelled without drop adds nothing and leaves no undo entry', () => {
  const {state} = runHookFor({type:'chair_seat_panel',label:'Seat Panel',w:420,h:20,d:420,material:'Oak Wood'});
  state.pending = null; // onCancelPlacement clears pending state in app
  assert.equal(state.components.length, 0);
  assert.equal(state.history, 0);
});

test('B3: drag release requires raycast at drop point inside 3D canvas, never fallback preview', () => {
  const region = viewerSource.split('const onPointerUp = (e) => {')[1]?.split('if (isSelectingRef.current) {')[0] || '';
  assert.ok(region.length > 0, 'pointer-up handler exists');
  assert.match(region, /const pointerPlacement = syncPreviewFromPointerEvent\(e, dragState\.item\)/);
  assert.match(region, /const previewPlacement = pointerPlacement\s*\? getPlacementFromPreviewObject/);
  assert.match(region, /dragState\.moved\s*&&\s*pointerPlacement\s*&&\s*pendingPlacementRef\.current/);
  assert.doesNotMatch(region, /previewPlacementRef\.current\s*\)\s*&&/);
  assert.match(viewerSource, /if \(!isInsideCanvas\) return null;/);
});
