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

const {
  authenticate,
  authorize,
  verifyAuthority,
} = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const { requirePermission } = require("../middleware/permission");
const upload = require("../config/upload");

const accountAuthority = [
  authenticate,
  authorize("admin", "staff"),
  verifyAuthority(["manager", "admin"]),
];

// ── Controllers ────────────────────────────────────────────────────────────────
const auth = require("../controllers/admin/authController");
const dashboard = require("../controllers/admin/dashboardController");
const products = require("../controllers/admin/productController");
const inventory = require("../controllers/admin/inventoryController");
const inventoryReport = require("../controllers/admin/inventoryReportController");
const dailyStockInReport = require("../controllers/admin/dailyStockInReportController");
const physicalInventory = require("../controllers/admin/physicalInventoryController");
const stockTransfers = require("../controllers/admin/stockTransferController");
const blueprints = require("../controllers/admin/blueprintController");
const orders = require("../controllers/admin/orderController");
const cancellations = require("../controllers/admin/cancellationController");
const sales = require("../controllers/admin/salesController");
const mgmt = require("../controllers/admin/managementController");
const website = require("../controllers/admin/websiteController");
const warrantyController = require("../controllers/admin/warrantyController");
const supportController = require("../controllers/admin/supportController");

// ── Auth guards ───────────────────────────────────────────────────────────────
const adminOnly = [
  authenticate,
  authorize("admin"),
  verifyAuthority(["admin"]),
];
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
router.get(
  "/products/report",
  adminStaff,
  requirePermission("products.view"),
  products.getReport,
);
router.get(
  "/products",
  adminStaff,
  requirePermission("products.view"),
  products.getAll,
);
router.get(
  "/products/categories",
  adminStaff,
  requirePermission("products.view"),
  products.getCategories,
);
router.patch(
  "/products/bulk-publish",
  adminStaff,
  requirePermission("products.manage"),
  products.bulkPublish,
);
router.get(
  "/products/:id",
  adminStaff,
  requirePermission("products.view"),
  products.getOne,
);
router.post(
  "/products",
  adminStaff,
  requirePermission("products.create"),
  upload.uploadProductImage,
  logAction("create_product", "products"),
  products.create,
);
router.put(
  "/products/:id",
  adminStaff,
  requirePermission("products.edit"),
  upload.uploadProductImage,
  logAction("update_product", "products"),
  products.update,
);
router.delete(
  "/products/:id",
  adminStaff,
  requirePermission("products.delete"),
  logAction("delete_product", "products"),
  products.remove,
);
router.patch(
  "/products/:id/publish",
  adminStaff,
  requirePermission("products.manage"),
  products.togglePublish,
);

router.patch(
  "/products/:id/featured",
  adminStaff,
  requirePermission("products.manage"),
  products.toggleFeatured,
);
router.patch(
  "/products/:id/active",
  adminStaff,
  requirePermission("products.manage"),
  logAction("toggle_active_product", "products"),
  products.toggleActive,
);
router.put(
  "/products/blueprint/:blueprint_id/publish",
  adminStaff,
  requirePermission("products.manage"),
  logAction("publish_blueprint_product", "products"),
  products.publishByBlueprint,
);
router.patch(
  "/products/blueprint/:blueprint_id/unpublish",
  adminStaff,
  requirePermission("products.manage"),
  products.unpublishByBlueprint,
);

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY – RAW MATERIALS
// ══════════════════════════════════════════════════════════════════════════════
router.get(
  "/inventory/raw/categories",
  adminStaff,
  requirePermission("raw_materials.view"),
  inventory.getRawMaterialCategories,
);
router.post(
  "/inventory/raw/categories",
  adminStaff,
  requirePermission("raw_materials.create"),
  logAction("create_raw_material_category", "categories"),
  inventory.createRawMaterialCategory,
);
router.get(
  "/inventory/raw",
  adminStaff,
  requirePermission("raw_materials.view"),
  inventory.getRawMaterials,
);
router.get(
  "/inventory/report",
  adminStaff,
  requirePermission("stock_movements.view"),
  inventoryReport.getInventoryReport,
);
router.get(
  "/inventory/reports/daily-stock-in",
  adminStaff,
  requirePermission("stock_movements.view"),
  dailyStockInReport.getDailyStockInReport,
);
router.post(
  "/inventory/raw",
  adminStaff,
  requirePermission("raw_materials.create"),
  logAction("create_raw_material", "raw_materials"),
  inventory.createRawMaterial,
);
router.post(
  "/inventory/raw/bulk",
  adminOnly,
  logAction("create_raw_material_bulk", "raw_materials"),
  inventory.createRawMaterialsBulk,
);
router.put(
  "/inventory/raw/:id",
  adminStaff,
  requirePermission("raw_materials.edit"),
  logAction("update_raw_material", "raw_materials"),
  inventory.updateRawMaterial,
);
router.patch(
  "/inventory/raw/:id/archive",
  adminStaff,
  requirePermission("raw_materials.manage"),
  logAction("archive_raw_material", "raw_materials"),
  inventory.archiveRawMaterial,
);
router.patch(
  "/inventory/raw/:id/restore",
  adminStaff,
  requirePermission("raw_materials.manage"),
  logAction("restore_raw_material", "raw_materials"),
  inventory.restoreRawMaterial,
);
router.delete(
  "/inventory/raw/:id",
  adminStaff,
  requirePermission("raw_materials.delete"),
  logAction("delete_raw_material", "raw_materials"),
  inventory.deleteRawMaterial,
);

