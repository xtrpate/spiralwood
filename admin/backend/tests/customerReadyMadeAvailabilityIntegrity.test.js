"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const readBackend = (relPath) =>
  fs.readFileSync(path.join(backendRoot, relPath), "utf8");

const orders = readBackend("controllers/customer/customer.orders.js");
const products = readBackend("controllers/customer/customer.products.js");

// Standard online checkout must enforce ready-made availability on the server.
// The customer UI is not an authority because a client can call the API directly.
assert.match(
  orders,
  /FROM products p[\s\S]{0,700}WHERE p\.id = \?[\s\S]{0,180}AND p\.type = 'standard'[\s\S]{0,120}AND p\.is_active = 1[\s\S]{0,120}AND p\.is_published = 1[\s\S]{0,120}FOR UPDATE/,
);
assert.match(
  orders,
  /if \(!product \|\| Number\(product\.is_published\) !== 1\)[\s\S]{0,250}no longer available/,
);

// Public ready-made catalog/search/count/price queries share one authoritative
// base filter. A forged type=blueprint query therefore cannot expose blueprints
// through the ready-made product API.
assert.match(
  products,
  /WHERE p\.is_published = 1 AND p\.is_active = 1 AND p\.type = 'standard'/,
);

// Category facets must not advertise categories based only on archived products.
assert.match(
  products,
  /LEFT JOIN products p[\s\S]{0,220}p\.type = 'standard'[\s\S]{0,100}p\.is_published = 1[\s\S]{0,100}p\.is_active = 1/,
);

// Direct public product detail requests must follow the same invariant.
assert.match(
  products,
  /exports\.getProductById[\s\S]{0,2200}WHERE p\.id = \?[\s\S]{0,120}AND p\.is_published = 1[\s\S]{0,120}AND p\.is_active = 1[\s\S]{0,120}AND p\.type = 'standard'/,
);

console.log(
  "PASS: Customer ready-made availability integrity checks passed.",
);
