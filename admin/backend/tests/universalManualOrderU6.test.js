'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('fs');
const path=require('path');
const {normalizeManualReviewForSave}=require('../services/universalManualReviewU4');
const {authorizeUniversalManualOrderU6}=require('../services/universalManualOrderU6');
const {pathToFileURL}=require('url');
const engineUrl=pathToFileURL(path.resolve(__dirname,'../../frontend/src/utils/universalManualConstructionU1.mjs')).href;
const clone=x=>JSON.parse(JSON.stringify(x));
const table=()=>{
  const part=(id,code,type,x,y,z,width,height,depth)=>({id,partCode:code,type,label:type,
    partRole:type,x,y,z,width,height,depth,material:'Oak Wood',wood_type:'Oak Wood',
    qty:1,locked:false,visible:true});
  return [part('top','TOP-TEST','furniture_board_panel',0,200,0,800,18,781),
  part('a','LEG-A','furniture_leg',20,218,30,50,691,50),
  part('b','LEG-B','furniture_leg',730,218,30,50,691,50),
  part('c','LEG-C','furniture_leg',20,218,701,50,691,50),
  part('d','LEG-D','furniture_leg',730,218,701,50,691,50)];
};
const settings=(parts)=>{
 const rules={};for(const p of parts){const top=p.id==='top',right=p.x>400,back=p.z>400;
 rules[p.id]={width:{start:top?'min':right?'max':'min',end:top?'max':right?'max':'min'},
 height:{start:'min',end:top?'min':'max'},
 depth:{start:top?'min':back?'max':'min',end:top?'max':back?'max':'min'}};}
 return {rulesByPartId:rules,limits:{width:{min:720,max:1000},height:{min:639,max:1000},depth:{min:703,max:1000}},confirmedPartIds:parts.map(p=>p.id),pivots:{width:'min',height:'max',depth:'min'}};
};
async function setup(){const components=table();const review=await normalizeManualReviewForSave({
  parts:components,incoming:{status:'submitted_for_review',customerResizable:false,settings:settings(components)},actorId:12,now:'2026-10-12T10:00:00Z'});
 assert.equal(review.ok,true,JSON.stringify(review));
 return {designData:{components,manualConstructionReviewU4:review.value},review:review.value};}
