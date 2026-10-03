"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const controller = read(
  "admin/backend/controllers/customer/customer.warranty.js",
);
const routes = read("admin/backend/routes/customer.warranty.js");
const page = read("admin/frontend/src/pages/customer/warrantypage.jsx");
const css = read("admin/frontend/src/pages/customer/warrantypage.css");

assert.match(
  controller,
  /const CUSTOMER_WARRANTY_PAGE_SIZE = 10;/,
  "Customer warranty history must use the approved 10-row default page size.",
);
assert.match(
  controller,
  /const CUSTOMER_WARRANTY_MAX_PAGE_SIZE = 50;/,
  "Customer warranty history must enforce a bounded server page size.",
);
assert.match(
  controller,
  /rawPage === undefined \? 1 : parseStrictPositiveInt\(rawPage\)/,
  "Customer page parsing must reject malformed provided values instead of partial parsing.",
);
assert.match(
  controller,
  /rawLimit === undefined[\s\S]*parseStrictPositiveInt\(rawLimit\)/,
  "Customer limit parsing must be strict.",
);
assert.match(
  controller,
  /limit > CUSTOMER_WARRANTY_MAX_PAGE_SIZE/,
  "Customer limit must reject oversized requests.",
);

assert.match(
  controller,
  /SELECT COUNT\(\*\) AS total[\s\S]*FROM warranties[\s\S]*WHERE customer_id = \?/,
  "Customer claim pagination must count only the authenticated customer's history.",
);
assert.match(
  controller,
  /WHERE w\.customer_id = \?[\s\S]*ORDER BY w\.created_at DESC, w\.id DESC[\s\S]*LIMIT \? OFFSET \?/,
  "Customer claim pages must use deterministic newest-first ordering before LIMIT/OFFSET.",
);
assert.match(
  controller,
  /totalPages === 0[\s\S]*Math\.min\(requestedPage, Math\.max\(1, totalPages\)\)/,
  "Out-of-range customer pages must clamp safely to a valid page.",
);
assert.match(
  controller,
  /claims: rows\.map\(mapCustomerWarrantyClaim\)[\s\S]*pagination:/,
  "Customer list response must expose claims and pagination metadata.",
);

