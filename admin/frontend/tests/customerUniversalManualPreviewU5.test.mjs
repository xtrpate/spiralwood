import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createUniversalManualConstructionDraft } from '../src/utils/universalManualConstructionU1.mjs';
import { getCustomerUniversalManualPreviewSupport, planCustomerUniversalManualPreviewResize,
  isCustomerUniversalManualPreviewChanged } from '../src/utils/customerUniversalManualPreviewU5.mjs';
function table(){
 const make=(id,type,x,y,z,w,h,d)=>({id,partCode:id,type,label:id,partRole:type,
  x,y,z,width:w,height:h,depth:d,material:'Oak Wood',wood_type:'Oak Wood',visible:true,locked:false,qty:1});
 return [make('top','furniture_board_panel',0,200,0,800,18,781),
 make('leg-a','furniture_leg',20,218,30,50,691,50),
 make('leg-b','furniture_leg',730,218,30,50,691,50),
 make('leg-c','furniture_leg',20,218,701,50,691,50),
 make('leg-d','furniture_leg',730,218,701,50,691,50)];
}
function auth(parts=table()){
 const rules={};
 for(const p of parts){
 const top=p.id==='top',right=p.x>400,back=p.z>400;
 rules[p.id]={
  width:{start:top?'min':right?'max':'min',end:top?'max':right?'max':'min'},
  height:{start:'min',end:top?'min':'max'},
  depth:{start:top?'min':back?'max':'min',end:top?'max':back?'max':'min'},
 };
 }
 const compiled=createUniversalManualConstructionDraft(parts,{rulesByPartId:rules,
  allowedDimensions:{width:{min:720,max:1000},height:{min:639,max:1000},depth:{min:703,max:1000}},
  pivots:{width:'min',height:'max',depth:'min'}});
 assert.equal(compiled.ok,true,compiled.error);
 return {verified:true,previewOnly:true,sourceParts:parts,profile:compiled.profile};
}
test('U5: cannot unlock a scene without verified server preview eligibility',()=>{
 const parts=table(), a=auth(parts);
 for(const bad of [null,{...a,verified:false},{...a,previewOnly:false},
  {...a,profile:{...a.profile,customerResizable:true}},{...a,profile:{...a.profile,status:'geometry_reviewed'}}]){
   assert.equal(getCustomerUniversalManualPreviewSupport(bad,parts).ok,false);
 }
});
test('U5: manual family-neutral W/H/D preview works from immutable reviewed original',()=>{
 const parts=table(),a=auth(parts);
 let live=parts;
 for(const [axis,wanted] of [['width',900],['height',760],['depth',900]]){
   const r=planCustomerUniversalManualPreviewResize(a,live,axis,wanted);
   assert.equal(r.ok,true,JSON.stringify(r));
   assert.equal(r[axis],wanted);
   live=r.parts;
   assert.equal(getCustomerUniversalManualPreviewSupport(a,live).ok,true);
   assert.equal(isCustomerUniversalManualPreviewChanged(a,live),true);
 }
 assert.equal(live[0].width,900);
 assert.equal(live[0].depth,900);
 assert.equal(live[1].width,50);
 assert.equal(live[1].depth,50);
 assert.equal(live[1].y+live[1].height,parts[1].y+parts[1].height);
});
test('U5: original parts do not change, finish overlays survive, and return-to-original works',()=>{
 const parts=table(),snapshot=JSON.stringify(parts),a=auth(parts);
 const live=parts.map(p=>({...p,requested_wood_type:'Pine',finish:'#abcd12'}));
 const applied=planCustomerUniversalManualPreviewResize(a,live,'width',900);
 assert.equal(applied.ok,true);
 assert.equal(applied.parts[0].requested_wood_type,'Pine');
 assert.equal(applied.parts[0].finish,'#abcd12');
 assert.equal(JSON.stringify(parts),snapshot);
 const original=planCustomerUniversalManualPreviewResize(a,applied.parts,'width',800);
 assert.equal(original.ok,true);
 assert.equal(isCustomerUniversalManualPreviewChanged(a,original.parts),false);
});
test('U5: incomplete, modified, disconnected and out-of-range scenes fail closed',()=>{
 const parts=table(),a=auth(parts);
 for(const live of [parts.slice(1),parts.map(p=>p.id==='leg-a'?{...p,x:p.x+3}:p),
  parts.map(p=>p.id==='leg-a'?{...p,partCode:'CHANGED'}:p)]){
   assert.equal(getCustomerUniversalManualPreviewSupport(a,live).ok,false);
 }
 assert.equal(planCustomerUniversalManualPreviewResize(a,parts,'height',1600).ok,false);
 assert.equal(planCustomerUniversalManualPreviewResize(a,parts,'width',899.5).ok,false);
 assert.equal(planCustomerUniversalManualPreviewResize(a,parts,'other',900).ok,false);
});
test('U5/U6: family planners remain; cart unlocked only with backend checkout validation',()=>{
 const src=fs.readFileSync(new URL('../src/pages/customer/customer3dviewer.jsx',import.meta.url),'utf8');
 const backend=fs.readFileSync(new URL('../../backend/controllers/customer/customer.customorders.js',import.meta.url),'utf8');
 assert.match(src,/getCustomerCabinetResizeSupport/);
 assert.match(src,/getCustomerBookshelfResizeSupport/);
 assert.match(src,/getCustomerDiningTableResizeSupport/);
 assert.doesNotMatch(src,/disabled=\{universalPreviewEdited\}/);
 assert.doesNotMatch(src,/if \(universalPreviewEdited\) \{\s*showCustomizeFeedback\("This manual size is a preview only/);
 assert.match(src,/server-validated at custom checkout/);
 assert.match(backend,/authorizeUniversalManualOrderU6\(/);
 assert.match(src,/canPreviewUniversal\("width"\)/);
});
test('U5: the exact same viewer preview helper accepts a six-part manual bookshelf',()=>{
 const make=(id,role,x,y,z,w,h,d)=>({id,partCode:id,type:'generic_board',partRole:role,
  x,y,z,width:w,height:h,depth:d,material:'Pine',wood_type:'Pine',qty:1,locked:false});
 const p=[make('L','side',0,0,0,18,750,450),make('R','side',782,0,0,18,750,450),
  make('TOP','top',18,0,0,764,18,450),make('BOT','bottom',18,732,0,764,18,450),
  make('SHELF','shelf',18,360,0,764,18,432),make('BACK','back',18,18,432,764,714,18)];
 const mid={basis:'fraction',fraction:.5};const f=(s,e)=>({start:s,end:e});
 const rules=Object.fromEntries(p.map(o=>[o.id,(
  o.partRole==='side'? {width:f(o.x===0?'min':'max',o.x===0?'min':'max'),height:f('min','max'),depth:f('min','max')}:
  o.partRole==='top'?{width:f('min','max'),height:f('min','min'),depth:f('min','max')}:
  o.partRole==='bottom'?{width:f('min','max'),height:f('max','max'),depth:f('min','max')}:
  o.partRole==='shelf'?{width:f('min','max'),height:f(mid,mid),depth:f('min','max')}:
  {width:f('min','max'),height:f('min','max'),depth:f('max','max')}
 )]));
 const c=createUniversalManualConstructionDraft(p,{rulesByPartId:rules,allowedDimensions:{
   width:{min:700,max:950},height:{min:650,max:850},depth:{min:350,max:550}}});
 assert.equal(c.ok,true,c.error);
 const a={verified:true,previewOnly:true,sourceParts:p,profile:c.profile};
 const width=planCustomerUniversalManualPreviewResize(a,p,'width',850);
 assert.equal(width.ok,true,width.error);
 assert.equal(width.parts[0].width,18);
 const depth=planCustomerUniversalManualPreviewResize(a,width.parts,'depth',500);
 assert.equal(depth.ok,true,depth.error);
 assert.equal(depth.parts.find(v=>v.id==='BACK').depth,18);
});
test('U5: customer detail endpoint rechecks U4 before exposing a preview-only profile',()=>{
 const backend=fs.readFileSync(new URL('../../backend/controllers/customer/customer.blueprints.js',import.meta.url),'utf8');
 const adapter=fs.readFileSync(new URL('../src/pages/customer/customerBlueprintAdapter.js',import.meta.url),'utf8');
 const workbench=fs.readFileSync(new URL('../src/pages/customer/CustomerTemplateWorkbench.jsx',import.meta.url),'utf8');
 assert.match(backend,/checkStoredManualReviewForPublish\(/);
 assert.match(backend,/customer_universal_manual_resize: customerUniversalPreview/);
 assert.match(backend,/previewOnly: true/);
 assert.match(backend,/savedManualReview\?\.draftProfile\?\.customerResizable === false/);
 assert.match(adapter,/blueprint\?\.customer_universal_manual_resize/);
 assert.match(workbench,/universalManualPreview=\{sceneData\?\.universalManualPreview/);
});
