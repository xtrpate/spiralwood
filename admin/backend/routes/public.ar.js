"use strict";

const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");

const {
  createARSession,
  getARSession,
  getARAssetPath,
  startARAssetCleanupJob,
  isValidSessionId,
} = require("../services/arAssetService");

const router = express.Router();

const MAX_AR_FILE_BYTES = Math.max(
  5 * 1024 * 1024,
  Number.parseInt(process.env.AR_MAX_FILE_BYTES, 10) || 24 * 1024 * 1024,
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AR_FILE_BYTES,
    files: 2,
    fields: 4,
  },
});

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number.parseInt(process.env.AR_CREATE_RATE_LIMIT, 10) || 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many AR previews were created. Please try again later.",
  },
});

const isValidGlb = (buffer) =>
  Buffer.isBuffer(buffer) &&
  buffer.length >= 12 &&
  buffer.toString("ascii", 0, 4) === "glTF" &&
  buffer.readUInt32LE(4) === 2;

const isValidUsdz = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;

  return (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(buffer[2]) &&
    [0x04, 0x06, 0x08].includes(buffer[3])
  );
};

const parseDimensions = (raw) => {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw || {};
    const read = (key) => {
      const number = Number(value?.[key]);
      return Number.isFinite(number) && number > 0
        ? Math.round(number)
        : 0;
    };

    return {
      width_mm: read("width_mm"),
      height_mm: read("height_mm"),
      depth_mm: read("depth_mm"),
    };
  } catch (_error) {
    return {
      width_mm: 0,
      height_mm: 0,
      depth_mm: 0,
    };
  }
};

const assetPath = (sessionId, filename) =>
  `/api/public/ar/assets/${encodeURIComponent(sessionId)}/${encodeURIComponent(filename)}`;

const secureCloudinaryUrl = (value) => {
  const url = String(value || "").trim();
  return url.startsWith("https://") ? url : "";
};

router.post("/sessions", createLimiter, (req, res) => {
  upload.fields([
    { name: "glb", maxCount: 1 },
    { name: "usdz", maxCount: 1 },
  ])(req, res, async (uploadError) => {
    if (uploadError) {
      const message =
        uploadError.code === "LIMIT_FILE_SIZE"
          ? "The AR model is too large to prepare."
          : "The AR model upload could not be processed.";

      return res.status(400).json({ message });
    }

    const glb = req.files?.glb?.[0];
    const usdz = req.files?.usdz?.[0];

    if (!glb?.buffer || !usdz?.buffer) {
      return res.status(400).json({
        message: "Both Android and iPhone AR models are required.",
      });
    }

    if (!isValidGlb(glb.buffer)) {
      return res.status(400).json({
        message: "The Android AR model is invalid.",
      });
    }

    if (!isValidUsdz(usdz.buffer)) {
      return res.status(400).json({
        message: "The iPhone AR model is invalid.",
      });
    }

    const dimensions = parseDimensions(req.body?.dimensions);

    if (
      !dimensions.width_mm ||
      !dimensions.height_mm ||
      !dimensions.depth_mm
    ) {
      return res.status(400).json({
        message: "The AR model dimensions are invalid.",
      });
    }

    try {
      const manifest = await createARSession({
        glbBuffer: glb.buffer,
        usdzBuffer: usdz.buffer,
        dimensionsMm: dimensions,
      });

      return res.status(201).json({
        id: manifest.id,
        expires_at: manifest.expires_at,
        dimensions_mm: manifest.dimensions_mm,
        glb_url: secureCloudinaryUrl(
          manifest?.cloudinary?.glb?.secure_url,
        ),
        usdz_url: secureCloudinaryUrl(
          manifest?.cloudinary?.usdz?.secure_url,
        ),
      });
    } catch (error) {
      console.error("[AR session create]", error);
      return res.status(500).json({
        message:
          error?.code === "AR_CLOUDINARY_NOT_CONFIGURED"
            ? "AR public model hosting is not configured."
            : "The AR preview could not be stored.",
      });
    }
  });
});

router.get("/sessions/:id", async (req, res) => {
  const sessionId = String(req.params.id || "").trim();

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({
      message: "Invalid AR preview link.",
    });
  }

  try {
    const result = await getARSession(sessionId);

    if (result.status === "expired") {
      return res.status(410).json({
        message: "This AR preview has expired. Create a new preview.",
      });
    }

    if (result.status !== "ready" || !result.manifest) {
      return res.status(404).json({
        message: "AR preview not found.",
      });
    }

    const { manifest } = result;

    return res.json({
      id: manifest.id,
      expires_at: manifest.expires_at,
      dimensions_mm: manifest.dimensions_mm,
      glb_url: secureCloudinaryUrl(
        manifest?.cloudinary?.glb?.secure_url,
      ),
      usdz_url: secureCloudinaryUrl(
        manifest?.cloudinary?.usdz?.secure_url,
      ),
      glb_path: assetPath(manifest.id, manifest.files.glb),
      usdz_path: assetPath(manifest.id, manifest.files.usdz),
    });
  } catch (error) {
    console.error("[AR session read]", error);
    return res.status(500).json({
      message: "The AR preview could not be loaded.",
    });
  }
});

router.get("/assets/:id/:filename", async (req, res) => {
  const sessionId = String(req.params.id || "").trim();
  const filename = String(req.params.filename || "").trim();

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({
      message: "Invalid AR preview link.",
    });
  }

  try {
    const result = await getARAssetPath(sessionId, filename);

    if (result.status === "expired") {
      return res.status(410).json({
        message: "This AR preview has expired. Create a new preview.",
      });
    }

    if (result.status === "invalid") {
      return res.status(400).json({
        message: "Invalid AR model file.",
      });
    }

    if (result.status !== "ready" || !result.filePath) {
      return res.status(404).json({
        message: "AR model file not found.",
      });
    }

    const isGlb = result.filename === "model.glb";

    res.setHeader(
      "Content-Type",
      isGlb ? "model/gltf-binary" : "model/vnd.usdz+zip",
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${result.filename}"`,
    );
    res.setHeader("Cache-Control", "private, max-age=60");

    return res.sendFile(result.filePath);
  } catch (error) {
    console.error("[AR asset read]", error);
    return res.status(500).json({
      message: "The AR model file could not be loaded.",
    });
  }
});

startARAssetCleanupJob();

module.exports = router;