// SUPPLIERS
router.get(
  "/suppliers",
  adminStaff,
  requirePermission("suppliers.view"),
  inventory.getSuppliers,
);
router.post(
  "/suppliers",
  adminStaff,
  requirePermission("suppliers.create"),
  logAction("create_supplier", "suppliers"),
  inventory.createSupplier,
);
router.put(
  "/suppliers/:id",
  adminStaff,
  requirePermission("suppliers.edit"),
  logAction("update_supplier", "suppliers"),
  inventory.updateSupplier,
);
router.delete(
  "/suppliers/:id",
  adminStaff,
  requirePermission("suppliers.delete"),
  logAction("delete_supplier", "suppliers"),
  inventory.deleteSupplier,
);

// STOCK MOVEMENTS
router.get(
  "/inventory/movements",
  adminStaff,
  requirePermission("stock_movements.view"),
  inventory.getStockMovements,
);
router.post(
  "/inventory/movements",
  adminStaff,
  requirePermission("stock_movements.create"),
  logAction("create_stock_movement", "stock_movements"),
  inventory.createStockMovement,
);

// PHYSICAL INVENTORY
router.get(
  "/inventory/physical-inventory/sessions",
  adminStaff,
  requirePermission("stock_movements.view"),
  physicalInventory.listPhysicalInventorySessions,
);
router.post(
  "/inventory/physical-inventory/sessions",
  adminStaff,
  requirePermission("stock_movements.manage"),
  logAction("start_physical_inventory", "physical_inventory_sessions"),
  physicalInventory.startPhysicalInventory,
);
router.get(
  "/inventory/physical-inventory/report",
  adminStaff,
  requirePermission("stock_movements.view"),
  physicalInventory.getPhysicalInventoryReport,
);
router.get(
  "/inventory/physical-inventory/sessions/:id",
  adminStaff,
  requirePermission("stock_movements.view"),
  physicalInventory.getPhysicalInventorySession,
);
router.put(
  "/inventory/physical-inventory/sessions/:id",
  adminStaff,
  requirePermission("stock_movements.manage"),
  physicalInventory.savePhysicalInventoryDraft,
);
router.post(
  "/inventory/physical-inventory/sessions/:id/finalize",
  adminStaff,
  requirePermission("stock_movements.manage"),
  logAction("finalize_physical_inventory", "physical_inventory_sessions"),
  physicalInventory.finalizePhysicalInventory,
);
router.post(
  "/inventory/physical-inventory/sessions/:id/cancel",
  adminStaff,
  requirePermission("stock_movements.manage"),
  logAction("cancel_physical_inventory", "physical_inventory_sessions"),
  physicalInventory.cancelPhysicalInventory,
);

