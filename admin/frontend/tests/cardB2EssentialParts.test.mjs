import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (pathInRepo) => fs.readFileSync(path.join(root, pathInRepo), 'utf8');
const furniture = read('admin/frontend/src/pages/blueprints/data/furnitureTypes.js');
const library = read('admin/frontend/src/pages/blueprints/3d/components/FurnitureLibraryPanel.jsx');
const insertion = read('admin/frontend/src/pages/blueprints/hooks/useBlueprintComponentInsertion.js');
const props = read('admin/frontend/src/pages/blueprints/3d/components/PropertiesPanel.jsx');

function literalArray(name, source, context = {}) {
  const match = source.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  assert.ok(match, `${name} array must exist`);
  return vm.runInNewContext(match[1], context, {timeout: 1200});
}
const base = literalArray('FURNITURE_PART_TYPES', furniture);
const chair = literalArray('CHAIR_PART_TYPES', furniture);
const groups = literalArray('COMPONENT_LIBRARY_GROUPS', furniture, {
  FURNITURE_TEMPLATE_TYPES: [], CHAIR_TEMPLATE_TYPES: [],
  FURNITURE_PART_TYPES: base, CHAIR_PART_TYPES: chair,
  WOODWORKING_PROFILE_TYPES: [], ROUNDED_BOX_TYPES: [],
  CIRCLE_TYPES: [], TRIANGLE_TYPES: [], CUBE_TYPES: [], TRAPEZOID_TYPES: [],
});
const customParts = (a) => Array.from(a, x => ({...x}));
const partGroups = groups.filter(group => /parts/i.test(group.label) && !/custom/i.test(group.label));
const exposed = partGroups.flatMap(group => group.label === 'Chair Parts'
  ? group.items.filter(item => ['chair_seat_panel', 'chair_back_slat'].includes(item.type))
  : group.items);

const originalTypes = [
  'furniture_board_panel', 'furniture_shelf', 'furniture_leg',
  'furniture_side_panel', 'furniture_top_panel', 'furniture_bottom_panel',
  'furniture_back_panel', 'furniture_apron_rail',
];
const newRoles = new Map([
  ['furniture_divider_panel','divider_panel'],
  ['furniture_door_panel','door'],
  ['furniture_drawer_front','drawer_front'],
  ['furniture_support_brace','support_brace'],
  ['furniture_toe_kick_base','toe_kick'],
  ['furniture_headboard','headboard'],
  ['furniture_bed_side_rail','bed_side_rail'],
]);

test('Card B2: 8 existing generic components preserved, plus exactly 7 new generic parts', () => {
  assert.equal(base.length, 15);
  assert.deepEqual(Array.from(base.slice(0, 8), x => x.type), originalTypes);
  assert.deepEqual(Array.from(base.slice(8), x => x.type), Array.from(newRoles.keys()));
  for (const obj of base) {
    assert.ok(obj.w > 0 && obj.h > 0 && obj.d > 0, `positive dimensions for ${obj.type}`);
    assert.ok(obj.partRole, `explicit structural role for ${obj.type}`);
  }
  for (const obj of base.slice(8)) {
    assert.equal(obj.partRole, newRoles.get(obj.type));
    assert.equal(obj.unitPrice, 0, `no placeholder sale price for ${obj.type}`);
    assert.equal(obj.blueprintStyle, 'part');
  }
  assert.equal(new Set(base.map(x => x.type)).size, 15);
});

test('Card B2: precisely 17 distinct visible parts in the 5 planned groups', () => {
  assert.deepEqual(Array.from(partGroups, g => [g.label, g.items.length]), [
    ['Panels & Shelves (Parts)', 7],
    ['Legs & Supports (Parts)', 4],
    ['Doors & Drawers (Parts)', 2],
    ['Chair Parts', 7], // filter of existing seven applied by 3D panel
    ['Bed Parts', 2],
  ]);
  assert.equal(exposed.length, 17);
  assert.equal(new Set(exposed.map(x => x.type)).size, 17);
  assert.match(library, /group.label === "Chair Parts"/);
  assert.match(library, /\["chair_seat_panel", "chair_back_slat"\]\.includes\(item\.type\)/);
  for (const x of exposed) assert.ok(x.label);
});

test('Card B2: legacy chair parts and builders unaffected; manual faces do not auto-animate', () => {
  assert.equal(chair.length, 7);
  assert.equal(base.find(x => x.type === 'furniture_door_panel').partFunction, 'normal');
  assert.equal(base.find(x => x.type === 'furniture_drawer_front').partFunction, 'normal');
  assert.match(insertion, /partFunction: typeDef\.partFunction \|\| "auto"/);
  assert.match(insertion, /partRole: typeDef\.partRole \|\| ""/);
  assert.match(insertion, /setComponents\(\(previous\) => \[\.\.\.previous, newComponent\]\)/);
  assert.match(props, /function PartNameEditor\(/); // B1 remains
});
