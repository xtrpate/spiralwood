const express = require("express");
const router = express.Router();

const blueprintController = require(
  "../controllers/customer/customer.blueprints",
);
const deliveryConfigController = require(
  "../controllers/customer/customer.deliveryConfig",
);

// PUBLIC READ
router.get("/", blueprintController.getAllBlueprints);

// This exact route must stay before "/:id" so Express does not treat
// "delivery-config" as a blueprint ID.
router.get(
  "/delivery-config",
  deliveryConfigController.getDeliveryConfig,
);

router.get("/:id", blueprintController.getBlueprintById);

module.exports = router;
