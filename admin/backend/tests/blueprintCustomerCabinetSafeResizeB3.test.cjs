// CUST-B3 regression. Run with: node --test admin/backend/tests/blueprintCustomerCabinetSafeResizeB3.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '../../..');
const helperFile = path.join(repo, 'admin/frontend/src/utils/customerCabinetSafeResize.js');
const viewerFile = path.join(repo, 'admin/frontend/src/pages/customer/customer3dviewer.jsx');
const helperText = fs.readFileSync(helperFile, 'utf8');
const { getCustomerCabinetResizeSupport, planCustomerCabinetResize } =
  // Load pure ESM without requiring package.json module mode or Babel.
  // Top-level data: URL imports do not access the DOM or external resources.
  // Node supports this in the existing backend test runner.
  awaitImportSync();

function awaitImportSync() {
  // CJS test runner uses async test initialization below; no sync ESM loading.
  // Return wrappers to lazily invoke the pure helper after one import promise.
  const loaded = import('data:text/javascript,' + encodeURIComponent(helperText));
  return {
    getCustomerCabinetResizeSupport: async (...args) => (await loaded).getCustomerCabinetResizeSupport(...args),
    planCustomerCabinetResize: async (...args) => (await loaded).planCustomerCabinetResize(...args),
  };
}

const sample = () => {
  const groupId = 'g_production_cabinet';
  const row = (code, type, x, y, z, width, height, depth, extra = {}) => ({
    id: 'id_' + code, groupId, assemblyId: groupId,
    assemblyType: 'base_cabinet', partCode: code, type,
    x, y, z, width, height, depth,
    rotationX: 0, rotationY: 0, rotationZ: 0, locked: false,
    material: 'Marine Plywood', wood_type: 'Marine Plywood',
    finish: 'oak-natural', finish_id: 'oak-natural', woodFinish: 'oak-natural',
    finish_color: '#D8B68A', grainDirection: 'width',
    partFunction: 'auto', doorHinge: 'auto', ...extra,
  });
  return [
    row('CB-SIDE-L', 'wr_side_panel', 200, 2284, 160, 18, 876, 620),
    row('CB-SIDE-R', 'wr_side_panel', 1082, 2284, 160, 18, 876, 620),
    row('CB-TOP', 'wr_top_panel', 218, 2284, 160, 864, 18, 620),
    row('CB-BOT', 'wr_bottom_panel', 218, 3042, 160, 864, 18, 620),
    row('CB-BACK', 'wr_back_panel', 218, 2302, 160, 864, 740, 6,
      { material: 'Panel Board', wood_type: 'Panel Board' }),
    row('CB-TOE-KICK', 'cabinet_toe_kick', 218, 3060, 712, 864, 100, 18),
    row('CB-SH-01', 'wr_shelf', 220, 2560, 180, 860, 20, 578,
      { partRole: 'shelf' }),
    row('CB-SH-02', 'wr_shelf', 220, 2860, 180, 860, 20, 578,
      { partRole: 'shelf' }),
    row('CAB-DOOR-L', 'door_front_panel', 228, 2312, 760, 417, 720, 20,
      { partFunction: 'door', doorHinge: 'left', partRole: 'door' }),
    row('CAB-DOOR-R', 'door_front_panel', 655, 2312, 760, 417, 720, 20,
      { partFunction: 'door', doorHinge: 'right', partRole: 'door' }),
  ];
};
const byCode = (parts, code) => parts.find(p => p.partCode === code);
const support = async parts => getCustomerCabinetResizeSupport(parts);
const plan = async (parts, axis, mm) => planCustomerCabinetResize(parts, axis, mm);

const auditClearance = (parts) => {
  const leftDoor = byCode(parts, 'CAB-DOOR-L');
  const rightDoor = byCode(parts, 'CAB-DOOR-R');
  const shelf1 = byCode(parts, 'CB-SH-01');
  const shelf2 = byCode(parts, 'CB-SH-02');
  const shell = byCode(parts, 'CB-SIDE-L');
  const frameRight = byCode(parts, 'CB-SIDE-R');
  assert.equal(shelf1.z + shelf1.depth + 2, leftDoor.z);
  assert.equal(shelf2.z + shelf2.depth + 2, rightDoor.z);
  assert.equal(leftDoor.x - (shell.x + shell.width), 10);
  assert.equal(frameRight.x - (rightDoor.x + rightDoor.width), 10);
  assert.equal(rightDoor.x - (leftDoor.x + leftDoor.width), 10);
  assert.equal(leftDoor.doorHinge, 'left');
  assert.equal(rightDoor.doorHinge, 'right');
  assert.equal(parts.length, 10);
};

test('original Admin #278 geometry passes strict geometry gate', async () => {
  const s = await support(sample());
  assert.deepEqual([s.ok, s.width, s.height, s.depth], [true, 900, 876, 620]);
  auditClearance(sample());
});

test('width: 900 to 950, doors move/recompute, other dimensions stay, metadata retained', async () => {
  const before = sample();
  const snapshot = JSON.stringify(before);
  const res = await plan(before, 'width', 950);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.width, 950);
  assert.equal(byCode(res.parts, 'CAB-DOOR-L').width, 442);
  assert.equal(byCode(res.parts, 'CAB-DOOR-R').x, 680);
  auditClearance(res.parts);
  assert.equal((await support(res.parts)).ok, true);
  assert.equal(JSON.stringify(before), snapshot, 'source parts changed');
  for (let i = 0; i < before.length; i++) {
    for (const key of ['id','partCode','material','woodFinish','finish_color','partRole']) {
      assert.equal(res.parts[i][key],before[i][key],`Metadata changed for ${key}`);
    }
  }
});

