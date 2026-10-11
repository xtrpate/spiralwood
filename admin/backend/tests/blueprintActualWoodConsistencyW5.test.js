// W5 actual-wood production validation. No DB, API, or build dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../../..');
const relative = (file) => path.join(root, 'admin/frontend/src/pages/blueprints', file);
const read = (file) => fs.readFileSync(relative(file), 'utf8');
let wood;
const getWood = async () => wood ??= await import(pathToFileURL(relative('data/actualWoodMaterialValidation.mjs')).href);
const part = (o = {}) => ({
  id: 'door-left', partCode: 'CAB-DOOR-L', label: 'Left Door', type: 'cabinet_door',
  requested_wood_type: 'Pine', material: 'Marine Plywood',
  width: 417, height: 720, depth: 20, qty: 1,
  constructionMethod: 'single', ...o,
});

test('W5 actual-wood requests reject plywood, veneer, finish and wrong species', async () => {
  const w = await getWood();
  for (const material of ['Marine Plywood', 'Pine Plywood', 'Pine Veneer', 'Pine Finish', 'Mahogany Wood', 'Solid Wood', '']) {
    assert.equal(w.matchesRequestedActualWood(part({ material })), false, material);
    assert.equal(w.getActualWoodValidationStatus(part({ material })), 'material_mismatch');
  }
  for (const material of ['Pine', 'Pine Wood', 'Solid Pine', 'Solid Pine Wood', '  pine wood  ']) {
    assert.equal(w.matchesRequestedActualWood(part({ material })), true, material);
  }
});

test('W5 explicit Admin review stamp persists until specification changes', async () => {
  const w = await getWood();
  const candidate = part({ material: 'Pine Wood' });
  assert.equal(w.getActualWoodValidationStatus(candidate), 'unconfirmed');
  const confirmed = { ...candidate, woodMaterialValidationSignature: w.getActualWoodValidationSignature(candidate) };
  assert.equal(w.getActualWoodValidationStatus(confirmed), 'confirmed');
  for (const change of [
    { requested_wood_type: 'Mahogany' }, { material: 'Pine' },
    { width: 418 }, { depth: 21 }, { height: 721 }, { qty: 2 },
    { constructionMethod: 'joined_wood' }, { constructionLayerCount: 3 },
    { id: 'another-part' }, { partCode: 'CAB-DOOR-R' },
  ]) {
    assert.notEqual(w.getActualWoodValidationStatus({ ...confirmed, ...change }), 'confirmed', JSON.stringify(change));
  }
});

test('W5 requested wood matters only when requested; summaries never assert validity silently', async () => {
  const w = await getWood();
  const legacy = part({ requested_wood_type: '', material: 'Marine Plywood' });
  const wrong = part();
  const good = part({ material: 'Pine Wood' });
  const confirmed = { ...good, woodMaterialValidationSignature: w.getActualWoodValidationSignature(good) };
  assert.equal(w.getActualWoodValidationStatus(legacy), 'not_required');
  assert.equal(w.getActualWoodMaterialIssues([legacy, wrong, good, confirmed, { ...wrong, type: 'reference_proxy' }]).length, 2);
  assert.match(w.getPartsScheduleMaterialText(wrong), /UNVERIFIED.*Pine/);
  assert.match(w.getPartsScheduleMaterialText(confirmed), /Pine Wood \(requested Pine\)/);
  assert.equal(w.getPartsScheduleMaterialText(legacy), 'Marine Plywood');
});

test('W5 all ten customer species are handled without conflating structural substrate', async () => {
  const w = await getWood();
  for (const species of ['Mahogany', 'Pine', 'Acacia', 'Narra', 'Tanguile', 'Gmelina', 'Rubberwood', 'Teak', 'Oak', 'Maple']) {
    assert.equal(w.matchesRequestedActualWood(part({ requested_wood_type: species, material: `${species} Wood` })), true);
    assert.equal(w.matchesRequestedActualWood(part({ requested_wood_type: species, material: `${species} Plywood` })), false);
  }
});

test('W5 actual wood passes through normalization, dirty state, editor UI, PDF and print guard', () => {
  const component = read('data/componentUtils.js');
  const signature = read('data/designValidation.js');
  const properties = read('3d/components/PropertiesPanel.jsx');
  const exports = read('hooks/useBlueprintExport.js');
  const schedule = read('export/explodedPartsSchedule.js');
  const persistence = read('hooks/useBlueprintPersistence.js');
  const loader = read('data/initHelpers.js');
  assert.match(component, /requested_wood_type:\s*String\(c\.requested_wood_type/);
  assert.match(component, /woodMaterialValidationSignature:\s*String\(/);
  assert.match(signature, /requested_wood_type:\s*cleanText\(component\.requested_wood_type\)/);
  assert.match(signature, /woodMaterialValidationSignature:\s*cleanText\(component\.woodMaterialValidationSignature\)/);
  assert.match(loader, /\.map\(normalizeComponent\)/);
  assert.match(persistence, /components\.map\(\(component\) => normalizeComponent\(component\)\)/);
  assert.match(properties, /Customer Requested Actual Wood/);
  assert.match(properties, /Confirm Actual Wood & Dimensions/);
  assert.match(properties, /getActualWoodValidationSignature\(selectedComp\)/);
  assert.match(exports, /getActualWoodMaterialIssues\(exportTargetComponents\)/);
  assert.match(exports, /if \(actualWoodIssues\.length\) \{\s*toast\.error\(woodValidationMessage/);
  assert.match(exports, /const printExportSheets = useCallback\(\(\) => \{\s*if \(!canCreateOfficialOutput\(\)\) return;/);
  assert.match(exports, /const downloadExportPdf = useCallback\(async \(\) => \{\s*if \(downloadingPdf \|\| !canCreateOfficialOutput\(\)\) return;/);
  assert.match(schedule, /material: getPartsScheduleMaterialText\(component\)/);
});
