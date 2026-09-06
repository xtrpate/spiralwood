// routes/admin.js – Centralized router for all Admin API routes
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const {
  verifyFileSignature,
  verifyBufferSignature,
} = require("../utils/verifyFileSignature");
const router = express.Router();

const { authenticate, authorize } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const upload = require("../config/upload");

// ── Controllers ────────────────────────────────────────────────────────────────
const auth = require("../controllers/admin/authController");
const dashboard = require("../controllers/admin/dashboardController");
const products = require("../controllers/admin/productController");
const inventory = require("../controllers/admin/inventoryController");
const blueprints = require("../controllers/admin/blueprintController");
const orders = require("../controllers/admin/orderController");
const sales = require("../controllers/admin/salesController");
const mgmt = require("../controllers/admin/managementController");
const website = require("../controllers/admin/websiteController");
const warrantyController = require("../controllers/admin/warrantyController");
const supportController = require("../controllers/admin/supportController");

// ── Auth guards ───────────────────────────────────────────────────────────────
const adminOnly = [authenticate, authorize("admin")];
const adminStaff = [authenticate, authorize("admin", "staff")];

const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const replacementStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "wisdom_uploads/warranty-replacements",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
  },
});

const replacementUpload = multer({
  storage: replacementStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("replacement_receipt");

const CUSTOM_DISCUSSION_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
  ".pdf",
]);

const CUSTOM_DISCUSSION_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const customDiscussionUploadRaw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "")
      .trim()
      .toLowerCase();

    if (
      CUSTOM_DISCUSSION_EXTENSIONS.has(ext) &&
      CUSTOM_DISCUSSION_MIME_TYPES.has(mime)
    ) {
      cb(null, true);
      return;
    }

    const error = new Error(
      "Attachments must be JPG, JPEG, JFIF, PNG, WEBP, or PDF files.",
    );
    error.status = 400;
    cb(error);
  },
});

const customDiscussionUpload = (req, res, next) => {
  customDiscussionUploadRaw.array("attachments", 5)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Each attachment must be 8MB or smaller.",
          });
        }
        if (
          err.code === "LIMIT_FILE_COUNT" ||
          err.code === "LIMIT_UNEXPECTED_FILE"
        ) {
          return res.status(400).json({
            message: "You can attach up to 5 files per message.",
          });
        }
      }
      if (Number(err.status) === 400) {
        return res.status(400).json({ message: err.message });
      }
      return next(err);
    }

    for (const file of req.files || []) {
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
          message: "One of the attachments does not match its real file type.",
        });
      }
    }

    next();
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════
const { loginLimiter } = require("../middleware/authRateLimit");
// ...
router.post("/auth/login", loginLimiter, auth.login);
router.get("/auth/me", authenticate, auth.getMe);
router.put("/auth/profile", authenticate, auth.updateProfile);
router.put("/auth/change-password", authenticate, auth.changePassword);

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
router.get("/dashboard", adminStaff, dashboard.getDashboard);

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/products/report", adminStaff, products.getReport);
router.get("/products", adminStaff, products.getAll);
router.get("/products/categories", adminStaff, products.getCategories);
router.patch("/products/bulk-publish", adminOnly, products.bulkPublish);
router.get("/products/:id", adminStaff, products.getOne);
router.post(
  "/products",
  adminOnly,
  upload.uploadProductImage,
  logAction("create_product", "products"),
  products.create,
);
router.put(
  "/products/:id",
  adminOnly,
  upload.uploadProductImage,
  logAction("update_product", "products"),
  products.update,
);
router.delete(
  "/products/:id",
  adminOnly,
  logAction("delete_product", "products"),
  products.remove,
);
router.patch("/products/:id/publish", adminOnly, products.togglePublish);
router.patch("/products/:id/featured", adminOnly, products.toggleFeatured);
router.patch(
  "/products/:id/active",
  adminOnly,
  logAction("toggle_active_product", "products"),
  products.toggleActive,
);
router.put(
  "/products/blueprint/:blueprint_id/publish",
  adminOnly,
  logAction("publish_blueprint_product", "products"),
  products.publishByBlueprint,
);
router.patch(
  "/products/blueprint/:blueprint_id/unpublish",
  adminOnly,
  products.unpublishByBlueprint,
);

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY – RAW MATERIALS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/inventory/raw", adminStaff, inventory.getRawMaterials);
router.post(
  "/inventory/raw",
  adminOnly,
  logAction("create_raw_material", "raw_materials"),
  inventory.createRawMaterial,
);
router.put(
  "/inventory/raw/:id",
  adminOnly,
  logAction("update_raw_material", "raw_materials"),
  inventory.updateRawMaterial,
);
router.patch(
  "/inventory/raw/:id/archive",
  adminOnly,
  logAction("archive_raw_material", "raw_materials"),
  inventory.archiveRawMaterial,
);
router.patch(
  "/inventory/raw/:id/restore",
  adminOnly,
  logAction("restore_raw_material", "raw_materials"),
  inventory.restoreRawMaterial,
);
router.delete(
  "/inventory/raw/:id",
  adminOnly,
  logAction("delete_raw_material", "raw_materials"),
  inventory.deleteRawMaterial,
);

