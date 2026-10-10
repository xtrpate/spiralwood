"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const helperPath = path.join(
  repoRoot, "admin/frontend/src/pages/blueprints/export/orthographicDrawOrder.js",
);
const placementPath = path.join(
  repoRoot, "admin/frontend/src/pages/blueprints/export/placementHelpers.js",
);

const source = fs.readFileSync(helperPath, "utf8");
const placement = fs.readFileSync(placementPath, "utf8");
const imported = import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const p = (code, z, depth = 20) => ({
  comp: { id: code, partCode: code, z, depth },
  box: { x: 0, y: 0, w: 100, h: 100 },
});
const names = (items) => items.map((item) => item.comp.partCode);

// Nominal Mini Cabinet #278 depth arrangement: back at low Z, frame spans
// the cabinet depth, inset door leaves near the positive-Z front plane.
const cabinet = [
  p("CB-SIDE-L", 160, 620),
  p("CB-SIDE-R", 160, 620),
  p("CB-TOP", 160, 620),
  p("CB-BOT", 160, 620),
  p("CB-BACK", 160, 6),
  p("CB-TOE-KICK", 712, 18),
  p("CB-SH-01", 166, 578),
  p("CB-SH-02", 166, 578),
  p("CAB-DOOR-L", 760, 20),
  p("CAB-DOOR-R", 760, 20),
];

test("Admin export helper uses immutable far-to-near painter ordering", async () => {
  const { sortOrthographicPartsByDepth } = await imported;
  const inputCopy = names(cabinet);
  const front = sortOrthographicPartsByDepth(cabinet, "front");
  const back = sortOrthographicPartsByDepth(cabinet, "back");
  assert.equal(front.length, 10);
  assert.equal(back.length, 10);
  assert.deepEqual(names(cabinet), inputCopy, "original part list mutated");
  assert.notStrictEqual(front, cabinet);
  assert.notStrictEqual(back, cabinet);
});

test("Front View: both inset doors paint after back panel", async () => {
  const { sortOrthographicPartsByDepth: order } = await imported;
  const result = names(order(cabinet, "front"));
  assert.ok(result.indexOf("CB-BACK") < result.indexOf("CAB-DOOR-L"));
  assert.ok(result.indexOf("CB-BACK") < result.indexOf("CAB-DOOR-R"));
});

test("Back View: back panel paints over both front doors", async () => {
  const { sortOrthographicPartsByDepth: order } = await imported;
  const result = names(order(cabinet, "back"));
  assert.ok(result.indexOf("CB-BACK") > result.indexOf("CAB-DOOR-L"));
  assert.ok(result.indexOf("CB-BACK") > result.indexOf("CAB-DOOR-R"));
  assert.equal(result.at(-1), "CB-BACK");
});

test("Panel sorting is valid when saved parts have different array order", async () => {
  const { sortOrthographicPartsByDepth: order } = await imported;
  const reversed = [...cabinet].reverse();
  assert.equal(names(order(reversed, "back")).at(-1), "CB-BACK");
  assert.equal(names(order(reversed, "front"))[0], "CB-BACK");
});

test("Unrelated Left, Right, Top and Exploded views remain untouched", async () => {
  const { sortOrthographicPartsByDepth: order } = await imported;
  for (const view of ["left", "right", "top", "exploded", "3d"]) {
    assert.strictEqual(order(cabinet, view), cabinet);
  }
});

test("Depth-order is deterministic and tie order stays stable", async () => {
  const { sortOrthographicPartsByDepth: order } = await imported;
  const tied = [p("a", 10, 10), p("b", 12, 6), p("c", 10, 10)];
  assert.deepEqual(names(order(tied, "back")), ["a", "b", "c"]);
  assert.deepEqual(names(order(tied, "front")), ["a", "b", "c"]);
});

test("Invalid Z/depth data cannot introduce NaN ordering", async () => {
  const { sortOrthographicPartsByDepth: order } = await imported;
  const input = [p("good", 1, 10), { comp: { partCode: "bad", z: "x", depth: null } }];
  assert.deepEqual(names(order(input, "back")), ["good", "bad"]);
});

test("Production export pipeline uses the sorter before view mirroring", () => {
  assert.match(placement, /import\s*\{\s*sortOrthographicPartsByDepth\s*\}\s*from\s*["']\.\/orthographicDrawOrder["']/);
  assert.match(placement, /const orderedProjected = sortOrthographicPartsByDepth\(projected, view\)/);
  assert.match(placement, /get2DBounds\(orderedProjected\)/);
  assert.match(placement, /return orderedProjected\.map\(/);
  assert.match(placement, /getMirroredBox\(item\.box, bounds, view\)/);
});

console.log("ADM-B3E1: export-only Back View depth-order integrity checks registered.");
