import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBlueprintFloorWorkspace, getBlueprintFootprint,
  checkBlueprintFloorPlacement, planBlueprintAutoCenter,
} from '../src/pages/blueprints/data/floorWorkspaceA1.mjs';

const W = 6400, D = 5200;
const part = (id, groupId, x, z, width = 100, depth = 100, extra = {}) => ({
  id, groupId, type:'furniture_bottom_panel',
  x, y:2800, z, width, height:18, depth,
  rotationX:0,rotationY:0,rotationZ:0, ...extra,
});
const plan = (components, selectedIds) =>
  planBlueprintAutoCenter({components,selectedIds,worldWidth:W,worldDepth:D});
const near = (actual,expected) => assert.ok(Math.abs(actual - expected) < 1e-6,
  `got ${actual}; expected ${expected}`);

test('A1 floor uses saved component x/z coordinates, not the larger visible 6800 mm plane',()=>{
  assert.deepEqual(getBlueprintFloorWorkspace({worldWidth:W,worldDepth:D}),{
    ok:true,minX:0,maxX:6400,minZ:0,maxZ:5200,
    centerX:3200,centerZ:2600,width:6400,depth:5200,
  });
  assert.equal(getBlueprintFloorWorkspace({worldWidth:0,worldDepth:D}).code,'INVALID_WORKSPACE');
});

test('A1 single assembly moves together and never mutates source materials/dimensions/rotation',()=>{
  const components=[
    part('left','A',200,300,20,600,{material:'Mahogany',partCode:'SIDE-L'}),
    part('right','A',980,300,20,600,{material:'Pine',partCode:'SIDE-R'}),
    part('shelf','A',220,300,760,600,{material:'Mahogany',partCode:'S-1'}),
  ];
  const before=structuredClone(components);
  const result=plan(components,['left','right','shelf']);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.selectedCount,3);
  near(result.deltaX, 3200 - 600);
  near(result.deltaZ, 2600 - 600);
  const moved=components.map(c=>({...c,...result.updatesById[c.id]}));
  const frame=getBlueprintFootprint(moved);
  near(frame.centerX,3200);near(frame.centerZ,2600);
  assert.equal(checkBlueprintFloorPlacement({parts:moved,worldWidth:W,worldDepth:D}).ok,true);
  for(let i=0;i<components.length;i++){
    near(moved[i].x-components[i].x,result.deltaX);
    near(moved[i].z-components[i].z,result.deltaZ);
    for(const field of ['y','width','height','depth','rotationY','material','partCode'])
      assert.equal(moved[i][field],components[i][field]);
  }
  assert.deepEqual(components,before,'planner must never mutate state');
});

test('A1 moving one group does not move another furniture; center occupancy is blocked',()=>{
  const a=[part('a','A',100,100)];
  const b=[part('b','B',5000,4000)];
  const result=plan([...a,...b],['a']);
  assert.equal(result.ok,true);
  assert.deepEqual(Object.keys(result.updatesById),['a']);
  assert.equal(result.updatesById.b,undefined);
  const blocked=plan([part('a','A',100,100),part('b','B',3150,2550)],['a']);
  assert.equal(blocked.code,'CENTER_OCCUPIED');
});

test('A1 prevents incomplete, mixed and multiple grouped furniture selection',()=>{
  const components=[part('a','A',100,100),part('b','A',200,100),part('c','B',4000,4000)];
  assert.equal(plan(components,['a']).code,'INCOMPLETE_ASSEMBLY');
  assert.equal(plan(components,['a','b','c']).code,'MULTIPLE_ASSEMBLIES');
  assert.equal(plan([components[0],part('loose',null,300,100)],['a','loose']).code,'MIXED_SELECTION');
  assert.equal(plan(components,[]).code,'NO_SELECTION');
  assert.equal(plan(components,['ghost']).code,'INVALID_SELECTION');
  assert.equal(plan(components,['a','a']).code,'INVALID_SELECTION');
});

