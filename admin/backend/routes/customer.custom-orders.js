const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  verifyFileSignature,
  verifyBufferSignature,
} = require("../utils/verifyFileSignature");

const { authenticate, requireCustomer } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const customOrderController = require("../controllers/customer/customer.customorders");
const customerReceiptsController = require("../controllers/customer/customer.receipts");
const customerDeliveryAssessmentController = require("../controllers/customer/customer.deliveryAssessment");

/* ──────────────────────────────────────────────────────────
   Upload dirs
────────────────────────────────────────────────────────── */
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const proofStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "wisdom_uploads/proofs",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
  },
});

const proofUpload = multer({
  storage: proofStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("proof");

const CHAT_ATTACHMENT_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
  ".pdf",
]);

const CHAT_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const assetUploadRaw = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mimeType = String(file.mimetype || "")
      .trim()
      .toLowerCase();

    if (
      CHAT_ATTACHMENT_EXTENSIONS.has(ext) &&
      CHAT_ATTACHMENT_MIME_TYPES.has(mimeType)
    ) {
      cb(null, true);
      return;
    }

    const error = new Error(
      "Attachments must be JPG, JPEG, JFIF, PNG, WEBP, or PDF files.",
    );
    error.status = 400;
    cb(error);
  },
});

const assetUpload = (req, res, next) => {
  assetUploadRaw.array("attachments", 5)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Each attachment must be 8MB or smaller.",
          });
        }

        if (
          err.code === "LIMIT_FILE_COUNT" ||
          err.code === "LIMIT_UNEXPECTED_FILE"
        ) {
          return res.status(400).json({
            message: "You can attach up to 5 files per message.",
          });
        }
      }

      if (Number(err.status) === 400) {
        return res.status(400).json({ message: err.message });
      }

      return next(err);
    }

    for (const file of req.files || []) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const mimeType = String(file.mimetype || "")
        .trim()
        .toLowerCase();

      const extensionMatchesMime =
        ([".jpg", ".jpeg", ".jfif"].includes(ext) &&
          mimeType === "image/jpeg") ||
        (ext === ".png" && mimeType === "image/png") ||
        (ext === ".webp" && mimeType === "image/webp") ||
        (ext === ".pdf" && mimeType === "application/pdf");

      if (
        !extensionMatchesMime ||
        !verifyBufferSignature(file.buffer, ext)
      ) {
        return res.status(400).json({
          message:
            "One of the attachments does not match its file type. Please choose the original image or PDF file.",
        });
      }
    }

    next();
  });
};

/* ──────────────────────────────────────────────────────────
   Initial custom-request reference photo upload
   - memory storage: files are written only after order validation starts
   - maximum 5 photos per custom item, 25 photos per request
────────────────────────────────────────────────────────── */
const REFERENCE_PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const REFERENCE_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const referencePhotoUploadRaw = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 25,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mimeType = String(file.mimetype || "")
      .trim()
      .toLowerCase();

    if (
      REFERENCE_PHOTO_EXTENSIONS.has(ext) &&
      REFERENCE_PHOTO_MIME_TYPES.has(mimeType)
    ) {
      cb(null, true);
      return;
    }

    const error = new Error(
      "Reference photos must be JPG, JPEG, PNG, or WEBP images.",
    );
    error.status = 400;
    cb(error);
  },
});

const referencePhotoUpload = (req, res, next) => {
  referencePhotoUploadRaw.array("reference_photos", 25)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Each reference photo must be 5MB or smaller.",
          });
        }

        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            message: "Too many reference photos were uploaded.",
          });
        }
      }

      return next(err);
    }

    for (const file of req.files || []) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const mimeType = String(file.mimetype || "")
        .trim()
        .toLowerCase();

      const extensionMatchesMime =
        ([".jpg", ".jpeg"].includes(ext) && mimeType === "image/jpeg") ||
        (ext === ".png" && mimeType === "image/png") ||
        (ext === ".webp" && mimeType === "image/webp");

      if (!extensionMatchesMime || !verifyBufferSignature(file.buffer, ext)) {
        return res.status(400).json({
          message:
            "One of the reference photos does not match its file extension. Upload rejected.",
        });
      }
    }

    next();
  });
};

