const express = require("express");
const router = express.Router();
const multer = require("multer");

const { authenticate, requireCashierOrAdmin } = require("../middleware/auth");
const supportController = require("../controllers/staff/pos.support");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const posAccess = [authenticate, requireCashierOrAdmin];

router.get("/", posAccess, supportController.getAssignedTickets);
router.get("/:id", posAccess, supportController.getTicket);
router.post(
  "/:id/reply",
  posAccess,
  upload.array("attachments", 5),
  supportController.replyToTicket,
);

router.patch("/:id/status", posAccess, supportController.updateTicketStatus);

module.exports = router;
