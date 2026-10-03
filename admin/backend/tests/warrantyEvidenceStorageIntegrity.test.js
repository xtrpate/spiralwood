"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const adaptiveUploadPath = require.resolve("../utils/adaptiveUpload");
const signedUrlPath = require.resolve("../utils/signedUrl");
const uploadRootPath = require.resolve("../utils/uploadRoot");

const adaptiveSource = fs.readFileSync(adaptiveUploadPath, "utf8");
const signedSource = fs.readFileSync(signedUrlPath, "utf8");

assert.match(adaptiveSource, /AUTHENTICATED_REFERENCE_PREFIX/);
assert.match(adaptiveSource, /deliveryType:\s*"authenticated"|deliveryType = "upload"/);
assert.match(adaptiveSource, /requireCloud = false/);
assert.match(adaptiveSource, /type:\s*asset\.delivery_type \|\| "upload"/);
assert.match(signedSource, /private_download_url/);
assert.match(signedSource, /type:\s*"authenticated"/);
assert.match(signedSource, /expires_at:/);

const originalLoad = Module._load;
const originalEnv = {
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  ALLOW_LOCAL_UPLOAD_FALLBACK: process.env.ALLOW_LOCAL_UPLOAD_FALLBACK,
  UPLOAD_DIR: process.env.UPLOAD_DIR,
};

let uploadMode = "success";
let capturedUploadOptions = null;
let capturedDestroy = null;
let capturedDownload = null;
let uploadSequence = 0;

