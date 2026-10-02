"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const controllerFile = path.join(
  backendRoot,
  "controllers/admin/warrantyController.js",
);
const frontendFile = path.resolve(
  backendRoot,
  "../frontend/src/pages/reports/OperationsReportPage.jsx",
);

const controllerSource = fs.readFileSync(controllerFile, "utf8");
const frontendSource = fs.readFileSync(frontendFile, "utf8");

const reportStart = controllerSource.indexOf(
  "const getOperationsWarrantyReport = async (req, res) => {",
);
const reportEnd = controllerSource.indexOf(
  "exports.getClaims = async (req, res) => {",
);

assert.ok(reportStart >= 0, "Warranty Operations Report handler must exist.");
assert.ok(
  reportEnd > reportStart,
  "Warranty Operations Report handler boundary must be valid.",
);

const reportSource = controllerSource.slice(reportStart, reportEnd);
const summaryStart = reportSource.indexOf("const [[summaryRow]]");
const summaryEnd = reportSource.indexOf("response.total");

assert.ok(summaryStart >= 0, "Warranty report summary query must exist.");
assert.ok(summaryEnd > summaryStart, "Warranty summary mapping must exist.");

const summarySource = reportSource.slice(summaryStart, summaryEnd);

assert.match(
  summarySource,
  /IN\s*\(\s*'pending',\s*'approved'\s*\)/,
  "Pending / Active must count pending + approved.",
);

assert.match(
  summarySource,
  /=\s*'fulfilled'/,
  "Successful completion must count fulfilled.",
);

for (const status of [
  "'scheduled'",
  "'in_progress'",
  "'completed'",
  "'resolved'",
  "'delivered'",
  "'done'",
]) {
  assert.equal(
    summarySource.includes(status),
    false,
    `Warranty summary must not use non-canonical status ${status}.`,
  );
}

assert.match(
  reportSource,
  /LEFT JOIN order_items oi\s+ON oi\.id = w\.order_item_id\s+AND oi\.order_id = w\.order_id/,
  "Warranty report order-item join must preserve order ownership.",
);

const warrantyOptionsMatch = frontendSource.match(
  /warranty:\s*\[([\s\S]*?)\],\s*\};/,
);

assert.ok(warrantyOptionsMatch, "Warranty status options must exist.");

for (const status of [
  '"pending"',
  '"approved"',
  '"rejected"',
  '"fulfilled"',
  '"cancelled"',
]) {
  assert.ok(
    warrantyOptionsMatch[1].includes(status),
    `Warranty filter must expose ${status}.`,
  );
}

assert.match(
  frontendSource,
  /operationType === "warranty" \? "Filed Date" : "Date Filter"/,
  "Warranty date filtering must explicitly say Filed Date.",
);

assert.match(
  frontendSource,
  /operationType === "warranty" \? "Fulfilled" : "Completed"/,
  "Warranty completion card must use Fulfilled.",
);

assert.ok(
  frontendSource.includes("Pending review or approved for warranty service"),
  "Warranty active note must explain pending + approved.",
);

assert.ok(
  frontendSource.includes("Warranty service successfully completed"),
  "Warranty fulfilled note must explain successful completion.",
);

const dbPath = require.resolve("../config/db");
const signedUrlPath = require.resolve("../utils/signedUrl");
const notificationPath = require.resolve("../utils/notificationHelper");
const inventoryServicePath = require.resolve("../services/warrantyInventoryService");
const validatorsPath = require.resolve("../utils/validators");
const philippineTimePath = require.resolve("../utils/philippineTime");
const controllerPath = require.resolve("../controllers/admin/warrantyController");

const mockedPaths = [
  dbPath,
  signedUrlPath,
  notificationPath,
  inventoryServicePath,
  validatorsPath,
  philippineTimePath,
  controllerPath,
];

const originals = new Map(
  mockedPaths.map((modulePath) => [modulePath, require.cache[modulePath]]),
);

function install(modulePath, exportsValue) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
}

function restore() {
  for (const [modulePath, cached] of originals) {
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

let queryNumber = 0;
const queryTexts = [];

const mockDb = {
  async query(sql) {
    const text = String(sql);
    queryTexts.push(text);
    queryNumber += 1;

    if (queryNumber === 1) return [[]];

    if (queryNumber === 2) {
      return [[{ total: 23, pending: 14, completed: 7 }]];
    }

    throw new Error(`Unexpected W6E query #${queryNumber}: ${text}`);
  },
};

async function run() {
  install(dbPath, mockDb);
  install(signedUrlPath, { signUploadPath: (value) => value });
  install(notificationPath, { createNotificationSafe: async () => true });
  install(inventoryServicePath, {
    getResolutionOptions: async () => ({}),
    fulfillClaimWithInventory: async () => ({}),
  });
  install(validatorsPath, {
    parseStrictPositiveInt: (value) => {
      const n = Number(value);
      return Number.isSafeInteger(n) && n > 0 ? n : null;
    },
  });
  install(philippineTimePath, {
    getPhilippineDateBoundsUtc: () => ({
      startUtc: "2026-10-01 16:00:00",
      nextStartUtc: "2026-10-02 16:00:00",
    }),
    getPhilippineDateKey: () => "2026-10-02",
  });

  delete require.cache[controllerPath];
  const controller = require("../controllers/admin/warrantyController");

  const req = {
    query: {
      operations_report: "1",
      page: "1",
      limit: "20",
      date_filter: "all",
    },
    user: { id: 1 },
  };
  const res = makeRes();

  await controller.getClaims(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.total, 23);
  assert.deepEqual(res.body?.summary, {
    pending: 14,
    completed: 7,
  });
  assert.deepEqual(res.body?.claims, []);

  assert.equal(queryTexts.length, 2);
  assert.match(
    queryTexts[0],
    /LEFT JOIN order_items oi\s+ON oi\.id = w\.order_item_id\s+AND oi\.order_id = w\.order_id/,
  );
  assert.match(
    queryTexts[1],
    /IN\s*\(\s*'pending',\s*'approved'\s*\)/,
  );
  assert.match(queryTexts[1], /=\s*'fulfilled'/);

  console.log("PASS: Warranty Operations Report correctness checks passed.");
}

run()
  .catch((error) => {
    console.error("FAIL: Warranty Operations Report correctness checks failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);
