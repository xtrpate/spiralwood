"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "../frontend/src");

const readBackend = (relPath) =>
  fs.readFileSync(path.join(backendRoot, relPath), "utf8");
const readFrontend = (relPath) =>
  fs.readFileSync(path.join(frontendRoot, relPath), "utf8");

const controller = readBackend("controllers/admin/inventoryController.js");
const routes = readBackend("routes/admin.js");
const page = readFrontend("pages/inventory/StockMovementPage.jsx");
const exportUtil = readFrontend("utils/stockMovementExport.js");

assert.match(controller, /parseStrictPositiveInt/);
assert.match(controller, /Invalid raw material selection\./);
assert.match(controller, /Invalid ready-made product selection\./);
assert.match(controller, /p\.is_active/);
assert.match(
  controller,
  /Archived ready-made products cannot receive stock movements/,
);
assert.match(
  controller,
  /Reference is required for adjustments and returns\./,
);
assert.match(controller, /Reason is required for adjustments and returns\./);
assert.match(controller, /Reference must be 100 characters or less\./);
assert.match(controller, /Notes must be 1000 characters or less\./);
assert.match(controller, /Stock movement request failed\./);
assert.match(
  controller,
  /console\.error\("\[inventory\.createStockMovement\]"/,
);
assert.match(controller, /MAX_READY_MADE_MOVEMENT_QUANTITY/);

assert.match(
  routes,
  /"\/inventory\/movements\/export"[\s\S]{0,180}stock_movements\.export/,
);
assert.match(
  routes,
  /"\/inventory\/movements"[\s\S]{0,180}stock_movements\.view/,
);
assert.match(
  routes,
  /router\.post\([\s\S]{0,120}"\/inventory\/movements"[\s\S]{0,180}stock_movements\.create/,
);

assert.match(page, /useAuthStore/);
assert.match(
  page,
  /canCreateMovement[\s\S]{0,100}stock_movements\.create/,
);
assert.match(
  page,
  /canExportMovements[\s\S]{0,100}stock_movements\.export/,
);
assert.match(page, /api\.get\("\/inventory\/movements\/export"/);
assert.match(
  page,
  /"Date and time",\s*"Item",\s*"Movement",\s*"Source",\s*"Quantity"/,
);

const quantityHelperStart = page.indexOf("const getMovementQuantityLabel");
const quantityHelperEnd = page.indexOf(
  "// WISDOM STOCK READY-MADE",
  quantityHelperStart,
);
assert.ok(quantityHelperStart >= 0 && quantityHelperEnd > quantityHelperStart);
const quantityHelper = page.slice(quantityHelperStart, quantityHelperEnd);
assert.match(quantityHelper, /Math\.abs/);
assert.doesNotMatch(quantityHelper, /Set to|isPositive|\? "\+" : "-"/);

assert.match(
  page,
  /Reference is required for adjustments and returns\./,
);
assert.match(page, /Reason is required for adjustments and returns\./);
assert.match(page, /Current[\s\S]{0,800}New[\s\S]{0,800}Difference/);
assert.match(
  page,
  /Increase[\s\S]{0,300}Decrease[\s\S]{0,300}No change/,
);

assert.match(
  exportUtil,
  /key: "date"[\s\S]{0,100}key: "item"[\s\S]{0,100}key: "movement"[\s\S]{0,100}key: "source"/,
);

console.log("PASS: Stock Movement SM1 integrity checks passed.");
