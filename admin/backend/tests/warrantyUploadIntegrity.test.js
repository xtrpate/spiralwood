const assert = require("assert");
const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const routePath = require.resolve("../routes/customer.warranty");
const frontendPath = path.join(
  __dirname,
  "../../frontend/src/pages/customer/warrantypage.jsx",
);

let capturedMulterOptions = null;
let capturedFieldDefinitions = null;
let storeCalls = [];
let cleanupCalls = [];

const router = {
  __routes: [],
  get(routePathValue, ...handlers) {
    this.__routes.push({ method: "get", path: routePathValue, handlers });
    return this;
  },
  post(routePathValue, ...handlers) {
    this.__routes.push({ method: "post", path: routePathValue, handlers });
    return this;
  },
  patch(routePathValue, ...handlers) {
    this.__routes.push({ method: "patch", path: routePathValue, handlers });
    return this;
  },
};

const expressMock = {
  Router: () => router,
};

class MulterErrorMock extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function multerMock(options) {
  capturedMulterOptions = options;
  return {
    fields(fieldDefinitions) {
      capturedFieldDefinitions = fieldDefinitions;
      return (req, _res, cb) => {
        req.files = req.__mockFiles || {};
        cb(req.__mockMulterError || null);
      };
    },
  };
}

multerMock.memoryStorage = () => ({ kind: "memory" });
multerMock.MulterError = MulterErrorMock;

const passMiddleware = (_req, _res, next) => next();
const controllerMock = {
  getEligibleOrders: passMiddleware,
  getClaims: passMiddleware,
  getClaimById: passMiddleware,
  submitClaim: passMiddleware,
  cancelClaim: passMiddleware,
};

const adaptiveUploadMock = {
  storeUploadBuffer: async (args) => {
    storeCalls.push(args);
    if (args.file?.__storeFail) {
      const error = new Error("SECRET_PROVIDER_UPLOAD_FAILURE");
      error.status = 502;
      throw error;
    }

    return {
      storage: "cloudinary",
      file_url: `cloudinary-auth:${args.file.fieldname}`,
      public_id: `wisdom_uploads/warranty/${args.file.fieldname}`,
      resource_type: args.file.mimetype === "application/pdf" ? "raw" : "image",
      delivery_type: "authenticated",
      format: path.extname(args.file.originalname).replace(/^\./, "") || "jpg",
      local_path: null,
    };
  },
  cleanupStoredUpload: async (asset) => {
    cleanupCalls.push(asset);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "express") return expressMock;
  if (request === "multer") return multerMock;

  if (parent?.filename === routePath) {
    if (request === "../middleware/auth") {
      return {
        authenticate: passMiddleware,
        requireCustomer: passMiddleware,
      };
    }

    if (request === "../middleware/auditLog") {
      return {
        logAction: () => passMiddleware,
      };
    }

    if (request === "../controllers/customer/customer.warranty") {
      return controllerMock;
    }

    if (request === "../utils/verifyFileSignature") {
      return {
        verifyBufferSignature: (buffer, _ext) =>
          Buffer.isBuffer(buffer) && buffer.length > 0 && buffer[0] !== 0x00,
      };
    }

    if (request === "../utils/adaptiveUpload") {
      return adaptiveUploadMock;
    }
  }

  return originalLoad.call(this, request, parent, isMain);
};

function makeResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.body = null;
  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function json(payload) {
    this.body = payload;
    setImmediate(() => this.emit("finish"));
    return this;
  };
  return res;
}

function makeFile(fieldname, originalname, mimetype, bytes = [0xff, 0xd8, 0xff]) {
  const buffer = Buffer.from(bytes);
  return {
    fieldname,
    originalname,
    mimetype,
    size: buffer.length,
    buffer,
  };
}

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for expected cleanup state.");
}

function runFileFilter(fieldname, originalname, mimetype) {
  return new Promise((resolve) => {
    capturedMulterOptions.fileFilter(
      {},
      { fieldname, originalname, mimetype },
      (err, accepted) => resolve({ err, accepted }),
    );
  });
}

