// controllers/customer/customer.auth.js
// controllers/customer/customer.auth.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
// const nodemailer = require("nodemailer");
const db = require("../../config/db"); // Uses the unified db config
const { writeAuditLogSafe } = require("../../middleware/auditLog");
const { verifyRecaptcha } = require("../../utils/verifyRecaptcha");
const { sendSms } = require("../../services/semaphore.service");
const {
  normalizePhilippinePhone,
  getPhoneLookupVariants,
  phoneDigitsSql,
} = require("../../utils/phone");

require("dotenv").config();

const OTP_EXPIRY_MINUTES = 15;
const RESET_OTP_EXPIRY_MINUTES = 15;
const RESET_TOKEN_EXPIRY = "10m";

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* ── Helper: Fetch Global Email Footer ── */
const getGlobalEmailFooter = async () => {
  try {
    const [rows] = await db.query(
      "SELECT setting_value FROM website_settings WHERE setting_key = 'email_footer' LIMIT 1",
    );
    return rows.length > 0 && rows[0].setting_value
      ? rows[0].setting_value
      : "";
  } catch (err) {
    console.error("Failed to fetch email footer:", err.message);
    return ""; // Fails safely so emails still send even if the setting is missing!
  }
};

/* ── Formatter: Creates the HTML block for the footer ── */
const buildFooterHtml = (footerText) => {
  if (!footerText) return "";
  return `
    <tr>
      <td style="background:#fff3e0;padding:20px 40px;text-align:center;border-top:2px dashed #D2691E;">
        <p style="font-size:13px;color:#8B4513;margin:0;line-height:1.6;font-weight:600;">
          ${footerText.replace(/\n/g, "<br/>")}
        </p>
      </td>
    </tr>
  `;
};

