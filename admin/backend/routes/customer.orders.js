// routes/customer.orders.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { verifyFileSignature } = require("../utils/verifyFileSignature");
const fs = require("fs");

// Your existing auth middlewares
const { authenticate, requireCustomer } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const orderController = require("../controllers/customer/customer.orders");
const standardReceiptsController = require("../controllers/customer/customer.standard-receipts");

// 👉 ADDED: We must import the new cart controller so the routes can use it!
const cartController = require("../controllers/customer/customer.cart");

const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "wisdom_uploads/proofs",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "pdf"],
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("proof");

/* ══════════════════════════════════════════════════════════════
   CUSTOMER ORDERS ROUTES
══════════════════════════════════════════════════════════════ */

// NOTE: /settings and /verify-payment must come before /:id
router.get(
  "/settings",
  authenticate,
  requireCustomer,
  orderController.getSettings,
);

// Route to catch the PayMongo Redirect Success
router.post(
  "/verify-payment",
  authenticate,
  requireCustomer,
  orderController.verifyPayment,
);

router.post(
  "/",
  authenticate,
  requireCustomer,
  upload,
  orderController.createOrder,
);

router.get("/", authenticate, requireCustomer, orderController.getOrders);

router.get(
  "/:id/receipts/:receiptId",
  authenticate,
  requireCustomer,
  standardReceiptsController.getReceiptById,
);

router.get("/:id", authenticate, requireCustomer, orderController.getOrderById);
router.put(
  "/:id/confirm",
  authenticate,
  requireCustomer,
  logAction("confirm_order_receipt", "orders"),
  orderController.confirmOrder,
);
router.put(
  "/:id/cancel",
  authenticate,
  requireCustomer,
  orderController.cancelOrder,
);

module.exports = router;
