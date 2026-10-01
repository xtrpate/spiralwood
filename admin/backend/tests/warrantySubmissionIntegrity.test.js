"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const controllerFile = path.join(
  backendRoot,
  "controllers/customer/customer.warranty.js",
);
const source = fs.readFileSync(controllerFile, "utf8");

assert.match(
  source,
  /parseStrictPositiveInt\(req\.body\?\.order_id\)/,
  "Warranty submission must strictly parse order_id.",
);

assert.match(
  source,
  /parseStrictPositiveInt\(req\.body\?\.order_item_id\)/,
  "Warranty submission must strictly parse order_item_id.",
);

assert.match(
  source,
  /parseStrictPositiveInt\(req\.body\?\.claim_quantity\)/,
  "Warranty submission must strictly parse claim_quantity.",
);

assert.match(
  source,
  /typeof rawDescription !== "string"/,
  "Warranty description must be validated as real text.",
);

assert.match(
  source,
  /connection = await db\.getConnection\(\)/,
  "Warranty submission must use one dedicated pooled connection.",
);

assert.match(
  source,
  /await connection\.beginTransaction\(\)/,
  "Warranty submission must begin a transaction.",
);

assert.match(
  source,
  /oi\.id = \?\s+LIMIT 1\s+FOR UPDATE/,
  "Warranty submission must lock the exact purchased order item.",
);

assert.match(
  source,
  /status <> 'cancelled'[\s\S]*LIMIT 1\s+FOR UPDATE/,
  "Warranty submission must recheck existing non-cancelled claims under lock.",
);

assert.match(
  source,
  /await connection\.commit\(\)/,
  "Successful warranty submission must commit.",
);

assert.match(
  source,
  /await connection\.rollback\(\)/,
  "Rejected/failed warranty submissions must roll back.",
);

const dbPath = require.resolve("../config/db");
const signedUrlPath = require.resolve("../utils/signedUrl");
const notificationPath = require.resolve("../utils/notificationHelper");
const auditPath = require.resolve("../middleware/auditLog");
const philippineTimePath = require.resolve("../utils/philippineTime");
const controllerPath = require.resolve(
  "../controllers/customer/customer.warranty",
);

