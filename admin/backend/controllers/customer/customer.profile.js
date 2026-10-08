// controllers/customer/customer.profile.js
const db = require("../../config/db");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const { sendSms } = require("../../services/semaphore.service");
const {
  normalizePhilippinePhone,
  getPhoneLookupVariants,
  phoneDigitsSql,
} = require("../../utils/phone");

const {
  buildOtpEmailHtml,
  sendBrevoEmail,
} = require("../../utils/emailHelper");

const PASSWORD_HISTORY_LIMIT = 3;

const MAX_PROFILE_ADDRESS_LENGTH = 500;

/* ── OTP generator ── */
const { randomInt } = require("crypto");

const genOtp = () => randomInt(100000, 1000000).toString();

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

  if (!name?.trim()) {
    return res.status(400).json({ message: "Name is required." });
  }

  const normalizedName = String(name).trim();
  const normalizedAddress = String(address || "").trim();

  const nameRegex = /^[\p{L}]+(?:[ '\-][\p{L}]+)*$/u;

  if (!nameRegex.test(normalizedName)) {
    return res.status(400).json({
      message:
        "Name may contain letters, spaces, hyphens, and apostrophes only.",
    });
  }

  if (normalizedAddress.length > MAX_PROFILE_ADDRESS_LENGTH) {
    return res.status(400).json({
      message: `Address must not exceed ${MAX_PROFILE_ADDRESS_LENGTH} characters.`,
    });
  }

  let nameFirstPart = normalizedName;
  let nameLastPart = "";

  if (normalizedName.includes(",")) {
    const [last, ...firsts] = normalizedName.split(",");
    nameLastPart = String(last || "").trim();
    nameFirstPart = firsts.join(",").trim();
  } else {
    const nameParts = normalizedName.split(/\s+/);

    if (nameParts.length > 1) {
      nameLastPart = nameParts.pop();
      nameFirstPart = nameParts.join(" ");
    }
  }

  if (nameFirstPart.length > 50) {
    return res.status(400).json({
      message: "First name must not exceed 50 characters.",
    });
  }

  if (nameLastPart.length > 50) {
    return res.status(400).json({
      message: "Last name must not exceed 50 characters.",
    });
  }

  if (!nameFirstPart || !nameLastPart) {
    return res.status(400).json({
      message: "Both First Name and Last Name are required.",
    });
  }

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
        [name.trim(), normalizedAddress, cleanLat, cleanLng, req.user.id],
      );
    } else {
      // Request didn't mention lat/lng at all — only touch name/address,
      // leaving any previously saved pin exactly as it was.
      [updateResult] = await db.query(
        "UPDATE users SET name=?, address=? WHERE id=?",
        [name.trim(), normalizedAddress, req.user.id],
      );
    }

    if (existingUser && updateResult?.affectedRows === 1) {
      const trimmedName = name.trim();
      const trimmedAddress = normalizedAddress;

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

  const normalizedCurrentEmail = String(req.user.email || "")
    .trim()
    .toLowerCase();

  const normalizedRequestedEmail = String(new_email || "")
    .trim()
    .toLowerCase();

  if (!normalizedRequestedEmail) {
    return res.status(400).json({
      message: "New email is required.",
    });
  }

  if (normalizedRequestedEmail.length > 254) {
    return res.status(400).json({
      message: "Email address must not exceed 254 characters.",
    });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalizedRequestedEmail)) {
    return res.status(400).json({
      message: "Enter a valid email address.",
    });
  }

  if (normalizedRequestedEmail === normalizedCurrentEmail) {
    return res.status(400).json({
      message: "New email must be different from your current email.",
    });
  }

  const [exists] = await db.query(
    "SELECT id FROM users WHERE LOWER(email)=? AND id!=?",
    [normalizedRequestedEmail, req.user.id],
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
   SET otp_code=?, otp_expires=?, otp_purpose='change_email', pending_email=?
   WHERE id=?`,
      [otp, expires, normalizedRequestedEmail, req.user.id],
    );

    const htmlContent = await buildOtpEmailHtml({
      conn: db,
      name: "Customer",
      otp,
      purpose: "Email Change Verification",
      codeLabel: "Verification Code",
      introText:
        "Use the verification code below to confirm your new email address.",
      instructionText:
        "Enter this code on the verification page to confirm your new email address. If you did not request this change, please ignore this email.",
      expiryMinutes: 15,
    });

    const sent = await sendBrevoEmail({
      toEmail: normalizedRequestedEmail,
      toName: "Customer",
      subject: "Verify your new email — Spiral Wood",
      htmlContent,
    });

    if (!sent) {
      throw new Error("BREVO_SEND_FAILED");
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
  const normalizedOtp = String(otp || "").trim();

  if (!/^\d{6}$/.test(normalizedOtp)) {
    return res.status(400).json({
      message: "OTP must be exactly 6 digits.",
    });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        email,
        otp_code,
        otp_expires,
        otp_purpose,
        pending_email
      FROM users
      WHERE id=?
      LIMIT 1
      `,
      [req.user.id],
    );

    const u = rows[0];

    if (
      !u ||
      String(u.otp_code || "").trim() !== normalizedOtp ||
      u.otp_purpose !== "change_email"
    ) {
      return res.status(400).json({
        message: "Invalid OTP.",
      });
    }

    if (!u.otp_expires || new Date(u.otp_expires) < new Date()) {
      return res.status(400).json({
        message: "OTP has expired.",
      });
    }

    const pendingEmail = String(u.pending_email || "")
      .trim()
      .toLowerCase();

    if (!pendingEmail) {
      return res.status(400).json({
        message: "No pending email change was found. Please start again.",
      });
    }

    if (pendingEmail.length > 254) {
      return res.status(400).json({
        message: "Email address must not exceed 254 characters.",
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(pendingEmail)) {
      return res.status(400).json({
        message: "The pending email address is invalid.",
      });
    }

    if (
      pendingEmail ===
      String(u.email || "")
        .trim()
        .toLowerCase()
    ) {
      return res.status(400).json({
        message: "New email must be different from your current email.",
      });
    }

    const [exists] = await db.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email)=?
        AND id!=?
      LIMIT 1
      `,
      [pendingEmail, req.user.id],
    );

    if (exists.length > 0) {
      return res.status(409).json({
        message: "Email already in use.",
      });
    }

    const [updateResult] = await db.query(
      `
      UPDATE users
      SET
        email=?,
        pending_email=NULL,
        otp_code=NULL,
        otp_expires=NULL,
        otp_purpose=NULL
      WHERE id=?
        AND otp_purpose='change_email'
        AND otp_expires IS NOT NULL
        AND otp_expires > NOW()
      `,
      [pendingEmail, req.user.id],
    );

    if (updateResult?.affectedRows !== 1) {
      return res.status(400).json({
        message:
          "Your email change request has expired. Please request a new verification code.",
      });
    }

    req.auditRecord = {
      id: req.user.id,
      old: { email_configured: true },
      new: {
        email_changed: true,
        email_configured: true,
        changed_fields: ["email"],
      },
    };

    return res.json({
      message: "Email updated successfully.",
    });
  } catch (err) {
    console.error("[profile/verify-email-change]", err);
    return res.status(500).json({
      message: "Verification failed.",
    });
  }
};

/* ────────────────────────────────────────
   PUT /phone  — Instant phone update
──────────────────────────────────────── */
exports.updatePhone = async (req, res) => {
  const { phone } = req.body;
  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ message: "Phone number is required." });
  }

  let normalizedPhone;
  try {
    normalizedPhone = normalizePhilippinePhone(phone);
  } catch {
    return res
      .status(400)
      .json({ message: "Enter a valid Philippine mobile number." });
  }

  try {
    const [[existingUser]] = await db.query(
      "SELECT phone FROM users WHERE id = ?",
      [req.user.id],
    );
    const existingPhone = String(existingUser?.phone || "").trim();
    let normalizedExisting = existingPhone;
    try {
      normalizedExisting = existingPhone
        ? normalizePhilippinePhone(existingPhone)
        : "";
    } catch {
      // Legacy malformed value: allow replacement with a valid canonical number.
    }

    const variants = getPhoneLookupVariants(normalizedPhone);
    const [duplicate] = await db.query(
      `SELECT id FROM users
        WHERE ${phoneDigitsSql("phone")} IN (?, ?, ?)
          AND id <> ?
        LIMIT 1`,
      [...variants, req.user.id],
    );
    if (duplicate.length) {
      return res.status(409).json({
        message: "This phone number is already linked to another account.",
      });
    }

    const [updateResult] = await db.query(
      "UPDATE users SET phone=? WHERE id=?",
      [normalizedPhone, req.user.id],
    );

    if (
      existingUser &&
      normalizedPhone !== normalizedExisting &&
      updateResult?.affectedRows === 1
    ) {
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

    return res.json({
      message: "Phone number updated successfully.",
      phone: normalizedPhone,
    });
  } catch (err) {
    console.error("[profile/phone]", err);
    return res.status(500).json({ message: "Failed to update phone number." });
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
    await db.query(
      `UPDATE users
   SET otp_code=?, otp_expires=?, otp_purpose='change_password'
   WHERE id=?`,
      [otp, expires, req.user.id],
    );

    const htmlContent = await buildOtpEmailHtml({
      conn: db,
      name: "Customer",
      otp,
      purpose: "Password Change Authorization",
      codeLabel: "Password Change Code",
      introText:
        "Use the verification code below to confirm your password change.",
      instructionText:
        "Enter this code on the verification page to complete your password change. If you did not request this change, please secure your account immediately.",
      expiryMinutes: 15,
    });

    const sent = await sendBrevoEmail({
      toEmail: u.email,
      toName: "Customer",
      subject: "Confirm password change — Spiral Wood",
      htmlContent,
    });

    if (!sent) {
      throw new Error("BREVO_SEND_FAILED");
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

  const normalizedOtp = String(otp || "").trim();
  const normalizedNewPassword = String(new_password || "");

  if (!/^\d{6}$/.test(normalizedOtp)) {
    return res.status(400).json({
      message: "OTP must be exactly 6 digits.",
    });
  }

  if (normalizedNewPassword.length < 8) {
    return res.status(400).json({
      message: "New password must be at least 8 characters.",
    });
  }

  if (normalizedNewPassword.length > 72) {
    return res.status(400).json({
      message: "New password must not exceed 72 characters.",
    });
  }

  if (!/[A-Z]/.test(normalizedNewPassword)) {
    return res.status(400).json({
      message: "New password must contain at least one uppercase letter.",
    });
  }

  if (!/[a-z]/.test(normalizedNewPassword)) {
    return res.status(400).json({
      message: "New password must contain at least one lowercase letter.",
    });
  }

  if (!/[0-9]/.test(normalizedNewPassword)) {
    return res.status(400).json({
      message: "New password must contain at least one number.",
    });
  }

  if (!/[^A-Za-z0-9]/.test(normalizedNewPassword)) {
    return res.status(400).json({
      message: "New password must contain at least one special character.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT
         password,
         otp_code,
         otp_expires,
         otp_purpose
       FROM users
       WHERE id=?
       LIMIT 1
       FOR UPDATE`,
      [req.user.id],
    );

    const u = rows[0];

    if (
      !u ||
      String(u.otp_code || "").trim() !== normalizedOtp ||
      u.otp_purpose !== "change_password"
    ) {
      await connection.rollback();

      return res.status(400).json({
        message: "Invalid OTP.",
      });
    }

    if (!u.otp_expires || new Date(u.otp_expires) < new Date()) {
      await connection.rollback();

      return res.status(400).json({
        message: "OTP has expired.",
      });
    }

    const sameAsCurrent = await bcrypt.compare(
      normalizedNewPassword,
      u.password || "",
    );

    if (sameAsCurrent) {
      await connection.rollback();

      return res.status(400).json({
        message: "New password must be different from your current password.",
      });
    }

    const [historyRows] = await connection.query(
      `
      SELECT password_hash
      FROM user_password_history
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
      `,
      [req.user.id, PASSWORD_HISTORY_LIMIT],
    );

    for (const history of historyRows) {
      const sameAsPrevious = await bcrypt.compare(
        normalizedNewPassword,
        history.password_hash || "",
      );

      if (sameAsPrevious) {
        await connection.rollback();

        return res.status(400).json({
          message:
            "You cannot reuse your current password or any of your previous 3 passwords.",
        });
      }
    }

    const hashed = await bcrypt.hash(normalizedNewPassword, 12);

    const [updateResult] = await connection.query(
      `
      UPDATE users
      SET
        password=?,
        otp_code=NULL,
        otp_expires=NULL,
        otp_purpose=NULL
      WHERE id=?
        AND otp_purpose='change_password'
        AND otp_expires IS NOT NULL
        AND otp_expires > NOW()
      `,
      [hashed, req.user.id],
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();

      return res.status(400).json({
        message:
          "Your password change request has expired. Please start again.",
      });
    }

    /*
     * Store the old current password as the newest historical password.
     */
    await connection.query(
      `
      INSERT INTO user_password_history (user_id, password_hash)
      VALUES (?, ?)
      `,
      [req.user.id, u.password],
    );

    /*
     * Keep only the 3 most recent previous passwords.
     */
    const [historyToKeep] = await connection.query(
      `
      SELECT id
      FROM user_password_history
      WHERE user_id=?
      ORDER BY created_at DESC, id DESC
      `,
      [req.user.id],
    );

    const oldHistoryIds = historyToKeep
      .slice(PASSWORD_HISTORY_LIMIT)
      .map((row) => row.id);

    if (oldHistoryIds.length > 0) {
      const placeholders = oldHistoryIds.map(() => "?").join(",");

      await connection.query(
        `
        DELETE FROM user_password_history
        WHERE user_id=?
          AND id IN (${placeholders})
        `,
        [req.user.id, ...oldHistoryIds],
      );
    }

    await connection.commit();

    req.auditRecord = {
      id: req.user.id,
      old: { password_configured: true },
      new: {
        password_credential_updated: true,
        password_configured: true,
        password_history_checked: true,
        password_history_limit: PASSWORD_HISTORY_LIMIT,
        changed_fields: ["password"],
      },
    };

    return res.json({
      message: "Password changed successfully.",
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "[profile/verify-password-change rollback]",
          rollbackError,
        );
      }
    }

    console.error("[profile/verify-password-change]", err);

    return res.status(500).json({
      message: "Failed to change password.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
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

  let normalizedPhone;
  try {
    normalizedPhone = normalizePhilippinePhone(new_phone);
  } catch {
    return res.status(400).json({
      message: "Enter a valid Philippine mobile number.",
    });
  }

  try {
    const [[currentUser]] = await db.query(
      "SELECT phone FROM users WHERE id = ? LIMIT 1",
      [req.user.id],
    );
    if (!currentUser) {
      return res.status(404).json({ message: "Account not found." });
    }

    let currentPhone = String(currentUser.phone || "").trim();
    try {
      currentPhone = currentPhone ? normalizePhilippinePhone(currentPhone) : "";
    } catch {
      // Legacy malformed value can be replaced by a valid new number.
    }

    if (normalizedPhone === currentPhone) {
      return res.status(400).json({
        message:
          "New phone number must be different from your current phone number.",
      });
    }

    const variants = getPhoneLookupVariants(normalizedPhone);
    const [exists] = await db.query(
      `SELECT id FROM users
        WHERE ${phoneDigitsSql("phone")} IN (?, ?, ?)
          AND id <> ?
        LIMIT 1`,
      [...variants, req.user.id],
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
       SET otp_code=?, otp_expires=?, otp_purpose='change_phone', pending_phone=?
       WHERE id=?`,
      [otp, expires, normalizedPhone, req.user.id],
    );

    await sendSms({
      phone: normalizedPhone,
      message: `Your Spiral Wood Services verification code to update your phone number is ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes. Don't share your code with anyone.`,
    });

    return res.json({ message: "OTP sent to new phone number." });
  } catch (err) {
    console.error("[profile/request-phone-change]", err);
    return res
      .status(500)
      .json({ message: "Failed to send SMS verification code." });
  }
};

