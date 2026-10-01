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
  /const \{ getPhilippineDateKey \} = require\("\.\.\/\.\.\/utils\/philippineTime"\);/,
);
assert.match(source, /MAX\(d\.delivered_date\)/);
assert.match(source, /d\.status IN \('delivered', 'completed'\)/);
assert.match(
  source,
  /LOWER\(COALESCE\(o\.fulfillment_method, ''\)\) = 'pickup'/,
);
assert.match(source, /o\.picked_up_at/);
assert.match(source, /INTERVAL 8 HOUR/);
assert.doesNotMatch(source, /LEFT JOIN deliveries d ON d\.order_id = o\.id/);
assert.doesNotMatch(source, /CURDATE\(\)/);
assert.doesNotMatch(source, /new Date\(item\.warranty_expiry\)/);

const dbPath = require.resolve("../config/db");
const signedUrlPath = require.resolve("../utils/signedUrl");
const notificationPath = require.resolve("../utils/notificationHelper");
const auditPath = require.resolve("../middleware/auditLog");
const philippineTimePath = require.resolve("../utils/philippineTime");
const controllerPath = require.resolve("../controllers/customer/customer.warranty");

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

let scenario = "eligible";
let dbCalls = [];

const settingsRows = [
  { content_key: "warranty_period_days", content: "365" },
  { content_key: "warranty_policy_version", content: "2" },
];

const mockDb = {
  async getConnection() {
    return {
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      release() {},
      query(sql, params = []) {
        return mockDb.query(sql, params);
      },
    };
  },

  async query(sql, params = []) {
    const text = String(sql);
    dbCalls.push({ sql: text, params: [...params] });

    if (
      text.includes("FROM website_content") &&
      text.includes("content_key IN (?, ?)")
    ) {
      assert.deepEqual(params, [
        "warranty_period_days",
        "warranty_policy_version",
      ]);
      return [settingsRows];
    }

    if (
      text.includes("SELECT") &&
      text.includes("o.id,") &&
      text.includes("NOT EXISTS") &&
      text.includes("FROM warranties w")
    ) {
      assert.deepEqual(params, [365, 17, 365, "2026-10-01"]);
      assert.match(text, /MAX\(d\.delivered_date\)/);
      assert.match(text, /o\.picked_up_at/);
      assert.match(text, /warranty_handoff_at DESC/);
      assert.doesNotMatch(text, /LEFT JOIN deliveries d/);

      return [[{
        id: 9,
        order_number: "SWS-W1-0009",
        created_at: "2026-09-01 02:00:00",
        status: "completed",
        payment_status: "paid",
        total: "12000.00",
        delivery_address: "Test Address",
        order_type: "standard",
        delivered_date: null,
        warranty_handoff_at: "2026-09-01 02:00:00",
        warranty_expiry: "2027-09-01",
        order_item_id: 12,
        product_id: 5,
        product_name: "Test Desk",
        quantity: 2,
        product_type: "ready_made",
      }]];
    }

    if (
      text.includes("o.id AS order_id") &&
      text.includes("oi.id = ?") &&
      text.includes("warranty_is_active")
    ) {
      assert.deepEqual(params, [
        365,
        365,
        "2026-10-01",
        17,
        9,
        12,
      ]);

      return [[{
        order_id: 9,
        order_number: "SWS-W1-0009",
        customer_id: 17,
        status: "completed",
        payment_status: "paid",
        warranty_expiry: "2027-09-01",
        warranty_is_active: scenario === "expired" ? 0 : 1,
        order_item_id: 12,
        product_id: 5,
        product_name: "Test Desk",
        ordered_quantity: 2,
      }]];
    }

    if (
      text.includes("FROM warranties") &&
      text.includes("status <> 'cancelled'")
    ) {
      return [[]];
    }

    if (text.includes("INSERT INTO warranties")) {
      return [{ insertId: 55, affectedRows: 1 }];
    }

    if (
      text.includes("SELECT id FROM users") &&
      text.includes("role = 'admin'")
    ) {
      return [[]];
    }

    throw new Error(`Unexpected W1 query (${scenario}): ${text}`);
  },
};

async function run() {
  install(dbPath, mockDb);
  install(signedUrlPath, { signUploadPath: (value) => value });
  install(notificationPath, { createNotificationSafe: async () => true });
  install(auditPath, { writeAuditLogSafe: async () => true });
  install(philippineTimePath, {
    getPhilippineDateKey: () => "2026-10-01",
  });

  delete require.cache[controllerPath];
  const controller = require("../controllers/customer/customer.warranty");

  scenario = "eligible";
  dbCalls = [];
  let res = makeRes();

  await controller.getEligibleOrders(
    { user: { id: 17, name: "Warranty Test Customer" } },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].id, 9);
  assert.equal(res.body[0].warranty_expiry, "2027-09-01");
  assert.equal(res.body[0].products.length, 1);
  assert.equal(res.body[0].products[0].order_item_id, 12);

  const eligibleSql = dbCalls.find(
    (call) =>
      call.sql.includes("NOT EXISTS") &&
      call.sql.includes("warranty_handoff_at"),
  )?.sql;

  assert.ok(eligibleSql, "Eligible-order query must execute.");
  assert.match(eligibleSql, />= \?/);

  scenario = "expired";
  dbCalls = [];
  res = makeRes();

  await controller.submitClaim(
    {
      body: {
        order_id: "9",
        order_item_id: "12",
        claim_quantity: "1",
        description: "Test defect.",
      },
      files: {
        photo: [{ filename: "photo.jpg" }],
        proof: [{ filename: "proof.pdf" }],
      },
      user: { id: 17, name: "Warranty Test Customer" },
      ip: "127.0.0.1",
    },
    res,
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /no longer within the warranty period/i);
  assert.equal(
    dbCalls.some((call) => call.sql.includes("INSERT INTO warranties")),
    false,
  );

  scenario = "active";
  dbCalls = [];
  res = makeRes();

  await controller.submitClaim(
    {
      body: {
        order_id: "9",
        order_item_id: "12",
        claim_quantity: "1",
        description: "Test defect.",
      },
      files: {
        photo: [{ filename: "photo.jpg" }],
        proof: [{ filename: "proof.pdf" }],
      },
      user: { id: 17, name: "Warranty Test Customer" },
      ip: "127.0.0.1",
    },
    res,
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body?.claim_id, 55);
  assert.equal(
    dbCalls.filter((call) => call.sql.includes("INSERT INTO warranties")).length,
    1,
  );

  console.log(
    "PASS: Warranty handoff and Philippine expiry integrity checks passed.",
  );
}

run()
  .catch((error) => {
    console.error(
      "FAIL: Warranty handoff and Philippine expiry integrity checks failed.",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);