async function submit(designData,dimensions={width:900,height:760,depth:900}){
 const {previewUniversalManualConstructionResize}=await import(engineUrl);
 const preview=previewUniversalManualConstructionResize(designData.components,designData.manualConstructionReviewU4.draftProfile,dimensions);
 assert.equal(preview.ok,true,JSON.stringify(preview));
 return { ...dimensions,unit:'mm',editor_snapshot:{components:clone(preview.parts)},
 customization_snapshot:{width_mm:dimensions.width,height_mm:dimensions.height,depth_mm:dimensions.depth}};
}
test('U6 accepts valid newly-reviewed manual W/H/D quotation request',async()=>{
 const {designData}=await setup(),item=await submit(designData);
 const r=await authorizeUniversalManualOrderU6({designData,item});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.partCount,5);assert.equal(r.applies,true);
});
test('U6 accepts original reviewed geometry, but never grants manufacturing certification',async()=>{
 const {designData}=await setup(),item=await submit(designData,{width:800,height:709,depth:781});
 const r=await authorizeUniversalManualOrderU6({designData,item});assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(designData.manualConstructionReviewU4.customerResizable,false);
});
test('U6 preserves legitimate per-part customer wood and finish selections',async()=>{
 const {designData}=await setup(),item=await submit(designData);
 item.editor_snapshot.components[0].wood_type='Mahogany'; item.editor_snapshot.components[0].material='Mahogany';
 item.editor_snapshot.components[1].finish='walnut';
 assert.equal((await authorizeUniversalManualOrderU6({designData,item})).ok,true);
});
test('U6 rejects changed leg, position, cross-section, missing and duplicate parts',async()=>{
 const {designData}=await setup(),item=await submit(designData);
 for(const mutate of [
  x=>x.editor_snapshot.components[1].x+=3,
  x=>x.editor_snapshot.components[2].width+=2,
  x=>x.editor_snapshot.components.pop(),
  x=>x.editor_snapshot.components[1].id=x.editor_snapshot.components[0].id,
  x=>x.editor_snapshot.components[3].partCode='HACK',
  x=>x.editor_snapshot.components[4].qty=2,
  x=>x.editor_snapshot.components[4].locked=true,
  x=>x.editor_snapshot.components[4].rotationY=20,
 ]){const bad=clone(item);mutate(bad);const r=await authorizeUniversalManualOrderU6({designData,item:bad});assert.equal(r.ok,false,JSON.stringify(r));}
});
test('U6 rejects out-of-range values, mismatched dimension summaries, decimals and wrong units',async()=>{
 const {designData}=await setup(),item=await submit(designData);
 for(const [key,value] of [['width',1100],['width',900.3],['height','760'],['unit','in']]){
  const bad=clone(item);bad[key]=value;assert.equal((await authorizeUniversalManualOrderU6({designData,item:bad})).ok,false,key);
 }
 const bad=clone(item);bad.customization_snapshot.height_mm=999;
 assert.equal((await authorizeUniversalManualOrderU6({designData,item:bad})).ok,false);
});
test('U6 rejects stale/fake U4 review and forged client preview marker has no effect',async()=>{
 const {designData}=await setup(),item=await submit(designData);
 const forged=clone(designData);forged.manualConstructionReviewU4.customerResizable=true;
 assert.equal((await authorizeUniversalManualOrderU6({designData:forged,item})).ok,false);
 const stale=clone(designData);stale.components[1].z+=19;
 assert.equal((await authorizeUniversalManualOrderU6({designData:stale,item})).ok,false);
 item.customer_universal_manual_resize={verified:true,customerResizable:true};
 item.editor_snapshot.components[1].x+=1;
 assert.equal((await authorizeUniversalManualOrderU6({designData,item})).ok,false);
});
test('U6 leaves existing unreviewed template/legacy checkout path untouched',async()=>{
 const original=table();const r=await authorizeUniversalManualOrderU6({designData:{components:original},item:{editor_snapshot:{components:original}}});
 assert.equal(r.ok,true);assert.equal(r.applies,false);
});
test('U6 route verifies submitted geometry before INSERT orders, not just in browser',()=>{
 const root=path.resolve(__dirname,'../../..');const order=fs.readFileSync(path.join(root,'admin/backend/controllers/customer/customer.customorders.js'),'utf8');
 const viewer=fs.readFileSync(path.join(root,'admin/frontend/src/pages/customer/customer3dviewer.jsx'),'utf8');
 const start=order.indexOf('authorizeUniversalManualOrderU6({');
 const insert=order.indexOf('`INSERT INTO orders');
 assert.ok(start>=0 && insert>start);
 assert.ok(order.includes('sourceRows[0].design_data'));
 assert.ok(order.includes('await conn.rollback();'));
 assert.ok(!viewer.includes('disabled={universalPreviewEdited}'));
 assert.ok(viewer.includes('server-validated at custom checkout'));
});
test('U6 authorizes a new six-part bookshelf using the SAME generic rule engine',async()=>{
 const part=(id,role,x,y,z,w,h,d)=>({id,partCode:'B-'+id,type:'generic_board',partRole:role,
 material:'Pine',wood_type:'Pine',x,y,z,width:w,height:h,depth:d,locked:false,qty:1});
 const components=[
  part('left','side',0,0,0,18,750,450),part('right','side',782,0,0,18,750,450),
  part('top','top',18,0,0,764,18,450),part('bottom','bottom',18,732,0,764,18,450),
  part('shelf','shelf',18,360,0,764,18,432),part('back','back',18,18,432,764,714,18)];
 const rules={};for(const p of components){
  const x=p.partRole;
  rules[p.id]=x==='side' ? {width:{start:p.x===0?'min':'max',end:p.x===0?'min':'max'},height:{start:'min',end:'max'},depth:{start:'min',end:'max'}}:
    x==='top'? {width:{start:'min',end:'max'},height:{start:'min',end:'min'},depth:{start:'min',end:'max'}}:
    x==='bottom'?{width:{start:'min',end:'max'},height:{start:'max',end:'max'},depth:{start:'min',end:'max'}}:
    x==='shelf'?{width:{start:'min',end:'max'},height:{start:'center',end:'center'},depth:{start:'min',end:'max'}}:
    {width:{start:'min',end:'max'},height:{start:'min',end:'max'},depth:{start:'max',end:'max'}};
 }
 const s={rulesByPartId:rules,limits:{width:{min:700,max:950},height:{min:650,max:840},depth:{min:400,max:570}},pivots:{width:'min',height:'max',depth:'min'},confirmedPartIds:components.map(p=>p.id)};
 const review=await normalizeManualReviewForSave({parts:components,incoming:{status:'submitted_for_review',settings:s},actorId:12});
 assert.equal(review.ok,true,JSON.stringify(review));
 const designData={components,manualConstructionReviewU4:review.value};
 const item=await submit(designData,{width:890,height:790,depth:500});
 const result=await authorizeUniversalManualOrderU6({designData,item});assert.equal(result.ok,true,JSON.stringify(result));
});
