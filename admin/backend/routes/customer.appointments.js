// routes/customer.appointments.js
const express = require("express");
const router = express.Router();
const { authenticate, requireCustomer } = require("../middleware/auth");
const appointmentController = require("../controllers/customer/customer.appointments");

/* ══════════════════════════════════════════════════════════════
   CUSTOMER APPOINTMENT ROUTES
══════════════════════════════════════════════════════════════ */

router.post(
  "/",
  authenticate,
  requireCustomer,
  appointmentController.createAppointment,
);
router.get(
  "/",
  authenticate,
  requireCustomer,
  appointmentController.getAppointments,
);
router.delete(
  "/:id",
  authenticate,
  requireCustomer,
  appointmentController.cancelAppointment,
);

module.exports = router;
