const assert = require("assert");
const fs = require("fs");
const path = require("path");

const routePath = path.join(__dirname, "../routes/admin.js");
const controllerPath = require.resolve(
  "../controllers/admin/warrantyController",
);
const dbPath = require.resolve("../config/db");
const pagePath = path.join(
  __dirname,
  "../../frontend/src/pages/warranty/WarrantyPage.jsx",
);
const cssPath = path.join(
  __dirname,
  "../../frontend/src/pages/warranty/WarrantyPage.css",
);

const routeSource = fs.readFileSync(routePath, "utf8");
const controllerSource = fs.readFileSync(controllerPath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");
const cssSource = fs.readFileSync(cssPath, "utf8");

// Backend permission boundaries.
assert.match(
  routeSource,
  /"\/warranty",[\s\S]*?requirePermission\("warranty\.view"\),[\s\S]*?warrantyController\.getClaims/,
);
assert.match(
  routeSource,
  /"\/warranty\/:id\/resolution-options",[\s\S]*?requirePermission\("warranty\.manage"\),[\s\S]*?warrantyController\.getResolutionOptions/,
);
assert.match(
  routeSource,
  /"\/warranty\/:id\/decision",[\s\S]*?requirePermission\("warranty\.manage"\)/,
);
assert.match(
  routeSource,
  /"\/warranty\/:id\/fulfill",[\s\S]*?requirePermission\("warranty\.manage"\),[\s\S]*?warrantyFulfillmentUpload/,
);

// Claim-type data comes from existing order/item/product relationships.
assert.match(
  controllerSource,
  /LEFT JOIN order_items oi[\s\S]*ON oi\.id = w\.order_item_id[\s\S]*AND oi\.order_id = w\.order_id[\s\S]*LEFT JOIN products p ON p\.id = oi\.product_id/,
);
assert.match(controllerSource, /classifyWarrantyClaimType/);
assert.match(controllerSource, /claim_type:\s*claimType/);
assert.match(controllerSource, /catalog_product_type/);
assert.match(controllerSource, /has_customization/);

// Frontend capability gates and type visibility/filtering.
assert.match(pageSource, /useAuthStore/);
assert.match(pageSource, /hasPermission\("warranty\.manage"\)/);
assert.match(pageSource, /hasPermission\("orders\.view"\)/);
assert.match(pageSource, /canManage && statusKey === "pending"/);
assert.match(pageSource, /canManage && statusKey === "approved"/);
assert.match(pageSource, /canManageWarranty && decisionModal/);
assert.match(pageSource, /canManageWarranty && fulfillTarget/);
assert.match(pageSource, /Product Type/);
assert.match(pageSource, /All Types/);
assert.match(pageSource, /<option value="standard">Standard<\/option>/);
assert.match(pageSource, /<option value="custom">Custom<\/option>/);
assert.doesNotMatch(pageSource, /Standard \/ Ready-made/);
assert.doesNotMatch(pageSource, /Legacy \/ Unlinked/);
assert.doesNotMatch(
  pageSource,
  /<option value="legacy_unlinked">/,
  "Unknown or legacy linkage states must not be offered as Product Type filters.",
);
assert.match(
  pageSource,
  /legacy_unlinked:\s*\{[\s\S]*?label:\s*"Unknown"/,
  "Unresolved historical linkage may remain an internal fallback but must be shown as Unknown, not as a product type.",
);
assert.match(pageSource, /claimTypeFilter/);
assert.match(pageSource, /setClaimTypeFilter\(""\)/);
assert.match(pageSource, /\/staff\/admin\/orders\/\$\{orderId\}/);
assert.match(pageSource, /\/admin\/orders\/\$\{orderId\}/);
assert.match(pageSource, /canViewOrders \? \(/);
assert.match(cssSource, /warranty-filter-type/);
assert.match(cssSource, /warranty-type-label/);

// Dynamic classification checks.
//
// warrantyController imports config/db, whose production module intentionally
// verifies MySQL connectivity at module load. This unit test does not need a
// real database, so replace that dependency before requiring the controller.
// The previous R1 harness loaded the real DB module, printed PASS, then the DB
// startup check exited the test process when MySQL was unavailable.
const originalDbCache = require.cache[dbPath];
const originalControllerCache = require.cache[controllerPath];

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async () => {
      throw new Error("Unexpected database query in W6C classification test.");
    },
    getConnection: async () => {
      throw new Error("Unexpected database connection in W6C classification test.");
    },
  },
};
delete require.cache[controllerPath];

const controller = require(controllerPath);
const classify = controller.classifyWarrantyClaimType;
assert.equal(typeof classify, "function");

assert.equal(
  classify({
    linked_order_item_id: 10,
    order_type: "standard",
    catalog_product_id: 20,
    catalog_product_type: "standard",
    has_customization: 0,
  }),
  "standard",
);

assert.equal(
  classify({
    linked_order_item_id: 11,
    order_type: "blueprint",
    catalog_product_id: null,
    catalog_product_type: null,
    has_customization: 1,
  }),
  "custom",
);

assert.equal(
  classify({
    linked_order_item_id: 12,
    order_type: "standard",
    catalog_product_id: 21,
    catalog_product_type: "blueprint",
    has_customization: 0,
  }),
  "custom",
);

assert.equal(
  classify({
    linked_order_item_id: 13,
    order_type: "standard",
    catalog_product_id: 22,
    catalog_product_type: "standard",
    has_customization: 1,
  }),
  "standard",
  "exact standard catalog purchase remains standard even if legacy customization data is present",
);

assert.equal(
  classify({
    linked_order_item_id: null,
    order_type: "standard",
    catalog_product_id: 20,
    catalog_product_type: "standard",
    has_customization: 0,
  }),
  "legacy_unlinked",
);

assert.equal(
  classify({
    linked_order_item_id: 14,
    order_type: "standard",
    catalog_product_id: null,
    catalog_product_type: null,
    has_customization: 0,
  }),
  "legacy_unlinked",
);

if (originalControllerCache) require.cache[controllerPath] = originalControllerCache;
else delete require.cache[controllerPath];

if (originalDbCache) require.cache[dbPath] = originalDbCache;
else delete require.cache[dbPath];

console.log("PASS: Warranty permission and claim-type integrity checks passed.");
