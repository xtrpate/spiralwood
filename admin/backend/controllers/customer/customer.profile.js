// controllers/customer/customer.profile.js
const db = require("../../config/db");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const { sendSms } = require("../../services/semaphore.service");

/* ── OTP generator ── */
const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

/* ── Phone normalization helper ── */
const normalizePhilippinePhone = (phone) => {
  let value = String(phone || "").replace(/\D/g, "");
  if (value.startsWith("09") && value.length === 11)
    return "63" + value.slice(1);
  if (value.startsWith("639") && value.length === 12) return value;
  if (value.startsWith("9") && value.length === 10) return "63" + value;
  return value;
};

/* ── Directory for deleting old avatars ── */
const avatarDir = path.join(__dirname, "../../uploads/avatars");

/* ────────────────────────────────────────
   POST /avatar
──────────────────────────────────────── */
exports.uploadAvatar = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  try {
    const [rows] = await db.query(
      "SELECT profile_photo FROM users WHERE id=?",
      [req.user.id],
    );

    const avatarUrl = req.file.path; // Grab the live Cloudinary URL!

    const [updateResult] = await db.query(
      "UPDATE users SET profile_photo=? WHERE id=?",
      [avatarUrl, req.user.id],
    );

    if (updateResult?.affectedRows === 1) {
      req.auditRecord = {
        id: req.user.id,
        old: { avatar_configured: Boolean(rows[0]?.profile_photo) },
        new: {
          avatar_changed: true,
          avatar_configured: true,
          changed_fields: ["profile_photo"],
        },
      };
    }

    res.json({ profile_photo: avatarUrl });
  } catch (err) {
    console.error("[profile/avatar]", err);
    res.status(500).json({ message: "Upload failed." });
  }
};

