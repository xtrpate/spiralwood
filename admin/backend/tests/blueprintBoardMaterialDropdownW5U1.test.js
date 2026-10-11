"use strict";
// W5U1 minimal Board Material dropdown integrity test (no database or browser needed).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = path.resolve(__dirname, "../../..");
const paths = {
  panel: path.join(root, "admin/frontend/src/pages/blueprints/3d/components/PropertiesPanel.jsx"),
  metadata: path.join(root, "admin/frontend/src/pages/blueprints/data/productionMetadata.js"),
};
const getText = (file) => fs.readFileSync(file, "utf8");
const materials = () => {
  const source = getText(paths.metadata);
  const match = source.match(/const MATERIAL_SUGGESTIONS\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(match, "Existing material options must remain available");
  return vm.runInNewContext(match[1]);
};

test("W5U1: all ten W3 requested actual wood types have selectable exact material options", () => {
  const names = require("../utils/blueprintWoodReferencePrices").WOOD_REFERENCE_PRICES.map((w) => w.name);
  assert.equal(names.length, 10);
  const available = materials();
  for (const name of names) {
    const label = name === "Rubberwood" ? "Rubberwood" : `${name} Wood`;
    assert.ok(available.includes(label), `${label} is missing`);
  }
  assert.equal(new Set(available).size, available.length, "No duplicate material labels");
});

test("W5U1: old material suggestions remain available without changing other metadata", () => {
  const available = materials();
  for (const value of ["Marine Plywood", "Plywood", "Laminated Plywood", "Panel Board", "MDF", "Particle Board", "Engineered Wood", "Solid Wood", "Walnut Wood"]) {
    assert.ok(available.includes(value), `Legacy material option missing: ${value}`);
  }
  assert.match(getText(paths.metadata), /const GRAIN_DIRECTION_OPTIONS\s*=/);
});

test("W5U1: Board Material uses fixed select, keeps current and legacy unknown values", () => {
  const source = getText(paths.panel);
  const part = source.match(/<label style=\{S\.floatingLabel\}>Board Material<\/label>([\s\S]*?)<\/select>/);
  assert.ok(part, "Expected Board Material select");
  assert.match(part[1], /<select\s/);
  assert.doesNotMatch(part[1], /<datalist|\blist=/);
  assert.match(part[1], /value=\{selectedComp\.material \|\| ""\}/);
  assert.match(part[1], /editorMode !== "editable" \|\| isLocked\(selectedComp\)/);
  assert.match(part[1], /!MATERIAL_SUGGESTIONS\.includes\(selectedComp\.material\)/);
  assert.match(part[1], /<option value=\{selectedComp\.material\}>/);
  assert.match(part[1], /MATERIAL_SUGGESTIONS\.map\(\(material\)/);
  assert.match(part[1], /raw_material_id:\s*null/);
  assert.match(part[1], /wood_type:\s*e\.target\.value/);
});

test("W5U1: actual wood review and W5 confirmation guard stay intact", () => {
  const source = getText(paths.panel);
  for (const text of ["Customer Requested Actual Wood", "Material mismatch", "Confirm Actual Wood & Dimensions", "getActualWoodValidationSignature(selectedComp)", "matchesRequestedActualWood(selectedComp)"]) {
    assert.ok(source.includes(text), `W5 validation missing: ${text}`);
  }
});
