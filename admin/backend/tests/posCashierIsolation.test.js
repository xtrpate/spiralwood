const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const receiptServicePath = require.resolve("../services/receiptService");
const ordersControllerPath = require.resolve("../controllers/staff/pos.orders");
const receiptsControllerPath = require.resolve("../controllers/staff/pos.receipts");

const originalCache = new Map(
  [dbPath, receiptServicePath, ordersControllerPath, receiptsControllerPath].map(
    (modulePath) => [modulePath, require.cache[modulePath]],
  ),
);

const calls = [];

const mockDb = {
  async query(sql, params = []) {
    const text = String(sql);
    calls.push({ sql: text, params: [...params] });

    if (text.includes("COUNT(DISTINCT o.id) AS total")) {
      return [[{ total: 0 }]];
    }

    if (text.includes("SELECT o.*, r.receipt_number")) {
      return [[{ id: Number(params[params.length - 1]), items_snapshot: '[{"product_name":"Test Item","quantity":1,"unit_price":"1.00"}]', total_amount: "1.00", payment_method: "cash" }]];
    }

    if (text.includes("FROM order_items")) {
      return [[]];
    }

    if (
      text.includes("FROM receipts r") &&
      text.includes("WHERE r.id = ?") &&
      text.includes("r.receipt_type = 'pos_sale'")
    ) {
      return [[{ id: Number(params[0]), items_snapshot: '[{"product_name":"Test Item","quantity":1,"unit_price":"1.00"}]', total_amount: "1.00", payment_method: "cash" }]];
    }

    if (
      text.includes("FROM receipts r") &&
      text.includes("WHERE r.order_id = ?") &&
      text.includes("r.receipt_type = 'pos_sale'")
    ) {
      return [[{ id: 9001, order_id: Number(params[0]), items_snapshot: '[{"product_name":"Test Item","quantity":1,"unit_price":"1.00"}]', total_amount: "1.00", payment_method: "cash" }]];
    }

    if (text.includes("FROM website_content")) {
      return [[]];
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
  delete require.cache[receiptsControllerPath];

  const ordersController = require("../controllers/staff/pos.orders");
  const receiptsController = require("../controllers/staff/pos.receipts");

  const cashier = {
    id: 42,
    role: "staff",
    staff_type: "cashier",
  };

  const admin = {
    id: 1,
    role: "admin",
    staff_type: null,
  };

  // Cashier list: both data and count queries must be owned by this cashier.
  resetCalls();
  await ordersController.getOrders(
    { user: cashier, query: {} },
    makeRes(),
  );

  const cashierList = firstCallContaining(
    "SELECT o.id, o.order_number, o.walkin_customer_name",
  );
  const cashierCount = firstCallContaining("COUNT(DISTINCT o.id) AS total");

  assert.match(cashierList.sql, /SELECT MAX\(r2\.id\)/);
  assert.match(cashierList.sql, /r2\.receipt_type = 'pos_sale'/);
  assert.match(cashierList.sql, /r2\.issued_by = \?/);
  assert.match(cashierList.sql, /r\.id IS NOT NULL/);
  assert.deepEqual(cashierList.params, [42, 20, 0]);
  assert.match(cashierCount.sql, /SELECT MAX\(r2\.id\)/);
  assert.match(cashierCount.sql, /r2\.issued_by = \?/);
  assert.deepEqual(cashierCount.params, [42]);

  // Searching an older receipt number must still find the order while the
  // displayed receipt remains the deterministic latest receipt for that owner.
  resetCalls();
  await ordersController.getOrders(
    { user: cashier, query: { search: "OR-OLD-100" } },
    makeRes(),
  );

  const cashierSearchList = firstCallContaining(
    "SELECT o.id, o.order_number, o.walkin_customer_name",
  );
  const cashierSearchCount = firstCallContaining(
    "COUNT(DISTINCT o.id) AS total",
  );
  assert.match(cashierSearchList.sql, /FROM receipts r_search/);
  assert.match(cashierSearchList.sql, /r_search\.receipt_number LIKE \?/);
  assert.match(cashierSearchList.sql, /r_search\.issued_by = \?/);
  assert.deepEqual(cashierSearchList.params, [
    42,
    "%OR-OLD-100%",
    "%OR-OLD-100%",
    "%OR-OLD-100%",
    42,
    20,
    0,
  ]);
  assert.match(cashierSearchCount.sql, /FROM receipts r_search/);
  assert.match(cashierSearchCount.sql, /r_search\.issued_by = \?/);
  assert.deepEqual(cashierSearchCount.params, [
    42,
    "%OR-OLD-100%",
    "%OR-OLD-100%",
    "%OR-OLD-100%",
    42,
  ]);

  // Admin list remains global.
  resetCalls();
  await ordersController.getOrders(
    { user: admin, query: {} },
    makeRes(),
  );

  const adminList = firstCallContaining(
    "SELECT o.id, o.order_number, o.walkin_customer_name",
  );
  const adminCount = firstCallContaining("COUNT(DISTINCT o.id) AS total");

  assert.match(adminList.sql, /SELECT MAX\(r2\.id\)/);
  assert.match(adminList.sql, /r2\.receipt_type = 'pos_sale'/);
  assert.doesNotMatch(adminList.sql, /r2\.issued_by = \?/);
  assert.deepEqual(adminList.params, [20, 0]);
  assert.match(adminCount.sql, /SELECT MAX\(r2\.id\)/);
  assert.doesNotMatch(adminCount.sql, /r2\.issued_by = \?/);
  assert.deepEqual(adminCount.params, []);

  resetCalls();
  await ordersController.getOrders(
    { user: admin, query: { search: "OR-OLD-100" } },
    makeRes(),
  );
  const adminSearchList = firstCallContaining(
    "SELECT o.id, o.order_number, o.walkin_customer_name",
  );
  const adminSearchCount = firstCallContaining(
    "COUNT(DISTINCT o.id) AS total",
  );
  assert.match(adminSearchList.sql, /FROM receipts r_search/);
  assert.match(adminSearchList.sql, /r_search\.receipt_number LIKE \?/);
  assert.doesNotMatch(adminSearchList.sql, /r_search\.issued_by = \?/);
  assert.deepEqual(adminSearchList.params, [
    "%OR-OLD-100%",
    "%OR-OLD-100%",
    "%OR-OLD-100%",
    20,
    0,
  ]);
  assert.doesNotMatch(adminSearchCount.sql, /r_search\.issued_by = \?/);
  assert.deepEqual(adminSearchCount.params, [
    "%OR-OLD-100%",
    "%OR-OLD-100%",
    "%OR-OLD-100%",
  ]);

  // Cashier direct order detail must also be owned by the cashier.
  resetCalls();
  await ordersController.getOrderById(
    { user: cashier, params: { id: "77" } },
    makeRes(),
  );

  const cashierOrderDetail = firstCallContaining("SELECT o.*, r.receipt_number");
  assert.match(cashierOrderDetail.sql, /SELECT MAX\(r2\.id\)/);
  assert.match(cashierOrderDetail.sql, /r2\.receipt_type = 'pos_sale'/);
  assert.match(cashierOrderDetail.sql, /r2\.issued_by = \?/);
  assert.match(cashierOrderDetail.sql, /r\.id IS NOT NULL/);
  assert.deepEqual(cashierOrderDetail.params, [42, 77]);

  // Admin direct order detail remains unrestricted.
  resetCalls();
  await ordersController.getOrderById(
    { user: admin, params: { id: "77" } },
    makeRes(),
  );

  const adminOrderDetail = firstCallContaining("SELECT o.*, r.receipt_number");
  assert.match(adminOrderDetail.sql, /SELECT MAX\(r2\.id\)/);
  assert.match(adminOrderDetail.sql, /r2\.receipt_type = 'pos_sale'/);
  assert.doesNotMatch(adminOrderDetail.sql, /r2\.issued_by = \?/);
  assert.deepEqual(adminOrderDetail.params, [77]);

  // Cashier receipt-by-id must be owned by the cashier.
  resetCalls();
  await receiptsController.getReceiptById(
    { user: cashier, params: { id: "88" } },
    makeRes(),
  );

  const cashierReceiptById = firstCallContaining("WHERE r.id = ?");
  assert.match(cashierReceiptById.sql, /r\.issued_by = \?/);
  assert.deepEqual(cashierReceiptById.params, [88, 42]);

  // Admin receipt-by-id remains unrestricted.
  resetCalls();
  await receiptsController.getReceiptById(
    { user: admin, params: { id: "88" } },
    makeRes(),
  );

  const adminReceiptById = firstCallContaining("WHERE r.id = ?");
  assert.doesNotMatch(adminReceiptById.sql, /r\.issued_by = \?/);
  assert.deepEqual(adminReceiptById.params, [88]);

  // Cashier receipt-by-order must be owned by the cashier.
  resetCalls();
  await receiptsController.getReceiptByOrderId(
    { user: cashier, query: { order_id: "99" } },
    makeRes(),
  );

  const cashierReceiptByOrder = firstCallContaining("WHERE r.order_id = ?");
  assert.match(cashierReceiptByOrder.sql, /r\.issued_by = \?/);
  assert.deepEqual(cashierReceiptByOrder.params, [99, 42]);

  // Admin receipt-by-order remains unrestricted.
  resetCalls();
  await receiptsController.getReceiptByOrderId(
    { user: admin, query: { order_id: "99" } },
    makeRes(),
  );

  const adminReceiptByOrder = firstCallContaining("WHERE r.order_id = ?");
  assert.doesNotMatch(adminReceiptByOrder.sql, /r\.issued_by = \?/);
  assert.deepEqual(adminReceiptByOrder.params, [99]);

  console.log("✅ POS cashier transaction isolation tests passed.");
}

run()
  .catch((error) => {
    console.error("❌ POS cashier transaction isolation tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    restoreCache();
  });
