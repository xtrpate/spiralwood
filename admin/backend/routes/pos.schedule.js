const express = require("express");
const router = express.Router();

const {
  authenticate,
  authorize,
  requireIndoorStaffOrAdmin,
} = require("../middleware/auth");

const posScheduleController = require("../controllers/staff/pos.schedule");

const adminOnly = [authenticate, authorize("admin")];
const appointmentAccess = [authenticate, requireIndoorStaffOrAdmin];

/* ══════════════════════════════════════════════════════════════
   APPOINTMENTS ONLY
══════════════════════════════════════════════════════════════ */

router.get(
  "/appointments",
  appointmentAccess,
  posScheduleController.getAppointments,
);

router.post(
  "/appointments",
  adminOnly,
  posScheduleController.createAppointment,
);

router.patch(
  "/appointments/:id",
  appointmentAccess,
  posScheduleController.updateAppointment,
);

module.exports = router;