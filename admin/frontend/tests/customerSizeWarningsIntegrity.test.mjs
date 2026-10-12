import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const viewerPath = path.resolve(here, '../src/pages/customer/customer3dviewer.jsx');
const src = fs.readFileSync(viewerPath, 'utf8');
const startMarker = 'const getEffectiveCustomerSizeRange = (support, rules, axis) => {';
const endMarker = '// CUST-A: Raw component geometry is Admin-controlled; only approved';
const start = src.indexOf(startMarker);
const end = src.indexOf(endMarker, start + startMarker.length);
assert.ok(start > 0 && end > start, 'Effective-range helper is present and unique.');
assert.equal(src.indexOf(startMarker, start + 1), -1, 'No duplicate helper.');
const extracted = src.slice(start, end);
const { getEffectiveCustomerSizeRange, getEffectiveCustomerSizeError } = vm.runInNewContext(
  extracted + '\n({ getEffectiveCustomerSizeRange, getEffectiveCustomerSizeError });', {},
);
const support = (width, height, depth) => ({
  ok: true, minWidth: width[0], maxWidth: width[1],
  minHeight: height[0], maxHeight: height[1],
  minDepth: depth[0], maxDepth: depth[1],
});
const table = support([1400,2200],[700,900],[750,1100]);
const cabinet = support([800,1000],[820,930],[550,650]);
const shelf = support([1400,2000],[1600,2200],[400,600]);
const warning = (axis, limit, value) => getEffectiveCustomerSizeError(axis, limit, value);

test('Dining table ignores permissive published min of 1260: effective min 1400', () => {
  const r = getEffectiveCustomerSizeRange(table,{dimensions:{width:{min:1260,max:2400}}},'width');
  assert.equal(r.min,1400); assert.equal(r.max,2200); assert.equal(r.valid,true);
  assert.equal(warning('width',r,1),'Width must be 1400-2200 mm.');
  assert.equal(warning('width',r,1300),'Width must be 1400-2200 mm.');
  assert.equal(warning('width',r,1400),'');
  assert.equal(warning('width',r,2201),'Width must be 1400-2200 mm.');
});
test('Height and depth apply their own construction limits, not width limits', () => {
  const rules={dimensions:{height:{min:650,max:950},depth:{min:700,max:1150}}};
  const h=getEffectiveCustomerSizeRange(table,rules,'height');
  const d=getEffectiveCustomerSizeRange(table,rules,'depth');
  assert.equal(h.min,700); assert.equal(h.max,900);
  assert.equal(d.min,750); assert.equal(d.max,1100);
  assert.equal(warning('height',h,699),'Height must be 700-900 mm.');
  assert.equal(warning('depth',d,749),'Depth must be 750-1100 mm.');
});
test('Admin published restrictions narrower than planner remain effective', () => {
  const r=getEffectiveCustomerSizeRange(table,{dimensions:{width:{min:1500,max:2000}}},'width');
  assert.equal(r.min,1500);assert.equal(r.max,2000);
  assert.equal(warning('width',r,1499),'Width must be 1500-2000 mm.');
  assert.equal(warning('width',r,2200),'Width must be 1500-2000 mm.');
});
test('Legacy min_mm/max_mm aliases supported without bogus zero limits', () => {
  const r=getEffectiveCustomerSizeRange(table,{dimensions:{width:{min_mm:1600,max_mm:2100}}},'width');
  assert.equal(r.min,1600);assert.equal(r.max,2100);
  const blank=getEffectiveCustomerSizeRange(table,{dimensions:{width:{min:'',max:''}}},'width');
  assert.equal(blank.min,1400);assert.equal(blank.max,2200);
});
test('Cabinet and bookshelf use exactly the same intersection rule', () => {
  const c=getEffectiveCustomerSizeRange(cabinet,{dimensions:{width:{min:750,max:1050}}},'width');
  const b=getEffectiveCustomerSizeRange(shelf,{dimensions:{width:{min:1260,max:2200}}},'width');
  assert.equal(c.min,800);assert.equal(c.max,1000);
  assert.equal(b.min,1400);assert.equal(b.max,2000);
  assert.equal(warning('width',b,1300),'Width must be 1400-2000 mm.');
});
test('Wardrobe and unsupported/unverified assemblies fail safely', () => {
  const w=support([1300,1900],[1800,2400],[500,700]);
  const r=getEffectiveCustomerSizeRange(w,{dimensions:{height:{min:1900,max:2350}}},'height');
  assert.equal(r.min,1900);assert.equal(r.max,2350);
  assert.equal(getEffectiveCustomerSizeRange({ok:false}, {}, 'width'),null);
  assert.equal(getEffectiveCustomerSizeRange(w,{},'bogus'),null);
  assert.match(warning('width',null,1000),/unverified/i);
});
test('Conflicting rules fail closed and do not invent a safe target',()=>{
  const r=getEffectiveCustomerSizeRange(table,{dimensions:{width:{min:2400,max:2500}}},'width');
  assert.equal(r.valid,false);
  assert.match(warning('width',r,2400),/conflict/i);
});
test('NaN and empty drafts cannot be authorized by the policy helper',()=>{
  const r=getEffectiveCustomerSizeRange(table,{},'width');
  assert.match(warning('width',r,Number.NaN),/valid number/i);
  assert.equal(warning('width',r,1800),'');
});
test('Viewer uses effective range for all planner previews and overall edits',()=>{
  for(const n of ['planBookshelf','planCabinet','planTable']) {
    assert.match(src,new RegExp('const '+n+' = useCallback[\\s\\S]*?getEffectiveCustomerSizeRange[\\s\\S]*?getEffectiveCustomerSizeError'));
  }
  assert.match(src,/getCustomerOverallSizeWarning\(axis, value\)/);
  assert.match(src,/getCustomerOverallSizeWarning\(axis, overallDrafts\?\.\[axis\]\)/);
  assert.match(src,/getCustomerOverallSizeWarning\("width", rawWidth\)/);
  assert.match(src,/getCustomerOverallSizeWarning\(axis, raw\)/);
  assert.match(src,/effectiveCustomerSizeRanges\.width\?\.min/);
  assert.match(src,/effectiveCustomerSizeRanges\.height\?\.min/);
  assert.match(src,/effectiveCustomerSizeRanges\.depth\?\.min/);
});

test('Customer size warnings render once per axis while preserving preview validation', () => {
  assert.match(src, /const getSingleCustomerSizeWarning = \(axis\) => \{/);
  assert.match(src, /getSingleCustomerSizeWarning\("width"\) \? \(/);
  assert.match(src, /const message = getSingleCustomerSizeWarning\(axis\);/);
  assert.doesNotMatch(src, /<div role="alert" style=\{\{color:"#b91c1c",fontSize:11\}\}>\s*\{candidate\.error\}/);
  for (const family of ['bookshelfPreviews', 'cabinetPreviews', 'tablePreviews']) {
    assert.ok(src.includes(`!${family}[axis].ok`), `${family} errors must reach the shared warning`);
  }
  assert.match(src, /wardrobePreview && !wardrobePreview\.ok/);
});

test('Valid smart resize buttons remain available after error deduplication', () => {
  for (const name of ['applySmartBookshelf', 'applySmartCabinet', 'applySmartTable']) {
    assert.ok(src.includes(`onClick={() => ${name}(axis)}`), `${name} button must remain`);
  }
  assert.match(src, /getEffectiveCustomerSizeRange/);
});
