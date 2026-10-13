import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  manualQuarterTurnU8,
  manualWorldBoxU8,
  manualWorldFrameU8,
  manualPartFromWorldBoxU8,
} from '../src/utils/universalManualWorldBoundsU8.mjs';
import {
  proposeManualConstructionReviewU2,
  reviewManualConstructionDraftU2,
} from '../src/utils/universalManualReviewU2.mjs';
import { previewUniversalManualConstructionResize } from '../src/utils/universalManualConstructionU1.mjs';
const require = createRequire(import.meta.url);
const { normalizeManualReviewForSave } = require('../../backend/services/universalManualReviewU4.js');
const { authorizeUniversalManualOrderU6 } = require('../../backend/services/universalManualOrderU6.js');
const copy = value => JSON.parse(JSON.stringify(value));

// Synthetic identities with the actual seven-panel geometry of Blueprint #297.
// A duplicated Part Code in the saved example is corrected IN THIS TEST ONLY.
// Admin must separately review and fix that code in the real blueprint.
function scene() {
  const common = {
    assemblyId:'test-cabinet',groupId:'test-cabinet',
    material:'Oak Wood',wood_type:'Oak Wood',qty:1,locked:false,
    rotationX:0,rotationY:0,rotationZ:0,partFunction:'auto',
    doorHinge:'auto',motionGroupId:'',motionReferencePartId:'',
  };
  const part = (id,code,role,x,y,z,width,height,depth,rest={}) => ({
    ...common,id,partCode:code,partRole:role,type:`furniture_${role}`,
    x,y,z,width,height,depth,...rest,
  });
  return [
    part('high','TOP-A','top_panel',1800,3140,1440,800,18,560),
    part('back','BACK','back_panel',1800,2440,1437,800,720,6),
    part('left-side','SIDE-L','bottom_panel',1441,2791,1440,720,18,560,{rotationZ:-90}),
    part('right-side','SIDE-R','bottom_panel',2240,2791,1440,720,18,560,{rotationZ:-90}),
    part('low','TOP-B','top_panel',1791,2431,1440,818,18,560),
    part('left-door','DOOR-L','back_panel',1804,2440,1997,392,720,6,{partFunction:'door',doorHinge:'left'}),
    part('right-door','DOOR-R','back_panel',2206,2440,1997,389,720,6,{partFunction:'door',doorHinge:'right'}),
  ];
}
function settings(parts) {
  const proposal=proposeManualConstructionReviewU2(parts);
  assert.equal(proposal.ok,true,JSON.stringify(proposal));
  return {
    rulesByPartId:proposal.proposedRules,
    limits:{width:{min:780,max:860},height:{min:700,max:760},depth:{min:540,max:600}},
    confirmedPartIds:parts.map(p=>p.id),
    pivots:{width:'min',height:'max',depth:'min'},
  };
}
function approvedGeometry(parts) {
  const s=settings(parts);
  const result=reviewManualConstructionDraftU2(parts,s);
  assert.equal(result.ok,true,JSON.stringify(result));
  return {settings:s,result};
}

test('U11: exact Z=-90 sides use world X/Y, not their unrotated 720 mm width',()=>{
  const parts=scene();
  assert.equal(manualQuarterTurnU8(parts[2]),'z90');
  assert.deepEqual(manualWorldBoxU8(parts[2]),{
    minX:1792,maxX:1810,minY:2440,maxY:3160,minZ:1440,maxZ:2000,
  });
  const bounds=manualWorldFrameU8(parts);
  assert.deepEqual(Object.fromEntries(Object.entries(bounds).map(([a,b])=>[a,b.size])),
    {width:818,height:729,depth:566});
  assert.deepEqual(manualPartFromWorldBoxU8(parts[2],manualWorldBoxU8(parts[2])),parts[2]);
  assert.deepEqual(manualPartFromWorldBoxU8({...parts[2],rotationZ:90},
    manualWorldBoxU8({...parts[2],rotationZ:90})),{...parts[2],rotationZ:90});
});

test('U11: real seven-part structure becomes reviewable but remains unapproved',()=>{
  const parts=scene();const {result}=approvedGeometry(parts);
  assert.equal(result.partCount,7);
  assert.equal(result.cornerChecks,8);
  assert.equal(result.customerResizable,false);
  assert.equal(result.draftProfile.customerResizable,false);
  assert.equal(result.draftProfile.approval,'not_reviewed');
  assert.equal(result.draftProfile.status,'draft');
});

