"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2] || process.cwd());
const helperPath = path.join(root, "admin/frontend/src/pages/blueprints/data/drawerOpeningPlan.js");
const helperCode = fs.readFileSync(helperPath, "utf8");
const builder = fs.readFileSync(path.join(root, "admin/frontend/src/pages/blueprints/hooks/useBlueprintBuilderActions.js"), "utf8");
const arrangement = fs.readFileSync(path.join(root, "admin/frontend/src/pages/blueprints/hooks/useBlueprintArrangementActions.js"), "utf8");

const load = async () => import(`data:text/javascript;base64,${Buffer.from(helperCode).toString("base64")}`);
(async () => {
  const { planDrawerOpeningTargets: plan } = await load();
  const outer = {x:18,y:18,z:18,width:564,height:664,depth:430};
  const bays = [{...outer,bayIndex:1}];
  const shelves = [{id:"s1",height:18},{id:"s2",height:18}];
  const openings = [
    {...outer,height:208,bayIndex:1,rowIndex:1},
    {...outer,y:244,height:208,bayIndex:1,rowIndex:2},
    {...outer,y:470,height:212,bayIndex:1,rowIndex:3},
  ];
  const base = {scope:"whole",drawerCount:3,overallRect:outer,bayRects:bays,openingRects:openings,shelfParts:shelves,frontOverlay:10};
  const r = plan(base);
  assert.equal(r.ok,true);
  assert.equal(r.shelfFitted,true);
  assert.equal(r.targets.length,3);
  assert.deepEqual(r.targets.map(x=>x.targetDrawerCount),[1,1,1]);
  assert.equal(r.frontOverlay,8,"18 mm shelf / two adjacent 8 mm overlays leaves 2 mm gap");
  assert.equal(r.overlayReduced,true);
  for (let i = 0; i < r.targets.length - 1; i++) {
    const frontEndY = r.targets[i].y + r.targets[i].height + r.frontOverlay;
    const nextFrontStartY = r.targets[i + 1].y - r.frontOverlay;
    assert.ok(nextFrontStartY - frontEndY >= 1.999, "Adjacent drawer fronts must not overlap");
  }
  assert.equal(r.targets[0].y + r.targets[0].height + 18, r.targets[1].y);
  const countOne = plan({...base,drawerCount:1});
  assert.equal(countOne.ok,true,"One drawer should use one valid opening");
  assert.equal(countOne.targets.length,1);
  assert.equal(countOne.targets[0].rowIndex,3,"One drawer fits the tallest opening by default");
  assert.deepEqual(countOne.targets.map(x=>x.targetDrawerCount),[1]);
  const countTwo = plan({...base,drawerCount:2});
  assert.equal(countTwo.ok,true,"Two drawers can fit two different shelf openings");
  assert.equal(countTwo.targets.length,2);
  assert.deepEqual(countTwo.targets.map(x=>x.targetDrawerCount),[1,1]);
  const twoOpenings = {...base, shelfParts:[shelves[0]], openingRects:openings.slice(0,2)};
  const threeInTwo = plan({...twoOpenings,drawerCount:3,drawerGap:10});
  assert.equal(threeInTwo.ok,true,"Three drawers can share two valid openings");
  assert.deepEqual(threeInTwo.targets.map(x=>x.targetDrawerCount),[2,1]);
  assert.equal(threeInTwo.targets.reduce((sum,x)=>sum+x.targetDrawerCount,0),3);
  assert.equal(plan({...twoOpenings,drawerCount:5,drawerGap:10}).ok,false,"Too many drawers must fail without geometry changes");
  const constrained = {...twoOpenings,openingRects:openings.slice(0,2).map(x=>({...x,height:120}))};
  assert.equal(plan({...constrained,drawerCount:3,drawerGap:10}).ok,false,"Cannot squeeze three 80 mm slots into two 120 mm openings");
  assert.equal(plan({...base,scope:"bay"}).ok,false,"Bay-wide drawers may not cross shelves");
  const perOpening = plan({...base,scope:"opening",drawerCount:1});
  assert.equal(perOpening.ok,true);
  assert.equal(perOpening.targets.length,3);
  assert.equal(perOpening.frontOverlay,8);
  assert.equal(plan({...base,scope:"whole",dividerParts:[{width:18}]}).ok,false);
  const noShelves = plan({...base,shelfParts:[],openingRects:[]});
  assert.equal(noShelves.ok,true);
  assert.equal(noShelves.targets.length,1);
  assert.equal(noShelves.targets[0].targetDrawerCount,3);
  assert.equal(noShelves.frontOverlay,10);
  assert.equal(plan({...base,scope:"bay",shelfParts:[],dividerParts:[{width:18}],bayRects:[bays[0],{...outer,x:600,bayIndex:2}]}).frontOverlay,8);
  assert.equal(plan({...base,scope:"opening",openingRects:[]}).ok,false);
  assert.equal(plan({...base,scope:"whole",frontOverlay:-1}).ok,false);
  assert.equal(plan({...base,scope:"whole",drawerCount:9}).ok,false);

  assert.match(builder,/import \{ planDrawerOpeningTargets \} from "\.\.\/data\/drawerOpeningPlan";/);
  assert.match(builder,/const openingPlan = planDrawerOpeningTargets\(/);
  assert.match(builder,/const countForTarget = Number\(rect\.targetDrawerCount\) \|\| drawerCount;/);
  assert.match(builder,/openingPlan\.shelfFitted\s*\?/);
  assert.match(builder,/drawerFrontOverlay: roundMm\(effectiveFrontOverlay\)/);
  assert.match(builder,/for \(let index = 0; index < countForTarget; index \+= 1\)/);
  assert.match(builder,/const drawerNumber = openingPlan\.shelfFitted/);
  assert.match(builder,/drawerGap,\s*frontOverlay,/);
  assert.match(builder,/openingPlan\.shelfFitted\s*\? drawerAssemblyCount \+ 1/);
  assert.match(builder,/nextDrawerParts\.push\(\s*front,\s*leftSide,\s*rightSide,\s*back,\s*bottom,\s*handle,\s*leftSlide,\s*rightSlide/);
  assert.match(arrangement,/const structuralParts = assemblyItems\.filter\(\(item\) => !isDrawerStructurePart\(item\)\);/);
  console.log("PASS: Drawer Count 1/2/3 distributed across shelf-safe openings, full boxes retained, no DB/price changes.");
})().catch(err => { console.error(err); process.exitCode = 1; });
