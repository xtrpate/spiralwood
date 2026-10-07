const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const adminBell = read("admin/frontend/src/components/NotificationBell.jsx");
const customerBell = read(
  "admin/frontend/src/components/CustomerNotificationBell.jsx",
);
const customerCancellation = read(
  "admin/backend/controllers/customer/customer.cancellations.js",
);
const adminCancellationPage = read(
  "admin/frontend/src/pages/orders/CancellationsPage.jsx",
);
const customerAppointmentPage = read(
  "admin/frontend/src/pages/customer/appointmentpage.jsx",
);
const adminCancellationController = read(
  "admin/backend/controllers/admin/cancellationController.js",
);
const adminOrderDetail = read(
  "admin/frontend/src/pages/orders/OrderDetailPage.jsx",
);
const riderDeliveryPage = read(
  "admin/frontend/src/pages/staff/DeliveryManagement.jsx",
);

for (const [label, source] of [
  ["admin/staff", adminBell],
  ["customer", customerBell],
]) {
  assert.match(
    source,
    /if \(!n\.is_read\) \{\s*await markOneRead\(n\.id\);\s*return;/,
    `${label}: first click on unread notification must mark it read and stay put`,
  );
  assert.match(
    source,
    /Once it is already read, the next click opens the exact target/,
    `${label}: read-notification navigation contract missing`,
  );
}

assert.match(
  adminBell,
  /focus_cancellation_id=\$\{targetId\}/,
  "Admin cancellation requests must route to the exact cancellation record.",
);
assert.match(
  adminBell,
  /focus_order_id=\$\{cancellationOrderId\}/,
  "Legacy admin cancellation notifications must retain order-scoped focus.",
);
assert.match(
  adminBell,
  /\/admin\/orders\/\$\{targetId\}\?tab=payment/,
  "Admin payment-review notifications must open the Payment tab.",
);
assert.match(
  adminBell,
  /\/staff\/deliveries\?focus_order_id=\$\{deliveryOrderId\}/,
  "Legacy rider order-scoped delivery alerts must remain navigable.",
);

assert.match(
  customerCancellation,
  /type:\s*"cancellation_request"[\s\S]*?targetType:\s*"cancellation_request"[\s\S]*?targetId:\s*requestId[\s\S]*?targetOrderId:\s*order\.id/,
  "New cancellation requests must store the cancellation request id as the notification target.",
);

assert.match(
  adminCancellationPage,
  /searchParams\.get\("focus_cancellation_id"\)/,
  "Admin Cancellations page must consume exact cancellation focus.",
);
assert.match(
  adminCancellationPage,
  /searchParams\.get\("focus_order_id"\)/,
  "Admin Cancellations page must support legacy order-scoped focus.",
);
assert.match(
  adminCancellationPage,
  /getCancellationRowDomId\(match\)[\s\S]*?scrollIntoView\(\{ behavior: "auto", block: "center" \}\)/,
  "Admin cancellation focus must position directly on the matched row.",
);
assert.match(
  adminCancellationPage,
  /focusedCancellationKey === rowKey/,
  "Admin cancellation focus must visibly highlight the exact row.",
);

assert.match(
  customerAppointmentPage,
  /searchParams\.get\("focus_appointment_id"\)/,
  "Customer Appointments must consume the exact appointment id.",
);
assert.match(
  customerAppointmentPage,
  /setAppointmentView\("history"\)/,
  "Customer appointment deep links must switch to appointment history.",
);
assert.match(
  customerAppointmentPage,
  /id=\{`appointment-card-\$\{appt\.id\}`\}/,
  "Customer appointment cards must expose stable anchors.",
);
assert.match(
  customerAppointmentPage,
  /if \(focused\) setOpen\(true\)/,
  "Focused customer appointments must auto-expand.",
);
assert.match(
  customerAppointmentPage,
  /focused=\{Number\(a\.id\) === focusedAppointmentId\}/,
  "Only the exact appointment notification target may receive focus.",
);

assert.match(
  adminCancellationController,
  /title:\s*"Scheduled Delivery Cancelled"[\s\S]*?targetType:\s*"delivery"[\s\S]*?targetId:\s*delivery\.id/,
  "Scheduled-delivery cancellation alerts must target the exact delivery.",
);
assert.match(
  adminCancellationController,
  /title:\s*"Withdrawal Approved - Delivery Closed"[\s\S]*?targetType:\s*"delivery"[\s\S]*?targetId:\s*latestDeliveryForClosure\.id/,
  "Withdrawal-closure alerts must target the exact latest delivery.",
);

assert.match(
  adminOrderDetail,
  /searchParams\.get\("tab"\)/,
  "Admin Order Details must consume a notification tab deep link.",
);
assert.match(
  adminOrderDetail,
  /setActiveTab\(requestedTab\)/,
  "Admin Order Details must activate the requested deep-linked tab.",
);

assert.match(
  riderDeliveryPage,
  /searchParams\.get\("focus_order_id"\)/,
  "Rider Deliveries must resolve legacy order-scoped notification links.",
);
assert.match(
  riderDeliveryPage,
  /\.filter\(\(d\) => Number\(d\.order_id\) === orderId\)[\s\S]*?\.sort\(\(a, b\) => Number\(b\.id\) - Number\(a\.id\)\)\[0\]/,
  "Legacy rider order focus must choose the latest visible delivery record.",
);

console.log("PASS: Notification Navigation V1 integrity checks passed.");
