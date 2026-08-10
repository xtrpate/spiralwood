// routes/customer.profile.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticate, requireCustomer } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const profileController = require("../controllers/customer/customer.profile");
const { verifyFileSignature } = require("../utils/verifyFileSignature");

const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "wisdom_uploads/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
  },
});

const handleAvatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("avatar");

/* ══════════════════════════════════════════════════════════════
   CUSTOMER PROFILE ROUTES
══════════════════════════════════════════════════════════════ */

router.post(
  "/avatar",
  authenticate,
  requireCustomer,
  handleAvatarUpload, // 👉 Replace uploadAvatar.single("avatar") with our new wrapper!
  logAction("update_customer_avatar", "users"),
  profileController.uploadAvatar,
);
router.put(
  "/basic",
  authenticate,
  requireCustomer,
  logAction("update_customer_profile", "users"),
  profileController.updateBasic,
);
router.post(
  "/request-email-change",
  authenticate,
  requireCustomer,
  profileController.requestEmailChange,
);
router.post(
  "/verify-email-change",
  authenticate,
  requireCustomer,
  logAction("update_customer_email", "users"),
  profileController.verifyEmailChange,
);

router.put(
  "/phone",
  authenticate,
  requireCustomer,
  logAction("update_customer_phone", "users"),
  profileController.updatePhone,
);

router.post(
  "/request-password-change",
  authenticate,
  requireCustomer,
  profileController.requestPasswordChange,
);
router.post(
  "/verify-password-change",
  authenticate,
  requireCustomer,
  logAction("update_customer_password", "users"),
  profileController.verifyPasswordChange,
);

module.exports = router;
