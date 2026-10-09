const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const paymongoPath = require.resolve("../services/paymongoService");
const emailHelperPath = require.resolve("../utils/emailHelper");
const notificationHelperPath = require.resolve("../utils/notificationHelper");
const auditLogPath = require.resolve("../middleware/auditLog");
const orderStatusSocketPath = require.resolve("../utils/orderStatusSocket");
const receiptServicePath = require.resolve("../services/receiptService");
const controllerPath = require.resolve("../controllers/customer/customer.orders");

const mockedModulePaths = [
  dbPath,
  paymongoPath,
  emailHelperPath,
  notificationHelperPath,
  auditLogPath,
  orderStatusSocketPath,
  receiptServicePath,
  controllerPath,
];

const originals = new Map(
  mockedModulePaths.map((modulePath) => [modulePath, require.cache[modulePath]]),
);

let mode = "valid";
let connectionCount = 0;
let calls = [];
let events = [];

const baseOrder = (overrides = {}) => ({
  id: 501,
  order_number: "SWS-20260930-5001",
  customer_id: 77,
  status: "delivered",
  payment_status: "paid",
  total: "1000.00",
  ...overrides,
});

const baseDelivery = (overrides = {}) => ({
  id: 801,
  order_id: 501,
  status: "delivered",
  driver_id: 159,
  scheduled_date: "2026-09-30",
  ...overrides,
});

const defaultPayments = () => [
  { id: 901, amount: "300.00", status: "verified" },
  { id: 902, amount: "700.00", status: "verified" },
];

function currentOrder() {
  if (mode === "not_found") return null;
  if (mode === "wrong_status") return baseOrder({ status: "shipping" });
  if (mode === "unpaid") return baseOrder({ payment_status: "partial" });
  if (mode === "invalid_total") return baseOrder({ total: "bad-total" });
  if (mode === "already_completed" || mode === "completed_delivery_mismatch") {
    return baseOrder({ status: "completed" });
  }
  return baseOrder();
}

function currentDelivery() {
  if (mode === "no_delivery") return null;
  if (mode === "delivery_mismatch") {
    return baseDelivery({ status: "in_transit" });
  }
  if (mode === "already_completed") {
    return baseDelivery({ status: "completed" });
  }
  if (mode === "completed_delivery_mismatch") {
    return baseDelivery({ status: "delivered" });
  }
  return baseDelivery();
}

function currentPayments() {
  if (mode === "payment_short") {
    return [{ id: 901, amount: "999.99", status: "verified" }];
  }
  if (mode === "invalid_payment") {
    return [{ id: 901, amount: "not-money", status: "verified" }];
  }
  if (mode === "pending_only") {
    return [{ id: 901, amount: "1000.00", status: "pending" }];
  }
  return defaultPayments();
}

