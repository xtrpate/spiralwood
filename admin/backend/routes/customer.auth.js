// routes/customer.auth.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/customer/customer.auth");

// 👉 You likely have an auth middleware somewhere in your project.
// Adjust this path if your middleware is named differently or in a different folder!
const { verifyToken } = require("../middleware/auth");

/* ══════════════════════════════════════════════════════════════
   CUSTOMER AUTHENTICATION ROUTES
══════════════════════════════════════════════════════════════ */
router.post("/register", authController.register);
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/login", authController.login);

/* ══════════════════════════════════════════════════════════════
   CLOUD CART OMNICHANNEL ROUTES (Protected)
══════════════════════════════════════════════════════════════ */
// Notice how we pass verifyToken so only logged-in users can sync!
router.get("/cart", verifyToken, authController.getCloudCart);
router.post("/cart/sync", verifyToken, authController.syncCloudCart);

module.exports = router;
