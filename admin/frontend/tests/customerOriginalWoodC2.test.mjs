import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCustomerWoodEligibleComponent, getCustomerWoodEligibleTargetIds } from '../src/pages/customer/customerWoodEligibility.mjs';
import { getRequestedWoodTypeSummary } from '../src/pages/customer/customerWoodTypes.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.resolve(dir, '..', 'src/pages/customer', file), 'utf8');
const viewer = src('customer3dviewer.jsx');
const customize = src('customizepage.jsx');

const wood = { id: 'panel', label: 'Left Side Panel', type: 'wr_side_panel', partRole: 'left_side_panel', material: 'Marine Plywood', requested_wood_type: '' };
const door = { id: 'door', label: 'Door Front with Handle', type: 'drawer_front_panel', partRole: 'drawer_front', material: 'Plywood + Laminate', requested_wood_type: '' };
const hinge = { id: 'hinge', label: 'Door Hinge', type: 'cabinet_hinge', material: 'Steel', requested_wood_type: '' };
const rod = { id: 'rod', label: 'Hanging Rod', type: 'wardrobe_rod', partRole: 'hanger_rod', material: 'Stainless Steel', requested_wood_type: '' };
const knob = { id: 'knob', label: 'Cabinet Knob', type: 'cabinet_knob', partRole: 'drawer_handle', material: 'Wood', requested_wood_type: '' };
const glass = { id: 'glass', label: 'Glass Panel', type: 'door_panel', material: 'Tempered Glass', requested_wood_type: '' };
const unknown = { id: 'unknown', label: 'Unclassified Piece', type: 'custom_component', material: '', requested_wood_type: '' };

test('C2: wood requests support wooden structural parts and fail closed for hardware/non-wood/unknown', () => {
  assert.equal(isCustomerWoodEligibleComponent(wood), true);
  assert.equal(isCustomerWoodEligibleComponent(door), true);
  for (const part of [hinge, rod, knob, glass, unknown]) {
    assert.equal(isCustomerWoodEligibleComponent(part), false, `${part.id} must not offer wood`);
  }
});

test('C2: whole-furniture wood target excludes metal, hardware and glass without losing wooden parts', () => {
  const parts = [wood, door, hinge, rod, knob, glass, unknown];
  const selection = getCustomerWoodEligibleTargetIds(parts, parts.map((p) => p.id));
  assert.deepEqual([...selection], ['panel', 'door']);
  assert.deepEqual([...getCustomerWoodEligibleTargetIds(parts, ['door', 'hinge'])], ['door']);
  assert.deepEqual([...getCustomerWoodEligibleTargetIds(parts, ['hinge', 'rod'])], []);
});

test('C2: Original/unmodified is allowed to reach Add to Cart without requiring a wood request', () => {
  const start = viewer.indexOf('  const handleApply = () => {');
  const end = viewer.indexOf('  const undoDisabled', start);
  assert.ok(start >= 0 && end > start, 'Add to Cart code must exist');
  const apply = viewer.slice(start, end);
  assert.doesNotMatch(apply, /Choose a wood type|!getRequestedWoodTypeSummary/);
  assert.match(apply, /onApply\(\{/);
  assert.equal(getRequestedWoodTypeSummary([wood, door]), '');
});

test('C2: viewer never applies requested wood to excluded targets or falsely labels hardware', () => {
  assert.match(viewer, /getCustomerWoodEligibleTargetIds\(components, targetIds\)/);
  assert.match(viewer, /if \(!eligibleTargetIds\.has\(component\.id\)\) return component;/);
  assert.match(viewer, /components\.some\(isCustomerWoodEligibleComponent\)/);
  assert.match(viewer, /woodEligibleGroupIds\.length\) return null;/);
  assert.match(viewer, /getRequestedWoodTypeSummary\(parts\.filter\(isCustomerWoodEligibleComponent\)\)/);
  assert.match(viewer, /material: component\.material/);
  assert.match(viewer, /requested_wood_type: chosen\.label/);
});

test('C2: explicit per-part requested wood affects stable cart identity even when appearance matches', async () => {
  const start = customize.indexOf('const stableText =');
  const end = customize.indexOf('const resolveCatalogCategory =', start);
  assert.ok(start >= 0 && end > start, 'The cart-key implementation must exist');
  const extracted = customize.slice(start, end)
    .replace('const buildStableCustomCartKey =', 'export const buildStableCustomCartKey =');
  const module = await import(`data:text/javascript;base64,${Buffer.from(extracted).toString('base64')}`);
  const input = (requestedWoodType) => ({
    productId: 278, templateProfile: 'cabinet', width: 900, height: 876, depth: 620,
    woodType: 'Original', finishColor: '', color: '', doorStyle: '', hardware: '',
    initialMessage: '', referencePhotos: [],
    components: [{...wood, x:0,y:0,z:0,width:18,height:876,depth:620,requested_wood_type:requestedWoodType}],
  });
  const original = module.buildStableCustomCartKey(input(''));
  const oak = module.buildStableCustomCartKey(input('Oak'));
  const pine = module.buildStableCustomCartKey(input('Pine'));
  assert.notEqual(original, oak);
  assert.notEqual(oak, pine);
  assert.equal(module.buildStableCustomCartKey(input('Oak')), oak, 'identity must remain stable');
});