/* ────────────────────────────────────────
   PUT /basic  — name + address
──────────────────────────────────────── */
exports.updateBasic = async (req, res) => {
  const { name, address, address_lat, address_lng } = req.body;
  if (!name?.trim())
    return res.status(400).json({ message: "Name is required." });

  // address_lat/address_lng are treated as an optional PAIR that the
  // customer either:
  //   - omits entirely from the request → leave the existing saved pin
  //     untouched (e.g. a plain name/address edit shouldn't wipe it out)
  //   - sends both as null/"" → explicitly clear the saved pin
  //   - sends both as valid numbers → update the saved pin
  //   - sends only one of the two → rejected, since a half-updated pin
  //     is a broken/inconsistent state
  const latKeyPresent = address_lat !== undefined;
  const lngKeyPresent = address_lng !== undefined;

  if (latKeyPresent !== lngKeyPresent) {
    return res.status(400).json({
      message: "Both latitude and longitude must be provided together.",
    });
  }

  const touchesPin = latKeyPresent && lngKeyPresent;
  let cleanLat = null;
  let cleanLng = null;

  if (touchesPin) {
    const isEmptyPinValue = (v) => v === null || v === "";
    const bothEmpty =
      isEmptyPinValue(address_lat) && isEmptyPinValue(address_lng);
    const bothFilled =
      !isEmptyPinValue(address_lat) && !isEmptyPinValue(address_lng);

    if (!bothEmpty && !bothFilled) {
      return res.status(400).json({
        message: "Both latitude and longitude must be provided together.",
      });
    }

    if (bothFilled) {
      const latNum = Number(address_lat);
      const lngNum = Number(address_lng);

      if (
        !Number.isFinite(latNum) ||
        !Number.isFinite(lngNum) ||
        latNum < -90 ||
        latNum > 90 ||
        lngNum < -180 ||
        lngNum > 180
      ) {
        return res.status(400).json({
          message:
            "Invalid map location. Latitude must be between -90 and 90, and longitude between -180 and 180.",
        });
      }

      cleanLat = latNum;
      cleanLng = lngNum;
    }
    // else bothEmpty — cleanLat/cleanLng stay null, which clears the pin
  }

  try {
    const [[existingUser]] = await db.query(
      "SELECT name, address, address_lat, address_lng FROM users WHERE id = ?",
      [req.user.id],
    );

    const normalizeCoord = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const existingLat = existingUser
      ? normalizeCoord(existingUser.address_lat)
      : null;
    const existingLng = existingUser
      ? normalizeCoord(existingUser.address_lng)
      : null;

    let updateResult;

    if (touchesPin) {
      // Request explicitly included lat/lng (either clearing or setting
      // a pin) — update all four columns.
      [updateResult] = await db.query(
        "UPDATE users SET name=?, address=?, address_lat=?, address_lng=? WHERE id=?",
        [name.trim(), address?.trim() || "", cleanLat, cleanLng, req.user.id],
      );
    } else {
      // Request didn't mention lat/lng at all — only touch name/address,
      // leaving any previously saved pin exactly as it was.
      [updateResult] = await db.query(
        "UPDATE users SET name=?, address=? WHERE id=?",
        [name.trim(), address?.trim() || "", req.user.id],
      );
    }

    if (existingUser && updateResult?.affectedRows === 1) {
      const trimmedName = name.trim();
      const trimmedAddress = address?.trim() || "";

      const previousCoordinatesConfigured =
        existingLat !== null && existingLng !== null;

      const nextCoordinatesConfigured = touchesPin
        ? cleanLat !== null && cleanLng !== null
        : previousCoordinatesConfigured;

      const changedFields = [
        ...(trimmedName !== (existingUser.name || "") ? ["name"] : []),
        ...(trimmedAddress !== (existingUser.address || "") ? ["address"] : []),
        ...(touchesPin && (cleanLat !== existingLat || cleanLng !== existingLng)
          ? ["coordinates"]
          : []),
      ];

      if (changedFields.length) {
        req.auditRecord = {
          id: req.user.id,
          old: {
            address_configured: Boolean(existingUser.address?.trim()),
            coordinates_configured: previousCoordinatesConfigured,
          },
          new: {
            name_changed: changedFields.includes("name"),
            address_configured: Boolean(trimmedAddress),
            coordinates_configured: nextCoordinatesConfigured,
            changed_fields: changedFields,
          },
        };
      }
    }

    res.json({ message: "Profile updated." });
  } catch (err) {
    console.error("[profile/basic]", err);
    res.status(500).json({ message: "Update failed." });
  }
};

