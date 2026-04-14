// config/upload.js – Multer file upload configuration
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_IMAGES = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_DOCS = ['.pdf', '.jpg', '.jpeg', '.png'];
const ALLOWED_BLUEPRINTS = ['.pdf', '.png', '.jpg', '.jpeg', '.svg'];

const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '15', 10);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function diskStorage(subFolder) {
  return multer.diskStorage({
    destination(req, file, cb) {
      const dest = path.join(process.env.UPLOAD_DIR || './uploads', subFolder);
      ensureDir(dest);
      cb(null, dest);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, name);
    },
  });
}

function fileFilter(allowed, label = 'File') {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();

    if (allowed.includes(ext)) {
      cb(null, true);
      return;
    }

    cb(
      new Error(
        `${label} type not allowed. Allowed: ${allowed.join(', ')}`
      )
    );
  };
}

// ── Specific uploaders ────────────────────────────────────────────────────────
exports.uploadProductImage = multer({
  storage: diskStorage('products'),
  fileFilter: fileFilter(ALLOWED_IMAGES, 'Product image'),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).single('image');

const blueprintUpload = multer({
  storage: diskStorage('blueprints'),
  fileFilter: fileFilter(ALLOWED_BLUEPRINTS, 'Blueprint file'),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'reference_file', maxCount: 1 },

  { name: 'front_reference', maxCount: 1 },
  { name: 'back_reference', maxCount: 1 },
  { name: 'left_reference', maxCount: 1 },
  { name: 'right_reference', maxCount: 1 },
  { name: 'top_reference', maxCount: 1 },
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
  storage: diskStorage('payments'),
  fileFilter: fileFilter(ALLOWED_IMAGES, 'Payment proof'),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).single('proof');

exports.uploadWarrantyProof = multer({
  storage: diskStorage('warranty'),
  fileFilter: fileFilter(ALLOWED_DOCS, 'Warranty proof'),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).single('proof');

exports.uploadDeliveryReceipt = multer({
  storage: diskStorage('deliveries'),
  fileFilter: fileFilter(ALLOWED_IMAGES, 'Delivery receipt'),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).single('receipt');

exports.uploadSiteLogo = multer({
  storage: diskStorage('settings'),
  fileFilter: fileFilter(ALLOWED_IMAGES, 'Site logo'),
  limits: { fileSize: 2 * 1024 * 1024 },
}).single('logo');