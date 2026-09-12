// routes/customer.appointments.js
const express = require("express");
const router = express.Router();
const { authenticate, requireCustomer } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permission");
const appointmentController = require("../controllers/customer/customer.appointments");

/* ══════════════════════════════════════════════════════════════
   CUSTOMER APPOINTMENT ROUTES
══════════════════════════════════════════════════════════════ */

router.post(
  "/",
  authenticate,
  requireCustomer,
  requirePermission("appointments.create"),
  appointmentController.createAppointment,
);
router.get(
  "/",
  authenticate,
  requireCustomer,
  requirePermission("appointments.view"),
  appointmentController.getAppointments,
);
router.delete(
  "/:id",
  authenticate,
  requireCustomer,
  requirePermission("appointments.delete"),
  appointmentController.cancelAppointment,
);

router.get(
  "/availability",
  authenticate,
  requireCustomer,
  requirePermission("appointments.view"),
  appointmentController.getAvailability,
);

router.get(
  "/availability/weekly",
  authenticate,
  requireCustomer,
  requirePermission("appointments.view"),
  appointmentController.getWeeklyAvailability,
);

module.exports = router;
