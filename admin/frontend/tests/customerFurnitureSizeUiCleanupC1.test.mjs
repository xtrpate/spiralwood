import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../src/pages/customer/customer3dviewer.jsx'), 'utf8');
const marker = 'className="wisdom-furniture-size-section"';
const start = source.indexOf(marker);
assert.ok(start >= 0, 'Customer Furniture Size section must exist');
const end = source.indexOf('                </section>', start);
assert.ok(end > start, 'Customer Furniture Size section must have a closing section');
const section = source.slice(start, end);

// Customer-facing template validation statuses must not appear as labels or help text.
test('C1: no internal size, planner or protection labels are displayed', () => {
  assert.doesNotMatch(section, /Smart (?:table|cabinet|carcass|bookshelf|sizing|width)/i);
  assert.doesNotMatch(section, /Reviewed manual|Size protected|Manual table/i);
  assert.doesNotMatch(section, /styles\.pill/);
  assert.doesNotMatch(section, /styles\.helperTextMuted/);
  assert.doesNotMatch(section, /Admin-reviewed W\/H\/D ranges/);
  assert.doesNotMatch(section, /panel thickness|board thickness|joinery|inset doors/i);
});

test('C1: Width, Height and Depth controls and protections remain', () => {
  assert.match(section, /Furniture Size \(\{unit === "inches"/);
  for (const axis of ['width','height','depth']) {
    assert.match(section, new RegExp(`value=\\{overallDrafts\\.${axis}\\}`));
    assert.match(section, new RegExp(`commitOverallDimension\\("${axis}"\\)`));

  }
  assert.match(section, /!isCustomizable/);
  assert.match(section, /readOnly/);
  assert.match(section, /overallDimensionErrors/);
  assert.match(section, /getSingleCustomerSizeWarning\(axis\)/);
  assert.match(section, /getSingleCustomerSizeWarning\("width"\)/);
});

test('C1: all existing Apply actions and validations stay wired', () => {
  for (const pattern of [
    /applyUniversalManualPreview\(axis\)/,
    /applySmartBookshelf\(axis\)/,
    /applySmartCabinet\(axis\)/,
    /applySmartTable\(axis\)/,
    /onClick=\{applySmartWardrobeWidth\}/,
    /applySmartWardrobeHeightDepth\("height"\)/,
    /applySmartWardrobeHeightDepth\("depth"\)/,
    /canPreviewUniversal\("width"\)/,
    /canResizeBookshelf\("width"\)/,
    /canResizeCabinet\("width"\)/,
    /canResizeTable\("width"\)/,
  ]) {
    assert.match(section, pattern);
  }
  assert.doesNotMatch(section, /Apply \{label\} Preview/);
  assert.doesNotMatch(source, /Manual geometry preview updated|Carcass and doors resized|Dining Table size updated\. Review all 9 parts/);
  assert.match(source, /Size updated\. Please review your design before checkout\./);
  assert.match(source, /getCustomerUniversalManualPreviewSupport/);
  assert.match(source, /getCustomerBookshelfResizeSupport/);
  assert.match(source, /getCustomerCabinetResizeSupport/);
  assert.match(source, /getCustomerDiningTableResizeSupport/);
});
