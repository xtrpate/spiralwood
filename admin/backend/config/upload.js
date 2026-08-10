const multer = require("multer");
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
exports.uploadProductImage = multer({
  storage: cloudStorage("products", ALLOWED_IMAGES),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).single("image");

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

exports.uploadSiteLogo = multer({
  storage: cloudStorage("settings", ALLOWED_IMAGES),
  limits: { fileSize: 2 * 1024 * 1024 },
}).single("site_logo");
