const express = require("express");
const router = express.Router();

const { authenticate, requireCustomer } = require("../middleware/auth");

const supportController = require("../controllers/customer/support.controller");

/* ══════════════════════════════════════════════════════════════
   CUSTOMER SUPPORT ROUTES
══════════════════════════════════════════════════════════════ */

/**
 * GET /api/customer/support
 * List logged-in customer's support tickets
 */
router.get("/", authenticate, requireCustomer, supportController.getTickets);

router.get(
  "/orders",
  authenticate,
  requireCustomer,
  supportController.getSupportOrders,
);

router.get(
  "/:id",
  authenticate,
  requireCustomer,
  supportController.getTicketById,
);

/**
 * POST /api/customer/support
 * Create a new support ticket
 */
router.post("/", authenticate, requireCustomer, supportController.createTicket);

router.post(
  "/:id/messages",
  authenticate,
  requireCustomer,
  supportController.replyToTicket,
);

router.put(
  "/:id/close",
  authenticate,
  requireCustomer,
  supportController.closeTicket,
);

module.exports = router;
