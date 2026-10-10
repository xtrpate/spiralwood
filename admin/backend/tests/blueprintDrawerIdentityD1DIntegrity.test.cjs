'use strict';
// D1-D: verifies generated-drawer identity survives normalizeComponent.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const src=fs.readFileSync(path.join(root,'admin/frontend/src/pages/blueprints/data/componentUtils.js'),'utf8');
const viewer=fs.readFileSync(path.join(root,'admin/frontend/src/pages/blueprints/3d/threeDViewer.jsx'),'utf8');
const builder=fs.readFileSync(path.join(root,'admin/frontend/src/pages/blueprints/hooks/useBlueprintBuilderActions.js'),'utf8');
const start=src.indexOf('    // WISDOM D1-D GENERATED DRAWER IDENTITY');
const end=src.indexOf('    qty: Math.max(1, Number(c.qty) || 1),',start);
assert.ok(start>0&&end>start,'normalizeComponent drawer identity must be present');
const snippet=src.slice(start,end).replace(/\r/g,'');
const spreadStart=snippet.indexOf('...((');const spreadEnd=snippet.lastIndexOf('),');
assert.ok(spreadStart>=0&&spreadEnd>spreadStart,'Generated metadata conditional spread required');
// Execute only the literal object-spread snippet with pure sample data.
const expression=snippet.slice(spreadStart,spreadEnd+2);
const project=new Function('c',`return ({${expression}});`);
const drawerA={drawerBuilderGenerated:true,drawerBuilderVersion:1,drawerAssemblyId:'group-A',drawerIndex:1,drawerTargetScope:'whole',drawerTargetBayIndex:1,drawerTargetRowIndex:2,drawerDepth:450,drawerLeftClearance:12.5,drawerRightClearance:12.5,drawerBottomClearance:12,drawerFrontOverlay:8,drawerGap:10,drawerSide:'left'};
const drawerB={...drawerA,drawerAssemblyId:'group-B',drawerIndex:2,drawerSide:'right'};
for(const item of [drawerA,drawerB]){
 const norm=project(item);
 assert.equal(norm.drawerAssemblyId,item.drawerAssemblyId,'Drawer ID preserved');
 assert.equal(norm.drawerBuilderGenerated,true,'Generated marker preserved');
 assert.equal(norm.drawerIndex,item.drawerIndex);
 assert.equal(norm.drawerTargetRowIndex,item.drawerTargetRowIndex);
 assert.equal(norm.drawerDepth,item.drawerDepth);
 assert.equal(norm.drawerSide,item.drawerSide);
}
assert.notEqual(project(drawerA).drawerAssemblyId,project(drawerB).drawerAssemblyId,'Multiple drawers keep distinct group identity');
assert.deepEqual(project({label:'Cabinet Top',partRole:'top'}),{},'Legacy/non-generated parts do not gain drawer-only fields');
const roles=['drawer_front','drawer_side','drawer_side','drawer_back','drawer_bottom','drawer_handle','drawer_slide','drawer_slide'];
const makeEight=(id)=>roles.map(partRole=>({...project({...drawerA,drawerAssemblyId:id}),partRole}));
const grouped=new Map();for(const part of [...makeEight('A'),...makeEight('B')]) {if(!grouped.has(part.drawerAssemblyId))grouped.set(part.drawerAssemblyId,[]);grouped.get(part.drawerAssemblyId).push(part);}
assert.equal(grouped.size,2);assert.equal(grouped.get('A').length,8);assert.equal(grouped.get('B').length,8);
assert.ok(builder.includes('byDrawer.has("")')&&builder.includes('drawerAssemblyId'),'D1-C group completeness check retained');
assert.ok(viewer.includes('component?.drawerAssemblyId')&&viewer.includes('resolveDrawerPreviewKey(item) === key'),'3D moving group uses preserved identity');
console.log('PASS: D1-D generated drawer IDs and fit metadata survive normalization; 8-part groups remain distinct; legacy parts unchanged.');
