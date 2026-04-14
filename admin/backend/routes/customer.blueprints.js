const express = require("express");
const router = express.Router();

const { authenticate, requireCustomer } = require("../middleware/auth");
const blueprintController = require("../controllers/customer/customer.blueprints");

const customerOnly = [authenticate, requireCustomer];

router.get("/", customerOnly, blueprintController.getAllBlueprints);
router.get("/:id", customerOnly, blueprintController.getBlueprintById);

module.exports = router;