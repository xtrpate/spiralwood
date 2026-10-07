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
  // Current POS receipt controller requires the immutable order warranty
  // snapshot before it will return a receipt. Keep the receipt test fixture
  // aligned with that production integrity contract so presentation tests
  // can reach the assertions they are intended to exercise.
  warranty_period_days_snapshot: 365,
  warranty_policy_version_snapshot: 'test-policy-v1',
  warranty_policy_effective_at: '2026-09-01T00:00:00.000Z',
  staff_name: 'Cashier Test',
  ...overrides,
});

const baseBlueprintReceipt = (overrides = {}) => ({
  id: 12,
  order_id: 144,
  payment_transaction_id: 900,
  receipt_type: 'blueprint_payment',
  payment_method_snapshot: 'cash',
  payment_label: 'partial_payment',
  previous_paid_amount: '1000.00',
  amount_paid: '2000.00',
  total_paid_after: '3000.00',
  remaining_balance_after: '7000.00',
  provider_reference: null,
  receipt_number: 'BP-TEST-12',
  issued_to: 'Blueprint Customer',
  issued_by: 1,
  total_amount: '10000.00',
  items_snapshot: JSON.stringify({
    order_type: 'blueprint',
    order_number: 'SWS-SNAPSHOT-144',
    blueprint_title: 'Snapshot Table',
    payment_label: 'partial_payment',
  }),
  printed_at: null,
  created_at: '2026-09-30T03:00:00.000Z',
  order_number: 'SWS-LIVE-CHANGED',
  order_type: 'blueprint',
  processor_name: 'Admin Test',
  ...overrides,
});

function reset(nextMode = 'legacy', overrides = {}) {
  mode = nextMode;
  calls = [];
  currentReceipt = nextMode.startsWith('blueprint')
    ? baseBlueprintReceipt(overrides)
    : baseReceipt(overrides);
}

