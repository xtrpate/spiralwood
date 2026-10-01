const assert = require("node:assert/strict");
const fs = require("node:fs");

const dbPath = require.resolve("../config/db");
const reportsControllerPath = require.resolve("../controllers/staff/pos.reports");

const originalCache = new Map(
  [dbPath, reportsControllerPath].map((modulePath) => [
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
        total_orders: 3,
        gross_order_value: 30000,
        total_discount: 0,
        outstanding_balance: 7000,
      }]];
    }

    if (text.includes("COUNT(*) AS collection_count")) {
      return [[{ collection_count: 4, actual_collected: 23000 }]];
    }

    if (text.includes("AS period_label")) {
      return [[{ period_label: "2026-10-01", transaction_count: 4, total_sales: 23000 }]];
    }

    if (text.includes("GROUP BY pt.payment_method")) {
      return [[{ payment_method: "cash", count: 4, total_amount: 23000 }]];
    }

    if (text.includes("FROM order_items oi")) {
      return [[{ product_name: "Desk", qty: 1, gross_order_value: 10000 }]];
    }

    if (
      text.includes("SELECT COUNT(*) AS total") &&
      text.includes("FROM payment_transactions pt")
    ) {
      return [[{ total: 51 }]];
    }

    if (text.includes("pt.id AS payment_transaction_id")) {
      return [[{
        payment_transaction_id: 2,
        order_id: 10,
        amount: 3000,
        order_total: 10000,
        lifetime_collected: 3000,
        total_paid_after: 3000,
        remaining_balance: 7000,
        payment_status: "partial",
      }]];
    }

    throw new Error(`Unexpected SQL in test: ${text.slice(0, 120)}`);
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

async function execute(controller, user, query) {
  const res = makeRes();
  await controller.getReports({ user, query }, res);
  return res;
}