/* ────────────────────────────────────────
   POST /request-email-change
──────────────────────────────────────── */
exports.requestEmailChange = async (req, res) => {
  const { new_email } = req.body;
  if (!new_email?.trim())
    return res.status(400).json({ message: "New email is required." });

  const normalizedCurrentEmail = String(req.user.email || "")
    .trim()
    .toLowerCase();
  const normalizedRequestedEmail = String(new_email || "")
    .trim()
    .toLowerCase();

  if (normalizedRequestedEmail === normalizedCurrentEmail) {
    return res.status(400).json({
      message: "New email must be different from your current email.",
    });
  }

  /* Check if email already taken */
  // ── FIXED: Switched to .query ──
  const [exists] = await db.query(
    "SELECT id FROM users WHERE email=? AND id!=?",
    [new_email, req.user.id],
  );
  if (exists.length)
    return res.status(409).json({ message: "Email already in use." });

  const otp = genOtp();
  const expires = new Date(Date.now() + 15 * 60 * 1000);

  try {
    /* Store pending change */
    // ── FIXED: Switched to .query ──
    await db.query(
      `UPDATE users
       SET otp_code=?, otp_expires=?, pending_email=?
       WHERE id=?`,
      [otp, expires, new_email, req.user.id],
    );

    const payload = {
      sender: { name: "Spiral Wood Services", email: process.env.MAIL_USER },
      to: [{ email: new_email, name: "Customer" }],
      subject: "Verify your new email — Spiral Wood",
      htmlContent: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#8B4513">Verify New Email</h2>
          <p>Use this OTP to confirm your new email address. It expires in 15 minutes.</p>
          <div style="font-size:36px;font-weight:900;letter-spacing:10px;
                      color:#8B4513;background:#fff3e0;padding:20px;
                      border-radius:10px;text-align:center;margin:20px 0">
            ${otp}
          </div>
          <p style="color:#888;font-size:13px">If you didn't request this, ignore this email.</p>
        </div>
      `,
    };

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
      throw new Error(`BREVO_REJECTED: ${response.status}`);
    }

    res.json({ message: "OTP sent to new email." });
  } catch (err) {
    console.error("[profile/request-email-change]", err);
    res.status(500).json({ message: "Failed to send OTP." });
  }
};

/* ────────────────────────────────────────
   POST /verify-email-change
──────────────────────────────────────── */
exports.verifyEmailChange = async (req, res) => {
  const { otp } = req.body;
  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      "SELECT email, otp_code, otp_expires, pending_email FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];
    if (!u || u.otp_code !== otp)
      return res.status(400).json({ message: "Invalid OTP." });
    if (new Date(u.otp_expires) < new Date())
      return res.status(400).json({ message: "OTP has expired." });

    const emailChanged = u.pending_email !== u.email;

    // ── FIXED: Switched to .query ──
    const [updateResult] = await db.query(
      `UPDATE users
       SET email=?, pending_email=NULL, otp_code=NULL, otp_expires=NULL
       WHERE id=?`,
      [u.pending_email, req.user.id],
    );

    if (emailChanged && updateResult?.affectedRows === 1) {
      req.auditRecord = {
        id: req.user.id,
        old: { email_configured: true },
        new: {
          email_changed: true,
          email_configured: true,
          changed_fields: ["email"],
        },
      };
    }

    res.json({ message: "Email updated successfully." });
  } catch (err) {
    console.error("[profile/verify-email-change]", err);
    res.status(500).json({ message: "Verification failed." });
  }
};

/* ────────────────────────────────────────
   PUT /phone  — Instant phone update
──────────────────────────────────────── */
exports.updatePhone = async (req, res) => {
  const { phone } = req.body;

  if (!phone || !phone.trim()) {
    return res.status(400).json({ message: "Phone number is required." });
  }

  try {
    const [[existingUser]] = await db.query(
      "SELECT phone FROM users WHERE id = ?",
      [req.user.id],
    );

    const trimmedPhone = phone.trim();
    const existingPhone = String(existingUser?.phone || "").trim();
    const phoneChanged = trimmedPhone !== existingPhone;

    const [updateResult] = await db.query(
      "UPDATE users SET phone=? WHERE id=?",
      [trimmedPhone, req.user.id],
    );

    if (existingUser && phoneChanged && updateResult?.affectedRows === 1) {
      req.auditRecord = {
        id: req.user.id,
        old: { phone_configured: Boolean(existingPhone) },
        new: {
          phone_changed: true,
          phone_configured: Boolean(trimmedPhone),
          changed_fields: ["phone"],
        },
      };
    }

    res.json({ message: "Phone number updated successfully." });
  } catch (err) {
    console.error("[profile/phone]", err);
    res.status(500).json({ message: "Failed to update phone number." });
  }
};

/* ────────────────────────────────────────
   POST /request-password-change
──────────────────────────────────────── */
exports.requestPasswordChange = async (req, res) => {
  const { current_password } = req.body;
  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      "SELECT password, email FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];
    const match = await bcrypt.compare(current_password, u.password);
    if (!match)
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });

    const otp = genOtp();
    const expires = new Date(Date.now() + 15 * 60 * 1000);
    // ── FIXED: Switched to .query ──
    await db.query("UPDATE users SET otp_code=?, otp_expires=? WHERE id=?", [
      otp,
      expires,
      req.user.id,
    ]);

    const payload = {
      sender: { name: "Spiral Wood Services", email: process.env.MAIL_USER },
      to: [{ email: u.email, name: "Customer" }],
      subject: "Confirm password change — Spiral Wood",
      htmlContent: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#8B4513">Confirm Password Change</h2>
          <p>Use this OTP to confirm your password change. Valid for 15 minutes.</p>
          <div style="font-size:36px;font-weight:900;letter-spacing:10px;
                      color:#8B4513;background:#fff3e0;padding:20px;
                      border-radius:10px;text-align:center;margin:20px 0">
            ${otp}
          </div>
          <p style="color:#c62828;font-size:13px">
            ⚠ If you didn't request this, secure your account immediately.
          </p>
        </div>
      `,
    };

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
      throw new Error(`BREVO_REJECTED: ${response.status}`);
    }

    res.json({ message: "OTP sent to your email." });
  } catch (err) {
    console.error("[profile/request-password-change]", err);
    res.status(500).json({ message: "Failed." });
  }
};

