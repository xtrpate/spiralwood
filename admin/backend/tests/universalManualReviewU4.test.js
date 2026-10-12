'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  REVIEW_KEY, normalizeManualReviewForSave, checkStoredManualReviewForPublish,
} = require('../services/universalManualReviewU4');
const { reviewManualConstructionDraftU2 } = ({}); // Pure ESM API is exercised through backend service.

function table() {
  const item=(id,code,type,x,y,z,width,height,depth)=>({id,partCode:code,type,label:type,partRole:type,
    x,y,z,width,height,depth,material:'Oak Wood',wood_type:'Oak Wood',qty:1,locked:false,visible:true});
  return [
    item('top','TOP-TEST','furniture_board_panel',0,200,0,800,18,781),
    item('front-left','LEG-A','furniture_leg',20,218,30,50,691,50),
    item('front-right','LEG-B','furniture_leg',730,218,30,50,691,50),
    item('back-left','LEG-C','furniture_leg',20,218,701,50,691,50),
    item('back-right','LEG-D','furniture_leg',730,218,701,50,691,50),
  ];
}
function spec(parts) {
  const rules={};
  for(const part of parts){
    const top=part.id==='top', isRight=part.x>400, isBack=part.z>400;
    rules[part.id]={
      width: {start: top?'min':isRight?'max':'min',end:top?'max':isRight?'max':'min'},
      height:{start:'min',end:top?'min':'max'},
      depth: {start:top?'min':isBack?'max':'min',end:top?'max':isBack?'max':'min'},
    };
  }
  return {rulesByPartId:rules,limits:{width:{min:720,max:1000},height:{min:639,max:1000},depth:{min:703,max:1000}},
    confirmedPartIds:parts.map(p=>p.id),pivots:{width:'min',height:'max',depth:'min'}};
}
async function reviewed(parts=table()){
  return normalizeManualReviewForSave({parts,incoming:{status:'submitted_for_review',customerResizable:false,settings:spec(parts)},actorId:19,now:'2026-10-12T10:00:00.000Z'});
}
test('U4 generic five-part geometry is stamped by backend as geometry reviewed, NOT Customer enabled', async()=>{
  const result=await reviewed();assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.value.status,'geometry_reviewed');
  assert.equal(result.value.reviewedBy,19);
  assert.equal(result.value.customerResizable,false);
  assert.equal(result.value.draftProfile.customerResizable,false);
  assert.equal(result.value.cornerChecks,8);
  assert.equal(REVIEW_KEY,'manualConstructionReviewU4');
});
test('U4 published JSON can retain an unchanged valid review; no review is optional',async()=>{
  const parts=table(),result=await reviewed(parts);assert.equal(result.ok,true,JSON.stringify(result));
  const retained=await normalizeManualReviewForSave({parts,incoming:result.value,previous:result.value});
  assert.equal(retained.action,'retained');
  assert.equal((await checkStoredManualReviewForPublish({parts,savedReview:result.value})).ok,true);
  assert.equal((await checkStoredManualReviewForPublish({parts,savedReview:null})).ok,true);
});
test('U4 fails closed for client fake approval, edited reviewer metadata, missing review checkboxes',async()=>{
  const parts=table();let input=spec(parts);input.confirmedPartIds.pop();
  assert.equal((await normalizeManualReviewForSave({parts,incoming:{status:'submitted_for_review',settings:input},actorId:19})).ok,false);
  input=spec(parts);
  assert.equal((await normalizeManualReviewForSave({parts,incoming:{status:'submitted_for_review',settings:input,customerResizable:true},actorId:19})).ok,false);
  const x=await reviewed();assert.equal(x.ok,true,JSON.stringify(x));
  const forged={...x.value,reviewedBy:20};
  assert.equal((await normalizeManualReviewForSave({parts,incoming:forged,previous:x.value})).code,'REVIEW_TAMPERED');
  assert.equal((await normalizeManualReviewForSave({parts,incoming:x.value,previous:null})).code,'REVIEW_TAMPERED');
  assert.equal((await checkStoredManualReviewForPublish({parts,savedReview:{...x.value,customerResizable:true}})).ok,false);
});
test('U4 geometry edit or part lock invalidates old reviewed profile on next design Save',async()=>{
  const parts=table(),old=await reviewed(parts);assert.equal(old.ok,true,JSON.stringify(old));
  const changed=parts.map(p=>p.id==='front-left'?{...p,x:p.x+15}:p);
  const stale=await normalizeManualReviewForSave({parts:changed,incoming:old.value,previous:old.value});
  assert.equal(stale.action,'invalidated',JSON.stringify(stale));
  const locked=parts.map(p=>p.id==='top'?{...p,locked:true}:p);
  assert.equal((await normalizeManualReviewForSave({parts:locked,incoming:old.value,previous:old.value})).action,'invalidated');
  assert.equal((await checkStoredManualReviewForPublish({parts:changed,savedReview:old.value})).ok,false);
});
test('U4 frontend code stages reviewed constraints, never gives customer permission',()=>{
 const fs=require('fs'), path=require('path');const root=path.resolve(__dirname,'../../..');
 const r=p=>fs.readFileSync(path.join(root,p),'utf8');
 const panel=r('admin/frontend/src/pages/blueprints/components/ManualConstructionReviewU2.jsx');
 const editor=r('admin/frontend/src/pages/blueprints/BlueprintDesign.jsx');
 const save=r('admin/frontend/src/pages/blueprints/hooks/useBlueprintPersistence.js');
 const backend=r('admin/backend/controllers/admin/blueprintController.crud.js');
 const publish=r('admin/backend/controllers/admin/productController.js');
 assert.ok(panel.includes('Stage geometry review for Save'));
 assert.ok(editor.includes('stagedManualReviewU4'));
 assert.ok(save.includes("status: 'submitted_for_review'"));
 assert.ok(backend.includes('normalizeManualReviewForSave'));
 assert.ok(publish.includes('checkStoredManualReviewForPublish'));
 assert.ok(!panel.includes('customerResizable:true'));
});
