const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = require.resolve('../config/db');
const controllerPath = require.resolve('../controllers/staff/pos.receipts');

const originalDbCache = require.cache[dbPath];
const originalControllerCache = require.cache[controllerPath];

let mode = 'legacy';
let calls = [];
let currentReceipt = null;

const baseReceipt = (overrides = {}) => ({
  id: 88,
  order_id: 99,
  payment_transaction_id: 777,
  receipt_type: 'pos_sale',
  payment_method_snapshot: 'cash',
  payment_label: null,
  previous_paid_amount: null,
  amount_paid: null,
  total_paid_after: null,
  remaining_balance_after: null,
  receipt_number: 'OR-TEST-88',
  issued_to: 'Test Customer',
  issued_by: 42,
  total_amount: '10000.00',
  cash_received: '12000.00',
  change_amount: '2000.00',
  items_snapshot: JSON.stringify([
    {
      product_id: 7,
      product_name: 'Test Chair',
      unit_price: '10000.00',
      quantity: 1,
    },
  ]),
  created_at: '2026-09-30T03:00:00.000Z',
  printed_at: '2026-09-30T03:00:00.000Z',
  order_number: 'WLK-TEST-99',
  walkin_customer_name: 'Test Customer',
  walkin_customer_phone: '09171234567',
  payment_method: 'cash',
  subtotal: '10000.00',
  tax: '0.00',
  discount: '0.00',
  delivery_fee: '0.00',
  total: '10000.00',
  notes: null,
  staff_name: 'Cashier Test',
  ...overrides,
});

function reset(nextMode = 'legacy', overrides = {}) {
  mode = nextMode;
  calls = [];
  currentReceipt = baseReceipt(overrides);
}