assert.match(
  routes,
  /router\.get\(\s*"\/:id"[\s\S]*warrantyController\.getClaimById/,
  "Customer warranty routes must expose an authenticated exact-claim read endpoint.",
);
assert.match(
  controller,
  /WHERE w\.id = \?[\s\S]*AND w\.customer_id = \?/,
  "Exact claim lookup must enforce authenticated customer ownership.",
);
assert.match(
  controller,
  /newer\.created_at > target\.created_at[\s\S]*newer\.created_at = target\.created_at[\s\S]*newer\.id > target\.id/,
  "Exact claim page resolution must use the same deterministic timestamp/id ordering without round-tripping timestamps through JavaScript.",
);
assert.match(
  controller,
  /Math\.floor\(preceding \/ limit\) \+ 1/,
  "Exact claim lookup must calculate the page containing the notification target.",
);

assert.match(
  page,
  /const CUSTOMER_WARRANTY_PAGE_SIZE = 10;/,
  "Frontend and backend customer claim page sizes must match.",
);
assert.match(
  page,
  /claimsRequestSequenceRef = useRef\(0\)/,
  "Customer claims loader must guard against stale out-of-order responses.",
);
assert.match(
  page,
  /requestId !== claimsRequestSequenceRef\.current/,
  "Customer stale responses must be ignored.",
);
assert.match(
  page,
  /const pageToLoad = Number\(requestedPage\)[\s\S]*api\.get\("\/customer\/warranty"[\s\S]*page: pageToLoad[\s\S]*limit: CUSTOMER_WARRANTY_PAGE_SIZE/,
  "Customer claim list must validate the requested page and request only that one server page.",
);
assert.match(
  page,
  /!Array\.isArray\(nextClaims\)[\s\S]*rawPagination/,
  "Malformed paginated claim responses must fail locally instead of corrupting state.",
);
assert.match(
  page,
  /setClaimsPagination\(nextPagination\)/,
  "Customer UI must retain server pagination metadata.",
);
assert.match(
  page,
  /claimsPagination\.total/,
  "Your claims count must use the whole-history server total, not current-page length.",
);
assert.match(
  page,
  /className="warranty-claims-pagination"/,
  "Customer claim history must expose pagination controls.",
);
assert.match(
  page,
  /fetchClaims\(1\), fetchOrders\(\)/,
  "A successful new claim must refresh history from page 1.",
);

assert.match(
  page,
  /api\.get\(\s*[\s\S]*?customer\/warranty\/\$\{focusClaimId\}/,
  "Notification focus must resolve the exact claim independently of the currently loaded page.",
);
assert.match(
  page,
  /fetchClaims\(targetPage\)/,
  "Notification focus must load the page that actually contains the exact claim.",
);
assert.match(
  page,
  /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/,
  "Notification focus must retry once if concurrent history changes move the target between pages.",
);
assert.match(
  page,
  /setFocusRetryNonce\(\(value\) => value \+ 1\)/,
  "Temporary focused-claim load failures must remain retryable without discarding the target.",
);

assert.match(
  page,
  /useCallback/,
  "Customer warranty loaders must use stable React callbacks.",
);
assert.match(
  page,
  /const fetchOrders = useCallback\(async \(\) =>/,
  "Warranty eligibility loading must be a stable callback.",
);
assert.match(
  page,
  /const fetchClaims = useCallback\(async \(requestedPage\) =>/,
  "Paginated claim loading must be a stable callback with an explicit page.",
);
assert.match(
  page,
  /\}, \[fetchClaims, fetchOrders\]\);/,
  "Initial warranty loading must declare stable loader dependencies.",
);
assert.match(
  page,
  /focusRetryNonce,[\s\S]*fetchClaims,[\s\S]*fetchOrders,[\s\S]*\]\);/,
  "Focused-claim resolution must declare both stable loader dependencies.",
);
assert.doesNotMatch(
  page,
  /react-hooks\/exhaustive-deps/,
  "Customer warranty code must not rely on unavailable react-hooks ESLint suppression rules.",
);
assert.doesNotMatch(
  page,
  /fetchClaims\(\)/,
  "Every customer claim refresh must pass an explicit page.",
);
assert.match(
  page,
  /fetchClaims\(claimsPage\)/,
  "Current-page refreshes must remain explicit after pagination.",
);

assert.match(
  css,
  /\.warranty-claims-pagination\s*\{/,
  "Customer claim pagination must have dedicated layout styling.",
);
assert.match(
  css,
  /@media \(max-width: 560px\)[\s\S]*\.warranty-claims-pagination/,
  "Customer claim pagination must remain usable on customer mobile layouts.",
);

// Runtime controller checks: pagination, clamping, malformed input, and ownership.
const controllerPath = require.resolve(
  "../controllers/customer/customer.warranty",
);
const dbPath = require.resolve("../config/db");
const signedUrlPath = require.resolve("../utils/signedUrl");
const notificationHelperPath = require.resolve("../utils/notificationHelper");
const auditLogPath = require.resolve("../middleware/auditLog");
const philippineTimePath = require.resolve("../utils/philippineTime");

const originals = new Map();
const remember = (modulePath) => {
  if (!originals.has(modulePath)) originals.set(modulePath, require.cache[modulePath]);
};
const install = (modulePath, exportsValue) => {
  remember(modulePath);
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
};
const restoreAll = () => {
  for (const [modulePath, entry] of originals.entries()) {
    if (entry) require.cache[modulePath] = entry;
    else delete require.cache[modulePath];
  }
};

const makeRes = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

let mode = "normal";
let lastListParams = null;
const pageRows = Array.from({ length: 10 }, (_, index) => ({
  id: 15 - index,
  order_id: 100 + index,
  order_item_id: 200 + index,
  order_number: "SWS-TEST-" + (index + 1),
  product_name: "Warranty Item " + (index + 1),
  claim_quantity: 1,
  reason: "Visible warranty issue.",
  admin_note: null,
  proof_url: null,
  status: "pending",
  warranty_expiry: "2027-10-02",
  replacement_receipt: null,
  resolution_type: null,
  resolution_notes: null,
  replacement_source: null,
  return_disposition: null,
  fulfilled_at: null,
  created_at: new Date("2026-10-02T00:00:00.000Z"),
  updated_at: new Date("2026-10-02T00:00:00.000Z"),
}));

const dbStub = {
  query: async (sql, params = []) => {
    const text = String(sql);

    if (text.includes("SELECT COUNT(*) AS total") && text.includes("FROM warranties")) {
      return [[{ total: 25 }]];
    }

    if (text.includes("ORDER BY w.created_at DESC, w.id DESC")) {
      lastListParams = params;
      return [pageRows];
    }

    if (
      text.includes("WHERE w.id = ?") &&
      text.includes("AND w.customer_id = ?") &&
      text.includes("LIMIT 1")
    ) {
      if (mode === "not-found") return [[]];
      return [[{
        ...pageRows[0],
        id: 7,
        order_id: 777,
        order_item_id: 888,
      }]];
    }

    if (
      text.includes("FROM warranties newer") &&
      text.includes("INNER JOIN warranties target")
    ) {
      return [[{ preceding: 14 }]];
    }

    throw new Error("Unexpected W8B test query: " + text);
  },
};

async function runRuntimeChecks() {
  install(dbPath, dbStub);
  install(signedUrlPath, { signUploadPath: (value) => value });
  install(notificationHelperPath, { createNotificationSafe: async () => true });
  install(auditLogPath, { writeAuditLogSafe: async () => true });
  install(philippineTimePath, { getPhilippineDateKey: () => "2026-10-02" });

  remember(controllerPath);
  delete require.cache[controllerPath];

  try {
    const customerController = require(controllerPath);

    {
      const res = makeRes();
      lastListParams = null;
      await customerController.getClaims(
        { query: { page: "2", limit: "10" }, user: { id: 40 } },
        res,
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.pagination?.page, 2);
      assert.equal(res.body?.pagination?.limit, 10);
      assert.equal(res.body?.pagination?.total, 25);
      assert.equal(res.body?.pagination?.totalPages, 3);
      assert.deepEqual(lastListParams, [40, 10, 10]);
    }

    {
      const res = makeRes();
      lastListParams = null;
      await customerController.getClaims(
        { query: { page: "999", limit: "10" }, user: { id: 40 } },
        res,
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.pagination?.page, 3);
      assert.deepEqual(lastListParams, [40, 10, 20]);
    }

    for (const query of [
      { page: "2abc", limit: "10" },
      { page: "1.5", limit: "10" },
      { page: "0", limit: "10" },
      { page: "1", limit: "51" },
    ]) {
      const res = makeRes();
      await customerController.getClaims({ query, user: { id: 40 } }, res);
      assert.equal(res.statusCode, 400);
    }

    {
      mode = "normal";
      const res = makeRes();
      await customerController.getClaimById(
        { params: { id: "7" }, query: { limit: "10" }, user: { id: 40 } },
        res,
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.claim?.id, 7);
      assert.equal(res.body?.pagination?.page, 2);
      assert.equal(res.body?.pagination?.limit, 10);
    }

    {
      mode = "not-found";
      const res = makeRes();
      await customerController.getClaimById(
        { params: { id: "7" }, query: { limit: "10" }, user: { id: 999 } },
        res,
      );
      assert.equal(res.statusCode, 404);
      assert.match(res.body?.message || "", /not found/i);
    }
  } finally {
    restoreAll();
  }
}

runRuntimeChecks()
  .then(() => {
    console.log(
      "PASS: Customer warranty pagination, ownership, stale-response, and deep-link integrity checks passed.",
    );
  })
  .catch((error) => {
    console.error("FAIL: Customer warranty pagination integrity checks failed.");
    console.error(error);
    process.exitCode = 1;
  });
