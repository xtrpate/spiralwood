// controllers/authController.js (Unified Gateway for Admin, Staff, and Customers)
// controllers/authController.js (Unified Gateway for Admin, Staff, and Customers)
// controllers/authController.js (Unified Gateway for Admin, Staff, and Customers)
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
// const nodemailer = require("nodemailer");
const pool = require("../../config/db");
const { writeAuditLogSafe } = require("../../middleware/auditLog");
const {
  normalizePhilippinePhone,
  getPhoneLookupVariants,
  phoneDigitsSql,
} = require("../../utils/phone");

require("dotenv").config();

// ══════════════════════════════════════════════════════════════
//   CUSTOMER OTP CONFIGURATION (For unverified logins)
// ══════════════════════════════════════════════════════════════
const OTP_EXPIRY_MINUTES = 15;

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* ── Brevo REST API Setup ── */
const sendOtpEmail = async (email, otp, name) => {
  try {
    const payload = {
      sender: {
        name: "Spiral Wood Services",
        // CRITICAL: This must exactly match the verified email in your Brevo account
        email: process.env.MAIL_USER,
      },
      to: [{ email: email, name: name }],
      subject: "Your Spiral Wood Verification Code",
      htmlContent: `
        <div style="font-family:sans-serif; text-align:center; padding:20px;">
          <h2>Spiral Wood Services</h2>
          <p>Hi ${name},</p>
          <p>Your account is not verified yet. Please use the code below to verify your email:</p>
          <h1 style="color:#8B4513; letter-spacing:5px;">${otp}</h1>
          <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
        </div>
      `,
    };

    // Utilizing native fetch for zero-dependency API calls
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[Brevo API Error]", errorData);
      throw new Error(`BREVO_REJECTED: ${response.status}`);
    }
  } catch (err) {
    console.error("Failed to send verification email.", err.message);
    throw new Error("EMAIL_FAILED");
  }
};

// ══════════════════════════════════════════════════════════════
//   THE UNIFIED LOGIN (POST /api/auth/login)
// ══════════════════════════════════════════════════════════════
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const attemptedEmail = String(email || "").trim().toLowerCase();
    const auditLogin = async ({ action, user = null, reason }) =>
      writeAuditLogSafe({
        userId: user?.id || null,
        action,
        tableName: "security",
        recordId: user?.id || null,
        newValues: {
          attempted_email: attemptedEmail || null,
          result: action === "login_success" ? "success" : "failed",
          reason,
          user_role: user?.role || null,
          staff_type: user?.staff_type || null,
        },
        ipAddress: req.ip || null,
      });

    if (!email || !password) {
      await auditLogin({ action: "login_failed", reason: "missing_credentials" });
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    // 🔓 TEMP — reCAPTCHA check disabled on login for faster local testing.
    // RESTORE BEFORE PRODUCTION / GOING LIVE: uncomment the block below.
    // const isHuman = await verifyRecaptcha(recaptcha_token);
    // if (!isHuman) {
    //   return res.status(400).json({ message: "Please complete the CAPTCHA verification." });
    // }

    const normalizedEmail = String(email).trim().toLowerCase();

    // 1. Query EVERYONE. No role restrictions!
    const [[user]] = await pool.query(
      `SELECT * FROM users WHERE email = ? LIMIT 1`,
      [normalizedEmail],
    );

    if (!user) {
      await auditLogin({ action: "login_failed", reason: "invalid_credentials" });
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const match = await bcrypt.compare(password, user.password || "");
    if (!match) {
      await auditLogin({
        action: "login_failed",
        user,
        reason: "invalid_credentials",
      });
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // 2. ROLE-SPECIFIC CHECKS

    // A. Customer Recovery Flow
    if (user.role === "customer" && !user.is_verified) {
      const newOtp = generateOtp();
      const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await pool.query(
        "UPDATE users SET otp_code = ?, otp_purpose = 'verify_email', otp_expires = ? WHERE id = ?",
        [newOtp, expiry, user.id],
      );

      const firstName = user.name ? user.name.split(" ")[0] : "Customer";
      await sendOtpEmail(user.email, newOtp, firstName);
      await auditLogin({
        action: "login_failed",
        user,
        reason: "email_not_verified",
      });

      return res.status(403).json({
        message:
          "Account not verified. A new verification code has been sent to your email.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
      });
    }

    // B. Staff Configuration Check
    if (user.role === "staff" && !user.staff_type) {
      await auditLogin({
        action: "login_failed",
        user,
        reason: "staff_type_not_configured",
      });
      return res.status(403).json({
        message: "Staff account type is not configured yet. Contact admin.",
      });
    }

    // C. Global Active Check (Handles banned/deactivated accounts)
    if (!user.is_active) {
      await auditLogin({
        action: "login_failed",
        user,
        reason: "account_inactive",
      });
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact support.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    // 3. SUCCESS: Issue Token & Update Last Login
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = ?", [
      user.id,
    ]);

    await auditLogin({
      action: "login_success",
      user,
      reason: "authenticated",
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        staff_type: user.staff_type || null,
        must_change_password:
          Number(user.must_change_password) === 1 ? 1 : 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );

    // Return only the session/profile fields the frontend actually needs.
    // OTP hashes, reset tokens, pending contact changes, and password material
    // never leave the backend.
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      staff_type: user.staff_type || null,
      phone: user.phone || null,
      address: user.address || null,
      address_lat: user.address_lat ?? null,
      address_lng: user.address_lng ?? null,
      profile_photo: user.profile_photo || null,
      is_active: Number(user.is_active) === 1 ? 1 : 0,
      is_verified: Number(user.is_verified) === 1 ? 1 : 0,
      phone_verified: Number(user.phone_verified) === 1 ? 1 : 0,
      approval_status: user.approval_status || null,
      last_login: user.last_login || null,
      must_change_password: Number(user.must_change_password) === 1 ? 1 : 0,
    };
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error("[Unified Login Error]", err);
    res.status(500).json({ message: "Server error during login." });
  }
};