const mockDb = {
  async query(sql, params = []) {
    const text = String(sql);
    calls.push({ sql: text, params: [...params] });

    if (mode === 'db_error' && text.includes('FROM receipts r')) {
      throw new Error('sensitive database detail');
    }

    if (text.includes("r.receipt_type = 'blueprint_payment'")) {
      return [[]];
    }

    if (text.includes('FROM receipts r')) {
      return [[{ ...currentReceipt }]];
    }

    if (text.includes('FROM website_content')) {
      return [[]];
    }

    throw new Error(`Unexpected SQL in receipt integrity test: ${text}`);
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
  delete require.cache[controllerPath];
  delete require.cache[dbPath];
  if (originalControllerCache) require.cache[controllerPath] = originalControllerCache;
  if (originalDbCache) require.cache[dbPath] = originalDbCache;
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

const cashier = { id: 42, role: 'staff', staff_type: 'cashier' };
const admin = { id: 1, role: 'admin', staff_type: null };

async function run() {
  installMock(dbPath, mockDb);
  delete require.cache[controllerPath];
  const controller = require('../controllers/staff/pos.receipts');

  // Strict receipt IDs must fail before any database query.
  for (const invalidId of ['88abc', '88.0', '8e1', '-1', '0', '', ' ']) {
    reset();
    const res = makeRes();
    await controller.getReceiptById(
      { user: cashier, params: { id: invalidId } },
      res,
    );
    assert.equal(res.statusCode, 400, `Expected 400 for receipt id ${invalidId}`);
    assert.equal(calls.length, 0);
  }

  // Strict order_id validation must also fail before the database.
  for (const invalidOrderId of ['99abc', '99.0', '9e1', '-1', '0', '', ' ']) {
    reset();
    const res = makeRes();
    await controller.getReceiptByOrderId(
      { user: cashier, query: { order_id: invalidOrderId } },
      res,
    );
    assert.equal(res.statusCode, 400, `Expected 400 for order_id ${invalidOrderId}`);
    assert.equal(calls.length, 0);
  }

  // Legacy completed POS receipts remain supported and are normalized as fully paid.
  reset('legacy');
  let res = makeRes();
  await controller.getReceiptById(
    { user: cashier, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.payment_summary.status, 'Fully Paid');
  assert.equal(res.body.payment_summary.payment_received, 10000);
  assert.equal(res.body.payment_summary.total_paid_after, 10000);
  assert.equal(res.body.payment_summary.remaining_balance, 0);
  assert.equal(res.body.payment_summary.has_payment_progress, false);
  assert.equal(res.body.payment_method, 'cash');
  assert.equal(res.body.items.length, 1);

  const ownedReceiptCall = calls.find((entry) => entry.sql.includes('FROM receipts r'));
  assert.ok(ownedReceiptCall);
  assert.match(ownedReceiptCall.sql, /r\.issued_by = \?/);
  assert.deepEqual(ownedReceiptCall.params, [88, 42]);

  // Admin keeps the existing unrestricted receipt lookup behavior.
  reset('legacy');
  res = makeRes();
  await controller.getReceiptById(
    { user: admin, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  const adminReceiptCall = calls.find((entry) => entry.sql.includes('FROM receipts r'));
  assert.ok(adminReceiptCall);
  assert.doesNotMatch(adminReceiptCall.sql, /r\.issued_by = \?/);
  assert.deepEqual(adminReceiptCall.params, [88]);

  // A true payment-progress snapshot must render the exact partial state.
  reset('partial', {
    payment_method_snapshot: 'cash',
    payment_label: 'partial_payment',
    previous_paid_amount: '1000.00',
    amount_paid: '2000.00',
    total_paid_after: '3000.00',
    remaining_balance_after: '7000.00',
    cash_received: null,
    change_amount: null,
  });
  res = makeRes();
  await controller.getReceiptById(
    { user: cashier, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.payment_summary, {
    order_total: 10000,
    previous_paid: 1000,
    payment_received: 2000,
    total_paid_after: 3000,
    remaining_balance: 7000,
    status: 'Partially Paid',
    is_fully_paid: false,
    has_payment_progress: true,
  });

  // A full payment-progress snapshot is reported as fully paid.
  reset('full', {
    payment_label: 'balance_payment',
    previous_paid_amount: '3000.00',
    amount_paid: '7000.00',
    total_paid_after: '10000.00',
    remaining_balance_after: '0.00',
    cash_received: null,
    change_amount: null,
  });
  res = makeRes();
  await controller.getReceiptById(
    { user: cashier, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.payment_summary.status, 'Fully Paid');
  assert.equal(res.body.payment_summary.payment_received, 7000);
  assert.equal(res.body.payment_summary.remaining_balance, 0);

  // Snapshot arithmetic that does not reconcile must fail closed.
  reset('inconsistent', {
    payment_label: 'partial_payment',
    previous_paid_amount: '1000.00',
    amount_paid: '2000.00',
    total_paid_after: '3000.00',
    remaining_balance_after: '8000.00',
  });
  res = makeRes();
  await controller.getReceiptById(
    { user: cashier, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 500);
  assert.match(res.body.message, /inconsistent/i);
  assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'error'), false);

  // Broken or empty item snapshots are never presented as legitimate empty receipts.
  for (const badSnapshot of ['{broken-json', '[]', '{}', 'null']) {
    reset('bad_items', { items_snapshot: badSnapshot });
    res = makeRes();
    await controller.getReceiptById(
      { user: cashier, params: { id: '88' } },
      res,
    );
    assert.equal(res.statusCode, 500);
    assert.match(res.body.message, /inconsistent/i);
    assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'error'), false);
  }

  // Receipt-by-order uses the same strict snapshot handling and preserves ownership.
  reset('partial', {
    payment_label: 'partial_payment',
    previous_paid_amount: '0.00',
    amount_paid: '3000.00',
    total_paid_after: '3000.00',
    remaining_balance_after: '7000.00',
  });
  res = makeRes();
  await controller.getReceiptByOrderId(
    { user: cashier, query: { order_id: '99' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.payment_summary.status, 'Partially Paid');
  const orderLookup = calls.find((entry) => entry.sql.includes('FROM receipts r'));
  assert.match(orderLookup.sql, /r\.issued_by = \?/);
  assert.deepEqual(orderLookup.params, [99, 42]);

  // Internal database details stay server-side.
  reset('db_error');
  res = makeRes();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await controller.getReceiptById(
      { user: cashier, params: { id: '88' } },
      res,
    );
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, 'Failed to load receipt.');
  assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'error'), false);
  assert.equal(JSON.stringify(res.body).includes('sensitive database detail'), false);

  // Blueprint receipt IDs now use the same strict parser without changing payment logic.
  reset();
  res = makeRes();
  await controller.getBlueprintReceiptById(
    { user: cashier, params: { id: '12abc' } },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);

  // Frontend contract: status is no longer hard-coded and payment progress is visible.
  const receiptPagePath = path.resolve(
    __dirname,
    '../../frontend/src/pages/staff/ReceiptPage.jsx',
  );
  const receiptPageSource = fs.readFileSync(receiptPagePath, 'utf8');
  assert.match(receiptPageSource, /receipt\.payment_summary/);
  assert.match(receiptPageSource, /Payment Received/);
  assert.match(receiptPageSource, /Remaining Balance/);
  assert.match(receiptPageSource, /paymentStatusLabel/);
  assert.equal(
    receiptPageSource.includes('<span style={{ color: "#059669" }}>PAID</span>'),
    false,
  );

  console.log('PASS: POS receipt correctness and integrity tests passed.');
}

run()
  .catch((error) => {
    console.error('FAIL: POS receipt correctness and integrity tests failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    restoreCache();
  });
