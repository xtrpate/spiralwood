"use strict";

// WISDOM Blueprint Cash at Store: isolated, in-memory transaction tests.
// No MySQL, HTTP requests, real user accounts, or real payment recording.
const assert = require("node:assert/strict");

const lifecyclePath = require.resolve("../services/blueprintLifecycleService");
const cancellationPath = require.resolve("../services/blueprintCancellationPolicy");
const receiptPath = require.resolve("../services/blueprintReceiptService");
const paymentPath = require.resolve("../services/blueprintCashPaymentService");
const originalCache = new Map(
  [lifecyclePath, cancellationPath, receiptPath, paymentPath].map((path) => [
    path,
    require.cache[path],
  ]),
);

const TOTAL = "60928.00";
const MINIMUM = "18278.40";
const REMAINING = "42649.60";
let fixture = null;

const clone = (value) => JSON.parse(JSON.stringify(value));
const createFixture = (overrides = {}) => {
  const state = {
    order: {
      id: 621,
      order_number: "MOCK-SWS-20261014-0001",
      order_type: "blueprint",
      status: "confirmed",
      payment_status: "unpaid",
      payment_method: "cash",
      fulfillment_method: "delivery",
      total: TOTAL,
      paymongo_session_id: null,
      payment_url: null,
      ...overrides.order,
    },
    estimation: { id: 700, status: "approved", ...overrides.estimation },
    contract: { signed_at: "2026-10-14 08:23:00", ...overrides.contract },
    payments: clone(overrides.payments || []),
    receipts: [],
    nextPaymentId: 901,
    nextReceiptId: 1001,
  };
  let snapshots = null;
  const history = [];
  const flags = {
    failUpdate: Boolean(overrides.failUpdate),
    failReceipt: Boolean(overrides.failReceipt),
  };
  const conn = {
    async beginTransaction() {
      assert.equal(snapshots, null, "Nested transactions are not expected");
      snapshots = clone(state);
      history.push("begin");
    },
    async commit() {
      assert.notEqual(snapshots, null, "Commit requires a transaction");
      snapshots = null;
      history.push("commit");
    },
    async rollback() {
      assert.notEqual(snapshots, null, "Rollback requires a transaction");
      const saved = snapshots;
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, saved);
      snapshots = null;
      history.push("rollback");
    },
    release() {
      history.push("release");
    },
    async query(sql, params = []) {
      const statement = String(sql).replace(/\s+/g, " ");
      if (/FROM payment_transactions/i.test(statement)) {
        assert.equal(params[0], state.order.id);
        return [clone(state.payments)];
      }
      if (/FROM orders/i.test(statement)) {
        assert.equal(params[0], state.order.id);
        return [[clone(state.order)]];
      }
      throw new Error(`Unexpected query in mock: ${statement.slice(0, 140)}`);
    },
    async execute(sql, params = []) {
      const statement = String(sql).replace(/\s+/g, " ");
      if (/INSERT INTO payment_transactions/i.test(statement)) {
        const [orderId, amount, cashierId] = params;
        assert.equal(orderId, state.order.id);
        assert.equal(cashierId, 71);
        const id = state.nextPaymentId++;
        state.payments.push({
          id,
          amount,
          payment_method: "cash",
          status: "verified",
        });
        history.push("payment_insert");
        return [{ affectedRows: 1, insertId: id }];
      }
      if (/UPDATE orders/i.test(statement)) {
        const [paymentStatus, orderStatus, orderId, oldOrderStatus, oldPayStatus] = params;
        if (
          flags.failUpdate ||
          orderId !== state.order.id ||
          state.order.status !== oldOrderStatus ||
          state.order.payment_status !== oldPayStatus ||
          state.order.paymongo_session_id !== null ||
          state.order.payment_url !== null
        ) {
          return [{ affectedRows: 0 }];
        }
        state.order.payment_status = paymentStatus;
        state.order.status = orderStatus;
        history.push("order_update");
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected execute in mock: ${statement.slice(0, 140)}`);
    },
  };
  return {
    state,
    conn,
    flags,
    history,
    pool: { async getConnection() { history.push("connection"); return conn; } },
  };
};

// Dependency injection happens only in Node's in-process module cache. These
// mocks cannot reach a database; the test uses a pool backed by JS objects.
const inject = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

inject(lifecyclePath, {
  async resolveLifecycleByOrder(_conn, { orderId }) {
    assert.ok(fixture, "Fixture must exist before resolving lifecycle");
    assert.equal(orderId, fixture.state.order.id);
    return {
      status: "OK",
      order: clone(fixture.state.order),
      blueprint: { id: 307, stage: "approved" },
      estimation: clone(fixture.state.estimation),
      contract: clone(fixture.state.contract),
    };
  },
});
inject(cancellationPath, {
  isPostProductionWithdrawal() { return false; },
  async loadApprovedCancellationDecision() { return null; },
});
inject(receiptPath, {
  async ensureReceiptForVerifiedPayment(_conn, { orderId, paymentTransactionId, issuedByUserId }) {
    assert.equal(orderId, fixture.state.order.id);
    assert.equal(issuedByUserId, 71);
    assert.ok(fixture.state.payments.some((row) => row.id === paymentTransactionId));
    fixture.history.push("receipt_attempt");
    if (fixture.flags.failReceipt) throw new Error("SIMULATED_RECEIPT_FAILURE");
    const receiptId = fixture.state.nextReceiptId++;
    const receiptNumber = `MOCK-BP-${receiptId}`;
    fixture.state.receipts.push({ receiptId, receiptNumber, paymentTransactionId });
    return { receiptId, receiptNumber, paymentLabel: "down_payment" };
  },
});

// Loading the production service under test executes pure JS but does not open
// a connection. All externally invoked helpers above have already been mocked.
delete require.cache[paymentPath];
const service = require(paymentPath);

const record = (amountRaw) => service.recordCashPayment({
  pool: fixture.pool,
  orderId: fixture.state.order.id,
  amountRaw,
  verifiedByUserId: 71,
});
const mustBeUnchanged = (before) => {
  assert.deepEqual(fixture.state, before, "Failed request must not change persisted mock state");
  assert.equal(fixture.history.includes("commit"), false, "Failed request must not commit");
};

async function run() {
  const checks = [];
  const test = async (name, execute) => {
    await execute();
    checks.push(name);
    console.log(`PASS: ${name}`);
  };

  await test("cash summary displays 30% minimum and 30/50/100% actions", async () => {
    fixture = createFixture();
    const summary = service.buildPaymentSummaryFromRows({
      order: fixture.state.order,
      estimation: fixture.state.estimation,
      contract: fixture.state.contract,
      paymentRows: fixture.state.payments,
    });
    assert.equal(summary.can_record_payment, true);
    assert.equal(summary.payment_status, "unpaid");
    assert.equal(summary.minimum_required_total, 18278.40);
    assert.equal(summary.remaining_balance, 60928);
    assert.deepEqual(summary.quick_amounts, [18278.40, 30464, 60928]);
  });

  await test("invalid and zero amounts fail before opening a connection", async () => {
    for (const invalid of ["", "0", "-1", "not-money", "18278.401"]) {
      fixture = createFixture();
      const before = clone(fixture.state);
      const result = await record(invalid);
      assert.equal(result.httpStatus, 400, invalid);
      assert.equal(result.body.reason_code, "INVALID_AMOUNT", invalid);
      mustBeUnchanged(before);
      assert.deepEqual(fixture.history, [], invalid);
    }
  });

  await test("payment below 30% is rejected and rolled back", async () => {
    fixture = createFixture();
    const before = clone(fixture.state);
    const result = await record("18278.39");
    assert.equal(result.httpStatus, 400);
    assert.equal(result.body.reason_code, "AMOUNT_BELOW_MINIMUM");
    mustBeUnchanged(before);
    assert.ok(fixture.history.includes("rollback"));
  });

  await test("payment over total is rejected and rolled back", async () => {
    fixture = createFixture();
    const before = clone(fixture.state);
    const result = await record("60928.01");
    assert.equal(result.httpStatus, 400);
    assert.equal(result.body.reason_code, "AMOUNT_EXCEEDS_BALANCE");
    mustBeUnchanged(before);
  });

  await test("unsigned Project Agreement blocks the initial cash payment", async () => {
    fixture = createFixture({ contract: { signed_at: null } });
    const before = clone(fixture.state);
    const result = await record(MINIMUM);
    assert.equal(result.httpStatus, 400);
    assert.equal(result.body.reason_code, "PROJECT_AGREEMENT_NOT_ACCEPTED");
    mustBeUnchanged(before);
  });

  await test("pending payment blocks additional store payment", async () => {
    fixture = createFixture({ payments: [{ id: 880, amount: "500.00", status: "pending", payment_method: "cash" }] });
    const before = clone(fixture.state);
    const result = await record(MINIMUM);
    assert.equal(result.httpStatus, 400);
    assert.equal(result.body.reason_code, "PAYMENT_PENDING_REVIEW");
    mustBeUnchanged(before);
  });

  await test("PayMongo session blocks Cash at Store to prevent channel crossover", async () => {
    fixture = createFixture({ order: { paymongo_session_id: "cs_test_mock_only" } });
    const before = clone(fixture.state);
    const result = await record(MINIMUM);
    assert.equal(result.httpStatus, 400);
    assert.equal(result.body.reason_code, "PAYMONGO_SESSION_PRESENT");
    mustBeUnchanged(before);
  });

  await test("30% cash payment verifies ledger, updates status, creates receipt atomically", async () => {
    fixture = createFixture();
    const result = await record(MINIMUM);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.amount_recorded, 18278.40);
    assert.equal(result.body.verified_total, 18278.40);
    assert.equal(result.body.remaining_balance, 42649.60);
    assert.equal(result.body.payment_status, "partial");
    assert.equal(result.body.order_status, "contract_released");
    assert.equal(result.body.order_status_changed, true);
    assert.equal(fixture.state.order.status, "contract_released");
    assert.equal(fixture.state.order.payment_status, "partial");
    assert.equal(fixture.state.payments.length, 1);
    assert.equal(fixture.state.payments[0].status, "verified");
    assert.equal(fixture.state.payments[0].amount, MINIMUM);
    assert.equal(fixture.state.receipts.length, 1);
    assert.equal(result.body.receipt_id, fixture.state.receipts[0].receiptId);
    assert.ok(fixture.history.indexOf("payment_insert") < fixture.history.indexOf("order_update"));
    assert.ok(fixture.history.indexOf("order_update") < fixture.history.indexOf("receipt_attempt"));
    assert.ok(fixture.history.indexOf("receipt_attempt") < fixture.history.indexOf("commit"));
    assert.equal(fixture.history.filter((x) => x === "commit").length, 1);
    assert.equal(result.auditRecord?.new?.payment_status, "partial");
  });

  await test("remaining balance can complete the already-partial order", async () => {
    fixture = createFixture();
    const first = await record(MINIMUM);
    assert.equal(first.httpStatus, 200);
    const second = await record(REMAINING);
    assert.equal(second.httpStatus, 200);
    assert.equal(second.body.payment_status, "paid");
    assert.equal(second.body.remaining_balance, 0);
    assert.equal(second.body.order_status, "contract_released");
    assert.equal(fixture.state.payments.length, 2);
    assert.equal(fixture.state.receipts.length, 2);
    const totalPaid = fixture.state.payments.reduce((sum, row) => sum + Number(row.amount), 0);
    assert.equal(totalPaid, 60928);
  });

  await test("100% first payment produces Paid and one receipt", async () => {
    fixture = createFixture();
    const result = await record(TOTAL);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.body.payment_status, "paid");
    assert.equal(result.body.remaining_balance, 0);
    assert.equal(result.body.order_status, "contract_released");
    assert.equal(fixture.state.receipts.length, 1);
  });

  await test("fully paid order blocks any further payment", async () => {
    fixture = createFixture();
    const first = await record(TOTAL);
    assert.equal(first.httpStatus, 200);
    const before = clone(fixture.state);
    fixture.history.length = 0;
    const again = await record(MINIMUM);
    assert.equal(again.httpStatus, 400);
    assert.equal(again.body.reason_code, "ALREADY_FULLY_PAID");
    mustBeUnchanged(before);
  });

  await test("stale order update rejects payment without leaving a ledger row", async () => {
    fixture = createFixture({ failUpdate: true });
    const before = clone(fixture.state);
    const result = await record(MINIMUM);
    assert.equal(result.httpStatus, 409);
    mustBeUnchanged(before);
    assert.ok(fixture.history.includes("payment_insert"));
    assert.ok(fixture.history.includes("rollback"));
  });

  await test("receipt failure rolls back verified transaction and status together", async () => {
    fixture = createFixture({ failReceipt: true });
    const before = clone(fixture.state);
    const originalError = console.error;
    const captured = [];
    console.error = (...args) => captured.push(args.map(String).join(" "));
    let result;
    try {
      result = await record(MINIMUM);
    } finally {
      console.error = originalError;
    }
    assert.equal(result.httpStatus, 500);
    assert.ok(captured.some((s) => s.includes("SIMULATED_RECEIPT_FAILURE")));
    mustBeUnchanged(before);
    assert.ok(fixture.history.includes("receipt_attempt"));
    assert.ok(fixture.history.includes("rollback"));
  });

  console.log(`PASS: ${checks.length}/${checks.length} mocked Blueprint Cash at Store payment checks. NO DATABASE ACCESSED.`);
}

const restore = () => {
  for (const [path, original] of originalCache) {
    if (original) require.cache[path] = original;
    else delete require.cache[path];
  }
};

run()
  .catch((error) => {
    console.error("FAIL: Blueprint Cash at Store mock test:", error);
    process.exitCode = 1;
  })
  .finally(restore);
