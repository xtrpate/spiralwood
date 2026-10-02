"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "../frontend");

const controllerPath = require.resolve(
  "../controllers/admin/warrantyController",
);
const controllerFile = path.join(
  backendRoot,
  "controllers/admin/warrantyController.js",
);
const routeFile = path.join(backendRoot, "routes/admin.js");
const pageFile = path.join(
  frontendRoot,
  "src/pages/warranty/WarrantyPage.jsx",
);

const controllerSource = fs.readFileSync(controllerFile, "utf8");
const routeSource = fs.readFileSync(routeFile, "utf8");
const pageSource = fs.readFileSync(pageFile, "utf8");

assert.match(controllerSource, /ADMIN_WARRANTY_PAGE_SIZE\s*=\s*20/);
assert.match(controllerSource, /ADMIN_WARRANTY_MAX_PAGE_SIZE\s*=\s*100/);
assert.match(
  controllerSource,
  /ORDER BY w\.created_at DESC,\s*w\.id DESC[\s\S]*LIMIT \? OFFSET \?/,
);
assert.match(controllerSource, /LOWER\(COALESCE\(w\.status, ''\)\) = \?/);
assert.match(controllerSource, /\(\$\{ADMIN_WARRANTY_CLAIM_TYPE_SQL\}\) = \?/);
assert.match(controllerSource, /LIKE \? ESCAPE '!'/);
assert.match(
  controllerSource,
  /COUNT\(\*\) AS total[\s\S]*AS pending[\s\S]*AS approved[\s\S]*AS fulfilled/,
);
assert.match(controllerSource, /exports\.getClaimById = async/);

assert.match(
  routeSource,
  /"\/warranty\/:id",[\s\S]*?requirePermission\("warranty\.view"\),[\s\S]*?warrantyController\.getClaimById/,
);

