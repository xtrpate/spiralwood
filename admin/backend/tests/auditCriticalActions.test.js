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
const webhookCommitIndex = webhookSource.indexOf("await conn.commit();");
const webhookAuditIndex = webhookSource.indexOf(
  'action: "confirm_paymongo_webhook_payment"',
);

assert.ok(webhookCommitIndex >= 0, "PayMongo transaction commit was not found.");
assert.ok(
  webhookAuditIndex > webhookCommitIndex,
  "PayMongo success audit must occur only after the database transaction commits.",
);

const webhookAuditTail = webhookSource.slice(webhookAuditIndex);
assert.match(
  webhookAuditTail,
  /actorType:\s*"webhook"/,
  "PayMongo successful payment audit must be classified as a webhook actor.",
);
assert.match(
  webhookAuditTail,
  /responseStatus:\s*200/,
  "PayMongo successful payment audit must record HTTP 200.",
);
assert.match(
  webhookAuditTail,
  /payment_transaction_created:\s*paymentTransactionCreated/,
  "PayMongo audit must distinguish a fresh payment row from an idempotent replay.",
);
assert.match(
  webhookAuditTail,
  /receipt_id:\s*receiptId/,
  "PayMongo audit must link the resulting receipt ID.",
);
assert.match(
  webhookAuditTail,
  /provider_session_present:\s*Boolean\(sessionId\)/,
  "PayMongo audit must record only presence of the provider session reference.",
);

const webhookAuditBlockEnd = webhookAuditTail.indexOf("\n      });");
assert.ok(
  webhookAuditBlockEnd > 0,
  "Unable to isolate PayMongo audit block.",
);
const webhookAuditBlock = webhookAuditTail.slice(0, webhookAuditBlockEnd);

assert.doesNotMatch(
  webhookAuditBlock,
  /rawBody|signatureHeader|paymongo-signature|webhookSecret|session_id\s*:|sessionId\s*,/,
  "PayMongo audit must not persist signature secrets, raw webhook payloads, or the provider session ID.",
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
