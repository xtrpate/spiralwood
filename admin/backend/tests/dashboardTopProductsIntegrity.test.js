const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerPath = path.resolve(
  __dirname,
  "../controllers/admin/dashboardController.js",
);

const source = fs.readFileSync(controllerPath, "utf8");

const start = source.indexOf(
  "// Rank actual standard catalog products when the order first becomes a",
);
const end = source.indexOf(
  "COALESCE(u.name, o.walkin_customer_name, 'Walk-in') AS customer_name",
  start,
);

assert.ok(start >= 0, "Dashboard Top Products query must exist.");
assert.ok(end > start, "Dashboard Top Products query must have an end marker.");

const topProducts = source.slice(start, end);

// D5: a ranked item must represent a real catalog product.
assert.match(topProducts, /oi\.product_id IS NOT NULL/);
assert.match(topProducts, /LEFT JOIN products p ON p\.id = oi\.product_id/);
assert.match(
  topProducts,
  /GROUP BY oi\.product_id\s+ORDER BY units_sold DESC, revenue DESC, oi\.product_id ASC/,
);
assert.doesNotMatch(
  topProducts,
  /GROUP BY oi\.product_id,\s*oi\.product_name/,
  "A renamed snapshot must not split one catalog product into multiple rankings.",
);

// D5: only standard product orders belong in Top Products.
assert.match(
  topProducts,
  /LOWER\(COALESCE\(o\.order_type, 'standard'\)\) = 'standard'/,
);
assert.match(topProducts, /o\.status <> 'cancelled'/);

// D5: sale recognition comes from the payment ledger, not order creation.
assert.match(topProducts, /FROM payment_transactions pt/);
assert.match(topProducts, /LOWER\(pt\.status\) = 'verified'/);
assert.match(
  topProducts,
  /MIN\(COALESCE\(pt\.verified_at, pt\.created_at\)\) AS first_verified_at/,
);
assert.match(
  topProducts,
  /verified_sale\.first_verified_at >= \?[\s\S]*verified_sale\.first_verified_at < \?/,
);
assert.match(topProducts, /salesUtcParams/);
assert.doesNotMatch(
  topProducts,
  /DATE\(DATE_ADD\(o\.created_at/,
  "Top Products must not recognize a sale by order-created date.",
);

// D5: no brittle name blacklist. Names like "test" or "eto" disappear only
// when they are non-catalog/non-verified noise, not because of their text.
assert.doesNotMatch(topProducts, /product_name\s+NOT\s+IN/i);
assert.doesNotMatch(topProducts, /(?:'|")test(?:'|")/i);
assert.doesNotMatch(topProducts, /(?:'|")eto(?:'|")/i);

// Keep the existing response contract used by the Dashboard bar chart.
for (const field of ["product_id", "product_name", "units_sold", "revenue"]) {
  assert.match(topProducts, new RegExp(`\\b${field}\\b`));
}

console.log("PASS dashboardTopProductsIntegrity.test.js");
