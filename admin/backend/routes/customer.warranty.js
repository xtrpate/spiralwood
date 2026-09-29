const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticate, requireCustomer } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const warrantyController = require("../controllers/customer/customer.warranty");
const { verifyFileSignature } = require("../utils/verifyFileSignature");

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

const ALLOWED_WARRANTY_EXT = [
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
  ".pdf",
];

const rawUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED_WARRANTY_EXT.includes(ext)) {
      cb(null, true);
      return;
    }
    const err = new Error("Only images (JPEG/PNG/WEBP/JFIF) and PDF allowed.");
    err.status = 400;
    cb(err);
  },
});

const upload = (req, res, next) => {
  rawUpload.fields([
    { name: "photo", maxCount: 1 },
    { name: "proof", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return next(err);

    const files = req.files ? Object.values(req.files).flat() : [];

    for (const file of files) {
      const ext = path.extname(file.originalname || "").toLowerCase();

      if (!verifyFileSignature(file.path, ext)) {
        fs.unlink(file.path, () => {});

        return res.status(400).json({
          message:
            "One of your uploaded files does not match its file extension. Upload rejected.",
        });
      }
    }

    /*
     * Multer saves files before the warranty controller performs
     * database/business-rule validation.
     *
     * If the controller later rejects the request, remove the
     * uploaded files so rejected claims do not leave orphaned files.
     */
    const uploadedFilePaths = files.map((file) => file.path).filter(Boolean);

    res.on("finish", () => {
      if (res.statusCode >= 400) {
        for (const filePath of uploadedFilePaths) {
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr && unlinkErr.code !== "ENOENT") {
              console.error(
                "[customer.warranty upload cleanup]",
                unlinkErr.message || unlinkErr,
              );
            }
          });
        }
      }
    });

    next();
  });
};

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
  upload,
  warrantyController.submitClaim,
);

router.patch(
  "/:id/cancel",
  authenticate,
  requireCustomer,
  logAction("cancel_warranty_claim", "warranties"),
  warrantyController.cancelClaim,
);

module.exports = router;