/* ── Brevo API Setup for Registration OTP ── */
const sendOtpEmail = async (email, otp, name) => {
  try {
    const footerText = await getGlobalEmailFooter();
    const dynamicFooterHtml = buildFooterHtml(footerText);

    const payload = {
      sender: { name: "Spiral Wood Services", email: process.env.MAIL_USER },
      to: [{ email: email, name: name }],
      subject: "Your Spiral Wood Verification Code",
      htmlContent: `
        <!DOCTYPE html>
        <html>
          <body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
              <tr>
                <td align="center">
                  <table width="480" cellpadding="0" cellspacing="0"
                    style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    <tr>
                      <td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center;">
                        <div style="width:56px;height:56px;background:linear-gradient(135deg,#8B4513,#D2691E);
                                    border-radius:14px;display:inline-flex;align-items:center;justify-content:center;
                                    font-size:26px;font-weight:900;color:white;font-family:Georgia,serif;
                                    line-height:56px;">W</div>
                        <h1 style="color:#ffffff;font-size:20px;font-weight:800;margin:12px 0 4px;
                                   letter-spacing:2px;">SPIRAL WOOD SERVICES</h1>
                        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0;">
                          Email Verification
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:36px 40px;">
                        <p style="font-size:16px;color:#1a1a2e;margin:0 0 8px;">
                          Hi <strong>${name}</strong>,
                        </p>
                        <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 28px;">
                          Thank you for registering with Spiral Wood Services.
                          Use the verification code below to verify your email address.
                        </p>
                        <div style="background:#fff3e0;border:2px dashed #D2691E;border-radius:12px;
                                    padding:24px;text-align:center;margin-bottom:28px;">
                          <p style="font-size:12px;color:#8B4513;font-weight:700;
                                    letter-spacing:2px;margin:0 0 10px;text-transform:uppercase;">
                            Your Verification Code
                          </p>
                          <div style="font-size:42px;font-weight:900;color:#8B4513;
                                      letter-spacing:12px;font-family:'Courier New',monospace;">
                            ${otp}
                          </div>
                          <p style="font-size:12px;color:#aaa;margin:10px 0 0;">
                            Expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>
                          </p>
                        </div>
                        <p style="font-size:13px;color:#888;line-height:1.7;margin:0;">
                          Enter this code on the verification page to finish creating your account.
                          If you did not create an account, please ignore this email.
                        </p>
                      </td>
                    </tr>

                    ${dynamicFooterHtml}

                    <tr>
                      <td style="background:#f7f8fa;padding:20px 40px;text-align:center;
                                 border-top:1px solid #eee;">
                        <p style="font-size:12px;color:#aaa;margin:0;line-height:1.6;">
                          © ${new Date().getFullYear()} Spiral Wood Services. All rights reserved.<br/>
                          This is an automated email — please do not reply.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
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
      const errorData = await response.json();
      console.error("[Brevo API Error]", errorData);
      throw new Error(`BREVO_REJECTED: ${response.status}`);
    }

    console.log("Brevo API Success: Registration OTP Sent!");
  } catch (err) {
    console.error("CRITICAL: Failed to send verification email.", err.message);
    throw new Error("EMAIL_FAILED");
  }
};

/* ── Brevo API Setup for Password Reset OTP ── */
const sendResetOtpEmail = async (email, otp, name) => {
  try {
    const footerText = await getGlobalEmailFooter();
    const dynamicFooterHtml = buildFooterHtml(footerText);

    const payload = {
      sender: { name: "Spiral Wood Services", email: process.env.MAIL_USER },
      to: [{ email: email, name: name }],
      subject: "Your Spiral Wood Password Reset Code",
      htmlContent: `
        <!DOCTYPE html>
        <html>
          <body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
              <tr>
                <td align="center">
                  <table width="480" cellpadding="0" cellspacing="0"
                    style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    <tr>
                      <td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center;">
                        <div style="width:56px;height:56px;background:linear-gradient(135deg,#8B4513,#D2691E);
                                    border-radius:14px;display:inline-flex;align-items:center;justify-content:center;
                                    font-size:26px;font-weight:900;color:white;font-family:Georgia,serif;
                                    line-height:56px;">W</div>
                        <h1 style="color:#ffffff;font-size:20px;font-weight:800;margin:12px 0 4px;
                                   letter-spacing:2px;">SPIRAL WOOD SERVICES</h1>
                        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0;">
                          Password Reset
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:36px 40px;">
                        <p style="font-size:16px;color:#1a1a2e;margin:0 0 8px;">
                          Hi <strong>${name}</strong>,
                        </p>
                        <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 28px;">
                          We received a request to reset your password.
                          Use the code below to continue.
                        </p>
                        <div style="background:#fff3e0;border:2px dashed #D2691E;border-radius:12px;
                                    padding:24px;text-align:center;margin-bottom:28px;">
                          <p style="font-size:12px;color:#8B4513;font-weight:700;
                                    letter-spacing:2px;margin:0 0 10px;text-transform:uppercase;">
                            Password Reset Code
                          </p>
                          <div style="font-size:42px;font-weight:900;color:#8B4513;
                                      letter-spacing:12px;font-family:'Courier New',monospace;">
                            ${otp}
                          </div>
                          <p style="font-size:12px;color:#aaa;margin:10px 0 0;">
                            Expires in <strong>${RESET_OTP_EXPIRY_MINUTES} minutes</strong>
                          </p>
                        </div>
                        <p style="font-size:13px;color:#888;line-height:1.7;margin:0;">
                          Enter this code on the password reset page and create a new password.
                          If you did not request a reset, please ignore this email.
                        </p>
                      </td>
                    </tr>

                    ${dynamicFooterHtml}

                    <tr>
                      <td style="background:#f7f8fa;padding:20px 40px;text-align:center;
                                 border-top:1px solid #eee;">
                        <p style="font-size:12px;color:#aaa;margin:0;line-height:1.6;">
                          © ${new Date().getFullYear()} Spiral Wood Services. All rights reserved.<br/>
                          This is an automated email — please do not reply.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
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
      const errorData = await response.json();
      console.error("[Brevo API Error]", errorData);
      throw new Error(`BREVO_REJECTED: ${response.status}`);
    }

    console.log("Brevo API Success: Password Reset OTP Sent!");
  } catch (err) {
    console.error(
      "CRITICAL: Failed to send password reset email.",
      err.message,
    );
    throw new Error("RESET_EMAIL_FAILED");
  }
};

/* ══════════════════════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════════════════════ */

