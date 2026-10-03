const assert = require("assert");
const fs = require("fs");
const path = require("path");

const routePath = path.join(__dirname, "../routes/admin.js");
const controllerPath = path.join(
  __dirname,
  "../controllers/admin/warrantyController.js",
);
const servicePath = require.resolve("../services/warrantyInventoryService");
const modalPath = path.join(
  __dirname,
  "../../frontend/src/pages/warranty/WarrantyResolutionModal.jsx",
);
const dbPath = require.resolve("../config/db");
const notificationPath = require.resolve("../utils/notificationHelper");
const adaptiveUploadPath = require.resolve("../utils/adaptiveUpload");

const routeSource = fs.readFileSync(routePath, "utf8");
const controllerSource = fs.readFileSync(controllerPath, "utf8");
const serviceSource = fs.readFileSync(servicePath, "utf8");
const modalSource = fs.readFileSync(modalPath, "utf8");

// Route boundary: keep the proof in memory until its type is validated.
assert.match(routeSource, /WARRANTY_FULFILLMENT_EXTENSIONS/);
assert.match(routeSource, /multer\.memoryStorage\(\)/);
assert.match(routeSource, /fileSize:\s*10\s*\*\s*1024\s*\*\s*1024/);
assert.match(routeSource, /verifyBufferSignature\(file\.buffer, ext\)/);
assert.match(routeSource, /warrantyFulfillmentUpload/);
assert.doesNotMatch(routeSource, /CloudinaryStorage/);
assert.doesNotMatch(routeSource, /replacementStorage/);
assert.doesNotMatch(routeSource, /replacementUpload/);

// Controller boundary: adaptive storage + cleanup policy must be explicit.
assert.match(controllerSource, /storeUploadBuffer/);
assert.match(controllerSource, /cleanupStoredUpload/);
assert.match(controllerSource, /warrantyFulfillmentCommitOutcomeUncertain/);
assert.match(controllerSource, /warrantyFulfillmentCommitted/);
assert.match(controllerSource, /Fulfillment proof upload is unavailable right now/);
assert.match(
  controllerSource,
  /folder:\s*"warranty-replacements",[\s\S]*?deliveryType:\s*"authenticated",[\s\S]*?requireCloud:\s*true/,
);

// Service boundary: distinguish pre-commit failures from uncertain commit outcome.
assert.match(serviceSource, /let commitAttempted = false/);
assert.match(serviceSource, /let committed = false/);
assert.match(serviceSource, /warrantyFulfillmentCommitOutcomeUncertain/);
assert.match(serviceSource, /transactionStarted && !committed/);

// Frontend should mirror the backend's supported formats and size limit.
assert.match(
  modalSource,
  /image\/jpeg,image\/png,image\/webp,\.jfif,application\/pdf/,
);
assert.match(modalSource, /10\s*\*\s*1024\s*\*\s*1024/);
assert.match(modalSource, /Fulfillment proof must be 10 MB or smaller\./);

const originalCache = new Map();
const remember = (modulePath) => {
  if (!originalCache.has(modulePath)) {
    originalCache.set(modulePath, require.cache[modulePath]);
  }
};
const mockModule = (modulePath, exportsValue) => {
  remember(modulePath);
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
};
const restoreModules = () => {
  for (const [modulePath, cached] of originalCache.entries()) {
    if (cached) require.cache[modulePath] = cached;
    else delete require.cache[modulePath];
  }
};

const makeRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return payload;
  },
});

const makeReq = (id = "5") => ({
  params: { id },
  user: { id: 1 },
  body: {
    resolution_type: "repair",
    resolution_notes: "Fixed joint",
    replacement_source: "",
    return_disposition: "not_returned",
    materials_json: "[]",
  },
  file: {
    originalname: "proof.jpg",
    mimetype: "image/jpeg",
    size: 4,
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  },
});

