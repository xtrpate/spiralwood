"use strict";
// WISDOM C1: pure, DB-free component and submitted-snapshot integrity tests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../../..");
const adapterPath = path.join(root, "admin/frontend/src/pages/customer/customerBlueprintAdapter.js");
const workbenchPath = path.join(root, "admin/frontend/src/pages/customer/CustomerTemplateWorkbench.jsx");
const backendPath = path.join(root, "admin/backend/controllers/customer/customer.customorders.js");
const adapterSource = fs.readFileSync(adapterPath, "utf8");
const workbenchSource = fs.readFileSync(workbenchPath, "utf8");
const backendSource = fs.readFileSync(backendPath, "utf8");

const originalPart = (id, changes = {}) => ({
  id, type: "custom_component", label: `Part ${id}`,
  x: id === "p1" ? 0 : 55, y: 0, z: 0,
  width: 45, height: 120, depth: 18,
  material: "Pine Wood", qty: 1,
  ...changes,
});

let adapterModule;
async function loadAdapter() {
  if (adapterModule) return adapterModule;
  // The real adapter imports one pure bounds helper. Stub only that import;
  // execute its actual extraction/normalization code, not a duplicate.
  const importLine = /import\s*\{\s*getRotatedComponentBounds3D\s*\}\s*from\s*["']\.\.\/blueprints\/data\/rotationBounds["'];?/;
  assert.match(adapterSource, importLine, "Adapter import changed; review this test.");
  const stub = `const getRotatedComponentBounds3D = (part) => ({
    minX: part.x, minY: part.y, minZ: part.z,
    maxX: part.x + part.width, maxY: part.y + part.height,
    maxZ: part.z + part.depth
  });`;
  const source = adapterSource.replace(importLine, stub);
  adapterModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  return adapterModule;
}

function extractBackendFunction(startMarker, endMarker, name, context = {}) {
  const first = backendSource.indexOf(startMarker);
  const last = backendSource.indexOf(endMarker, first + 1);
  assert.ok(first !== -1 && last > first, `Cannot safely extract ${name}`);
  const sandbox = {
    module: { exports: {} },
    ...context,
  };
  vm.runInNewContext(
    `${backendSource.slice(first, last)}\nmodule.exports = ${name};`,
    sandbox,
    { filename: `${name}-from-production.js` },
  );
  return sandbox.module.exports;
}

const validation = extractBackendFunction(
  "const MAX_CUSTOM_EDITOR_PARTS = 300;",
  "const sanitizeEditorSnapshotForStorage =",
  "validateCustomEditorSnapshot",
);

const cleanText = (value) => value == null ? null : String(value).trim() || null;
const sanitizer = extractBackendFunction(
  "const sanitizeEditorSnapshotForStorage =",
  "const sanitizeCustomizationSnapshotForStorage =",
  "sanitizeEditorSnapshotForStorage",
  {
    toTrimmedStringOrNull: cleanText,
    sanitizeSnapshotMachiningPlane: () => null,
    sanitizeSnapshotMachiningCutouts: () => [],
    sanitizeSnapshotWoodworkingOperations: () => [],
  },
);

test("C1 adapter preserves physical quantity, identity, links and movement for future published designs", async () => {
  const { extractCustomerBlueprintScene } = await loadAdapter();
  const blueprint = {
    id: 999,
    title: "New generic furniture",
    design_data: {
      components: [
        originalPart("p1", {
          qty: 4, assemblyId: "group-a", assemblyRole: "leg",
          parentPartId: "frame-a", partRole: "table_leg",
          motionGroupId: "drawer-a", motionReferencePartId: "frame-a",
          grainDirection: "along_length", templateType: "template_dining_table",
        }),
        originalPart("p2", { x: 56, qty: 2 }),
      ],
    },
  };
  const scene = extractCustomerBlueprintScene(blueprint);
  assert.equal(scene.components.length, 2);
  const leg = scene.components.find((p) => p.id === "p1");
  assert.ok(leg);
  assert.equal(leg.qty, 4);
  assert.equal(leg.assemblyRole, "leg");
  assert.equal(leg.parentPartId, "frame-a");
  assert.equal(leg.motionGroupId, "drawer-a");
  assert.equal(leg.motionReferencePartId, "frame-a");
  assert.equal(leg.grainDirection, "along_length");
  assert.equal(leg.material, "Pine Wood");
  assert.equal(scene.components.find((p) => p.id === "p2").qty, 2);
  assert.equal(blueprint.design_data.components[0].qty, 4, "Admin source not mutated");
});

test("C1 workbench serializes normalized parts and quantity into cart snapshot", () => {
  assert.match(workbenchSource, /normalizeComponent\(\{/);
  assert.match(workbenchSource, /editor_snapshot:\s*\{\s*worldSize,\s*components:\s*normalizedComponents/s);
  const productionNormalize = fs.readFileSync(path.join(root, "admin/frontend/src/pages/blueprints/data/componentUtils.js"), "utf8");
  assert.match(productionNormalize, /qty:\s*Math\.max\(1, Number\(c\.qty\) \|\| 1\)/);
});

test("C1 rejects incomplete, malformed, duplicate or truncated snapshots before insert", () => {
  const part = originalPart("p1", { qty: 4 });
  const ok = { components: [part] };
  assert.equal(validation(ok), null);
  assert.equal(validation({ components: [{ ...part, id: 101 }] }), null, "Legacy numeric part IDs are supported");
  for (const bad of [
    null, {}, { components: [] },
    { components: [part, { ...part }] },
    { components: [{ ...part, id: "" }] },
    { components: [{ ...part, id: {} }] },
    { components: [{ ...part, width: 0 }] },
    { components: [{ ...part, depth: null }] },
    { components: [{ ...part, qty: 0 }] },
    { components: [{ ...part, qty: 2.5 }] },
    { components: [{ ...part, qty: 1000001 }] },
    { components: Array.from({ length: 301 }, (_, i) => originalPart(`p${i}`)) },
  ]) {
    assert.equal(typeof validation(bad), "string", "bad design must be rejected");
  }
  assert.match(backendSource, /const snapshotError = validateCustomEditorSnapshot\(cleanedItems\[0\]\.editor_snapshot\)/);
  assert.match(backendSource, /if \(snapshotError\)\s*\{\s*return res\.status\(400\)/);
  assert.doesNotMatch(backendSource, /snapshot\.components\.slice\(0,\s*300\)/);
});

test("C1 backend persists exact count, per-part quantity, structural identity and world size", () => {
  const first = originalPart("p1", {
    qty: 4, assemblyRole: "leg", parentPartId: "frame-a",
    motionGroupId: "drawer-a", motionReferencePartId: "frame-a",
  });
  const second = originalPart("p2", { x: 55, qty: 2 });
  const snapshot = {
    worldSize: { width_mm: 6400, height_mm: 3200, depth_mm: 5200 },
    components: [first, second],
  };
  assert.equal(validation(snapshot), null);
  const stored = sanitizer(snapshot);
  assert.equal(stored.components.length, 2);
  assert.equal(stored.components[0].id, "p1");
  assert.equal(stored.components[0].qty, 4);
  assert.equal(stored.components[1].qty, 2);
  assert.equal(stored.components[0].assemblyRole, "leg");
  assert.equal(stored.components[0].parentPartId, "frame-a");
  assert.equal(stored.components[0].motionGroupId, "drawer-a");
  assert.equal(stored.components[0].motionReferencePartId, "frame-a");
  assert.equal(stored.components[0].material, "Pine Wood");
  assert.equal(stored.worldSize.w, 6400);
  assert.equal(stored.worldSize.h, 3200);
  assert.equal(stored.worldSize.d, 5200);
});
