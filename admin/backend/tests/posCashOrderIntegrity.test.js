const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const receiptServicePath = require.resolve("../services/receiptService");
const ordersControllerPath = require.resolve("../controllers/staff/pos.orders");

const originals = new Map(
  [dbPath, receiptServicePath, ordersControllerPath].map((modulePath) => [
    modulePath,
    require.cache[modulePath],
  ]),
);

let mode = "valid";
let connectionCount = 0;
let calls = [];
let receiptArgs = null;

const canonicalProduct = {
  id: 7,
  name: "Canonical Chair",
  walkin_price: "4300.00",
  production_cost: "2000.00",
  type: "standard",
  is_active: 1,
  stock: 5,
  reorder_point: 1,
  display_stock: 5,
};

const existingCashOrder = (overrides = {}) => ({
  id: 900,
  order_number: "WLK-20260929-1111",
  type: "walkin",
  order_type: "standard",
  status: "completed",
  payment_method: "cash",
  payment_status: "paid",
  walkin_customer_name: "Test Customer",
  walkin_customer_phone: "09171234567",
  discount: "0.00",
  delivery_fee: "0.00",
  total: "8600.00",
  notes: null,
  delivery_address: null,
  delivery_lat: null,
  delivery_lng: null,
  requested_delivery_date_text: null,
  delivery_request_notes: null,
  receipt_id: 903,
  receipt_number: "OR-TEST",
  issued_by: 42,
  cash_received: "9000.00",
  change_amount: "400.00",
  ...overrides,
});

const conn = {
  async beginTransaction() {
    calls.push({ type: "begin" });
  },
  async commit() {
    calls.push({ type: "commit" });
  },
  async rollback() {
    calls.push({ type: "rollback" });
  },
  release() {
    calls.push({ type: "release" });
  },
  async query(sql, params = []) {
    const text = String(sql);
    calls.push({ type: "query", sql: text, params: [...params] });

    if (text.includes("SELECT id FROM users WHERE id = ? FOR UPDATE")) {
      return [[{ id: 42 }]];
    }

    if (text.includes("WHERE o.checkout_idempotency_key = ?")) {
      if (mode === "replay" || mode === "replay_conflict") {
        return [[existingCashOrder()]];
      }
      if (mode === "replay_other_cashier") {
        return [[existingCashOrder({ issued_by: 99 })]];
      }
      return [[]];
    }

    if (text.includes("FROM order_items") && text.includes("FOR UPDATE")) {
      return [[{ product_id: 7, quantity: 2 }]];
    }

    if (text.includes("FROM products p") && text.includes("FOR UPDATE")) {
      if (mode === "missing_product") return [[]];
      return [[{
        ...canonicalProduct,
        is_active: mode === "inactive" ? 0 : 1,
        type: mode === "blueprint" ? "blueprint" : "standard",
        display_stock: mode === "display_low" ? 1 : 5,
        stock: mode === "total_low" ? 1 : 5,
      }]];
    }

    if (text.includes("SELECT id FROM orders WHERE order_number = ?")) {
      return [[]];
    }

    if (text.includes("INSERT INTO orders")) {
      return [{ insertId: 900 }];
    }

    if (text.includes("INSERT INTO order_items")) {
      return [{ insertId: 901 }];
    }

    if (text.includes("UPDATE ready_made_display_stock")) {
      return [{ affectedRows: mode === "display_race" ? 0 : 1 }];
    }

    if (text.includes("UPDATE products") && text.includes("stock = stock -")) {
      return [{ affectedRows: mode === "total_race" ? 0 : 1 }];
    }

    if (text.includes("UPDATE products") && text.includes("stock_status")) {
      return [{ affectedRows: 1 }];
    }

    if (text.includes("INSERT INTO stock_movements")) {
      return [{ insertId: 1 }];
    }

    if (text.includes("INSERT INTO payment_transactions")) {
      return [{ insertId: 902 }];
    }

    throw new Error(`Unexpected SQL in test: ${text}`);
  },
};

