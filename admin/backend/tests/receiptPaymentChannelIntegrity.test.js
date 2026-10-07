const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  extractPaymongoReceiptChannel,
  resolvePaymongoReceiptMethod,
  resolvePaymongoReceiptMethodFromSession,
  normalizePaymongoReceiptMethodSnapshot,
  isPaymongoReceiptEvidence,
} = require("../utils/paymongoReceiptChannel");

const paid = (type) => ({
  attributes: {
    status: "paid",
    source: type === undefined ? undefined : { type },
  },
});

for (const [providerType, expected] of [
  ["gcash", "gcash"],
  ["paymaya", "paymaya"],
  ["card", "card"],
  ["qrph", "qrph"],
]) {
  assert.equal(extractPaymongoReceiptChannel(paid(providerType)), expected);
  assert.equal(resolvePaymongoReceiptMethod(paid(providerType)), expected);
  assert.equal(normalizePaymongoReceiptMethodSnapshot(providerType), expected);
}

assert.equal(extractPaymongoReceiptChannel(paid("unknown_wallet")), null);
assert.equal(resolvePaymongoReceiptMethod(paid("unknown_wallet")), "paymongo");
assert.equal(resolvePaymongoReceiptMethod(paid(undefined)), "paymongo");
assert.equal(
  normalizePaymongoReceiptMethodSnapshot("anything_else"),
  "paymongo",
);

assert.equal(
  resolvePaymongoReceiptMethodFromSession({
    attributes: {
      payments: [paid("gcash")],
    },
  }),
  "gcash",
);

assert.equal(
  resolvePaymongoReceiptMethodFromSession({
    attributes: {
      payments: [paid("paymaya")],
    },
  }),
  "paymaya",
);

assert.equal(
  resolvePaymongoReceiptMethodFromSession({
    attributes: {
      payments: [paid("gcash"), paid("gcash")],
    },
  }),
  "paymongo",
);

assert.equal(
  resolvePaymongoReceiptMethodFromSession({
    attributes: {
      payments: [],
    },
  }),
  "paymongo",
);

assert.equal(
  isPaymongoReceiptEvidence({
    paymentMethodSnapshot: "paymongo",
    providerReference: null,
  }),
  true,
);

assert.equal(
  isPaymongoReceiptEvidence({
    paymentMethodSnapshot: "gcash",
    providerReference: "cs_test_123",
  }),
  true,
);

assert.equal(
  isPaymongoReceiptEvidence({
    paymentMethodSnapshot: "gcash",
    providerReference: null,
  }),
  false,
);

const adminRoot = path.resolve(__dirname, "..", "..");

const readSource = (relative) =>
  fs.readFileSync(path.join(adminRoot, relative), "utf8");

const compact = (value) =>
  String(value).replace(/\s+/g, " ").trim();

const mustIncludeCompact = (source, expected, message) => {
  assert.equal(
    compact(source).includes(compact(expected)),
    true,
    message,
  );
};

const receiptService = readSource("backend/services/receiptService.js");
mustIncludeCompact(
  receiptService,
  "normalizePaymongoReceiptMethodSnapshot(paymentMethodSnapshot)",
  "Standard online receipt must normalize the exact PayMongo channel snapshot.",
);
mustIncludeCompact(
  receiptService,
  "payment_method_snapshot, provider_reference, items_snapshot",
  "POS PayMongo receipt must persist provider evidence beside its snapshot.",
);

const posQr = readSource("backend/services/posQrLifecycleService.js");
mustIncludeCompact(
  posQr,
  "paymentMethodSnapshot: resolvePaymongoReceiptMethod(payment)",
  "POS QR verification must snapshot the successful provider payment channel.",
);
mustIncludeCompact(
  posQr,
  "providerReference: attempt.provider_session_id || null",
  "POS QR receipt must preserve PayMongo provider evidence.",
);

const customerOrders = readSource(
  "backend/controllers/customer/customer.orders.js",
);
mustIncludeCompact(
  customerOrders,
  "const paymentMethodSnapshot = resolvePaymongoReceiptMethod(successfulPayment)",
  "Standard redirect verification must capture the successful provider channel.",
);
mustIncludeCompact(
  customerOrders,
  "let successfulPayment = null",
  "Standard cron recovery must retain the successful provider Payment object.",
);
mustIncludeCompact(
  customerOrders,
  "resolvePaymongoReceiptMethod(successfulPayment)",
  "Standard cron recovery receipt must carry the provider channel.",
);