async function invokeUpload(uploadMiddleware, req, res) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve({ nextCalled: false });
    };
    res.once("finish", finish);

    uploadMiddleware(req, res, (err) => {
      if (settled) return;
      settled = true;
      res.removeListener("finish", finish);
      if (err) reject(err);
      else resolve({ nextCalled: true });
    });
  });
}

async function main() {
  let warrantyRouter;
  try {
    delete require.cache[routePath];
    warrantyRouter = require(routePath);
  } finally {
    Module._load = originalLoad;
  }

  assert.ok(capturedMulterOptions, "warranty multer options should be captured");
  assert.deepEqual(capturedMulterOptions.storage, { kind: "memory" });
  assert.equal(
    capturedMulterOptions.limits?.fileSize,
    5 * 1024 * 1024,
    "customer warranty uploads must remain capped at 5 MB per file",
  );
  assert.equal(capturedMulterOptions.limits?.files, 2);

  const photoJpg = await runFileFilter("photo", "defect.JPG", "image/jpeg");
  assert.equal(photoJpg.err, null);
  assert.equal(photoJpg.accepted, true);

  const photoPdf = await runFileFilter("photo", "defect.pdf", "application/pdf");
  assert.equal(photoPdf.accepted, undefined);
  assert.equal(photoPdf.err?.status, 400);
  assert.match(photoPdf.err?.message || "", /photo of the issue/i);

  const proofPdf = await runFileFilter("proof", "receipt.PDF", "application/pdf");
  assert.equal(proofPdf.err, null);
  assert.equal(proofPdf.accepted, true);

  const fakeJpgMime = await runFileFilter("proof", "receipt.jpg", "application/pdf");
  assert.equal(fakeJpgMime.accepted, undefined);
  assert.equal(fakeJpgMime.err?.status, 400);

  const postRoute = warrantyRouter.__routes.find(
    (entry) => entry.method === "post" && entry.path === "/",
  );
  assert.ok(postRoute, "customer warranty POST / route must exist");
  assert.equal(postRoute.handlers.length, 4);
  const uploadMiddleware = postRoute.handlers[2];

  // Real-type mismatch must be rejected before durable storage is attempted.
  storeCalls = [];
  cleanupCalls = [];
  {
    const photo = makeFile("photo", "defect.jpg", "image/jpeg", [0x00, 0x01]);
    const proof = makeFile(
      "proof",
      "receipt.pdf",
      "application/pdf",
      [0x25, 0x50, 0x44, 0x46, 0x2d],
    );
    const req = { __mockFiles: { photo: [photo], proof: [proof] } };
    const res = makeResponse();

    const result = await invokeUpload(uploadMiddleware, req, res);
    assert.deepEqual(capturedFieldDefinitions, [
      { name: "photo", maxCount: 1 },
      { name: "proof", maxCount: 1 },
    ]);
    assert.equal(result.nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.match(res.body?.message || "", /real file type/i);
    assert.equal(storeCalls.length, 0);
    assert.equal(cleanupCalls.length, 0);
  }

  // Missing required sibling should fail before durable storage.
  storeCalls = [];
  cleanupCalls = [];
  {
    const photo = makeFile("photo", "defect.jpg", "image/jpeg");
    const req = { __mockFiles: { photo: [photo] } };
    const res = makeResponse();

    const result = await invokeUpload(uploadMiddleware, req, res);
    assert.equal(result.nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.match(res.body?.message || "", /both defect photo and proof/i);
    assert.equal(storeCalls.length, 0);
  }

  // If the second durable upload fails, the first one must be removed.
  storeCalls = [];
  cleanupCalls = [];
  {
    const photo = makeFile("photo", "defect.jpg", "image/jpeg");
    const proof = makeFile(
      "proof",
      "receipt.pdf",
      "application/pdf",
      [0x25, 0x50, 0x44, 0x46, 0x2d],
    );
    proof.__storeFail = true;
    const req = { __mockFiles: { photo: [photo], proof: [proof] } };
    const res = makeResponse();

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const result = await invokeUpload(uploadMiddleware, req, res);
      assert.equal(result.nextCalled, false);
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(res.statusCode, 502);
    assert.match(res.body?.message || "", /unavailable right now/i);
    assert.doesNotMatch(JSON.stringify(res.body), /SECRET_PROVIDER_UPLOAD_FAILURE/);
    assert.equal(storeCalls.length, 2);
    assert.equal(storeCalls[0].deliveryType, "authenticated");
    assert.equal(storeCalls[0].requireCloud, true);
    assert.equal(cleanupCalls.length, 1);
    assert.equal(cleanupCalls[0].public_id, "wisdom_uploads/warranty/photo");
  }

  // Known controller/business rejection cleans both fresh durable assets.
  storeCalls = [];
  cleanupCalls = [];
  {
    const photo = makeFile("photo", "defect.jpg", "image/jpeg");
    const proof = makeFile(
      "proof",
      "receipt.pdf",
      "application/pdf",
      [0x25, 0x50, 0x44, 0x46, 0x2d],
    );
    const req = { __mockFiles: { photo: [photo], proof: [proof] } };
    const res = makeResponse();

    const result = await invokeUpload(uploadMiddleware, req, res);
    assert.equal(result.nextCalled, true);
    assert.ok(req.warrantyEvidenceAssets?.photo);
    assert.ok(req.warrantyEvidenceAssets?.proof);

    res.statusCode = 409;
    res.emit("finish");
    await waitFor(() => cleanupCalls.length === 2);
  }

  // Uncertain/known commit boundary intentionally retains both assets.
  storeCalls = [];
  cleanupCalls = [];
  {
    const photo = makeFile("photo", "defect.jpg", "image/jpeg");
    const proof = makeFile(
      "proof",
      "receipt.pdf",
      "application/pdf",
      [0x25, 0x50, 0x44, 0x46, 0x2d],
    );
    const req = { __mockFiles: { photo: [photo], proof: [proof] } };
    const res = makeResponse();

    const result = await invokeUpload(uploadMiddleware, req, res);
    assert.equal(result.nextCalled, true);
    req.warrantySubmissionRetainUploads = true;
    res.statusCode = 500;
    res.emit("finish");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(cleanupCalls.length, 0);
  }

  // Successful submission retains both assets.
  storeCalls = [];
  cleanupCalls = [];
  {
    const photo = makeFile("photo", "defect.jpg", "image/jpeg");
    const proof = makeFile(
      "proof",
      "receipt.pdf",
      "application/pdf",
      [0x25, 0x50, 0x44, 0x46, 0x2d],
    );
    const req = { __mockFiles: { photo: [photo], proof: [proof] } };
    const res = makeResponse();

    const result = await invokeUpload(uploadMiddleware, req, res);
    assert.equal(result.nextCalled, true);
    res.statusCode = 201;
    res.emit("finish");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(cleanupCalls.length, 0);
  }

  // Multer size failures should remain a client-safe 400 response.
  {
    const req = {
      __mockFiles: {},
      __mockMulterError: new MulterErrorMock("LIMIT_FILE_SIZE"),
    };
    const res = makeResponse();
    const result = await invokeUpload(uploadMiddleware, req, res);
    assert.equal(result.nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.match(res.body?.message || "", /5 MB or smaller/i);
  }

  const frontendSource = fs.readFileSync(frontendPath, "utf8");
  assert.match(
    frontendSource,
    /typeHint="JPG, JPEG, PNG, WEBP, JFIF · max 5 MB"/,
    "photo upload UI must not advertise PDF",
  );
  assert.match(
    frontendSource,
    /typeHint="JPG, JPEG, PNG, WEBP, JFIF, PDF · max 5 MB"/,
    "proof upload UI must continue to advertise PDF",
  );

  console.log("PASS: Warranty customer upload integrity checks passed.");
}

main().catch((err) => {
  Module._load = originalLoad;
  console.error(err);
  process.exitCode = 1;
});
