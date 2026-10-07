"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");

const paymongoPath = path.join(
  backendRoot,
  "controllers",
  "customer",
  "customer.paymongo.js",
);
const oversizedPath = path.join(
  backendRoot,
  "controllers",
  "admin",
  "oversizedDeliveryController.js",
);

const paymongoSource = fs.readFileSync(paymongoPath, "utf8");
const oversizedSource = fs.readFileSync(oversizedPath, "utf8");

assert.match(
  paymongoSource,
  /writeAuditLogSafe/,
  "PayMongo webhook controller must use the central audit writer.",
);

const webhookStart = paymongoSource.indexOf(
  "exports.handlePaymongoWebhook = async (req, res) => {",
);
assert.ok(webhookStart >= 0, "PayMongo webhook handler was not found.");

const webhookSource = paymongoSource.slice(webhookStart);
const webhookActionNeedle =
  'action: "confirm_paymongo_webhook_payment"';

const webhookAuditPositions = [];
let webhookSearchFrom = 0;

while (true) {
  const actionIndex = webhookSource.indexOf(
    webhookActionNeedle,
    webhookSearchFrom,
  );
  if (actionIndex < 0) break;
  webhookAuditPositions.push(actionIndex);
  webhookSearchFrom = actionIndex + webhookActionNeedle.length;
}

assert.equal(
  webhookAuditPositions.length,
  2,
  "Expected both Blueprint and standard-order PayMongo webhook audit blocks.",
);

const extractAuditBlock = (source, actionIndex) => {
  const callStart = source.lastIndexOf(
    "await writeAuditLogSafe({",
    actionIndex,
  );
  assert.ok(
    callStart >= 0,
    "Unable to locate writeAuditLogSafe() for PayMongo audit.",
  );

  const tail = source.slice(callStart);
  const closeMatch = tail.match(/\n\s*\}\);/);
  assert.ok(closeMatch, "Unable to isolate PayMongo audit block.");

  return tail.slice(0, closeMatch.index + closeMatch[0].length);
};

const webhookAuditBlocks = webhookAuditPositions.map((actionIndex) => {
  const previousCommitIndex = webhookSource.lastIndexOf(
    "await conn.commit();",
    actionIndex,
  );

  assert.ok(
    previousCommitIndex >= 0 && previousCommitIndex < actionIndex,
    "Each PayMongo success audit must occur only after its database transaction commits.",
  );

  return extractAuditBlock(webhookSource, actionIndex);
});

for (const [index, auditBlock] of webhookAuditBlocks.entries()) {
  assert.match(
    auditBlock,
    /actorType:\s*"webhook"/,
    `PayMongo audit block ${index + 1} must be classified as a webhook actor.`,
  );

  assert.match(
    auditBlock,
    /responseStatus:\s*200/,
    `PayMongo audit block ${index + 1} must record HTTP 200.`,
  );

  assert.match(
    auditBlock,
    /payment_transaction_created:/,
    `PayMongo audit block ${index + 1} must record whether a payment row was created.`,
  );

  assert.match(
    auditBlock,
    /provider_session_present:\s*(?:true|Boolean\(sessionId\))/,
    `PayMongo audit block ${index + 1} must record only provider-session presence.`,
  );

  assert.doesNotMatch(
    auditBlock,
    /rawBody|signatureHeader|paymongo-signature|webhookSecret|session_id\s*:|sessionId\s*,/,
    `PayMongo audit block ${index + 1} must not persist signature secrets, raw webhook payloads, or the provider session ID.`,
  );
}

assert.match(
  webhookAuditBlocks[0],
  /recordId:\s*blueprintWebhookResult\.paymentTransactionId/,
  "Blueprint PayMongo webhook audit must link the payment transaction.",
);

assert.match(
  webhookAuditBlocks[1],
  /recordId:\s*paymentTransaction\.id/,
  "Standard-order PayMongo webhook audit must link the payment transaction.",
);

assert.match(
  webhookAuditBlocks[1],
  /receipt_id:\s*receiptId/,
  "Standard-order PayMongo audit must link the resulting receipt ID.",
);

assert.match(
  oversizedSource,
  /writeAuditLogSafe/,
  "Oversized-delivery controller must use the central audit writer.",
);

const oversizedStart = oversizedSource.indexOf(
  "exports.saveDecisionByBlueprint = async (req, res) => {",
);
assert.ok(
  oversizedStart >= 0,
  "Oversized-delivery decision handler was not found.",
);

const oversizedHandler = oversizedSource.slice(oversizedStart);
const oversizedCommitIndex = oversizedHandler.indexOf("await conn.commit();");
const oversizedAuditIndex = oversizedHandler.indexOf(
  'action: "update_oversized_delivery_decision"',
);

assert.ok(
  oversizedCommitIndex >= 0,
  "Oversized-delivery transaction commit was not found.",
);
assert.ok(
  oversizedAuditIndex > oversizedCommitIndex,
  "Oversized-delivery audit must occur only after the database transaction commits.",
);

const oversizedAuditTail = oversizedHandler.slice(oversizedAuditIndex);
assert.match(
  oversizedAuditTail,
  /actorType:\s*"user"/,
  "Oversized-delivery decision must be attributed to the authenticated user.",
);
assert.match(
  oversizedAuditTail,
  /responseStatus:\s*200/,
  "Oversized-delivery decision audit must record HTTP 200.",
);

for (const requiredField of [
  "decision:",
  "additional_delivery_fee:",
  "order_total:",
  "order_down_payment:",
  "grand_total:",
]) {
  assert.ok(
    oversizedAuditTail.includes(requiredField),
    `Oversized-delivery audit is missing ${requiredField}`,
  );
}

assert.match(
  oversizedSource,
  /subtotal,\s*\n\s*tax,\s*\n\s*discount,\s*\n\s*total,\s*\n\s*down_payment,/,
  "Oversized-delivery context query must load the previous order financial state.",
);

console.log(
  "PASS: PayMongo webhook and oversized-delivery critical mutations have post-commit audit coverage.",
);
