const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const authStoreSource = fs.readFileSync(
  path.join(__dirname, "../../frontend/src/store/authStore.js"),
  "utf8",
);
const apiSource = fs.readFileSync(
  path.join(__dirname, "../../frontend/src/services/api.js"),
  "utf8",
);

assert.match(
  authStoreSource,
  /const\s+clearCashierCashState\s*=/,
  "Auth store must have one Cash POS cleanup helper.",
);

assert.match(
  authStoreSource,
  /sessionStorage\.removeItem\("pos_cash_checkout"\)/,
  "Cash checkout safety state must be removable.",
);

assert.match(
  authStoreSource,
  /clearCashierCashState\(\{\s*preserveQrCart:\s*true\s*\}\)/,
  "A successful login must start a clean Cash workspace without deleting QR-owned cart state.",
);

assert.match(
  authStoreSource,
  /const\s+clearSession\s*=\s*\(\)\s*=>[\s\S]*clearCashierCashState\(\)/,
  "Normal logout must clear Cash-owned POS session state.",
);

assert.doesNotMatch(
  authStoreSource,
  /removeItem\("pos_qr_attempt"\)/,
  "C3A must not delete teammate-owned QR payment state from authStore.",
);

assert.match(
  apiSource,
  /if\s*\(status\s*===\s*401\)[\s\S]*sessionStorage\.removeItem\("pos_cash_checkout"\)/,
  "Protected-request 401 handling must clear the stale Cash checkout key.",
);

assert.match(
  apiSource,
  /if\s*\(!sessionStorage\.getItem\("pos_qr_attempt"\)\)\s*\{\s*sessionStorage\.removeItem\("pos_cart"\)/,
  "401 handling must clear the Cash cart when no QR attempt owns it.",
);

assert.doesNotMatch(
  apiSource,
  /sessionStorage\.removeItem\("pos_qr_attempt"\)/,
  "C3A 401 cleanup must not delete teammate-owned QR attempt state.",
);

console.log("PASS: Cashier Cash session isolation checks passed.");