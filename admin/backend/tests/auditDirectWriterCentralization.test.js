"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const centralWriterPath = path.join(
  backendRoot,
  "middleware",
  "auditLog.js",
);

const skippedDirectories = new Set([
  "backups",
  "migrations",
  "node_modules",
  "tests",
]);

const walkJsFiles = (dir, results = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) continue;
      walkJsFiles(fullPath, results);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(fullPath);
    }
  }

  return results;
};

const productionJsFiles = walkJsFiles(backendRoot);
const directAuditSqlOffenders = [];

for (const filePath of productionJsFiles) {
  if (path.resolve(filePath) === path.resolve(centralWriterPath)) continue;

  const source = fs.readFileSync(filePath, "utf8");
  if (/INSERT\s+INTO\s+audit_logs/i.test(source)) {
    directAuditSqlOffenders.push(path.relative(backendRoot, filePath));
  }
}

assert.deepEqual(
  directAuditSqlOffenders,
  [],
  `Direct audit SQL must exist only in middleware/auditLog.js. Offenders: ${directAuditSqlOffenders.join(", ")}`,
);

const tasksPath = path.join(
  backendRoot,
  "controllers",
  "staff",
  "pos.tasks.js",
);
const fulfillmentPath = path.join(
  backendRoot,
  "controllers",
  "staff",
  "pos.fulfillment.js",
);
const cleanupPath = path.join(
  backendRoot,
  "services",
  "posQrCleanupService.js",
);

const tasksSource = fs.readFileSync(tasksPath, "utf8");
const fulfillmentSource = fs.readFileSync(fulfillmentPath, "utf8");
const cleanupSource = fs.readFileSync(cleanupPath, "utf8");

assert.match(
  tasksSource,
  /writeAuditLogSafe/,
  "pos.tasks.js must use the central audit writer.",
);
assert.match(
  tasksSource,
  /action:\s*isPickupOrder\s*&&\s*pickupReadyApplied[\s\S]*mark_production_ready_for_shipping/,
  "Production-readiness audit action mapping must be preserved.",
);
assert.match(
  tasksSource,
  /actorType:\s*"user"/,
  "Production-readiness audits must be attributed to a user actor.",
);
assert.match(
  tasksSource,
  /responseStatus:\s*200/,
  "Production-readiness audits must record the successful response status.",
);

assert.match(
  fulfillmentSource,
  /writeAuditLogSafe/,
  "pos.fulfillment.js must use the central audit writer.",
);
assert.match(
  fulfillmentSource,
  /action:\s*"confirm_blueprint_rider_cash_collection"/,
  "Blueprint rider cash collection must keep its dedicated audit action.",
);

const updateDeliveryStart = fulfillmentSource.indexOf(
  "exports.updateDeliveryStatus = async (req, res) => {",
);
assert.ok(
  updateDeliveryStart >= 0,
  "updateDeliveryStatus function was not found.",
);

const updateDeliverySource = fulfillmentSource.slice(updateDeliveryStart);
const commitIndex = updateDeliverySource.indexOf("await conn.commit();");
const dedicatedAuditIndex = updateDeliverySource.indexOf(
  'action: "confirm_blueprint_rider_cash_collection"',
);

assert.ok(commitIndex >= 0, "Delivery transaction commit was not found.");
assert.ok(
  dedicatedAuditIndex > commitIndex,
  "Dedicated rider cash collection audit must be written only after the delivery transaction commits.",
);
assert.match(
  updateDeliverySource.slice(dedicatedAuditIndex),
  /actorType:\s*"user"/,
  "Rider cash collection audits must be attributed to a user actor.",
);
assert.match(
  updateDeliverySource.slice(dedicatedAuditIndex),
  /responseStatus:\s*200/,
  "Rider cash collection audits must record a successful response status.",
);

assert.match(
  cleanupSource,
  /writeAuditLogSafe/,
  "posQrCleanupService.js must use the central audit writer.",
);
assert.match(
  cleanupSource,
  /tableName:\s*"pos_qr_payment_attempts"/,
  "QR cleanup audit target table must be preserved.",
);
assert.match(
  cleanupSource,
  /actorType:\s*"system"/,
  "Background QR cleanup audits must be classified as system actors.",
);

console.log(
  "PASS: all production audit writers are centralized and actor/context semantics are preserved.",
);