/* ────────────────────────────────────────
   POST /verify-phone-change
──────────────────────────────────────── */
exports.verifyPhoneChange = async (req, res) => {
  const { otp, new_phone } = req.body;
  const normalizedOtp = String(otp || "").trim();

  if (!/^\d{6}$/.test(normalizedOtp)) {
    return res.status(400).json({
      message: "OTP must be exactly 6 digits.",
    });
  }

  if (!new_phone) {
    return res.status(400).json({
      message: "New phone number is required.",
    });
  }

  let normalizedPhone;
  try {
    normalizedPhone = normalizePhilippinePhone(new_phone);
  } catch {
    return res
      .status(400)
      .json({ message: "Enter a valid Philippine mobile number." });
  }

  try {
    const [rows] = await db.query(
      "SELECT phone, pending_phone, otp_code, otp_expires, otp_purpose FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];
    if (
      !u ||
      String(u.otp_code || "").trim() !== normalizedOtp ||
      u.otp_purpose !== "change_phone"
    ) {
      return res.status(400).json({ message: "Invalid OTP code." });
    }
    if (!u.otp_expires || new Date(u.otp_expires) < new Date()) {
      return res
        .status(400)
        .json({ message: "OTP has expired. Please request a new one." });
    }

    let pendingPhone;
    try {
      pendingPhone = normalizePhilippinePhone(u.pending_phone || "");
    } catch {
      return res.status(400).json({
        message:
          "No verified phone-change request is pending. Please request a new code.",
      });
    }
    if (pendingPhone !== normalizedPhone) {
      return res.status(400).json({
        message:
          "The phone number does not match the number that received this code.",
      });
    }

    const variants = getPhoneLookupVariants(pendingPhone);
    const [duplicate] = await db.query(
      `SELECT id FROM users
        WHERE ${phoneDigitsSql("phone")} IN (?, ?, ?)
          AND id <> ?
        LIMIT 1`,
      [...variants, req.user.id],
    );
    if (duplicate.length) {
      return res.status(409).json({
        message: "This phone number is already linked to another account.",
      });
    }

    let existingPhone = String(u.phone || "").trim();
    try {
      existingPhone = existingPhone
        ? normalizePhilippinePhone(existingPhone)
        : "";
    } catch {
      // Preserve only for audit comparison.
    }

    const [updateResult] = await db.query(
      `UPDATE users
       SET phone=?, pending_phone=NULL, otp_code=NULL, otp_expires=NULL, otp_purpose=NULL, phone_verified=TRUE
       WHERE id=?`,
      [pendingPhone, req.user.id],
    );

    if (pendingPhone !== existingPhone && updateResult?.affectedRows === 1) {
      req.auditRecord = {
        id: req.user.id,
        old: { phone_configured: Boolean(existingPhone) },
        new: {
          phone_changed: true,
          phone_configured: true,
          phone_verified: true,
          changed_fields: ["phone"],
        },
      };
    }

    return res.json({
      message: "Phone number updated successfully.",
      phone: pendingPhone,
    });
  } catch (err) {
    console.error("[profile/verify-phone-change]", err);
    return res.status(500).json({ message: "Verification failed." });
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
      const htmlContent = await buildOtpEmailHtml({
        conn: db,
        name: "Customer",
        otp,
        purpose: "Phone Number Change Authorization",
        codeLabel: "Authorization Code",
        introText:
          "Use the verification code below to authorize changing the phone number on your account.",
        instructionText:
          "Enter this code on the verification page to continue with the phone number change. If you did not request this change, please secure your account immediately.",
        expiryMinutes: 15,
      });

      const sent = await sendBrevoEmail({
        toEmail: u.email,
        toName: "Customer",
        subject: "Authorize Phone Number Change",
        htmlContent,
      });

      if (!sent) {
        throw new Error("BREVO_SEND_FAILED");
      }

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
  const normalizedOtp = String(otp || "").trim();

  if (!/^\d{6}$/.test(normalizedOtp)) {
    return res.status(400).json({
      message: "OTP must be exactly 6 digits.",
    });
  }

  try {
    const [rows] = await db.query(
      "SELECT otp_code, otp_expires, otp_purpose FROM users WHERE id=?",
      [req.user.id],
    );

    const u = rows[0];

    if (
      !u ||
      String(u.otp_code || "").trim() !== normalizedOtp ||
      u.otp_purpose !== "auth_current_phone"
    ) {
      return res.status(400).json({
        message: "Invalid OTP code.",
      });
    }

    if (!u.otp_expires || new Date(u.otp_expires) < new Date()) {
      return res.status(400).json({
        message: "OTP has expired.",
      });
    }

    // Clear the OTP so it cannot be reused.
    await db.query(
      `UPDATE users
       SET otp_code=NULL, otp_expires=NULL, otp_purpose=NULL
       WHERE id=?`,
      [req.user.id],
    );

    return res.json({
      message: "Identity verified. Proceed to enter new phone number.",
    });
  } catch (err) {
    console.error("[profile/verify-current-phone-auth]", err);

    return res.status(500).json({
      message: "Verification failed.",
    });
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
      return res.status(400).json({
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
      const htmlContent = await buildOtpEmailHtml({
        conn: db,
        name: "Customer",
        otp,
        purpose: "Email Address Change Authorization",
        codeLabel: "Authorization Code",
        introText:
          "Use the verification code below to authorize changing the email address on your account.",
        instructionText:
          "Enter this code on the verification page to continue with the email address change. If you did not request this change, please secure your account immediately.",
        expiryMinutes: 15,
      });

      const sent = await sendBrevoEmail({
        toEmail: u.email,
        toName: "Customer",
        subject: "Authorize Email Address Change",
        htmlContent,
      });

      if (!sent) {
        throw new Error("BREVO_SEND_FAILED");
      }
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
  const normalizedOtp = String(otp || "").trim();

  if (!/^\d{6}$/.test(normalizedOtp)) {
    return res.status(400).json({
      message: "OTP must be exactly 6 digits.",
    });
  }

  try {
    const [rows] = await db.query(
      "SELECT otp_code, otp_expires, otp_purpose FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];

    if (
      !u ||
      String(u.otp_code || "").trim() !== normalizedOtp ||
      u.otp_purpose !== "auth_current_email"
    ) {
      return res.status(400).json({
        message: "Invalid OTP code.",
      });
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
