'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isRealFurniturePart,
  selectCanonicalPublicationScene,
  validateBlueprintPublicationParts,
} = require('../services/blueprintPublicationPartsGuard');

const validPart = (values = {}) => ({
  id: 'part-1', partCode: 'DT-TOP', type: 'dt_top_panel',
  width: 1800, height: 40, depth: 900, x: 0, y: 0, z: 0,
  qty: 1, material: 'Oak Wood', ...values,
});
const codes = (parts) => validateBlueprintPublicationParts(parts).issues.map(x => x.code);

test('C7: valid measured furniture parts can publish', () => {
  assert.equal(validateBlueprintPublicationParts([validPart()]).ok, true);
});
test('C7: empty and reference-only scenes cannot publish', () => {
  assert.ok(codes([]).includes('NO_PRODUCTION_PARTS'));
  assert.ok(codes([{ type: 'reference_proxy' }, { type: 'human_reference' }]).includes('NO_PRODUCTION_PARTS'));
  assert.equal(isRealFurniturePart({ type: 'reference_proxy' }), false);
});
test('C7: rejects zero, negative, missing and nonfinite board dimensions', () => {
  for (const dimension of ['width','height','depth']) {
    for (const value of [0,-1,NaN,Infinity,undefined,'']) {
      assert.ok(codes([validPart({[dimension]: value})]).includes('INVALID_PART_DIMENSION'), `${dimension}: ${value}`);
    }
  }
});
test('C7: rejects missing or invalid coordinates', () => {
  for (const axis of ['x','y','z']) {
    for (const value of [NaN,Infinity,undefined,'']) {
      assert.ok(codes([validPart({[axis]:value})]).includes('INVALID_PART_POSITION'), `${axis}: ${value}`);
    }
  }
  assert.equal(validateBlueprintPublicationParts([validPart({x:-300,y:0,z:240})]).ok, true);
});
test('C7: requires stable unique part IDs and nonblank codes', () => {
  assert.ok(codes([validPart({id:''})]).includes('MISSING_PART_ID'));
  assert.ok(codes([validPart({partCode:''})]).includes('MISSING_PART_CODE'));
  assert.ok(codes([validPart(), validPart()]).includes('DUPLICATE_PART_ID'));
});
test('C7: same cut code may be shared by separate physical parts', () => {
  assert.equal(validateBlueprintPublicationParts([
    validPart(),validPart({id:'part-2'})
  ]).ok,true);
});
test('C7: requires actual material and positive integer quantities', () => {
  assert.ok(codes([validPart({material:''})]).includes('MISSING_MATERIAL'));
  for (const qty of [0,-1,1.5,NaN,Infinity,null,undefined,'']) {
    assert.ok(codes([validPart({qty})]).includes('INVALID_PART_QUANTITY'), `qty ${qty}`);
  }
  assert.equal(validateBlueprintPublicationParts([validPart({qty:3})]).ok,true);
});
test('C7: canonical scene uses design_data first, 3D fallback, not concatenation', () => {
  const a=[validPart()],b=[validPart({id:'from-3d'})];
  assert.deepEqual(selectCanonicalPublicationScene(a,b),a);
  assert.deepEqual(selectCanonicalPublicationScene([{type:'reference_proxy'}],b),b);
  assert.deepEqual(selectCanonicalPublicationScene([],b),b);
  assert.equal(validateBlueprintPublicationParts(selectCanonicalPublicationScene(a,a)).ok,true);
});
test('C7: validator does not mutate source or confer resize approval', () => {
  const part=Object.freeze(validPart());
  const parts=Object.freeze([part]);
  assert.equal(validateBlueprintPublicationParts(parts).ok,true);
  assert.equal(parts[0].width,1800);
  assert.equal('resizeEligible' in validateBlueprintPublicationParts(parts),false);
});
test('C7: publication endpoint only guards new or currently-unpublished designs', () => {
  const source=fs.readFileSync(path.join(__dirname,'../controllers/admin/productController.js'),'utf8');
  const start=source.indexOf('exports.publishByBlueprint = async (req, res) => {');
  const end=source.indexOf('exports.unpublishByBlueprint = async (req, res) => {');
  assert.ok(start>=0 && end>start,'publish handler missing');
  const handler=source.slice(start,end);
  assert.match(source,/require\("\.\.\/\.\.\/services\/blueprintPublicationPartsGuard"\)/);
  assert.match(handler,/!linkedProducts\.some\(\(linked\) => Number\(linked\.is_published\) === 1\)/);
  assert.match(handler,/selectCanonicalPublicationScene\(/);
  assert.match(handler,/validateBlueprintPublicationParts\(/);
  assert.match(handler,/code: 'BLUEPRINT_PUBLICATION_PARTS_INVALID'/);
  assert.match(handler,/await conn\.rollback\(\);/);
  assert.ok(handler.indexOf('const validation = validateBlueprintPublicationParts') < handler.indexOf('UPDATE products'), 'guard must run before changing published product');
});