const conn = {
  async beginTransaction() {
    calls.push({ type: "begin" });
    events.push("begin");
  },
  async commit() {
    calls.push({ type: "commit" });
    events.push("commit");
  },
  async rollback() {
    calls.push({ type: "rollback" });
    events.push("rollback");
  },
  release() {
    calls.push({ type: "release" });
    events.push("release");
  },
  async query(sql, params = []) {
    const text = String(sql);
    calls.push({ type: "query", sql: text, params: [...params] });

    if (text.includes("FROM orders") && text.includes("FOR UPDATE")) {
      if (mode === "deadlock") {
        const err = new Error("deadlock internals must not leak");
        err.code = "ER_LOCK_DEADLOCK";
        err.errno = 1213;
        throw err;
      }
      const order = currentOrder();
      return [order ? [order] : []];
    }

    if (text.includes("FROM deliveries") && text.includes("FOR UPDATE")) {
      const delivery = currentDelivery();
      return [delivery ? [delivery] : []];
    }

    if (
      text.includes("FROM payment_transactions") &&
      text.includes("FOR UPDATE")
    ) {
      if (mode === "lock_timeout") {
        const err = new Error("lock timeout internals must not leak");
        err.code = "ER_LOCK_WAIT_TIMEOUT";
        err.errno = 1205;
        throw err;
      }
      if (mode === "generic_error") {
        throw new Error("sensitive SQL detail");
      }
      return [currentPayments()];
    }

    if (text.includes("UPDATE orders") && text.includes("status = 'completed'")) {
      return [{ affectedRows: mode === "order_update_race" ? 0 : 1 }];
    }

    if (
      text.includes("UPDATE deliveries") &&
      text.includes("status = 'completed'")
    ) {
      return [{ affectedRows: mode === "delivery_update_race" ? 0 : 1 }];
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
    throw new Error("Pool query must not be used by confirmOrder.");
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

function reset(nextMode = "valid") {
  mode = nextMode;
  connectionCount = 0;
  calls = [];
  events = [];
}

function makeReq(orderId = "501") {
  return {
    params: { id: orderId },
    user: { id: 77, role: "customer" },
    auditRecord: undefined,
    app: {
      get(name) {
        return name === "io" ? { test: true } : null;
      },
    },
  };
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

const hasSql = (fragment) => calls.some((call) => call.sql?.includes(fragment));
const queryIndex = (fragment) =>
  calls.findIndex((call) => call.type === "query" && call.sql.includes(fragment));

async function invoke(controller, nextMode = "valid", orderId = "501") {
  reset(nextMode);
  const req = makeReq(orderId);
  const res = makeRes();
  await controller.confirmOrder(req, res);
  return { req, res };
}

async function invokeSilenced(controller, nextMode, orderId = "501") {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await invoke(controller, nextMode, orderId);
  } finally {
    console.error = originalError;
  }
}

async function run() {
  install(dbPath, mockDb);
  install(paymongoPath, {
    createCheckoutSession: async () => {
      throw new Error("not used");
    },
    retrieveCheckoutSession: async () => {
      throw new Error("not used");
    },
  });
  install(emailHelperPath, {
    getGlobalEmailFooter: async () => "",
    sendBrevoEmail: async () => {},
  });
  install(notificationHelperPath, {
    createNotificationSafe: async () => true,
  });
  install(auditLogPath, {
    writeAuditLogSafe: async () => true,
  });
  install(orderStatusSocketPath, {
    emitOrderStatusUpdate: () => events.push("emit_order"),
    emitOrderCreated: () => events.push("emit_created"),
    emitDeliveryUpdate: () => events.push("emit_delivery"),
  });
  install(receiptServicePath, {
    createStandardOnlineReceipt: async () => ({
      receiptId: 1,
      receiptNumber: "OR-TEST",
    }),
  });

  delete require.cache[controllerPath];
  const controller = require("../controllers/customer/customer.orders");

  // Strict order-id validation must fail before touching the database.
  for (const invalidId of ["185abc", "1e2", "-1", "0", "1.5", "", " "]) {
    const { res } = await invoke(controller, "valid", invalidId);
    assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(invalidId)}`);
    assert.equal(connectionCount, 0);
  }

  // Ownership is enforced inside the locked order query; foreign/missing is 404.
  {
    const { res } = await invoke(controller, "not_found");
    assert.equal(res.statusCode, 404);
    assert.ok(calls.some((call) => call.type === "rollback"));
    assert.ok(!hasSql("UPDATE orders"));
  }

  // Only delivered, fully-settled order summaries can continue.
  for (const nextMode of ["wrong_status", "unpaid"]) {
    const { res } = await invoke(controller, nextMode);
    assert.equal(res.statusCode, 400);
    assert.ok(calls.some((call) => call.type === "rollback"));
    assert.ok(!hasSql("UPDATE orders"));
  }

  // The latest delivery attempt is authoritative for completion.
  for (const nextMode of ["no_delivery", "delivery_mismatch"]) {
    const { res } = await invoke(controller, nextMode);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body?.reason_code, "ORDER_DELIVERY_STATE_MISMATCH");
    assert.ok(!hasSql("UPDATE orders"));
  }

  // A completed/completed retry is idempotent and creates no new audit/socket mutation.
  {
    const { req, res } = await invoke(controller, "already_completed");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.already_confirmed, true);
    assert.equal(req.auditRecord, undefined);
    assert.ok(!hasSql("FROM payment_transactions"));
    assert.ok(!hasSql("UPDATE orders"));
    assert.ok(!events.includes("emit_order"));
    assert.ok(!events.includes("emit_delivery"));
  }

  // A completed order with a non-completed delivery is an integrity conflict, not a fake success.
  {
    const { res } = await invoke(controller, "completed_delivery_mismatch");
    assert.equal(res.statusCode, 409);
    assert.equal(res.body?.reason_code, "ORDER_DELIVERY_STATE_MISMATCH");
  }

  // Payment must be backed by valid verified ledger rows, not just the summary flag.
  for (const nextMode of ["invalid_total", "invalid_payment"]) {
    const { res } = await invoke(controller, nextMode);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body?.reason_code, "PAYMENT_LEDGER_INVALID");
    assert.ok(!hasSql("UPDATE orders"));
  }

  for (const nextMode of ["payment_short", "pending_only"]) {
    const { res } = await invoke(controller, nextMode);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body?.reason_code, "PAYMENT_LEDGER_MISMATCH");
    assert.ok(!hasSql("UPDATE orders"));
  }

  // Valid confirmation locks in canonical order -> delivery -> payment order,
  // updates only the exact latest delivery row, commits once, then emits sockets.
  {
    const { req, res } = await invoke(controller, "valid");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.already_confirmed, false);

    const orderLock = queryIndex("FROM orders");
    const deliveryLock = queryIndex("FROM deliveries");
    const paymentLock = queryIndex("FROM payment_transactions");
    assert.ok(orderLock >= 0 && deliveryLock > orderLock && paymentLock > deliveryLock);

    const orderUpdate = calls.find(
      (call) => call.sql?.includes("UPDATE orders") && call.sql.includes("status = 'completed'"),
    );
    const deliveryUpdate = calls.find(
      (call) => call.sql?.includes("UPDATE deliveries") && call.sql.includes("status = 'completed'"),
    );
    assert.ok(orderUpdate);
    assert.ok(deliveryUpdate);
    assert.deepEqual(deliveryUpdate.params, [801, 501]);

    const commitIndex = events.indexOf("commit");
    const deliveryEmitIndex = events.indexOf("emit_delivery");
    const orderEmitIndex = events.indexOf("emit_order");
    assert.ok(commitIndex >= 0);
    assert.ok(deliveryEmitIndex > commitIndex);
    assert.ok(orderEmitIndex > commitIndex);

    assert.deepEqual(req.auditRecord, {
      id: 501,
      old: { status: "delivered" },
      new: { status: "completed" },
    });
  }

  // Guarded update failures roll back the entire transaction.
  {
    const { res } = await invoke(controller, "order_update_race");
    assert.equal(res.statusCode, 409);
    assert.equal(res.body?.reason_code, "ORDER_CONFIRMATION_CHANGED");
    assert.ok(calls.some((call) => call.type === "rollback"));
    assert.ok(!hasSql("UPDATE deliveries"));
    assert.ok(!calls.some((call) => call.type === "commit"));
  }

  {
    const { res } = await invoke(controller, "delivery_update_race");
    assert.equal(res.statusCode, 409);
    assert.equal(res.body?.reason_code, "ORDER_CONFIRMATION_CHANGED");
    assert.ok(calls.some((call) => call.type === "rollback"));
    assert.ok(!calls.some((call) => call.type === "commit"));
  }

  // Retryable lock conflicts use the shared B2A 409 contract.
  for (const nextMode of ["deadlock", "lock_timeout"]) {
    const { res } = await invoke(controller, nextMode);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body?.reason_code, "CONCURRENT_UPDATE_RETRY");
    assert.match(res.body?.message || "", /refresh/i);
    assert.equal(res.body?.error, undefined);
  }

  // Unexpected DB/connection failures are sanitized and never expose internals.
  for (const nextMode of ["generic_error", "connection_error"]) {
    const { res } = await invokeSilenced(controller, nextMode);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Server error. Please try again." });
  }

  console.log("✅ Customer order confirmation integrity tests passed.");
}

run()
  .catch((error) => {
    console.error("❌ Customer order confirmation integrity tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);
