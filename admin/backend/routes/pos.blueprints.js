// routes/pos.blueprints.js
const express = require("express");
const router = express.Router();
const { authenticate, requireStaffOrAdmin } = require("../middleware/auth");
const posBlueprintController = require("../controllers/staff/pos.blueprints");

/* ══════════════════════════════════════════════════════════════
   STAFF/POS BLUEPRINTS ROUTES
══════════════════════════════════════════════════════════════ */

router.get(
  "/",
  authenticate,
  requireStaffOrAdmin,
  posBlueprintController.getAllBlueprints,
);
router.get(
  "/:id",
  authenticate,
  requireStaffOrAdmin,
  posBlueprintController.getBlueprintById,
);

module.exports = router;
