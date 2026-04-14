const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticate, requireCustomer } = require("../middleware/auth");
const warrantyController = require("../controllers/customer/customer.warranty");

/* ── Multer storage ── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/warranty");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `warranty_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error("Only images (JPEG/PNG/WEBP) and PDF allowed."));
  },
});

/* ══════════════════════════════════════════════════════════════
   CUSTOMER WARRANTY ROUTES
══════════════════════════════════════════════════════════════ */

router.get(
  "/orders",
  authenticate,
  requireCustomer,
  warrantyController.getEligibleOrders,
);

router.get("/", authenticate, requireCustomer, warrantyController.getClaims);

router.post(
  "/",
  authenticate,
  requireCustomer,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "proof", maxCount: 1 },
  ]),
  warrantyController.submitClaim,
);

module.exports = router;