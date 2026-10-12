import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {getCustomerValidatedPanelCarcassSupport as support,planCustomerValidatedPanelCarcassResize as plan} from '../src/utils/customerValidatedPanelCarcassResize.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const read=id=>JSON.parse(fs.readFileSync(path.join(here,`validatedPanelCarcassFixture_${id}.json`),'utf8')).parts;
const clone=v=>structuredClone(v);
const n=(p,k)=>Number(p[k]);
const by=(p,code)=>p.find(x=>x.partCode===code);
const floor=p=>Math.max(...p.filter(x=>['left_side_panel','right_side_panel'].includes(x.partRole)).map(x=>n(x,'y')+n(x,'height')));
const withoutGeometry = p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['x','y','z','width','height','depth','customerCarcassResizeBaseline'].includes(k)));
const assertNoMetadataChange=(original,changed)=>original.forEach((part,i)=>assert.deepEqual(withoutGeometry(changed[i]),withoutGeometry(part)));
for(const id of [289,290]){
  test(`G1: ${id} recognizes saved carcass without relying on Blueprint ID`,()=>{
    const original=read(id);const result=support(original);
    assert.equal(result.ok,true,result.error);
    assert.equal(result.validatedPanelCarcass,true);
    if(id===289)assert.deepEqual([result.width,result.height,result.depth],[900,876,610]);
    if(id===290)assert.deepEqual([result.width,result.height,result.depth],[1200,2100,600]);
  });
  for(const axis of ['width','height','depth']){
    test(`G1: ${id} ${axis} preserves roles, fixed thickness, floor and other dimensions`,()=>{
      const original=read(id),pre=support(original),requested=pre[axis]+50;
      const result=plan(original,axis,requested);
      assert.equal(result.ok,true,result.error);
      assert.equal(support(result.parts).ok,true);
      assert.equal(support(result.parts)[axis],requested);
      for(const other of ['width','height','depth'].filter(a=>a!==axis))assert.equal(support(result.parts)[other],pre[other]);
      assert.equal(floor(original),floor(result.parts));
      assert.deepEqual(original,read(id));
      assertNoMetadataChange(original,result.parts);
      const leftOriginal=original.find(p=>p.partRole==='left_side_panel');
      const leftAfter=result.parts.find(p=>p.id===leftOriginal.id);
      assert.equal(leftAfter.width,leftOriginal.width);
      assert.equal(leftAfter.customerCarcassResizeBaseline.width,pre.width);
      assert.equal(leftAfter.customerCarcassResizeBaseline.height,pre.height);
      assert.equal(leftAfter.customerCarcassResizeBaseline.depth,pre.depth);
      if(axis==='height'){
        const base=original.find(p=>['plinth','toe_kick'].includes(p.partRole));
        assert.equal(by(result.parts,base.partCode).y,base.y);
      }
      if(axis==='depth'){
        const back=original.find(p=>p.partRole==='back_panel');
        assert.equal(by(result.parts,back.partCode).depth,back.depth);
      }
      if(axis==='width'){
        const sideR=original.find(p=>p.partRole==='right_side_panel');
        assert.equal(by(result.parts,sideR.partCode).x,sideR.x+50);
      }
    });
  }
  test(`G1: ${id} repeated resizing respects ORIGINAL size limits`,()=>{
    const orig=read(id),a=support(orig);
    const width1=plan(orig,'width',a.width+40);
    assert.equal(width1.ok,true,width1.error);
    const width2=plan(width1.parts,'width',a.maxWidth);
    assert.equal(width2.ok,true,width2.error);
    const beyond=plan(width2.parts,'width',a.maxWidth+1);
    assert.equal(beyond.ok,false);
    const back=plan(width2.parts,'width',a.width);
    assert.equal(back.ok,true,back.error);
    assert.equal(support(back.parts).width,a.width);
  });
}
test('G1: five-part manual table remains owned by its existing separate planner',()=>assert.equal(support(read(288)).ok,false));
test('G1: ungrouped, role-less, manually assembled four-panel box is detected by physical contacts',()=>{
  const p=read(289).filter(x=>['CB-SIDE-L','CB-SIDE-R','CB-TOP','CB-BOT'].includes(x.partCode)).map(x=>({...x,type:'furniture_board_panel',partRole:'board_panel',assemblyId:null,groupId:null}));
  const side=p[0];const bottom=p.find(x=>x.partCode==='CB-BOT');
  bottom.y=side.y+side.height-bottom.height;
  const s=support(p);assert.equal(s.ok,true,s.error);
  const r=plan(p,'width',s.width+40);
  assert.equal(r.ok,true,r.error);
  assert.equal(support(r.parts).width,s.width+40);
});
test('G1: invalid or unknown manual shapes do not silently unlock',()=>{
  const original=read(289);
  const reject=[
    p=>{p[0].rotationY=90},
    p=>{p[0].locked=true},
    p=>{p[0].width=55},
    p=>{p[1].z+=10},
    p=>{p[3].x+=5},
    p=>{p.find(x=>x.partRole==='shelf').x+=12},
    p=>{p.push({...p[0],id:'third-side',groupId:'other-group',assemblyId:'other-group'})},
    p=>{p.push({...p[0],id:'door-part',type:'door_front_panel',partRole:'door',partFunction:'door'})},
    p=>{p[0].qty=0},
    p=>{p[0].material=''},
  ];
  for (let i=0;i<reject.length;i++){
    const arr=clone(original);reject[i](arr);
    assert.equal(support(arr).ok,false,`invalid case ${i}`);
    assert.equal(plan(arr,'width',950).ok,false,`no resize in invalid case ${i}`);
  }
});
test('G1: rejects too-large/invalid targets and preserves input',()=>{
  const p=read(290),orig=clone(p),s=support(p);
  for(const bad of [s.minWidth-1,s.maxWidth+1,NaN,Infinity,1300.45,'']){
    assert.equal(plan(p,'width',bad).ok,false,String(bad));
  }
  assert.deepEqual(p,orig);
});
test('G1: no-op produces a distinct copy, not an in-place mutation',()=>{
  const p=read(289),s=support(p),result=plan(p,'width',s.width);
  assert.equal(result.ok,true);assert.equal(result.unchanged,true);
  assert.notEqual(result.parts,p);assert.notEqual(result.parts[0],p[0]);
});
test('G1: source integration keeps old 10-part and dining-table paths and no generic mesh scaling',()=>{
  const root=path.resolve(here,'..');const code=fs.readFileSync(path.join(root,'src/pages/customer/customer3dviewer.jsx'),'utf8');
  for(const term of ['getCustomerCabinetResizeSupport(components)','getCustomerValidatedPanelCarcassSupport(components)',
    'cabinetSupport.validatedPanelCarcass','planCustomerValidatedPanelCarcassResize(components, axis, mm)',
    'getCustomerDiningTableResizeSupport(components)','const CUSTOMER_PART_GEOMETRY_EDITING_ENABLED = false;']){
    assert.equal(code.includes(term),true,term);
  }
});
