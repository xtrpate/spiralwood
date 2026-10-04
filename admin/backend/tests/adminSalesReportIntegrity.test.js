const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dbPath = require.resolve("../config/db");
const salesControllerPath = require.resolve("../controllers/admin/salesController");

const originalCache = new Map(
  [dbPath, salesControllerPath].map((modulePath) => [
    modulePath,
    require.cache[modulePath],
  ]),
);

const calls = [];

const mockDb = {
  async query(sql, params = []) {
    const text = String(sql);
    calls.push({ sql: text, params: [...params] });

    if (text.includes("COUNT(*) AS total_orders")) {
      return [[{
        total_orders: 2,
        gross_order_value: 30000,
        outstanding_balance: 5000,
        total_profit: 9000,
        avg_order_value: 15000,
        online_count: 2,
        walkin_count: 0,
      }]];
    }

    if (text.includes("COUNT(*) AS collection_count")) {
      return [[{ collection_count: 2, actual_collected: 25000 }]];
    }

    if (text.includes("pt.id AS payment_transaction_id")) {
      return [[]];
    }

    if (text.includes("LOWER(pt.payment_method) AS payment_method")) {
      return [[]];
    }

    if (text.includes("sales_revenue")) {
      return [[]];
    }

    if (text.includes("collected_this_period")) {
      return [[]];
    }

    if (text.includes("FROM order_items oi")) {
      return [[]];
    }

    throw new Error(`Unexpected SQL in Admin Sales test: ${text.slice(0, 160)}`);
  },
};

function installMock(modulePath, exportsValue) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
}

function restoreCache() {
  for (const [modulePath, cached] of originalCache.entries()) {
    delete require.cache[modulePath];
    if (cached) require.cache[modulePath] = cached;
  }
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    },
  };
}

function resetCalls() {
  calls.length = 0;
}

function firstCallContaining(fragment) {
  const call = calls.find((entry) => entry.sql.includes(fragment));
  assert.ok(call, `Expected SQL call containing: ${fragment}`);
  return call;
}

async function execute(controller, query) {
  const res = makeRes();
  await controller.getReport({ query }, res);
  return res;
}

async function run() {
  installMock(dbPath, mockDb);
  delete require.cache[salesControllerPath];

  const salesController = require("../controllers/admin/salesController");

  // Exact Philippine custom-day boundaries become raw UTC range predicates.
  resetCalls();
  const valid = await execute(salesController, {
    channel: "online",
    payment: "cash",
    from: "2026-10-01",
    to: "2026-10-02",
  });

  assert.equal(valid.statusCode, 200);
  assert.equal(calls.length, 8);

  const orderSummary = firstCallContaining("COUNT(*) AS total_orders");
  assert.match(orderSummary.sql, /o\.created_at >= \? AND o\.created_at < \?/);
  assert.doesNotMatch(orderSummary.sql, /CONVERT_TZ|DATE\(o\.created_at\)/);
  assert.deepEqual(orderSummary.params, [
    "online",
    "2026-09-30 16:00:00",
    "2026-10-02 16:00:00",
  ]);

  const collectionSummary = firstCallContaining("COUNT(*) AS collection_count");
  assert.match(
    collectionSummary.sql,
    /COALESCE\(pt\.verified_at, pt\.created_at\) >= \? AND COALESCE\(pt\.verified_at, pt\.created_at\) < \?/,
  );
  assert.deepEqual(collectionSummary.params, [
    "online",
    "2026-09-30 16:00:00",
    "2026-10-02 16:00:00",
  ]);

  // Invalid request shapes must fail before any database query runs.
  const invalidCases = [
    [{ period: "banana" }, "Invalid sales report period."],
    [
      { from: "2026-10-01" },
      "Both from and to dates are required for a custom sales range.",
    ],
    [
      { to: "2026-10-02" },
      "Both from and to dates are required for a custom sales range.",
    ],
    [
      { from: "2026-02-31", to: "2026-03-01" },
      "Invalid sales report date. Use a valid YYYY-MM-DD value.",
    ],
    [
      { from: "2026-10-03", to: "2026-10-02" },
      "Sales report start date cannot be after end date.",
    ],
  ];

  for (const [query, expectedMessage] of invalidCases) {
    resetCalls();
    const res = await execute(salesController, query);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.message, expectedMessage);
    assert.equal(calls.length, 0);
  }

  // Default period remains monthly, but uses Philippine boundaries converted
  // to raw UTC range predicates instead of applying SQL functions to columns.
  resetCalls();
  const defaultPeriod = await execute(salesController, {});
  assert.equal(defaultPeriod.statusCode, 200);
  const defaultOrderSummary = firstCallContaining("COUNT(*) AS total_orders");
  assert.match(defaultOrderSummary.sql, /o\.created_at >= \? AND o\.created_at < \?/);
  assert.doesNotMatch(defaultOrderSummary.sql, /CONVERT_TZ|YEAR\(|MONTH\(|DATE\(/);
  assert.equal(defaultOrderSummary.params.length, 2);
  assert.match(defaultOrderSummary.params[0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.match(defaultOrderSummary.params[1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

  // The controller remains read-only.
  for (const call of calls) {
    assert.match(call.sql.trim(), /^SELECT\b/i);
    assert.doesNotMatch(call.sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
  }

  // Frontend integrity checks protect the specific R1 behaviors without
  // requiring a browser test runner in the backend QA script.
  const frontendSource = fs.readFileSync(
    path.resolve(__dirname, "../../frontend/src/pages/sales/SalesReportPage.jsx"),
    "utf8",
  );
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, "../routes/admin.js"),
    "utf8",
  );
  const salesReportCss = fs.readFileSync(
    path.resolve(__dirname, "../../frontend/src/pages/sales/SalesReportPage.css"),
    "utf8",
  );

  assert.match(frontendSource, /useRef/);
  assert.match(frontendSource, /const requestId = \+\+requestIdRef\.current;/);
  assert.match(frontendSource, /requestId !== requestIdRef\.current/);
  assert.doesNotMatch(frontendSource, /setData\(null\);/);
  assert.match(frontendSource, /setAppliedFilters\(requestedFilters\)/);
  assert.match(frontendSource, /hasPermission\("sales_report\.export"\)/);
  assert.match(frontendSource, /api\.get\("\/sales\/report\/print"/);
  assert.match(frontendSource, /!data \|\| !appliedFilters \|\| loading \|\| !canExport/);
  assert.match(frontendSource, /timeZone: REPORT_TIME_ZONE/);
  assert.match(
    routeSource,
    /"\/sales\/report\/print"[\s\S]{0,220}requirePermission\("sales_report\.export"\)/,
  );
  assert.match(
    salesReportCss,
    /body:has\(\.sales-print-report\) \.wisdom-admin-shell \{[\s\S]{0,260}height: auto !important;[\s\S]{0,220}overflow: visible !important;[\s\S]{0,80}\}/,
  );
  assert.match(
    salesReportCss,
    /body:has\(\.sales-print-report\) \.wisdom-admin-main > main \{[\s\S]{0,300}overflow: visible !important;[\s\S]{0,160}padding: 0 !important;[\s\S]{0,80}\}/,
  );
  assert.match(
    salesReportCss,
    /body:has\(\.sales-print-report\) \.wisdom-sidebar,[\s\S]{0,140}\.wisdom-admin-topbar \{[\s\S]{0,80}display: none !important;/,
  );

  restoreCache();
  console.log("PASS adminSalesReportIntegrity.test.js");
}

run().catch((error) => {
  restoreCache();
  console.error(error);
  process.exit(1);
});
