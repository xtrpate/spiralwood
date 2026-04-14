const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { authenticate, requireCustomer } = require("../middleware/auth");
const customOrderController = require("../controllers/customer/customer.customorders");

/* ──────────────────────────────────────────────────────────
   Upload dirs
────────────────────────────────────────────────────────── */
const proofsDir = path.join(__dirname, "../uploads/proofs");
const customAssetsDir = path.join(__dirname, "../uploads/custom-request-assets");

if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });
if (!fs.existsSync(customAssetsDir)) fs.mkdirSync(customAssetsDir, { recursive: true });

/* ──────────────────────────────────────────────────────────
   Down payment proof upload
────────────────────────────────────────────────────────── */
const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, proofsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `proof_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const proofUpload = multer({
  storage: proofStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);

    cb(null, allowed.has(String(file.mimetype || "").toLowerCase()));
  },
});

/* ──────────────────────────────────────────────────────────
   Chat attachment upload
────────────────────────────────────────────────────────── */
const assetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, customAssetsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const safeOriginal = String(file.originalname || "file")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");
    cb(
      null,
      `custom_asset_${Date.now()}_${Math.random().toString(36).slice(2)}_${safeOriginal || "file"}${ext && !safeOriginal.endsWith(ext) ? "" : ""}`,
    );
  },
});

const assetUpload = multer({
  storage: assetStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);

    cb(null, allowed.has(String(file.mimetype || "").toLowerCase()));
  },
});

/* ══════════════════════════════════════════════════════════════
   CUSTOMER CUSTOM ORDERS ROUTES
══════════════════════════════════════════════════════════════ */

router.post(
  "/",
  authenticate,
  requireCustomer,
  customOrderController.createCustomOrder,
);

router.get(
  "/",
  authenticate,
  requireCustomer,
  customOrderController.getCustomOrders,
);

router.get(
  "/:id",
  authenticate,
  requireCustomer,
  customOrderController.getCustomOrderById,
);

router.post(
  "/:id/estimate/accept",
  authenticate,
  requireCustomer,
  customOrderController.acceptEstimation,
);

router.post(
  "/:id/estimate/request-revision",
  authenticate,
  requireCustomer,
  customOrderController.requestEstimationRevision,
);

router.post(
  "/:id/estimate/reject",
  authenticate,
  requireCustomer,
  customOrderController.rejectEstimation,
);

router.post(
  "/:id/down-payment",
  authenticate,
  requireCustomer,
  proofUpload.single("proof"),
  customOrderController.submitDownPayment,
);

router.post(
  "/:id/messages",
  authenticate,
  requireCustomer,
  assetUpload.array("attachments", 5),
  customOrderController.postCustomOrderMessage,
);

module.exports = router;