"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "../frontend/src");

const read = (relPath) =>
  fs.readFileSync(path.join(frontendRoot, relPath), "utf8");
const readBackend = (relPath) =>
  fs.readFileSync(path.join(backendRoot, relPath), "utf8");

const warrantyPage = read("pages/customer/warrantypage.jsx");
const warrantyCss = read("pages/customer/warrantypage.css");
const loginPage = read("pages/customer/loginpage.js");
const productCatalog = read("pages/customer/productcatalog.jsx");
const settingsPage = read("pages/website/WebsiteSettingsPage.jsx");
const apiSource = read("services/api.js");
const websiteController = readBackend(
  "controllers/admin/websiteController.js",
);

const fetchOrdersStart = warrantyPage.indexOf("const fetchOrders = useCallback(async () => {");
const fetchClaimsStart = warrantyPage.indexOf("const fetchClaims = useCallback(async (requestedPage) => {");
const focusEffectStart = warrantyPage.indexOf(
  'const rawFocusId = searchParams.get("focus_claim_id");',
);

assert.ok(fetchOrdersStart >= 0, "Customer warranty eligible-order loader must exist.");
assert.ok(fetchClaimsStart > fetchOrdersStart, "Customer warranty claims loader must exist.");
assert.ok(focusEffectStart > fetchClaimsStart, "Warranty focus resolver must exist.");

const fetchOrdersSource = warrantyPage.slice(fetchOrdersStart, fetchClaimsStart);
const fetchClaimsSource = warrantyPage.slice(fetchClaimsStart, focusEffectStart);

assert.match(
  fetchOrdersSource,
  /suppressGlobalErrorToast:\s*true/,
  "Warranty eligibility loader must use local recoverable error handling.",
);
assert.match(
  fetchClaimsSource,
  /suppressGlobalErrorToast:\s*true/,
  "Warranty claims loader must use local recoverable error handling.",
);

assert.doesNotMatch(
  fetchOrdersSource,
  /catch[\s\S]*setOrders\(\[\]\)/,
  "A warranty eligibility load failure must not erase the last successful orders.",
);
assert.doesNotMatch(
  fetchClaimsSource,
  /catch[\s\S]*setClaims\(\[\]\)/,
  "A warranty claims load failure must not erase the last successful claims.",
);

assert.match(
  fetchOrdersSource,
  /if \(!Array\.isArray\(res\.data\)\)/,
  "Malformed warranty eligibility responses must be treated as load failures.",
);
assert.match(
  fetchClaimsSource,
  /!Array\.isArray\(nextClaims\)/,
  "Malformed paginated warranty claims responses must be treated as load failures.",
);

assert.ok(
  warrantyPage.includes("ordersLoadError"),
  "Warranty eligibility needs a persistent error state.",
);
assert.ok(
  warrantyPage.includes("claimsLoadError"),
  "Warranty claims need a persistent error state.",
);
assert.ok(
  warrantyPage.includes("retryOrdersLoad"),
  "Warranty eligibility must have an explicit retry path.",
);
assert.ok(
  warrantyPage.includes("retryClaimsLoad"),
  "Warranty claims must have an explicit retry path.",
);
assert.ok(
  warrantyPage.includes('className="warranty-load-retry"'),
  "Warranty load errors must expose a retry control.",
);

