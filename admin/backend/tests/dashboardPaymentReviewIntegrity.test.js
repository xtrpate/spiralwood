const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const controllerPath = require.resolve("../controllers/admin/dashboardController");

const originalCache = new Map(
  [dbPath, controllerPath].map((modulePath) => [
    modulePath,
    require.cache[modulePath],
  ]),
);

let failPaymentQuery = false;
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
      text.includes("COALESCE(SUM(o.total), 0) AS order_value") &&
      text.includes("avg_order_value")
    ) {
      return [[{
        order_value: 0,
        avg_order_value: 0,
        online_orders: 0,
        walkin_orders: 0,
      }]];
    }

    if (
      text.includes("AS total_profit") &&
      text.includes("FROM order_items oi")
    ) {
      return [[{ total_profit: 0 }]];
    }

    if (
      text.includes("AS verified_collections") &&
      text.includes("verified_payment_count") &&
      text.includes("FROM payment_transactions")
    ) {
      return [[{
        verified_collections: 0,
        verified_payment_count: 0,
      }]];
    }

    if (
      text.includes("COUNT(*) AS pending_reviews") &&
      text.includes("FROM payment_transactions")
    ) {
      if (failPaymentQuery) {
        throw new Error("simulated payment ledger failure");
      }
      return [[{ pending_reviews: 3 }]];
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
      text.includes("walkin_sales")
    ) {
      return [[]];
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
      `Unexpected SQL in dashboard D1 test: ${text.slice(0, 180)}`,
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

async function execute(controller) {
  const res = makeRes();
  await controller.getDashboard(
    {
      query: {
        from: "2026-10-01",
        to: "2026-10-01",
      },
    },
    res,
  );
  return res;
}

async function run() {
  const originalConsoleError = console.error;

  try {
    installMock(dbPath, mockDb);
    delete require.cache[controllerPath];

    const controller = require("../controllers/admin/dashboardController");

    calls.length = 0;
    failPaymentQuery = false;

    const ok = await execute(controller);

    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body?.payments?.pending_reviews, 3);

    const paymentCalls = calls.filter((call) =>
      call.sql.includes("pending_reviews"),
    );

    assert.equal(paymentCalls.length, 1);
    assert.match(paymentCalls[0].sql, /FROM payment_transactions/);
    assert.match(paymentCalls[0].sql, /WHERE status = 'pending'/);
    assert.doesNotMatch(paymentCalls[0].sql, /FROM payments\b/);

    // A payment-ledger query failure must fail the dashboard request instead
    // of silently returning a misleading "0 pending reviews".
    calls.length = 0;
    failPaymentQuery = true;
    console.error = () => {};

    const failed = await execute(controller);

    assert.equal(failed.statusCode, 500);
    assert.notEqual(failed.body?.payments?.pending_reviews, 0);

    console.log("PASS dashboardPaymentReviewIntegrity.test.js");
  } finally {
    console.error = originalConsoleError;
    restoreCache();
  }
}

run().catch((error) => {
  restoreCache();
  console.error(error);
  process.exitCode = 1;
});
