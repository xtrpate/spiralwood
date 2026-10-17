import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBlueprintFloorEdits, getWorldFloorXZCorrection } from '../src/pages/blueprints/data/floorWorkspaceA3.mjs';
const W=6400,D=5200,Y=3160;
const part=(id,changes={})=>({id,type:'furniture_bottom_panel',x:1200,y:2500,z:1400,width:700,height:500,depth:600,rotationX:0,rotationY:0,rotationZ:0,...changes});
const check=(components,changes)=>validateBlueprintFloorEdits({components,updatesById:changes,worldWidth:W,worldDepth:D,floorComponentY:Y});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const source=filename=>fs.readFileSync(path.join(root,filename),'utf8');

test('A3A: valid single part move passes; outside left/right rejected',()=>{
 const a=part('a');assert.equal(check([a],{a:{x:0}}).ok,true);
 assert.equal(check([a],{a:{x:-1}}).code,'PART_OUTSIDE_FLOOR');
 assert.equal(check([a],{a:{x:W-699}}).code,'PART_OUTSIDE_FLOOR');
});
test('A3A: front/back border exact contact passes and crossing fails',()=>{
 const a=part('a');assert.equal(check([a],{a:{z:4600}}).ok,true);
 assert.equal(check([a],{a:{z:4601}}).code,'PART_OUTSIDE_FLOOR');
 assert.equal(check([a],{a:{z:-1}}).code,'PART_OUTSIDE_FLOOR');
});
test('A3A: rotated 90deg panel uses real footprint, not raw width/depth',()=>{
 const a=part('a',{x:6300,width:60,depth:400,rotationY:90});
 assert.equal(check([a],{a:{x:6300}}).code,'PART_OUTSIDE_FLOOR');
 assert.equal(check([a],{a:{x:6130}}).ok,true);
});
test('A3A: rotated 45deg side may cross edge even if origin is inside',()=>{
 const a=part('a',{x:0,z:100,width:50,depth:600});
 assert.equal(check([a],{a:{rotationY:45}}).code,'PART_OUTSIDE_FLOOR');
});
test('A3A: under-floor geometry blocked, face-to-floor allowed',()=>{
 const a=part('a');assert.equal(check([a],{a:{y:2660}}).ok,true);
 assert.equal(check([a],{a:{y:2661}}).code,'PART_BELOW_FLOOR');
});
test('A3A: whole batch rejects when any selected part would extend outside',()=>{
 const a=part('a'),b=part('b',{x:5700});
 const old=structuredClone([a,b]);
 assert.equal(check([a,b],{a:{x:1300},b:{x:5800}}).code,'PART_OUTSIDE_FLOOR');
 assert.deepEqual([a,b],old,'no mutation even on rejected batched edit');
});
test('A3A: nongeometry edit to legacy out-of-bounds part still works',()=>{
 const old=part('old',{x:-500});
 assert.equal(check([old],{old:{material:'Mahogany'}}).ok,true);
 assert.equal(check([old],{old:{x:0}}).ok,true);
});
test('A3A: no silent correction of geometry, exact candidate validation only',()=>{
 const a=part('a');const attrs={x:6400};
 assert.equal(check([a],{a:attrs}).ok,false);
 assert.deepEqual(attrs,{x:6400});
});
test('A3A: world-space single or group clamp by same x/z offset',()=>{
 assert.deepEqual(getWorldFloorXZCorrection({minX:3100,maxX:3400,minZ:-2750,maxZ:-2550,worldWidth:W,worldDepth:D}),{ok:true,dx:-200,dz:150});
 assert.deepEqual(getWorldFloorXZCorrection({minX:-3200,maxX:-3000,minZ:2400,maxZ:2600,worldWidth:W,worldDepth:D}),{ok:true,dx:0,dz:0});
});
test('A3A: oversized object cannot be clamped into floor',()=>{
 assert.equal(getWorldFloorXZCorrection({minX:-4000,maxX:4000,minZ:-200,maxZ:200,worldWidth:W,worldDepth:D}).code,'FURNITURE_TOO_LARGE');
});
test('A3A: nonphysical reference proxy does not force floor rejection',()=>{
 const a=part('ref',{type:'reference_proxy',x:-12000});
 assert.equal(check([a],{ref:{x:-11000}}).ok,true);
});
test('A3A: invalid candidate or incorrect world configuration fails closed',()=>{
 const a=part('a');
 assert.equal(check([a],{a:{width:0}}).code,'INVALID_PART_GEOMETRY');
 assert.equal(validateBlueprintFloorEdits({components:[a],updatesById:{a:{x:0}},worldWidth:-10,worldDepth:D,floorComponentY:Y}).code,'INVALID_WORKSPACE');
});
test('A3A: editor actively validates single, batch changes, and live scene transforms',()=>{
 const design=source('admin/frontend/src/pages/blueprints/BlueprintDesign.jsx');
 const viewer=source('admin/frontend/src/pages/blueprints/3d/threeDViewer.jsx');
 assert.match(design,/validateBlueprintFloorEdits\(/);
 assert.ok(design.split('validateBlueprintFloorEdits({').length>=3,'both updateComp and updateManyComps guarded');
 assert.match(viewer,/getWorldFloorXZCorrection\(/);
 assert.match(viewer,/pivot\.position\.x \+= correction\.dx/);
 assert.match(viewer,/const restoreLastSafe = /);
 assert.match(viewer,/clampObjectToBlueprintFloor\(entry\.obj\)/);
});
