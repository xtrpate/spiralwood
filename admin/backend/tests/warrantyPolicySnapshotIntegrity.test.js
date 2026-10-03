"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "../frontend/src");
const readBackend = (relative) =>
  fs.readFileSync(path.join(backendRoot, relative), "utf8");
const readFrontend = (relative) =>
  fs.readFileSync(path.join(frontendRoot, relative), "utf8");

const migration = readBackend(
  "migrations/021_add_order_warranty_policy_snapshot.sql",
);
const customerOrders = readBackend("controllers/customer/customer.orders.js");
const posOrders = readBackend("controllers/staff/pos.orders.js");
const posQrLifecycle = readBackend("services/posQrLifecycleService.js");
const management = readBackend("controllers/admin/managementController.js");
const customerWarranty = readBackend("controllers/customer/customer.warranty.js");
const posReceipts = readBackend("controllers/staff/pos.receipts.js");
const customOrders = readBackend("controllers/customer/customer.customorders.js");
const contractsPage = readFrontend("pages/blueprints/ContractsPage.jsx");

assert.match(migration, /warranty_period_days_snapshot SMALLINT UNSIGNED NULL/);
assert.match(migration, /warranty_policy_version_snapshot VARCHAR\(32\) NULL/);
assert.match(migration, /warranty_policy_effective_at DATETIME NULL/);
assert.match(migration, /WHERE order_type = 'standard'/);
assert.match(migration, /INNER JOIN \(\s*SELECT order_id, MIN\(created_at\) AS agreement_created_at[\s\S]*FROM contracts/);
assert.match(migration, /WHERE o\.order_type = 'blueprint'/);
assert.match(
  migration,
  /existing warranty claims and warranties\.warranty_expiry are untouched/i,
);

assert.match(customerOrders, /bindOrderWarrantyPolicy\(conn, order_id\)/);
assert.match(posOrders, /bindOrderWarrantyPolicy\(conn, orderId\)/);
assert.match(posQrLifecycle, /bindOrderWarrantyPolicy\(conn, orderId\)/);
assert.match(
  management,
  /const warrantyPolicy = await bindOrderWarrantyPolicy\(conn, order\.id\)/,
);
assert.match(
  management,
  /buildWarrantyTermsForPeriod\(\s*warrantyPolicy\.periodDays,\s*normalizedWarrantyTerms/,
);
assert.doesNotMatch(
  customOrders,
  /bindOrderWarrantyPolicy/,
  "Initial blueprint/custom request creation must not bind the Warranty policy.",
);

assert.match(customerWarranty, /o\.warranty_period_days_snapshot/);
assert.match(customerWarranty, /o\.warranty_policy_version_snapshot/);
assert.match(customerWarranty, /o\.warranty_policy_effective_at/);
assert.doesNotMatch(customerWarranty, /getWarrantyPeriodDays/);
assert.doesNotMatch(
  customerWarranty,
  /FROM website_content[\s\S]{0,300}warranty_period_days/,
  "Warranty claims must never recalculate old orders from the current Website Setting.",
);

const receiptStart = posReceipts.indexOf("exports.getReceiptById = async (req, res) => {");
const receiptEnd = posReceipts.indexOf("/* ── Get Receipt by Order ID ── */", receiptStart);
assert.ok(receiptStart >= 0 && receiptEnd > receiptStart);
const receiptHandler = posReceipts.slice(receiptStart, receiptEnd);
assert.match(receiptHandler, /o\.warranty_period_days_snapshot/);
assert.doesNotMatch(
  receiptHandler,
  /'warranty_period_days'/,
  "Historical POS receipt display must not read today's live Warranty Period setting.",
);

assert.match(contractsPage, /api\.get\("\/website\/settings\/admin"\)/);
assert.match(contractsPage, /buildWarrantyTerms\(days\)/);
assert.doesNotMatch(contractsPage, /one \(1\) year warranty/i);

const policy = require("../utils/warrantyPolicy");

async function testExistingSnapshotIsImmutable() {
  const calls = [];
  const conn = {
    async query(sql, params = []) {
      const text = String(sql);
      calls.push({ text, params: [...params] });
      if (text.includes("FROM orders") && text.includes("FOR UPDATE")) {
        return [[{
          id: 9,
          warranty_period_days_snapshot: 365,
          warranty_policy_version_snapshot: "2",
          warranty_policy_effective_at: "2026-09-01 10:00:00",
        }]];
      }
      throw new Error("Unexpected query: " + text);
    },
  };

  const snapshot = await policy.bindOrderWarrantyPolicy(conn, 9);
  assert.equal(snapshot.periodDays, 365);
  assert.equal(snapshot.version, "2");
  assert.equal(
    calls.some((call) => call.text.includes("FROM website_content")),
    false,
    "Existing order snapshot must win over future Website Settings.",
  );
}

async function testNewSnapshotBindsCurrentPolicy() {
  const calls = [];
  const conn = {
    async query(sql, params = []) {
      const text = String(sql);
      calls.push({ text, params: [...params] });
      if (text.includes("FROM orders") && text.includes("FOR UPDATE")) {
        return [[{
          id: 10,
          warranty_period_days_snapshot: null,
          warranty_policy_version_snapshot: null,
          warranty_policy_effective_at: null,
        }]];
      }
      if (text.includes("FROM website_content")) {
        assert.deepEqual(params, ["warranty_period_days", "warranty_policy_version"]);
        return [[
          { content_key: "warranty_period_days", content: "180" },
          { content_key: "warranty_policy_version", content: "2" },
        ]];
      }
      if (text.includes("UPDATE orders")) {
        assert.deepEqual(params, [180, "2", 10]);
        return [{ affectedRows: 1 }];
      }
      throw new Error("Unexpected query: " + text);
    },
  };

  const snapshot = await policy.bindOrderWarrantyPolicy(conn, 10);
  assert.equal(snapshot.periodDays, 180);
  assert.equal(snapshot.version, "2");
  assert.equal(
    calls.filter((call) => call.text.includes("UPDATE orders")).length,
    1,
  );
}

async function testPartialSnapshotFailsClosed() {
  const conn = {
    async query(sql) {
      const text = String(sql);
      if (text.includes("FROM orders")) {
        return [[{
          id: 11,
          warranty_period_days_snapshot: 365,
          warranty_policy_version_snapshot: null,
          warranty_policy_effective_at: null,
        }]];
      }
      throw new Error("Unexpected query: " + text);
    },
  };

  await assert.rejects(
    () => policy.bindOrderWarrantyPolicy(conn, 11),
    /snapshot is incomplete/i,
  );
}

async function testInvalidCurrentPolicyFailsClosed() {
  const conn = {
    async query(sql) {
      const text = String(sql);
      if (text.includes("FROM website_content")) {
        return [[
          { content_key: "warranty_period_days", content: "180" },
          { content_key: "warranty_policy_version", content: "legacy" },
        ]];
      }
      throw new Error("Unexpected query: " + text);
    },
  };

  await assert.rejects(
    () => policy.loadCurrentWarrantyPolicy(conn),
    /invalid or unsupported/i,
  );
}

function testAgreementTermsFollowSnapshot() {
  const oldTerms = [
    "The furniture is covered by a one (1) year warranty from the handoff date for defects in materials and workmanship under normal use.",
    "The warranty does not cover misuse or neglect.",
  ].join("\n\n");
  const terms = policy.buildWarrantyTermsForPeriod(180, oldTerms);
  assert.match(terms, /^The furniture is covered by a 180-day warranty/);
  assert.doesNotMatch(terms, /one \(1\) year warranty/i);
  assert.match(terms, /The warranty does not cover misuse or neglect\./);
}

async function run() {
  await testExistingSnapshotIsImmutable();
  await testNewSnapshotBindsCurrentPolicy();
  await testPartialSnapshotFailsClosed();
  await testInvalidCurrentPolicyFailsClosed();
  testAgreementTermsFollowSnapshot();
  console.log("PASS: Warranty policy snapshot integrity checks passed.");
}

run().catch((error) => {
  console.error("FAIL: Warranty policy snapshot integrity checks failed.");
  console.error(error);
  process.exitCode = 1;
});
