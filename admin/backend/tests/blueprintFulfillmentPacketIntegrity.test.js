"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fulfillment = read("admin/backend/controllers/staff/pos.fulfillment.js");
const orderController = read("admin/backend/controllers/admin/orderController.js");

const begin = fulfillment.indexOf("const getBlueprintDeliveryReadiness = async");
const end = fulfillment.indexOf("\nconst toNullableInt =", begin);
assert.ok(begin >= 0 && end > begin, "Blueprint readiness function must be available");
const block = fulfillment.slice(begin, end);
assert.match(block, /SELECT task_role, status, blueprint_id/);
assert.match(block, /requiredTaskRows\.length !== REQUIRED_BLUEPRINT_DELIVERY_TASK_ROLES\.length/);
assert.match(block, /row\.blueprint_id\) !== Number\(lifecycleOrder\.blueprint_id\)/);
const getReadiness = new Function(
  "resolveLifecycleByOrder", "normalizeText", "normalizeBlueprintDeliveryTaskRole",
  "REQUIRED_BLUEPRINT_DELIVERY_TASK_ROLES", block + ";return getBlueprintDeliveryReadiness;",
);
const norm = (x) => String(x || "").trim().toLowerCase().replace(/\s+/g, "_");
const roles = ["cutting_machine", "edge_banding", "horizontal_drilling", "retouching", "packing"];
const lifecycle = {
  status: "OK",
  order: { id: 561, blueprint_id: 258, total: "10000.00" },
  blueprint: { id: 258 },
  estimation: { id: 1, status: "approved", grand_total: "10000.00" },
  contract: { id: 1, signed_at: "2026-10-08" },
  verified_payment_total: "3000.00",
};
const rows = roles.map((task_role, idx) => ({
  id: 100 + idx, task_role, status: "completed", blueprint_id: 258,
}));
const ready = getReadiness(async () => lifecycle, (x) => String(x || "").trim(), norm, roles);
const tests = [
  ["valid packet", rows, true],
  ["unrelated historical task allowed", [...rows, { id: 222, task_role: "Old custom work", status: "pending", blueprint_id: null }], true],
  ["missing Packing", rows.slice(0, 4), false],
  ["unfinished Packing", [...rows.slice(0, 4), { ...rows[4], status: "in_progress" }], false],
  ["duplicate Cutting (both completed)", [...rows, { ...rows[0], id: 777 }], false],
  ["duplicate Cutting (one unfinished)", [...rows, { ...rows[0], id: 777, status: "in_progress" }], false],
  ["mismatched blueprint", [...rows.slice(0, 4), { ...rows[4], blueprint_id: 259 }], false],
  ["missing task blueprint", [...rows.slice(0, 4), { ...rows[4], blueprint_id: null }], false],
];
(async () => {
  for (const [name, data, expected] of tests) {
    const result = await ready({ query: async () => [data] }, 561);
    assert.equal(result.ok, expected, name);
  }
  const start = orderController.indexOf("exports.updateStatus = async");
  const stop = orderController.indexOf("\nexports.accept = async", start);
  assert.ok(start >= 0 && stop > start, "Order status handler must exist");
  const handler = orderController.slice(start, stop);
  assert.match(handler, /SELECT task_role, status, blueprint_id/);
  assert.match(handler, /requiredTaskRows\.length !== REQUIRED_BLUEPRINT_TASK_ROLES\.length/);
  assert.match(handler, /row\.blueprint_id\) !== Number\(order\.blueprint_id\)/);
  assert.match(handler, /Production task blueprint mismatch/);
  console.log("PASS: Blueprint delivery packet integrity (8 simulated cases and completion guards).");
})().catch((error) => { console.error("FAIL:", error); process.exitCode = 1; });
