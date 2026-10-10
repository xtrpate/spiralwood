const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const adapterPath = path.join(root,'admin/frontend/src/pages/customer/customerBlueprintAdapter.js');
const helperPath = path.join(root,'admin/frontend/src/utils/customerCabinetSafeResize.js');
const workbenchPath = path.join(root,'admin/frontend/src/pages/customer/CustomerTemplateWorkbench.jsx');

// Actual 10-part Mini Cabinet #278, reduced to structural and motion fields only.
// This fixture never changes database or app state.
const originalParts = JSON.parse(String.raw`[{"id":"c_1791626976317_kbbjbz","assemblyId":"g_1791626976317_ghz6dw","assemblyType":"base_cabinet","groupId":"g_1791626976317_ghz6dw","partRole":"left_side_panel","partCode":"CB-SIDE-L","type":"wr_side_panel","x":200,"y":2284,"z":160,"width":18,"height":876,"depth":620,"rotationX":0,"rotationY":0,"rotationZ":0,"locked":false,"doorHinge":"auto","partFunction":"auto","material":"Marine Plywood","finish":"oak-natural"},{"id":"c_1791626976317_xr4v5m","assemblyId":"g_1791626976317_ghz6dw","assemblyType":"base_cabinet","groupId":"g_1791626976317_ghz6dw","partRole":"right_side_panel","partCode":"CB-SIDE-R","type":"wr_side_panel","x":1082,"y":2284,"z":160,"width":18,"height":876,"depth":620,"rotationX":0,"rotationY":0,"rotationZ":0,"locked":false,"doorHinge":"auto","partFunction":"auto","material":"Marine Plywood","finish":"oak-natural"},{"id":"c_1791626976317_if5gip","assemblyId":"g_1791626976317_ghz6dw","assemblyType":"base_cabinet","groupId":"g_1791626976317_ghz6dw","partRole":"top_panel","partCode":"CB-TOP","type":"wr_top_panel","x":218,"y":2284,"z":160,"width":864,"height":18,"depth":620,"rotationX":0,"rotationY":0,"rotationZ":0,"locked":false,"doorHinge":"auto","partFunction":"auto","material":"Marine Plywood","finish":"oak-natural"},{"id":"c_1791626976317_i1xwg4","assemblyId":"g_1791626976317_ghz6dw","assemblyType":"base_cabinet","groupId":"g_1791626976317_ghz6dw","partRole":"bottom_panel","partCode":"CB-BOT","type":"wr_bottom_panel","x":218,"y":3042,"z":160,"width":864,"height":18,"depth":620,"rotationX":0,"rotationY":0,"rotationZ":0,"locked":false,"doorHinge":"auto","partFunction":"auto","material":"Marine Plywood","finish":"oak-natural"},{"id":"c_1791626976317_xs1042","assemblyId":"g_1791626976317_ghz6dw","assemblyType":"base_cabinet","groupId":"g_1791626976317_ghz6dw","partRole":"back_panel","partCode":"CB-BACK","type":"wr_back_panel","x":218,"y":2302,"z":160,"width":864,"height":740,"depth":6,"rotationX":0,"rotationY":0,"rotationZ":0,"locked":false,"doorHinge":"auto","partFunction":"auto","material":"Panel Board","finish":"oak-natural"},{"id":"c_1791626976317_pfsfky","assemblyId":"g_1791626976317_ghz6dw","assemblyType":"base_cabinet","groupId":"g_1791626976317_ghz6dw","partRole":"toe_kick","partCode":"CB-TOE-KICK","type":"cabinet_toe_kick","x":218,"y":3060,"z":712,"width":864,"height":100,"depth":18,"rotationX":0,"rotationY":0,"rotationZ":0,"locked":false,"doorHinge":"auto","partFunction":"auto","material":"Marine Plywood","finish":"oak-natural"},{"id":"a5b124f6-6622-47b8-ab18-d96aec95316f","assemblyId":"g_1791626976317_ghz6dw","assemblyType":"base_cabinet","groupId":"g_1791626976317_ghz6dw","partRole":"shelf","partCode":"CB-SH-01","type":"wr_shelf","x":220,"y":2560,"z":180,"width":860,"height":20,"depth":578,"rotationX":0,"rotationY":0,"rotationZ":0,"locked":false,"doorHinge":"auto","partFunction":"auto","material":"Marine Plywood","finish":"oak-natural"},{"id":"2a0adf0d-3e81-499e-a7b4-6dc05c490c67","assemblyId":"g_1791626976317_ghz6dw","assemblyType":"base_cabinet","groupId":"g_1791626976317_ghz6dw","partRole":"shelf","partCode":"CB-SH-02","type":"wr_shelf","x":220,"y":2860,"z":180,"width":860,"height":20,"depth":578,"rotationX":0,"rotationY":0,"rotationZ":0,"locked":false,"doorHinge":"auto","partFunction":"auto","material":"Marine Plywood","finish":"oak-natural"},{"id":"bbe47e0e-9081-4970-bb10-cd42b7e31ed5","assemblyId":"g_1791626976317_ghz6dw","assemblyType":"base_cabinet","groupId":"g_1791626976317_ghz6dw","partRole":"door","partCode":"CAB-DOOR-L","type":"door_front_panel","x":228,"y":2312,"z":760,"width":417,"height":720,"depth":20,"rotationX":0,"rotationY":0,"rotationZ":0,"locked":false,"doorHinge":"left","partFunction":"door","material":"Marine Plywood","finish":"oak-natural"},{"id":"4ce088ed-9929-464f-a871-8a1651720e71","assemblyId":"g_1791626976317_ghz6dw","assemblyType":"base_cabinet","groupId":"g_1791626976317_ghz6dw","partRole":"door","partCode":"CAB-DOOR-R","type":"door_front_panel","x":655,"y":2312,"z":760,"width":417,"height":720,"depth":20,"rotationX":0,"rotationY":0,"rotationZ":0,"locked":false,"doorHinge":"right","partFunction":"door","material":"Marine Plywood","finish":"oak-natural"}]`);
const read = p => fs.readFileSync(p,'utf8');
const helperPromise=import('data:text/javascript,'+encodeURIComponent(read(helperPath)));
const originalImport = 'import { getRotatedComponentBounds3D } from "../blueprints/data/rotationBounds";';
const boundsStub = `const getRotatedComponentBounds3D = p => ({
  minX:p.x,maxX:p.x+p.width,minY:p.y,maxY:p.y+p.height,
  minZ:p.z,maxZ:p.z+p.depth });`;
