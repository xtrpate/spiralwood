const express = require("express");
const router = express.Router();

const { authenticate, requireCustomer } = require("../middleware/auth");
const customOrderController = require("../controllers/customer/customer.customorders");

/* ══════════════════════════════════════════════════════════════
   CUSTOMER CUSTOM ORDERS ROUTES
══════════════════════════════════════════════════════════════ */

router.post(
  "/",
  authenticate,
  requireCustomer,
  customOrderController.createCustomOrder,
);

router.get(
  "/",
  authenticate,
  requireCustomer,
  customOrderController.getCustomOrders,
);

router.get(
  "/:id",
  authenticate,
  requireCustomer,
  customOrderController.getCustomOrderById,
);

router.post(
  "/:id/estimate/accept",
  authenticate,
  requireCustomer,
  customOrderController.acceptEstimation,
);

router.post(
  "/:id/estimate/request-revision",
  authenticate,
  requireCustomer,
  customOrderController.requestEstimationRevision,
);

router.post(
  "/:id/estimate/reject",
  authenticate,
  requireCustomer,
  customOrderController.rejectEstimation,
);

module.exports = router;