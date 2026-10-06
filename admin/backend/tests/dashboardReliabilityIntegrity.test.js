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

const mockDb = {
  async query() {
    throw new Error("simulated sensitive mysql failure: private_table_name");
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

async function execute(controller, query) {
  const res = makeRes();
  await controller.getDashboard({ query }, res);
  return res;
}

async function run() {
  const originalConsoleError = console.error;

  try {
    installMock(dbPath, mockDb);
    delete require.cache[controllerPath];

    const controller = require("../controllers/admin/dashboardController");

    const invalidPreset = await execute(controller, { preset: "not-a-period" });
    assert.equal(invalidPreset.statusCode, 400);
    assert.equal(invalidPreset.body?.message, "Invalid dashboard preset.");

    const missingCustomDates = await execute(controller, { preset: "custom" });
    assert.equal(missingCustomDates.statusCode, 400);
    assert.match(
      missingCustomDates.body?.message || "",
      /Both from and to dates are required/,
    );

    const conflictingFilters = await execute(controller, {
      preset: "today",
      from: "2026-10-01",
      to: "2026-10-05",
    });
    assert.equal(conflictingFilters.statusCode, 400);
    assert.equal(
      conflictingFilters.body?.message,
      "Preset cannot be combined with custom dates.",
    );

    const impossibleDate = await execute(controller, {
      from: "2026-02-30",
      to: "2026-03-01",
    });
    assert.equal(impossibleDate.statusCode, 400);
    assert.equal(
      impossibleDate.body?.message,
      "Invalid custom date range. Use YYYY-MM-DD.",
    );

    const oversizedRange = await execute(controller, {
      from: "2025-01-01",
      to: "2026-01-02",
    });
    assert.equal(oversizedRange.statusCode, 400);
    assert.equal(
      oversizedRange.body?.message,
      "Dashboard range cannot exceed 366 days.",
    );

    console.error = () => {};
    const internalFailure = await execute(controller, { preset: "today" });
    assert.equal(internalFailure.statusCode, 500);
    assert.equal(
      internalFailure.body?.message,
      "Failed to load dashboard data.",
    );
    assert.doesNotMatch(
      JSON.stringify(internalFailure.body),
      /private_table_name|mysql/i,
    );

    const backendSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../controllers/admin/dashboardController.js",
      ),
      "utf8",
    );
    const frontendSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../frontend/src/pages/dashboard/DashboardPage.jsx",
      ),
      "utf8",
    );

    assert.doesNotMatch(
      backendSource,
      /AS stock_in_total|AS stock_out_total|let stockMovements/,
    );

    const promiseAllMatches =
      backendSource.match(/await Promise\.all\(\[/g) || [];
    assert.equal(
      promiseAllMatches.length,
      5,
      "Dashboard should use exactly five bounded two-query concurrency waves.",
    );

    assert.match(frontendSource, /MAX_DASHBOARD_RANGE_DAYS = 366/);
    assert.match(
      frontendSource,
      /getDashboardRangeDaysInclusive\(from, to\)/,
    );

    // Preserve D7 reliability guarantees while D8 hardens validation/performance.
    assert.match(
      frontendSource,
      /requestId !== requestSequenceRef\.current/,
    );
    assert.match(
      frontendSource,
      /presetArg:\s*appliedRange\.preset/,
    );
    assert.match(
      frontendSource,
      /order\.order_number \|\| `#\$\{order\.id\}`/,
    );
    assert.match(frontendSource, /timeZone:\s*"Asia\/Manila"/);

    console.log("PASS dashboardReliabilityIntegrity.test.js");
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
