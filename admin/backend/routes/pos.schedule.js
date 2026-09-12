const express = require("express");
const router = express.Router();

const {
  authenticate,
  authorize,
  requireIndoorStaffOrAdmin,
} = require("../middleware/auth");

const { logAction } = require("../middleware/auditLog");
const { requirePermission } = require("../middleware/permission");

const posScheduleController = require("../controllers/staff/pos.schedule");

const adminOnly = [authenticate, authorize("admin")];

const appointmentAccess = [
  authenticate,
  requireIndoorStaffOrAdmin,
  requirePermission("appointments.view"),
];

const appointmentManageAccess = [
  authenticate,
  authorize("admin"),
  requirePermission("appointments.manage"),
];

/* ══════════════════════════════════════════════════════════════
   APPOINTMENTS ONLY
══════════════════════════════════════════════════════════════ */

router.get(
  "/appointments",
  appointmentAccess,
  posScheduleController.getAppointments,
);

router.get(
  "/appointments/availability",
  appointmentAccess,
  posScheduleController.getAvailability,
);

router.post(
  "/appointments",
  appointmentManageAccess,
  logAction("create_appointment", "appointments"),
  posScheduleController.createAppointment,
);

router.patch(
  "/appointments/:id",
  appointmentManageAccess,
  logAction("update_appointment", "appointments"),
  posScheduleController.updateAppointment,
);

module.exports = router;