/* ────────────────────────────────────────
   POST /verify-password-change
──────────────────────────────────────── */
exports.verifyPasswordChange = async (req, res) => {
  const { otp, new_password } = req.body;
  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      "SELECT password, otp_code, otp_expires FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];
    if (!u || u.otp_code !== otp)
      return res.status(400).json({ message: "Invalid OTP." });
    if (new Date(u.otp_expires) < new Date())
      return res.status(400).json({ message: "OTP has expired." });

    const sameAsCurrent = await bcrypt.compare(new_password, u.password);
    if (sameAsCurrent) {
      return res.status(400).json({
        message: "New password must be different from your current password.",
      });
    }

    const hashed = await bcrypt.hash(new_password, 12);
    // ── FIXED: Switched to .query ──
    const [updateResult] = await db.query(
      "UPDATE users SET password=?, otp_code=NULL, otp_expires=NULL WHERE id=?",
      [hashed, req.user.id],
    );

    if (updateResult?.affectedRows === 1) {
      req.auditRecord = {
        id: req.user.id,
        old: { password_configured: true },
        new: {
          password_credential_updated: true,
          password_configured: true,
          changed_fields: ["password"],
        },
      };
    }

    res.json({ message: "Password changed successfully." });
  } catch (err) {
    console.error("[profile/verify-password-change]", err);
    res.status(500).json({ message: "Failed." });
  }
};

/* ────────────────────────────────────────
   POST /request-phone-change
──────────────────────────────────────── */
exports.requestPhoneChange = async (req, res) => {
  const { new_phone } = req.body;
  if (!new_phone?.trim()) {
    return res.status(400).json({ message: "New phone number is required." });
  }

  const trimmedPhone = new_phone.trim();
  if (trimmedPhone.length !== 11 || !trimmedPhone.startsWith("09")) {
    return res.status(400).json({
      message:
        "Phone number must be an 11-digit mobile number starting with 09.",
    });
  }

  if (trimmedPhone === req.user.phone) {
    return res.status(400).json({
      message:
        "New phone number must be different from your current phone number.",
    });
  }

  try {
    // Check if phone number is already in use
    const [exists] = await db.query(
      "SELECT id FROM users WHERE phone = ? AND id != ?",
      [trimmedPhone, req.user.id],
    );
    if (exists.length > 0) {
      return res.status(409).json({
        message: "This phone number is already linked to another account.",
      });
    }

    const otp = genOtp();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await db.query(
      `UPDATE users
       SET otp_code=?, otp_expires=?, otp_purpose='change_phone'
       WHERE id=?`,
      [otp, expires, req.user.id],
    );

    await sendSms({
      phone: normalizePhilippinePhone(trimmedPhone),
      message: `Your Spiral Wood Services verification code to update your phone number is ${otp}. Valid for 15 minutes.`,
    });

    res.json({ message: "OTP sent to new phone number." });
  } catch (err) {
    console.error("[profile/request-phone-change]", err);
    res.status(500).json({ message: "Failed to send SMS verification code." });
  }
};

