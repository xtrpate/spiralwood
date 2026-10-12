import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reviewFurnitureGeometryA3 } from '../src/pages/blueprints/data/constructionGeometryA3.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = path.join(repo, 'admin/frontend/src/pages/blueprints/data');
const smart = fs.readFileSync(path.join(dataDir,'smartAssemblyResize.js'),'utf8');
const smartForNode = smart
  .replace('from "./utils"',`from "${pathToFileURL(path.join(dataDir,'utils.js')).href}"`)
  .replace('from "./constructionGeometryA3.mjs"',`from "${pathToFileURL(path.join(dataDir,'constructionGeometryA3.mjs')).href}"`);
assert.notEqual(smartForNode,smart);
const { buildSmartAssemblyResizePlan } = await import('data:text/javascript;base64,'+Buffer.from(smartForNode).toString('base64'));

// Reuse the verified A4-2 physical test fixtures rather than inventing a
// differently-shaped table or wardrobe for the new template loading path.
const a42 = fs.readFileSync(path.join(repo,'admin/frontend/tests/smartResizeConstructionA4_2.test.mjs'),'utf8');
const fixtureCode = a42.slice(a42.indexOf('const part = ('),a42.indexOf('const deep = ('));
assert.ok(fixtureCode.includes('function wardrobe()'));
const {dining,coffee,wardrobe} = new Function(fixtureCode+'\nreturn {dining,coffee,wardrobe};')();

const fileName=path.join(dataDir,'templateComponents.js');
const original=fs.readFileSync(fileName,'utf8');
const helperStart=original.indexOf('const CONSTRUCTION_RESIZE_TEMPLATES = new Set(');
const functionEnd=original.indexOf('function createFurnitureTemplateComponents(', helperStart);
assert.ok(helperStart>=0 && functionEnd>helperStart,'A4-3 construction template path was not installed');
const implementation=original.slice(helperStart,functionEnd);
const componentBounds=parts=>({
  minX:Math.min(...parts.map(p=>p.x)), maxX:Math.max(...parts.map(p=>p.x+p.width)),
  minY:Math.min(...parts.map(p=>p.y)), maxY:Math.max(...parts.map(p=>p.y+p.height)),
  minZ:Math.min(...parts.map(p=>p.z)), maxZ:Math.max(...parts.map(p=>p.z+p.depth)),
  width:Math.max(...parts.map(p=>p.x+p.width))-Math.min(...parts.map(p=>p.x)),
  height:Math.max(...parts.map(p=>p.y+p.height))-Math.min(...parts.map(p=>p.y)),
  depth:Math.max(...parts.map(p=>p.z+p.depth))-Math.min(...parts.map(p=>p.z)),
});
let idCounter=0;
const {scaleAssemblyComponentsToTarget} = new Function(
 'buildSmartAssemblyResizePlan','reviewFurnitureGeometryA3','getComponentsBounds3D','normalizeComponent','makeId','FLOOR_OFFSET',
 implementation+'\nreturn {scaleAssemblyComponentsToTarget};'
)(buildSmartAssemblyResizePlan,reviewFurnitureGeometryA3,componentBounds,(p)=>({...p}),()=>`new-${++idCounter}`,40);
const clone =x=>JSON.parse(JSON.stringify(x));
const near = (a,b)=>Math.abs(a-b)<=0.5;
const byCode=(parts,code)=>parts.find(p=>p.partCode===code);

