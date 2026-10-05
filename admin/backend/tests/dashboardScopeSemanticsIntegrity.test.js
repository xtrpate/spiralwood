const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const frontendPath = path.resolve(
  __dirname,
  "../../frontend/src/pages/dashboard/DashboardPage.jsx",
);
const controllerPath = path.resolve(
  __dirname,
  "../controllers/admin/dashboardController.js",
);

const frontend = fs.readFileSync(frontendPath, "utf8");
const controller = fs.readFileSync(controllerPath, "utf8");

// D6: the page must explicitly explain the mixed scope.
assert.match(
  frontend,
  /Period filters sales and order activity\. Open orders, payment reviews,[\s\S]*and inventory show current state\./,
);

// Selected-period cards must say so.
assert.match(frontend, /Selected period \u2022 Order value of orders created/);
assert.match(
  frontend,
  /Selected period \u2022 \$\{num\.format\(periodCompleted\)\} currently completed/,
);

// Current-state cards must say so.
assert.match(
  frontend,
  /Current queue \u2022 \$\{num\.format\(currentOpenPending\)\} pending/,
);
assert.match(
  frontend,
  /Current queue \u2022 \$\{num\.format\(deliveredUnpaid\)\} delivered unpaid/,
);
assert.match(frontend, /<span>Current stock<\/span>/);

// Section descriptions must match their actual scope.
assert.match(
  frontend,
  /Current status of orders created in the selected period\./,
);
assert.match(
  frontend,
  /Current status of blueprint orders created in the selected period\./,
);
assert.match(
  frontend,
  /Best-selling standard products from verified sales in the selected period\./,
);

// Preserve the already-correct inventory explanation.
assert.match(
  frontend,
  /Current stock does not change with the dashboard period filter\./,
);

// Backend semantics: period order counts remain date-scoped.
// D7 uses canonical Philippine UTC boundaries instead of wrapping created_at
// in DATE(DATE_ADD(...)), preserving the same business-day meaning while
// keeping the timestamp column directly range-filterable.
const periodOrdersStart = controller.indexOf(
  "const [[currentOpsDate]] = await pool.query",
);
const currentOpsAllTimeStart = controller.indexOf(
  "const [[currentOpsAllTime]] = await pool.query",
  periodOrdersStart,
);
assert.ok(periodOrdersStart >= 0 && currentOpsAllTimeStart > periodOrdersStart);

const periodOrdersSection = controller.slice(
  periodOrdersStart,
  currentOpsAllTimeStart,
);
assert.match(
  periodOrdersSection,
  /WHERE created_at >= \?\s+AND created_at < \?/,
);
assert.match(periodOrdersSection, /\bperiodUtcParams\b/);
assert.doesNotMatch(
  periodOrdersSection,
  /DATE\(DATE_ADD\(created_at, INTERVAL 8 HOUR\)\)/,
);

// Backend semantics: Open Orders remains all-time/current, not date-filtered.
const salesStart = controller.indexOf(
  "// ── 3. SALES / VERIFIED COLLECTIONS ──",
  currentOpsAllTimeStart,
);
assert.ok(salesStart > currentOpsAllTimeStart);
const openQueueSection = controller.slice(currentOpsAllTimeStart, salesStart);
assert.match(openQueueSection, /FROM orders/);
assert.match(openQueueSection, /open_orders/);
assert.doesNotMatch(openQueueSection, /BETWEEN \? AND \?/);
assert.doesNotMatch(openQueueSection, /created_at\s*[<>]=?\s*\?/);

// Backend semantics: Payment Reviews remains the current pending ledger queue.
const paymentStart = controller.indexOf(
  "const [[paymentRows]] = await pool.query",
);
const blueprintStart = controller.indexOf(
  "// ── 5. BLUEPRINT PIPELINE",
  paymentStart,
);
assert.ok(paymentStart >= 0 && blueprintStart > paymentStart);
const paymentSection = controller.slice(paymentStart, blueprintStart);
assert.match(paymentSection, /FROM payment_transactions/);
assert.match(paymentSection, /WHERE status = 'pending'/);
assert.doesNotMatch(paymentSection, /BETWEEN \? AND \?/);
assert.doesNotMatch(paymentSection, /verified_at\s*[<>]=?\s*\?/);

console.log("PASS dashboardScopeSemanticsIntegrity.test.js");
