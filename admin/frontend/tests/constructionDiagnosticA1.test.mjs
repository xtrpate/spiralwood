import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseConstructionA1 } from '../src/pages/blueprints/data/constructionDiagnostic.mjs';

const part = (n, overrides = {}) => ({
  id: `part-${n}`,
  groupId: 'assembly-one',
  assemblyId: 'assembly-one',
  assemblyType: 'base_cabinet',
  type: 'wr_side_panel',
  partCode: `CB-${n}`,
  partRole: 'side_panel',
  x: n * 100, y: 0, z: 0,
  width: 18, height: 800, depth: 500,
  qty: 1,
  material: 'Marine Plywood',
  rotationX: 0, rotationY: 0, rotationZ: 0,
  ...overrides,
});
const baseline = () => [part(1), part(2, { partRole: 'top_panel' })];
const run = (parts, furnitureType = 'cabinet') => diagnoseConstructionA1({ components: parts, furnitureType });
const has = (r, code) => r.issues.some((x) => x.code === code);

const assertLocked = (r) => {
  assert.equal(r.resizeEligible, false);
  assert.deepEqual(r.customerEditable, { width: false, height: false, depth: false });
  assert.equal(r.fixedSectionSafetyVerified, false);
  assert.equal(r.carpenterReviewRequired, true);
  assert.equal(has(r, 'NO_VERIFIED_RESIZE_PROFILE'), true);
  assert.equal(has(r, 'FIXED_SECTION_RULES_UNVERIFIED'), true);
};

test('A1 well-described cabinet is ONLY a profile-review candidate, never resize-certified', () => {
  const r = run(baseline());
  assert.equal(r.status, 'profile_review_required');
  assert.equal(r.metadataReadyForProfileReview, true);
  assert.equal(r.familyCandidate, 'base_cabinet');
  assert.equal(r.summary.realPartCount, 2);
  assert.equal(r.summary.structuralIssueCount, 0);
  assertLocked(r);
});

