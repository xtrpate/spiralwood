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

const inventory = readBackend("controllers/admin/inventoryController.js");
const product = readBackend("controllers/admin/productController.js");
const page = readFrontend("pages/inventory/StockMovementPage.jsx");
const buildMaterialsPage = readFrontend(
  "pages/inventory/BuildMaterialsPage.jsx",
);

assert.match(inventory, /Supplier is only allowed for raw material Stock In\./);
assert.match(inventory, /Reference is required for supplier Stock In\./);
assert.match(inventory, /Selected supplier no longer exists\./);
assert.match(
  inventory,
  /Enter a different quantity to record an adjustment\./,
);
assert.match(inventory, /SELECT id FROM suppliers WHERE id = \? LIMIT 1/);

assert.match(page, /requiresSupplierReference/);
assert.match(page, /requiresReference/);
assert.match(page, /Reference is required for supplier Stock In\./);
assert.match(
  page,
  /Enter a quantity different from the current stock to record an adjustment\./,
);
assert.match(page, /required=\{requiresReference\}/);

assert.match(product, /FROM products p[\s\S]{0,500}FOR UPDATE/);
assert.match(product, /stock_movements_count/);
assert.match(product, /order_items_count/);
assert.match(product, /stock_transfer_items_count/);
assert.match(
  product,
  /has inventory or sales history and cannot be permanently deleted/,
);
assert.match(product, /still has stock on hand and cannot be permanently deleted/);
assert.match(product, /Disable or unpublish it instead/);
assert.match(product, /DELETE FROM products WHERE id = \?/);
assert.match(
  product,
  /exports\.toggleActive[\s\S]{0,7000}Unpublish the product before archiving it\./,
);
assert.match(
  product,
  /exports\.toggleActive[\s\S]{0,7000}still has stock on hand and cannot be archived/,
);
assert.match(
  product,
  /exports\.toggleActive[\s\S]{0,7000}ready_made_display_stock/,
);
assert.match(
  buildMaterialsPage,
  /still has \$\{pendingStock\} unit\(s\) in stock/,
);
assert.match(buildMaterialsPage, /const stockedProducts = products\.filter/);
assert.match(
  buildMaterialsPage,
  /Reduce all selected products to zero stock through Stock Movement before archiving them\./,
);

console.log("PASS: Stock Movement SM2A integrity checks passed.");
