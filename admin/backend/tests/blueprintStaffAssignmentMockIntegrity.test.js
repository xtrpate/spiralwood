"use strict";
// Isolated, zero-database behavior tests for the existing Admin assignment handler.
// Loads ONLY the function source and injects a fake SQL connection and fake services.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const controllerPath = path.join(repoRoot, "admin/backend/controllers/admin/orderController.js");
const source = fs.readFileSync(controllerPath, "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("exports.assignStaff = async (req, res) => {");
const end = source.indexOf("\n/**\n * PATCH /orders/:id/reassign-staff", start);
assert.ok(start >= 0 && end > start, "Expected production assignment handler not found; review code before testing.");
const handlerSource = source.slice(start, end);
assert.match(handlerSource, /consumeBlueprintMaterialsForProduction\(conn,\s*\{/);
assert.match(handlerSource, /FOR UPDATE/);
assert.match(handlerSource, /await conn\.commit\(\)/);
assert.match(handlerSource, /await conn\.rollback\(\)/);

const roleLabels = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];
const normalize = (v) => String(v || "").trim().toLowerCase();
const normalizeRole = (v) => normalize(v).replace(/\s+/g, "_");
const requiredRoles = roleLabels.map(normalizeRole);
const parseStrictPositiveInt = (v) => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  if (!/^\d+$/.test(String(v))) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
class BlueprintMaterialConsumptionError extends Error {
  constructor(code, message, statusCode = 409) {
    super(message);
    this.name = "BlueprintMaterialConsumptionError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// The function is evaluated in a closure with mocked dependencies ONLY.
// Do not require the full controller or DB module, and do not execute an API route.
const buildHandler = new Function(
  "pool",
  "parseStrictPositiveInt",
  "normalize",
  "REQUIRED_BLUEPRINT_TASK_ROLES",
  "BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS",
  "consumeBlueprintMaterialsForProduction",
  "createNotification",
  "BlueprintMaterialConsumptionError",
  "emitTaskUpdate",
  "emitOrderStatusUpdate",
  `"use strict"; const exports = {};\n${handlerSource}\nreturn exports.assignStaff;`,
);

function createScenario(mode = "success") {
  const calls = [];
  const order = {
    id: 621, order_number: "SWS-TEST-621", customer_id: 44,
    order_type: "blueprint", blueprint_id: 307,
    contract_blueprint_id: mode === "wrong_blueprint" ? 999 : 307,
    status: mode === "confirmed" ? "confirmed" : mode === "in_production" ? "production" : "contract_released",
  };
  let taskId = 1000;
  const conn = {
    async beginTransaction() { calls.push({ step: "begin" }); },
    async commit() { calls.push({ step: "commit" }); },
    async rollback() { calls.push({ step: "rollback" }); },
    release() { calls.push({ step: "release" }); },
    async query(sql, params = []) {
      const text = String(sql);
      if (/FROM orders o\b/.test(text)) {
        calls.push({ step: "lock_order" });
        return [[mode === "missing_order" ? undefined : order]];
      }
      if (/FROM blueprints\b/.test(text)) {
        calls.push({ step: "lock_blueprint" });
        return [[{ id: 307, is_deleted: mode === "deleted_blueprint" ? 1 : 0 }]];
      }
      if (/FROM users\b/.test(text)) {
        calls.push({ step: "lock_staff" });
        return [[mode === "inactive_staff" ? { id: 13, is_active: 0 } : { id: 13, role: "staff", staff_type: "indoor", is_active: 1 }]];
      }
      if (/FROM project_tasks\b/.test(text)) {
        calls.push({ step: "lock_packet" });
        return [mode === "existing_packet" ? [{ id: 99, task_role: "Cutting Machine", status: "pending" }] : []];
      }
      if (/INSERT INTO project_tasks\b/.test(text)) {
        calls.push({ step: "insert_task", params });
        return [{ insertId: ++taskId, affectedRows: 1 }];
      }
      if (/UPDATE orders\b/.test(text)) {
        calls.push({ step: "status_update", params });
        return [{ affectedRows: mode === "stale_status" ? 0 : 1 }];
      }
      throw new Error(`Unexpected fake SQL in assignment test: ${text.slice(0, 110)}`);
    },
  };
  const pool = { async getConnection() { calls.push({ step: "connection" }); return conn; } };
  const consumeBlueprintMaterialsForProduction = async (fakeConn, args) => {
    assert.equal(fakeConn, conn);
    assert.equal(args.orderId, 621);
    assert.equal(args.actorUserId, 1);
    calls.push({ step: "consume_materials" });
    if (mode === "no_down_payment") {
      throw new BlueprintMaterialConsumptionError(
        "BLUEPRINT_DOWN_PAYMENT_NOT_REACHED",
        "Verified 30% down payment required.", 409,
      );
    }
    if (mode === "stock_shortage") {
      throw new BlueprintMaterialConsumptionError(
        "INSUFFICIENT_STOCK",
        "Inventory stock is insufficient.", 409,
      );
    }
    return {
      reason: mode === "in_production" ? "ALREADY_CONSUMED" : "CONSUMED",
      reservation_ids: [12, 13], stock_movement_ids: [21, 22], consumed_count: 2,
    };
  };
  const createNotification = async () => {
    calls.push({ step: "notification" });
    if (mode === "notification_failure") throw new Error("Mock notification insert failed");
  };
  const emitTaskUpdate = () => calls.push({ step: "emit_task" });
  const emitOrderStatusUpdate = () => calls.push({ step: "emit_order" });
  const handler = buildHandler(
    pool, parseStrictPositiveInt, normalize, requiredRoles, roleLabels,
    consumeBlueprintMaterialsForProduction, createNotification,
    BlueprintMaterialConsumptionError, emitTaskUpdate, emitOrderStatusUpdate,
  );
  const req = {
    params: { id: "621" },
    body: { staff_id: "13", due_date: "2099-01-01 09:30:00", note: "TEST-ONLY MOCK" },
    user: { id: 1 }, app: { get: () => ({}) },
  };
  const res = {
    statusCode: 200, body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return { mode, handler, req, res, calls };
}
const count = (scene, step) => scene.calls.filter((entry) => entry.step === step).length;
const hasNoWrites = (scene) => {
  assert.equal(count(scene, "insert_task"), 0);
  assert.equal(count(scene, "status_update"), 0);
  assert.equal(count(scene, "commit"), 0);
  assert.equal(count(scene, "emit_task"), 0);
  assert.equal(count(scene, "emit_order"), 0);
};

async function run() {
  let total = 0;
  const check = async (label, mode, validate, mutate) => {
    const scene = createScenario(mode);
    if (mutate) mutate(scene.req);
    await scene.handler(scene.req, scene.res);
    await validate(scene);
    assert.equal(count(scene, "release"), 1, "Mock connection should always be released");
    total += 1;
    console.log(`PASS: ${label}`);
  };
  await check("invalid staff ID rejects before transaction", "success", (s) => {
    assert.equal(s.res.statusCode, 400);
    assert.equal(count(s, "begin"), 0);
    hasNoWrites(s);
  }, (req) => { req.body.staff_id = "0"; });

  await check("invalid due date rejects before transaction", "success", (s) => {
    assert.equal(s.res.statusCode, 400);
    assert.equal(count(s, "begin"), 0);
    hasNoWrites(s);
  }, (req) => { req.body.due_date = "2099-13-45 10:00:00"; });

  for (const [mode, label, expected] of [
    ["missing_order", "missing order rejected", 404],
    ["confirmed", "unreleased confirmed order rejected", 400],
    ["wrong_blueprint", "order/contract blueprint mismatch rejected", 409],
    ["inactive_staff", "inactive indoor staff rejected", 400],
    ["existing_packet", "duplicate production packet rejected", 400],
  ]) {
    await check(label, mode, (s) => {
      assert.equal(s.res.statusCode, expected);
      hasNoWrites(s);
      assert.equal(count(s, "rollback"), 1);
    });
  }

  for (const [mode, reason] of [
    ["no_down_payment", "BLUEPRINT_DOWN_PAYMENT_NOT_REACHED"],
    ["stock_shortage", "INSUFFICIENT_STOCK"],
  ]) {
    await check(`${reason} rolls back before task creation`, mode, (s) => {
      assert.equal(s.res.statusCode, 409);
      assert.equal(s.res.body.integrity_reason, reason);
      assert.equal(count(s, "consume_materials"), 1);
      hasNoWrites(s);
      assert.equal(count(s, "rollback"), 1);
    });
  }

  await check("valid contract release creates five tasks after materials, commits, then emits", "success", (s) => {
    assert.equal(s.res.statusCode, 200);
    assert.equal(s.res.body.steps_created, 5);
    assert.equal(count(s, "consume_materials"), 1);
    assert.equal(count(s, "insert_task"), 5);
    assert.equal(count(s, "status_update"), 1);
    assert.equal(count(s, "notification"), 1);
    assert.equal(count(s, "commit"), 1);
    assert.equal(count(s, "rollback"), 0);
    assert.equal(count(s, "emit_task"), 1);
    assert.equal(count(s, "emit_order"), 1);
    const events = s.calls.map(x => x.step);
    assert.ok(events.indexOf("consume_materials") < events.indexOf("insert_task"));
    assert.ok(events.indexOf("commit") < events.indexOf("emit_task"));
    assert.deepEqual(s.calls.filter(x => x.step === "insert_task").map(x => x.params[4]), roleLabels);
    assert.deepEqual(s.req.auditRecord.new.task_roles, roleLabels);
    assert.equal(s.req.auditRecord.new.status, "production");
  });

  await check("existing production does not transition or double-consume", "in_production", (s) => {
    assert.equal(s.res.statusCode, 200);
    assert.equal(s.res.body.material_consumption.reason, "ALREADY_CONSUMED");
    assert.equal(count(s, "insert_task"), 5);
    assert.equal(count(s, "status_update"), 0);
    assert.equal(count(s, "emit_order"), 0);
    assert.equal(count(s, "commit"), 1);
  });

  await check("stale order status after task inserts rolls back, no commit or emit", "stale_status", (s) => {
    assert.equal(s.res.statusCode, 409);
    assert.equal(s.res.body.integrity_reason, "ORDER_STATUS_CHANGED");
    assert.equal(count(s, "insert_task"), 5);
    assert.equal(count(s, "rollback"), 1);
    assert.equal(count(s, "commit"), 0);
    assert.equal(count(s, "emit_task"), 0);
    assert.equal(count(s, "emit_order"), 0);
  });

  await check("notification failure rolls back transaction and task inserts", "notification_failure", (s) => {
    assert.equal(s.res.statusCode, 500);
    assert.equal(count(s, "insert_task"), 5);
    assert.equal(count(s, "rollback"), 1);
    assert.equal(count(s, "commit"), 0);
    assert.equal(count(s, "emit_task"), 0);
    assert.equal(count(s, "emit_order"), 0);
  });

  console.log(`PASS: ${total}/${total} mocked Admin Blueprint production assignment scenarios. NO DATABASE ACCESSED.`);
}
run().catch((err) => { console.error("FAIL: Mock production assignment test:", err); process.exitCode = 1; });