const mockedPaths = [
  dbPath,
  signedUrlPath,
  notificationPath,
  auditPath,
  philippineTimePath,
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

const settingsRows = [
  { content_key: "warranty_period_days", content: "365" },
  { content_key: "warranty_policy_version", content: "2" },
];

const baseItem = {
  order_id: 9,
  order_number: "SWS-W3-0009",
  customer_id: 17,
  status: "completed",
  payment_status: "paid",
  warranty_expiry: "2027-09-01",
  warranty_is_active: 1,
  order_item_id: 12,
  product_id: 5,
  product_name: "W3 Test Desk",
  ordered_quantity: 2,
};

let scenario = "success";
let events = [];
let notifications = [];
let audits = [];
let insertCount = 0;

function record(name) {
  events.push(name);
}

const mockConnection = {
  async beginTransaction() {
    record("begin");
  },

  async query(sql, params = []) {
    const text = String(sql);

    if (
      text.includes("o.id AS order_id") &&
      text.includes("oi.id = ?") &&
      text.includes("FOR UPDATE")
    ) {
      record("item-lock");

      if (scenario === "missing") return [[]];
      if (scenario === "expired") {
        return [[{ ...baseItem, warranty_is_active: 0 }]];
      }
      return [[{ ...baseItem }]];
    }

    if (
      text.includes("FROM warranties") &&
      text.includes("status <> 'cancelled'") &&
      text.includes("FOR UPDATE")
    ) {
      record("existing-lock");

      if (scenario === "duplicate") {
        return [[{ id: 88, status: "pending" }]];
      }

      return [[]];
    }

    if (text.includes("INSERT INTO warranties")) {
      record("insert");
      insertCount += 1;

      if (scenario === "deadlock") {
        const error = new Error("simulated deadlock");
        error.code = "ER_LOCK_DEADLOCK";
        error.errno = 1213;
        throw error;
      }

      if (scenario === "unexpected-error") {
        throw new Error("simulated insert failure");
      }

      assert.deepEqual(params, [
        17,
        9,
        12,
        "W3 Test Desk",
        1,
        "Leg is cracked.",
        "uploads/warranty/photo.jpg,uploads/warranty/proof.pdf",
        "2027-09-01",
      ]);

      return [{ insertId: 77, affectedRows: 1 }];
    }

    throw new Error(`Unexpected transaction query (${scenario}): ${text}`);
  },

  async commit() {
    record("commit");
  },

  async rollback() {
    record("rollback");
  },

  release() {
    record("release");
  },
};

const mockDb = {
  async getConnection() {
    record("getConnection");
    return mockConnection;
  },

  async query(sql, params = []) {
    const text = String(sql);

    if (
      text.includes("FROM website_content") &&
      text.includes("content_key IN (?, ?)")
    ) {
      record("settings");
      assert.deepEqual(params, [
        "warranty_period_days",
        "warranty_policy_version",
      ]);
      return [settingsRows];
    }

    if (
      text.includes("SELECT id FROM users") &&
      text.includes("role = 'admin'")
    ) {
      record("admin-query");
      return [[{ id: 1 }, { id: 2 }]];
    }

    throw new Error(`Unexpected pool query (${scenario}): ${text}`);
  },
};

function makeRequest(overrides = {}) {
  return {
    body: {
      order_id: "9",
      order_item_id: "12",
      claim_quantity: "1",
      description: "Leg is cracked.",
      ...(overrides.body || {}),
    },
    files:
      overrides.files === undefined
        ? {
            photo: [{ filename: "photo.jpg" }],
            proof: [{ filename: "proof.pdf" }],
          }
        : overrides.files,
    user: {
      id: 17,
      name: "Warranty W3 Customer",
      ...(overrides.user || {}),
    },
    ip: "127.0.0.1",
  };
}

function reset(nextScenario) {
  scenario = nextScenario;
  events = [];
  notifications = [];
  audits = [];
  insertCount = 0;
}

async function run() {
  install(dbPath, mockDb);
  install(signedUrlPath, { signUploadPath: (value) => value });
  install(notificationPath, {
    createNotificationSafe: async (_db, payload) => {
      record("notification");
      notifications.push(payload);
      return true;
    },
  });
  install(auditPath, {
    writeAuditLogSafe: async (payload) => {
      record("audit");
      audits.push(payload);
      return true;
    },
  });
  install(philippineTimePath, {
    getPhilippineDateKey: () => "2026-10-01",
  });

  delete require.cache[controllerPath];
  const controller = require("../controllers/customer/customer.warranty");

  for (const invalidValue of [
    "12abc",
    "1e2",
    "12.0",
    "0",
    "-1",
    "",
  ]) {
    reset("success");
    const req = makeRequest({
      body: {
        order_id: invalidValue,
      },
    });
    const res = makeRes();

    await controller.submitClaim(req, res);

    assert.equal(
      res.statusCode,
      400,
      `Malformed order_id ${invalidValue} must be rejected.`,
    );
    assert.equal(events.length, 0);
    assert.equal(insertCount, 0);
  }

  reset("success");
  {
    const req = makeRequest({
      body: {
        order_item_id: "12.0",
      },
    });
    const res = makeRes();

    await controller.submitClaim(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(events.length, 0);
  }

  reset("success");
  {
    const req = makeRequest({
      body: {
        claim_quantity: "1e2",
      },
    });
    const res = makeRes();

    await controller.submitClaim(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(events.length, 0);
  }

  reset("success");
  {
    const req = makeRequest({
      body: {
        description: { text: "not real text" },
      },
    });
    const res = makeRes();

    await controller.submitClaim(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body?.message || "", /must be text/i);
    assert.equal(events.length, 0);
  }

  reset("success");
  {
    const req = makeRequest();
    const res = makeRes();

    await controller.submitClaim(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body?.claim_id, 77);
    assert.equal(insertCount, 1);
    assert.equal(audits.length, 1);
    assert.equal(notifications.length, 2);
    assert.equal(
      events.filter((event) => event === "commit").length,
      1,
    );
    assert.equal(
      events.filter((event) => event === "rollback").length,
      0,
    );

    const itemLockIndex = events.indexOf("item-lock");
    const existingLockIndex = events.indexOf("existing-lock");
    const insertIndex = events.indexOf("insert");
    const commitIndex = events.indexOf("commit");
    const auditIndex = events.indexOf("audit");
    const notificationIndex = events.indexOf("notification");

    assert.ok(itemLockIndex >= 0);
    assert.ok(existingLockIndex > itemLockIndex);
    assert.ok(insertIndex > existingLockIndex);
    assert.ok(commitIndex > insertIndex);
    assert.ok(auditIndex > commitIndex);
    assert.ok(notificationIndex > commitIndex);
  }

  reset("duplicate");
  {
    const req = makeRequest();
    const res = makeRes();

    await controller.submitClaim(req, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body?.message || "", /already exists/i);
    assert.equal(insertCount, 0);
    assert.equal(audits.length, 0);
    assert.equal(notifications.length, 0);
    assert.equal(events.includes("rollback"), true);
    assert.equal(events.includes("commit"), false);
    assert.ok(events.indexOf("existing-lock") > events.indexOf("item-lock"));
  }

  reset("success");
  {
    const req = makeRequest({
      body: {
        claim_quantity: "3",
      },
    });
    const res = makeRes();

    await controller.submitClaim(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body?.message || "", /cannot exceed/i);
    assert.equal(insertCount, 0);
    assert.equal(events.includes("rollback"), true);
    assert.equal(events.includes("existing-lock"), false);
  }

  reset("deadlock");
  {
    const req = makeRequest();
    const res = makeRes();

    await controller.submitClaim(req, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body?.message || "", /another warranty submission/i);
    assert.equal(insertCount, 1);
    assert.equal(audits.length, 0);
    assert.equal(notifications.length, 0);
    assert.equal(events.includes("rollback"), true);
    assert.equal(events.includes("commit"), false);
  }

  reset("unexpected-error");
  {
    const req = makeRequest();
    const res = makeRes();

    await controller.submitClaim(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(audits.length, 0);
    assert.equal(notifications.length, 0);
    assert.equal(events.includes("rollback"), true);
    assert.equal(events.includes("commit"), false);
  }

  console.log("PASS: Warranty submission integrity checks passed.");
}

run()
  .catch((error) => {
    console.error("FAIL: Warranty submission integrity checks failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);