exports.register = async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    address,
    address_lat,
    address_lng,
    password,
    recaptcha_token,
  } = req.body;

  if (!first_name || !last_name || !email || !phone || !address || !password) {
    return res.status(400).json({
      message: "All fields are required.",
    });
  }

  if (
    address_lat === undefined ||
    address_lat === null ||
    address_lat === "" ||
    address_lng === undefined ||
    address_lng === null ||
    address_lng === ""
  ) {
    return res.status(400).json({
      message: "A valid delivery location pin is required.",
    });
  }

  const parsedLat = Number(address_lat);
  const parsedLng = Number(address_lng);

  if (
    !Number.isFinite(parsedLat) ||
    !Number.isFinite(parsedLng) ||
    parsedLat < -90 ||
    parsedLat > 90 ||
    parsedLng < -180 ||
    parsedLng > 180
  ) {
    return res.status(400).json({
      message: "Invalid delivery location coordinates.",
    });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters." });
  }

  let normalizedPhone;
  try {
    normalizedPhone = normalizePhilippinePhone(phone);
  } catch {
    return res.status(400).json({
      message: "Enter a valid Philippine mobile number.",
    });
  }

  const isHuman = await verifyRecaptcha(recaptcha_token);
  if (!isHuman) {
    return res
      .status(400)
      .json({ message: "Please complete the CAPTCHA verification." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const fullName = `${String(first_name).trim()} ${String(last_name).trim()}`;

    const phoneVariants = getPhoneLookupVariants(normalizedPhone);
    const [existing] = await db.query(
      `SELECT id, email, phone
         FROM users
        WHERE LOWER(email) = ?
           OR ${phoneDigitsSql("phone")} IN (?, ?, ?)
        LIMIT 1`,
      [normalizedEmail, ...phoneVariants],
    );

    if (existing.length > 0) {
      const sameEmail =
        String(existing[0]?.email || "").toLowerCase() === normalizedEmail;
      return res.status(409).json({
        message: sameEmail
          ? "An account with this email already exists."
          : "This phone number is already registered.",
      });
    }

    const hashed = await bcrypt.hash(password, 12);

    // Email OTP
    const emailOtp = generateOtp();
    const emailOtpExpiry = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    // Phone OTP
    const phoneOtp = generateOtp();
    const phoneOtpHash = await bcrypt.hash(phoneOtp, 10);
    const phoneOtpExpires = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    const [result] = await db.query(
      `
  INSERT INTO users
  (
    name,
    email,
    password,
    phone,
    address,
    address_lat,
    address_lng,
    role,
    is_verified,
    otp_code,
    otp_purpose,
    otp_expires,
    phone_verified,
    phone_otp_hash,
    phone_otp_expires,
    approval_status,
    is_active
  )
  VALUES
  (
    ?, ?, ?, ?, ?, ?, ?, 'customer',
    FALSE,
    ?, 'verify_email', ?,
    FALSE,
    ?, ?,
    'approved',
    TRUE
  )
  `,
      [
        fullName,
        normalizedEmail,
        hashed,
        normalizedPhone,
        address,
        parsedLat,
        parsedLng,
        emailOtp,
        emailOtpExpiry,
        phoneOtpHash,
        phoneOtpExpires,
      ],
    );

    try {
      const firstName = String(first_name).trim();

      // 1. Send email OTP
      await sendOtpEmail(normalizedEmail, emailOtp, firstName);

      // 2. Send phone OTP
      await sendSms({
        phone: normalizedPhone,
        message: `Your Spiral Wood Services phone verification code is ${phoneOtp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      });

      return res.status(201).json({
        message:
          "Registration successful. Verification codes were sent to your email and phone.",
        user_id: result.insertId,
      });
    } catch (verificationError) {
      console.error("Verification message failed:", verificationError.message);

      // Delete user if either email or SMS fails
      await db.query("DELETE FROM users WHERE id = ?", [result.insertId]);

      return res.status(500).json({
        message: "We couldn't send the verification codes. Please try again.",
      });
    }
  } catch (err) {
    console.error("[register]", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Email or phone number is already registered.",
      });
    }
    return res.status(500).json({
      message: "Registration could not be completed. Please try again.",
    });
  }
};

exports.changeRegistrationEmail = async (req, res) => {
  const { current_email, new_email } = req.body;

  if (!current_email || !new_email) {
    return res.status(400).json({
      message: "Current email and new email are required.",
    });
  }

  try {
    const normalizedCurrentEmail = String(current_email).trim().toLowerCase();

    const normalizedNewEmail = String(new_email).trim().toLowerCase();

    if (normalizedCurrentEmail === normalizedNewEmail) {
      return res.status(400).json({
        message: "The new email must be different from the current email.",
      });
    }

    // Find the currently pending customer account
    const [users] = await db.query(
      `
      SELECT id, name, is_verified
      FROM users
      WHERE email = ?
        AND role = 'customer'
      LIMIT 1
      `,
      [normalizedCurrentEmail],
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: "Registration account not found.",
      });
    }

    const user = users[0];

    // Email changing is only allowed before email verification.
    if (user.is_verified) {
      return res.status(400).json({
        message:
          "This email has already been verified. Email cannot be changed during registration.",
      });
    }

    // Make sure the new email is not already being used.
    const [existing] = await db.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [normalizedNewEmail],
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message: "An account with that email already exists.",
      });
    }

    // Generate a new email OTP
    const emailOtp = generateOtp();

    const emailOtpExpiry = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    // Update email + replace the existing OTP
    await db.query(
      `
      UPDATE users
      SET
        email = ?,
        otp_code = ?,
        otp_purpose = 'verify_email',
        otp_expires = ?
      WHERE id = ?
      `,
      [normalizedNewEmail, emailOtp, emailOtpExpiry, user.id],
    );

    // Send the new OTP to the new email
    const firstName = String(user.name || "Customer")
      .trim()
      .split(" ")[0];

    await sendOtpEmail(normalizedNewEmail, emailOtp, firstName);

    return res.json({
      message:
        "Email changed successfully. A new verification code has been sent.",
      email: normalizedNewEmail,
    });
  } catch (err) {
    console.error("[change-registration-email]", err);

    return res.status(500).json({
      message: "Unable to change email. Please try again.",
    });
  }
};

exports.invalidateRegistrationEmailOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      message: "Email is required.",
    });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    const [users] = await db.query(
      `
      SELECT id, is_verified
      FROM users
      WHERE email = ?
        AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (!users.length) {
      return res.status(404).json({
        message: "Registration account not found.",
      });
    }

    const user = users[0];

    if (user.is_verified) {
      return res.status(400).json({
        message: "Email is already verified.",
      });
    }

    // Invalidate the current email OTP immediately.
    await db.query(
      `
      UPDATE users
      SET
        otp_code = NULL,
        otp_purpose = NULL,
        otp_expires = NULL
      WHERE id = ?
      `,
      [user.id],
    );

    return res.json({
      message: "Current email verification code has been invalidated.",
    });
  } catch (err) {
    console.error("[invalidate-registration-email-otp]", err);

    return res.status(500).json({
      message: "Unable to invalidate the verification code.",
    });
  }
};

exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedOtp = String(otp).trim();

    const [rows] = await db.query(
      `
      SELECT id, otp_code, otp_purpose, otp_expires, is_verified
      FROM users
      WHERE email = ? AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Account not found." });
    }

    const user = rows[0];

    if (user.is_verified) {
      return res.status(400).json({
        message: "Email is already verified.",
      });
    }

    if (user.otp_purpose !== "verify_email") {
      return res.status(400).json({
        message: "Invalid verification code.",
      });
    }

    if (user.otp_code != otp) {
      return res.status(400).json({
        message: "Invalid verification code.",
      });
    }

    if (!user.otp_expires || new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({
        message: "Verification code has expired. Please request a new one.",
        code: "OTP_EXPIRED",
      });
    }

    await db.query(
      `
  UPDATE users
  SET
    is_verified = TRUE,
    otp_code = NULL,
    otp_purpose = NULL,
    otp_expires = NULL
  WHERE id = ?
  `,
      [user.id],
    );

    return res.json({
      message:
        "Email verified successfully. Please verify your phone number to complete registration.",
      next: "phone_verification",
    });
  } catch (err) {
    console.error("[verify-otp]", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

exports.changeRegistrationPhone = async (req, res) => {
  const { email, new_phone } = req.body;

  if (!email || !new_phone) {
    return res.status(400).json({
      message: "Email and new phone number are required.",
    });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    let normalizedPhone;

    try {
      normalizedPhone = normalizePhilippinePhone(new_phone);
    } catch {
      return res.status(400).json({
        message: "Invalid Philippine mobile number.",
      });
    }

    const [users] = await db.query(
      `
      SELECT
        id,
        name,
        is_verified,
        phone_verified
      FROM users
      WHERE email = ?
        AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: "Registration account not found.",
      });
    }

    const user = users[0];

    // Email must already be verified before changing phone.
    if (!user.is_verified) {
      return res.status(400).json({
        message: "Please verify your email first.",
      });
    }

    // Phone cannot be changed after phone verification.
    if (user.phone_verified) {
      return res.status(400).json({
        message:
          "This phone number has already been verified and cannot be changed during registration.",
      });
    }

    // Prevent duplicate phone numbers.
    const phoneVariants = getPhoneLookupVariants(normalizedPhone);
    const [existing] = await db.query(
      `SELECT id
         FROM users
        WHERE ${phoneDigitsSql("phone")} IN (?, ?, ?)
          AND id <> ?
        LIMIT 1`,
      [...phoneVariants, user.id],
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message: "This phone number is already registered.",
      });
    }

    // Generate a new phone OTP.
    const phoneOtp = generateOtp();

    const phoneOtpHash = await bcrypt.hash(phoneOtp, 10);

    const phoneOtpExpires = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    // Update the pending phone number and replace the old OTP.
    await db.query(
      `
      UPDATE users
      SET
        phone = ?,
        phone_verified = FALSE,
        phone_otp_hash = ?,
        phone_otp_expires = ?
      WHERE id = ?
      `,
      [normalizedPhone, phoneOtpHash, phoneOtpExpires, user.id],
    );

    // Send the new OTP to the new phone number.
    await sendSms({
      phone: normalizedPhone,
      message:
        `Your Spiral Wood Services phone verification code is ${phoneOtp}. ` +
        `It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    });

    return res.json({
      message:
        "Phone number changed successfully. A new verification code has been sent.",
      phone: normalizedPhone,
    });
  } catch (err) {
    console.error("[change-registration-phone]", err);

    return res.status(500).json({
      message: "Unable to change phone number. Please try again.",
    });
  }
};

exports.invalidateRegistrationPhoneOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      message: "Email is required.",
    });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    const [users] = await db.query(
      `
      SELECT
        id,
        is_verified,
        phone_verified
      FROM users
      WHERE email = ?
        AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (!users.length) {
      return res.status(404).json({
        message: "Registration account not found.",
      });
    }

    const user = users[0];

    if (!user.is_verified) {
      return res.status(400).json({
        message: "Please verify your email first.",
      });
    }

    if (user.phone_verified) {
      return res.status(400).json({
        message: "Phone number is already verified.",
      });
    }

    // Invalidate the current phone OTP immediately.
    await db.query(
      `
      UPDATE users
      SET
        phone_otp_hash = NULL,
        phone_otp_expires = NULL
      WHERE id = ?
      `,
      [user.id],
    );

    return res.json({
      message: "Current phone verification code has been invalidated.",
    });
  } catch (err) {
    console.error("[invalidate-registration-phone-otp]", err);

    return res.status(500).json({
      message: "Unable to invalidate the verification code.",
    });
  }
};

