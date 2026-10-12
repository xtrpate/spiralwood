'use strict';
/** U10: checkout nested dimension consistency, without DB writes or network. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { normalizeManualReviewForSave } = require('../services/universalManualReviewU4');
const { authorizeUniversalManualOrderU6 } = require('../services/universalManualOrderU6');
const controllerFile = path.resolve(__dirname, '../controllers/customer/customer.customorders.js');
const engineUrl = pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/universalManualConstructionU1.mjs')).href;
const clone = v => JSON.parse(JSON.stringify(v));

// Exercise the actual controller sanitizer without loading Express, db, or uploads.
// Its function boundaries are asserted, so refactoring will fail closed.
function getStorageSanitizer() {
  const controller = fs.readFileSync(controllerFile, 'utf8');
  const begin = controller.indexOf('const sanitizeCustomizationSnapshotForStorage = ');
  const end = controller.indexOf('\nconst insertCustomOrderMessage = ', begin);
  assert.ok(begin >= 0 && end > begin, 'Controller sanitizer boundaries changed; re-audit U10');
  const snippet = controller.slice(begin, end);
  const cleanString = value => value == null || String(value).trim() === '' ? null : String(value).trim();
  const sandbox = { toTrimmedStringOrNull: cleanString };
  vm.runInNewContext(snippet + '\nthis.sanitize = sanitizeCustomizationSnapshotForStorage;', sandbox);
  return sandbox.sanitize;
}

function manualParts() {
  const part = (id, x, y, z, width, height, depth) => ({
    id, partCode: 'U10-'+id, type:'furniture_board_panel', partRole:'panel',
    x,y,z,width,height,depth,qty:1,locked:false,visible:true,
    material:'Oak Wood', wood_type:'Oak Wood',
  });
  return [
    part('top',0,200,0,800,18,781),
    part('leg-a',20,218,30,50,691,50),
    part('leg-b',730,218,30,50,691,50),
    part('leg-c',20,218,701,50,691,50),
    part('leg-d',730,218,701,50,691,50),
  ];
}
async function reviewedRequest() {
  const parts = manualParts();
  const rulesByPartId = {};
  for (const p of parts) {
    const isTop = p.id === 'top';
    const isRight = p.x > 400;
    const isBack = p.z > 400;
    rulesByPartId[p.id] = {
      width: { start: isTop ? 'min' : isRight ? 'max' : 'min', end: isTop ? 'max' : isRight ? 'max' : 'min' },
      height: { start: 'min', end: isTop ? 'min' : 'max' },
      depth: { start: isTop ? 'min' : isBack ? 'max' : 'min', end: isTop ? 'max' : isBack ? 'max' : 'min' },
    };
  }
  const settings = {
    rulesByPartId,
    limits: {width:{min:720,max:1000},height:{min:639,max:1000},depth:{min:703,max:1000}},
    confirmedPartIds:parts.map(p=>p.id),
    pivots:{width:'min',height:'max',depth:'min'},
  };
  const review = await normalizeManualReviewForSave({
    parts, incoming:{status:'submitted_for_review',customerResizable:false,settings},actorId:12,
    now:'2026-10-13T00:00:00Z',
  });
  assert.equal(review.ok,true,JSON.stringify(review));
  const dims = {width:900,height:760,depth:900};
  const { previewUniversalManualConstructionResize } = await import(engineUrl);
  const planned = previewUniversalManualConstructionResize(parts,review.value.draftProfile,dims);
  assert.equal(planned.ok,true,JSON.stringify(planned));
  const item = {
    ...dims,unit:'mm',
    editor_snapshot:{components:clone(planned.parts)},
    customization_snapshot:{width_mm:900,height_mm:760,depth_mm:900},
  };
  return {designData:{components:parts,manualConstructionReviewU4:review.value},item};
}

test('U10 direct Customize snapshot stores real W/H/D, not 0/0/0', () => {
  const sanitize = getStorageSanitizer();
  const got = sanitize({width_mm:850,height_mm:750,depth_mm:600,wood_type:'Mahogany'}, {width:850,height:750,depth:600});
  assert.equal(got.width,850); assert.equal(got.height,750); assert.equal(got.depth,600);
  assert.equal(got.wood_type,'Mahogany'); assert.equal(got.unit,'mm');
});

test('U10 edited-cart aliases store matching dimensions and preserve metadata', () => {
  const sanitize = getStorageSanitizer();
  const got = sanitize({width:850,height:750,depth:600,width_mm:850,height_mm:750,depth_mm:600,finish_color:'Natural'},
    {width:850,height:750,depth:600});
  assert.deepEqual([got.width,got.height,got.depth],[850,750,600]);
  assert.equal(got.finish_color,'Natural');
});

test('U10 manual order storage uses U6 verified dimensions, even if snapshot absent', () => {
  const sanitize = getStorageSanitizer();
  const got = sanitize(null,{width:850,height:750,depth:600});
  assert.deepEqual([got.width,got.height,got.depth],[850,750,600]);
  const tampered = sanitize({width:999,width_mm:850,height:750,depth:600},{width:850,height:750,depth:600});
  assert.equal(tampered.width,850);
});

test('U10 legacy snapshot behavior remains supported (plain fields and null)', () => {
  const sanitize = getStorageSanitizer();
  assert.equal(sanitize(null,null),null);
  const got = sanitize({width:850,height:750,depth:600,door_style:'slab'});
  assert.deepEqual([got.width,got.height,got.depth],[850,750,600]);
  assert.equal(got.door_style,'slab');
  const legacyMmOnly = sanitize({width_mm:850,height_mm:750,depth_mm:600});
  assert.deepEqual([legacyMmOnly.width,legacyMmOnly.height,legacyMmOnly.depth],[850,750,600]);
});

test('U10 U6 accepts direct and edited-cart formats only when consistent', async () => {
  const {designData,item} = await reviewedRequest();
  assert.equal((await authorizeUniversalManualOrderU6({designData,item})).ok,true);
  const edited = clone(item);
  Object.assign(edited.customization_snapshot,{width:900,height:760,depth:900});
  assert.equal((await authorizeUniversalManualOrderU6({designData,item:edited})).ok,true);
  for (const field of ['width','height','depth','width_mm','height_mm','depth_mm']) {
    const bad=clone(edited);
    bad.customization_snapshot[field]=999;
    const result=await authorizeUniversalManualOrderU6({designData,item:bad});
    assert.equal(result.ok,false,field);
    assert.equal(result.code,'DIMENSIONS_MISMATCH',field);
  }
  for (const field of ['width','height','depth']) {
    const bad=clone(item);
    bad.customization_snapshot[field]=String(item[field]);
    assert.equal((await authorizeUniversalManualOrderU6({designData,item:bad})).ok,false,field+' string');
  }
});

test('U10 controller uses verified U6 dimensions only after authorization before insert', () => {
  const controller=fs.readFileSync(controllerFile,'utf8');
  const authorizeAt=controller.indexOf('authorizeUniversalManualOrderU6({');
  const insertAt=controller.indexOf('`INSERT INTO orders');
  const sanitizeAt=controller.indexOf('const slimCustomizationSnapshot = sanitizeCustomizationSnapshotForStorage(');
  assert.ok(authorizeAt>=0 && insertAt>authorizeAt && sanitizeAt>insertAt);
  assert.ok(controller.includes('checkedManual.applies === true ? checkedManual.dimensions : null'));
  assert.ok(controller.includes('if (!checkedManual.ok)'));
});
