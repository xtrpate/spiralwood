const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const controllerFile = path.join(
  backendRoot,
  "controllers/staff/pos.fulfillment.js",
);

const source = fs.readFileSync(controllerFile, "utf8");
const start = source.indexOf("exports.updateDeliveryStatus = async (req, res) => {");
const end = source.indexOf("/* ── RIDER DASHBOARD STATS", start);
assert.ok(start >= 0 && end > start, "updateDeliveryStatus source slice must exist");
const updateSource = source.slice(start, end);

// C1 source-level contracts: reject coercive IDs/money, preserve protected notes,
// and keep fresh-upload ownership explicit around transaction/commit boundaries.
assert.match(
  updateSource,
  /const deliveryId = parseStrictPositiveInt\(req\.params\.id\);/,
  "delivery status must strictly parse the route id",
);
assert.doesNotMatch(
  updateSource,
  /const deliveryId = toNullableInt\(req\.params\.id\);/,
  "delivery status must not use coercive ID parsing",
);
assert.match(
  updateSource,
  /parseStrictMoneyToCents\(/,
  "submitted collection amount must use the strict request parser",
);
assert.doesNotMatch(
  updateSource,
  /toPositiveAmount\(req\.body\.collected_amount\)/,
  "delivery completion must not round/coerce submitted money",
);
assert.doesNotMatch(
  updateSource,
  /req\.body\.notes/,
  "rider status updates must not overwrite saved delivery/admin notes",
);
assert.match(
  updateSource,
  /let nextNotesForUpdate = existing\.notes \?\? null;/,
  "delivery notes must start from the locked DB value",
);
assert.match(
  updateSource,
  /MAX_COLLECTION_NOTES_LENGTH/,
  "collection notes must be bounded",
);
assert.match(
  updateSource,
  /freshUploadNeedsCleanup/,
  "fresh POD ownership flag must exist",
);
assert.match(
  updateSource,
  /commitAttempted = true;\s*await conn\.commit\(\);\s*committed = true;/,
  "commit ownership must be explicit",
);
assert.match(
  updateSource,
  /if \(freshUploadNeedsCleanup && !commitAttempted && !committed\)/,
  "pre-commit failures must clean the request-owned upload",
);
assert.match(
  updateSource,
  /commit outcome is uncertain; retaining the fresh Proof of Delivery upload/,
  "ambiguous commit outcomes must not delete a possibly committed POD",
);
assert.match(
  updateSource,
  /catch \(rollbackErr\)/,
  "rollback failure must be isolated from response/cleanup handling",
);
assert.equal(
  (updateSource.match(/cleanupFreshUpload\(req\.file\);/g) || []).length,
  1,
  "all upload cleanup must pass through the ownership helper",
);

const acknowledgementStart = source.indexOf(
  "const parseDeliveryAcknowledgementInput = (body = {}) => {",
);
const acknowledgementEnd = source.indexOf(
  "const REQUIRED_BLUEPRINT_DELIVERY_TASK_ROLES",
  acknowledgementStart,
);
assert.ok(
  acknowledgementStart >= 0 && acknowledgementEnd > acknowledgementStart,
  "acknowledgement parser source slice must exist",
);
const acknowledgementSource = source.slice(
  acknowledgementStart,
  acknowledgementEnd,
);
assert.ok(
  (acknowledgementSource.match(/readBoundedDeliveryText\(/g) || []).length >= 3,
  "recipient/name/note text inputs must use strict string validation",
);

const { parseStrictMoneyToCents } = require("../utils/paymentAmounts");
assert.deepEqual(parseStrictMoneyToCents("1000"), {
  amountCents: 100000,
  normalizedAmount: 1000,
});
assert.deepEqual(parseStrictMoneyToCents("1000.04"), {
  amountCents: 100004,
  normalizedAmount: 1000.04,
});
for (const invalid of [
  "1e3",
  "1000.004",
  "0",
  "-1",
  "NaN",
  1000,
  1000.04,
  { amount: "1000.00" },
  ["1000.00"],
]) {
  assert.equal(
    parseStrictMoneyToCents(invalid),
    null,
    `strict money parser must reject ${JSON.stringify(invalid)}`,
  );
}

const dbPath = require.resolve("../config/db");
const adaptiveUploadPath = require.resolve("../utils/adaptiveUpload");
const signedUrlPath = require.resolve("../utils/signedUrl");
const auditLogPath = require.resolve("../middleware/auditLog");
const socketPath = require.resolve("../utils/orderStatusSocket");
const controllerPath = require.resolve("../controllers/staff/pos.fulfillment");

const mockedPaths = [
  dbPath,
  adaptiveUploadPath,
  signedUrlPath,
  auditLogPath,
  socketPath,
  controllerPath,
];
const originals = new Map(
  mockedPaths.map((modulePath) => [modulePath, require.cache[modulePath]]),
);

function install(modulePath, exportsValue) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
}

function restore() {
  for (const [modulePath, cached] of originals) {
    delete require.cache[modulePath];
    if (cached) require.cache[modulePath] = cached;
  }
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    },
  };
}

