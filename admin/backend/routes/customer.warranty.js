const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { authenticate, requireCustomer } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const warrantyController = require("../controllers/customer/customer.warranty");
const { verifyBufferSignature } = require("../utils/verifyFileSignature");
const {
  storeUploadBuffer,
  cleanupStoredUpload,
} = require("../utils/adaptiveUpload");

const storage = multer.memoryStorage();

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

const WARRANTY_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const extensionMatchesMime = (ext, mime) =>
  ([".jpg", ".jpeg", ".jfif"].includes(ext) && mime === "image/jpeg") ||
  (ext === ".png" && mime === "image/png") ||
  (ext === ".webp" && mime === "image/webp") ||
  (ext === ".pdf" && mime === "application/pdf");

const cleanupWarrantyStoredAssets = async (assets, reason) => {
  const uniqueAssets = [
    ...new Map(
      (Array.isArray(assets) ? assets : [])
        .filter(Boolean)
        .map((asset) => [
          `${asset.storage || "unknown"}:${asset.public_id || asset.local_path || asset.file_url || ""}`,
          asset,
        ]),
    ).values(),
  ];

  await Promise.all(
    uniqueAssets.map(async (asset) => {
      try {
        await cleanupStoredUpload(asset);
      } catch (cleanupErr) {
        console.error(
          "[customer.warranty upload cleanup]",
          reason,
          cleanupErr?.message || cleanupErr,
        );
      }
    }),
  );
};

const rawUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "")
      .trim()
      .toLowerCase();
    const allowedExtensions =
      file.fieldname === "photo"
        ? WARRANTY_PHOTO_EXTENSIONS
        : file.fieldname === "proof"
          ? WARRANTY_PROOF_EXTENSIONS
          : null;

    if (
      allowedExtensions?.has(ext) &&
      WARRANTY_MIME_TYPES.has(mime) &&
      extensionMatchesMime(ext, mime)
    ) {
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
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Each warranty evidence file must be 5 MB or smaller.",
          });
        }
        if (
          err.code === "LIMIT_FILE_COUNT" ||
          err.code === "LIMIT_UNEXPECTED_FILE"
        ) {
          return res.status(400).json({
            message: "Upload exactly one defect photo and one proof of purchase.",
          });
        }
      }

      if (Number(err.status) === 400) {
        return res.status(400).json({ message: err.message });
      }
      return next(err);
    }

    const photo = req.files?.photo?.[0] || null;
    const proof = req.files?.proof?.[0] || null;

    if (!photo || !proof) {
      return res.status(400).json({
        message: "Both defect photo and proof of purchase are required.",
      });
    }

    for (const file of [photo, proof]) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      if (!verifyBufferSignature(file.buffer, ext)) {
        return res.status(400).json({
          message:
            "One of your uploaded files does not match its real file type. Upload rejected.",
        });
      }
    }

    const storedAssets = [];

    try {
      const photoAsset = await storeUploadBuffer({
        file: photo,
        folder: "warranty",
        deliveryType: "authenticated",
        requireCloud: true,
      });
      storedAssets.push(photoAsset);

      const proofAsset = await storeUploadBuffer({
        file: proof,
        folder: "warranty",
        deliveryType: "authenticated",
        requireCloud: true,
      });
      storedAssets.push(proofAsset);

      req.warrantyEvidenceAssets = {
        photo: photoAsset,
        proof: proofAsset,
      };
    } catch (storageErr) {
      await cleanupWarrantyStoredAssets(
        storedAssets,
        "partial durable upload failure",
      );
      console.error(
        "[customer.warranty evidence upload]",
        storageErr?.message || storageErr,
      );
      return res.status(502).json({
        message:
          "Warranty evidence upload is unavailable right now. Please try again.",
      });
    }

    res.on("finish", () => {
      if (res.statusCode < 400) return;

      if (req.warrantySubmissionRetainUploads === true) {
        console.warn(
          "[customer.warranty upload cleanup skipped]",
          "Retaining evidence because the claim commit may already be durable.",
        );
        return;
      }

      void cleanupWarrantyStoredAssets(
        storedAssets,
        "response status " + res.statusCode,
      );
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

router.get(
  "/:id",
  authenticate,
  requireCustomer,
  warrantyController.getClaimById,
);

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
