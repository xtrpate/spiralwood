const express = require("express");
const router = express.Router();

const {
  authenticate,
  authorize,
  requireIndoorStaffOrAdmin,
} = require("../middleware/auth");

const { logAction } = require("../middleware/auditLog");

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
  logAction("create_appointment", "appointments"),
  posScheduleController.createAppointment,
);

router.patch(
  "/appointments/:id",
  appointmentAccess,
  logAction("update_appointment", "appointments"),
  posScheduleController.updateAppointment,
);

module.exports = router;