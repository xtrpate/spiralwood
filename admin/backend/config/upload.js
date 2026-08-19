const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

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

// WISDOM SITE LOGO LOCAL DEV STORAGE V1
// Local development should not depend on an external Cloudinary request just
// to update the customer-facing site logo. Production keeps Cloudinary so the
// deployed logo remains durable across server restarts/deploys.
const configuredUploadDir =
  process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const siteUploadRoot = path.isAbsolute(configuredUploadDir)
  ? configuredUploadDir
  : path.join(__dirname, "..", configuredUploadDir);
const siteLogoLocalDir = path.join(siteUploadRoot, "settings");

fs.mkdirSync(siteLogoLocalDir, { recursive: true });

const siteLogoFileFilter = (req, file, cb) => {
  const ext = path
    .extname(file.originalname || "")
    .toLowerCase()
    .replace(".", "");
  const mime = String(file.mimetype || "").toLowerCase();
  const allowedMime = ["image/jpeg", "image/png", "image/webp"];

  if (ALLOWED_IMAGES.includes(ext) && allowedMime.includes(mime)) {
    cb(null, true);
    return;
  }

  const error = new Error("Site logo must be a JPG, JPEG, PNG, or WEBP image.");
  error.status = 400;
  cb(error);
};

const siteLogoLocalStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, siteLogoLocalDir),
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname || "").toLowerCase();
    const ext = ALLOWED_IMAGES.includes(rawExt.replace(".", ""))
      ? rawExt
      : ".png";
    cb(
      null,
      `site-logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`,
    );
  },
});

const useLocalSiteLogoStorage = process.env.NODE_ENV !== "production";

const siteLogoUpload = multer({
  storage: useLocalSiteLogoStorage
    ? siteLogoLocalStorage
    : cloudStorage("settings", ALLOWED_IMAGES),
  limits: {
    // WISDOM SITE LOGO 5MB LIMIT V1
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: siteLogoFileFilter,
}).single("site_logo");

exports.uploadSiteLogo = (req, res, next) => {
  siteLogoUpload(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }

    if (req.file && useLocalSiteLogoStorage) {
      // websiteController stores req.file.path. Use a public URL path instead
      // of the machine's absolute Windows/Linux filesystem path.
      req.file.path = `/uploads/settings/${req.file.filename}`;
    }

    next();
  });
};