/* ────────────────────────────────────────
   POST /verify-phone-change
──────────────────────────────────────── */
exports.verifyPhoneChange = async (req, res) => {
  const { otp, new_phone } = req.body;
  if (!otp || !new_phone) {
    return res
      .status(400)
      .json({ message: "OTP and new phone number are required." });
  }

  try {
    const [rows] = await db.query(
      "SELECT phone, otp_code, otp_expires, otp_purpose FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];

    if (!u || u.otp_code !== otp || u.otp_purpose !== "change_phone") {
      return res.status(400).json({ message: "Invalid OTP code." });
    }
    if (new Date(u.otp_expires) < new Date()) {
      return res
        .status(400)
        .json({ message: "OTP has expired. Please request a new one." });
    }

    const trimmedPhone = new_phone.trim();
    const existingPhone = String(u.phone || "").trim();
    const phoneChanged = trimmedPhone !== existingPhone;

    const [updateResult] = await db.query(
      `UPDATE users
       SET phone=?, otp_code=NULL, otp_expires=NULL, otp_purpose=NULL, phone_verified=TRUE
       WHERE id=?`,
      [trimmedPhone, req.user.id],
    );

    if (phoneChanged && updateResult?.affectedRows === 1) {
      req.auditRecord = {
        id: req.user.id,
        old: { phone_configured: Boolean(existingPhone) },
        new: {
          phone_changed: true,
          phone_configured: true,
          changed_fields: ["phone"],
        },
      };
    }

    res.json({
      message: "Phone number updated successfully.",
      phone: trimmedPhone,
    });
  } catch (err) {
    console.error("[profile/verify-phone-change]", err);
    res.status(500).json({ message: "Verification failed." });
  }
};

/* ────────────────────────────────────────
   POST /request-current-phone-auth
   (Sends OTP to CURRENT phone OR CURRENT email)
──────────────────────────────────────── */
exports.requestCurrentPhoneAuth = async (req, res) => {
  const { method } = req.body; // Expects 'sms' or 'email'

  try {
    const [rows] = await db.query("SELECT phone, email FROM users WHERE id=?", [
      req.user.id,
    ]);
    const u = rows[0];

    if (method === "sms" && !u.phone) {
      return res
        .status(400)
        .json({ message: "No phone number attached to this account." });
    }

    const otp = genOtp();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    // Save the OTP to the database
    await db.query(
      `UPDATE users SET otp_code=?, otp_expires=?, otp_purpose='auth_current_phone' WHERE id=?`,
      [otp, expires, req.user.id],
    );

    // ROUTE 1: User requested SMS to current phone
    if (method === "sms") {
      await sendSms({
        phone: normalizePhilippinePhone(u.phone),
        message: `Spiral Wood Services: Your security code to authorize a phone number change is ${otp}. Valid for 15 mins.`,
      });
      return res.json({ message: "Security OTP sent to your current phone." });
    }

    // ROUTE 2: User clicked "Lost Access", requested Email
    else if (method === "email") {
      const payload = {
        sender: { name: "Spiral Wood Services", email: process.env.MAIL_USER },
        to: [{ email: u.email, name: "Customer" }],
        subject: "Authorize Phone Number Change",
        htmlContent: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#8B4513">Phone Update Request</h2>
            <p>Use this OTP to authorize changing the phone number on your account.</p>
            <div style="font-size:36px;font-weight:900;letter-spacing:10px;
                        color:#8B4513;background:#fff3e0;padding:20px;
                        border-radius:10px;text-align:center;margin:20px 0">
              ${otp}
            </div>
            <p style="color:#c62828;font-size:13px">⚠ If you didn't request this, secure your account immediately.</p>
          </div>
        `,
      };

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": process.env.BREVO_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Email sending failed");

      return res.json({ message: "Security OTP sent to your email address." });
    }
  } catch (err) {
    console.error("[profile/request-current-phone-auth]", err);
    res.status(500).json({ message: "Failed to send authorization code." });
  }
};

/* ────────────────────────────────────────
   POST /verify-current-phone-auth
──────────────────────────────────────── */
exports.verifyCurrentPhoneAuth = async (req, res) => {
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ message: "OTP is required." });

  try {
    const [rows] = await db.query(
      "SELECT otp_code, otp_expires, otp_purpose FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];

    if (!u || u.otp_code !== otp || u.otp_purpose !== "auth_current_phone") {
      return res.status(400).json({ message: "Invalid OTP code." });
    }
    if (new Date(u.otp_expires) < new Date()) {
      return res.status(400).json({ message: "OTP has expired." });
    }

    // Clear the OTP so it can't be reused, allowing them to proceed to step 3
    await db.query(
      `UPDATE users SET otp_code=NULL, otp_expires=NULL, otp_purpose=NULL WHERE id=?`,
      [req.user.id],
    );

    res.json({
      message: "Identity verified. Proceed to enter new phone number.",
    });
  } catch (err) {
    console.error("[profile/verify-current-phone-auth]", err);
    res.status(500).json({ message: "Verification failed." });
  }
};

/* ────────────────────────────────────────
   POST /request-current-email-auth
   (Sends OTP to CURRENT email OR CURRENT phone)
──────────────────────────────────────── */
exports.requestCurrentEmailAuth = async (req, res) => {
  const { method } = req.body; // Expects 'email' or 'sms'

  try {
    const [rows] = await db.query("SELECT email, phone FROM users WHERE id=?", [
      req.user.id,
    ]);
    const u = rows[0];

    if (method === "sms" && !u.phone) {
      return res
        .status(400)
        .json({
          message:
            "No phone number attached to this account. Please update your phone number first.",
        });
    }

    const otp = genOtp();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    // Save the OTP to the database
    await db.query(
      `UPDATE users SET otp_code=?, otp_expires=?, otp_purpose='auth_current_email' WHERE id=?`,
      [otp, expires, req.user.id],
    );

    // ROUTE 1: User requested Email
    if (method === "email") {
      const payload = {
        sender: { name: "Spiral Wood Services", email: process.env.MAIL_USER },
        to: [{ email: u.email, name: "Customer" }],
        subject: "Authorize Email Address Change",
        htmlContent: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#8B4513">Email Update Request</h2>
            <p>Use this OTP to authorize changing the email address on your account.</p>
            <div style="font-size:36px;font-weight:900;letter-spacing:10px;
                        color:#8B4513;background:#fff3e0;padding:20px;
                        border-radius:10px;text-align:center;margin:20px 0">
              ${otp}
            </div>
            <p style="color:#c62828;font-size:13px">⚠ If you didn't request this, secure your account immediately.</p>
          </div>
        `,
      };

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": process.env.BREVO_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Email sending failed");
      return res.json({ message: "Security OTP sent to your current email." });
    }

    // ROUTE 2: User clicked "Lost Access", requested SMS
    else if (method === "sms") {
      await sendSms({
        phone: normalizePhilippinePhone(u.phone),
        message: `Spiral Wood Services: Your security code to authorize an email change is ${otp}. Valid for 15 mins.`,
      });
      return res.json({
        message: "Security OTP sent to your registered phone number.",
      });
    }
  } catch (err) {
    console.error("[profile/request-current-email-auth]", err);
    res.status(500).json({ message: "Failed to send authorization code." });
  }
};

/* ────────────────────────────────────────
   POST /verify-current-email-auth
──────────────────────────────────────── */
exports.verifyCurrentEmailAuth = async (req, res) => {
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ message: "OTP is required." });

  try {
    const [rows] = await db.query(
      "SELECT otp_code, otp_expires, otp_purpose FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];

    if (!u || u.otp_code !== otp || u.otp_purpose !== "auth_current_email") {
      return res.status(400).json({ message: "Invalid OTP code." });
    }
    if (new Date(u.otp_expires) < new Date()) {
      return res.status(400).json({ message: "OTP has expired." });
    }

    // Clear the OTP
    await db.query(
      `UPDATE users SET otp_code=NULL, otp_expires=NULL, otp_purpose=NULL WHERE id=?`,
      [req.user.id],
    );

    res.json({
      message: "Identity verified. Proceed to enter new email address.",
    });
  } catch (err) {
    console.error("[profile/verify-current-email-auth]", err);
    res.status(500).json({ message: "Verification failed." });
  }
};
