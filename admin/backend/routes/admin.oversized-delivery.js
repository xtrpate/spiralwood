const express = require("express");
const {
  authenticate,
  authorize,
} = require("../middleware/auth");
const controller = require(
  "../controllers/admin/oversizedDeliveryController",
);

const router = express.Router();
const adminStaff = [
  authenticate,
  authorize("admin", "staff"),
];

router.get(
  "/blueprints/:blueprintId",
  adminStaff,
  controller.getByBlueprint,
);

router.patch(
  "/blueprints/:blueprintId/decision",
  adminStaff,
  controller.saveDecisionByBlueprint,
);

router.get(
  "/orders/:orderId",
  adminStaff,
  controller.getByOrder,
);

module.exports = router;