const cloudinaryMock = {
  config() {},
  uploader: {
    upload_stream(options, callback) {
      capturedUploadOptions = options;
      return {
        end(buffer) {
          if (uploadMode === "fail") {
            callback(new Error("SECRET_CLOUDINARY_PROVIDER_FAILURE"));
            return;
          }

          uploadSequence += 1;
          callback(null, {
            secure_url: `https://res.example.invalid/public-${uploadSequence}.jpg`,
            public_id: `${options.folder}/evidence-${uploadSequence}`,
            bytes: buffer.length,
            resource_type: "image",
            format: "jpg",
            type: options.type || "upload",
          });
        },
      };
    },
    async destroy(publicId, options) {
      capturedDestroy = { publicId, options };
      return { result: "ok" };
    },
  },
  utils: {
    private_download_url(publicId, format, options) {
      capturedDownload = { publicId, format, options };
      return `https://api.example.invalid/download/${encodeURIComponent(publicId)}.${format}`;
    },
  },
};

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "cloudinary") {
    return { v2: cloudinaryMock };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function main() {
  process.env.CLOUDINARY_CLOUD_NAME = "w9a-test-cloud";
  process.env.CLOUDINARY_API_KEY = "w9a-test-key";
  process.env.CLOUDINARY_API_SECRET = "w9a-test-secret";
  process.env.JWT_SECRET = "w9a-test-jwt-secret";

  delete require.cache[adaptiveUploadPath];
  delete require.cache[signedUrlPath];
  delete require.cache[uploadRootPath];

  const adaptiveUpload = require(adaptiveUploadPath);
  const signedUrl = require(signedUrlPath);

  const file = {
    originalname: "defect.jpg",
    mimetype: "image/jpeg",
    size: 4,
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  };

  uploadMode = "success";
  capturedUploadOptions = null;
  capturedDestroy = null;
  capturedDownload = null;

  const authenticatedAsset = await adaptiveUpload.storeUploadBuffer({
    file,
    folder: "warranty",
    deliveryType: "authenticated",
    requireCloud: true,
  });

  assert.equal(capturedUploadOptions.type, "authenticated");
  assert.equal(capturedUploadOptions.resource_type, "auto");
  assert.equal(authenticatedAsset.storage, "cloudinary");
  assert.equal(authenticatedAsset.delivery_type, "authenticated");
  assert.match(authenticatedAsset.file_url, /^cloudinary-auth:/);
  assert.doesNotMatch(authenticatedAsset.file_url, /res\.example\.invalid/);

  const signed = signedUrl.signUploadPath(authenticatedAsset.file_url);
  assert.match(signed || "", /^https:\/\/api\.example\.invalid\/download\//);
  assert.equal(capturedDownload.publicId, authenticatedAsset.public_id);
  assert.equal(capturedDownload.format, "jpg");
  assert.equal(capturedDownload.options.resource_type, "image");
  assert.equal(capturedDownload.options.type, "authenticated");
  assert.equal(capturedDownload.options.attachment, false);
  assert.equal(Number.isInteger(capturedDownload.options.expires_at), true);

  const nowSeconds = Math.floor(Date.now() / 1000);
  assert.ok(capturedDownload.options.expires_at > nowSeconds + 13 * 60);
  assert.ok(capturedDownload.options.expires_at <= nowSeconds + 16 * 60);

  await adaptiveUpload.cleanupStoredUpload(authenticatedAsset);
  assert.equal(capturedDestroy.publicId, authenticatedAsset.public_id);
  assert.equal(capturedDestroy.options.resource_type, "image");
  assert.equal(capturedDestroy.options.type, "authenticated");
  assert.equal(capturedDestroy.options.invalidate, true);

  // New fulfillment/replacement proofs use the same authenticated cloud model.
  uploadMode = "success";
  capturedUploadOptions = null;
  capturedDestroy = null;
  capturedDownload = null;

  const authenticatedReplacementAsset = await adaptiveUpload.storeUploadBuffer({
    file,
    folder: "warranty-replacements",
    deliveryType: "authenticated",
    requireCloud: true,
  });

  assert.equal(capturedUploadOptions.folder, "wisdom_uploads/warranty-replacements");
  assert.equal(capturedUploadOptions.type, "authenticated");
  assert.equal(authenticatedReplacementAsset.delivery_type, "authenticated");
  assert.match(authenticatedReplacementAsset.file_url, /^cloudinary-auth:/);
  assert.match(
    authenticatedReplacementAsset.public_id,
    /^wisdom_uploads\/warranty-replacements\//,
  );

  const signedReplacement = signedUrl.signUploadPath(
    authenticatedReplacementAsset.file_url,
  );
  assert.match(
    signedReplacement || "",
    /^https:\/\/api\.example\.invalid\/download\//,
  );
  assert.equal(
    capturedDownload.publicId,
    authenticatedReplacementAsset.public_id,
  );
  assert.equal(capturedDownload.options.type, "authenticated");
  assert.equal(capturedDownload.options.resource_type, "image");

  await adaptiveUpload.cleanupStoredUpload(authenticatedReplacementAsset);
  assert.equal(capturedDestroy.publicId, authenticatedReplacementAsset.public_id);
  assert.equal(capturedDestroy.options.type, "authenticated");
  assert.equal(capturedDestroy.options.invalidate, true);

  // Legacy/local signed upload URLs must continue working unchanged.
  const legacyPath = "uploads/warranty/legacy-proof.jpg";
  const legacySigned = signedUrl.signUploadPath(legacyPath);
  const legacyUrl = new URL(legacySigned, "https://local.invalid/");
  assert.equal(
    signedUrl.verifyUploadSignature(
      legacyPath,
      legacyUrl.searchParams.get("exp"),
      legacyUrl.searchParams.get("sig"),
    ),
    true,
  );

  // Existing public-cloud callers must keep their previous URL behavior.
  uploadMode = "success";
  capturedUploadOptions = null;
  const publicAsset = await adaptiveUpload.storeUploadBuffer({
    file,
    folder: "non-warranty-test",
  });
  assert.equal(capturedUploadOptions.type, "upload");
  assert.equal(publicAsset.delivery_type, "upload");
  assert.match(publicAsset.file_url, /^https:\/\/res\.example\.invalid\//);

  // requireCloud=true must not fall back to local disk after cloud failure,
  // even if the generic development fallback has been explicitly enabled.
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wisdom-w9a-cloud-only-"));
  process.env.UPLOAD_DIR = tempRoot;
  process.env.ALLOW_LOCAL_UPLOAD_FALLBACK = "true";
  uploadMode = "fail";
  let cloudOnlyError = null;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await adaptiveUpload.storeUploadBuffer({
      file,
      folder: "warranty",
      deliveryType: "authenticated",
      requireCloud: true,
    });
  } catch (error) {
    cloudOnlyError = error;
  } finally {
    console.error = originalConsoleError;
  }

  assert(cloudOnlyError);
  assert.equal(cloudOnlyError.status, 502);
  assert.match(cloudOnlyError.message, /durable cloud upload is unavailable/i);
  assert.doesNotMatch(cloudOnlyError.message, /SECRET_CLOUDINARY_PROVIDER_FAILURE/);
  assert.equal(fs.readdirSync(tempRoot).length, 0);
  fs.rmSync(tempRoot, { recursive: true, force: true });

  console.log("PASS: Warranty evidence storage integrity checks passed.");
}

main()
  .catch((error) => {
    console.error("FAIL: Warranty evidence storage integrity checks failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Module._load = originalLoad;
    delete require.cache[adaptiveUploadPath];
    delete require.cache[signedUrlPath];
    delete require.cache[uploadRootPath];
    restoreEnv();
  });
