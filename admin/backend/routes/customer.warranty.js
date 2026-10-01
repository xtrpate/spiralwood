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

const WARRANTY_PHOTO_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
]);

const WARRANTY_PROOF_EXTENSIONS = new Set([
  ...WARRANTY_PHOTO_EXTENSIONS,
  ".pdf",
]);

const getWarrantyUploadFiles = (req) =>
  req.files && typeof req.files === "object"
    ? Object.values(req.files).flat().filter(Boolean)
    : [];

const cleanupWarrantyUploadFiles = async (files, reason) => {
  const filePaths = [
    ...new Set(
      (Array.isArray(files) ? files : [])
        .map((file) => file?.path)
        .filter(Boolean),
    ),
  ];

  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        await fs.promises.unlink(filePath);
      } catch (unlinkErr) {
        if (unlinkErr?.code !== "ENOENT") {
          console.error(
            "[customer.warranty upload cleanup]",
            reason,
            unlinkErr?.message || unlinkErr,
          );
        }
      }
    }),
  );
};

const rawUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowedExtensions =
      file.fieldname === "photo"
        ? WARRANTY_PHOTO_EXTENSIONS
        : file.fieldname === "proof"
          ? WARRANTY_PROOF_EXTENSIONS
          : null;

    if (allowedExtensions?.has(ext)) {
      cb(null, true);
      return;
    }

    const err = new Error(
      file.fieldname === "photo"
        ? "Photo of the issue must be a JPG, JPEG, JFIF, PNG, or WEBP image."
        : file.fieldname === "proof"
          ? "Proof of purchase must be a JPG, JPEG, JFIF, PNG, WEBP, or PDF file."
          : "Unexpected warranty upload field.",
    );
    err.status = 400;
    cb(err);
  },
});

const upload = (req, res, next) => {
  rawUpload.fields([
    { name: "photo", maxCount: 1 },
    { name: "proof", maxCount: 1 },
  ])(req, res, async (err) => {
    const files = getWarrantyUploadFiles(req);

    if (err) {
      await cleanupWarrantyUploadFiles(files, "multer rejection");
      return next(err);
    }

    /*
     * Register rejected-response cleanup BEFORE signature verification.
     * If either upload is invalid, every file saved by this request must be
     * removed; otherwise the valid sibling file can become an orphan.
     */
    res.on("finish", () => {
      if (res.statusCode >= 400) {
        void cleanupWarrantyUploadFiles(
          files,
          "response status " + res.statusCode,
        );
      }
    });

    try {
      for (const file of files) {
        const ext = path.extname(file.originalname || "").toLowerCase();

        if (!verifyFileSignature(file.path, ext)) {
          return res.status(400).json({
            message:
              "One of your uploaded files does not match its file extension. Upload rejected.",
          });
        }
      }
    } catch (verificationErr) {
      return next(verificationErr);
    }

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