// Assert the actual loader calls the revised scale entrypoint; no Customer
// resize flags, Save, Publish or price code is added in this change.
test('A4-3 actual template loader routes through revised entrypoint',()=>{
  assert.match(original,/return scaleAssemblyComponentsToTarget\(\s*baseParts,/);
  assert.match(original,/import \{ buildSmartAssemblyResizePlan \}/);
  assert.match(original,/reviewFurnitureGeometryA3\(\{ components: resized \}\)/);
  assert.match(original,/template_dining_table/);
  assert.match(original,/template_coffee_table/);
  assert.match(original,/template_wardrobe/);
  assert.doesNotMatch(implementation,/customerEditable:\s*\{\s*width:\s*true/);
});

const families=[
 ['dining', 'template_dining_table', dining, {w:2000,h:860,d:1000}, ['DT-FL','DT-FR','DT-BL','DT-BR']],
 ['coffee', 'template_coffee_table', coffee, {w:1200,h:520,d:700}, ['CT-FL','CT-FR','CT-BL','CT-BR']],
 ['wardrobe','template_wardrobe',wardrobe,{w:2000,h:2400,d:700},['WR-SL','WR-SR','WR-BOT']],
];
for (const [family,type,make,target,feet] of families){
  test(`A4-3 ${family}: altered W/H/D are exact and keep construction valid`,()=>{
    const before=make(), snapshot=clone(before);
    const output=scaleAssemblyComponentsToTarget(before,target,220,140,3200,'target-group','Furniture',type);
    assert.equal(output.length,before.length);
    const bounds=componentBounds(output);
    for(const [axis,value] of [['width',target.w],['height',target.h],['depth',target.d]])
      assert.ok(near(bounds[axis],value),`${axis}: ${bounds[axis]} expected ${value}`);
    assert.equal(bounds.maxY,3160,'floor contact');
    assert.equal(bounds.minX,220); assert.equal(bounds.minZ,140);
    const review=reviewFurnitureGeometryA3({components:output});
    assert.equal(review.geometryCandidateForReview,true,JSON.stringify(review.issues));
    for (const originalPart of before){
      const updated=byCode(output,originalPart.partCode);
      assert.ok(updated, originalPart.partCode);
      for (const field of ['type','partRole','partCode','qty','material','assemblyType','label','wood_type','finish'])
        assert.equal(updated[field],originalPart[field],`${originalPart.partCode}/${field}`);
      assert.notEqual(updated.id,originalPart.id);
      assert.equal(updated.groupId,'target-group');
      if(originalPart.partRole==='leg'){
        assert.equal(updated.width,originalPart.width);
        assert.equal(updated.depth,originalPart.depth);
      }
      if(originalPart.partRole==='top_panel' && type!=='template_wardrobe')
        assert.equal(updated.height,originalPart.height,'table top section');
      if(['top_panel','bottom_panel','shelf'].includes(originalPart.partRole) && type==='template_wardrobe')
        assert.equal(updated.height,originalPart.height,'board thickness');
      if(originalPart.partRole==='left_side_panel'||originalPart.partRole==='right_side_panel')
        assert.equal(updated.width,originalPart.width,'wardrobe side thickness');
    }
    for(const code of feet) assert.equal(byCode(output,code).y+byCode(output,code).height,3160,code);
    assert.deepEqual(before,snapshot,'source parts mutated');
  });
  test(`A4-3 ${family}: original dimensions still work`,()=>{
    const base=make(), dims=componentBounds(base);
    const out=scaleAssemblyComponentsToTarget(Object.freeze(base.map(p=>Object.freeze(p))),
      {w:dims.width,h:dims.height,d:dims.depth},80,60,3200,'group','Furniture',type);
    assert.equal(out.length,base.length);
    assert.equal(reviewFurnitureGeometryA3({components:out}).geometryCandidateForReview,true);
  });
  test(`A4-3 ${family}: invalid undersize rejects without fallback scaling`,()=>{
    const base=make(), original=clone(base);
    assert.throws(()=>scaleAssemblyComponentsToTarget(base,{w:100,h:100,d:100},100,100,3200,'group','Furniture',type),
      /unverified|cannot safely|construction/i);
    assert.deepEqual(base,original);
  });
}

test('A4-3 material selections survive new template generation',()=>{
 const base=wardrobe().map(p=>({...p, material:p.partCode.startsWith('WR-D')?'Mahogany':'Pine', wood_type:p.partCode.startsWith('WR-D')?'Mahogany':'Pine',finish:'Natural',qty:1}));
 const next=scaleAssemblyComponentsToTarget(base,{w:1960,h:2320,d:680},20,40,3200,'group','Furniture','template_wardrobe');
 for(const originalPart of base){
   const newer=byCode(next,originalPart.partCode);
   for(const k of ['material','wood_type','finish','qty'])assert.equal(newer[k],originalPart[k]);
 }
});

test('A4-3 legacy bed/closet builder behavior remains unchanged by new branch',()=>{
 const before=wardrobe();const out=scaleAssemblyComponentsToTarget(before,{w:1700,h:2250,d:650},0,0,3200,'group','Furniture','template_bed_frame');
 assert.equal(out.length,before.length,'legacy scaled result still created');
 assert.ok(out[0].width!==before[0].width,'original legacy path remains separate');
});
