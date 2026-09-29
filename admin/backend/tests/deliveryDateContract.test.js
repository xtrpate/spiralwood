const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const fulfillmentPath = require.resolve("../controllers/staff/pos.fulfillment");
const philippineTimePath = require.resolve("../utils/philippineTime");

const originals = new Map(
  [dbPath, fulfillmentPath, philippineTimePath].map((modulePath) => [
    modulePath,
    require.cache[modulePath],
  ]),
);

let dbCalls = [];

const mockDb = {
  async query(sql, params = []) {
    dbCalls.push({ type: "query", sql: String(sql), params: [...params] });

    if (
      String(sql).includes("FROM orders o") &&
      String(sql).includes("NOT EXISTS") &&
      String(sql).includes("FROM deliveries d2")
    ) {
      return [[]];
    }

    throw new Error(`Unexpected pool query in delivery-date test: ${sql}`);
  },

  async getConnection() {
    dbCalls.push({ type: "getConnection" });
    throw new Error("Database connection must not be reached for rejected past dates.");
  },
};

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

const getPastPhilippineDateKey = () => {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

async function run() {
  install(dbPath, mockDb);
  delete require.cache[philippineTimePath];
  const {
    getPhilippineDateTimeMinuteKey,
  } = require("../utils/philippineTime");

  assert.equal(
    getPhilippineDateTimeMinuteKey(new Date("2026-09-29T15:59:59.000Z")),
    "2026-09-29 23:59",
  );
  assert.equal(
    getPhilippineDateTimeMinuteKey(new Date("2026-09-29T16:00:00.000Z")),
    "2026-09-30 00:00",
  );

  delete require.cache[fulfillmentPath];
  const controller = require("../controllers/staff/pos.fulfillment");

  const pastDate = getPastPhilippineDateKey();

  dbCalls = [];
  let res = makeRes();
  await controller.createDelivery(
    {
      body: {
        order_id: "1",
        driver_id: "2",
        address: "Test Delivery Address",
        scheduled_date: pastDate,
        notes: "",
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /past/i);
  assert.equal(dbCalls.length, 0);

  dbCalls = [];
  res = makeRes();
  await controller.rescheduleDelivery(
    {
      params: { id: "3" },
      body: {
        driver_id: "2",
        scheduled_date: pastDate,
        reschedule_reason: "Customer requested another date.",
        notes: "",
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /past/i);
  assert.equal(dbCalls.length, 0);

  dbCalls = [];
  res = makeRes();
  await controller.getDeliverableOrders(
    {
      user: { id: 99, role: "admin" },
      query: {},
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
  assert.equal(dbCalls.length, 1);
  assert.match(
    dbCalls[0].sql,
    /DATE_FORMAT\(\s*o\.requested_delivery_date,\s*'%Y-%m-%d %H:%i:%s'\s*\)\s+AS requested_delivery_date/,
  );

  console.log("✅ Delivery date contract tests passed.");
}

run()
  .catch((error) => {
    console.error("❌ Delivery date contract tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);
