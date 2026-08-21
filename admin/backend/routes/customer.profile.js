// routes/customer.profile.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticate, requireCustomer } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const profileController = require("../controllers/customer/customer.profile");
const { verifyBufferSignature } = require("../utils/verifyFileSignature");

const { v2: cloudinary } = require("cloudinary");

// WISDOM CUSTOMER AVATAR CLOUDINARY COMPAT V1
// Keep Cloudinary on BOTH mobile and desktop, but validate the browser file
// ourselves first and upload the verified buffer directly. This avoids
// multer-storage-cloudinary metadata/filename edge cases (notably desktop
// JFIF/JPEG variants) while keeping the same durable Cloudinary URL behavior.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const AVATAR_EXTENSIONS = new Set([".jpg", ".jpeg", ".jfif", ".png", ".webp"]);

const AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const avatarRawUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "")
      .trim()
      .toLowerCase();

    if (AVATAR_EXTENSIONS.has(ext) && AVATAR_MIME_TYPES.has(mime)) {
      cb(null, true);
      return;
    }

    const error = new Error(
      "Profile picture must be a JPG, JPEG, JFIF, PNG, or WEBP image.",
    );
    error.status = 400;
    cb(error);
  },
}).single("avatar");

const uploadAvatarBufferToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "wisdom_uploads/avatars",
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      },
    );

    stream.end(file.buffer);
  });

const handleAvatarUpload = (req, res, next) => {
  avatarRawUpload(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Profile picture must be 2MB or smaller.",
          });
        }

        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            message: "Invalid profile picture upload.",
          });
        }
      }

      if (Number(err.status) === 400) {
        return res.status(400).json({
          message: err.message,
        });
      }

      console.error("[customer.profile avatar parse]", err);
      return res.status(500).json({
        message: "Profile picture upload could not be read.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Choose a profile picture first.",
      });
    }

    const ext = path.extname(req.file.originalname || "").toLowerCase();

    if (!verifyBufferSignature(req.file.buffer, ext)) {
      return res.status(400).json({
        message: "Profile picture content does not match its image file type.",
      });
    }

    try {
      const result = await uploadAvatarBufferToCloudinary(req.file);

      if (!result?.secure_url) {
        throw new Error("Cloudinary did not return a secure image URL.");
      }

      // Preserve the controller contract: customer.profile.uploadAvatar
      // already stores req.file.path in users.profile_photo.
      req.file.path = result.secure_url;
      req.file.filename = result.public_id || req.file.originalname;
      req.file.cloudinary_public_id = result.public_id || null;

      next();
    } catch (uploadError) {
      console.error(
        "[customer.profile avatar cloudinary]",
        uploadError?.message || uploadError,
      );

      return res.status(502).json({
        message: "Profile picture upload failed. Please try again.",
      });
    }
  });
};

/* ══════════════════════════════════════════════════════════════
   CUSTOMER PROFILE ROUTES
══════════════════════════════════════════════════════════════ */

router.post(
  "/avatar",
  authenticate,
  requireCustomer,
  handleAvatarUpload,
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
  "/request-current-email-auth",
  authenticate,
  requireCustomer,
  profileController.requestCurrentEmailAuth,
);
router.post(
  "/verify-current-email-auth",
  authenticate,
  requireCustomer,
  profileController.verifyCurrentEmailAuth,
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

router.post(
  "/request-current-phone-auth",
  authenticate,
  requireCustomer,
  profileController.requestCurrentPhoneAuth,
);

router.post(
  "/verify-current-phone-auth",
  authenticate,
  requireCustomer,
  profileController.verifyCurrentPhoneAuth,
);

router.post(
  "/request-phone-change",
  authenticate,
  requireCustomer,
  profileController.requestPhoneChange,
);

router.post(
  "/verify-phone-change",
  authenticate,
  requireCustomer,
  logAction("update_customer_phone", "users"),
  profileController.verifyPhoneChange,
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
