import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {createUniversalManualConstructionDraft as compile,previewUniversalManualConstructionResize as preview} from '../src/utils/universalManualConstructionU1.mjs';
const require=createRequire(import.meta.url);
const {normalizeManualReviewForSave}=require('../../backend/services/universalManualReviewU4.js');
const pair=(start,end)=>({start,end});
const part=(id,type,x,y,z,width,height,depth)=>({id,partCode:'X-'+id,type,partRole:type,material:'Oak',wood_type:'Oak',x,y,z,width,height,depth,qty:1,locked:false,visible:true});
function scene(){
 const parts=[part('top','flat',0,200,0,800,18,781)];
 for(const [id,x,z] of [['a',30,30],['b',720,30],['c',30,701],['d',720,701]])parts.push(part(id,'support',x,218,z,50,691,50));
 const rules={};for(const p of parts){const top=p.id==='top',right=p.x>400,far=p.z>400;
 rules[p.id]={width:pair(top?'min':right?'max':'min',top?'max':right?'max':'min'),height:pair('min',top?'min':'max'),depth:pair(top?'min':far?'max':'min',top?'max':far?'max':'min')};}
 return {parts,rules,limits:{width:{min:720,max:1000},height:{min:639,max:1000},depth:{min:703,max:1000}},target:{width:1000,height:922,depth:1000}};
}
const plan=(s)=>{const draft=compile(s.parts,{rulesByPartId:s.rules,allowedDimensions:s.limits});assert.equal(draft.ok,true,JSON.stringify(draft));return preview(s.parts,draft.profile,s.target);};
test('U7 original generic five-part physical sections remain unchanged',()=>{const s=scene(),before=JSON.stringify(s.parts),result=plan(s);assert.equal(result.ok,true,JSON.stringify(result));assert.ok(result.parts.slice(1).every(p=>p.width===50&&p.depth===50));assert.equal(result.parts[0].height,18);assert.equal(JSON.stringify(s.parts),before);});
test('U7 catches the 105mm-type problem regardless of furniture family and ID',()=>{const s=scene();s.rules.a.depth=pair('min',{basis:'fraction',fraction:.25});const result=plan(s);assert.equal(result.code,'SECTION_CHANGED',JSON.stringify(result));assert.match(result.error,/X-a/);});
test('U7 catches panel thickness being silently stretched',()=>{const s=scene();s.rules.top.height=pair('min','max');const result=plan(s);assert.equal(result.code,'SECTION_CHANGED',JSON.stringify(result));assert.match(result.error,/X-top/);});
test('U7 server-side Admin Save re-check blocks a changed post cross-section',async()=>{const s=scene();s.rules.b.width=pair('max',{basis:'fraction',fraction:.75});const asChoice=x=>typeof x==='string'?x:x.fraction===.75?'three-quarter':'quarter';const rulesByPartId=Object.fromEntries(Object.entries(s.rules).map(([id,axes])=>[id,Object.fromEntries(Object.entries(axes).map(([axis,p])=>[axis,{start:asChoice(p.start),end:asChoice(p.end)}]))]));const result=await normalizeManualReviewForSave({parts:s.parts,actorId:9,incoming:{status:'submitted_for_review',customerResizable:false,settings:{rulesByPartId,limits:s.limits,confirmedPartIds:s.parts.map(p=>p.id),pivots:{width:'min',height:'max',depth:'min'}}}});assert.equal(result.ok,false,JSON.stringify(result));assert.equal(result.code,'PREVIEW_REJECTED');assert.match(result.message,/section/i);});
test('U7 preserves preview-only classification, never automatic manufacturing approval',()=>{const s=scene();const drafted=compile(s.parts,{rulesByPartId:s.rules,allowedDimensions:s.limits});assert.equal(drafted.profile.customerResizable,false);assert.equal(drafted.profile.approval,'not_reviewed');assert.equal(plan(s).customerResizable,false);});
