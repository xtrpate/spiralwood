const assert = require("assert");

const {
  INITIAL_PAYMENT_REASON,
  resolveInitialOnlinePaymentAmount,
  validateInitialPayMongoSessionContext,
  analyzeInitialPayMongoSession,
  summarizeVerifiedPaymentRows,
} = require("../services/blueprintInitialOnlinePaymentService");

const TOTAL = "100000.00";

const omitted = resolveInitialOnlinePaymentAmount({
  orderTotalRaw: TOTAL,
  amountRaw: undefined,
});
assert.equal(omitted.ok, true);
assert.equal(omitted.amountCents, 3000000);
assert.equal(omitted.usedDefaultMinimum, true);

for (const [raw, cents] of [
  ["30000.00", 3000000],
  ["50000.00", 5000000],
  ["63250.25", 6325025],
  ["100000.00", 10000000],
]) {
  const result = resolveInitialOnlinePaymentAmount({
    orderTotalRaw: TOTAL,
    amountRaw: raw,
  });
  assert.equal(result.ok, true, raw);
  assert.equal(result.amountCents, cents, raw);
}

const below = resolveInitialOnlinePaymentAmount({
  orderTotalRaw: TOTAL,
  amountRaw: "29999.99",
});
assert.equal(below.ok, false);
assert.equal(below.reason, INITIAL_PAYMENT_REASON.BELOW_MINIMUM);

const above = resolveInitialOnlinePaymentAmount({
  orderTotalRaw: TOTAL,
  amountRaw: "100000.01",
});
assert.equal(above.ok, false);
assert.equal(above.reason, INITIAL_PAYMENT_REASON.ABOVE_TOTAL);

const numericJsonAmount = resolveInitialOnlinePaymentAmount({
  orderTotalRaw: TOTAL,
  amountRaw: 50000,
});
assert.equal(numericJsonAmount.ok, false);
assert.equal(numericJsonAmount.reason, INITIAL_PAYMENT_REASON.INVALID_AMOUNT);

const validR1Context = validateInitialPayMongoSessionContext(
  {
    attributes: {
      metadata: {
        order_id: "77",
        order_type: "blueprint",
        payment_purpose: "initial_payment",
        initial_payment_amount_cents: "5000000",
      },
    },
  },
  { orderId: 77 },
);
assert.equal(validR1Context.ok, true);
assert.equal(validR1Context.legacy, false);

const wrongOrderContext = validateInitialPayMongoSessionContext(
  {
    attributes: {
      metadata: {
        order_id: "78",
        order_type: "blueprint",
        payment_purpose: "initial_payment",
        initial_payment_amount_cents: "5000000",
      },
    },
  },
  { orderId: 77 },
);
assert.equal(wrongOrderContext.ok, false);
assert.equal(wrongOrderContext.reason, "SESSION_ORDER_ID_MISMATCH");

const wrongPurposeContext = validateInitialPayMongoSessionContext(
  {
    attributes: {
      metadata: {
        order_id: "77",
        order_type: "blueprint",
        payment_purpose: "remaining_balance",
      },
    },
  },
  { orderId: 77 },
);
assert.equal(wrongPurposeContext.ok, false);
assert.equal(
  wrongPurposeContext.reason,
  "SESSION_PAYMENT_PURPOSE_MISMATCH",
);

const incompleteR1Context = validateInitialPayMongoSessionContext(
  {
    attributes: {
      metadata: {
        order_id: "77",
        order_type: "blueprint",
        initial_payment_amount_cents: "5000000",
      },
    },
  },
  { orderId: 77 },
);
assert.equal(incompleteR1Context.ok, false);
assert.equal(
  incompleteR1Context.reason,
  "INCOMPLETE_INITIAL_PAYMENT_SESSION_CONTEXT",
);

const legacyContext = validateInitialPayMongoSessionContext(
  {
    attributes: {
      metadata: {
        order_id: "77",
        order_type: "blueprint",
      },
    },
  },
  { orderId: 77 },
);
assert.equal(legacyContext.ok, true);
assert.equal(legacyContext.legacy, true);

const active50 = analyzeInitialPayMongoSession({
  attributes: {
    status: "active",
    metadata: { initial_payment_amount_cents: "5000000" },
    line_items: [{ amount: 5000000, quantity: 1 }],
    payments: [],
  },
});
assert.equal(active50.ok, true);
assert.equal(active50.sessionActive, true);
assert.equal(active50.expectedCents, 5000000);
assert.equal(active50.hasSuccessfulPayment, false);

const paid50 = analyzeInitialPayMongoSession({
  attributes: {
    status: "active",
    metadata: { initial_payment_amount_cents: "5000000" },
    line_items: [{ amount: 5000000, quantity: 1 }],
    payments: [{ attributes: { status: "paid", amount: 5000000 } }],
    payment_intent: { attributes: { status: "succeeded", amount: 5000000 } },
  },
});
assert.equal(paid50.ok, true);
assert.equal(paid50.hasSuccessfulPayment, true);
assert.equal(paid50.paidCents, 5000000);

const providerMismatch = analyzeInitialPayMongoSession({
  attributes: {
    status: "active",
    metadata: { initial_payment_amount_cents: "5000000" },
    line_items: [{ amount: 5000000, quantity: 1 }],
    payments: [{ attributes: { status: "paid", amount: 3000000 } }],
  },
});
assert.equal(providerMismatch.ok, false);
assert.equal(
  providerMismatch.reason,
  "PAID_AMOUNT_DOES_NOT_MATCH_SESSION_AMOUNT",
);

const sessionMismatch = analyzeInitialPayMongoSession({
  attributes: {
    status: "active",
    metadata: { initial_payment_amount_cents: "5000000" },
    line_items: [{ amount: 3000000, quantity: 1 }],
    payments: [],
  },
});
assert.equal(sessionMismatch.ok, false);
assert.equal(sessionMismatch.reason, "SESSION_EXPECTED_AMOUNT_MISMATCH");

const legacyFallback = analyzeInitialPayMongoSession(
  {
    attributes: {
      status: "active",
      payments: [{ attributes: { status: "paid", amount: 3000000 } }],
    },
  },
  { fallbackExpectedCents: 3000000 },
);
assert.equal(legacyFallback.ok, true);
assert.equal(legacyFallback.expectedCents, 3000000);
assert.equal(legacyFallback.paidCents, 3000000);

const summary = summarizeVerifiedPaymentRows([
  { amount: "30000.00", status: "verified" },
  { amount: "20000.00", status: "verified" },
  { amount: "1000.00", status: "pending" },
]);
assert.deepEqual(summary, {
  verifiedTotalCents: 5000000,
  hasPendingPayment: true,
  hasInvalidAmount: false,
});

console.log("PASS blueprintInitialOnlinePayment.test.js");
