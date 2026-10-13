import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const data = read('admin/frontend/src/pages/blueprints/data/furnitureTypes.js');
const library = read('admin/frontend/src/pages/blueprints/3d/components/FurnitureLibraryPanel.jsx');
const properties = read('admin/frontend/src/pages/blueprints/3d/components/PropertiesPanel.jsx');
const insertion = read('admin/frontend/src/pages/blueprints/hooks/useBlueprintComponentInsertion.js');

test('Card B1: groups existing furniture parts without adding, deleting, or changing their roles', () => {
  const source = data.match(/const FURNITURE_PART_TYPES = \[([\s\S]*?)\n\];/);
  assert.ok(source, 'original part definitions exist');
  const roles = [...source[1].matchAll(/partRole: "([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(roles.slice(0, 8), ['board_panel','shelf','leg','side_panel','top_panel','bottom_panel','back_panel','apron_rail']);
  const panels = ['board_panel','shelf','side_panel','top_panel','bottom_panel','back_panel'];
  const supports = ['leg','apron_rail'];
  assert.deepEqual([...panels, ...supports].sort(), roles.slice(0, 8).sort());
  assert.match(data, /label: "Panels & Shelves \(Parts\)"/);
  assert.match(data, /label: "Legs & Supports \(Parts\)"/);
  assert.match(data, /items: FURNITURE_PART_TYPES\.filter\(\(item\) =>/);
  assert.match(library, /getLibraryBucket\(group\.label\)/);
  assert.match(library, /activeTab === "parts"/);
});

test('Card B1: 3D Part Name editing is disabled for locked/read-only and changes label only', () => {
  assert.match(properties, /function PartNameEditor\(\{ component, disabled, onCommit \}\)/);
  assert.match(properties, /aria-label="Part Name"/);
  assert.match(properties, /onBlur=\{commit\}/);
  assert.match(properties, /disabled=\{editorMode !== "editable" \|\| isLocked\(selectedComp\)\}/);
  assert.match(properties, /onCommit=\{\(label\) => onChange\(selectedComp\.id, \{ label \}\)\}/);
  assert.match(properties, /Renaming does not change the part type or its resize rules/);
  assert.match(insertion, /partRole: typeDef\.partRole \|\| ""/);
  assert.match(insertion, /label: typeDef\.label/);
});
