"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const srcPath = path.join(root, "admin/frontend/src/pages/blueprints/data/inspectorPartThickness.js");
const panel = fs.readFileSync(path.join(root, "admin/frontend/src/pages/blueprints/3d/components/PropertiesPanel.jsx"), "utf8");
const code = fs.readFileSync(srcPath, "utf8");
const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

(async () => {
  const { getInspectorPartThickness: get } = await import(url);
  const thickness = (part) => get(part).thicknessMm;
  assert.equal(thickness({ partCode: "CT-TOP", width: 1200, height: 36, depth: 600 }), 36);
  assert.equal(thickness({ partCode: "CT-SH", width: 950, height: 22, depth: 350 }), 22);
  assert.equal(thickness({ partCode: "CT-AF", width: 950, height: 70, depth: 22 }), 22);
  assert.equal(thickness({ partCode: "CT-ASL", width: 22, height: 70, depth: 350 }), 22);
  assert.equal(thickness({ partCode: "DT-TOP", width: 2000, height: 40, depth: 900 }), 40);
  assert.equal(thickness({ partCode: "DT-AR2", width: 25, height: 90, depth: 600 }), 25);
  assert.equal(thickness({ partCode: "WR-SL", width: 18, height: 2200, depth: 600 }), 18);
  assert.equal(thickness({ partCode: "WR-TOP", width: 1764, height: 18, depth: 600 }), 18);
  assert.equal(thickness({ partCode: "WR-DL", width: 882, height: 2164, depth: 18 }), 18);
  assert.equal(thickness({ width: 18, height: 300, depth: 450 }), 18);
  assert.equal(thickness({ partCode: "CT-SH", width: 1150, height: 24, depth: 350 }), 24, "Thickness must follow resized geometry");
  assert.equal(get({ width: 70, height: 150, depth: 100 }).kind, "unspecified");
  assert.deepEqual(get({ partCode: "CT-FL", width: 70, height: 414, depth: 70 }).kind, "section");
  assert.equal(get({ partCode: "CT-FL", width: 70, height: 414, depth: 70 }).widthMm, 70);
  assert.equal(get({ partCode: "CT-FL", width: 70, height: 414, depth: 70 }).depthMm, 70);
  assert.equal(get({width:0,height:40,depth:90}), null);

  assert.match(panel, /import \{ getInspectorPartThickness \} from "\.\.\/\.\.\/data\/inspectorPartThickness";/);
  assert.match(panel, /const partThickness = getInspectorPartThickness\(selectedComp\);/);
  assert.match(panel, /partThickness\.kind === "section"/);
  assert.match(panel, /partThickness\.thicknessMm/);
  assert.match(panel, /<div style=\{inspectorSectionTitleStyle\}>Size<\/div>/);
  assert.match(panel, /\["Width", "width"\]/);
  assert.match(panel, /\["Height", "height"\]/);
  assert.match(panel, /\["Depth", "depth"\]/);
  console.log("PASS: Blueprint thickness is shown in Size, derived from existing geometry; legs show cross-section.");
})().catch((err) => { console.error(err); process.exitCode = 1; });