test('U11: W/H/D corner changes preserve both door hinges, 10 mm central gap, and fixed thickness',()=>{
  const parts=scene();const saved=JSON.stringify(parts),{result}=approvedGeometry(parts);
  for(const width of [780,860]) for(const height of [700,760]) for(const depth of [540,600]) {
    const updated=previewUniversalManualConstructionResize(parts,result.draftProfile,{width,height,depth});
    assert.equal(updated.ok,true,JSON.stringify(updated));
    const frame=manualWorldFrameU8(updated.parts);
    assert.deepEqual(Object.fromEntries(Object.entries(frame).map(([a,b])=>[a,b.size])),
      {width,height,depth});
    const left=updated.parts.find(p=>p.id==='left-door'),right=updated.parts.find(p=>p.id==='right-door');
    assert.ok(Math.abs(right.x-left.x-left.width-10)<=0.051,
      `door gap at ${width}/${height}/${depth}`);
    assert.equal(left.doorHinge,'left');assert.equal(right.doorHinge,'right');
    assert.equal(left.partFunction,'door');assert.equal(right.partFunction,'door');
    assert.equal(left.depth,6);assert.equal(right.depth,6);
    for(const id of ['left-side','right-side']) {
      const panel=updated.parts.find(p=>p.id===id);
      assert.equal(panel.rotationZ,-90);
      assert.equal(panel.height,18); // LOCAL thickness (world X thickness)
      assert.equal(panel.depth,depth-6);
    }
  }
  assert.equal(JSON.stringify(parts),saved,'Original scene must never mutate');
});

test('U11: previous Y=90 rotation support remains unchanged',()=>{
  const p={...scene()[2],rotationY:90,rotationZ:0,width:18,height:720,depth:560};
  assert.equal(manualQuarterTurnU8(p),90);
  assert.deepEqual(manualPartFromWorldBoxU8(p,manualWorldBoxU8(p)),p);
});

test('U11: arbitrary, upside-down, and compound rotations still fail closed',()=>{
  for(const changes of [{rotationX:90},{rotationZ:45},{rotationZ:180},{rotationY:90,rotationZ:90}]) {
    const parts=scene();Object.assign(parts[2],changes);
    assert.equal(manualQuarterTurnU8(parts[2]),null);
    assert.equal(proposeManualConstructionReviewU2(parts).ok,false);
  }
});

test('U11: duplicated different top-panel cuts stay rejected until Admin corrects Part Code',()=>{
  const parts=scene();parts[4].partCode=parts[0].partCode;
  const reviewed=reviewManualConstructionDraftU2(parts,settings(parts));
  assert.equal(reviewed.code,'PART_CODE_CUT_MISMATCH');
});

test('U11: backend U4 review + U6 quotation authorization recheck resized Z panels',async()=>{
  const parts=scene(),{settings:s,result}=approvedGeometry(parts);
  const saved=await normalizeManualReviewForSave({
    parts,incoming:{status:'submitted_for_review',customerResizable:false,settings:s},
    actorId:1,now:'2026-10-13T00:00:00Z',
  });
  assert.equal(saved.ok,true,JSON.stringify(saved));
  assert.equal(saved.value.customerResizable,false);
  assert.deepEqual(saved.value.draftProfile,result.draftProfile);
  const target={width:840,height:750,depth:580};
  const plan=previewUniversalManualConstructionResize(parts,saved.value.draftProfile,target);
  assert.equal(plan.ok,true,JSON.stringify(plan));
  const item={...target,unit:'mm',editor_snapshot:{components:copy(plan.parts)},
    customization_snapshot:{width_mm:target.width,height_mm:target.height,depth_mm:target.depth}};
  const valid=await authorizeUniversalManualOrderU6({
    designData:{components:parts,manualConstructionReviewU4:saved.value},item,
  });
  assert.equal(valid.ok,true,JSON.stringify(valid));
  assert.equal(valid.applies,true);
  const tampered=copy(item);tampered.editor_snapshot.components[2].height=30;
  const denied=await authorizeUniversalManualOrderU6({
    designData:{components:parts,manualConstructionReviewU4:saved.value},item:tampered,
  });
  assert.equal(denied.ok,false);
});