// ══════════════════════════════════════════════════════════════
//   EXISTING ADMIN PROFILE FUNCTIONS (Left exactly as they were)
// ══════════════════════════════════════════════════════════════

// ── GET /api/auth/me ──
exports.getMe = async (req, res) => {
  try {
    const [[user]] = await pool.query(
      `SELECT id, name, email, role, staff_type, phone, address, profile_photo, last_login, must_change_password
       FROM users WHERE id = ?`,
      [req.user.id],
    );
    res.json(user);
  } catch (err) {
    console.error("[getMe]", err);
    res.status(500).json({ message: "Unable to load account profile." });
  }
};

// ── PUT /api/auth/profile ──
exports.updateProfile = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "staff") {
      return res.status(403).json({
        message: "This profile endpoint is only for administrator and staff accounts.",
      });
    }

    const { name, phone, address } = req.body || {};
    const fields = [];
    const values = [];
    const changedFields = [];

    if (name !== undefined) {
      const cleanName = String(name || "").trim();
      if (!cleanName) {
        return res.status(400).json({ message: "Name cannot be blank." });
      }
      fields.push("name = ?");
      values.push(cleanName);
      changedFields.push("name");
    }

    if (address !== undefined) {
      const cleanAddress = String(address || "").trim();
      if (!cleanAddress) {
        return res.status(400).json({ message: "Address cannot be blank." });
      }
      fields.push("address = ?");
      values.push(cleanAddress);
      changedFields.push("address");
    }

    if (phone !== undefined) {
      let normalizedPhone;
      try {
        normalizedPhone = normalizePhilippinePhone(phone);
      } catch {
        return res.status(400).json({
          message: "Enter a valid Philippine mobile number.",
        });
      }

      const variants = getPhoneLookupVariants(normalizedPhone);
      const [duplicate] = await pool.query(
        `SELECT id
           FROM users
          WHERE ${phoneDigitsSql("phone")} IN (?, ?, ?)
            AND id <> ?
          LIMIT 1`,
        [...variants, req.user.id],
      );
      if (duplicate.length) {
        return res.status(409).json({
          message: "Phone number already in use.",
        });
      }

      fields.push("phone = ?");
      values.push(normalizedPhone);
      changedFields.push("phone");
    }

    if (!fields.length) {
      return res.status(400).json({ message: "No profile changes were provided." });
    }

    values.push(req.user.id);
    await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ? AND role IN ('admin','staff')`,
      values,
    );

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "update_own_profile",
      tableName: "users",
      recordId: req.user.id,
      newValues: {
        changed_fields: changedFields,
        phone_changed: changedFields.includes("phone"),
        address_changed: changedFields.includes("address"),
        name_changed: changedFields.includes("name"),
      },
      ipAddress: req.ip || null,
    });

    return res.json({ message: "Profile updated." });
  } catch (err) {
    console.error("[updateProfile]", err);
    return res.status(500).json({ message: "Unable to update profile." });
  }
};

// ── PUT /api/auth/change-password ──
exports.changePassword = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "staff") {
      return res.status(403).json({
        message: "This password endpoint is only for administrator and staff accounts.",
      });
    }

    const currentPassword = String(req.body?.current_password || "");
    const newPassword = String(req.body?.new_password || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required.",
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters.",
      });
    }

    const [[user]] = await pool.query(
      `SELECT id, password, role, email, name, staff_type
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [req.user.id],
    );
    if (!user) return res.status(404).json({ message: "Account not found." });

    const match = await bcrypt.compare(currentPassword, user.password || "");
    if (!match) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.password || "");
    if (sameAsCurrent) {
      return res.status(400).json({
        message: "New password must be different from your current password.",
      });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query(
      "UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?",
      [hashed, req.user.id],
    );

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "password_changed",
      tableName: "users",
      recordId: req.user.id,
      newValues: { password_changed: true, must_change_password: 0 },
      ipAddress: req.ip || null,
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        staff_type: user.staff_type || null,
        must_change_password: 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );

    return res.json({
      message: "Password changed successfully.",
      must_change_password: 0,
      token,
    });
  } catch (err) {
    console.error("[changePassword]", err);
    return res.status(500).json({ message: "Unable to change password." });
  }
};
