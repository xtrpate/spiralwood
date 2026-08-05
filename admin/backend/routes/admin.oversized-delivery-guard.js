const express = require("express");
const {
  authenticate,
  authorize,
} = require("../middleware/auth");
const requireOversizedDeliveryDecision = require(
  "../middleware/requireOversizedDeliveryDecision",
);

const router = express.Router();

router.patch(
  "/blueprints/:id/estimation/approve",
  authenticate,
  authorize("admin", "staff"),
  requireOversizedDeliveryDecision,
  (req, res, next) => next(),
);

module.exports = router;