assert.match(
  warrantyPage,
  /setFocusRetryNonce\(\(value\) => value \+ 1\)/,
  "A temporary focused-claim load failure must remain retryable without discarding the target.",
);
assert.match(
  warrantyPage,
  /if \(searchParams\.get\("focus_claim_id"\)\) \{\s*setClaimFocusResolving\(true\);/,
  "Retrying a failed focused claim must preserve and retry the original focus target.",
);

assert.match(
  warrantyPage,
  /claimsLoadedSuccessfully && claims\.length === 0/,
  "The no-claims message must require a successful claims load.",
);
assert.match(
  warrantyPage,
  /!ordersLoadError[\s\S]*!hasEligibleOrders/,
  "The no-eligible-orders message must not render for a load failure.",
);

assert.ok(
  warrantyPage.includes("Coverage starts from the customer handoff date."),
  "Customer warranty wording must match the backend handoff-date policy.",
);
assert.ok(
  warrantyPage.includes("valid-until date shown for each eligible order"),
  "Customer warranty wording must point to the authoritative order expiry date.",
);
assert.ok(
  warrantyPage.includes(
    "Approved repairs or replacements covered by the warranty",
  ),
  "Confirmed no-additional-cost coverage wording must remain scoped to approved covered service.",
);
assert.ok(
  warrantyPage.includes("are provided at no additional cost."),
  "Confirmed no-additional-cost policy must be stated clearly.",
);

for (const forbidden of [
  "Coverage starts from the completed order date.",
  "3-5 business days",
  "3–5 business days",
  "active 1-year warranty period",
]) {
  assert.equal(
    warrantyPage.includes(forbidden),
    false,
    `Customer warranty page must not retain unsupported/hardcoded wording: ${forbidden}`,
  );
}

assert.equal(
  loginPage.includes("1-year warranty on all completed orders"),
  false,
  "Login marketing must not promise a hardcoded one-year warranty to every completed order.",
);
assert.ok(
  loginPage.includes("Warranty support for eligible orders"),
  "Login warranty wording must be eligibility-based.",
);

assert.equal(
  productCatalog.includes('value: "1 year"'),
  false,
  "Product catalog must not hardcode a one-year warranty value.",
);
assert.equal(
  productCatalog.includes('value: "Eligible orders"'),
  false,
  "Product catalog must not retain the old vague warranty label.",
);
assert.match(
  productCatalog,
  /\.get\("\/website\/settings", \{ suppressGlobalErrorToast: true \}\)/,
  "Product catalog must load the current public Website Settings warranty policy.",
);
assert.ok(
  productCatalog.includes("res.data?.policy?.warranty_period_days"),
  "Product catalog must read warranty_period_days from the public policy group.",
);
assert.match(
  productCatalog,
  /warrantyPeriodDays[\s\S]{0,220}warrantyPeriodDays === 1 \? "day" : "days"/,
  "Product catalog must display the current warranty duration in days.",
);
assert.equal(
  productCatalog.includes("from handoff"),
  false,
  "Product catalog warranty label must stay concise and omit handoff wording.",
);
assert.match(
  websiteController,
  /PUBLIC_SETTING_KEYS[\s\S]{0,700}"warranty_period_days"/,
  "Public Website Settings must expose the customer-facing warranty period.",
);
assert.match(
  websiteController,
  /publicWarrantyPolicySupported[\s\S]{0,500}warranty_period_days/,
  "Public warranty settings must fail closed when the policy version is unsupported.",
);

assert.ok(
  settingsPage.includes(
    "Number of days covered from the customer handoff date (delivery or pickup).",
  ),
  "Admin warranty-period hint must match delivery/pickup handoff semantics.",
);

assert.match(
  apiSource,
  /suppressGlobalErrorToast[\s\S]*error\.config\?\.suppressGlobalErrorToast === true/,
  "Shared API client must support local recoverable load-error handling.",
);
assert.match(
  apiSource,
  /if \(!suppressGlobalErrorToast\) \{[\s\S]*Something went wrong\. Please try again\./,
  "500 fallback must be customer-safe and suppressible for local error states.",
);
assert.equal(
  apiSource.includes("Make sure the backend is running on port 5000."),
  false,
  "Customer-visible network errors must not expose local backend/port instructions.",
);

assert.ok(
  warrantyCss.includes(".warranty-load-error"),
  "Warranty load error state must be styled.",
);
assert.ok(
  warrantyCss.includes(".warranty-load-retry"),
  "Warranty retry control must be styled.",
);
assert.match(
  warrantyCss,
  /@media \(max-width: 560px\)[\s\S]*\.warranty-load-error/,
  "Warranty load error state must remain usable on mobile.",
);

console.log("PASS: Warranty customer load-error and policy integrity checks passed.");
