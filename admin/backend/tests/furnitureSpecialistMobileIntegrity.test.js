const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) =>
  fs.readFileSync(path.join(__dirname, relativePath), "utf8");

const dashboardBackend = read("../controllers/staff/pos.dashboard.js");
const productsBackend = read("../controllers/staff/pos.products.js");
const productRoutes = read("../routes/pos.products.js");
const dashboardFrontend = read("../../frontend/src/pages/staff/Dashboard.jsx");
const inventoryFrontend = read("../../frontend/src/pages/staff/InventoryLookup.jsx");
const appointmentsFrontend = read(
  "../../frontend/src/pages/staff/AppointmentScheduling.jsx",
);

const inventoryControllerSource = productsBackend.split(
  "/* ── Search Products (Barcode or Keyword) ── */",
)[0];

assert.match(
  inventoryControllerSource,
  /WHERE\s+p\.type\s*=\s*['"]standard['"]\s+AND\s+COALESCE\(p\.is_active,\s*0\)\s*=\s*1/s,
  "Furniture Specialist inventory must include only active standard products.",
);
assert.match(
  inventoryControllerSource,
  /LEFT JOIN\s+ready_made_display_stock\s+rmds\s+ON\s+rmds\.product_id\s*=\s*p\.id/i,
  "Furniture Specialist inventory must use ready-made display stock.",
);
assert.doesNotMatch(
  inventoryControllerSource,
  /production_cost|walkin_price|online_price|image_url|description/,
  "Inventory lookup must not expose unrelated pricing/cost/media fields.",
);

assert.match(
  productRoutes,
  /const\s+inventoryLookupAccess\s*=\s*\[authenticate,\s*requireIndoorStaffOrAdmin\]/,
  "Inventory lookup must be restricted to Furniture Specialist/Admin access.",
);
assert.match(
  productRoutes,
  /router\.get\("\/all",\s*inventoryLookupAccess,\s*posProductController\.getAllInventory\)/,
  "The /pos/products/all route must use the restricted inventory lookup guard.",
);
assert.match(
  productRoutes,
  /router\.get\("\/",\s*posAccess,\s*posProductController\.searchProducts\)/,
  "Cashier product search access must remain unchanged.",
);

assert.match(
  dashboardBackend,
  /SELECT\s+COUNT\(\*\)\s+AS\s+alert_count[\s\S]*ready_made_display_stock/,
  "Dashboard must calculate a real inventory-alert total from ready-made stock.",
);
assert.match(
  dashboardBackend,
  /inventory_alert_count:\s*Number\(/,
  "Dashboard API must expose inventory_alert_count separately from preview rows.",
);
assert.match(
  dashboardBackend,
  /WHERE\s+p\.type\s*=\s*['"]standard['"][\s\S]*COALESCE\(p\.is_active,\s*0\)\s*=\s*1/g,
  "Dashboard inventory count/preview must filter active standard products.",
);

assert.match(
  dashboardFrontend,
  /inventoryAlertCount/,
  "Furniture Specialist dashboard must use the backend's real inventory-alert total.",
);
assert.match(
  dashboardFrontend,
  /loadErrors/,
  "Furniture Specialist dashboard must distinguish request failures from real zero values.",
);
assert.match(
  dashboardFrontend,
  /Some dashboard data could not be loaded\./,
  "Furniture Specialist dashboard must visibly report partial load failures.",
);
assert.match(
  dashboardFrontend,
  /onClick=\{\(\) => setReloadToken\(\(value\) => value \+ 1\)\}/,
  "Furniture Specialist dashboard must provide Retry.",
);

assert.match(
  inventoryFrontend,
  /Unable to load inventory\. Please try again\./,
  "Inventory Lookup must expose request failures instead of fake empty inventory.",
);
assert.match(
  inventoryFrontend,
  /className="indoor-inventory-retry"/,
  "Inventory Lookup must provide Retry.",
);
assert.match(
  inventoryFrontend,
  /loading \|\| Boolean\(error\) \? "—"/,
  "Inventory summary cards must not show fake zero values while unavailable.",
);

assert.match(
  appointmentsFrontend,
  /appointmentsLoadError/,
  "Appointments must track load failures independently from action errors.",
);
assert.match(
  appointmentsFrontend,
  /Unable to load appointments\. Please try again\./,
  "Appointments must expose a load failure to Furniture Specialists.",
);
assert.match(
  appointmentsFrontend,
  /assigned:\s*"No assigned appointments\."/,
  "Appointment empty state must match the selected tab.",
);
assert.match(
  appointmentsFrontend,
  /completed:\s*"No completed appointments\."/,
  "Completed tab must not say 'No active appointments'.",
);

assert.doesNotMatch(
  dashboardFrontend,
  /label="Inventory Alerts"[\s\S]{0,120}inventoryAlerts\.length/,
  "Dashboard inventory KPI must not use limited preview length as the total.",
);

console.log(
  "PASS: Furniture Specialist inventory/dashboard/error-state integrity checks passed.",
);