function makeReq({
  id = "9",
  status = "in_transit",
  body = {},
  file = null,
  user = null,
} = {}) {
  return {
    params: { id },
    body: { status, ...body },
    file,
    user:
      user ||
      ({
        id: 11,
        role: "staff",
        staff_type: "delivery_rider",
        is_active: 1,
        name: "Test Rider",
      }),
    ip: "127.0.0.1",
    auditRecord: undefined,
    app: {
      get() {
        return null;
      },
    },
  };
}

const freshFile = () => ({
  originalname: "pod.jpg",
  mimetype: "image/jpeg",
  buffer: Buffer.from("fake-pod"),
  size: 8,
});

let storeCount = 0;
let cleanupCount = 0;
let getConnectionCount = 0;
let rollbackCount = 0;
let commitCount = 0;
let releaseCount = 0;
let deliveryUpdateParams = null;
let scenario = "connection_error";

const mockAdaptiveUpload = {
  async storeUploadBuffer() {
    storeCount += 1;
    return {
      storage: "local",
      file_url: "/uploads/deliveries/c1-test.jpg",
      local_path: "/tmp/c1-test.jpg",
      public_id: null,
      resource_type: null,
    };
  },
  async cleanupStoredUpload() {
    cleanupCount += 1;
  },
};

const baseOrder = () => ({
  id: 10,
  order_number: "ORD-C1-10",
  total: "1000.00",
  status: "confirmed",
  payment_status: "unpaid",
  customer_id: null,
  order_type: "standard",
  payment_method: "cod",
  remaining_payment_method: null,
});

const baseDelivery = (overrides = {}) => ({
  id: 9,
  order_id: 10,
  driver_id: 11,
  assigned_by: null,
  assigned_at: "2026-09-30 08:00:00",
  scheduled_date: "2026-09-30",
  delivered_date: null,
  address: "Test Address",
  status: "scheduled",
  notes: "ADMIN NOTE — KEEP",
  signed_receipt: null,
  updated_at: "2026-09-30 08:00:00",
  ...overrides,
});

function reset(nextScenario) {
  scenario = nextScenario;
  storeCount = 0;
  cleanupCount = 0;
  getConnectionCount = 0;
  rollbackCount = 0;
  commitCount = 0;
  releaseCount = 0;
  deliveryUpdateParams = null;
}