// SUPPLIERS
router.get("/suppliers", adminStaff, inventory.getSuppliers);
router.post(
  "/suppliers",
  adminOnly,
  logAction("create_supplier", "suppliers"),
  inventory.createSupplier,
);
router.put(
  "/suppliers/:id",
  adminOnly,
  logAction("update_supplier", "suppliers"),
  inventory.updateSupplier,
);
router.delete(
  "/suppliers/:id",
  adminOnly,
  logAction("delete_supplier", "suppliers"),
  inventory.deleteSupplier,
);

// STOCK MOVEMENTS
router.get("/inventory/movements", adminStaff, inventory.getStockMovements);
router.post(
  "/inventory/movements",
  adminStaff,
  logAction("create_stock_movement", "stock_movements"),
  inventory.createStockMovement,
);

// ══════════════════════════════════════════════════════════════════════════════
// BLUEPRINTS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/blueprints", adminStaff, blueprints.getAll);
router.get("/blueprints/:id", adminStaff, blueprints.getOne);
router.post(
  "/blueprints",
  adminStaff,
  upload.uploadBlueprintFile,
  logAction("create_blueprint", "blueprints"),
  blueprints.create,
);
router.put(
  "/blueprints/:id",
  adminStaff,
  upload.uploadBlueprintFile,
  logAction("update_blueprint", "blueprints"),
  blueprints.update,
);
router.delete(
  "/blueprints/:id",
  adminStaff,
  logAction("archive_blueprint", "blueprints"),
  blueprints.archive,
);
router.patch(
  "/blueprints/:id/restore",
  adminStaff,
  logAction("restore_blueprint", "blueprints"),
  blueprints.restore,
);
router.delete(
  "/blueprints/:id/permanent",
  adminStaff,
  logAction("permanently_delete_blueprint", "blueprints"),
  blueprints.permanentDelete,
);
router.get("/blueprints/:id/estimation", adminStaff, blueprints.getEstimation);
router.post(
  "/blueprints/:id/estimation",
  adminStaff,
  logAction("create_blueprint_estimation", "estimations"),
  blueprints.saveEstimation,
);
router.patch(
  "/blueprints/:id/estimation/approve",
  adminStaff,
  logAction("send_blueprint_estimation", "estimations"),
  blueprints.approveEstimation,
);

// ══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════════════════════════════════════════

router.get(
  "/orders/:id/assignable-staff",
  adminStaff,
  orders.getAssignableStaff,
);
router.patch(
  "/orders/:id/assign-staff",
  adminOnly,
  logAction("assign_production_staff", "orders"),
  orders.assignStaff,
);
router.patch(
  "/orders/:id/reassign-staff",
  adminOnly,
  logAction("reassign_production_staff", "orders"),
  orders.reassignStaff,
);
router.patch(
  "/orders/:id/tasks/:taskId/status",
  adminOnly,
  logAction("update_project_task_status", "project_tasks"),
  orders.updateTaskStatus,
);

router.get("/orders", adminStaff, orders.getAll);
router.get("/orders/:id", adminStaff, orders.getOne);
router.patch(
  "/orders/:id/status",
  adminOnly,
  logAction("update_order_status", "orders"),
  orders.updateStatus,
);
router.post(
  "/orders/:id/accept",
  adminOnly,
  logAction("accept_order", "orders"),
  orders.accept,
);
router.post(
  "/orders/:id/decline",
  adminOnly,
  logAction("decline_order", "orders"),
  orders.decline,
);

router.post(
  "/orders/:id/verify-payment",
  adminOnly,
  logAction("verify_payment", "payment_transactions"),
  orders.verifyPayment,
);

router.get("/orders/:id/discussion", adminStaff, orders.getOrderDiscussion);

router.post(
  "/orders/:id/discussion",
  adminStaff,
  customDiscussionUpload,
  orders.postOrderDiscussionMessage,
);

