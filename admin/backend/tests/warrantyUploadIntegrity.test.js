const assert = require("assert");
const { EventEmitter } = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const routePath = require.resolve("../routes/customer.warranty");
const frontendPath = path.join(
  __dirname,
  "../../frontend/src/pages/customer/warrantypage.jsx",
);

let capturedMulterOptions = null;

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

function multerMock(options) {
  capturedMulterOptions = options;
  return {
    fields() {
      return (req, res, cb) => {
        req.files = req.__mockFiles || {};
        cb(req.__mockMulterError || null);
      };
    },
  };
}

multerMock.diskStorage = (config) => config;

const passMiddleware = (req, res, next) => next();
const controllerMock = {
  getEligibleOrders: passMiddleware,
  getClaims: passMiddleware,
  submitClaim: passMiddleware,
  cancelClaim: passMiddleware,
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

function createTempFile(dir, filename, buffer) {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return {
    path: filePath,
    originalname: filename,
  };
}

function validJpegBytes() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  ]);
}

function validPdfBytes() {
  return Buffer.from("%PDF-1.7\nW5A test proof\n", "utf8");
}

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for expected cleanup state.");
}

function runFileFilter(fieldname, originalname) {
  return new Promise((resolve) => {
    capturedMulterOptions.fileFilter(
      {},
      { fieldname, originalname },
      (err, accepted) => resolve({ err, accepted }),
    );
  });
}

async function runUpload(uploadMiddleware, req, res) {
  return new Promise((resolve, reject) => {
    uploadMiddleware(req, res, (err) => {
      if (err) reject(err);
      else resolve();
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
  assert.equal(
    capturedMulterOptions.limits?.fileSize,
    5 * 1024 * 1024,
    "customer warranty uploads must remain capped at 5 MB per file",
  );

  const photoJpg = await runFileFilter("photo", "defect.JPG");
  assert.equal(photoJpg.err, null);
  assert.equal(photoJpg.accepted, true);

  const photoPdf = await runFileFilter("photo", "defect.pdf");
  assert.equal(photoPdf.accepted, undefined);
  assert.equal(photoPdf.err?.status, 400);
  assert.match(photoPdf.err?.message || "", /photo of the issue/i);

  const proofPdf = await runFileFilter("proof", "receipt.PDF");
  assert.equal(proofPdf.err, null);
  assert.equal(proofPdf.accepted, true);

  const proofExe = await runFileFilter("proof", "receipt.exe");
  assert.equal(proofExe.accepted, undefined);
  assert.equal(proofExe.err?.status, 400);
  assert.match(proofExe.err?.message || "", /proof of purchase/i);

  const postRoute = warrantyRouter.__routes.find(
    (entry) => entry.method === "post" && entry.path === "/",
  );
  assert.ok(postRoute, "customer warranty POST / route must exist");
  assert.equal(postRoute.handlers.length, 4);
  const uploadMiddleware = postRoute.handlers[2];

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wisdom-w5a-"));
  try {
    // One valid sibling + one invalid-signature file: BOTH request files must go.
    {
      const caseDir = fs.mkdtempSync(path.join(tempRoot, "signature-"));
      const photo = createTempFile(caseDir, "photo.jpg", validJpegBytes());
      const proof = createTempFile(
        caseDir,
        "proof.pdf",
        Buffer.from("not a real pdf", "utf8"),
      );
      const req = {
        __mockFiles: { photo: [photo], proof: [proof] },
      };
      const res = makeResponse();

      await new Promise((resolve, reject) => {
        res.once("finish", () => setImmediate(resolve));
        uploadMiddleware(req, res, (err) => {
          reject(err || new Error("invalid signature should not call next"));
        });
      });

      assert.equal(res.statusCode, 400);
      assert.match(res.body?.message || "", /does not match its file extension/i);
      await waitFor(() => !fs.existsSync(photo.path) && !fs.existsSync(proof.path));
    }

    // Multer-level rejection after files were seen must clean every request file.
    {
      const caseDir = fs.mkdtempSync(path.join(tempRoot, "multer-"));
      const photo = createTempFile(caseDir, "photo.jpg", validJpegBytes());
      const proof = createTempFile(caseDir, "proof.pdf", validPdfBytes());
      const multerError = Object.assign(new Error("simulated multer rejection"), {
        status: 400,
      });
      const req = {
        __mockFiles: { photo: [photo], proof: [proof] },
        __mockMulterError: multerError,
      };
      const res = makeResponse();

      let receivedError = null;
      await new Promise((resolve) => {
        uploadMiddleware(req, res, (err) => {
          receivedError = err;
          resolve();
        });
      });

      assert.equal(receivedError, multerError);
      await waitFor(() => !fs.existsSync(photo.path) && !fs.existsSync(proof.path));
    }

    // Controller/business rejection (including duplicate-claim 409) cleans uploads.
    {
      const caseDir = fs.mkdtempSync(path.join(tempRoot, "business-409-"));
      const photo = createTempFile(caseDir, "photo.jpg", validJpegBytes());
      const proof = createTempFile(caseDir, "proof.pdf", validPdfBytes());
      const req = {
        __mockFiles: { photo: [photo], proof: [proof] },
      };
      const res = makeResponse();

      await runUpload(uploadMiddleware, req, res);
      res.statusCode = 409;
      res.emit("finish");

      await waitFor(() => !fs.existsSync(photo.path) && !fs.existsSync(proof.path));
    }

    // Successful submission keeps its evidence files.
    {
      const caseDir = fs.mkdtempSync(path.join(tempRoot, "success-"));
      const photo = createTempFile(caseDir, "photo.jpg", validJpegBytes());
      const proof = createTempFile(caseDir, "proof.pdf", validPdfBytes());
      const req = {
        __mockFiles: { photo: [photo], proof: [proof] },
      };
      const res = makeResponse();

      await runUpload(uploadMiddleware, req, res);
      res.statusCode = 201;
      res.emit("finish");
      await new Promise((resolve) => setTimeout(resolve, 30));

      assert.equal(fs.existsSync(photo.path), true);
      assert.equal(fs.existsSync(proof.path), true);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
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
