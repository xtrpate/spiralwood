const express = require("express");

const router = express.Router();

const { authenticate, requireCashierOrAdmin } = require("../middleware/auth");

const supportController = require("../controllers/staff/pos.support");

const posAccess = [authenticate, requireCashierOrAdmin];

router.get("/", posAccess, supportController.getAssignedTickets);
router.get("/:id", posAccess, supportController.getTicket);
router.post("/:id/reply", posAccess, supportController.replyToTicket);
router.patch("/:id/status", posAccess, supportController.updateTicketStatus);

module.exports = router;
