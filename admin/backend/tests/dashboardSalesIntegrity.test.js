const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dbPath = require.resolve("../config/db");
const controllerPath = require.resolve("../controllers/admin/dashboardController");

const originalCache = new Map(
  [dbPath, controllerPath].map((modulePath) => [
    modulePath,
    require.cache[modulePath],
  ]),
);

const calls = [];

const zeroOrders = {
  total_orders: 0,
  completed_orders: 0,
  pending_orders: 0,
  confirmed_orders: 0,
  contract_released_orders: 0,
  production_orders: 0,
  ready_for_pickup_orders: 0,
  shipping_orders: 0,
  delivered_orders: 0,
  cancelled_orders: 0,
};

const mockDb = {
  async query(sql, params = []) {
    const text = String(sql);
    calls.push({ sql: text, params: [...params] });

    if (
      text.includes("COUNT(*) AS total_products") &&
      text.includes("FROM products")
    ) {
      return [[{
        total_products: 0,
        healthy_stock_count: 0,
        low_stock_count: 0,
        critical_stock_count: 0,
        out_of_stock_count: 0,
      }]];
    }

    if (
      text.includes("COUNT(*) AS total_raw_materials") &&
      text.includes("FROM raw_materials")
    ) {
      return [[{
        total_raw_materials: 0,
        raw_healthy_stock: 0,
        raw_low_stock: 0,
        raw_critical_stock: 0,
        raw_out_of_stock: 0,
      }]];
    }

    if (
      text.includes("stock_in_total") &&
      text.includes("FROM stock_movements")
    ) {
      return [[{ stock_in_total: 0, stock_out_total: 0 }]];
    }

    if (
      text.includes("COUNT(*) AS total_orders") &&
      text.includes("completed_orders") &&
      text.includes("FROM orders")
    ) {
      return [[{ ...zeroOrders }]];
    }

    if (
      text.includes("open_orders") &&
      text.includes("delivered_unpaid_orders")
    ) {
      return [[{
        open_orders: 0,
        open_pending_orders: 0,
        delivered_unpaid_orders: 0,
      }]];
    }

    if (
      text.includes("AS order_value") &&
      text.includes("AVG(o.total)")
    ) {
      return [[{
        order_value: 4311308.98,
        avg_order_value: 29733.17,
        online_orders: 145,
        walkin_orders: 0,
      }]];
    }

    if (
      text.includes("AS verified_collections") &&
      text.includes("verified_payment_count")
    ) {
      return [[{
        verified_collections: 17378232.71,
        verified_payment_count: 151,
      }]];
    }

    if (
      text.includes("COUNT(*) AS pending_reviews") &&
      text.includes("FROM payment_transactions")
    ) {
      return [[{ pending_reviews: 36 }]];
    }

    if (text.includes("COUNT(*) AS total_blueprint_orders")) {
      return [[{
        total_blueprint_orders: 0,
        pending_custom_review: 0,
        quotation_approved: 0,
        contract_released: 0,
        in_production: 0,
        fulfillment: 0,
        completed_blueprint_orders: 0,
        cancelled_blueprint_orders: 0,
      }]];
    }

    if (
      text.includes("DATE_FORMAT") &&
      text.includes("online_sales") &&
      text.includes("walkin_sales") &&
      text.includes("FROM payment_transactions pt")
    ) {
      return [[
        {
          bucket: "2026-09-06",
          online_sales: 600,
          walkin_sales: 400,
        },
      ]];
    }

    if (
      text.includes("oi.product_name") &&
      text.includes("units_sold")
    ) {
      return [[]];
    }

    if (
      text.includes("COALESCE(u.name, o.walkin_customer_name") &&
      text.includes("LIMIT 15")
    ) {
      return [[]];
    }

    throw new Error(
      `Unexpected SQL in dashboard D2 test: ${text.slice(0, 220)}`,
    );
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

function firstCallContaining(fragment) {
  const call = calls.find((entry) => entry.sql.includes(fragment));
  assert.ok(call, `Expected SQL call containing: ${fragment}`);
  return call;
}

async function execute(controller, query) {
  const res = makeRes();
  await controller.getDashboard({ query }, res);
  return res;
}

async function run() {
  installMock(dbPath, mockDb);
  delete require.cache[controllerPath];

  try {
    const controller = require("../controllers/admin/dashboardController");

    calls.length = 0;

    const res = await execute(controller, {
      from: "2026-09-06",
      to: "2026-10-05",
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.sales?.order_value, 4311308.98);
    assert.equal(res.body?.sales?.verified_collections, 17378232.71);
    assert.equal(res.body?.sales?.total_revenue, 17378232.71);
    assert.equal(res.body?.sales?.verified_payment_count, 151);
    assert.equal(
      Object.prototype.hasOwnProperty.call(res.body?.sales || {}, "total_profit"),
      false,
    );

    const staleProfitCalls = calls.filter(
      (call) =>
        call.sql.includes("FROM order_items oi") &&
        call.sql.includes("AS total_profit"),
    );
    assert.equal(
      staleProfitCalls.length,
      0,
      "Dashboard must not calculate the retired order-item profit metric.",
    );

    const orderValueCall = firstCallContaining("AS order_value");
    assert.match(
      orderValueCall.sql,
      /o\.created_at >= \?\s+AND o\.created_at < \?/,
    );
    assert.deepEqual(orderValueCall.params, [
      "2026-09-05 16:00:00",
      "2026-10-05 16:00:00",
    ]);

    const collectionCall = firstCallContaining("AS verified_collections");
    assert.match(collectionCall.sql, /FROM payment_transactions pt/);
    assert.match(collectionCall.sql, /LOWER\(pt\.status\) = 'verified'/);
    assert.match(
      collectionCall.sql,
      /COALESCE\(pt\.verified_at, pt\.created_at\) >= \?/,
    );
    assert.match(
      collectionCall.sql,
      /COALESCE\(pt\.verified_at, pt\.created_at\) < \?/,
    );
    assert.doesNotMatch(collectionCall.sql, /o\.status\s*(?:!=|<>)/);
    assert.deepEqual(collectionCall.params, [
      "2026-09-05 16:00:00",
      "2026-10-05 16:00:00",
    ]);

    const chartCall = calls.find(
      (call) =>
        call.sql.includes("online_sales") &&
        call.sql.includes("FROM payment_transactions pt"),
    );
    assert.ok(chartCall, "Expected verified-payment collection trend query.");
    assert.match(
      chartCall.sql,
      /CASE WHEN o\.type = 'online' THEN pt\.amount ELSE 0 END/,
    );
    assert.match(
      chartCall.sql,
      /CASE WHEN o\.type = 'walkin' THEN pt\.amount ELSE 0 END/,
    );
    assert.match(chartCall.sql, /LOWER\(pt\.status\) = 'verified'/);
    assert.deepEqual(chartCall.params, [
      "2026-09-05 16:00:00",
      "2026-10-05 16:00:00",
    ]);

    assert.equal(res.body?.salesChart?.[0]?.online_sales, 600);
    assert.equal(res.body?.salesChart?.[0]?.walkin_sales, 400);

    for (const call of calls) {
      assert.match(call.sql.trim(), /^SELECT\b/i);
      assert.doesNotMatch(
        call.sql,
        /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|TRUNCATE)\b/i,
      );
    }

    const frontendSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../frontend/src/pages/dashboard/DashboardPage.jsx",
      ),
      "utf8",
    );

    assert.match(frontendSource, /title="Verified collections"/);
    assert.match(
      frontendSource,
      /sales\.verified_collections \?\? sales\.total_revenue/,
    );
    assert.match(frontendSource, /Order value/);
    assert.match(frontendSource, />Collection trend<\/h2>/);
    assert.match(frontendSource, /Online Collections/);
    assert.match(frontendSource, /Walk-in Collections/);
    assert.match(
      frontendSource,
      /Verified online and walk-in payments for the selected period\./,
    );
    assert.doesNotMatch(
      frontendSource,
      /<MetricCard\s+[\s\S]{0,80}title="Sales"/,
    );

    console.log("PASS dashboardSalesIntegrity.test.js");
  } finally {
    restoreCache();
  }
}

run().catch((error) => {
  restoreCache();
  console.error(error);
  process.exitCode = 1;
});