exports.verifyPhoneOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      message: "Email and phone verification code are required.",
    });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedOtp = String(otp).trim();

    const [rows] = await db.query(
      `
      SELECT
        id,
        phone_otp_hash,
        phone_otp_expires,
        phone_verified,
        is_verified
      FROM users
      WHERE email = ?
        AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Account not found.",
      });
    }

    const user = rows[0];

    if (!user.is_verified) {
      return res.status(400).json({
        message: "Please verify your email first.",
      });
    }

    if (user.phone_verified) {
      return res.status(400).json({
        message: "Phone number is already verified.",
      });
    }

    if (
      !user.phone_otp_expires ||
      new Date() > new Date(user.phone_otp_expires)
    ) {
      return res.status(400).json({
        message:
          "Phone verification code has expired. Please request a new one.",
        code: "PHONE_OTP_EXPIRED",
      });
    }

    const isMatch = await bcrypt.compare(
      normalizedOtp,
      user.phone_otp_hash || "",
    );

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid phone verification code.",
      });
    }

    await db.query(
      `
  UPDATE users
  SET
    phone_verified = TRUE,
    phone_otp_hash = NULL,
    phone_otp_expires = NULL,
    is_active = TRUE,
    approval_status = 'approved'
  WHERE id = ?
  `,
      [user.id],
    );

    return res.json({
      message: "Phone number verified successfully. Your account is now ready.",
      verified: true,
    });
  } catch (err) {
    console.error("[verify-phone-otp]", err);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

exports.verifyResetOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      message: "Email and reset code are required.",
    });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        id,
        otp_code,
        otp_purpose,
        otp_expires
      FROM users
      WHERE email = ?
      AND role='customer'
      LIMIT 1
      `,
      [String(email).trim().toLowerCase()],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Account not found.",
      });
    }

    const user = rows[0];

    if (user.otp_purpose !== "forgot_password") {
      return res.status(400).json({
        message: "Invalid reset code.",
      });
    }

    if (String(user.otp_code) !== String(otp).trim()) {
      return res.status(400).json({
        message: "Invalid reset code.",
      });
    }

    if (!user.otp_expires || new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({
        message: "Reset code has expired.",
      });
    }

    const resetToken = jwt.sign(
      {
        id: user.id,
        email: String(email).trim().toLowerCase(),
        purpose: "password_reset",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: RESET_TOKEN_EXPIRY,
      },
    );

    return res.json({
      verified: true,
      resetToken,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Server error.",
    });
  }
};

