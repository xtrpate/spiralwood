"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const orderControllerSource = read(
  "admin/backend/controllers/admin/orderController.js",
);
const orderDetailSource = read(
  "admin/frontend/src/pages/orders/OrderDetailPage.jsx",
);

const updateStart = orderControllerSource.indexOf(
  "exports.updateStatus = async (req, res) => {",
);
const updateEnd = orderControllerSource.indexOf(
  "\nexports.accept = async (req, res) => {",
  updateStart,
);

assert.ok(updateStart >= 0 && updateEnd > updateStart, "updateStatus must exist.");

const updateStatus = orderControllerSource.slice(updateStart, updateEnd);

assert.match(
  updateStatus,
  /const orderId = parseStrictPositiveInt\(req\.params\.id\);/,
  "Order status writes must strictly validate the order id.",
);
assert.doesNotMatch(
  updateStatus,
  /parseInt\(req\.params\.id\)/,
  "updateStatus must not accept partial numeric ids such as 12abc.",
);

assert.doesNotMatch(
  updateStatus,
  /LEFT JOIN contracts c ON c\.order_id = o\.id/,
  "The first FOR UPDATE lock must stay order-only so lifecycle locks keep order -> blueprint -> context ordering.",
);
assert.match(
  updateStatus,
  /const blueprintId = order\.blueprint_id \|\| null;/,
  "Blueprint identity must use orders.blueprint_id as the canonical source.",
);
assert.doesNotMatch(
  updateStatus,
  /contract_blueprint_id/,
  "Contract blueprint ids must not override the canonical order blueprint id.",
);

assert.match(
  updateStatus,
  /const normalizedFulfillmentMethod = normalize\(order\.fulfillment_method\);/,
  "Blueprint fulfillment must come from orders.fulfillment_method.",
);
assert.match(
  updateStatus,
  /const isBlueprintPickupOrder =\s*isBlueprintOrder && normalizedFulfillmentMethod === "pickup";/,
);
assert.match(
  updateStatus,
  /const isBlueprintDeliveryOrder =\s*isBlueprintOrder && normalizedFulfillmentMethod === "delivery";/,
);
assert.match(
  updateStatus,
  /This blueprint order has an invalid fulfillment method\./,
  "Malformed non-walk-in blueprint fulfillment must fail closed.",
);
assert.match(
  updateStatus,
  /const usesManagedDeliveryFlow = isBlueprintOrder\s*\? isBlueprintDeliveryOrder && !isWalkInOrder\s*: hasDeliveryRequirement;/,
  "Managed blueprint delivery must be selected from fulfillment_method, not address presence.",
);

for (const lock of [
  "lockOrder: true",
  "lockBlueprint: true",
  "lockEstimation: true",
  "lockContext: true",
]) {
  assert.ok(
    updateStatus.includes(lock),
    `Missing lifecycle write lock: ${lock}`,
  );
}

const lifecycleResolveIndex = updateStatus.indexOf(
  "const lifecycle = isBlueprintOrder",
);
const standardPaymentReadIndex = updateStatus.indexOf(
  "SUM(CASE WHEN LOWER(status) = 'verified' THEN amount",
);

assert.ok(
  lifecycleResolveIndex >= 0 &&
    standardPaymentReadIndex >= 0 &&
    lifecycleResolveIndex < standardPaymentReadIndex,
  "Blueprint lifecycle/context locks must be acquired before payment-dependent status decisions.",
);
assert.match(
  updateStatus,
  /let verifiedPaymentTotal = Number\(lifecycle\?\.verified_payment_total \|\| 0\);/,
  "Blueprint payment gating must use the lifecycle resolver's locked payment context.",
);
assert.match(
  updateStatus,
  /if \(!lifecycle\?\.contract\?\.id\)/,
  "Contract presence must be checked from the locked lifecycle context.",
);

assert.match(
  updateStatus,
  /Custom furniture cancellation must be approved through the Cancellations review page\./,
  "Dedicated blueprint cancellation must remain separate from generic status changes.",
);
assert.match(
  updateStatus,
  /res\.status\(500\)\.json\(\{ message: "Failed to update order status\." \}\);/,
  "Unexpected status errors must return a safe generic server message.",
);
assert.doesNotMatch(
  updateStatus,
  /res\.status\(500\)\.json\(\{ message: err\.message \}\)/,
  "Unexpected database/internal errors must not be exposed to the client.",
);

assert.match(
  orderDetailSource,
  /const normalizedFulfillmentMethod = normalize\(order\?\.fulfillment_method\);/,
);
assert.match(
  orderDetailSource,
  /const usesManagedDeliveryFlow = isBlueprintOrder\s*\? isBlueprintDeliveryOrder && !isWalkInOrder\s*: hasDeliveryRequirement;/,
  "Admin UI must use the same managed-delivery rule as the backend.",
);
assert.match(
  orderDetailSource,
  /const requiresDeliveryReceiptForCompletion = usesManagedDeliveryFlow;/,
);
assert.match(
  orderDetailSource,
  /isBlueprintOrder && isWalkInOrder\s*\? WALKIN_BLUEPRINT_TIMELINE/,
  "Walk-in blueprint orders must retain their dedicated timeline.",
);
assert.match(
  orderDetailSource,
  /isBlueprintPickupOrder\s*\? BLUEPRINT_PICKUP_TIMELINE\s*: BLUEPRINT_TIMELINE/,
  "Blueprint pickup/delivery timelines must follow fulfillment_method.",
);
assert.match(
  orderDetailSource,
  /isBlueprintPickupOrder\s*\? "Complete production tasks for pickup"/,
  "Pickup orders must not tell admins to prepare a delivery.",
);

const transitionStart = orderDetailSource.indexOf(
  "const effectiveStatusTransitions = isBlueprintOrder",
);
const standardTransitionStart = orderDetailSource.indexOf(
  ": isWalkInPickupOrder",
  transitionStart,
);
assert.ok(
  transitionStart >= 0 && standardTransitionStart > transitionStart,
  "Blueprint transition map must be present before standard-order transitions.",
);
const blueprintTransitions = orderDetailSource.slice(
  transitionStart,
  standardTransitionStart,
);

assert.ok(
  blueprintTransitions.includes("ready_for_pickup: []"),
  "Blueprint pickup flow must explicitly treat ready_for_pickup as system-managed.",
);
assert.ok(
  !blueprintTransitions.includes(', "cancelled"'),
  "Generic blueprint status options must not offer cancellation.",
);
assert.ok(
  !orderDetailSource.includes('setStatusModalMode("cancel")'),
  "The broken direct Blueprint Cancel Order shortcut must be removed.",
);

assert.match(
  orderDetailSource,
  /\) : usesManagedDeliveryFlow \? \(/,
  "Delivery badges must follow managed-delivery classification.",
);

assert.match(
  orderDetailSource,
  /const isWalkInPickupOrder = isWalkInStandardOrder && !hasDeliveryRequirement;/,
  "Ready-made/walk-in classification must stay on its existing logic.",
);

console.log(
  "PASS: Blueprint order status flow integrity, canonical fulfillment, lifecycle locking, UI parity, and ready-made isolation checks passed.",
);