/* ══════════════════════════════════════════════════════════════
   CUSTOMER CUSTOM ORDERS ROUTES
══════════════════════════════════════════════════════════════ */

router.post(
  "/",
  authenticate,
  requireCustomer,
  referencePhotoUpload,
  customOrderController.createCustomOrder,
);

router.get(
  "/",
  authenticate,
  requireCustomer,
  customOrderController.getCustomOrders,
);

router.get(
  "/:id/delivery-assessment",
  authenticate,
  requireCustomer,
  customerDeliveryAssessmentController.getOrderDeliveryAssessment,
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
  "/:id/project-agreement/accept",
  authenticate,
  requireCustomer,
  customOrderController.acceptProjectAgreement,
);

router.post(
  "/:id/cancel",
  authenticate,
  requireCustomer,
  customOrderController.cancelUnpaidProject,
);

router.post(
  "/:id/down-payment",
  authenticate,
  requireCustomer,
  proofUpload,
  customOrderController.submitDownPayment,
);

// PHASE 5 — RETIRED (Final Decision 1): this used to accept a proof
// upload (cash/cod/cop/gcash/bank_transfer) for the blueprint remaining
// balance and overwrite orders.payment_method — which conflicts with the
// new remaining_payment_method design (orders.payment_method must stay
// the immutable INITIAL method). Intercepted here, before multer or the
// controller run, so no file is written, no payment_transactions row is
// created, orders.payment_method is never touched, and no success audit
// is logged. customOrderController.submitRemainingBalancePayment is kept
// in the controller file only as inert dead code; it is no longer wired
// to any route.
router.post(
  "/:id/remaining-balance",
  authenticate,
  requireCustomer,
  (req, res) => {
    return res.status(410).json({
      message:
        "This remaining-balance payment flow has been retired. Choose Cash or Online Payment from the order page.",
    });
  },
);

router.post(
  "/:id/messages",
  authenticate,
  requireCustomer,
  assetUpload,
  customOrderController.postCustomOrderMessage,
);

router.post(
  "/:id/pay",
  authenticate,
  requireCustomer,
  customOrderController.createPayMongoCheckout,
);

router.post(
  "/:id/payment-method",
  authenticate,
  requireCustomer,
  logAction("select_blueprint_payment_method", "orders"),
  customOrderController.selectPaymentMethod,
);

router.post(
  "/:id/verify-payment",
  authenticate,
  requireCustomer,
  customOrderController.verifyPayment,
);

// PHASE 5 — Blueprint Rider Final Cash Collection (Final Decision 3).
router.post(
  "/:id/remaining-payment-method",
  authenticate,
  requireCustomer,
  logAction("select_blueprint_remaining_payment_method", "orders"),
  customOrderController.selectRemainingPaymentMethod,
);

// PHASE 5B — Blueprint Remaining Balance Online Payment.
router.post(
  "/:id/remaining-balance/pay",
  authenticate,
  requireCustomer,
  customOrderController.createRemainingBalancePayMongoCheckout,
);

router.post(
  "/:id/remaining-balance/verify-payment",
  authenticate,
  requireCustomer,
  logAction(
    "verify_blueprint_remaining_balance_payment",
    "payment_transactions",
  ),
  customOrderController.verifyRemainingBalancePayment,
);

/* ══════════════════════════════════════════════════════════════
   CUSTOMER BLUEPRINT PAYMENT RECEIPTS (Phase 2C) — read-only,
   strictly ownership-checked inside the controller itself.
══════════════════════════════════════════════════════════════ */

router.get(
  "/:id/receipts",
  authenticate,
  requireCustomer,
  customerReceiptsController.listReceipts,
);

router.get(
  "/:id/receipts/:receiptId",
  authenticate,
  requireCustomer,
  customerReceiptsController.getReceiptById,
);

module.exports = router;
