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

const appointmentAdminManageAccess = [
  authenticate,
  authorize("admin"),
  requirePermission("appointments.manage"),
];

// Indoor staff need this route for the controller's deliberately restricted
// Accept / Return to Admin / Complete / Cancel transitions. The controller
// still verifies that a staff user is the appointment's assigned provider.
const appointmentUpdateAccess = [
  authenticate,
  requireIndoorStaffOrAdmin,
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
  appointmentAdminManageAccess,
  logAction("create_appointment", "appointments"),
  posScheduleController.createAppointment,
);

router.patch(
  "/appointments/:id",
  appointmentUpdateAccess,
  logAction("update_appointment", "appointments"),
  posScheduleController.updateAppointment,
);

module.exports = router;