const mockDb = {
  async query(sql, params = []) {
    const text = String(sql);
    calls.push({ sql: text, params: [...params] });

    if (mode === 'db_error' && text.includes('FROM receipts r')) {
      throw new Error('sensitive database detail');
    }

    if (text.includes("r.receipt_type = 'blueprint_payment'")) {
      return mode.startsWith('blueprint') ? [[{ ...currentReceipt }]] : [[]];
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
  assert.equal(res.body.financial_summary, null);

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

  // Payment labels are part of the immutable financial meaning and must
  // agree with the stored arithmetic, not merely be a recognized string.
  const badPosPaymentLabels = [
    {
      payment_label: 'full_payment',
      previous_paid_amount: '0.00',
      amount_paid: '3000.00',
      total_paid_after: '3000.00',
      remaining_balance_after: '7000.00',
    },
    {
      payment_label: 'balance_payment',
      previous_paid_amount: '0.00',
      amount_paid: '10000.00',
      total_paid_after: '10000.00',
      remaining_balance_after: '0.00',
    },
    {
      payment_label: 'partial_payment',
      previous_paid_amount: '3000.00',
      amount_paid: '7000.00',
      total_paid_after: '10000.00',
      remaining_balance_after: '0.00',
    },
    {
      payment_label: 'down_payment',
      previous_paid_amount: '0.00',
      amount_paid: '3000.00',
      total_paid_after: '3000.00',
      remaining_balance_after: '7000.00',
    },
  ];
  for (const snapshot of badPosPaymentLabels) {
    reset('bad_payment_label', snapshot);
    res = makeRes();
    await controller.getReceiptById(
      { user: cashier, params: { id: '88' } },
      res,
    );
    assert.equal(res.statusCode, 500);
    assert.match(res.body.message, /inconsistent/i);
  }

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

  // Non-empty JSON is not enough: every receipt item must be structurally valid.
  const malformedItemSnapshots = [
    JSON.stringify([{ product_name: '', quantity: 1, unit_price: '1.00' }]),
    JSON.stringify([{ product_name: 'Chair', quantity: 0, unit_price: '1.00' }]),
    JSON.stringify([{ product_name: 'Chair', quantity: '1.5', unit_price: '1.00' }]),
    JSON.stringify([{ product_name: 'Chair', quantity: '1e2', unit_price: '1.00' }]),
    JSON.stringify([{ product_name: 'Chair', quantity: 1, unit_price: 'abc' }]),
    JSON.stringify([{ product_name: 'Chair', quantity: 1, unit_price: '-1.00' }]),
    JSON.stringify([{ product_name: { text: 'Chair' }, quantity: 1, unit_price: '1.00' }]),
    JSON.stringify([{ product_name: 'Chair', quantity: 1, unit_price: '1.00', wood_type: { name: 'Oak' } }]),
  ];
  for (const badSnapshot of malformedItemSnapshots) {
    reset('bad_item_fields', { items_snapshot: badSnapshot });
    res = makeRes();
    await controller.getReceiptById(
      { user: cashier, params: { id: '88' } },
      res,
    );
    assert.equal(res.statusCode, 500);
    assert.match(res.body.message, /inconsistent/i);
  }

  // New cashier-cash receipts carry an immutable, validated VAT-inclusive
  // financial snapshot. Historical array snapshots above remain VAT-neutral.
  reset('cash_vat_v2', {
    items_snapshot: JSON.stringify({
      snapshot_version: 2,
      items: [
        {
          product_id: 7,
          product_name: 'Test Chair',
          unit_price: '10000.00',
          quantity: 1,
          subtotal: '10000.00',
        },
      ],
      financial_summary: {
        pricing_mode: 'vat_inclusive',
        vat_rate: 12,
        subtotal: '10000.00',
        discount: '1000.00',
        delivery_fee: '500.00',
        vatable_sales: '8482.14',
        vat_exempt_sales: '0.00',
        zero_rated_sales: '0.00',
        tax: '1017.86',
        total: '9500.00',
      },
    }),
    total_amount: '9500.00',
    subtotal: '999999.00',
    tax: '0.00',
    discount: '0.00',
    delivery_fee: '0.00',
    total: '999999.00',
  });
  res = makeRes();
  await controller.getReceiptById(
    { user: cashier, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.financial_summary, {
    pricing_mode: 'vat_inclusive',
    vat_rate: 12,
    subtotal: 10000,
    discount: 1000,
    delivery_fee: 500,
    vatable_sales: 8482.14,
    vat_exempt_sales: 0,
    zero_rated_sales: 0,
    tax: 1017.86,
    total: 9500,
  });

  // A tampered VAT snapshot fails closed instead of being recomputed in the UI.
  reset('cash_vat_bad_math', {
    items_snapshot: JSON.stringify({
      snapshot_version: 2,
      items: [
        {
          product_id: 7,
          product_name: 'Test Chair',
          unit_price: '10000.00',
          quantity: 1,
        },
      ],
      financial_summary: {
        pricing_mode: 'vat_inclusive',
        vat_rate: 12,
        subtotal: '10000.00',
        discount: '1000.00',
        delivery_fee: '500.00',
        vatable_sales: '8482.14',
        vat_exempt_sales: '0.00',
        zero_rated_sales: '0.00',
        tax: '1000.00',
        total: '9500.00',
      },
    }),
    total_amount: '9500.00',
  });
  res = makeRes();
  await controller.getReceiptById(
    { user: cashier, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 500);
  assert.match(res.body.message, /inconsistent/i);

  // Printed identity comes from the immutable receipt, not the mutable order row.
  reset('snapshot_identity', {
    issued_to: 'Frozen Receipt Customer',
    walkin_customer_name: 'Changed Order Customer',
    payment_method_snapshot: 'paymongo',
    staff_name: 'Technical Owner Name',
  });
  res = makeRes();
  await controller.getReceiptById(
    { user: admin, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.customer_display, 'Frozen Receipt Customer');
  assert.equal(res.body.processor_display, 'Online Payment');
  assert.equal(res.body.payment_method, 'paymongo');

  reset('cash_processor', { staff_name: 'Cashier Test' });
  res = makeRes();
  await controller.getReceiptById(
    { user: admin, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.processor_display, 'Cashier Test');

  // Legacy receipts infer payment method only from immutable receipt evidence.
  // Mutable order.payment_method must never rewrite an old receipt.
  reset('legacy_cash_evidence', {
    payment_method_snapshot: null,
    payment_method: 'paymongo',
    cash_received: '12000.00',
    change_amount: '2000.00',
  });
  res = makeRes();
  await controller.getReceiptById(
    { user: admin, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.payment_method, 'cash');

  reset('legacy_provider_evidence', {
    payment_method_snapshot: null,
    payment_method: 'cash',
    cash_received: null,
    change_amount: null,
    provider_reference: 'cs_test_immutable_reference',
  });
  res = makeRes();
  await controller.getReceiptById(
    { user: admin, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.payment_method, 'paymongo');

  reset('legacy_ambiguous_method', {
    payment_method_snapshot: null,
    payment_method: 'paymongo',
    cash_received: null,
    change_amount: null,
    provider_reference: null,
  });
  res = makeRes();
  await controller.getReceiptById(
    { user: admin, params: { id: '88' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.payment_method, '');

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

  // Blueprint receipts must also reconcile strictly and prefer their own snapshot.
  reset('blueprint_valid');
  res = makeRes();
  await controller.getBlueprintReceiptById(
    { user: cashier, params: { id: '12' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order_number, 'SWS-SNAPSHOT-144');
  assert.equal(res.body.blueprint_title, 'Snapshot Table');
  assert.equal(res.body.payment_status, 'Partially Paid');
  assert.equal(res.body.previous_paid_amount, 1000);
  assert.equal(res.body.amount_paid, 2000);
  assert.equal(res.body.total_paid_after, 3000);
  assert.equal(res.body.remaining_balance_after, 7000);
  assert.equal(res.body.total_amount, 10000);
  assert.equal(res.body.processor_display, 'Admin Test');

  reset('blueprint_bad_math', { total_paid_after: '3500.00' });
  res = makeRes();
  await controller.getBlueprintReceiptById(
    { user: cashier, params: { id: '12' } },
    res,
  );
  assert.equal(res.statusCode, 500);
  assert.match(res.body.message, /inconsistent/i);

  reset('blueprint_bad_label', {
    items_snapshot: JSON.stringify({
      order_type: 'blueprint',
      order_number: 'SWS-SNAPSHOT-144',
      blueprint_title: 'Snapshot Table',
      payment_label: 'full_payment',
    }),
  });
  res = makeRes();
  await controller.getBlueprintReceiptById(
    { user: cashier, params: { id: '12' } },
    res,
  );
  assert.equal(res.statusCode, 500);
  assert.match(res.body.message, /inconsistent/i);

  reset('blueprint_semantic_label_mismatch', {
    payment_label: 'full_payment',
    previous_paid_amount: '0.00',
    amount_paid: '3000.00',
    total_paid_after: '3000.00',
    remaining_balance_after: '7000.00',
    items_snapshot: JSON.stringify({
      order_type: 'blueprint',
      order_number: 'SWS-SNAPSHOT-144',
      blueprint_title: 'Snapshot Table',
      payment_label: 'full_payment',
    }),
  });
  res = makeRes();
  await controller.getBlueprintReceiptById(
    { user: cashier, params: { id: '12' } },
    res,
  );
  assert.equal(res.statusCode, 500);
  assert.match(res.body.message, /inconsistent/i);

  reset('blueprint_wrong_order_type', {
    items_snapshot: JSON.stringify({
      order_type: 'standard',
      order_number: 'SWS-SNAPSHOT-144',
      blueprint_title: 'Snapshot Table',
      payment_label: 'partial_payment',
    }),
  });
  res = makeRes();
  await controller.getBlueprintReceiptById(
    { user: cashier, params: { id: '12' } },
    res,
  );
  assert.equal(res.statusCode, 500);
  assert.match(res.body.message, /inconsistent/i);

  reset('blueprint_bad_field_type', {
    items_snapshot: JSON.stringify({
      order_type: 'blueprint',
      order_number: { value: 'SWS-SNAPSHOT-144' },
      blueprint_title: 'Snapshot Table',
      payment_label: 'partial_payment',
    }),
  });
  res = makeRes();
  await controller.getBlueprintReceiptById(
    { user: cashier, params: { id: '12' } },
    res,
  );
  assert.equal(res.statusCode, 500);
  assert.match(res.body.message, /inconsistent/i);

  reset('blueprint_bad_snapshot', { items_snapshot: '{broken-json' });
  res = makeRes();
  await controller.getBlueprintReceiptById(
    { user: cashier, params: { id: '12' } },
    res,
  );
  assert.equal(res.statusCode, 500);
  assert.match(res.body.message, /inconsistent/i);

  reset('blueprint_paymongo', {
    payment_method_snapshot: 'paymongo',
    processor_name: 'Technical Owner',
  });
  res = makeRes();
  await controller.getBlueprintReceiptById(
    { user: cashier, params: { id: '12' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.processor_display, 'PayMongo / Online Payment');

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
  assert.match(receiptPageSource, /receipt\.customer_display/);
  assert.match(receiptPageSource, /receipt\.processor_display/);
  assert.equal(receiptPageSource.includes('receipt.walkin_customer_name'), false);
  assert.match(receiptPageSource, /receipt\.financial_summary/);
  assert.match(receiptPageSource, /VATable Sales/);
  assert.equal(receiptPageSource.includes("VAT-Exempt Sales"), false);
  assert.equal(receiptPageSource.includes("Zero-Rated Sales"), false);
  assert.match(receiptPageSource, /VAT \(12%\)/);
  assert.match(
    receiptPageSource,
    /Number\(financialSummary\.delivery_fee\) > 0/,
  );
  assert.match(receiptPageSource, /\\u20B1/);
  assert.equal(receiptPageSource.includes('Ã¢â€šÂ±'), false);
  assert.equal(receiptPageSource.includes('getVatInclusiveBreakdown'), false);
  assert.match(receiptPageSource, /hasBackendChange[\s\S]*backendChange/);

  const blueprintReceiptPagePath = path.resolve(
    __dirname,
    '../../frontend/src/pages/staff/BlueprintReceiptPage.jsx',
  );
  const blueprintReceiptPageSource = fs.readFileSync(
    blueprintReceiptPagePath,
    'utf8',
  );
  assert.match(blueprintReceiptPageSource, /formatPHDateTime/);
  assert.equal(blueprintReceiptPageSource.includes('VATable Sales'), false);
  assert.equal(blueprintReceiptPageSource.includes('VAT (12%)'), false);
  assert.equal(
    blueprintReceiptPageSource.includes('getVatInclusiveBreakdown'),
    false,
  );
  assert.match(blueprintReceiptPageSource, /ORDER TOTAL/);

  const customerStandardReceiptPagePath = path.resolve(
    __dirname,
    '../../frontend/src/pages/customer/CustomerStandardReceiptPage.jsx',
  );
  const customerStandardReceiptPageSource = fs.readFileSync(
    customerStandardReceiptPagePath,
    'utf8',
  );
  assert.match(customerStandardReceiptPageSource, /VATable Sales/);
  assert.match(customerStandardReceiptPageSource, /VAT \(12%\)/);
  assert.equal(
    customerStandardReceiptPageSource.includes('VAT-Exempt Sales'),
    false,
  );
  assert.equal(
    customerStandardReceiptPageSource.includes('Zero-Rated Sales'),
    false,
  );
  assert.match(customerStandardReceiptPageSource, /ORDER TOTAL/);
  assert.match(
    customerStandardReceiptPageSource,
    /Previous verified payments/,
  );

  const customerBlueprintReceiptPagePath = path.resolve(
    __dirname,
    '../../frontend/src/pages/customer/CustomerBlueprintReceiptPage.jsx',
  );
  const customerBlueprintReceiptPageSource = fs.readFileSync(
    customerBlueprintReceiptPagePath,
    'utf8',
  );
  assert.equal(
    customerBlueprintReceiptPageSource.includes('getVatInclusiveBreakdown'),
    false,
  );
  assert.equal(
    customerBlueprintReceiptPageSource.includes('VATable Sales'),
    false,
  );
  assert.equal(
    customerBlueprintReceiptPageSource.includes('VAT (12%)'),
    false,
  );
  assert.match(customerBlueprintReceiptPageSource, /PROJECT TOTAL/);
  assert.match(
    customerBlueprintReceiptPageSource,
    /Previous verified payments/,
  );
  assert.match(customerBlueprintReceiptPageSource, /Payment received/);
  assert.match(customerBlueprintReceiptPageSource, /Total paid/);
  assert.match(customerBlueprintReceiptPageSource, /Remaining balance/);

  console.log('PASS: Receipt correctness and historical integrity tests passed.');
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