const webhook = readSource(
  "backend/controllers/customer/customer.paymongo.js",
);
assert.match(
  webhook,
  /retrieveCheckoutSession\s*\(\s*sessionId\s*,\s*\{\s*timeoutMs:\s*10000\s*\}\s*,?\s*\)/,
  "Webhook receipt channel must use authenticated Checkout Session retrieval.",
);
mustIncludeCompact(
  webhook,
  "resolvePaymongoReceiptMethodFromSession(retrievedSession)",
  "Retrieved Checkout Session must drive receipt-facing channel enrichment.",
);
mustIncludeCompact(
  webhook,
  "const providerAmountCents = getPaymongoAmountCents(session)",
  "Existing webhook amount verification must continue using the signed webhook session.",
);
mustIncludeCompact(
  webhook,
  "const paymentMethodSnapshot = receiptPaymentMethodSnapshot !== \"paymongo\" ? receiptPaymentMethodSnapshot : resolvePaymongoReceiptMethod(successfulProviderPayment)",
  "Standard receipt must prefer authenticated retrieved channel and retain safe fallback.",
);
mustIncludeCompact(
  webhook,
  "receiptPaymentMethodSnapshot !== \"paymongo\" ? receiptPaymentMethodSnapshot : blueprintWebhookResult.paymentMethodSnapshot || \"paymongo\"",
  "Blueprint receipt must prefer authenticated retrieved channel and retain existing fallback.",
);

const customOrders = readSource(
  "backend/controllers/customer/customer.customorders.js",
);
mustIncludeCompact(
  customOrders,
  "providerAnalysis.paymentMethodSnapshot",
  "Blueprint initial redirect receipt must carry the provider channel.",
);
mustIncludeCompact(
  customOrders,
  "finalProviderAnalysis.paymentMethodSnapshot",
  "Blueprint remaining-balance redirect receipt must carry the provider channel.",
);

const standardReceiptController = readSource(
  "backend/controllers/customer/customer.standard-receipts.js",
);
mustIncludeCompact(
  standardReceiptController,
  "financial_summary: financialSummary",
  "Customer Standard receipt must return immutable backend financial summary.",
);
mustIncludeCompact(
  standardReceiptController,
  "computeReadyMadeVatInclusiveBreakdown",
  "Customer Standard receipt must use the canonical VAT helper.",
);
mustIncludeCompact(
  standardReceiptController,
  'const processorDisplay = isPaymongoProvider ? "PayMongo"',
  "Customer Standard receipt must identify PayMongo as processor.",
);

const staffReceiptPage = readSource(
  "frontend/src/pages/staff/ReceiptPage.jsx",
);
assert.equal(staffReceiptPage.includes('paymaya: "Maya"'), true);
assert.equal(staffReceiptPage.includes('card: "Card"'), true);
assert.equal(staffReceiptPage.includes('qrph: "QR Ph"'), true);
assert.equal(
  staffReceiptPage.includes('receipt.payment_provider === "paymongo"'),
  true,
);
assert.equal(staffReceiptPage.includes("!isPaymongoPayment"), true);

const staffBlueprintPage = readSource(
  "frontend/src/pages/staff/BlueprintReceiptPage.jsx",
);
assert.equal(staffBlueprintPage.includes('paymaya: "Maya"'), true);
assert.equal(staffBlueprintPage.includes('card: "Card"'), true);
assert.equal(staffBlueprintPage.includes('qrph: "QR Ph"'), true);

const customerStandardPage = readSource(
  "frontend/src/pages/customer/CustomerStandardReceiptPage.jsx",
);
assert.equal(customerStandardPage.includes("getVatInclusiveBreakdown"), false);
assert.equal(customerStandardPage.includes("receipt.financial_summary"), true);
assert.equal(customerStandardPage.includes("Merchandise Subtotal"), true);
assert.equal(customerStandardPage.includes("Processed by"), true);
assert.equal(
  customerStandardPage.includes("receipt.processor_display"),
  true,
);

const customerBlueprintPage = readSource(
  "frontend/src/pages/customer/CustomerBlueprintReceiptPage.jsx",
);
assert.equal(customerBlueprintPage.includes('paymaya: "Maya"'), true);
assert.equal(customerBlueprintPage.includes('card: "Card"'), true);
assert.equal(customerBlueprintPage.includes('qrph: "QR Ph"'), true);
assert.equal(customerBlueprintPage.includes("Processed by"), true);
assert.equal(
  customerBlueprintPage.includes("receipt.processor_display"),
  true,
);

console.log("PASS receiptPaymentChannelIntegrity.test.js");
