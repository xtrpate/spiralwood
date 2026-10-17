import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBlueprintSaveA4 } from '../src/pages/blueprints/data/floorSaveGuardA4.mjs';

const workspace = { w:6400, h:3200, d:5200 };
const floorOffset = 40;
const part = (id,changes={}) => ({ id, type:'panel', x:100, y:2900, z:100, width:300, height:260, depth:180, rotationX:0,rotationY:0,rotationZ:0, ...changes });
const approved = { status:'geometry_reviewed', customerResizable:false };
const verify = (before, after, opts={}) => validateBlueprintSaveA4({
 savedDesignData:{ components:before, ...(opts.review ? {manualConstructionReviewU4:approved}: {}) },
 nextComponents:after,worldSize:workspace,floorOffset,
 stagedManualReviewU4:opts.stage ?? null,
});

test('A4 allows valid new furniture part',()=>{
 const r=verify([],[part('new')]);assert.equal(r.ok,true);assert.equal(r.checkedParts,1);
});
test('A4 rejects new part crossing X edge',()=>{
 const r=verify([],[part('new',{x:6350})]);assert.equal(r.ok,false);assert.equal(r.code,'PART_OUTSIDE_FLOOR');
});
test('A4 rejects new part crossing Z edge',()=>{
 const r=verify([],[part('new',{z:5100})]);assert.equal(r.ok,false);
});
test('A4 rejects new part sinking below floor',()=>{
 const r=verify([],[part('new',{y:3100})]);assert.equal(r.ok,false);assert.equal(r.code,'PART_BELOW_FLOOR');
});
test('A4 accepts rotated 90 degree part on boundary correctly',()=>{
 const r=verify([],[part('new',{x:6160,width:300,depth:180,rotationY:90})]);assert.equal(r.ok,true);
});
test('A4 rejects rotated edge crossing that unrotated bounds would miss',()=>{
 const r=verify([],[part('new',{x:6070,width:300,depth:450,rotationY:90})]);assert.equal(r.ok,false);
});
test('A4 allows untouched legacy out of bounds on ordinary Save',()=>{
 const legacy=part('old',{x:6450});const r=verify([legacy],[{...legacy}]);assert.equal(r.ok,true);assert.equal(r.checkedParts,0);
});
test('A4 allows changing only finish on legacy outside furniture',()=>{
 const legacy=part('old',{x:6450});const r=verify([legacy],[{...legacy,finish:'Natural'}]);assert.equal(r.ok,true);assert.equal(r.checkedParts,0);
});
test('A4 rejects geometry change to legacy part that remains outside',()=>{
 const legacy=part('old',{x:6450});const r=verify([legacy],[{...legacy,x:6300}]);assert.equal(r.ok,false);
});
test('A4 permits fixing legacy geometry fully inside',()=>{
 const legacy=part('old',{x:6450});const r=verify([legacy],[{...legacy,x:6000}]);assert.equal(r.ok,true);
});
test('A4 removed-only operation is valid',()=>{
 assert.equal(verify([part('one')],[]).ok,true);
});
test('A4 rejects duplicate ids',()=>{
 assert.equal(verify([],[part('a'),part('a')]).code,'DUPLICATE_PART');
});
test('A4 requires re-review if previously reviewed geometry was moved',()=>{
 const b=[part('one'),part('two',{x:410})];const a=b.map(p=>({...p,x:p.x+20}));
 assert.equal(verify(b,a,{review:true}).code,'REVIEW_RECHECK_REQUIRED');
});
test('A4 requires re-review after part addition to reviewed blueprint',()=>{
 const b=[part('one')];const a=[...b,part('two',{x:500})];
 assert.equal(verify(b,a,{review:true}).code,'REVIEW_RECHECK_REQUIRED');
});
test('A4 requires re-review after part removal',()=>{
 const b=[part('one'),part('two')];assert.equal(verify(b,[b[0]],{review:true}).code,'REVIEW_RECHECK_REQUIRED');
});
test('A4 re-reviewed scene may submit changes for backend verification',()=>{
 const b=[part('one')],a=[{...b[0],x:200}];
 assert.equal(verify(b,a,{review:true,stage:{settings:{}}}).ok,true);
});
test('A4 unchanged reviewed scene can Save without re-review',()=>{
 const b=[part('one'),part('two',{x:500})];assert.equal(verify(b,[...b].reverse(),{review:true}).ok,true);
});
test('A4 changes to labels/finish do not invalidate floor or structural review',()=>{
 const b=[part('one'),part('two',{x:500})];const a=b.map(p=>({...p,label:'New label',finish:'Natural'}));
 assert.equal(verify(b,a,{review:true}).ok,true);
});
test('A4 changing review-sensitive part roles requires re-review',()=>{
 const b=[part('one')],a=[{...b[0],partRole:'shelf'}];
 assert.equal(verify(b,a,{review:true}).code,'REVIEW_RECHECK_REQUIRED');
});
test('A4 invalid placement is still rejected if re-review staged',()=>{
 assert.equal(verify([part('one')],[part('one',{x:6400})],{review:true,stage:{settings:{}}}).code,'PART_OUTSIDE_FLOOR');
});
test('A4 no scene fails closed',()=>{
 assert.equal(validateBlueprintSaveA4({nextComponents:null}).code,'INVALID_SCENE');
});

test('A4 actual Save hook invokes preflight before PUT and retains staged review gate',async()=>{
 const fs=await import('node:fs');
 const {fileURLToPath}=await import('node:url');
 const path=await import('node:path');
 const hookPath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src/pages/blueprints/hooks/useBlueprintPersistence.js');
 const hook=fs.readFileSync(hookPath,'utf8');
 assert.match(hook,/import \{ validateBlueprintSaveA4 \} from "\.\.\/data\/floorSaveGuardA4\.mjs"/);
 assert.match(hook,/const savePreflight = validateBlueprintSaveA4\(\{/);
 assert.ok(hook.indexOf('const savePreflight =') < hook.indexOf('const response = await api.put(`'));
 assert.match(hook,/stagedManualReviewU4.signature !== savingEditorStateSignature/);
 assert.match(hook,/return \{ ok: false, reason: savePreflight.code \}/);
});
