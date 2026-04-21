// routes/customer.profile.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticate, requireCustomer } = require("../middleware/auth");
const profileController = require("../controllers/customer/customer.profile");

/* ── Multer — avatar upload ── */
const avatarDir = path.join(__dirname, "../uploads/avatars");
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(null, /jpeg|jpg|png|gif|webp/.test(file.mimetype)),
});

/* ══════════════════════════════════════════════════════════════
   CUSTOMER PROFILE ROUTES
══════════════════════════════════════════════════════════════ */

router.post(
  "/avatar",
  authenticate,
  requireCustomer,
  uploadAvatar.single("avatar"),
  profileController.uploadAvatar,
);
router.put(
  "/basic",
  authenticate,
  requireCustomer,
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
  profileController.verifyEmailChange,
);

router.put(
  "/phone",
  authenticate,
  requireCustomer,
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
  profileController.verifyPasswordChange,
);

module.exports = router;