test('A1 never mutates caller part objects, physical qty, dimensions or requested wood', () => {
  const input = baseline();
  input[0].qty = 3;
  input[0].requested_wood_type = 'Mahogany';
  Object.freeze(input[0]); Object.freeze(input[1]); Object.freeze(input);
  const before = JSON.stringify(input);
  const a = run(input);
  const b = run(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(a, b);
  assert.equal(a.summary.structuralIssueCount, 0);
  assertLocked(a);
});

test('A1 reference proxy and 1700mm human reference do not count as manufactured parts', () => {
  const r = run([...baseline(), { type: 'reference_proxy', height: 1700 },
    { type: 'human_reference', height: 1700 }, { type: 'reference_grid' }]);
  assert.equal(r.summary.realPartCount, 2);
  assert.equal(r.metadataReadyForProfileReview, true);
  assertLocked(r);
});

test('A1 does not treat blank parentPartId as broken joinery', () => {
  const r = run(baseline());
  assert.equal(has(r, 'BROKEN_PARENT_REFERENCE'), false);
  assertLocked(r);
});

test('A1 accepts explicitly valid same-assembly parent reference as metadata only', () => {
  const a = baseline(); a[1].parentPartId = 'part-1';
  const r = run(a);
  assert.equal(r.metadataReadyForProfileReview, true);
  assertLocked(r);
});

const invalidCases = [
  ['no production parts', [], 'EMPTY_FURNITURE'],
  ['missing ID', [part(1, { id: '' })], 'MISSING_PART_ID'],
  ['duplicate ID', [part(1), part(2, { id: 'part-1' })], 'DUPLICATE_PART_ID'],
  ['missing assembly ID', [part(1, { groupId: '', assemblyId: '' })], 'MISSING_ASSEMBLY_ID'],
  ['conflicting assembly aliases', [part(1, { assemblyId: 'other' })], 'ASSEMBLY_ID_CONFLICT'],
  ['missing family', [part(1, { assemblyType: '' })], 'MISSING_ASSEMBLY_TYPE'],
  ['unknown family', [part(1, { assemblyType: 'mystery' })], 'UNKNOWN_ASSEMBLY_FAMILY'],
  ['missing role', [part(1, { partRole: '' })], 'MISSING_PART_ROLE'],
  ['conflicting role aliases', [part(1, { partRole: 'shelf', assemblyRole: 'leg' })], 'PART_ROLE_CONFLICT'],
  ['missing part code', [part(1, { partCode: '' })], 'MISSING_PART_CODE'],
  ['zero width', [part(1, { width: 0 })], 'INVALID_DIMENSION'],
  ['negative height', [part(1, { height: -10 })], 'INVALID_DIMENSION'],
  ['nonfinite depth', [part(1, { depth: NaN })], 'INVALID_DIMENSION'],
  ['nonfinite position', [part(1, { x: Infinity })], 'INVALID_POSITION'],
  ['fractional qty', [part(1, { qty: 1.5 })], 'INVALID_PHYSICAL_QTY'],
  ['negative qty', [part(1, { qty: -1 })], 'INVALID_PHYSICAL_QTY'],
  ['no material', [part(1, { material: '' })], 'MISSING_MATERIAL'],
  ['rotated part', [part(1, { rotationY: 90 })], 'ROTATED_PART_REQUIRES_PROFILE'],
  ['locked part', [part(1, { locked: true })], 'PART_STATE_REQUIRES_REVIEW'],
  ['hidden part', [part(1, { visible: false })], 'PART_STATE_REQUIRES_REVIEW'],
  ['deleted part', [part(1, { is_deleted: 1 })], 'PART_STATE_REQUIRES_REVIEW'],
  ['table component in cabinet', [part(1, { type: 'dt_leg' })], 'PART_FAMILY_CONFLICT'],
  ['broken parent', [part(1, { parentPartId: 'missing' })], 'BROKEN_PARENT_REFERENCE'],
  ['self parent', [part(1, { parentPartId: 'part-1' })], 'SELF_PARENT_REFERENCE'],
];

for (const [label, parts, code] of invalidCases) {
  test(`A1 reject metadata: ${label}`, () => {
    const r = run(parts);
    assert.equal(has(r, code), true, `Expected reason ${code}`);
    assert.equal(r.status, 'incomplete_metadata');
    assert.equal(r.metadataReadyForProfileReview, false);
    assertLocked(r);
  });
}

test('A1 cannot pass mixed assembly IDs or families as one eligible family', () => {
  const x = baseline(); x[1] = { ...x[1], groupId: 'other', assemblyId: 'other', assemblyType: 'dining_table', type: 'dt_leg' };
  const r = run(x);
  assert.ok(has(r, 'MULTIPLE_ASSEMBLIES'));
  assert.ok(has(r, 'MIXED_ASSEMBLY_FAMILIES'));
  assertLocked(r);
});

test('A1 detects declaration of a parent in a different assembly', () => {
  const x = baseline(); x[1] = { ...x[1], groupId: 'other', assemblyId: 'other', parentPartId: 'part-1' };
  const r = run(x);
  assert.ok(has(r, 'CROSS_ASSEMBLY_PARENT'));
  assertLocked(r);
});

test('A1 detects circular parent references', () => {
  const x = baseline(); x[0].parentPartId = 'part-2'; x[1].parentPartId = 'part-1';
  const r = run(x);
  assert.ok(has(r, 'PARENT_REFERENCE_CYCLE'));
  assertLocked(r);
});

test('A1 reports a suspicious furnitureType vs family conflict', () => {
  const x = [part(1, { assemblyType: 'wardrobe' })];
  const r = run(x, 'table');
  assert.ok(has(r, 'FURNITURE_TYPE_CONFLICT'));
  assertLocked(r);
});

test('A1 does not declare cabinet + wardrobe categorization as an automatic conflict', () => {
  const x = [part(1, { assemblyType: 'wardrobe' })];
  const r = run(x, 'cabinet');
  assert.equal(has(r, 'FURNITURE_TYPE_CONFLICT'), false);
  assertLocked(r);
});

test('A1 metadata-ready dining table remains locked, independently of existing C5-1 logic', () => {
  const x = [part(1, { type: 'dt_top_panel', assemblyType: 'dining_table', partRole: 'top_panel', material: 'Mahogany' })];
  const r = run(x, 'table');
  assert.equal(r.metadataReadyForProfileReview, true);
  assertLocked(r);
});

test('A1 handles non-array input without exception and stays locked', () => {
  const r = diagnoseConstructionA1({ components: 'not-an-array' });
  assert.ok(has(r, 'INVALID_COMPONENTS'));
  assertLocked(r);
});
