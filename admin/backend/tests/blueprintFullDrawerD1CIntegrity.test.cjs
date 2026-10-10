'use strict';
// Run: node admin/backend/tests/blueprintFullDrawerD1CIntegrity.test.cjs
// Pure geometry tests PLUS wiring checks on the exact application source.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '../../..');
  const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
  const geomText = source('admin/frontend/src/pages/blueprints/data/drawerBoxGeometry.js');
  const mod = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(geomText));
  const make = mod.planCompleteDrawerBoxGeometry;

  const p = {
    boxX: 42.5, boxZ: 95, boxWidth: 839, drawerDepth: 450,
    slotY: 210, bodyHeight: 345, sideThickness: 18, bottomThickness: 12,
  };
  const result = make(p);
  assert.equal(result.ok, true);
  const { leftSide: left, rightSide: right, back, bottom } = result;
  assert.deepEqual([bottom.x, bottom.width, bottom.z, bottom.depth],
    [p.boxX, p.boxWidth, p.boxZ, p.drawerDepth], 'Floor must fully cover the box footprint');
  assert.equal(bottom.y, left.y + left.height, 'Floor touches walls without overlapping their volume');
  assert.equal(bottom.y + bottom.height, p.slotY + p.bodyHeight, 'Floor reaches final box bottom');
  assert.equal(back.y + back.height, bottom.y, 'Back wall rests on floor');
  assert.equal(back.z, left.z, 'Back touches rear of side walls');
  assert.equal(back.z + back.depth, bottom.z + p.sideThickness, 'Back uses actual rear wall thickness');
  assert.equal(back.x, left.x + left.width, 'Back begins at inner left side');
  assert.equal(back.x + back.width, right.x, 'Back ends at inner right side');
  assert.equal(left.y, right.y);
  assert.equal(left.height, back.height);
  assert.equal(left.depth, right.depth);
  assert.equal(bottom.height, p.bottomThickness);

  for (const count of [1,2,3]) {
    const perSlotHeight = (700 - 10*(count-1))/count;
    for (let i=0; i<count; i++) {
      const geom = make({...p,slotY:210 + i*(perSlotHeight+10),bodyHeight:perSlotHeight-12});
      assert.equal(geom.ok, true, 'Fit '+count+' drawer stack');
      if (i < count-1) {
        assert.ok(geom.bottom.y + geom.bottom.height <= 210 + (i+1)*(perSlotHeight+10), 'Boxes clear the next drawer slot');
      }
    }
  }
  assert.equal(make({...p, bodyHeight: 22}).ok,false, 'Prevent too-short boxes');
  assert.equal(make({...p, boxWidth: 40}).ok,false, 'Prevent too-narrow boxes');
  assert.equal(make({...p, drawerDepth: 21}).ok,false, 'Prevent too-shallow boxes');
  assert.equal(make({...p, boxWidth: Number.NaN}).ok,false, 'Prevent NaN geometry');
  assert.equal(make({...p, bottomThickness: -1}).ok,false, 'Prevent negative materials');

  const builder = source('admin/frontend/src/pages/blueprints/hooks/useBlueprintBuilderActions.js');
  const viewer = source('admin/frontend/src/pages/blueprints/3d/threeDViewer.jsx');
  assert.ok(builder.includes('import { planCompleteDrawerBoxGeometry } from "../data/drawerBoxGeometry";'));
  assert.ok(builder.includes('const drawerBox = planCompleteDrawerBoxGeometry({'));
  for (const part of ['leftSide','rightSide','back','bottom']) {
    assert.ok(builder.includes('...drawerBox.'+part), 'Builder must use tested drawer '+part+' geometry');
  }
  for (const role of ['drawer_front','drawer_side','drawer_back','drawer_bottom','drawer_handle','drawer_slide']) {
    assert.ok(builder.includes('partRole: "'+role+'"'), 'Builder missing '+role+' role');
  }
  assert.ok(builder.includes('nextDrawerParts.push(') && builder.includes('        bottom,') && builder.includes('        back,'), 'Back and bottom must be stored alongside all drawer parts');
  assert.ok(builder.includes('byDrawer.size !== drawerAssemblyCount') && builder.includes('parts.length !== 8'), 'Complete drawer pre-save guard missing');
  assert.ok(viewer.includes('component?.drawerAssemblyId') && viewer.includes('resolveDrawerPreviewKey(item) === key'), 'Preview must group all generated parts by drawer ID');
  assert.ok(viewer.includes('isDrawerPreviewFixedHardware(item)'), 'Slides should remain with cabinet rather than moving');

  console.log('PASS: D1-C underlaid drawer bottom/back geometry, clearance, 8-part integrity and grouped preview wiring.');
})().catch((error)=>{ console.error(error);process.exitCode=1; });