async function run() {
  installMock(dbPath, mockDb);
  delete require.cache[reportsControllerPath];

  const reportsController = require("../controllers/staff/pos.reports");
  const cashier = { id: 42, role: "staff", staff_type: "cashier", name: "Cashier One" };
  const admin = { id: 1, role: "admin", name: "Admin" };

  // Cashier: custom Philippine dates become raw UTC boundaries, report
  // ownership stays on verified_by, and pagination is explicit.
  resetCalls();
  const cashierRes = await execute(reportsController, cashier, {
    source: "all",
    payment: "all",
    period: "daily",
    from: "2026-10-01",
    to: "2026-10-02",
    page: "2",
    limit: "25",
  });

  assert.equal(cashierRes.statusCode, 200);
  assert.deepEqual(cashierRes.body.filters_applied, {
    source: "all",
    payment: "all",
    period: "daily",
    from: "2026-10-01",
    to: "2026-10-02",
  });
  assert.deepEqual(cashierRes.body.pagination, {
    page: 2,
    limit: 25,
    total: 51,
    total_pages: 3,
    has_previous: true,
    has_next: true,
  });
  assert.equal(cashierRes.body.totals.estimated_profit, undefined);
  assert.match(cashierRes.body.generated_at, /^\d{4}-\d{2}-\d{2}T/);

  const orderTotals = firstCallContaining("COUNT(*) AS total_orders");
  assert.match(orderTotals.sql, /EXISTS \(/);
  assert.match(orderTotals.sql, /pt_scope\.status = 'verified'/);
  assert.match(orderTotals.sql, /COALESCE\(pt_scope\.verified_at, pt_scope\.created_at\) >= \?/);
  assert.match(orderTotals.sql, /COALESCE\(pt_scope\.verified_at, pt_scope\.created_at\) < \?/);
  assert.match(orderTotals.sql, /pt_scope\.verified_by = \?/);
  assert.doesNotMatch(orderTotals.sql, /o\.created_at\s*[<>]=?\s*\?/);
  assert.doesNotMatch(orderTotals.sql, /estimated_profit/);
  assert.deepEqual(orderTotals.params, [
    "2026-09-30 16:00:00",
    "2026-10-02 16:00:00",
    42,
  ]);

  const collectionTotals = firstCallContaining("COUNT(*) AS collection_count");
  assert.match(collectionTotals.sql, /pt\.status = 'verified'/);
  assert.match(collectionTotals.sql, /o\.status <> 'cancelled'/);
  assert.match(collectionTotals.sql, /COALESCE\(pt\.verified_at, pt\.created_at\) >= \?/);
  assert.match(collectionTotals.sql, /COALESCE\(pt\.verified_at, pt\.created_at\) < \?/);
  assert.match(collectionTotals.sql, /pt\.verified_by = \?/);
  assert.doesNotMatch(collectionTotals.sql, /LOWER\(pt\.status\)/);
  assert.deepEqual(collectionTotals.params, [
    "2026-09-30 16:00:00",
    "2026-10-02 16:00:00",
    42,
  ]);

  const transactionQuery = firstCallContaining("pt.id AS payment_transaction_id");
  assert.match(transactionQuery.sql, /receipt\.total_paid_after/);
  assert.match(transactionQuery.sql, /receipt\.remaining_balance_after/);
  assert.match(transactionQuery.sql, /FROM payment_transactions pt_hist/);
  assert.match(transactionQuery.sql, /pt_hist\.status = 'verified'/);
  assert.match(transactionQuery.sql, /pt_hist\.id <= pt\.id/);
  assert.match(transactionQuery.sql, /receipt\.payment_label IN \('full_payment', 'balance_payment'\)/);
  assert.match(transactionQuery.sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(transactionQuery.params, [
    "2026-09-30 16:00:00",
    "2026-10-02 16:00:00",
    42,
    25,
    25,
  ]);

  const productQuery = firstCallContaining("FROM order_items oi");
  assert.doesNotMatch(productQuery.sql, /profit_margin|production_cost|estimated_profit/);

  // Every R3B1 DB operation is read-only.
  for (const call of calls) {
    assert.match(call.sql.trim(), /^SELECT\b/i);
    assert.doesNotMatch(call.sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
  }

  // Admin uses the same payment-date population even with payment=all; it
  // must not silently fall back to order.created_at reporting.
  resetCalls();
  const adminRes = await execute(reportsController, admin, {
    period: "daily",
    from: "2026-10-01",
    to: "2026-10-02",
  });
  assert.equal(adminRes.statusCode, 200);
  const adminOrderTotals = firstCallContaining("COUNT(*) AS total_orders");
  assert.match(adminOrderTotals.sql, /EXISTS \(/);
  assert.doesNotMatch(adminOrderTotals.sql, /pt_scope\.verified_by = \?/);
  assert.doesNotMatch(adminOrderTotals.sql, /o\.created_at\s*[<>]=?\s*\?/);
  assert.deepEqual(adminOrderTotals.params, [
    "2026-09-30 16:00:00",
    "2026-10-02 16:00:00",
  ]);

  // One-sided custom dates stay active instead of being discarded.
  resetCalls();
  const fromOnlyRes = await execute(reportsController, cashier, {
    period: "monthly",
    from: "2027-01-01",
  });
  assert.equal(fromOnlyRes.statusCode, 200);
  const fromOnlyCollections = firstCallContaining("COUNT(*) AS collection_count");
  assert.match(fromOnlyCollections.sql, /COALESCE\(pt\.verified_at, pt\.created_at\) >= \?/);
  assert.doesNotMatch(fromOnlyCollections.sql, /COALESCE\(pt\.verified_at, pt\.created_at\) < \?/);
  assert.deepEqual(fromOnlyCollections.params, [
    "2026-12-31 16:00:00",
    42,
  ]);

  resetCalls();
  const toOnlyRes = await execute(reportsController, cashier, {
    period: "monthly",
    to: "2026-12-31",
  });
  assert.equal(toOnlyRes.statusCode, 200);
  const toOnlyCollections = firstCallContaining("COUNT(*) AS collection_count");
  assert.doesNotMatch(toOnlyCollections.sql, /COALESCE\(pt\.verified_at, pt\.created_at\) >= \?/);
  assert.match(toOnlyCollections.sql, /COALESCE\(pt\.verified_at, pt\.created_at\) < \?/);
  assert.deepEqual(toOnlyCollections.params, [
    "2026-12-31 16:00:00",
    42,
  ]);

  // Strict validation: invalid requests fail before any SQL runs.
  const invalidCases = [
    [{ period: "banana" }, "Invalid report period."],
    [{ from: "2026-02-31" }, "Invalid from date. Use YYYY-MM-DD."],
    [{ to: "hello" }, "Invalid to date. Use YYYY-MM-DD."],
    [
      { from: "2026-10-02", to: "2026-10-01" },
      "Start date cannot be after end date.",
    ],
    [{ page: "0" }, "Invalid page. Use a positive integer."],
    [{ page: "abc" }, "Invalid page. Use a positive integer."],
    [{ limit: "201" }, "Invalid limit. Use a positive integer up to 200."],
    [{ source: "storefront" }, "Invalid order source filter."],
    [{ payment: "crypto" }, "Invalid payment type filter."],
  ];

  for (const [query, expectedMessage] of invalidCases) {
    resetCalls();
    const res = await execute(reportsController, cashier, query);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
    assert.equal(res.body?.message, expectedMessage, JSON.stringify(query));
    assert.equal(calls.length, 0, JSON.stringify(query));
  }

  // Invalid cashier sessions are rejected before report queries.
  resetCalls();
  const invalidSessionRes = await execute(
    reportsController,
    { role: "staff", id: 0 },
    { from: "2026-10-01", to: "2026-10-02" },
  );
  assert.equal(invalidSessionRes.statusCode, 401);
  assert.equal(invalidSessionRes.body?.message, "Invalid cashier session.");
  assert.equal(calls.length, 0);

  const frontendPath = require.resolve(
    "../../frontend/src/pages/staff/SalesReports.jsx",
  );
  const frontend = fs.readFileSync(frontendPath, "utf8");
  const cssPath = require.resolve(
    "../../frontend/src/pages/staff/SalesReports.css",
  );
  const css = fs.readFileSync(cssPath, "utf8");

  // R3B2A frontend contract: filters are drafted before they are applied,
  // one-sided dates are preserved, stale requests cannot overwrite newer
  // results, the last good report survives an update failure, and transaction
  // detail uses the server's explicit pagination contract.
  assert.match(frontend, /const PAGE_SIZE = 20;/);
  assert.match(frontend, /draftFilters/);
  assert.match(frontend, /appliedFilters/);
  assert.match(frontend, /setAppliedFilters\(\{ \.\.\.draftFilters \}\)/);
  assert.match(frontend, /loadReport\(appliedFilters, page\)/);
  assert.match(frontend, /requestSequenceRef/);
  assert.match(frontend, /requestId !== requestSequenceRef\.current/);
  assert.match(frontend, /requestSequenceRef\.current \+= 1/);
  assert.match(frontend, /page: pageToLoad/);
  assert.match(frontend, /limit: PAGE_SIZE/);
  assert.match(
    frontend,
    /if \(filtersToApply\.from\) params\.from = filtersToApply\.from;/,
  );
  assert.match(
    frontend,
    /if \(filtersToApply\.to\) params\.to = filtersToApply\.to;/,
  );
  assert.doesNotMatch(frontend, /if \(!filters\.from \|\| !filters\.to\)/);
  assert.doesNotMatch(frontend, /setData\(null\)/);
  assert.match(frontend, /onClick=\{handleGenerateReport\}/);
  assert.match(frontend, /Start date cannot be after end date\./);
  assert.match(frontend, /data\?\.filters_applied/);
  assert.match(frontend, /data\.generated_at/);
  assert.match(
    frontend,
    /Showing \{pageStart\}–\{pageEnd\} of \{totalTransactions\} transactions/,
  );
  assert.match(frontend, /Current Remaining Balance/);
  assert.match(frontend, /Paid After Payment/);
  assert.match(frontend, /Balance After Payment/);
  assert.match(frontend, /Status After Payment/);
  assert.match(frontend, /Top Products by Included Order Value/);
  assert.match(frontend, /Print Current View/);

  // R3B2B1 responsive contract: keep the desktop report intact while phones
  // receive touch-sized filters, stacked charts, mobile transaction/product
  // cards, and pagination that is usable without page-level horizontal scroll.
  assert.match(frontend, /import "\.\/SalesReports\.css";/);
  assert.match(frontend, /cashier-sales-mobile-transaction-list/);
  assert.match(frontend, /cashier-sales-mobile-transaction-card/);
  assert.match(frontend, /cashier-sales-mobile-product-list/);
  assert.match(frontend, /cashier-sales-mobile-product-card/);
  assert.match(
    frontend,
    /cashier-sales-mobile-transaction-list[\s\S]*Paid After Payment[\s\S]*Balance After Payment[\s\S]*Processed By/,
  );
  assert.match(css, /@media screen and \(max-width: 899px\)/);
  assert.match(css, /@media screen and \(max-width: 767px\)/);
  assert.match(
    css,
    /\.cashier-sales-chart-grid[\s\S]*grid-template-columns: minmax\(0, 1fr\) !important;/,
  );
  assert.match(
    css,
    /\.cashier-sales-input[\s\S]*min-height: 44px !important;[\s\S]*font-size: 16px !important;/,
  );
  assert.match(
    css,
    /\.cashier-sales-action[\s\S]*min-height: 44px !important;/,
  );
  assert.match(
    css,
    /\.cashier-sales-desktop-table[\s\S]*display: none !important;/,
  );
  assert.match(
    css,
    /\.cashier-sales-mobile-transaction-list,[\s\S]*display: grid;/,
  );
  assert.match(
    css,
    /\.cashier-sales-pagination-button[\s\S]*min-height: 44px !important;/,
  );
  // Print behavior is covered by the dedicated R3B2B2 contract below.


  // R3B2B1.2 tablet contract: the responsive card layout extends through
  // 899px while 768-899px gets a denser two-column filter grid and row-style
  // pagination without restoring the wide desktop tables.
  assert.match(
    css,
    /@media screen and \(min-width: 768px\) and \(max-width: 899px\)/,
  );
  assert.match(
    css,
    /\.cashier-sales-filter-grid[\s\S]*repeat\(2, minmax\(0, 1fr\)\) !important;/,
  );
  assert.match(css, /\.cashier-sales-print[\s\S]*grid-column: 1 \/ -1;/);
  assert.match(
    css,
    /@media screen and \(max-width: 899px\)[\s\S]*\.cashier-sales-desktop-table[\s\S]*display: none !important;/,
  );
  assert.match(
    css,
    /@media screen and \(max-width: 899px\)[\s\S]*\.cashier-sales-mobile-transaction-list,[\s\S]*display: grid;/,
  );

  // R3B2B1.1 mobile-card clarity contract: the prominent header amount is
  // explicitly identified as Amount Paid, while historical status remains
  // explicitly labeled Status After Payment instead of looking current.
  assert.match(frontend, /cashier-sales-mobile-summary-label[\s\S]*Amount Paid/);
  assert.match(
    frontend,
    /cashier-sales-mobile-transaction-list[\s\S]*Status After Payment[\s\S]*Processed By/,
  );
  assert.match(css, /\.cashier-sales-mobile-summary-label/);


  // R3B2B2 print contract: print a dedicated, scoped A4 landscape report
  // without fetching a second dataset or leaking the POS shell/customer phone.
  assert.match(frontend, /cashier-sales-print-report/);
  assert.match(frontend, /SPIRAL WOOD SERVICES/);
  assert.match(frontend, /CASHIER SALES REPORT/);
  assert.match(frontend, /data\?\.report_owner\?\.name/);
  assert.match(frontend, /disabled=\{!data \|\| loading\}/);
  assert.match(
    frontend,
    /Summary figures and payment-method totals cover the complete[\s\S]*current page only\./,
  );
  assert.match(
    frontend,
    /Current Remaining Balance is the current unpaid balance[\s\S]*not the historical[\s\S]*selected report period\./,
  );
  assert.match(frontend, /Top Products by Included Order Value/);

  const printMarkupStart = frontend.indexOf(
    'className="cashier-sales-print-report"',
  );
  const printMarkupEnd = frontend.indexOf(
    "function FilterField",
    printMarkupStart,
  );
  assert.ok(printMarkupStart >= 0 && printMarkupEnd > printMarkupStart);
  const printMarkup = frontend.slice(printMarkupStart, printMarkupEnd);
  assert.doesNotMatch(printMarkup, /customer_phone/);
  assert.doesNotMatch(printMarkup, /<BarChart/);
  assert.equal((frontend.match(/api\.get\("\/pos\/reports"/g) || []).length, 1);
  assert.equal((frontend.match(/window\.print\(\)/g) || []).length, 1);

  assert.match(css, /@page cashier-sales-report/);
  assert.match(css, /size: A4 landscape;/);
  assert.match(css, /page: cashier-sales-report;/);
  assert.match(css, /@media print/);
  assert.match(css, /body:has\(\.cashier-sales-print-report\)/);
  assert.match(
    css,
    /\.cashier-sales-report-page[\s\S]*> :not\(\.cashier-sales-print-report\)[\s\S]*display: none !important;/,
  );
  assert.match(css, /\.pos-sidebar/);
  assert.match(css, /\.pos-mobile-staff-topbar/);
  assert.match(css, /\.pos-mobile-bottom-nav/);
  assert.match(css, /break-inside: avoid;/);

  // R3B2B2.2 pagination polish: keep the transaction heading/scope with the
  // first printable transaction where space allows, while preserving readable
  // A4-landscape output and the existing no-split transaction contract.
  assert.match(
    css,
    /@page cashier-sales-report[\s\S]*margin: 8mm;/,
  );
  assert.match(
    css,
    /\.cashier-sales-print-transaction-scope[\s\S]*break-after: avoid;[\s\S]*page-break-after: avoid;/,
  );
  assert.match(
    css,
    /\.cashier-sales-print-section h3[\s\S]*page-break-after: avoid;/,
  );
  assert.doesNotMatch(css, /@page\s*\{/);

  console.log("✅ POS Sales Reports R3B1/R3B2A/R3B2B1/R3B2B1.1/R3B2B1.2/R3B2B2/R3B2B2.2 integrity tests passed.");
}

run()
  .catch((error) => {
    console.error("❌ POS Sales Reports R3B1/R3B2A/R3B2B1/R3B2B1.1/R3B2B1.2/R3B2B2/R3B2B2.2 integrity tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    restoreCache();
  });