function makeConnection() {
  return {
    async beginTransaction() {},
    async rollback() {
      rollbackCount += 1;
      if (scenario === "rollback_failure") {
        throw new Error("rollback failed internally");
      }
    },
    async commit() {
      commitCount += 1;
      if (scenario === "commit_error") {
        throw new Error("connection lost while commit outcome is uncertain");
      }
    },
    release() {
      releaseCount += 1;
    },
    async query(sql, params = []) {
      const text = String(sql);

      if (scenario === "deadlock" && text.includes("SELECT order_id, driver_id FROM deliveries")) {
        const err = new Error("deadlock details");
        err.code = "ER_LOCK_DEADLOCK";
        err.errno = 1213;
        throw err;
      }

      if (scenario === "rollback_failure" && text.includes("SELECT order_id, driver_id FROM deliveries")) {
        throw new Error("sensitive DB detail");
      }

      if (text.includes("SELECT order_id, driver_id FROM deliveries")) {
        if (scenario === "wrong_rider") {
          return [[{ order_id: 10, driver_id: 22 }]];
        }
        return [[{ order_id: 10, driver_id: 11 }]];
      }

      if (
        text.includes("SELECT status, payment_status") &&
        text.includes("FROM orders") &&
        text.includes("FOR UPDATE")
      ) {
        return [[{ status: "shipping", payment_status: "unpaid" }]];
      }

      if (
        text.includes("SELECT id, order_number, total, status, payment_status, customer_id") &&
        text.includes("FROM orders") &&
        text.includes("FOR UPDATE")
      ) {
        return [[baseOrder()]];
      }

      if (text.includes("SELECT * FROM deliveries") && text.includes("FOR UPDATE")) {
        return [[baseDelivery()]];
      }

      if (
        text.includes("SUM(CASE WHEN LOWER(status) = 'verified' THEN amount") &&
        text.includes("AS verified_total") &&
        text.includes("AS has_pending") &&
        !text.includes("AS has_rejected")
      ) {
        return [[{ verified_total: "0.00", has_pending: 0 }]];
      }

      if (text.includes("UPDATE deliveries") && text.includes("signed_receipt = ?")) {
        deliveryUpdateParams = [...params];
        return [{ affectedRows: 1 }];
      }

      if (
        text.includes("AS has_pending") &&
        text.includes("AS has_rejected") &&
        text.includes("FROM payment_transactions")
      ) {
        return [[{
          verified_total: "0.00",
          has_pending: 0,
          has_rejected: 0,
        }]];
      }

      if (text.includes("UPDATE orders") && text.includes("payment_status = ?")) {
        return [{ affectedRows: 1 }];
      }

      if (
        text.includes("FROM deliveries d") &&
        text.includes("LEFT JOIN delivery_acknowledgements da") &&
        text.includes("WHERE d.id = ?")
      ) {
        return [[{
          ...baseDelivery({
            status: "in_transit",
            signed_receipt: "/uploads/deliveries/c1-test.jpg",
          }),
          order_number: "ORD-C1-10",
          total: "1000.00",
          payment_method: "cod",
          payment_status: "unpaid",
          order_type: "standard",
          remaining_payment_method: null,
          delivery_lat: null,
          delivery_lng: null,
          order_created_at: "2026-09-30 07:00:00",
          payment_verified_total: "0.00",
          payment_balance: "1000.00",
          pending_payment_count: 0,
          customer_name: "Walk-in Customer",
          customer_phone: "",
          driver_name: "Test Rider",
        }]];
      }

      throw new Error(`Unexpected SQL in C1 test (${scenario}): ${text}`);
    },
  };
}

const mockDb = {
  async getConnection() {
    getConnectionCount += 1;
    if (scenario === "connection_error") {
      throw new Error("sensitive connection detail");
    }
    return makeConnection();
  },
  async query() {
    throw new Error("Pool query must not be used by updateDeliveryStatus.");
  },
};

async function invoke(controller, req) {
  const res = makeRes();
  const oldError = console.error;
  console.error = () => {};
  try {
    await controller.updateDeliveryStatus(req, res);
  } finally {
    console.error = oldError;
    // cleanupFreshUpload intentionally uses a promise continuation. Give it
    // one microtask turn so count assertions are deterministic.
    await Promise.resolve();
  }
  return res;
}