const adapterText=read(adapterPath);
assert.equal(adapterText.split(originalImport).length,2,'Cannot safely import current adapter for regression');
const adapterPromise=import('data:text/javascript,'+encodeURIComponent(adapterText.replace(originalImport,boundsStub)));

async function extracted(parts, use3d=false) {
  const {extractCustomerBlueprintScene}=await adapterPromise;
  return extractCustomerBlueprintScene({
    id:278,title:'Mini Cabinet',
    design_data:use3d?'{}':JSON.stringify({unit:'mm',components:parts}),
    view_3d_data:use3d?JSON.stringify({components:parts}):'{}',
  });
}
test('actual Mini Cabinet #278 remains 10-part after Customer blueprint extraction',async()=>{
  const scene=await extracted(originalParts);
  assert.equal(scene.components.length,10);
  for(let i=0;i<10;i++) {
    const src=originalParts[i],dst=scene.components[i];
    for(const key of ['id','partCode','type','assemblyId','assemblyType','groupId','partRole',
      'x','y','z','width','height','depth','partFunction','doorHinge','locked']) {
      assert.deepEqual(dst[key],src[key],`Lost ${key} for ${src.partCode}`);
    }
  }
  const {getCustomerCabinetResizeSupport,planCustomerCabinetResize}=await helperPromise;
  const state=getCustomerCabinetResizeSupport(scene.components);
  assert.equal(state.ok,true,state.error);
  for(const [axis,target] of [['width',950],['height',906],['depth',640]]){
    const res=planCustomerCabinetResize(scene.components,axis,target);
    assert.equal(res.ok,true,`${axis}: ${res.error}`);
    assert.equal(getCustomerCabinetResizeSupport(res.parts).ok,true);
  }
});
test('view_3d_data fallback keeps cabinet metadata after Customer extraction',async()=>{
  const scene=await extracted(originalParts,true);
  assert.equal((await helperPromise).getCustomerCabinetResizeSupport(scene.components).ok,true);
});
test('missing assembly identity never enables unknown furniture resizing',async()=>{
  const corrupted=originalParts.map(p=>({...p}));
  delete corrupted[0].assemblyId;
  delete corrupted[0].groupId;
  const scene=await extracted(corrupted);
  assert.equal((await helperPromise).getCustomerCabinetResizeSupport(scene.components).ok,false);
});
test('no modifications needed in workbench normalization or customer resize planner',()=>{
  const wb=read(workbenchPath);
  assert.match(wb,/normalizeComponent\(\{\s*\.\.\.item,/);
  assert.match(read(helperPath),/Only the verified 10-part Base Cabinet supports safe resizing/);
});
