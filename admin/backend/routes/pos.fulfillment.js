const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const {
  verifyFileSignature,
  verifyBufferSignature,
} = require("../utils/verifyFileSignature");
const { logAction } = require("../middleware/auditLog");
const router = express.Router();

const {
  authenticate,
  authorize,
  requireDeliveryRiderOrAdmin,
} = require("../middleware/auth");
const { requirePermission } = require("../middleware/permission");

const posFulfillmentController = require("../controllers/staff/pos.fulfillment");

const adminOnly = [authenticate, authorize("admin")];

const deliveryViewAccess = [
  authenticate,
  requireDeliveryRiderOrAdmin,
  requirePermission("delivery_scheduling.view"),
];

const deliveryManageAccess = [
  authenticate,
  authorize("admin"),
  requirePermission("delivery_scheduling.manage"),
];

const deliveryStatusAccess = [
  authenticate,
  requireDeliveryRiderOrAdmin,
  requirePermission("delivery_scheduling.edit"),
];

const DELIVERY_RECEIPT_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
  ".pdf",
]);

const DELIVERY_RECEIPT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const receiptUploadRaw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "")
      .trim()
      .toLowerCase();

    if (
      DELIVERY_RECEIPT_EXTENSIONS.has(ext) &&
      DELIVERY_RECEIPT_MIME_TYPES.has(mime)
    ) {
      cb(null, true);
      return;
    }

    const error = new Error(
      "Proof of Delivery must be a JPG, JPEG, JFIF, PNG, WEBP, or PDF file.",
    );
    error.status = 400;
    cb(error);
  },
});

const handleReceiptUpload = (req, res, next) => {
  receiptUploadRaw.single("receipt")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Proof of Delivery must be 5MB or smaller.",
          });
        }
      }
      if (Number(err.status) === 400) {
        return res.status(400).json({ message: err.message });
      }
      return next(err);
    }

    const file = req.file;
    if (file) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const mime = String(file.mimetype || "")
        .trim()
        .toLowerCase();
      const extensionMatchesMime =
        ([".jpg", ".jpeg", ".jfif"].includes(ext) && mime === "image/jpeg") ||
        (ext === ".png" && mime === "image/png") ||
        (ext === ".webp" && mime === "image/webp") ||
        (ext === ".pdf" && mime === "application/pdf");

      if (!extensionMatchesMime || !verifyBufferSignature(file.buffer, ext)) {
        return res.status(400).json({
          message:
            "The Proof of Delivery file does not match its real file type.",
        });
      }
    }

    next();
  });
};
/* ══════════════════════════════════════════════════════════════
   DELIVERIES ONLY
══════════════════════════════════════════════════════════════ */

router.get(
  "/deliveries/dashboard",
  deliveryViewAccess,
  posFulfillmentController.getRiderDashboard,
);
router.get(
  "/deliveries/history",
  deliveryViewAccess,
  posFulfillmentController.getRiderHistory,
);

router.get(
  "/deliveries/report",
  adminOnly,
  posFulfillmentController.getDeliveryReport,
);
router.get(
  "/deliveries/report/:id",
  adminOnly,
  posFulfillmentController.getDeliveryReportDetail,
);

router.get(
  "/deliverable-orders",
  deliveryManageAccess,
  posFulfillmentController.getDeliverableOrders,
);

router.get(
  "/deliveries",
  deliveryViewAccess,
  posFulfillmentController.getDeliveries,
);

router.get(
  "/deliveries/:id/acknowledgement",
  deliveryViewAccess,
  posFulfillmentController.getDeliveryAcknowledgement,
);

router.get(
  "/deliveries/:id/receipt",
  deliveryViewAccess,
  posFulfillmentController.getDeliveryReceipt,
);

router.post(
  "/deliveries",
  deliveryManageAccess,
  logAction("create_delivery", "deliveries"),
  posFulfillmentController.createDelivery,
);

router.post(
  "/deliveries/:id/reschedule",
  deliveryManageAccess,
  logAction("reschedule_delivery", "deliveries"),
  posFulfillmentController.rescheduleDelivery,
);

router.patch(
  "/deliveries/:id/status",
  deliveryStatusAccess,
  handleReceiptUpload,
  logAction("update_delivery_status", "deliveries"),
  posFulfillmentController.updateDeliveryStatus,
);

module.exports = router;
