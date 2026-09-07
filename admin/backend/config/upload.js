const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { verifyBufferSignature } = require("../utils/verifyFileSignature");

// 1. Configure Cloudinary with your .env keys
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_IMAGES = ["jpg", "jpeg", "png", "webp"];
const ALLOWED_DOCS = ["pdf", "jpg", "jpeg", "png"];
const ALLOWED_BLUEPRINTS = ["pdf", "png", "jpg", "jpeg", "svg"];
const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "15", 10);

// 2. Helper function to route files to specific Cloudinary folders
function cloudStorage(subFolder, allowedFormats) {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `wisdom_uploads/${subFolder}`,
      allowed_formats: allowedFormats,
    },
  });
}

// 3. Export our specific uploaders (now powered by Cloudinary!)
const MAX_PRODUCT_IMAGES = 6;

// WISDOM PRODUCT IMAGE LOCAL DEV STORAGE V1
// Local Product management should not depend on an outbound Cloudinary
// connection during development. Production keeps Cloudinary storage.
const configuredProductUploadDir =
  process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const productUploadRoot = path.isAbsolute(configuredProductUploadDir)
  ? configuredProductUploadDir
  : path.join(__dirname, "..", configuredProductUploadDir);
const productLocalDir = path.join(productUploadRoot, "products");

fs.mkdirSync(productLocalDir, { recursive: true });

const productImageFileFilter = (req, file, cb) => {
  const ext = path
    .extname(file.originalname || "")
    .toLowerCase()
    .replace(".", "");
  const mime = String(file.mimetype || "").toLowerCase();

  const allowedMime = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (ALLOWED_IMAGES.includes(ext) && allowedMime.includes(mime)) {
    cb(null, true);
    return;
  }

  const error = new Error(
    "Product images must be JPG, JPEG, PNG, or WEBP files.",
  );
  error.status = 400;
  cb(error);
};

const productLocalStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, productLocalDir),
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ALLOWED_IMAGES.includes(rawExt.replace(".", ""))
      ? rawExt
      : ".jpg";

    cb(
      null,
      `product-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`,
    );
  },
});

const useLocalProductStorage = process.env.NODE_ENV !== "production";

const productImageUpload = multer({
  storage: useLocalProductStorage
    ? productLocalStorage
    : cloudStorage("products", ALLOWED_IMAGES),
  limits: {
    fileSize: MAX_MB * 1024 * 1024,
    files: MAX_PRODUCT_IMAGES,
  },
  fileFilter: productImageFileFilter,
}).fields([
  // Keep the old field for backward compatibility with older clients.
  { name: "image", maxCount: 1 },
  // New gallery field used by the Product Form.
  { name: "images", maxCount: MAX_PRODUCT_IMAGES },
]);

exports.uploadProductImage = (req, res, next) => {
  productImageUpload(req, res, (err) => {
    if (err) {
      console.error("[product image upload]", err);

      if (err instanceof multer.MulterError) {
        if (
          err.code === "LIMIT_FILE_COUNT" ||
          err.code === "LIMIT_UNEXPECTED_FILE"
        ) {
          return res.status(400).json({
            message: `You can upload up to ${MAX_PRODUCT_IMAGES} product images.`,
          });
        }

        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: `Each product image must be ${MAX_MB}MB or smaller.`,
          });
        }
      }

      if (Number(err.status) === 400) {
        return res.status(400).json({ message: err.message });
      }

      return next(err);
    }

    const legacy = req.files?.image?.[0] || null;
    const gallery = Array.isArray(req.files?.images)
      ? req.files.images
      : [];
    const all = [...(legacy ? [legacy] : []), ...gallery];

    if (all.length > MAX_PRODUCT_IMAGES) {
      return res.status(400).json({
        message: `You can upload up to ${MAX_PRODUCT_IMAGES} product images.`,
      });
    }

    if (useLocalProductStorage) {
      for (const file of all) {
        file.path = `/uploads/products/${file.filename}`;
      }
    }

    req.productImageUploads = {
      legacy,
      gallery,
      all,
    };

    // Preserve req.file for any existing code that still expects it.
    req.file = legacy || gallery[0] || null;

    next();
  });
};

