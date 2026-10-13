import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const furniture = read('admin/frontend/src/pages/blueprints/data/furnitureTypes.js');
const library = read('admin/frontend/src/pages/blueprints/3d/components/FurnitureLibraryPanel.jsx');
const insertion = read('admin/frontend/src/pages/blueprints/hooks/useBlueprintComponentInsertion.js');
const props = read('admin/frontend/src/pages/blueprints/3d/components/PropertiesPanel.jsx');

function literalArray(name, source, context = {}) {
  const match = source.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  assert.ok(match, `${name} definition must exist`);
  return vm.runInNewContext(match[1], context, { timeout: 1200 });
}

const base = literalArray('FURNITURE_PART_TYPES', furniture);
const chair = literalArray('CHAIR_PART_TYPES', furniture);
const groups = literalArray('COMPONENT_LIBRARY_GROUPS', furniture, {
  FURNITURE_TEMPLATE_TYPES: [], CHAIR_TEMPLATE_TYPES: [],
  FURNITURE_PART_TYPES: base, CHAIR_PART_TYPES: chair,
  WOODWORKING_PROFILE_TYPES: [], ROUNDED_BOX_TYPES: [],
  CIRCLE_TYPES: [], TRIANGLE_TYPES: [], CUBE_TYPES: [], TRAPEZOID_TYPES: [],
});
const originalTypes = [
  'furniture_board_panel', 'furniture_shelf', 'furniture_leg',
  'furniture_side_panel', 'furniture_top_panel', 'furniture_bottom_panel',
  'furniture_back_panel', 'furniture_apron_rail',
];

// Preserve the historical B2 definitions for old saved blueprint compatibility.
// New Admin insertions must offer only the original eight basic types.
test('Restore original eight: source keeps the original 8 generic parts unchanged', () => {
  assert.deepEqual(Array.from(base.slice(0, 8), x => x.type), originalTypes);
  assert.equal(base.length, 15, 'retain prior definitions for already-saved B2 designs');
  assert.equal(new Set(base.map(x => x.type)).size, 15);
  for (const x of base) {
    assert.ok(x.w > 0 && x.h > 0 && x.d > 0);
    assert.ok(x.partRole);
  }
});

test('Restore original eight: only Panels & Shelves (6) and Legs & Supports (2) are displayed', () => {
  const choices = groups.filter(g => /parts/i.test(g.label) && !/custom/i.test(g.label));
  assert.deepEqual(Array.from(choices.filter(g => g.label !== 'Chair Parts'), g => [g.label, g.items.length]), [
    ['Panels & Shelves (Parts)', 6],
    ['Legs & Supports (Parts)', 2],
  ]);
  assert.match(library, /\["Chair Parts", "Custom Shape Parts", "Custom Shapes"\]\.includes\(group\.label\)/);
  assert.doesNotMatch(library, /group\.label === "Chair Parts"/);
  const visible = choices.filter(g => g.label !== 'Chair Parts').flatMap(g => g.items);
  assert.equal(visible.length, 8);
  assert.deepEqual(Array.from(visible, x => x.type).sort(), originalTypes.slice().sort());
});

test('Restore original eight: previously placed B2 parts, naming, chair insertion and builders stay compatible', () => {
  assert.equal(chair.length, 7);
  assert.ok(base.some(x => x.type === 'furniture_door_panel'));
  assert.ok(base.some(x => x.type === 'furniture_drawer_front'));
  assert.match(props, /function PartNameEditor\(/);
  assert.match(insertion, /partRole: typeDef\.partRole \|\| ""/);
  assert.match(insertion, /getChairManualPlacement/);
});