const mockDb = {
  async getConnection() {
    connectionCount += 1;
    if (mode === "connection_error") {
      throw new Error("sensitive connection detail");
    }
    return conn;
  },
  async query() {
    throw new Error("Pool query was not expected in createOrder tests.");
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

function makeRequest(body, key = "pos_cash_test_key") {
  return {
    body,
    user: { id: 42, role: "staff", staff_type: "cashier" },
    get(name) {
      return name === "Idempotency-Key" ? key : undefined;
    },
    app: { get() { return null; } },
  };
}

function validBody(overrides = {}) {
  return {
    customer_name: "Test Customer",
    customer_phone: "09171234567",
    payment_method: "cash",
    cash_received: "9000.00",
    discount: "0.00",
    delivery_fee: "0.00",
    expected_total: "8600.00",
    notes: "",
    items: [{ product_id: 7, quantity: 2 }],
    delivery: null,
    ...overrides,
  };
}

function getPhilippineDateTimeLocal(minutesOffset = 0) {
  const shifted = new Date(
    Date.now() +
      8 * 60 * 60 * 1000 +
      minutesOffset * 60 * 1000,
  );
  const pad2 = (value) => String(value).padStart(2, "0");

  return [
    String(shifted.getUTCFullYear()).padStart(4, "0"),
    "-",
    pad2(shifted.getUTCMonth() + 1),
    "-",
    pad2(shifted.getUTCDate()),
    "T",
    pad2(shifted.getUTCHours()),
    ":",
    pad2(shifted.getUTCMinutes()),
  ].join("");
}

function reset(nextMode = "valid") {
  mode = nextMode;
  connectionCount = 0;
  calls = [];
  receiptArgs = null;
}

function hasSql(fragment) {
  return calls.some((call) => call.sql?.includes(fragment));
}

async function run() {
  install(dbPath, mockDb);
  install(receiptServicePath, {
    createPosSaleReceipt: async (unusedConn, args) => {
      receiptArgs = args;
      if (mode === "receipt_error") {
        throw new Error("sensitive receipt detail");
      }
      return { receiptId: 903, receiptNumber: args.receiptNumber };
    },
  });
  delete require.cache[ordersControllerPath];
  const controller = require("../controllers/staff/pos.orders");

  // Required idempotency key is validated before any DB work.
  reset();
  let res = makeRes();
  await controller.createOrder(makeRequest(validBody(), null), res);
  assert.equal(res.statusCode, 400);
  assert.equal(connectionCount, 0);

  // Client-supplied price/cost/name are fail-closed instead of trusted.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({
      items: [{ product_id: 7, quantity: 2, unit_price: 1, product_name: "Forged" }],
    })),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(connectionCount, 0);

  // Unsupported/dead payload branches are rejected before touching the DB.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({ appointment: { purpose: "consultation" } })),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(connectionCount, 0);

  // Customer name and phone validation mirror the DB/business boundary.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({ customer_name: "x".repeat(151) })),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(connectionCount, 0);

  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({ customer_phone: "123" })),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(connectionCount, 0);

  // Pickup/non-delivery may omit phone; the server still creates a valid sale.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({ customer_phone: "" })),
    res,
  );
  assert.equal(res.statusCode, 200);
  const pickupOrderInsert = calls.find((call) => call.sql?.includes("INSERT INTO orders"));
  assert.ok(pickupOrderInsert);
  assert.equal(pickupOrderInsert.params[2], null);

  // Money is strict: negatives, exponent form and >2-decimal inputs fail closed.
  for (const override of [
    { cash_received: "9000.001" },
    { cash_received: "-1.00" },
    { cash_received: "9e3" },
    { discount: "-1.00" },
    { delivery_fee: "1.001" },
  ]) {
    reset();
    res = makeRes();
    await controller.createOrder(makeRequest(validBody(override)), res);
    assert.equal(res.statusCode, 400);
    assert.equal(connectionCount, 0);
  }

  // Delivery fee cannot be charged without delivery.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({ delivery_fee: "100.00", expected_total: "8700.00" })),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(connectionCount, 0);

  // Delivery requires phone, real coordinates and a real calendar datetime.
  const baseDelivery = {
    address: "Test Address",
    lat: 15.1,
    lng: 120.6,
    requested_date: getPhilippineDateTimeLocal(24 * 60),
    notes: "",
  };

  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({
      customer_phone: "",
      delivery_fee: "100.00",
      expected_total: "8700.00",
      delivery: baseDelivery,
    })),
    res,
  );
  assert.equal(res.statusCode, 400);

  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({
      delivery_fee: "100.00",
      expected_total: "8700.00",
      delivery: { ...baseDelivery, lat: 91 },
    })),
    res,
  );
  assert.equal(res.statusCode, 400);

  // Coordinates must be genuine JSON numbers. Reject values that Number(...)
  // would otherwise coerce into apparently valid coordinates.
  const coercibleCoordinatePayloads = [
    { lat: "15.1", lng: 120.6 },
    { lat: " ", lng: 120.6 },
    { lat: true, lng: 120.6 },
    { lat: false, lng: 120.6 },
    { lat: [], lng: 120.6 },
    { lat: {}, lng: 120.6 },
    { lat: 15.1, lng: "120.6" },
  ];

  for (const coordinates of coercibleCoordinatePayloads) {
    reset();
    res = makeRes();
    await controller.createOrder(
      makeRequest(validBody({
        delivery_fee: "100.00",
        expected_total: "8700.00",
        delivery: { ...baseDelivery, ...coordinates },
      })),
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(connectionCount, 0);
    assert.ok(!hasSql("INSERT INTO orders"));
  }

  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({
      delivery_fee: "100.00",
      expected_total: "8700.00",
      delivery: { ...baseDelivery, requested_date: "2026-02-30T10:00" },
    })),
    res,
  );
  assert.equal(res.statusCode, 400);

  // A syntactically valid but already-past Philippine delivery request
  // must fail before a DB connection is acquired.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({
      delivery_fee: "100.00",
      expected_total: "8700.00",
      delivery: {
        ...baseDelivery,
        requested_date: getPhilippineDateTimeLocal(-60),
      },
    })),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /past/i);
  assert.equal(connectionCount, 0);
  assert.ok(!hasSql("INSERT INTO orders"));

  // A future Philippine wall-clock request remains valid and is stored
  // without UTC/local timezone conversion.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({
      delivery_fee: "100.00",
      expected_total: "8700.00",
      delivery: baseDelivery,
    })),
    res,
  );
  assert.equal(res.statusCode, 200);
  const futureDeliveryInsert = calls.find((call) =>
    call.sql?.includes("INSERT INTO orders"),
  );
  assert.ok(futureDeliveryInsert);
  assert.equal(
    futureDeliveryInsert.params[13],
    `${baseDelivery.requested_date.replace("T", " ")}:00`,
  );

  // Stored product eligibility is enforced on the server.
  for (const nextMode of ["inactive", "blueprint"]) {
    reset(nextMode);
    res = makeRes();
    await controller.createOrder(makeRequest(validBody()), res);
    assert.equal(res.statusCode, 409);
    assert.ok(hasSql("ROLLBACK") === false); // rollback is tracked as a call type, not SQL.
    assert.ok(calls.some((call) => call.type === "rollback"));
    assert.ok(!hasSql("INSERT INTO orders"));
  }

  reset("missing_product");
  res = makeRes();
  await controller.createOrder(makeRequest(validBody()), res);
  assert.equal(res.statusCode, 404);
  assert.ok(!hasSql("INSERT INTO orders"));

  // Stock prechecks reject known insufficient stock before any order write.
  for (const nextMode of ["display_low", "total_low"]) {
    reset(nextMode);
    res = makeRes();
    await controller.createOrder(makeRequest(validBody()), res);
    assert.equal(res.statusCode, 409);
    assert.ok(!hasSql("INSERT INTO orders"));
  }

  // Duplicate product lines are canonicalized to one quantity before stock/write logic.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({
      items: [
        { product_id: 7, quantity: 1 },
        { product_id: "7", quantity: "1" },
      ],
    })),
    res,
  );
  assert.equal(res.statusCode, 200);
  const duplicateItemInserts = calls.filter((call) => call.sql?.includes("INSERT INTO order_items"));
  assert.equal(duplicateItemInserts.length, 1);
  assert.equal(duplicateItemInserts[0].params[3], 2);

  // Discount cannot exceed the canonical server subtotal.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({ discount: "8600.01", expected_total: "0.00" })),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.ok(!hasSql("INSERT INTO orders"));

  // Stale/tampered client total cannot silently complete a sale.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({ expected_total: "2.00" })),
    res,
  );
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.pricing_changed, true);
  assert.ok(!hasSql("INSERT INTO orders"));

  // Cash below the canonical total is rejected after canonical pricing.
  reset();
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({ cash_received: "8599.99" })),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.ok(!hasSql("INSERT INTO orders"));

  // Valid sale uses canonical DB name, price and cost consistently.
  reset();
  res = makeRes();
  await controller.createOrder(makeRequest(validBody()), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 8600);
  assert.equal(res.body.change, 400);
  const itemInsert = calls.find((call) => call.sql?.includes("INSERT INTO order_items"));
  assert.ok(itemInsert);
  assert.deepEqual(itemInsert.params, [900, 7, "Canonical Chair", 2, "4300.00", "2000.00"]);
  const paymentInsert = calls.find((call) => call.sql?.includes("INSERT INTO payment_transactions"));
  assert.ok(paymentInsert);
  assert.equal(paymentInsert.params[1], "8600.00");
  assert.ok(receiptArgs);
  assert.equal(receiptArgs.totalAmount, "8600.00");
  assert.equal(receiptArgs.cashReceived, "9000.00");
  assert.equal(receiptArgs.changeAmount, "400.00");
  const snapshot = JSON.parse(receiptArgs.itemsSnapshot);
  assert.equal(snapshot[0].product_name, "Canonical Chair");
  assert.equal(snapshot[0].unit_price, "4300.00");
  assert.equal(snapshot[0].production_cost, "2000.00");

  // Guarded decrement races roll the whole transaction back before payment/receipt.
  for (const nextMode of ["display_race", "total_race"]) {
    reset(nextMode);
    res = makeRes();
    await controller.createOrder(makeRequest(validBody()), res);
    assert.equal(res.statusCode, 409);
    assert.ok(calls.some((call) => call.type === "rollback"));
    assert.ok(!hasSql("INSERT INTO payment_transactions"));
    assert.equal(receiptArgs, null);
  }

  // Receipt failure must roll back every write and never leak raw internals to the client.
  reset("receipt_error");
  res = makeRes();
  await controller.createOrder(makeRequest(validBody()), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Server error." });
  assert.ok(calls.some((call) => call.type === "rollback"));

  // Connection acquisition failure is sanitized and does not try to use an absent connection.
  reset("connection_error");
  res = makeRes();
  await controller.createOrder(makeRequest(validBody()), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Server error." });

  // Same idempotency key + same request replays the completed sale with no new writes.
  reset("replay");
  res = makeRes();
  await controller.createOrder(makeRequest(validBody()), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.idempotent_replay, true);
  assert.equal(res.body.order_id, 900);
  assert.ok(!hasSql("INSERT INTO orders"));
  assert.equal(receiptArgs, null);

  // Same owned key with changed details returns the already-committed sale for safe UI reconciliation.
  reset("replay_conflict");
  res = makeRes();
  await controller.createOrder(
    makeRequest(validBody({ customer_name: "Different Customer" })),
    res,
  );
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.idempotency_conflict, true);
  assert.equal(res.body.existing_order?.order_id, 900);
  assert.equal(res.body.existing_order?.receipt_id, 903);
  assert.equal(res.body.existing_order?.cart_preserved, true);
  assert.equal(res.body.existing_order?.reconciled_cash_retry, true);
  assert.ok(!hasSql("INSERT INTO orders"));

  // A stale key owned by another cashier is not disclosed; the client may safely mint a new local key.
  reset("replay_other_cashier");
  res = makeRes();
  await controller.createOrder(makeRequest(validBody()), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.reset_idempotency_key, true);
  assert.equal(res.body.existing_order, undefined);
  assert.ok(!hasSql("INSERT INTO orders"));

  console.log("✅ POS cash transaction integrity tests passed.");
}

run()
  .catch((error) => {
    console.error("❌ POS cash transaction integrity tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);
