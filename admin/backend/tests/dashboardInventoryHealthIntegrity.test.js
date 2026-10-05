const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerPath = path.resolve(
  __dirname,
  "../controllers/admin/dashboardController.js",
);

const source = fs.readFileSync(controllerPath, "utf8");

const start = source.indexOf("1. INVENTORY");
const end = source.indexOf("2. CURRENT OPS & ORDERS", start);

assert.ok(start >= 0, "Dashboard inventory section must exist.");
assert.ok(end > start, "Dashboard inventory section must have an end marker.");

const inventory = source.slice(start, end);

assert.doesNotMatch(
  inventory,
  /SUM\(stock_status\s*=/,
  "Dashboard must not aggregate stored stock_status labels.",
);

assert.match(inventory, /FROM products p/);
assert.match(
  inventory,
  /LOWER\(COALESCE\(p\.type, 'standard'\)\) = 'standard'/,
);
assert.match(
  inventory,
  /COALESCE\(p\.stock, 0\) > COALESCE\(p\.reorder_point, 0\)/,
);
assert.match(
  inventory,
  /COALESCE\(p\.stock, 0\) > 0[\s\S]*COALESCE\(p\.stock, 0\) <= COALESCE\(p\.reorder_point, 0\)/,
);
assert.match(inventory, /COALESCE\(p\.stock, 0\) <= 0/);

assert.match(inventory, /FROM blueprint_material_reservations/);
assert.match(inventory, /status = 'reserved'/);
assert.match(inventory, /status = 'pending_stock'/);
assert.match(
  inventory,
  /COALESCE\(rm\.quantity, 0\)[\s\S]*COALESCE\(bmr_summary\.reserved_quantity, 0\)/,
);

assert.match(
  inventory,
  /COALESCE\(bmr_summary\.pending_need_quantity, 0\) > 0/,
);
assert.match(inventory, /COALESCE\(rm\.safety_stock, 0\)/);
assert.match(inventory, /COALESCE\(rm\.lead_time_days, 0\) > 0/);
assert.match(inventory, /avg_daily_usage_30d/);
assert.match(inventory, /COALESCE\(rm\.reorder_point, 0\)/);

assert.match(inventory, /FROM stock_movements/);
assert.match(inventory, /type = 'out'/);
assert.match(inventory, /reference LIKE 'BLUEPRINT-RESERVATION-%'/);
assert.match(
  inventory,
  /created_at >= DATE_SUB\(NOW\(\), INTERVAL 30 DAY\)/,
);

for (const field of [
  "healthy_stock_count",
  "low_stock_count",
  "critical_stock_count",
  "out_of_stock_count",
  "raw_healthy_stock",
  "raw_low_stock",
  "raw_critical_stock",
  "raw_out_of_stock",
  "alert_total",
]) {
  assert.match(source, new RegExp(`\\b${field}\\b`));
}

console.log("PASS dashboardInventoryHealthIntegrity.test.js");
