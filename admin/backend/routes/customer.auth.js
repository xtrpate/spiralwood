// routes/customer.auth.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/customer/customer.auth");

/* ══════════════════════════════════════════════════════════════
   CUSTOMER AUTHENTICATION ROUTES
══════════════════════════════════════════════════════════════ */
router.post("/register", authController.register);
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/login", authController.login);

module.exports = router;