// INTERNAL STOCK TRANSFER — ready-made products only
router.get(
  "/inventory/transfers/inventory",
  adminStaff,
  requirePermission("stock_movements.view"),
  stockTransfers.getTransferInventory,
);
router.get(
  "/inventory/transfers",
  adminStaff,
  requirePermission("stock_movements.view"),
  stockTransfers.listTransfers,
);
router.get(
  "/inventory/transfers/:id",
  adminStaff,
  requirePermission("stock_movements.view"),
  stockTransfers.getTransfer,
);
router.post(
  "/inventory/transfers",
  adminStaff,
  requirePermission("stock_movements.manage"),
  logAction("create_stock_transfer", "stock_transfers"),
  stockTransfers.createTransfer,
);
router.post(
  "/inventory/transfers/:id/reverse",
  adminStaff,
  requirePermission("stock_movements.manage"),
  logAction("reverse_stock_transfer", "stock_transfers"),
  stockTransfers.reverseTransfer,
);

// ══════════════════════════════════════════════════════════════════════════════
// BLUEPRINTS
// ══════════════════════════════════════════════════════════════════════════════
router.get(
  "/blueprints",
  adminStaff,
  requirePermission("blueprint_management.view"),
  blueprints.getAll,
);
router.get(
  "/blueprints/:id",
  adminStaff,
  requirePermission("blueprint_management.view"),
  blueprints.getOne,
);
router.post(
  "/blueprints",
  adminStaff,
  requirePermission("blueprint_management.create"),
  upload.uploadBlueprintFile,
  logAction("create_blueprint", "blueprints"),
  blueprints.create,
);
router.put(
  "/blueprints/:id",
  adminStaff,
  requirePermission("blueprint_management.edit"),
  upload.uploadBlueprintFile,
  logAction("update_blueprint", "blueprints"),
  blueprints.update,
);
router.delete(
  "/blueprints/:id",
  adminStaff,
  requirePermission("blueprint_management.delete"),
  logAction("archive_blueprint", "blueprints"),
  blueprints.archive,
);
router.patch(
  "/blueprints/:id/restore",
  adminStaff,
  requirePermission("blueprint_management.manage"),
  logAction("restore_blueprint", "blueprints"),
  blueprints.restore,
);
router.delete(
  "/blueprints/:id/permanent",
  adminStaff,
  requirePermission("blueprint_management.delete"),
  logAction("permanently_delete_blueprint", "blueprints"),
  blueprints.permanentDelete,
);
router.get(
  "/blueprints/:id/estimation",
  adminStaff,
  requirePermission("blueprint_management.view"),
  blueprints.getEstimation,
);
router.post(
  "/blueprints/:id/estimation",
  adminStaff,
  requirePermission("blueprint_management.edit"),
  logAction("create_blueprint_estimation", "estimations"),
  blueprints.saveEstimation,
);
router.patch(
  "/blueprints/:id/estimation/approve",
  adminStaff,
  requirePermission("blueprint_management.manage"),
  logAction("send_blueprint_estimation", "estimations"),
  blueprints.approveEstimation,
);

// ══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════════════════════════════════════════

router.get(
  "/orders/:id/assignable-staff",
  adminStaff,
  requirePermission("orders.view"),
  orders.getAssignableStaff,
);
router.patch(
  "/orders/:id/assign-staff",
  adminOnly,
  requirePermission("orders.manage"),
  logAction("assign_production_staff", "orders"),
  orders.assignStaff,
);

router.patch(
  "/orders/:id/reassign-staff",
  adminOnly,
  requirePermission("orders.manage"),
  logAction("reassign_production_staff", "orders"),
  orders.reassignStaff,
);

router.patch(
  "/orders/:id/tasks/:taskId/status",
  adminOnly,
  requirePermission("orders.manage"),
  logAction("update_project_task_status", "project_tasks"),
  orders.updateTaskStatus,
);

router.get(
  "/orders",
  adminStaff,
  requirePermission("orders.view"),
  orders.getAll,
);

