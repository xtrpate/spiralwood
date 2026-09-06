"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const AR_SESSION_TTL_MS = Math.max(
  10 * 60 * 1000,
  Number.parseInt(process.env.AR_SESSION_TTL_MS, 10) || 2 * 60 * 60 * 1000,
);
const AR_CLEANUP_INTERVAL_MS = Math.max(
  5 * 60 * 1000,
  Number.parseInt(process.env.AR_CLEANUP_INTERVAL_MS, 10) || 15 * 60 * 1000,
);

const resolveUploadRoot = () => {
  const configured = String(process.env.UPLOAD_DIR || "").trim();

  if (!configured) {
    return path.join(__dirname, "..", "uploads");
  }

  return path.isAbsolute(configured)
    ? configured
    : path.join(__dirname, "..", configured);
};

const AR_ROOT = path.join(resolveUploadRoot(), "ar");
const ALLOWED_MODEL_FILES = new Set(["model.glb", "model.usdz"]);
const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOUDINARY_AR_PREFIX = String(
  process.env.AR_CLOUDINARY_PUBLIC_ID_PREFIX || "wisdom_uploads/ar",
)
  .trim()
  .replace(/^\/+|\/+$/g, "");

let cleanupTimer = null;

const ensureARRoot = async () => {
  await fs.promises.mkdir(AR_ROOT, { recursive: true });
};

const isValidSessionId = (value) =>
  SESSION_ID_RE.test(String(value || "").trim());

const sessionDirectory = (sessionId) => path.join(AR_ROOT, sessionId);
const manifestPath = (sessionId) =>
  path.join(sessionDirectory(sessionId), "manifest.json");

const sanitizeDimensions = (source = {}) => {
  const read = (key) => {
    const value = Number(source?.[key]);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  };

  return {
    width_mm: read("width_mm"),
    height_mm: read("height_mm"),
    depth_mm: read("depth_mm"),
  };
};

const hasCloudinaryCredentials = () =>
  Boolean(
    String(process.env.CLOUDINARY_CLOUD_NAME || "").trim() &&
      String(process.env.CLOUDINARY_API_KEY || "").trim() &&
      String(process.env.CLOUDINARY_API_SECRET || "").trim(),
  );

const uploadRawBufferToCloudinary = (buffer, publicId) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        type: "upload",
        public_id: publicId,
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        const secureUrl = String(result?.secure_url || "").trim();

        if (!secureUrl.startsWith("https://")) {
          reject(new Error("Cloudinary did not return a secure HTTPS URL."));
          return;
        }

        resolve({
          public_id: String(result?.public_id || publicId),
          secure_url: secureUrl,
        });
      },
    );

    stream.end(buffer);
  });

const destroyRawCloudinaryAsset = async (publicId) => {
  const id = String(publicId || "").trim();

  if (!id || !hasCloudinaryCredentials()) return;

  const result = await cloudinary.uploader.destroy(id, {
    resource_type: "raw",
    type: "upload",
    invalidate: true,
  });

  const status = String(result?.result || "").toLowerCase();

  if (status && !["ok", "not found"].includes(status)) {
    throw new Error(`Cloudinary AR asset delete returned: ${status}`);
  }
};

const readManifest = async (sessionId) => {
  if (!isValidSessionId(sessionId)) return null;

  try {
    const raw = await fs.promises.readFile(manifestPath(sessionId), "utf8");
    const manifest = JSON.parse(raw);
    return manifest && manifest.id === sessionId ? manifest : null;
  } catch (_error) {
    return null;
  }
};

const removeCloudinaryAssetsForManifest = async (manifest) => {
  const ids = [
    manifest?.cloudinary?.glb?.public_id,
    manifest?.cloudinary?.usdz?.public_id,
  ].filter(Boolean);

  if (!ids.length) return;

  const results = await Promise.allSettled(
    ids.map((publicId) => destroyRawCloudinaryAsset(publicId)),
  );

  const failure = results.find((result) => result.status === "rejected");

  if (failure) {
    throw failure.reason;
  }
};

const removeARSession = async (sessionId, manifest) => {
  try {
    await removeCloudinaryAssetsForManifest(manifest);
  } catch (error) {
    console.error(
      "[AR Cloudinary cleanup]",
      error?.message || error,
    );
    return false;
  }

  await fs.promises.rm(sessionDirectory(sessionId), {
    recursive: true,
    force: true,
  });

  return true;
};

