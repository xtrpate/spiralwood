const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { verifyFileSignature } = require("../utils/verifyFileSignature");
const { logAction } = require("../middleware/auditLog");
const router = express.Router();

const {
  authenticate,
  authorize,
  requireDeliveryRiderOrAdmin,
} = require("../middleware/auth");

const posFulfillmentController = require("../controllers/staff/pos.fulfillment");

const adminOnly = [authenticate, authorize("admin")];
const deliveryAccess = [authenticate, requireDeliveryRiderOrAdmin];

const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const receiptStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "wisdom_uploads/delivery-receipts",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
  },
});

const handleReceiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("receipt");

/* ══════════════════════════════════════════════════════════════
   DELIVERIES ONLY
══════════════════════════════════════════════════════════════ */

router.get(
  "/deliveries/dashboard",
  deliveryAccess,
  posFulfillmentController.getRiderDashboard,
);
router.get(
  "/deliveries/history",
  deliveryAccess,
  posFulfillmentController.getRiderHistory,
);

router.get(
  "/deliverable-orders",
  adminOnly,
  posFulfillmentController.getDeliverableOrders,
);

router.get(
  "/deliveries",
  deliveryAccess,
  posFulfillmentController.getDeliveries,
);

router.post(
  "/deliveries",
  adminOnly,
  logAction("create_delivery", "deliveries"),
  posFulfillmentController.createDelivery,
);

router.patch(
  "/deliveries/:id/status",
  deliveryAccess,
  handleReceiptUpload,
  logAction("update_delivery_status", "deliveries"),
  posFulfillmentController.updateDeliveryStatus,
);

module.exports = router;