// Specific cancellation routes must be declared before /orders/:id so the
// literal word "cancellations" is never treated as an order id.
router.get(
  "/orders/cancellations",
  adminStaff,
  requirePermission("cancellations.view"),
  cancellations.listRequests,
);

router.post(
  "/orders/cancellations/:requestId/approve",
  adminOnly,
  requirePermission("cancellations.manage"),
  logAction("approve_custom_cancellation", "custom_cancellation_requests"),
  cancellations.approveRequest,
);

router.post(
  "/orders/cancellations/:requestId/decline",
  adminOnly,
  requirePermission("cancellations.manage"),
  logAction("decline_custom_cancellation", "custom_cancellation_requests"),
  cancellations.declineRequest,
);

router.get(
  "/orders/:id",
  adminStaff,
  requirePermission("orders.view"),
  orders.getOne,
);
router.patch(
  "/orders/:id/status",
  adminOnly,
  requirePermission("orders.manage"),
  logAction("update_order_status", "orders"),
  orders.updateStatus,
);

router.post(
  "/orders/:id/accept",
  adminOnly,
  requirePermission("orders.manage"),
  logAction("accept_order", "orders"),
  orders.accept,
);

router.post(
  "/orders/:id/decline",
  adminOnly,
  requirePermission("orders.manage"),
  logAction("decline_order", "orders"),
  orders.decline,
);

router.post(
  "/orders/:id/verify-payment",
  adminOnly,
  requirePermission("orders.manage"),
  logAction("verify_payment", "payment_transactions"),
  orders.verifyPayment,
);

router.get(
  "/orders/:id/discussion",
  adminStaff,
  requirePermission("orders.view"),
  orders.getOrderDiscussion,
);

