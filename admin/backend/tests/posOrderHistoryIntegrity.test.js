const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const receiptServicePath = require.resolve("../services/receiptService");
const ordersControllerPath = require.resolve("../controllers/staff/pos.orders");

const originalCache = new Map(
  [dbPath, receiptServicePath, ordersControllerPath].map((modulePath) => [
    modulePath,
    require.cache[modulePath],
  ]),
);

const calls = [];

const mockDb = {
  async query(sql, params = []) {
    const text = String(sql);
    calls.push({ sql: text, params: [...params] });

    if (text.includes("COUNT(DISTINCT o.id) AS total")) {
      return [[{ total: 0 }]];
    }

    return [[]];
  },
};

function installMock(modulePath, exportsValue) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
}

function restoreCache() {
  for (const [modulePath, cached] of originalCache.entries()) {
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

function resetCalls() {
  calls.length = 0;
}

function firstCallContaining(fragment) {
  const call = calls.find((entry) => entry.sql.includes(fragment));
  assert.ok(call, `Expected SQL call containing: ${fragment}`);
  return call;
}

async function run() {
  installMock(dbPath, mockDb);
  installMock(receiptServicePath, {
    createPosSaleReceipt: async () => ({ receiptId: 1 }),
  });
  delete require.cache[ordersControllerPath];

  const ordersController = require("../controllers/staff/pos.orders");
  const cashier = { id: 42, role: "staff", staff_type: "cashier" };

  // Oct 1-2 in the Philippines means [Sep 30 16:00 UTC, Oct 2 16:00 UTC).
  resetCalls();
  const validRes = makeRes();
  await ordersController.getOrders(
    {
      user: cashier,
      query: { from: "2026-10-01", to: "2026-10-02", page: "1", limit: "20" },
    },
    validRes,
  );

  assert.equal(validRes.statusCode, 200);
  const list = firstCallContaining(
    "SELECT o.id, o.order_number, o.walkin_customer_name",
  );
  const count = firstCallContaining("COUNT(DISTINCT o.id) AS total");

  assert.match(list.sql, /o\.created_at >= \?/);
  assert.match(list.sql, /o\.created_at < \?/);
  assert.match(count.sql, /o\.created_at >= \?/);
  assert.match(count.sql, /o\.created_at < \?/);
  assert.doesNotMatch(list.sql, /DATE\(CONVERT_TZ\(o\.created_at/);
  assert.doesNotMatch(count.sql, /DATE\(CONVERT_TZ\(o\.created_at/);
  assert.deepEqual(list.params, [
    42,
    "2026-09-30 16:00:00",
    "2026-10-02 16:00:00",
    20,
    0,
  ]);
  assert.deepEqual(count.params, [
    42,
    "2026-09-30 16:00:00",
    "2026-10-02 16:00:00",
  ]);

  // A one-sided start range must handle the previous UTC calendar year.
  resetCalls();
  const fromOnlyRes = makeRes();
  await ordersController.getOrders(
    { user: cashier, query: { from: "2027-01-01" } },
    fromOnlyRes,
  );
  assert.equal(fromOnlyRes.statusCode, 200);
  const fromOnlyList = firstCallContaining(
    "SELECT o.id, o.order_number, o.walkin_customer_name",
  );
  assert.match(fromOnlyList.sql, /o\.created_at >= \?/);
  assert.doesNotMatch(fromOnlyList.sql, /o\.created_at < \?/);
  assert.deepEqual(fromOnlyList.params, [42, "2026-12-31 16:00:00", 20, 0]);

  // An inclusive local end date becomes the next local midnight, exclusive.
  resetCalls();
  const toOnlyRes = makeRes();
  await ordersController.getOrders(
    { user: cashier, query: { to: "2026-12-31" } },
    toOnlyRes,
  );
  assert.equal(toOnlyRes.statusCode, 200);
  const toOnlyList = firstCallContaining(
    "SELECT o.id, o.order_number, o.walkin_customer_name",
  );
  assert.doesNotMatch(toOnlyList.sql, /o\.created_at >= \?/);
  assert.match(toOnlyList.sql, /o\.created_at < \?/);
  assert.deepEqual(toOnlyList.params, [42, "2026-12-31 16:00:00", 20, 0]);

  resetCalls();
  const reversedRes = makeRes();
  await ordersController.getOrders(
    { user: cashier, query: { from: "2026-10-02", to: "2026-10-01" } },
    reversedRes,
  );
  assert.equal(reversedRes.statusCode, 400);
  assert.equal(reversedRes.body?.message, "Start date cannot be after end date.");
  assert.equal(calls.length, 0);

  resetCalls();
  const invalidCalendarRes = makeRes();
  await ordersController.getOrders(
    { user: cashier, query: { from: "2026-02-31" } },
    invalidCalendarRes,
  );
  assert.equal(invalidCalendarRes.statusCode, 400);
  assert.equal(
    invalidCalendarRes.body?.message,
    "Invalid from date. Use YYYY-MM-DD.",
  );
  assert.equal(calls.length, 0);

  const frontendPath = require.resolve(
    "../../frontend/src/pages/staff/OrderHistory.jsx",
  );
  const cssPath = require.resolve(
    "../../frontend/src/pages/staff/OrderHistory.css",
  );
  const fs = require("node:fs");
  const frontend = fs.readFileSync(frontendPath, "utf8");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.match(frontend, /cashier-history-mobile-list/);
  assert.match(frontend, /maxLength=\{100\}/);
  assert.match(frontend, /Start date cannot be after end date\./);
  assert.match(frontend, /useRef/);
  assert.match(frontend, /requestSequenceRef/);
  assert.match(frontend, /requestId !== requestSequenceRef\.current/);
  assert.match(frontend, /requestId === requestSequenceRef\.current/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /cashier-history-desktop-table[\s\S]*display: none !important/);
  assert.match(css, /cashier-history-search-input[\s\S]*font-size: 16px !important/);
  assert.match(css, /cashier-history-pagination-button[\s\S]*min-height: 44px/);

  console.log("✅ POS transaction history R3A.1 integrity tests passed.");
}

run()
  .catch((error) => {
    console.error("❌ POS transaction history R3A.1 integrity tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    restoreCache();
  });