test('A1 ungrouped manual furniture may be explicitly selected without affecting other parts',()=>{
  const scene=[part('one',null,200,200),part('two',null,300,200),part('not-selected',null,5000,4300)];
  const result=plan(scene,['one','two']);
  assert.equal(result.ok,true);
  assert.deepEqual(Object.keys(result.updatesById),['one','two']);
});

test('A1 rotated 90-degree side panel uses its physical X/Z footprint',()=>{
  const rotated=part('panel','P',500,500,800,100,{rotationY:90});
  const frame=getBlueprintFootprint([rotated]);
  assert.equal(frame.ok,true);
  near(frame.width,100);near(frame.depth,800);
  const result=plan([rotated],['panel']);
  assert.equal(result.ok,true);
  const moved={...rotated,...result.updatesById.panel};
  const centered=getBlueprintFootprint([moved]);
  near(centered.centerX,3200);near(centered.centerZ,2600);
});

test('A1 rejects oversized furniture and source components with corrupt geometry',()=>{
  assert.equal(plan([part('big','A',0,0,6500,400)],['big']).code,'FURNITURE_TOO_LARGE');
  assert.equal(plan([part('bad','A',100,100,-10,20)],['bad']).code,'INVALID_PART_GEOMETRY');
  assert.equal(plan([part('bad','A',100,100,10,20,{rotationY:Infinity})],['bad']).code,'INVALID_PART_GEOMETRY');
  assert.equal(plan([part('locked','A',200,200,10,20,{locked:true})],['locked']).code,'LOCKED_SELECTION');
});

test('A1 correctly accepts floor edge contact and rejects parts extending across either edge',()=>{
  const atEdge=part('a','A',6300,5100,100,100);
  assert.equal(checkBlueprintFloorPlacement({parts:[atEdge],worldWidth:W,worldDepth:D}).ok,true);
  assert.equal(checkBlueprintFloorPlacement({parts:[{...atEdge,x:6301}],worldWidth:W,worldDepth:D}).code,'OUTSIDE_FLOOR');
  assert.equal(checkBlueprintFloorPlacement({parts:[{...atEdge,z:-1}],worldWidth:W,worldDepth:D}).code,'OUTSIDE_FLOOR');
});

test('A1 already centered is a no-op; fractional x/z offsets stay uniform',()=>{
  const centered=part('c','A',3150,2550,100,100);
  const noChange=plan([centered],['c']);
  assert.equal(noChange.ok,true);assert.equal(noChange.unchanged,true);
  assert.deepEqual(noChange.updatesById,{});
  const p1=part('p1',null,100.25,100.75,100.3,100.2);
  const p2=part('p2',null,210.75,100.75,100.3,100.2);
  const result=plan([p1,p2],['p1','p2']);
  assert.equal(result.ok,true);
  near(result.updatesById.p1.x-p1.x,result.updatesById.p2.x-p2.x);
  near(result.updatesById.p1.z-p1.z,result.updatesById.p2.z-p2.z);
});

test('A1 cannot center onto a separate furniture even with different 3D heights',()=>{
  const a=part('a','A',200,200);
  const obstacle=part('b','B',3150,2550,100,100,{y:500});
  assert.equal(plan([a,obstacle],['a']).code,'CENTER_OCCUPIED');
});


test('A1 grouping falls back to groupId when legacy assemblyId is blank',()=>{
  const scene=[part('a','A',100,100,100,100,{assemblyId:''}),
    part('b','A',210,100,100,100,{assemblyId:''})];
  assert.equal(plan(scene,['a']).code,'INCOMPLETE_ASSEMBLY');
  assert.equal(plan(scene,['a','b']).ok,true);
});

test('A1 ignores reference proxies and hidden deleted visual objects as obstacles',()=>{
  const scene=[part('a','A',100,100),
    {...part('helper','B',3150,2550),type:'reference_proxy'},
    {...part('hidden','C',3150,2550),visible:false}];
  assert.equal(plan(scene,['a']).ok,true);
});