async function run() {
  install(dbPath, mockDb);
  install(adaptiveUploadPath, mockAdaptiveUpload);
  install(signedUrlPath, { signUploadPath: (value) => value });
  install(auditLogPath, { writeAuditLogSafe: async () => true });
  install(socketPath, {
    emitOrderStatusUpdate() {},
    emitDeliveryUpdate() {},
    emitDeliveryAssigned() {},
    emitDeliveryUnassigned() {},
  });

  delete require.cache[controllerPath];
  const controller = require("../controllers/staff/pos.fulfillment");

  // Invalid IDs are rejected before storage or DB access.
  for (const id of ["9e0", "9.0", "9abc", "-9", "0", "", " "]) {
    reset("connection_error");
    const res = await invoke(
      controller,
      makeReq({ id, file: freshFile() }),
    );
    assert.equal(res.statusCode, 400, `expected 400 for route id ${JSON.stringify(id)}`);
    assert.equal(storeCount, 0);
    assert.equal(cleanupCount, 0);
    assert.equal(getConnectionCount, 0);
  }

  // Malformed/ambiguous submitted amounts are rejected before permanent upload.
  for (const amount of ["1e3", "1000.004", "0", "-1", 1000, 1000.04]) {
    reset("connection_error");
    const res = await invoke(
      controller,
      makeReq({
        body: { collected_amount: amount },
        file: freshFile(),
      }),
    );
    assert.equal(res.statusCode, 400, `expected 400 for amount ${JSON.stringify(amount)}`);
    assert.equal(storeCount, 0);
    assert.equal(cleanupCount, 0);
    assert.equal(getConnectionCount, 0);
  }

  // Notes/failure reason must be real bounded strings, not object coercions.
  for (const collectionNotes of [{ bad: true }, ["bad"], "n".repeat(501)]) {
    reset("connection_error");
    const res = await invoke(
      controller,
      makeReq({ body: { collection_notes: collectionNotes }, file: freshFile() }),
    );
    assert.equal(res.statusCode, 400);
    assert.equal(storeCount, 0);
    assert.equal(getConnectionCount, 0);
  }

  for (const failureReason of [{ bad: true }, ["bad"], "x".repeat(501)]) {
    reset("connection_error");
    const res = await invoke(
      controller,
      makeReq({
        status: "failed",
        body: { failure_reason: failureReason },
        file: freshFile(),
      }),
    );
    assert.equal(res.statusCode, 400);
    assert.equal(storeCount, 0);
    assert.equal(getConnectionCount, 0);
  }

  // Once a POD has been persisted by this request, rejected/pre-commit paths
  // clean exactly that fresh upload.
  reset("connection_error");
  let res = await invoke(controller, makeReq({ file: freshFile() }));
  assert.equal(res.statusCode, 500);
  assert.equal(storeCount, 1);
  assert.equal(cleanupCount, 1);

  reset("wrong_rider");
  res = await invoke(controller, makeReq({ file: freshFile() }));
  assert.equal(res.statusCode, 403);
  assert.equal(rollbackCount, 1);
  assert.equal(cleanupCount, 1);

  reset("invalid_transition");
  res = await invoke(
    controller,
    makeReq({ status: "delivered", file: freshFile() }),
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /invalid delivery transition/i);
  assert.equal(rollbackCount, 1);
  assert.equal(cleanupCount, 1);

  reset("deadlock");
  res = await invoke(controller, makeReq({ file: freshFile() }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.reason_code, "CONCURRENT_UPDATE_RETRY");
  assert.equal(rollbackCount, 1);
  assert.equal(cleanupCount, 1);

  reset("rollback_failure");
  res = await invoke(controller, makeReq({ file: freshFile() }));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Failed to update delivery status" });
  assert.equal(rollbackCount, 1);
  assert.equal(cleanupCount, 1);

  // If COMMIT itself returns an ambiguous error, do not delete the fresh POD:
  // the DB may already reference it. The caller gets an error and must refresh.
  reset("commit_error");
  res = await invoke(
    controller,
    makeReq({
      status: "in_transit",
      body: { notes: "STALE RIDER NOTE — MUST NOT OVERWRITE" },
      file: freshFile(),
    }),
  );
  assert.equal(res.statusCode, 500);
  assert.equal(commitCount, 1);
  assert.equal(rollbackCount, 0);
  assert.equal(cleanupCount, 0);

  // A successful non-completion POD update commits, retains its new upload,
  // and ignores a crafted/stale rider notes field in favor of locked DB notes.
  reset("success");
  res = await invoke(
    controller,
    makeReq({
      status: "in_transit",
      body: { notes: "STALE RIDER NOTE — MUST NOT OVERWRITE" },
      file: freshFile(),
    }),
  );
  assert.equal(res.statusCode, 200);
  assert.equal(commitCount, 1);
  assert.equal(cleanupCount, 0);
  assert.equal(releaseCount, 1);
  assert.ok(deliveryUpdateParams, "delivery update must execute");
  assert.equal(deliveryUpdateParams[0], "in_transit");
  assert.equal(deliveryUpdateParams[1], "ADMIN NOTE — KEEP");
  assert.equal(deliveryUpdateParams[3], "/uploads/deliveries/c1-test.jpg");

  console.log("✅ Delivery C1 completion/input/upload integrity tests passed.");
}

run()
  .catch((error) => {
    console.error("❌ Delivery C1 completion/input/upload integrity tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);
