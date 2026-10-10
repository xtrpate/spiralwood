'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const target=path.resolve(__dirname,'../../frontend/src/utils/customerBookshelfResize.js');
const code=fs.readFileSync(target,'utf8');
const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'blueprintCustomerBookshelfB2Fixture.json'),'utf8'));
const input=fixtures.parts.map((p,i)=>({
  ...p,partCode:p.code,id:`fixture-${i}`,material:'Plywood + Laminate',finish_color:'#8B5E3C',woodFinish:'provincial'
}));
let api;
const load=async()=>api||=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const copy=x=>JSON.parse(JSON.stringify(x));
const dims=parts=>{
 const left=parts.find(p=>p.code==='WR-SL'),right=parts.find(p=>p.code==='WR-SR');
 return {width:right.x+right.width-left.x,height:left.height,depth:left.depth};
};
const assertProtected=(parts,original)=>{
 assert.equal(parts.length,10);
 parts.forEach((p,i)=>{
   assert.equal(p.code,original[i].code);
   assert.equal(p.id,original[i].id);
   assert.equal(p.finish_color,original[i].finish_color);
   assert.equal(p.woodFinish,original[i].woodFinish);
   assert.equal(p.material,original[i].material);
   if(p.code==='WR-SL'||p.code==='WR-SR')assert.equal(p.width,18);
   if(p.code==='WR-TOP'||p.code==='WR-BOT'||p.code.startsWith('WR-SH'))assert.equal(p.height,18);
   if(p.code==='WR-BKL'||p.code==='WR-BKS')assert.equal(p.depth,18);
 });
};
test('fixture: exact 10 bookshelf parts, 2 distinct WR-SH1 shelves',async()=>{
 const {getCustomerBookshelfResizeSupport:get}=await load();
 assert.equal(get(input).ok,true);
 assert.equal(input.filter(p=>p.code==='WR-SH1').length,2);
 assert.deepEqual(dims(input),{width:1800,height:1500,depth:600});
});
test('width 1800 -> 2000 -> 1800; no lost shelves/thickness',async()=>{
 const {planCustomerBookshelfResize:plan,getCustomerBookshelfResizeSupport:get}=await load();
 const next=plan(input,'width',2000);assert.equal(next.ok,true,next.error);
 assert.deepEqual(dims(next.parts),{width:2000,height:1500,depth:600});
 assertProtected(next.parts,input);assert.equal(get(next.parts).ok,true);
 assert.equal(next.parts.find(p=>p.code==='WR-BKS').x,2610);
 const back=plan(next.parts,'width',1800);assert.equal(back.ok,true,back.error);
 assert.deepEqual(dims(back.parts),dims(input));assertProtected(back.parts,input);
});
test('height 1500 -> 1700 -> 1500; shelves distribute and preserve identity',async()=>{
 const {planCustomerBookshelfResize:plan,getCustomerBookshelfResizeSupport:get}=await load();
 const next=plan(input,'height',1700);assert.equal(next.ok,true,next.error);
 assert.deepEqual(dims(next.parts),{width:1800,height:1700,depth:600});
 assert.equal(get(next.parts).ok,true);assertProtected(next.parts,input);
 assert.deepEqual(next.parts.filter(p=>p.type==='wr_shelf').map(p=>p.y).sort((a,b)=>a-b),
   [1988,2329,2670,3011]);
 const back=plan(next.parts,'height',1500);assert.equal(back.ok,true,back.error);
 assert.deepEqual(dims(back.parts),dims(input));assertProtected(back.parts,input);
});
test('depth 600 -> 650 and 550; 18mm backing protected',async()=>{
 const {planCustomerBookshelfResize:plan,getCustomerBookshelfResizeSupport:get}=await load();
 const plus=plan(input,'depth',650);assert.equal(plus.ok,true,plus.error);
 assert.deepEqual(dims(plus.parts),{width:1800,height:1500,depth:650});
 assert.equal(plus.parts.find(p=>p.code==='WR-BKL').depth,18);assertProtected(plus.parts,input);
 const minus=plan(plus.parts,'depth',550);assert.equal(minus.ok,true,minus.error);assertProtected(minus.parts,input);
});
test('combined resizing, invalid target, damaged layout, extra/missing part rejected',async()=>{
 const {planCustomerBookshelfResize:plan,getCustomerBookshelfResizeSupport:get}=await load();
 const w=plan(input,'width',1900); const h=plan(w.parts,'height',1650); const d=plan(h.parts,'depth',625);
 assert.equal(w.ok&&h.ok&&d.ok,true,[w.error,h.error,d.error].join(' '));
 assert.deepEqual(dims(d.parts),{width:1900,height:1650,depth:625});
 assertProtected(d.parts,input);
 for(const [axis,value] of [['width',2100],['height',900],['depth',100],['width',2.5],['density',500]])assert.equal(plan(input,axis,value).ok,false);
 assert.equal(get(input.slice(1)).ok,false);
 const extra=copy(input);extra.push({...input[0],id:'rogue'}); assert.equal(get(extra).ok,false);
 const changed=copy(input);changed[0].width=22;assert.equal(get(changed).ok,false);
 const moved=copy(input);moved[9].y=1678; assert.equal(get(moved).ok,false);
 const rotated=copy(input);rotated[7].rotationX=90;assert.equal(get(rotated).ok,false);
 const door=copy(input);door[7].code='WR-DL';door[7].partCode='WR-DL';assert.equal(get(door).ok,false);
});