// WISDOM INTERNAL USER PROFILE PHOTO UPLOAD V1
// Admin-created Admin/Staff photos reuse the same Cloudinary-backed pattern as
// customer avatars. Multipart parsing and magic-byte validation happen before
// controller validation; Cloudinary persistence is deferred until the account
// payload and duplicate checks have passed.
const INTERNAL_PROFILE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
]);
const INTERNAL_PROFILE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const INTERNAL_PROFILE_MAX_BYTES = 2 * 1024 * 1024;

const internalProfileRawUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INTERNAL_PROFILE_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "")
      .trim()
      .toLowerCase();

    if (
      INTERNAL_PROFILE_EXTENSIONS.has(ext) &&
      INTERNAL_PROFILE_MIME_TYPES.has(mime)
    ) {
      cb(null, true);
      return;
    }

    const error = new Error(
      "Profile photo must be a JPG, JPEG, JFIF, PNG, or WEBP image.",
    );
    error.status = 400;
    cb(error);
  },
}).single("profile_photo");

const uploadInternalProfileBufferToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "wisdom_uploads/avatars",
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      },
    );

    stream.end(file.buffer);
  });

exports.uploadUserProfilePhoto = (req, res, next) => {
  internalProfileRawUpload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Profile photo must be 2MB or smaller.",
          });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            message: "Invalid profile photo upload.",
          });
        }
      }

      if (Number(err.status) === 400) {
        return res.status(400).json({ message: err.message });
      }

      console.error("[internal profile photo parse]", err);
      return res.status(500).json({
        message: "Profile photo could not be read.",
      });
    }

    if (!req.file) {
      next();
      return;
    }

    const ext = path.extname(req.file.originalname || "").toLowerCase();
    if (!verifyBufferSignature(req.file.buffer, ext)) {
      return res.status(400).json({
        message: "Profile photo content does not match its image file type.",
      });
    }

    next();
  });
};

exports.persistUserProfilePhoto = async (file) => {
  if (!file) return null;

  try {
    const result = await uploadInternalProfileBufferToCloudinary(file);
    if (!result?.secure_url) {
      throw new Error("Cloudinary did not return a secure image URL.");
    }

    return {
      url: result.secure_url,
      public_id: result.public_id || null,
    };
  } catch (uploadError) {
    console.error(
      "[internal profile photo cloudinary]",
      uploadError?.message || uploadError,
    );
    const error = new Error("Profile photo upload failed. Please try again.");
    error.code = "INTERNAL_PROFILE_UPLOAD_FAILED";
    throw error;
  }
};

const blueprintUpload = multer({
  storage: cloudStorage("blueprints", ALLOWED_BLUEPRINTS),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "reference_file", maxCount: 1 },
  { name: "front_reference", maxCount: 1 },
  { name: "back_reference", maxCount: 1 },
  { name: "left_reference", maxCount: 1 },
  { name: "right_reference", maxCount: 1 },
  { name: "top_reference", maxCount: 1 },
]);

exports.uploadBlueprintFile = (req, res, next) => {
  blueprintUpload(req, res, (err) => {
    if (err) return next(err);

    req.referenceFiles = {
      front:
        req.files?.front_reference?.[0] ||
        req.files?.reference_file?.[0] ||
        req.files?.file?.[0] ||
        null,
      back: req.files?.back_reference?.[0] || null,
      left: req.files?.left_reference?.[0] || null,
      right: req.files?.right_reference?.[0] || null,
      top: req.files?.top_reference?.[0] || null,
    };

    req.file =
      req.referenceFiles.front ||
      req.files?.reference_file?.[0] ||
      req.files?.file?.[0] ||
      null;

    next();
  });
};

exports.uploadPaymentProof = multer({
  storage: cloudStorage("payments", ALLOWED_IMAGES),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).single("proof");

exports.uploadWarrantyProof = multer({
  storage: cloudStorage("warranty", ALLOWED_DOCS),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).single("proof");

exports.uploadDeliveryReceipt = multer({
  storage: cloudStorage("deliveries", ALLOWED_IMAGES),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).single("receipt");

/* ── Support message attachment ── */
const ALLOWED_SUPPORT_ATTACHMENTS = ["jpg", "jpeg", "png", "webp", "pdf"];

const supportAttachmentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "wisdom_uploads/support",
    resource_type: "auto",
    allowed_formats: ALLOWED_SUPPORT_ATTACHMENTS,
  },
});