router.post(
  "/orders/:id/discussion",
  adminStaff,
  requirePermission("orders.manage"),
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
router.get(
  "/contracts",
  adminStaff,
  requirePermission("contracts.view"),
  mgmt.getContracts,
);
router.post(
  "/contracts",
  adminStaff,
  requirePermission("contracts.create"),
  logAction("generate_contract", "contracts"),
  mgmt.generateContract,
);

// ══════════════════════════════════════════════════════════════════════════════
// SALES REPORTS
// ══════════════════════════════════════════════════════════════════════════════
router.get(
  "/sales/report",
  adminStaff,
  requirePermission("sales_report.view"),
  sales.getReport,
);
router.get(
  "/sales/report/print",
  adminStaff,
  requirePermission("sales_report.export"),
  sales.getPrintData,
);

// ══════════════════════════════════════════════════════════════════════════════
// WARRANTY
// ══════════════════════════════════════════════════════════════════════════════
router.get(
  "/warranty",
  adminStaff,
  requirePermission("warranty.view"),
  warrantyController.getClaims,
);
router.get(
  "/warranty/:id/resolution-options",
  adminStaff,
  requirePermission("warranty.view"),
  warrantyController.getResolutionOptions,
);

router.patch(
  "/warranty/:id/decision",
  adminStaff,
  requirePermission("warranty.manage"),
  logAction("decide_warranty_claim", "warranties"),
  warrantyController.decideClaim,
);

router.patch(
  "/warranty/:id/fulfill",
  adminStaff,
  requirePermission("warranty.manage"),
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
router.get(
  "/customers",
  adminStaff,
  requirePermission("customers.view"),
  mgmt.getCustomers,
);

router.put(
  "/customers/:id/status",
  adminStaff,
  requirePermission("customers.manage"),
  logAction("update_customer_status", "users"),
  mgmt.updateCustomerStatus,
);

// ══════════════════════════════════════════════════════════════════════════════
// USER & ROLE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
router.get(
  "/users",
  accountAuthority,
  requirePermission("users.view"),
  mgmt.getUsers,
);
router.get(
  "/users/:id/permissions",
  accountAuthority,
  requirePermission("users.view"),
  mgmt.getUserPermissions,
);

router.put(
  "/users/:id/permissions",
  adminOnly,
  requirePermission("users.manage"),
  logAction("update_user_permissions", "user_permission_overrides"),
  mgmt.updateUserPermissions,
);
router.post(
  "/users",
  adminOnly,
  requirePermission("users.create"),
  upload.uploadUserProfilePhoto,
  logAction("create_user", "users"),
  mgmt.createUser,
);
router.put(
  "/users/:id/authority",
  accountAuthority,
  requirePermission("users.authority"),
  logAction("update_user_authority", "users"),
  mgmt.updateAuthority,
);
router.put(
  "/users/:id",
  adminOnly,
  requirePermission("users.edit"),
  upload.uploadUserProfilePhoto,
  logAction("update_user", "users"),
  mgmt.updateUser,
);

router.patch(
  "/users/:id/password",
  adminOnly,
  requirePermission("users.edit"),
  logAction("reset_user_password", "users"),
  mgmt.resetUserPassword,
);

router.delete(
  "/users/:id",
  adminOnly,
  requirePermission("users.delete"),
  logAction("deactivate_user", "users"),
  mgmt.deleteUser,
);

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS (view-only, no direct DB access needed)
// ══════════════════════════════════════════════════════════════════════════════
router.get(
  "/audit-logs",
  adminStaff,
  requirePermission("audit_logs.view"),
  mgmt.getAuditLogs,
);

router.get(
  "/audit-logs/export",
  adminStaff,
  requirePermission("audit_logs.export"),
  mgmt.exportAuditLogs,
);

// ══════════════════════════════════════════════════════════════════════════════
// WEBSITE MAINTENANCE
// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES (storefront-safe, visible content only)
router.get("/website/settings", website.getSettings);
router.get("/website/faqs", website.getFaqs);
router.get("/website/pages", website.getPages);

// PROTECTED READ ROUTES
// Register the exact /pages/admin route before the public /pages/:slug route.
router.get(
  "/website/settings/admin",
  adminOnly,
  requirePermission("site_settings.view"),
  website.getAdminSettings,
);
router.get(
  "/website/faqs/admin",
  adminOnly,
  requirePermission("faqs.view"),
  website.getAdminFaqs,
);
router.get(
  "/website/pages/admin",
  adminOnly,
  requirePermission("page_content.view"),
  website.getAdminPages,
);

// Public single-page reader must not shadow /website/pages/admin.
router.get("/website/pages/:slug", website.getPage);

// PROTECTED WRITE ROUTES
router.put(
  "/website/settings",
  adminOnly,
  requirePermission("site_settings.edit"),
  upload.uploadSiteLogo,
  logAction("update_website_settings", "website_content"),
  website.updateSettings,
);

router.post(
  "/website/faqs",
  adminOnly,
  requirePermission("faqs.create"),
  logAction("create_faq", "faqs"),
  website.createFaq,
);

router.put(
  "/website/faqs/:id",
  adminOnly,
  requirePermission("faqs.edit"),
  logAction("update_faq", "faqs"),
  website.updateFaq,
);

router.delete(
  "/website/faqs/:id",
  adminOnly,
  requirePermission("faqs.delete"),
  logAction("delete_faq", "faqs"),
  website.deleteFaq,
);

router.put(
  "/website/pages/:slug",
  adminOnly,
  requirePermission("page_content.edit"),
  logAction("update_page", "website_content"),
  website.updatePage,
);

// ══════════════════════════════════════════════════════════════════════════════
// BACKUP
// ══════════════════════════════════════════════════════════════════════════════
router.get(
  "/backup/logs",
  adminOnly,
  requirePermission("backup.view"),
  website.getBackupLogs,
);

router.post(
  "/backup/trigger",
  adminOnly,
  requirePermission("backup.create"),
  website.triggerManualBackup,
);

router.get(
  "/backup/download/:filename",
  adminOnly,
  requirePermission("backup.view"),
  website.downloadBackup,
);

router.post(
  "/orders/:id/custom-request/approve",
  adminOnly,
  requirePermission("orders.manage"),
  logAction("approve_custom_request", "orders"),
  orders.approveCustomRequest,
);

router.post(
  "/orders/:id/custom-request/request-revision",
  adminOnly,
  requirePermission("orders.manage"),
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
  requirePermission("orders.manage"),
  logAction("reject_custom_request", "orders"),
  orders.rejectCustomRequest,
);

module.exports = router;