assert.match(
  pageSource,
  /setTimeout\([\s\S]*?setDebouncedSearch\(search\.trim\(\)\)[\s\S]*?300/,
);
assert.match(pageSource, /listRequestSequenceRef/);
assert.match(
  pageSource,
  /api\.get\("\/warranty",\s*\{[\s\S]*?params:[\s\S]*?page,[\s\S]*?claim_type:/,
);
assert.match(
  pageSource,
  /api\.get\(\s*`\/warranty\/\$\{focusClaimId\}`/,
);
assert.doesNotMatch(
  pageSource,
  /rows\.find\(\(row\)\s*=>\s*Number\(row\?\.id\)\s*===\s*focusClaimId/,
);
assert.match(pageSource, /pagination\.hasPreviousPage/);
assert.match(pageSource, /pagination\.hasNextPage/);

const dbPath = require.resolve("../config/db");
const signedUrlPath = require.resolve("../utils/signedUrl");
const notificationPath = require.resolve("../utils/notificationHelper");
const inventoryServicePath = require.resolve("../services/warrantyInventoryService");
const adaptiveUploadPath = require.resolve("../utils/adaptiveUpload");
const validatorsPath = require.resolve("../utils/validators");
const philippineTimePath = require.resolve("../utils/philippineTime");

const mockedPaths = [
  dbPath,
  signedUrlPath,
  notificationPath,
  inventoryServicePath,
  adaptiveUploadPath,
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

const queryLog = [];

const sampleRow = {
  id: 77,
  order_id: 277,
  order_item_id: 296,
  customer_id: 40,
  product_name: "Modular L-Shaped Kitchen Cabinet",
  claim_quantity: 1,
  reason: "Door alignment issue",
  admin_note: null,
  proof_url: "photo.jpg,proof.jpg",
  warranty_expiry: "2027-09-19",
  status: "pending",
  replacement_receipt: null,
  resolution_type: null,
  resolution_notes: null,
  replacement_source: null,
  return_disposition: null,
  fulfilled_at: null,
  fulfilled_by: null,
  created_at: "2026-10-02 10:00:00",
  updated_at: "2026-10-02 10:00:00",
  order_number: "SWS-20260817-2982",
  order_type: "standard",
  linked_order_item_id: 296,
  product_id: 58,
  ordered_quantity: 1,
  has_customization: 0,
  catalog_product_id: 58,
  catalog_product_type: "standard",
  customer_name: "Test Customer",
  fulfilled_by_name: null,
};

const mockDb = {
  async query(sql, params = []) {
    const text = String(sql);
    queryLog.push({ text, params: [...params] });

    if (/WHERE w\.id = \?\s+LIMIT 1/.test(text)) {
      return [[sampleRow]];
    }

    if (
      /SELECT COUNT\(\*\) AS total/.test(text) &&
      /FROM warranties w/.test(text) &&
      !/AS pending/.test(text)
    ) {
      return [[{ total: 41 }]];
    }

    if (/ORDER BY w\.created_at DESC,\s*w\.id DESC/.test(text)) {
      return [[sampleRow]];
    }

    if (
      /FROM warranties\s*$/.test(text.trim()) &&
      /AS pending/.test(text) &&
      /AS approved/.test(text) &&
      /AS fulfilled/.test(text)
    ) {
      return [[{ total: 100, pending: 8, approved: 4, fulfilled: 70 }]];
    }

    throw new Error(`Unexpected W8A query: ${text}`);
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
  install(adaptiveUploadPath, {
    storeUploadBuffer: async () => null,
    cleanupStoredUpload: async () => true,
  });
  install(validatorsPath, {
    parseStrictPositiveInt: (value) => {
      if (value === undefined || value === null) return null;
      const raw = String(value).trim();
      if (!/^\d+$/.test(raw)) return null;
      const number = Number(raw);
      return Number.isSafeInteger(number) && number > 0 ? number : null;
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

  queryLog.length = 0;
  {
    const req = {
      query: {
        page: "99",
        limit: "20",
        search: "100%_test",
        status: "pending",
        claim_type: "custom",
      },
    };
    const res = makeRes();

    await controller.getClaims(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.pagination?.page, 3);
    assert.equal(res.body?.pagination?.limit, 20);
    assert.equal(res.body?.pagination?.total, 41);
    assert.equal(res.body?.pagination?.totalPages, 3);
    assert.equal(res.body?.pagination?.hasNextPage, false);
    assert.equal(res.body?.pagination?.hasPreviousPage, true);
    assert.deepEqual(res.body?.summary, {
      total: 100,
      pending: 8,
      approved: 4,
      fulfilled: 70,
    });
    assert.equal(res.body?.claims?.length, 1);
    assert.equal(res.body?.claims?.[0]?.claim_type, "standard");

    const listQuery = queryLog.find((entry) =>
      /ORDER BY w\.created_at DESC,\s*w\.id DESC/.test(entry.text),
    );
    assert.ok(listQuery);
    assert.equal(listQuery.params.at(-2), 20);
    assert.equal(listQuery.params.at(-1), 40);
    assert.ok(listQuery.params.includes("%100!%!_test%"));
  }

  queryLog.length = 0;
  {
    const req = { query: { page: "1abc", limit: "999" } };
    const res = makeRes();

    await controller.getClaims(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.pagination?.page, 1);
    assert.equal(res.body?.pagination?.limit, 100);

    const listQuery = queryLog.find((entry) =>
      /ORDER BY w\.created_at DESC,\s*w\.id DESC/.test(entry.text),
    );
    assert.equal(listQuery.params.at(-2), 100);
    assert.equal(listQuery.params.at(-1), 0);
  }

  for (const query of [
    { status: "done" },
    { claim_type: "legacy_unlinked" },
    { search: "x".repeat(121) },
  ]) {
    queryLog.length = 0;
    const res = makeRes();
    await controller.getClaims({ query }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(queryLog.length, 0);
  }

  queryLog.length = 0;
  {
    const res = makeRes();
    await controller.getClaimById({ params: { id: "77" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.id, 77);
    assert.equal(res.body?.description, "Door alignment issue");
    assert.equal(res.body?.claim_type, "standard");
    assert.equal(queryLog.length, 1);
  }

  {
    const res = makeRes();
    await controller.getClaimById({ params: { id: "77abc" } }, res);
    assert.equal(res.statusCode, 400);
  }

  console.log("PASS: Admin warranty pagination and exact-claim integrity checks passed.");
}

run()
  .catch((error) => {
    console.error("FAIL: Admin warranty pagination integrity checks failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);