router.post("/orders/:id/delivery-receipt", adminStaff, (req, res) => {
  return res.status(410).json({
    message:
      "This delivery receipt endpoint is no longer supported. Use the Delivery Management workflow.",
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CONTRACTS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/contracts", adminOnly, mgmt.getContracts);
router.post(
  "/contracts",
  adminOnly,
  logAction("generate_contract", "contracts"),
  mgmt.generateContract,
);

// ══════════════════════════════════════════════════════════════════════════════
// SALES REPORTS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/sales/report", adminStaff, sales.getReport);
router.get("/sales/report/print", adminStaff, sales.getPrintData);

// ══════════════════════════════════════════════════════════════════════════════
// WARRANTY
// ══════════════════════════════════════════════════════════════════════════════
router.get("/warranty", adminOnly, warrantyController.getClaims);

router.patch(
  "/warranty/:id/decision",
  adminOnly,
  logAction("decide_warranty_claim", "warranties"),
  warrantyController.decideClaim,
);

router.patch(
  "/warranty/:id/fulfill",
  adminOnly,
  replacementUpload,
  logAction("fulfill_warranty_claim", "warranties"),
  warrantyController.fulfillClaim,
);

// ══════════════════════════════════════════════════════════════════════════════
// SUPPORT
// ══════════════════════════════════════════════════════════════════════════════

router.get("/support/tickets", adminStaff, supportController.getTickets);
router.get(
  "/support/assignable-users",
  adminStaff,
  supportController.getAssignableUsers,
);
router.get("/support/tickets/:id", adminStaff, supportController.getTicket);
router.patch(
  "/support/tickets/:id/assign",
  adminOnly,
  logAction("assign_support_ticket", "support_tickets"),
  supportController.assignTicket,
);
router.patch(
  "/support/tickets/:id/status",
  adminStaff,
  logAction("update_support_ticket", "support_tickets"),
  supportController.updateTicketStatus,
);
router.post(
  "/support/tickets/:id/messages",
  adminStaff,
  customDiscussionUpload,
  logAction("reply_support_ticket", "support_tickets"),
  supportController.replyToTicket,
);

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMER ACCOUNT MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
router.get("/customers", adminOnly, mgmt.getCustomers);
router.put(
  "/customers/:id/status",
  adminOnly,
  logAction("update_customer_status", "users"),
  mgmt.updateCustomerStatus,
);

// ══════════════════════════════════════════════════════════════════════════════
// USER & ROLE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
router.get("/users", adminOnly, mgmt.getUsers);
router.post(
  "/users",
  adminOnly,
  upload.uploadUserProfilePhoto,
  logAction("create_user", "users"),
  mgmt.createUser,
);
router.put(
  "/users/:id",
  adminOnly,
  upload.uploadUserProfilePhoto,
  logAction("update_user", "users"),
  mgmt.updateUser,
);
router.patch(
  "/users/:id/password",
  adminOnly,
  logAction("reset_user_password", "users"),
  mgmt.resetUserPassword,
);
router.delete(
  "/users/:id",
  adminOnly,
  logAction("deactivate_user", "users"),
  mgmt.deleteUser,
);

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS (view-only, no direct DB access needed)
// ══════════════════════════════════════════════════════════════════════════════
router.get("/audit-logs", adminOnly, mgmt.getAuditLogs);

// ══════════════════════════════════════════════════════════════════════════════
// WEBSITE MAINTENANCE
// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES (storefront-safe data only)
router.get("/website/settings", website.getSettings);
router.get("/website/faqs", website.getFaqs);
router.get("/website/pages", website.getPages);
router.get("/website/pages/:slug", website.getPage);

// PROTECTED ROUTES (Only Admins can read/update operational settings)
router.get("/website/settings/admin", adminOnly, website.getAdminSettings);
router.put(
  "/website/settings",
  adminOnly,
  upload.uploadSiteLogo,
  logAction("update_website_settings", "website_content"),
  website.updateSettings,
);

router.post(
  "/website/faqs",
  adminOnly,
  logAction("create_faq", "faqs"),
  website.createFaq,
);
router.put(
  "/website/faqs/:id",
  adminOnly,
  logAction("update_faq", "faqs"),
  website.updateFaq,
);
router.delete(
  "/website/faqs/:id",
  adminOnly,
  logAction("delete_faq", "faqs"),
  website.deleteFaq,
);

router.put(
  "/website/pages/:slug",
  adminOnly,
  logAction("update_page", "website_content"),
  website.updatePage,
);

// ══════════════════════════════════════════════════════════════════════════════
// BACKUP
// ══════════════════════════════════════════════════════════════════════════════
router.get("/backup/logs", adminOnly, website.getBackupLogs);
router.post("/backup/trigger", adminOnly, website.triggerManualBackup);
router.get("/backup/download/:filename", adminOnly, website.downloadBackup);

router.post(
  "/orders/:id/custom-request/approve",
  adminOnly,
  logAction("approve_custom_request", "orders"),
  orders.approveCustomRequest,
);

router.post(
  "/orders/:id/custom-request/request-revision",
  adminOnly,
  (req, res) => {
    return res.status(410).json({
      message:
        "Custom-request revision requests are currently unavailable. Please review this request through the supported custom-request approve/reject workflow.",
    });
  },
);

router.post(
  "/orders/:id/custom-request/reject",
  adminOnly,
  logAction("reject_custom_request", "orders"),
  orders.rejectCustomRequest,
);

module.exports = router;
