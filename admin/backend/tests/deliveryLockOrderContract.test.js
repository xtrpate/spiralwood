const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");

const fulfillmentPath = path.join(
  backendRoot,
  "controllers/staff/pos.fulfillment.js",
);
const customOrdersPath = path.join(
  backendRoot,
  "controllers/customer/customer.customorders.js",
);
const customerOrdersPath = path.join(
  backendRoot,
  "controllers/customer/customer.orders.js",
);
const conflictUtilPath = path.join(
  backendRoot,
  "utils/transactionConflict.js",
);

const read = (filePath) => fs.readFileSync(filePath, "utf8");

const functionSlice = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `Missing function marker: ${startMarker}`);

  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `Missing end marker for: ${startMarker}`);

  return source.slice(start, end);
};

const firstLockIndex = (source, tableName) => {
  // Match FOR UPDATE only inside the SAME SQL template literal. The B2A
  // implementation intentionally performs an earlier non-locking delivery
  // probe to discover order_id. A cross-template regex would incorrectly
  // join that probe to the later order FOR UPDATE and report delivery-first.
  const regex = new RegExp(
    `FROM\\s+${tableName}\\b[^\x60]*FOR\\s+UPDATE`,
    "i",
  );
  const match = regex.exec(source);
  return match ? match.index : -1;
};

const assertOrderBeforeDelivery = (source, label) => {
  const orderIndex = firstLockIndex(source, "orders");
  const deliveryIndex = firstLockIndex(source, "deliveries");

  assert.ok(orderIndex >= 0, `${label}: missing orders FOR UPDATE`);
  assert.ok(deliveryIndex >= 0, `${label}: missing deliveries FOR UPDATE`);
  assert.ok(
    orderIndex < deliveryIndex,
    `${label}: orders must be locked before deliveries`,
  );
};

const fulfillment = read(fulfillmentPath);
const customOrders = read(customOrdersPath);
const customerOrders = read(customerOrdersPath);

const confirmOrder = functionSlice(
  customerOrders,
  "exports.confirmOrder = async (req, res) => {",
  "/* ── Verify PayMongo Redirect ── */",
);

const reassign = functionSlice(
  fulfillment,
  "exports.reassignDeliveryRider = async (req, res) => {",
  "exports.rescheduleDelivery = async (req, res) => {",
);
const reschedule = functionSlice(
  fulfillment,
  "exports.rescheduleDelivery = async (req, res) => {",
  "exports.updateDeliveryStatus = async (req, res) => {",
);
const updateStatus = functionSlice(
  fulfillment,
  "exports.updateDeliveryStatus = async (req, res) => {",
  "/* ── RIDER DASHBOARD STATS",
);

const selectRemaining = functionSlice(
  customOrders,
  "exports.selectRemainingPaymentMethod = async (req, res) => {",
  "// PHASE 5B — Blueprint Remaining Balance Online Payment.",
);
const createRemaining = functionSlice(
  customOrders,
  "exports.createRemainingBalancePayMongoCheckout = async (req, res) => {",
  "// PHASE 5B — Blueprint Remaining Balance Online Payment.",
);

assertOrderBeforeDelivery(confirmOrder, "confirmOrder");

const confirmDeliveryLockIndex = firstLockIndex(confirmOrder, "deliveries");
const confirmPaymentLockIndex = firstLockIndex(
  confirmOrder,
  "payment_transactions",
);
assert.ok(
  confirmDeliveryLockIndex >= 0 &&
    confirmPaymentLockIndex > confirmDeliveryLockIndex,
  "confirmOrder: deliveries must be locked before payment_transactions",
);
assert.match(
  confirmOrder,
  /parseStrictPositiveInt\s*\(/,
  "confirmOrder must strictly validate the route order id",
);
assert.doesNotMatch(
  confirmOrder,
  /parseInt\s*\(\s*req\.params\.id/,
  "confirmOrder must not use coercive parseInt for the route order id",
);

assertOrderBeforeDelivery(reassign, "reassignDeliveryRider");
assertOrderBeforeDelivery(reschedule, "rescheduleDelivery");
assertOrderBeforeDelivery(updateStatus, "updateDeliveryStatus");
assertOrderBeforeDelivery(selectRemaining, "selectRemainingPaymentMethod");
assertOrderBeforeDelivery(
  createRemaining,
  "createRemainingBalancePayMongoCheckout",
);

// The rider status endpoint needs a non-locking parent probe in order to know
// which order row to lock first. Authorization must happen from that probe
// before the order FOR UPDATE, then be revalidated after delivery FOR UPDATE.
const updateStatusOrderLockIndex = firstLockIndex(updateStatus, "orders");
const earlyRiderGateIndex = updateStatus.indexOf(
  "Number(deliveryProbe.driver_id) !== Number(req.user.id)",
);
assert.ok(
  updateStatus.includes("SELECT order_id, driver_id FROM deliveries"),
  "updateDeliveryStatus probe must include driver_id for early authorization",
);
assert.ok(
  earlyRiderGateIndex >= 0 &&
    earlyRiderGateIndex < updateStatusOrderLockIndex,
  "updateDeliveryStatus must reject an unassigned rider before locking the order",
);

const assertOwnedProbeBeforeTransaction = (source, label) => {
  const ownershipProbeIndex = source.indexOf("if (!fulfillmentProbe)");
  const transactionIndex = source.indexOf("await conn.beginTransaction()");

  assert.ok(
    ownershipProbeIndex >= 0,
    label + ": missing ownership preflight",
  );
  assert.ok(
    transactionIndex >= 0 && ownershipProbeIndex < transactionIndex,
    label + ": ownership preflight must happen before the transaction/order lock",
  );
};

assertOwnedProbeBeforeTransaction(
  selectRemaining,
  "selectRemainingPaymentMethod",
);
assertOwnedProbeBeforeTransaction(
  createRemaining,
  "createRemainingBalancePayMongoCheckout",
);

assert.match(
  updateStatus,
  /ORDER_CLOSED_FOR_DELIVERY_MUTATION/,
  "updateDeliveryStatus must reject delivery mutations after order cancellation/completion",
);

for (const [label, source] of [
  ["confirmOrder", confirmOrder],
  ["reassignDeliveryRider", reassign],
  ["rescheduleDelivery", reschedule],
  ["updateDeliveryStatus", updateStatus],
  ["selectRemainingPaymentMethod", selectRemaining],
  ["createRemainingBalancePayMongoCheckout", createRemaining],
]) {
  assert.match(
    source,
    /isRetryableTransactionError\s*\(/,
    `${label} must classify retryable lock conflicts`,
  );
  assert.match(
    source,
    /buildConcurrentUpdateResponse\s*\(/,
    `${label} must return the shared 409 concurrent-update response`,
  );
}

const {
  isRetryableTransactionError,
  buildConcurrentUpdateResponse,
} = require(conflictUtilPath);

assert.equal(isRetryableTransactionError({ code: "ER_LOCK_DEADLOCK" }), true);
assert.equal(isRetryableTransactionError({ code: "ER_LOCK_WAIT_TIMEOUT" }), true);
assert.equal(isRetryableTransactionError({ errno: 1213 }), true);
assert.equal(isRetryableTransactionError({ errno: 1205 }), true);
assert.equal(isRetryableTransactionError({ code: "ER_PARSE_ERROR", errno: 1064 }), false);

const conflictBody = buildConcurrentUpdateResponse();
assert.equal(conflictBody.reason_code, "CONCURRENT_UPDATE_RETRY");
assert.match(conflictBody.message, /refresh/i);

console.log("✅ Delivery lock-order contract tests passed.");