const createARSession = async ({
  glbBuffer,
  usdzBuffer,
  dimensionsMm,
}) => {
  await ensureARRoot();

  if (!hasCloudinaryCredentials()) {
    const error = new Error(
      "Cloudinary credentials are required for public AR model delivery.",
    );
    error.code = "AR_CLOUDINARY_NOT_CONFIGURED";
    throw error;
  }

  const id = crypto.randomUUID();
  const dir = sessionDirectory(id);
  const createdAt = Date.now();
  const expiresAt = createdAt + AR_SESSION_TTL_MS;

  await fs.promises.mkdir(dir, { recursive: false });

  let uploadedGlb = null;
  let uploadedUsdz = null;

  try {
    await Promise.all([
      fs.promises.writeFile(path.join(dir, "model.glb"), glbBuffer),
      fs.promises.writeFile(path.join(dir, "model.usdz"), usdzBuffer),
    ]);

    const glbPublicId =
      `${CLOUDINARY_AR_PREFIX}/${id}/model.glb`;
    const usdzPublicId =
      `${CLOUDINARY_AR_PREFIX}/${id}/model.usdz`;

    const uploadResults = await Promise.allSettled([
      uploadRawBufferToCloudinary(glbBuffer, glbPublicId),
      uploadRawBufferToCloudinary(usdzBuffer, usdzPublicId),
    ]);

    if (uploadResults[0].status === "fulfilled") {
      uploadedGlb = uploadResults[0].value;
    }
    if (uploadResults[1].status === "fulfilled") {
      uploadedUsdz = uploadResults[1].value;
    }

    const uploadFailure = uploadResults.find(
      (result) => result.status === "rejected",
    );

    if (uploadFailure || !uploadedGlb || !uploadedUsdz) {
      throw (
        uploadFailure?.reason ||
        new Error("The public AR models could not be uploaded.")
      );
    }

    const manifest = {
      id,
      created_at: new Date(createdAt).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      dimensions_mm: sanitizeDimensions(dimensionsMm),
      files: {
        glb: "model.glb",
        usdz: "model.usdz",
      },
      cloudinary: {
        resource_type: "raw",
        glb: uploadedGlb,
        usdz: uploadedUsdz,
      },
    };

    await fs.promises.writeFile(
      manifestPath(id),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    return manifest;
  } catch (error) {
    await Promise.allSettled([
      uploadedGlb
        ? destroyRawCloudinaryAsset(uploadedGlb.public_id)
        : Promise.resolve(),
      uploadedUsdz
        ? destroyRawCloudinaryAsset(uploadedUsdz.public_id)
        : Promise.resolve(),
    ]);

    await fs.promises
      .rm(dir, { recursive: true, force: true })
      .catch(() => {});

    throw error;
  }
};

const getARSession = async (sessionId) => {
  const id = String(sessionId || "").trim();

  if (!isValidSessionId(id)) {
    return { status: "invalid", manifest: null };
  }

  const manifest = await readManifest(id);

  if (!manifest) {
    return { status: "missing", manifest: null };
  }

  const expiresAt = Date.parse(manifest.expires_at);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await removeARSession(id, manifest);

    return { status: "expired", manifest: null };
  }

  return { status: "ready", manifest };
};

const getARAssetPath = async (sessionId, filename) => {
  const safeFilename = String(filename || "").trim();

  if (!ALLOWED_MODEL_FILES.has(safeFilename)) {
    return { status: "invalid", filePath: null };
  }

  const session = await getARSession(sessionId);

  if (session.status !== "ready") {
    return { status: session.status, filePath: null };
  }

  const filePath = path.join(sessionDirectory(sessionId), safeFilename);

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch (_error) {
    return { status: "missing", filePath: null };
  }

  return {
    status: "ready",
    filePath,
    filename: safeFilename,
    manifest: session.manifest,
  };
};

const cleanupExpiredARSessions = async () => {
  await ensureARRoot();

  const entries = await fs.promises.readdir(AR_ROOT, {
    withFileTypes: true,
  });

  const now = Date.now();

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && isValidSessionId(entry.name))
      .map(async (entry) => {
        const dir = sessionDirectory(entry.name);
        const manifest = await readManifest(entry.name);

        let shouldRemove = false;

        if (manifest) {
          const expiresAt = Date.parse(manifest.expires_at);
          shouldRemove = !Number.isFinite(expiresAt) || expiresAt <= now;
        } else {
          try {
            const stat = await fs.promises.stat(dir);
            shouldRemove = now - stat.mtimeMs > AR_SESSION_TTL_MS;
          } catch (_error) {
            shouldRemove = true;
          }
        }

        if (shouldRemove) {
          if (manifest) {
            await removeARSession(entry.name, manifest);
          } else {
            await fs.promises.rm(dir, {
              recursive: true,
              force: true,
            });
          }
        }
      }),
  );
};

const startARAssetCleanupJob = () => {
  if (cleanupTimer) return cleanupTimer;

  cleanupExpiredARSessions().catch((error) => {
    console.error("[AR cleanup initial]", error);
  });

  cleanupTimer = setInterval(() => {
    cleanupExpiredARSessions().catch((error) => {
      console.error("[AR cleanup]", error);
    });
  }, AR_CLEANUP_INTERVAL_MS);

  cleanupTimer.unref?.();
  return cleanupTimer;
};

module.exports = {
  AR_SESSION_TTL_MS,
  createARSession,
  getARSession,
  getARAssetPath,
  cleanupExpiredARSessions,
  startARAssetCleanupJob,
  isValidSessionId,
};
