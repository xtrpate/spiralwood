"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const customerCancellationSource = read(
  "admin/backend/controllers/customer/customer.cancellations.js",
);
const adminCancellationSource = read(
  "admin/backend/controllers/admin/cancellationController.js",
);
const fulfillmentSource = read(
  "admin/backend/controllers/staff/pos.fulfillment.js",
);
const customOrdersSource = read(
  "admin/backend/controllers/customer/customer.customorders.js",
);
const standardOrdersSource = read(
  "admin/backend/controllers/customer/customer.orders.js",
);
const riderUiSource = read(
  "admin/frontend/src/pages/staff/DeliveryManagement.jsx",
);
const customCustomerUiSource = read(
  "admin/frontend/src/pages/customer/customrequestdetailpage.jsx",
);
const standardCustomerUiSource = read(
  "admin/frontend/src/pages/customer/orderspage.jsx",
);

assert.match(
  customerCancellationSource,
  /SELECT id\s+FROM users\s+WHERE role = 'admin'\s+AND is_active = 1/,
  "Pending cancellation submission must continue notifying active admins.",
);
assert.doesNotMatch(
  customerCancellationSource,
  /delivery_rider|project_tasks|Scheduled Delivery Cancelled|Withdrawal Approved - Delivery Closed/,
  "Pending cancellation submission must not notify rider or production staff.",
);

assert.match(
  adminCancellationSource,
  /reason_code: "DELIVERY_IN_TRANSIT"/,
  "Admin approval must remain blocked while delivery is in transit.",
);
assert.match(
  adminCancellationSource,
  /failed\/refused after the furniture is returned before this withdrawal can be approved/,
  "In-transit withdrawal must still require failed/refused return handling first.",
);
assert.match(
  adminCancellationSource,
  /const \[\[latestDeliveryForClosure\]\] = await conn\.query/,
  "Approval must lock the latest delivery record for final rider closure.",
);
assert.match(
  adminCancellationSource,
  /title:\s*isPostProductionWithdrawal\s*\?\s*"Production Stopped - Customer Withdrawal"\s*:\s*"Production Order Cancelled"/,
  "Assigned unfinished production staff must keep the final stop notification.",
);
assert.match(
  adminCancellationSource,
  /title: "Scheduled Delivery Cancelled"/,
  "Scheduled riders must keep the final cancellation notification.",
);
assert.match(
  adminCancellationSource,
  /title: "Withdrawal Approved - Delivery Closed"/,
  "Latest failed-delivery rider must receive a final approval notification.",
);
assert.match(
  adminCancellationSource,
  /latestDeliveryStatus === "failed"/,
  "Failed-delivery rider notification must be limited to a failed latest attempt.",
);

const approvalPersistIndex = adminCancellationSource.indexOf(
  "SET status = 'approved'",
);
const failedRiderNotificationIndex = adminCancellationSource.indexOf(
  'title: "Withdrawal Approved - Delivery Closed"',
);
const commitIndex = adminCancellationSource.indexOf(
  "await conn.commit();",
  failedRiderNotificationIndex,
);

assert.ok(
  approvalPersistIndex >= 0 &&
    failedRiderNotificationIndex > approvalPersistIndex &&
    commitIndex > failedRiderNotificationIndex,
  "Final failed-delivery rider notification must be inside the approval transaction after the approval update.",
);

assert.match(
  fulfillmentSource,
  /if \(req\.user\.role === "staff"\) \{\s*sql \+= ` WHERE d\.driver_id = \? `;\s*params\.push\(req\.user\.id\);\s*\}/,
  "Staff delivery list must stay restricted to the logged-in assigned rider.",
);
assert.match(
  fulfillmentSource,
  /const DELIVERY_CONTACT_VISIBLE_STATUSES = new Set\(\["scheduled", "in_transit"\]\);/,
  "Rider contact visibility must be limited to scheduled/in-transit states.",
);
assert.match(
  fulfillmentSource,
  /row\.customer_phone = "";/,
  "Rider API must clear customer phone outside active delivery states.",
);

assert.match(
  customOrdersSource,
  /u\.phone AS driver_phone/,
  "Blueprint customer delivery query must load assigned rider phone.",
);
assert.match(
  customOrdersSource,
  /driver_phone:\s*\["scheduled", "in_transit"\]\.includes\(deliveryStatus\)\s*\?\s*toTrimmedStringOrNull\(deliveryRow\.driver_phone\)\s*:\s*null/,
  "Blueprint customer payload must hide rider phone after active delivery.",
);

assert.match(
  standardOrdersSource,
  /driver\.name AS driver_name/,
  "Standard customer order detail must include assigned rider name.",
);
assert.match(
  standardOrdersSource,
  /THEN NULLIF\(TRIM\(driver\.phone\), ''\)/,
  "Standard customer order detail must expose rider phone only for active delivery.",
);
assert.match(
  standardOrdersSource,
  /order\.delivery_details = latestDelivery \|\| null;/,
  "Standard customer detail must return latest delivery contact data.",
);

assert.match(
  riderUiSource,
  /label="Contact Number"[\s\S]*delivery\.customer_phone/,
  "Delivery Personnel view must show customer contact number.",
);
assert.match(
  customCustomerUiSource,
  /customerDeliveryRiderPhone/,
  "Blueprint customer page must consume rider phone.",
);
assert.match(
  customCustomerUiSource,
  /<span>Contact Number<\/span>/,
  "Blueprint customer page must label rider contact number.",
);
assert.match(
  standardCustomerUiSource,
  /deliveryPersonnelPhone/,
  "Standard customer order detail must consume rider phone.",
);
assert.match(
  standardCustomerUiSource,
  /<span>Contact Number<\/span>/,
  "Standard customer order detail must label rider contact number.",
);

for (const source of [
  riderUiSource,
  customCustomerUiSource,
  standardCustomerUiSource,
]) {
  assert.doesNotMatch(
    source,
    /href=\{?`tel:|href=["']tel:/,
    "Delivery contact display must remain information-only with no tel link.",
  );
}

console.log(
  "PASS: Delivery contact visibility, final cancellation notification, pending-request privacy, and active-state phone privacy checks passed.",
);
