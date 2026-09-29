const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const fulfillmentPath = require.resolve("../controllers/staff/pos.fulfillment");

const originals = new Map(
  [dbPath, fulfillmentPath].map((modulePath) => [
    modulePath,
    require.cache[modulePath],
  ]),
);

let scenario = null;
let dbCalls = [];
let getConnectionCount = 0;
let insertedDeliveryParams = null;

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

const getFuturePhilippineDateKey = () => {
  const shifted = new Date(
    Date.now() + 8 * 60 * 60 * 1000 + 2 * 24 * 60 * 60 * 1000,
  );

  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

const baseOrder = () => ({
  id: 10,
  order_number: "ORD-B1-10",
  customer_id: null,
  status: "confirmed",
  order_type: "standard",
  type: "walkin",
  payment_status: "unpaid",
  payment_method: "cash",
  fulfillment_method: "delivery",
  delivery_address: "Canonical Delivery Address",
  requested_delivery_date: null,
  delivery_request_notes: null,
  notes: null,
});

const activeRider = () => ({
  id: 20,
  name: "Active Rider",
  role: "staff",
  staff_type: "delivery_rider",
  is_active: 1,
});

function makeConnection() {
  return {
    async beginTransaction() {
      dbCalls.push({ type: "begin" });
    },

    async commit() {
      dbCalls.push({ type: "commit" });
    },

    async rollback() {
      dbCalls.push({ type: "rollback" });
    },

    release() {
      dbCalls.push({ type: "release" });
    },

    async query(sql, params = []) {
      const text = String(sql);
      dbCalls.push({
        type: "connection.query",
        sql: text,
        params: [...params],
      });

      if (scenario?.kind === "create") {
        if (
          text.includes("FROM orders") &&
          text.includes("WHERE id = ?") &&
          text.includes("FOR UPDATE")
        ) {
          return [[scenario.order || baseOrder()]];
        }

        if (
          text.includes("FROM deliveries") &&
          text.includes("WHERE order_id = ?") &&
          text.includes("ORDER BY id DESC") &&
          text.includes("FOR UPDATE")
        ) {
          return [[scenario.existingDelivery].filter(Boolean)];
        }

        if (
          text.includes("FROM users") &&
          text.includes("WHERE id = ?") &&
          text.includes("FOR UPDATE")
        ) {
          return [[scenario.rider === undefined ? activeRider() : scenario.rider].filter(Boolean)];
        }

        if (text.includes("INSERT INTO deliveries")) {
          insertedDeliveryParams = [...params];
          return [{ insertId: 77 }];
        }

        if (
          text.includes("FROM deliveries d") &&
          text.includes("WHERE d.id = ?")
        ) {
          return [[{
            id: 77,
            order_id: 10,
            driver_id: 20,
            assigned_by: 99,
            assigned_at: "2026-09-29 21:00:00",
            scheduled_date: params[0] ? scenario.futureDate : null,
            delivered_date: null,
            address: "Canonical Delivery Address",
            status: "scheduled",
            notes: null,
            signed_receipt: null,
            updated_at: "2026-09-29 21:00:00",
            order_number: "ORD-B1-10",
            customer_name: "Walk-in Customer",
            customer_phone: "",
            driver_name: "Active Rider",
          }]];
        }
      }

      if (scenario?.kind === "reschedule") {
        if (
          text.includes("SELECT * FROM deliveries") &&
          text.includes("WHERE id = ?") &&
          text.includes("FOR UPDATE")
        ) {
          return [[{
            id: 30,
            order_id: 10,
            driver_id: 20,
            status: "failed",
            address: "Old Delivery Address",
            scheduled_date: "2026-09-28",
          }]];
        }

        if (
          text.includes("FROM deliveries") &&
          text.includes("ORDER BY id DESC") &&
          text.includes("FOR UPDATE")
        ) {
          return [[{ id: 30, status: "failed" }]];
        }

        if (
          text.includes("FROM deliveries") &&
          text.includes("status <> 'failed'")
        ) {
          return [[]];
        }

        if (
          text.includes("FROM orders") &&
          text.includes("WHERE id = ?") &&
          text.includes("FOR UPDATE")
        ) {
          return [[
            scenario.order || {
              ...baseOrder(),
              status: "shipping",
            },
          ]];
        }

        if (
          text.includes("FROM users") &&
          text.includes("WHERE id = ?") &&
          text.includes("FOR UPDATE")
        ) {
          return [[scenario.rider].filter(Boolean)];
        }

        if (text.includes("INSERT INTO deliveries")) {
          throw new Error(
            "Reschedule insert must not occur when the rider is inactive.",
          );
        }
      }

      throw new Error(`Unexpected transactional SQL in B1 test: ${text}`);
    },
  };
}

const mockDb = {
  async query(sql, params = []) {
    const text = String(sql);
    dbCalls.push({ type: "pool.query", sql: text, params: [...params] });

    if (scenario?.kind === "list") {
      if (
        text.includes("FROM orders o") &&
        text.includes("NOT EXISTS") &&
        text.includes("FROM deliveries d2")
      ) {
        return [[
          {
            ...baseOrder(),
            id: 1,
            order_number: "ELIGIBLE",
          },
          {
            ...baseOrder(),
            id: 2,
            order_number: "PENDING",
            status: "pending",
          },
          {
            ...baseOrder(),
            id: 3,
            order_number: "PICKUP",
            fulfillment_method: "pickup",
          },
          {
            ...baseOrder(),
            id: 4,
            order_number: "COP_PICKUP",
            payment_method: "cop",
            fulfillment_method: null,
          },
        ]];
      }
    }

    if (text.includes("INSERT INTO notifications")) {
      return [{ insertId: 901 }];
    }

    throw new Error(`Unexpected pool SQL in B1 test: ${text}`);
  },

  async getConnection() {
    getConnectionCount += 1;
    return makeConnection();
  },
};

function reset(nextScenario = null) {
  scenario = nextScenario;
  dbCalls = [];
  getConnectionCount = 0;
  insertedDeliveryParams = null;
}

async function run() {
  install(dbPath, mockDb);
  delete require.cache[fulfillmentPath];
  const controller = require("../controllers/staff/pos.fulfillment");

  const futureDate = getFuturePhilippineDateKey();
  const validCreateBody = {
    order_id: "10",
    driver_id: "20",
    address: "Canonical Delivery Address",
    scheduled_date: futureDate,
    notes: "",
  };

  reset();
  let res = makeRes();
  await controller.createDelivery(
    {
      body: {
        ...validCreateBody,
        order_id: [10],
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /order_id/i);
  assert.equal(getConnectionCount, 0);

  reset();
  res = makeRes();
  await controller.createDelivery(
    {
      body: {
        ...validCreateBody,
        unexpected_field: "must reject",
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /unsupported/i);
  assert.equal(getConnectionCount, 0);

  reset();
  res = makeRes();
  await controller.createDelivery(
    {
      body: {
        ...validCreateBody,
        notes: { invalid: true },
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /notes/i);
  assert.equal(getConnectionCount, 0);

  reset({ kind: "create", futureDate, order: { ...baseOrder(), status: "pending" } });
  res = makeRes();
  await controller.createDelivery(
    {
      body: validCreateBody,
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 409);
  assert.match(res.body?.message || "", /not eligible/i);
  assert.equal(
    dbCalls.some((call) => call.sql?.includes("INSERT INTO deliveries")),
    false,
  );

  reset({
    kind: "create",
    futureDate,
    order: { ...baseOrder(), fulfillment_method: "pickup" },
  });
  res = makeRes();
  await controller.createDelivery(
    {
      body: validCreateBody,
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 409);
  assert.match(res.body?.message || "", /pickup/i);

  reset({
    kind: "create",
    futureDate,
    order: {
      ...baseOrder(),
      payment_method: "cop",
      fulfillment_method: null,
    },
  });
  res = makeRes();
  await controller.createDelivery(
    {
      body: validCreateBody,
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 409);
  assert.match(res.body?.message || "", /pickup/i);
  assert.equal(
    dbCalls.some((call) => call.sql?.includes("INSERT INTO deliveries")),
    false,
  );

  reset();
  res = makeRes();
  await controller.createDelivery(
    {
      body: {
        ...validCreateBody,
        notes: "n".repeat(2001),
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /notes/i);
  assert.equal(getConnectionCount, 0);

  reset({ kind: "create", futureDate });
  res = makeRes();
  await controller.createDelivery(
    {
      body: {
        ...validCreateBody,
        address: "Tampered Address",
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 409);
  assert.match(res.body?.message || "", /saved order address/i);
  assert.equal(
    dbCalls.some((call) => call.sql?.includes("INSERT INTO deliveries")),
    false,
  );

  reset({
    kind: "create",
    futureDate,
    rider: {
      ...activeRider(),
      is_active: 0,
    },
  });
  res = makeRes();
  await controller.createDelivery(
    {
      body: validCreateBody,
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /inactive|not found/i);
  const createRiderLock = dbCalls.find(
    (call) =>
      call.sql?.includes("FROM users") &&
      call.sql?.includes("FOR UPDATE"),
  );
  assert.ok(createRiderLock, "createDelivery must revalidate rider FOR UPDATE");

  reset({ kind: "create", futureDate });
  res = makeRes();
  await controller.createDelivery(
    {
      body: {
        ...validCreateBody,
        address: "  Canonical Delivery Address  ",
      },
      user: { id: 99, role: "admin", name: "Admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 201);
  assert.ok(insertedDeliveryParams);
  assert.equal(insertedDeliveryParams[4], "Canonical Delivery Address");

  reset({ kind: "list" });
  res = makeRes();
  await controller.getDeliverableOrders(
    {
      user: { id: 99, role: "admin" },
      query: {},
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.body.map((row) => row.order_number),
    ["ELIGIBLE"],
  );

  reset();
  res = makeRes();
  await controller.rescheduleDelivery(
    {
      params: { id: [30] },
      body: {
        driver_id: "20",
        scheduled_date: futureDate,
        reschedule_reason: "Customer requested another date.",
        notes: "",
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /invalid failed delivery id/i);
  assert.equal(getConnectionCount, 0);

  reset({
    kind: "reschedule",
    order: {
      ...baseOrder(),
      status: "shipping",
      payment_method: "cop",
      fulfillment_method: null,
    },
  });
  res = makeRes();
  await controller.rescheduleDelivery(
    {
      params: { id: "30" },
      body: {
        driver_id: "20",
        scheduled_date: futureDate,
        reschedule_reason: "Customer requested another date.",
        notes: "",
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 409);
  assert.match(res.body?.message || "", /pickup/i);
  assert.equal(
    dbCalls.some((call) => call.sql?.includes("INSERT INTO deliveries")),
    false,
  );

  reset({
    kind: "reschedule",
    rider: {
      ...activeRider(),
      is_active: 0,
    },
  });
  res = makeRes();
  await controller.rescheduleDelivery(
    {
      params: { id: "30" },
      body: {
        driver_id: "20",
        scheduled_date: futureDate,
        reschedule_reason: "Customer requested another date.",
        notes: "",
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /inactive|not found/i);
  const rescheduleRiderLock = dbCalls.find(
    (call) =>
      call.sql?.includes("FROM users") &&
      call.sql?.includes("FOR UPDATE"),
  );
  assert.ok(
    rescheduleRiderLock,
    "rescheduleDelivery must revalidate rider FOR UPDATE",
  );

  reset();
  res = makeRes();
  await controller.reassignDeliveryRider(
    {
      params: { id: "50" },
      body: {
        driver_id: "21",
        reassignment_reason: "Rider unavailable.",
        extra: true,
      },
      user: { id: 99, role: "admin" },
      app: { get() { return null; } },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /unsupported/i);
  assert.equal(getConnectionCount, 0);

  console.log("✅ Delivery scheduling integrity tests passed.");
}

run()
  .catch((error) => {
    console.error("❌ Delivery scheduling integrity tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);
