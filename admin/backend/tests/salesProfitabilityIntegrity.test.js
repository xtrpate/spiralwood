const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const dbPath = require.resolve("../config/db");
const reportsControllerPath = require.resolve(
  "../controllers/admin/reportsController",
);
const previousDbCache = require.cache[dbPath];
const previousControllerCache = require.cache[reportsControllerPath];

const calls = [];

const mockDb = {
  query: async (sql, params = []) => {
    calls.push({ sql: String(sql), params });

    if (/LIMIT \? OFFSET \?/i.test(sql)) {
      return [
        [
          {
            order_id: 501,
            order_number: "SWS-TEST-0501",
            order_date: "2026-10-04 12:00:00",
            order_type: "standard",
            customer_id: 42,
            customer_name: "Test Customer",
            revenue: "15000.00",
            cogs: "9000.00",
          },
        ],
      ];
    }

    if (/COUNT\(\*\) AS total/i.test(sql)) {
      return [
        [
          {
            total: 1,
            total_revenue: "15000.00",
            total_cogs: "9000.00",
          },
        ],
      ];
    }

    throw new Error(`Unexpected profitability SQL in integrity test: ${sql}`);
  },
};

function installMock() {
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: mockDb,
    children: [],
    paths: [],
  };
  delete require.cache[reportsControllerPath];
}

function restoreCache() {
  if (previousDbCache) require.cache[dbPath] = previousDbCache;
  else delete require.cache[dbPath];

  if (previousControllerCache) {
    require.cache[reportsControllerPath] = previousControllerCache;
  } else {
    delete require.cache[reportsControllerPath];
  }
}

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
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

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

async function run() {
  installMock();

  const reportsController = require("../controllers/admin/reportsController");
  const res = makeRes();

  await reportsController.getSalesProfitabilityReport(
    { query: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.equal(res.body?.records?.length, 1);
  assert.equal(res.body?.records?.[0]?.gross_profit, 6000);
  assert.equal(res.body?.records?.[0]?.margin_percentage, "40.00");

  const recordsCall = calls.find((entry) => /LIMIT \? OFFSET \?/i.test(entry.sql));
  const summaryCall = calls.find((entry) => /COUNT\(\*\) AS total/i.test(entry.sql));

  assert.ok(recordsCall, "Expected profitability records query.");
  assert.ok(summaryCall, "Expected profitability summary query.");

  for (const call of [recordsCall, summaryCall]) {
    assert.match(call.sql, /o\.status = 'completed'/);
    assert.doesNotMatch(call.sql, /'delivered'/);
    assert.match(call.sql.trim(), /^SELECT\b/i);
    assert.doesNotMatch(
      call.sql,
      /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i,
    );
  }

  assert.match(recordsCall.sql, /o\.created_at AS order_date/);
  assert.doesNotMatch(recordsCall.sql, /date_sold/);

  const customerSource = fs.readFileSync(
    path.resolve(__dirname, "../controllers/customer/customer.orders.js"),
    "utf8",
  );
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, "../routes/admin.reports.js"),
    "utf8",
  );
  const frontendSource = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../frontend/src/pages/reports/SalesProfitabilityReportPage.jsx",
    ),
    "utf8",
  );

  assert.match(customerSource, /p\.online_price,\s+p\.production_cost,\s+p\.stock,/);
  assert.match(
    customerSource,
    /production_cost:\s*roundMoney\(Number\(product\.production_cost \|\| 0\)\)/,
  );
  assert.match(
    customerSource,
    /product_name, quantity, unit_price, production_cost, customization_json\)[\s\S]{0,120}VALUES \(\?,\?,\?,\?,\?,\?,\?\)/,
  );
  assert.match(
    customerSource,
    /item\.unit_price,\s*item\.production_cost,\s*readyMadeCustomizationJson/,
  );

  assert.match(
    routeSource,
    /"\/sales-profitability\/export"[\s\S]{0,220}requirePermission\("sales_report\.export"\)/,
  );
  assert.match(
    routeSource,
    /"\/sales-profitability"[\s\S]{0,220}requirePermission\("sales_report\.view"\)/,
  );

  assert.match(frontendSource, /const \{ user, hasPermission \} = useAuthStore\(\);/);
  assert.match(
    frontendSource,
    /const canExport = hasPermission\("sales_report\.export"\);/,
  );
  assert.match(
    frontendSource,
    /const SALES_PROFITABILITY_EXPORT_ENDPOINT =[\s\S]{0,80}"\/reports\/sales-profitability\/export";/,
  );
  assert.equal(
    countMatches(frontendSource, /api\.get\(SALES_PROFITABILITY_EXPORT_ENDPOINT, \{/g),
    2,
  );
  assert.equal(
    countMatches(frontendSource, /api\.get\("\/reports\/sales-profitability", \{/g),
    1,
  );
  assert.match(frontendSource, /\|\| !canExport/);
  assert.match(frontendSource, />Order Date<|"Order Date"/);
  assert.match(frontendSource, /r\.order_date/);
  assert.match(frontendSource, /row\.order_date/);
  assert.doesNotMatch(frontendSource, /Date Sold|date_sold/);
  assert.match(frontendSource, /<strong>Scope:<\/strong> Completed Orders/);
  assert.doesNotMatch(frontendSource, /Completed and Delivered Orders/);

  restoreCache();
  console.log("PASS salesProfitabilityIntegrity.test.js");
}

run().catch((error) => {
  restoreCache();
  console.error(error);
  process.exit(1);
});
