const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const router = express.Router();

const {
  authenticate,
  authorize,
  requireDeliveryRiderOrAdmin,
} = require("../middleware/auth");

const posFulfillmentController = require("../controllers/staff/pos.fulfillment");

const adminOnly = [authenticate, authorize("admin")];
const deliveryAccess = [authenticate, requireDeliveryRiderOrAdmin];

const receiptUploadDir = path.join(
  __dirname,
  "..",
  "uploads",
  "delivery-receipts",
);

fs.mkdirSync(receiptUploadDir, { recursive: true });

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, receiptUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
    cb(
      null,
      `delivery-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`,
    );
  },
});

const receiptUpload = multer({
  storage: receiptStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const allowed =
      mime.startsWith("image/") || mime === "application/pdf";

    if (!allowed) {
      return cb(
        new Error("Only image or PDF files are allowed for signed receipt upload."),
      );
    }

    cb(null, true);
  },
});

const handleReceiptUpload = (req, res, next) => {
  receiptUpload.single("receipt")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message: err.message || "Invalid receipt upload.",
      });
    }
    next();
  });
};

/* ══════════════════════════════════════════════════════════════
   DELIVERIES ONLY
══════════════════════════════════════════════════════════════ */

router.get(
  "/deliverable-orders",
  adminOnly,
  posFulfillmentController.getDeliverableOrders,
);

router.get("/deliveries", deliveryAccess, posFulfillmentController.getDeliveries);

router.post("/deliveries", adminOnly, posFulfillmentController.createDelivery);

router.patch(
  "/deliveries/:id/status",
  deliveryAccess,
  handleReceiptUpload,
  posFulfillmentController.updateDeliveryStatus,
);

module.exports = router;