async function runControllerLifecycleChecks() {
  const resolvedControllerPath = require.resolve(controllerPath);
  remember(resolvedControllerPath);
  delete require.cache[resolvedControllerPath];

  let scenario = "success";
  let storeCount = 0;
  let cleanupCount = 0;
  let fulfillmentReceiptPath = null;

  mockModule(dbPath, {
    query: async () => [{ insertId: 1 }],
  });

  mockModule(notificationPath, {
    createNotificationSafe: async () => {},
  });

  mockModule(adaptiveUploadPath, {
    storeUploadBuffer: async (options) => {
      storeCount += 1;
      assert.equal(options.folder, "warranty-replacements");
      assert.equal(options.deliveryType, "authenticated");
      assert.equal(options.requireCloud, true);
      if (scenario === "store_fail") {
        const error = new Error("SECRET_CLOUD_PROVIDER_FAILURE");
        error.status = 502;
        throw error;
      }
      return {
        storage: "cloudinary",
        file_url: "cloudinary-auth:test-reference",
        public_id: "wisdom_uploads/warranty-replacements/test-proof",
        resource_type: "image",
        delivery_type: "authenticated",
        format: "jpg",
        local_path: null,
      };
    },
    cleanupStoredUpload: async () => {
      cleanupCount += 1;
      if (scenario === "cleanup_fail") {
        throw new Error("simulated cleanup failure");
      }
    },
  });

  mockModule(servicePath, {
    getResolutionOptions: async () => ({}),
    fulfillClaimWithInventory: async (args) => {
      fulfillmentReceiptPath = args?.receiptPath || null;
      if (scenario === "business_fail" || scenario === "cleanup_fail") {
        const error = new Error("Insufficient available stock.");
        error.status = 409;
        error.details = { available: 0, requested: 1 };
        throw error;
      }
      if (scenario === "uncertain_commit") {
        const error = new Error("SECRET_COMMIT_TRANSPORT_FAILURE");
        error.warrantyFulfillmentCommitOutcomeUncertain = true;
        throw error;
      }
      if (scenario === "committed_error") {
        const error = new Error("post-commit failure");
        error.warrantyFulfillmentCommitted = true;
        throw error;
      }
      return {
        claim: {
          id: 5,
          customer_id: null,
          order_id: 9,
          order_number: "SWS-TEST",
          product_name: "Desk",
          claim_quantity: 1,
        },
        resolution_type: "repair",
        replacement_source: null,
        return_disposition: "not_returned",
        material_lines: 0,
      };
    },
  });

  const controller = require(controllerPath);
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    scenario = "success";
    storeCount = 0;
    cleanupCount = 0;
    let req = makeReq("not-a-number");
    let res = makeRes();
    await controller.fulfillClaim(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(storeCount, 0, "invalid claim ID must not persist a proof");
    assert.equal(cleanupCount, 0);

    scenario = "store_fail";
    storeCount = 0;
    cleanupCount = 0;
    req = makeReq();
    res = makeRes();
    await controller.fulfillClaim(req, res);
    assert.equal(storeCount, 1);
    assert.equal(cleanupCount, 0);
    assert.equal(res.statusCode, 502);
    assert.match(res.body.message, /unavailable right now/i);
    assert.doesNotMatch(JSON.stringify(res.body), /SECRET_CLOUD_PROVIDER_FAILURE/);

    scenario = "business_fail";
    storeCount = 0;
    cleanupCount = 0;
    req = makeReq();
    res = makeRes();
    await controller.fulfillClaim(req, res);
    assert.equal(res.statusCode, 409);
    assert.equal(storeCount, 1);
    assert.equal(cleanupCount, 1, "pre-commit business failures must clean the fresh proof");
    assert.match(res.body.message, /Insufficient available stock/i);

    scenario = "cleanup_fail";
    storeCount = 0;
    cleanupCount = 0;
    req = makeReq();
    res = makeRes();
    await controller.fulfillClaim(req, res);
    assert.equal(res.statusCode, 409);
    assert.equal(cleanupCount, 1);
    assert.match(
      res.body.message,
      /Insufficient available stock/i,
      "cleanup failure must not mask the original business error",
    );

    scenario = "uncertain_commit";
    storeCount = 0;
    cleanupCount = 0;
    req = makeReq();
    res = makeRes();
    await controller.fulfillClaim(req, res);
    assert.equal(res.statusCode, 500);
    assert.equal(cleanupCount, 0, "uncertain commit outcome must retain the fresh proof");
    assert.doesNotMatch(JSON.stringify(res.body), /SECRET_COMMIT_TRANSPORT_FAILURE/);

    scenario = "committed_error";
    storeCount = 0;
    cleanupCount = 0;
    req = makeReq();
    res = makeRes();
    await controller.fulfillClaim(req, res);
    assert.equal(res.statusCode, 500);
    assert.equal(cleanupCount, 0, "known committed outcome must retain the proof");

    scenario = "success";
    storeCount = 0;
    cleanupCount = 0;
    fulfillmentReceiptPath = null;
    req = makeReq();
    res = makeRes();
    await controller.fulfillClaim(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(storeCount, 1);
    assert.equal(cleanupCount, 0);
    assert.equal(fulfillmentReceiptPath, "cloudinary-auth:test-reference");
    assert.equal(req.auditRecord?.new?.status, "fulfilled");
    assert.equal(req.auditRecord?.new?.receipt_uploaded_this_update, true);
  } finally {
    console.error = originalConsoleError;
    delete require.cache[resolvedControllerPath];
  }
}

function makeWarrantyConnection({ status = "approved", commitFails = false } = {}) {
  const counters = {
    begin: 0,
    commit: 0,
    rollback: 0,
    release: 0,
  };

  const claim = {
    id: 5,
    order_id: 9,
    order_item_id: 10,
    customer_id: 20,
    product_name: "Desk",
    claim_quantity: 1,
    status,
    replacement_receipt: null,
    order_number: "SWS-TEST",
    order_type: "custom",
    product_id: null,
    order_item_name: "Desk",
    ordered_quantity: 1,
    product_catalog_name: null,
    product_type: null,
    product_total_stock: 0,
    product_reorder_point: 0,
    product_is_active: null,
    display_stock: 0,
  };

  const conn = {
    counters,
    async beginTransaction() {
      counters.begin += 1;
    },
    async query(sql) {
      const text = String(sql || "");
      if (text.includes("FROM warranties w")) return [[claim]];
      if (text.includes("UPDATE warranties")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query in W5B integrity test: ${text}`);
    },
    async commit() {
      counters.commit += 1;
      if (commitFails) throw new Error("simulated commit transport failure");
    },
    async rollback() {
      counters.rollback += 1;
    },
    release() {
      counters.release += 1;
    },
  };

  return conn;
}

async function loadRealServiceWithConnection(conn) {
  remember(servicePath);
  remember(dbPath);
  delete require.cache[servicePath];
  mockModule(dbPath, {
    getConnection: async () => conn,
  });
  return require(servicePath);
}

async function runServiceTransactionOutcomeChecks() {
  let conn = makeWarrantyConnection({ status: "fulfilled" });
  let service = await loadRealServiceWithConnection(conn);
  let rejected = null;
  try {
    await service.fulfillClaimWithInventory({
      claimId: 5,
      actorId: 1,
      receiptPath: "https://example.invalid/proof.jpg",
      resolutionType: "repair",
      resolutionNotes: "",
      replacementSource: "",
      returnDisposition: "not_returned",
      materials: "[]",
    });
  } catch (error) {
    rejected = error;
  }
  assert(rejected);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.warrantyFulfillmentCommitted, false);
  assert.equal(rejected.warrantyFulfillmentCommitOutcomeUncertain, false);
  assert.equal(conn.counters.rollback, 1);
  assert.equal(conn.counters.commit, 0);

  conn = makeWarrantyConnection({ status: "approved", commitFails: true });
  service = await loadRealServiceWithConnection(conn);
  let uncertain = null;
  try {
    await service.fulfillClaimWithInventory({
      claimId: 5,
      actorId: 1,
      receiptPath: "https://example.invalid/proof.jpg",
      resolutionType: "repair",
      resolutionNotes: "",
      replacementSource: "",
      returnDisposition: "not_returned",
      materials: "[]",
    });
  } catch (error) {
    uncertain = error;
  }
  assert(uncertain);
  assert.equal(uncertain.warrantyFulfillmentCommitted, false);
  assert.equal(uncertain.warrantyFulfillmentCommitOutcomeUncertain, true);
  assert.equal(conn.counters.commit, 1);
  assert.equal(
    conn.counters.rollback,
    1,
    "best-effort rollback should still clean the connection state while the proof is retained",
  );

  conn = makeWarrantyConnection({ status: "approved", commitFails: false });
  service = await loadRealServiceWithConnection(conn);
  const success = await service.fulfillClaimWithInventory({
    claimId: 5,
    actorId: 1,
    receiptPath: "https://example.invalid/proof.jpg",
    resolutionType: "repair",
    resolutionNotes: "",
    replacementSource: "",
    returnDisposition: "not_returned",
    materials: "[]",
  });
  assert.equal(success.resolution_type, "repair");
  assert.equal(conn.counters.commit, 1);
  assert.equal(conn.counters.rollback, 0);
}

(async () => {
  try {
    await runControllerLifecycleChecks();
    await runServiceTransactionOutcomeChecks();
    console.log("PASS: Warranty fulfillment proof upload integrity checks passed.");
  } finally {
    restoreModules();
  }
})().catch((error) => {
  restoreModules();
  console.error(error);
  process.exitCode = 1;
});
