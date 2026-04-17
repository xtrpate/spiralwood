const express = require("express");
const router = express.Router();

const blueprintController = require("../controllers/customer/customer.blueprints");

// PUBLIC READ
router.get("/", blueprintController.getAllBlueprints);
router.get("/:id", blueprintController.getBlueprintById);

module.exports = router;