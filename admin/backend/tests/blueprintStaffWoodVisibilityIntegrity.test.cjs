'use strict';
// WISDOM wood visibility CARD 1. Static source assertions + pure helper checks.
// No DB, API, filesystem writes or mocking of actual financial transactions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../../..');
const STAFF = path.join(ROOT, 'admin/frontend/src/pages/staff/ProductionBlueprintView.jsx');
const HELPER = path.join(ROOT, 'admin/frontend/src/pages/blueprints/data/actualWoodMaterialValidation.mjs');
const SOURCE = fs.readFileSync(STAFF, 'utf8');

test('Staff order snapshot shows saved material AND requested actual wood and review state', () => {
  assert.match(SOURCE, /import\s*\{[\s\S]*?getRequestedActualWood[\s\S]*?matchesRequestedActualWood[\s\S]*?\}\s*from\s*['"]\.\.\/blueprints\/data\/actualWoodMaterialValidation\.mjs['"]/);
  assert.match(SOURCE, /<th>Saved Material<\/th>/);
  assert.match(SOURCE, /<th>Requested Actual Wood<\/th>/);
  assert.match(SOURCE, /<th>Wood Review<\/th>/);
  assert.match(SOURCE, /getRequestedActualWood\(part\)/);
  assert.match(SOURCE, /matchesRequestedActualWood\(part\)/);
  assert.match(SOURCE, /Needs Admin validation - material mismatch/);
  assert.match(SOURCE, /Needs Admin confirmation/);
  assert.match(SOURCE, /No change requested/);
  assert.match(SOURCE, /Not requested/);
  assert.match(SOURCE, /Saved customer design is not an Admin-validated manufacturing material schedule/);
});

test('No fake certification, transaction or production mutations in this UI patch', () => {
  assert.doesNotMatch(SOURCE, /setActualWoodValidated|saveActualWood|POST.*wood.*validat/i);
  assert.match(SOURCE, /This is the saved customer order design/);
  assert.match(SOURCE, /<td>\{firstText\(part\.material, part\.wood_type\) \|\| overallMaterial\}<\/td>/);
});

test('Existing actual-wood helper rejects plywood for solid-wood requests', async () => {
  const w = await import(pathToFileURL(HELPER).href);
  for (const requested of ['Mahogany', 'Pine']) {
    const original = { material: 'Marine Plywood', requested_wood_type: requested };
    assert.equal(w.getRequestedActualWood(original), requested);
    assert.equal(w.matchesRequestedActualWood(original), false);
    assert.equal(w.matchesRequestedActualWood({ ...original, material: `${requested} Wood` }), true);
  }
});
