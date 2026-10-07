"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");

const routePath = path.join(
  backendRoot,
  "routes",
  "customer.custom-orders.js",
);
const controllerPath = path.join(
  backendRoot,
  "controllers",
  "customer",
  "customer.customorders.js",
);

const routeSource = fs.readFileSync(routePath, "utf8");
const controllerSource = fs.readFileSync(controllerPath, "utf8");

assert.match(
  routeSource,
  /router\.post\(\s*"\/:id\/verify-payment",\s*authenticate,\s*requireCustomer,\s*logAction\(\s*"verify_blueprint_initial_payment",\s*"payment_transactions",?\s*\),\s*customOrderController\.verifyPayment,\s*\);/s,
  "Blueprint initial PayMongo verification route must be wired to audit middleware.",
);

const start = controllerSource.indexOf(
  "exports.verifyPayment = async (req, res) => {",
);
assert.ok(start >= 0, "Blueprint initial payment verifier was not found.");

let end = controllerSource.indexOf("\nexports.", start + 1);
if (end < 0) end = controllerSource.length;

const verifySource = controllerSource.slice(start, end);

const preparedIndex = verifySource.indexOf(
  "const preparedAuditRecord = {",
);
assert.ok(
  preparedIndex >= 0,
  "Blueprint initial payment verifier must prepare an audit record.",
);

const commitIndex = verifySource.indexOf(
  "await conn.commit();",
  preparedIndex,
);
assert.ok(
  commitIndex > preparedIndex,
  "Blueprint initial payment audit facts must be prepared before the successful commit.",
);

const armIndex = verifySource.indexOf(
  "req.auditRecord = preparedAuditRecord;",
  commitIndex,
);
assert.ok(
  armIndex > commitIndex,
  "Blueprint initial payment audit middleware must be armed only after the transaction commits.",
);

assert.equal(
  verifySource.slice(0, commitIndex).includes(
    "req.auditRecord = preparedAuditRecord;",
  ),
  false,
  "A failed or rolled-back initial payment must never be success-audited.",
);

const auditBlock = verifySource.slice(preparedIndex, commitIndex);

for (const required of [
  "id: paymentInsertResult.insertId",
  "payment_method: \"paymongo\"",
  "amount: paymentAmountDecimal",
  "verified_total:",
  "remaining_balance:",
  "payment_status: nextPaymentStatus",
  "order_status: nextOrderStatus",
  "receipt_id: receiptResult.receiptId",
  "receipt_number: receiptResult.receiptNumber",
]) {
  assert.ok(
    auditBlock.includes(required),
    `Blueprint initial payment audit is missing: ${required}`,
  );
}

assert.doesNotMatch(
  auditBlock,
  /providerSessionId|paymongo_session_id|session\.id|customer_name|customer_email|phone|address/i,
  "Blueprint initial payment audit must not persist provider session identifiers or customer PII.",
);

console.log(
  "PASS: Blueprint initial PayMongo verification is audited only after a fresh successful commit.",
);
