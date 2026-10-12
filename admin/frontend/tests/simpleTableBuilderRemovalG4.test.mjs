import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pre = 'admin/frontend/src/pages/blueprints/';
const panel = read(pre + '3d/components/FurnitureToolsPanel.jsx');
const viewer = read(pre + '3d/threeDViewer.jsx');
const design = read(pre + 'BlueprintDesign.jsx');
const legacy = read(pre + 'hooks/useBlueprintBuilderActions.js');
const integrity = read('admin/backend/tests/blueprintManagementUiCleanupIntegrity.test.js');
const lib = read(pre + '3d/components/FurnitureLibraryPanel.jsx');

test('G4: duplicate Simple Table Builder form/button is absent in Admin Tools', () => {
  for (const forbidden of ['Simple Table Builder', 'Build Simple Table', 'simpleTableWidth',
    'simpleTableDepth', 'simpleTableHeight', 'canSimpleTableBuilder',
    'canBuildSimpleTable', 'onBuildSimpleTable']) {
    assert.ok(!panel.includes(forbidden), forbidden);
  }
  for (const needed of ['Base Cabinet Builder', 'Wardrobe Builder',
    'Shelf Layout', 'Door Builder', 'Drawer Builder']) {
    assert.ok(panel.includes(needed), needed);
  }
});
test('G4: removed callbacks cannot be reached through Customer-facing or Admin 3D props', () => {
  for (const source of [viewer, design]) {
    for (const forbidden of ['onBuildSimpleTable', 'canBuildSimpleTable']) {
      assert.ok(!source.includes(forbidden), forbidden);
    }
  }
  assert.ok(!design.includes('buildSimpleTable3D'));
});
test('G4: legacy assembly handling and historical parts are not deleted', () => {
  assert.ok(legacy.includes('const buildSimpleTable3D = useCallback('),
    'Historical builder algorithm kept internally, but unreachable from UI');
  assert.ok(legacy.includes('buildCabinetBox3D'));
  assert.ok(lib.includes('template_dining_table'));
});
test('G4: previous integrity test now forbids duplicate UI rather than requiring it', () => {
  assert.ok(integrity.includes('Retired duplicate Simple Table Builder'));
  assert.ok(!integrity.includes('"Simple Table Builder", "Base Cabinet Builder"'));
});