exports.resendOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    const [rows] = await db.query(
      `
      SELECT id, name, is_verified
      FROM users
      WHERE email = ? AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Account not found." });
    }

    if (rows[0].is_verified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    const otp = generateOtp();
    const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await db.query(
      `
      UPDATE users
      SET otp_code = ?, otp_purpose = 'verify_email', otp_expires = ?
      WHERE id = ?
      `,
      [otp, expiry, rows[0].id],
    );

    const firstName = rows[0].name.split(" ")[0];
    await sendOtpEmail(normalizedEmail, otp, firstName);

    return res.json({
      message: "A new verification code has been sent to your email.",
    });
  } catch (err) {
    console.error("[resend-otp]", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

exports.resendPhoneOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      message: "Email is required.",
    });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    const [rows] = await db.query(
      `
      SELECT
        id,
        phone,
        phone_verified
      FROM users
      WHERE email = ?
        AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Account not found.",
      });
    }

    const user = rows[0];

    if (user.phone_verified) {
      return res.status(400).json({
        message: "Phone number is already verified.",
      });
    }

    const phoneOtp = generateOtp();

    const phoneOtpHash = await bcrypt.hash(phoneOtp, 10);

    const phoneOtpExpires = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    await db.query(
      `
      UPDATE users
      SET
        phone_otp_hash = ?,
        phone_otp_expires = ?
      WHERE id = ?
      `,
      [phoneOtpHash, phoneOtpExpires, user.id],
    );

    await sendSms({
      phone: user.phone,
      message: `Your Spiral Wood Services phone verification code is ${phoneOtp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    });

    return res.json({
      message: "A new phone verification code has been sent.",
    });
  } catch (err) {
    console.error("[resend-phone-otp]", err);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email, recaptcha_token } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  const isHuman = await verifyRecaptcha(recaptcha_token);
  if (!isHuman) {
    return res
      .status(400)
      .json({ message: "Please complete the CAPTCHA verification." });
  }

  // Same generic message for every outcome below — this prevents attackers
  // from using this endpoint to check which emails are registered.
  const GENERIC_MESSAGE =
    "If an account with that email exists, we've sent a 6-digit reset code.";

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    const [rows] = await db.query(
      `
      SELECT id, name, is_verified, is_active
      FROM users
      WHERE email = ? AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    // No account, unverified, or inactive: silently do nothing, but still
    // respond with the same generic message as a successful send.
    if (rows.length === 0) {
      return res.json({ message: GENERIC_MESSAGE });
    }

    const user = rows[0];

    if (!user.is_verified || !user.is_active) {
      return res.json({ message: GENERIC_MESSAGE });
    }

    const resetOtp = generateOtp();
    const resetExpiry = new Date(
      Date.now() + RESET_OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    await db.query(
      `
  UPDATE users
  SET
    otp_code = ?,
    otp_purpose = 'forgot_password',
    otp_expires = ?
  WHERE id = ?
  `,
      [resetOtp, resetExpiry, user.id],
    );

    const firstName = user.name ? user.name.split(" ")[0] : "Customer";
    await sendResetOtpEmail(normalizedEmail, resetOtp, firstName);

    return res.json({ message: GENERIC_MESSAGE });
  } catch (err) {
    console.error("[forgot-password]", err);
    // Even on internal errors, avoid leaking details — but this one stays
    // a real 500 since it's a server problem, not an enumeration signal.
    return res.status(500).json({
      message: "Server error. Please try again.",
    });
  }
};

exports.resetPassword = async (req, res) => {
  const { reset_token, new_password } = req.body;

  if (!reset_token || !new_password) {
    return res.status(400).json({
      message: "Reset session and new password are required.",
    });
  }

  if (String(new_password).length < 8) {
    return res.status(400).json({
      message: "New password must be at least 8 characters.",
    });
  }

  let payload;

  try {
    payload = jwt.verify(reset_token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({
      message:
        "Your reset session has expired. Please request a new reset code.",
    });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        id,
        is_verified,
        is_active
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [payload.id],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Account not found.",
      });
    }

    const user = rows[0];

    if (!user.is_verified) {
      return res.status(403).json({
        message: "Please verify your email before resetting your password.",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    const hashedPassword = await bcrypt.hash(new_password, 12);

    await db.query(
      `
      UPDATE users
      SET
        password = ?,
        otp_code = NULL,
        otp_purpose = NULL,
        otp_expires = NULL
      WHERE id = ?
      `,
      [hashedPassword, user.id],
    );

    await writeAuditLogSafe({
      userId: user.id,
      action: "password_reset_completed",
      tableName: "users",
      recordId: user.id,
      newValues: { password_reset: true, method: "email_otp" },
      ipAddress: req.ip || null,
    });

    return res.json({
      message: "Password reset successful. You can now log in.",
    });
  } catch (err) {
    console.error("[reset-password]", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        email,
        password,
        role,
        staff_type, /* Added staff_type for the JWT */
        phone,
        address,
        address_lat,
        address_lng,
        profile_photo,
        is_verified,
        is_active
      FROM users
      WHERE email = ? 
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = rows[0];

    const match = await bcrypt.compare(password, user.password || "");
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // 2. ROLE-SPECIFIC CHECKS

    // A. Customer Recovery Flow
    if (user.role === "customer" && !user.is_verified) {
      const newOtp = generateOtp();
      const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await db.query(
        `
  UPDATE users
  SET
    otp_code = ?,
    otp_purpose = 'verify_email',
    otp_expires = ?
  WHERE id = ?
  `,
        [newOtp, expiry, user.id],
      );

      const firstName = user.name.split(" ")[0];
      await sendOtpEmail(user.email, newOtp, firstName);

      return res.status(403).json({
        message:
          "Account not verified. A new verification code has been sent to your email.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
      });
    }

    // B. Staff Configuration Check
    if (user.role === "staff" && !user.staff_type) {
      return res.status(403).json({
        message: "Staff account type is not configured yet. Contact admin.",
      });
    }

    // 3. GLOBAL ACTIVE CHECK
    if (!user.is_active) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact support.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    // 4. ISSUE UNIFIED JWT
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        staff_type: user.staff_type || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" },
    );

    await db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [
      user.id,
    ]);

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        staff_type: user.staff_type || null,
        phone: user.phone,
        address: user.address,
        address_lat: user.address_lat,
        address_lng: user.address_lng,
        profile_photo: user.profile_photo,
      },
    });
  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

/* ══════════════════════════════════════════════════════════════
   CLOUD CART SYNC (OMNICHANNEL RECONCILIATION)
══════════════════════════════════════════════════════════════ */

exports.getCloudCart = async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const [rows] = await db.query(
      "SELECT cart_data FROM customer_carts WHERE customer_id = ?",
      [req.user.id],
    );

    if (rows.length > 0) {
      return res.json({ cart: rows[0].cart_data });
    }
    return res.json({ cart: [] });
  } catch (err) {
    console.error("[getCloudCart]", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

exports.syncCloudCart = async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { cart } = req.body;

  try {
    const cartJson = JSON.stringify(cart || []);

    await db.query(
      `
      INSERT INTO customer_carts (customer_id, cart_data) 
      VALUES (?, ?) 
      ON DUPLICATE KEY UPDATE cart_data = VALUES(cart_data)
      `,
      [req.user.id, cartJson],
    );

    return res.json({ success: true, message: "Cart synced to cloud." });
  } catch (err) {
    console.error("[syncCloudCart]", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};