test('height: 876 to 906, shelves flow, doors fit, toe/back follow frame', async () => {
  const res = await plan(sample(), 'height', 906);
  assert.equal(res.ok, true, res.error);
  assert.equal(byCode(res.parts, 'CAB-DOOR-L').height, 750);
  assert.equal(byCode(res.parts, 'CB-BACK').height, 770);
  assert.equal(byCode(res.parts, 'CB-TOE-KICK').y, 3090);
  assert.ok(byCode(res.parts, 'CB-SH-01').y > 2560);
  assert.ok(byCode(res.parts, 'CB-SH-02').y > 2860);
  auditClearance(res.parts);
});

test('depth: 620 to 640, 2mm closed-door/shelf gap stays', async () => {
  const res = await plan(sample(), 'depth', 640);
  assert.equal(res.ok, true, res.error);
  assert.equal(byCode(res.parts, 'CAB-DOOR-L').z, 780);
  assert.equal(byCode(res.parts, 'CB-SH-01').depth, 598);
  assert.equal(byCode(res.parts, 'CB-TOE-KICK').z, 732);
  auditClearance(res.parts);
});

test('all verified minimums and maximums remain safely supported', async () => {
  const limits = {width:[800,1000],height:[820,930],depth:[550,650]};
  for (const [axis,[min,max]] of Object.entries(limits)) {
    for (const wanted of [min,max]) {
      const res = await plan(sample(),axis,wanted);
      assert.equal(res.ok,true,`${axis} ${wanted}: ${res.error}`);
      assert.equal((await support(res.parts)).ok,true);
      auditClearance(res.parts);
    }
  }
});

test('sequential width, height and depth edits preserve construction and allow return', async () => {
  let parts=sample();
  for(const [axis,mm] of [['width',950],['height',906],['depth',640],
                           ['depth',620],['height',876],['width',900]]) {
    const next=await plan(parts,axis,mm);
    assert.equal(next.ok,true,`${axis}:${mm}: ${next.error}`);
    parts=next.parts;
    auditClearance(parts);
  }
  const s=await support(parts);
  assert.deepEqual([s.width,s.height,s.depth],[900,876,620]);
});

test('reject wrong cabinet topology, door collisions, missing IDs and exotic layouts', async () => {
  const broken = [
    p => p.slice(0,9),
    p => [...p,{...p[0],id:'extra',partCode:'UNVERIFIED'}],
    p => { byCode(p,'CB-SH-01').depth+=5;return p; },
    p => { byCode(p,'CAB-DOOR-R').doorHinge='left';return p; },
    p => { byCode(p,'CAB-DOOR-R').x-=10;return p; },
    p => { byCode(p,'CB-SIDE-L').rotationY=3;return p; },
    p => { byCode(p,'CB-SH-02').y=2580;return p; },
    p => { byCode(p,'CB-SIDE-L').groupId='other';return p; },
    p => { byCode(p,'CB-SIDE-L').assemblyType='wall_cabinet';return p; },
    p => { byCode(p,'CAB-DOOR-L').id=byCode(p,'CAB-DOOR-R').id;return p; },
  ];
  for(let i=0;i<broken.length;i++){
    const altered=broken[i](sample());
    assert.equal((await support(altered)).ok,false,`Rejected layout ${i} incorrectly accepted`);
    assert.equal((await plan(altered,'width',950)).ok,false);
  }
});

test('reject arbitrary 0/negative/oversized/fractional target sizes and unsupported axes', async () => {
  for(const [axis,mm] of [['width',0],['width',799],['width',1001],['height',819],
                           ['height',931],['depth',549],['depth',651],['depth',600.5],
                           ['width',NaN],['height',Infinity],['random',900]]){
    assert.equal((await plan(sample(),axis,mm)).ok,false,`${axis}:${mm} wrongly allowed`);
  }
});

test('strict gate does not accidentally support Bookshelf, Wardrobe or generic objects', async () => {
  assert.equal((await support([{partCode:'CB-SIDE-L'}])).ok,false);
  const parts=sample();
  byCode(parts,'CB-SIDE-L').partCode='WR-SL';
  assert.equal((await support(parts)).ok,false);
});

test('Customer 3D UI is connected only to the safe helper and retains existing B2 behavior', () => {
  const ui=fs.readFileSync(viewerFile,'utf8');
  assert.ok(ui.includes('getCustomerCabinetResizeSupport(components)'));
  assert.ok(ui.includes('planCustomerCabinetResize(components, axis, mm)'));
  assert.ok(ui.includes('canResizeCabinet("width")'));
  assert.ok(ui.includes('canResizeCabinet("height")'));
  assert.ok(ui.includes('canResizeCabinet("depth")'));
  assert.ok(ui.includes('applySmartCabinet(axis)'));
  assert.ok(ui.includes('commitComponents(next.parts)'));
  assert.ok(ui.includes('getCustomerBookshelfResizeSupport(components)'));
  assert.ok(!ui.includes('Apply Inset Fit'), 'Customer-side fabrication change was restored');
});
