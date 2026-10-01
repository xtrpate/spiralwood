const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendSource = fs.readFileSync(
  path.join(__dirname, "../controllers/staff/pos.products.js"),
  "utf8",
);
const frontendSource = fs.readFileSync(
  path.join(__dirname, "../../frontend/src/pages/staff/ProductSearch.jsx"),
  "utf8",
);

assert.match(
  backendSource,
  /const\s+\{\s*q,\s*barcode,\s*ids\s*\}\s*=\s*req\.query/,
  "POS product API must support exact product-id reconciliation.",
);

assert.match(
  backendSource,
  /product\.price\s*=\s*hasValidCashierPrice\s*\?\s*cashierPrice\s*:\s*null/,
  "POS product API must expose one cashier price contract.",
);

assert.doesNotMatch(
  backendSource,
  /parseFloat\(product\.online_price\s*\|\|\s*0\)/,
  "POS product API must not silently fall back to a different legacy price.",
);

assert.match(
  frontendSource,
  /const\s+reconcileCartWithProducts\s*=/,
  "Product Search must reconcile persisted cart rows.",
);

assert.match(
  frontendSource,
  /params:\s*\{\s*ids:\s*productIds\.join\(","\)\s*\}/,
  "Product Search must validate the exact saved cart products against the backend.",
);

assert.match(
  frontendSource,
  /if\s*\(cartLocked\)\s*return\s+undefined/,
  "Cart reconciliation must not mutate an active online\/QR payment cart.",
);

assert.match(
  frontendSource,
  /unit_price:\s*unitPrice/,
  "New cart rows must use the normalized authoritative POS price.",
);

assert.match(
  frontendSource,
  /formatCurrency\(product\.price\)/,
  "Product card must display the normalized POS price.",
);

assert.match(
  frontendSource,
  /!product\.cashier_sale_available/,
  "Invalid cashier-price products must not be addable to cart.",
);

assert.match(
  frontendSource,
  /setCart\(\(currentCart\)\s*=>/,
  "Saved-cart reconciliation must merge against the latest React cart state.",
);

assert.match(
  frontendSource,
  /const\s+requestedProductIds\s*=\s*new Set\(productIds\)/,
  "Saved-cart reconciliation must scope its response to the products requested before the async refresh.",
);

assert.match(
  frontendSource,
  /if\s*\(!requestedProductIds\.has\(productId\)\)\s*\{\s*return\s*\[item\]/,
  "Products added while refresh is in flight must be preserved.",
);

assert.doesNotMatch(
  frontendSource,
  /product\?\.walkin_price\s*\?\?\s*product\?\.online_price/,
  "Product Search must not choose between separate legacy price fields.",
);

console.log(
  "PASS: POS product price + saved cart integrity regression checks passed.",
);