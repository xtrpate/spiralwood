import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Regression test executes the exact real viewer helper, without importing
// React/Three or depending on a bundled copy of its business logic.
const here = path.dirname(fileURLToPath(import.meta.url));
const viewer = path.resolve(here, '../src/pages/customer/customer3dviewer.jsx');
const source = fs.readFileSync(viewer, 'utf8');
const start = source.indexOf('const getEffectiveCustomerSizeRange = ');
const end = source.indexOf('const getEffectiveCustomerSizeError = ', start);
assert.ok(start >= 0 && end > start, 'Viewer size helper anchors changed.');
const context = {};
vm.runInNewContext(`${source.slice(start, end)}\nthis.range = getEffectiveCustomerSizeRange;`, context);
const range = context.range;
const clone = x => JSON.parse(JSON.stringify(x));

const reviewedU4 = {
  ok: true, previewOnly: true,
  profile: { status: 'draft', customerResizable: false, approval: 'not_reviewed' },
  minWidth: 755, maxWidth: 921,
  minHeight: 648, maxHeight: 792,
  minDepth: 513, maxDepth: 625,
};
const stale = {
  dimensions: {
    width: { min: 587, max: 1089 },
    height: { min: 504, max: 936 },
    depth: { min: 820, max: 1524 }, // 70% of unrotated 1172 mm drawer depth
  }
};
const ordinary = {
  ok: true,
  minWidth: 500, maxWidth: 1000,
  minHeight: 400, maxHeight: 900,
  minDepth: 400, maxDepth: 1000,
};

test('U9 Blueprint #296 U4 depth uses reviewed [513,625], not stale [820,1524]', () => {
  assert.deepEqual(clone(range(reviewedU4, stale, 'depth')), { min:513, max:625, valid:true });
});
test('U9 manual width and height use only the reviewed U4 limits', () => {
  assert.deepEqual(clone(range(reviewedU4, stale, 'width')), { min:755, max:921, valid:true });
  assert.deepEqual(clone(range(reviewedU4, stale, 'height')), { min:648, max:792, valid:true });
});
test('U9 manual max depth still blocks a 700 mm request', () => {
  const r = range(reviewedU4, stale, 'depth');
  assert.ok(600 >= r.min && 600 <= r.max);
  assert.ok(!(700 >= r.min && 700 <= r.max));
});
test('U9 ordinary furniture still intersects construction and custom rules', () => {
  assert.deepEqual(clone(range(ordinary, { dimensions:{depth:{min:600,max:800}}}, 'depth')),
    {min:600,max:800,valid:true});
});
test('U9 non-U4 invalid intersection still fails closed', () => {
  assert.deepEqual(clone(range(ordinary, stale, 'depth')),
    {min:820,max:1000,valid:true});
  assert.deepEqual(clone(range({...ordinary,maxDepth:625}, stale, 'depth')),
    {min:820,max:625,valid:false});
});
test('U9 other preview-like or unauthorized profiles do not bypass intersection', () => {
  for (const support of [
    {...reviewedU4,previewOnly:false},
    {...reviewedU4,profile:{...reviewedU4.profile,status:'published'}},
    {...reviewedU4,profile:{...reviewedU4.profile,customerResizable:true}},
    {...reviewedU4,profile:{...reviewedU4.profile,approval:'approved'}},
  ]) {
    assert.deepEqual(clone(range(support, stale, 'depth')),
      {min:820,max:625,valid:false});
  }
});
test('U9 malformed support and axis remain blocked', () => {
  assert.equal(range({ok:false}, stale, 'depth'), null);
  assert.equal(range(reviewedU4, stale, 'diagonal'), null);
  assert.equal(range({...reviewedU4,maxDepth:100}, stale, 'depth'), null);
});
test('U9 preserves viewer U5 and U6 preview and authorization gate identifiers', () => {
  assert.match(source, /getCustomerUniversalManualPreviewSupport\(universalManualPreview, components\)/);
  assert.match(source, /planCustomerUniversalManualPreviewResize\(universalManualPreview, components, axis, mm\)/);
  assert.match(source, /getEffectiveCustomerSizeRange\(universalManualSupport, customizationRules, axis\)/);
});