exports.uploadSupportAttachment = multer({
  storage: supportAttachmentStorage,
  limits: {
    fileSize: MAX_MB * 1024 * 1024,
  },
}).array("attachments", 5);

// WISDOM SITE LOGO HARDENING V1.0.0
// Parse into memory first so extension/MIME/magic bytes can be checked BEFORE
// the logo is written to local storage or sent to Cloudinary.
const SITE_LOGO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const SITE_LOGO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const SITE_LOGO_MAX_BYTES = 5 * 1024 * 1024;

const configuredUploadDir =
  process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const siteUploadRoot = path.isAbsolute(configuredUploadDir)
  ? configuredUploadDir
  : path.join(__dirname, "..", configuredUploadDir);
const siteLogoLocalDir = path.join(siteUploadRoot, "settings");

fs.mkdirSync(siteLogoLocalDir, { recursive: true });

const useLocalSiteLogoStorage = process.env.NODE_ENV !== "production";

const siteLogoFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "")
    .trim()
    .toLowerCase();

  if (
    SITE_LOGO_EXTENSIONS.has(ext) &&
    SITE_LOGO_MIME_TYPES.has(mime)
  ) {
    cb(null, true);
    return;
  }

  const error = new Error("Site logo must be a JPG, JPEG, PNG, or WEBP image.");
  error.status = 400;
  cb(error);
};

const siteLogoRawUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SITE_LOGO_MAX_BYTES },
  fileFilter: siteLogoFileFilter,
}).single("site_logo");

exports.uploadSiteLogo = (req, res, next) => {
  siteLogoRawUpload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Site logo must be 5MB or smaller.",
          });
        }

        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            message: "Invalid site logo upload field.",
          });
        }
      }

      if (Number(err.status) === 400) {
        return res.status(400).json({ message: err.message });
      }

      return next(err);
    }

    if (!req.file) {
      next();
      return;
    }

    const ext = path.extname(req.file.originalname || "").toLowerCase();
    const mime = String(req.file.mimetype || "")
      .trim()
      .toLowerCase();

    const extensionMatchesMime =
      ([".jpg", ".jpeg"].includes(ext) && mime === "image/jpeg") ||
      (ext === ".png" && mime === "image/png") ||
      (ext === ".webp" && mime === "image/webp");

    if (
      !extensionMatchesMime ||
      !verifyBufferSignature(req.file.buffer, ext)
    ) {
      return res.status(400).json({
        message: "Site logo content does not match its image file type.",
      });
    }

    next();
  });
};

const uploadSiteLogoBufferToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "wisdom_uploads/settings",
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.secure_url) {
          reject(new Error("Cloudinary did not return a site logo URL."));
          return;
        }

        resolve({
          url: result.secure_url,
          storage: "cloudinary",
          publicId: result.public_id || null,
          resourceType: result.resource_type || "image",
          localPath: null,
        });
      },
    );

    stream.end(file.buffer);
  });

exports.persistSiteLogo = async (file) => {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    const error = new Error("The selected site logo is empty.");
    error.statusCode = 400;
    throw error;
  }

  if (useLocalSiteLogoStorage) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const filename =
      `site-logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const absolutePath = path.join(siteLogoLocalDir, filename);

    try {
      await fs.promises.writeFile(absolutePath, file.buffer);
    } catch (writeErr) {
      const error = new Error("Site logo could not be saved.");
      error.statusCode = 500;
      error.cause = writeErr;
      throw error;
    }

    return {
      url: `/uploads/settings/${filename}`,
      storage: "local",
      publicId: null,
      resourceType: null,
      localPath: absolutePath,
    };
  }

  try {
    return await uploadSiteLogoBufferToCloudinary(file);
  } catch (uploadErr) {
    console.error(
      "[site logo cloudinary]",
      uploadErr?.message || uploadErr,
    );
    const error = new Error("Site logo upload failed. Please try again.");
    error.statusCode = 502;
    error.cause = uploadErr;
    throw error;
  }
};

exports.cleanupPersistedSiteLogo = async (asset) => {
  if (!asset) return;

  if (asset.storage === "local" && asset.localPath) {
    try {
      await fs.promises.unlink(asset.localPath);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    return;
  }

  if (asset.storage === "cloudinary" && asset.publicId) {
    await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType || "image",
      invalidate: true,
    });
  }
};
