"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const backendRoot = path.resolve(__dirname, "..");
const controllerFile = path.join(
  backendRoot,
  "controllers/customer/customer.warranty.js",
);
const routeFile = path.join(backendRoot, "routes/customer.warranty.js");
const serverFile = path.join(backendRoot, "server.js");
const adaptiveUploadFile = path.join(backendRoot, "utils/adaptiveUpload.js");

const controllerSource = fs.readFileSync(controllerFile, "utf8");
const routeSource = fs.readFileSync(routeFile, "utf8");
const serverSource = fs.readFileSync(serverFile, "utf8");
const adaptiveUploadSource = fs.readFileSync(adaptiveUploadFile, "utf8");

assert.match(
  controllerSource,
  /commitAttempted = true;\s*await connection\.commit\(\);\s*commitConfirmed = true;\s*req\.warrantySubmissionRetainUploads = true;/,
  "Confirmed warranty commits must retain their uploaded evidence.",
);

assert.match(
  controllerSource,
  /const commitOutcomeUncertain =\s*commitAttempted && !commitConfirmed && !lockConflict;/,
  "A failed COMMIT attempt must be tracked as an uncertain commit outcome.",
);

assert.match(
  controllerSource,
  /if \(commitConfirmed \|\| commitOutcomeUncertain\) \{\s*req\.warrantySubmissionRetainUploads = true;/,
  "Confirmed or uncertain commit outcomes must both retain uploaded evidence.",
);

assert.match(
  routeSource,
  /const storage = multer\.memoryStorage\(\);/,
  "Customer warranty evidence must stay in memory until validation passes.",
);
assert.match(
  routeSource,
  /verifyBufferSignature\(file\.buffer, ext\)/,
  "Customer warranty evidence must be magic-byte validated in memory.",
);
assert.match(
  routeSource,
  /storeUploadBuffer/,
  "Customer warranty evidence must use adaptive durable storage.",
);
assert.match(
  routeSource,
  /deliveryType:\s*"authenticated"/,
  "Customer warranty evidence must use authenticated Cloudinary delivery.",
);
assert.match(
  routeSource,
  /requireCloud:\s*true/,
  "Customer warranty evidence must not fall back to ephemeral local storage.",
);
assert.doesNotMatch(
  routeSource,
  /multer\.diskStorage\(/,
  "Customer warranty evidence must not be written to disk before validation.",
);
assert.doesNotMatch(
  routeSource,
  /getUploadsRoot/,
  "Customer warranty route must not rely on the runtime upload filesystem.",
);

assert.match(
  serverSource,
  /const \{ getUploadsRoot \} = require\("\.\/utils\/uploadRoot"\);/,
  "The static upload server must use the shared upload-root resolver.",
);
assert.match(
  serverSource,
  /const uploadDir = getUploadsRoot\(\);/,
  "The static upload server must resolve the same upload root as upload writers.",
);

assert.match(
  adaptiveUploadSource,
  /const \{ getUploadsRoot \} = require\("\.\/uploadRoot"\);/,
  "Adaptive uploads must use the shared upload-root resolver.",
);
assert.doesNotMatch(
  adaptiveUploadSource,
  /const backendRoot = path\.join\(__dirname, "\.\."\);/,
  "Adaptive uploads must not keep a second upload-root implementation.",
);

const uploadRootPath = require.resolve("../utils/uploadRoot");
const originalUploadDir = process.env.UPLOAD_DIR;
const uploadRoot = require(uploadRootPath);

try {
  const absoluteRoot = path.join(os.tmpdir(), "wisdom-w6a-absolute-root");
  process.env.UPLOAD_DIR = absoluteRoot;
  assert.equal(
    uploadRoot.getUploadsRoot(),
    absoluteRoot,
    "Absolute UPLOAD_DIR must be preserved exactly.",
  );

  process.env.UPLOAD_DIR = "runtime-uploads";
  assert.equal(
    uploadRoot.getUploadsRoot(),
    path.join(backendRoot, "runtime-uploads"),
    "Relative UPLOAD_DIR must resolve from the backend root.",
  );

  delete process.env.UPLOAD_DIR;
  assert.equal(
    uploadRoot.getUploadsRoot(),
    path.join(backendRoot, "uploads"),
    "Missing UPLOAD_DIR must use the existing backend/uploads default.",
  );
} finally {
  if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = originalUploadDir;
}

function install(modulePath, exportsValue) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
}

function makeControllerRes() {
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

async function testControllerCommitBoundary() {
  const dbPath = require.resolve("../config/db");
  const signedUrlPath = require.resolve("../utils/signedUrl");
  const notificationPath = require.resolve("../utils/notificationHelper");
  const auditPath = require.resolve("../middleware/auditLog");
  const philippineTimePath = require.resolve("../utils/philippineTime");
  const controllerPath = require.resolve(
    "../controllers/customer/customer.warranty",
  );

  const mockedPaths = [
    dbPath,
    signedUrlPath,
    notificationPath,
    auditPath,
    philippineTimePath,
    controllerPath,
  ];
  const originals = new Map(
    mockedPaths.map((modulePath) => [modulePath, require.cache[modulePath]]),
  );

  let scenario = "commit-failure";
  let events = [];
  let auditCalls = 0;
  let notificationCalls = 0;

  const item = {
    order_id: 9,
    order_number: "SWS-W6A-0009",
    customer_id: 17,
    status: "completed",
    payment_status: "paid",
    warranty_period_days_snapshot: 365,
    warranty_policy_version_snapshot: "2",
    warranty_policy_effective_at: "2026-10-01 02:00:00",
    warranty_expiry: "2027-10-01",
    warranty_is_active: 1,
    order_item_id: 12,
    product_id: 5,
    product_name: "W6A Test Desk",
    ordered_quantity: 1,
  };

  const connection = {
    async beginTransaction() {
      events.push("begin");
    },
    async query(sql) {
      const text = String(sql);
      if (text.includes("o.id AS order_id") && text.includes("FOR UPDATE")) {
        events.push("item-lock");
        return [[{ ...item }]];
      }
      if (
        text.includes("FROM warranties") &&
        text.includes(
          "LOWER(COALESCE(status, '')) IN ('pending', 'approved')",
        ) &&
        text.includes("FOR UPDATE")
      ) {
        events.push("existing-lock");
        return [[]];
      }
      if (text.includes("INSERT INTO warranties")) {
        events.push("insert");
        if (scenario === "insert-failure") {
          throw new Error("simulated pre-commit insert failure");
        }
        return [{ insertId: 901, affectedRows: 1 }];
      }
      throw new Error(`Unexpected connection query: ${text}`);
    },
    async commit() {
      events.push("commit");
      if (scenario === "commit-failure") {
        throw new Error("simulated commit transport failure");
      }
    },
    async rollback() {
      events.push("rollback");
    },
    release() {
      events.push("release");
    },
  };

  const db = {
    async getConnection() {
      events.push("getConnection");
      return connection;
    },
    async query(sql) {
      const text = String(sql);
      if (
        text.includes("FROM website_content") &&
        text.includes("content_key IN (?, ?)")
      ) {
        return [
          [
            { content_key: "warranty_period_days", content: "365" },
            { content_key: "warranty_policy_version", content: "2" },
          ],
        ];
      }
      if (text.includes("SELECT id FROM users")) {
        return [[{ id: 1 }]];
      }
      throw new Error(`Unexpected pool query: ${text}`);
    },
  };

  try {
    install(dbPath, db);
    install(signedUrlPath, { signUploadPath: (value) => value });
    install(notificationPath, {
      createNotificationSafe: async () => {
        notificationCalls += 1;
        return true;
      },
    });
    install(auditPath, {
      writeAuditLogSafe: async () => {
        auditCalls += 1;
        return true;
      },
    });
    install(philippineTimePath, {
      getPhilippineDateKey: () => "2026-10-01",
    });

    delete require.cache[controllerPath];
    const controller = require(controllerPath);

    const baseRequest = () => ({
      body: {
        order_id: "9",
        order_item_id: "12",
        claim_quantity: "1",
        description: "Leg is cracked.",
      },
      files: {
        photo: [{ originalname: "photo.jpg" }],
        proof: [{ originalname: "proof.pdf" }],
      },
      warrantyEvidenceAssets: {
        photo: { file_url: "cloudinary-auth:test-photo" },
        proof: { file_url: "cloudinary-auth:test-proof" },
      },
      user: { id: 17, name: "W6A Customer" },
      ip: "127.0.0.1",
    });

    scenario = "insert-failure";
    events = [];
    auditCalls = 0;
    notificationCalls = 0;
    {
      const req = baseRequest();
      const res = makeControllerRes();
      await controller.submitClaim(req, res);

      assert.equal(res.statusCode, 500);
      assert.notEqual(req.warrantySubmissionRetainUploads, true);
      assert.equal(events.includes("commit"), false);
      assert.equal(events.includes("rollback"), true);
      assert.equal(auditCalls, 0);
      assert.equal(notificationCalls, 0);
    }

    scenario = "commit-failure";
    events = [];
    auditCalls = 0;
    notificationCalls = 0;
    {
      const req = baseRequest();
      const res = makeControllerRes();
      await controller.submitClaim(req, res);

      assert.equal(res.statusCode, 500);
      assert.equal(req.warrantySubmissionRetainUploads, true);
      assert.equal(events.includes("commit"), true);
      assert.equal(events.includes("rollback"), true);
      assert.equal(auditCalls, 0);
      assert.equal(notificationCalls, 0);
    }

    scenario = "success";
    events = [];
    auditCalls = 0;
    notificationCalls = 0;
    {
      const req = baseRequest();
      const res = makeControllerRes();
      await controller.submitClaim(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(req.warrantySubmissionRetainUploads, true);
      assert.equal(events.includes("commit"), true);
      assert.equal(events.includes("rollback"), false);
      assert.equal(auditCalls, 1);
      assert.equal(notificationCalls, 1);
    }
  } finally {
    for (const [modulePath, cached] of originals) {
      delete require.cache[modulePath];
      if (cached) require.cache[modulePath] = cached;
    }
  }
}

function makeRouteResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.body = null;
  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function json(payload) {
    this.body = payload;
    return this;
  };
  return res;
}

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for warranty upload cleanup.");
}

async function testRouteRetentionAndDurableStorage() {
  const routePath = require.resolve("../routes/customer.warranty");
  const originalLoad = Module._load;
  let router = null;
  let capturedStorage = null;
  let storeCalls = [];
  let cleanupCalls = [];

  const fakeRouter = {
    __routes: [],
    get(routeValue, ...handlers) {
      this.__routes.push({ method: "get", path: routeValue, handlers });
      return this;
    },
    post(routeValue, ...handlers) {
      this.__routes.push({ method: "post", path: routeValue, handlers });
      return this;
    },
    patch(routeValue, ...handlers) {
      this.__routes.push({ method: "patch", path: routeValue, handlers });
      return this;
    },
  };

  function multerMock(options) {
    capturedStorage = options?.storage || null;
    return {
      fields() {
        return (req, _res, cb) => {
          req.files = req.__mockFiles || {};
          cb(req.__mockMulterError || null);
        };
      },
    };
  }
  multerMock.memoryStorage = () => ({ kind: "memory" });
  multerMock.MulterError = class MulterErrorMock extends Error {};

  const pass = (_req, _res, next) => next();

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "express") {
      return { Router: () => fakeRouter };
    }
    if (request === "multer") return multerMock;

    if (parent?.filename === routePath) {
      if (request === "../middleware/auth") {
        return { authenticate: pass, requireCustomer: pass };
      }
      if (request === "../middleware/auditLog") {
        return { logAction: () => pass };
      }
      if (request === "../controllers/customer/customer.warranty") {
        return {
          getEligibleOrders: pass,
          getClaims: pass,
          getClaimById: pass,
          submitClaim: pass,
          cancelClaim: pass,
        };
      }
      if (request === "../utils/verifyFileSignature") {
        return { verifyBufferSignature: () => true };
      }
      if (request === "../utils/adaptiveUpload") {
        return {
          storeUploadBuffer: async (args) => {
            storeCalls.push(args);
            return {
              storage: "cloudinary",
              file_url: `cloudinary-auth:${args.file.fieldname}`,
              public_id: `wisdom_uploads/warranty/${args.file.fieldname}`,
              resource_type: "image",
              delivery_type: "authenticated",
              format: "jpg",
              local_path: null,
            };
          },
          cleanupStoredUpload: async (asset) => {
            cleanupCalls.push(asset);
          },
        };
      }
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[routePath];
    router = require(routePath);
  } finally {
    Module._load = originalLoad;
  }

  try {
    assert.deepEqual(capturedStorage, { kind: "memory" });

    const postRoute = router.__routes.find(
      (entry) => entry.method === "post" && entry.path === "/",
    );
    assert.ok(postRoute, "Customer warranty POST route must exist.");
    const uploadMiddleware = postRoute.handlers[2];

    const makeFile = (fieldname, originalname, mimetype) => ({
      fieldname,
      originalname,
      mimetype,
      size: 4,
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });

    const runUpload = (req, res) =>
      new Promise((resolve, reject) => {
        uploadMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

    {
      storeCalls = [];
      cleanupCalls = [];
      const photo = makeFile("photo", "photo.jpg", "image/jpeg");
      const proof = makeFile("proof", "proof.jpg", "image/jpeg");
      const req = { __mockFiles: { photo: [photo], proof: [proof] } };
      const res = makeRouteResponse();

      await runUpload(req, res);
      assert.equal(storeCalls.length, 2);
      assert.equal(storeCalls[0].deliveryType, "authenticated");
      assert.equal(storeCalls[0].requireCloud, true);
      assert.ok(req.warrantyEvidenceAssets?.photo);
      assert.ok(req.warrantyEvidenceAssets?.proof);

      res.statusCode = 500;
      res.emit("finish");
      await waitFor(() => cleanupCalls.length === 2);
    }

    {
      storeCalls = [];
      cleanupCalls = [];
      const photo = makeFile("photo", "photo.jpg", "image/jpeg");
      const proof = makeFile("proof", "proof.jpg", "image/jpeg");
      const req = {
        __mockFiles: { photo: [photo], proof: [proof] },
      };
      const res = makeRouteResponse();

      await runUpload(req, res);
      req.warrantySubmissionRetainUploads = true;
      res.statusCode = 500;
      res.emit("finish");
      await new Promise((resolve) => setTimeout(resolve, 30));

      assert.equal(cleanupCalls.length, 0);
    }
  } finally {
    delete require.cache[routePath];
  }
}

async function run() {
  await testControllerCommitBoundary();
  await testRouteRetentionAndDurableStorage();
  console.log("PASS: Warranty submission durability checks passed.");
}

run().catch((error) => {
  console.error("FAIL: Warranty submission durability checks failed.");
  console.error(error);
  process.exitCode = 1;
});
