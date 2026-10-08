// controllers/customer/customer.auth.js
// controllers/customer/customer.auth.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
// const nodemailer = require("nodemailer");
const db = require("../../config/db"); // Uses the unified db config
const { writeAuditLogSafe } = require("../../middleware/auditLog");
const {
  getEffectivePermissionsForUser,
} = require("../../services/permissionService");
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
const PASSWORD_HISTORY_LIMIT = 3;

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) => bcrypt.hash(String(otp), 10);

// WISDOM FORGOT PASSWORD RECOVERY LOOKUP
// Accepts either a registered email address or a Philippine mobile number.
const findCustomerForPasswordRecovery = async (identifier) => {
  const value = String(identifier || "").trim();

  if (!value) {
    return null;
  }

  // Email recovery
  if (value.includes("@")) {
    const normalizedEmail = value.toLowerCase();

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        email,
        phone,
        is_verified,
        phone_verified,
        is_active
      FROM users
      WHERE email = ?
        AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    return rows[0] || null;
  }

  // Phone recovery
  let normalizedPhone;

  try {
    normalizedPhone = normalizePhilippinePhone(value);
  } catch {
    return null;
  }

  const phoneVariants = getPhoneLookupVariants(normalizedPhone);

  const [rows] = await db.query(
    `
    SELECT
      id,
      name,
      email,
      phone,
      is_verified,
      phone_verified,
      is_active
    FROM users
    WHERE role = 'customer'
      AND ${phoneDigitsSql("phone")} IN (?, ?, ?)
    LIMIT 1
    `,
    phoneVariants,
  );

  return rows[0] || null;
};

const verifyOtpValue = async (storedValue, suppliedOtp) => {
  if (!storedValue) return false;

  const stored = String(storedValue);
  const supplied = String(suppliedOtp || "").trim();

  if (
    stored.startsWith("$2a$") ||
    stored.startsWith("$2b$") ||
    stored.startsWith("$2y$")
  ) {
    return bcrypt.compare(supplied, stored);
  }

  // Backward compatibility for short-lived legacy plaintext OTPs.
  return stored === supplied;
};

/* ── Helper: Fetch Global Email Footer ── */
const getGlobalEmailFooter = async () => {
  try {
    const [rows] = await db.query(
      "SELECT content FROM website_content WHERE content_type = 'setting' AND content_key = 'email_footer' LIMIT 1",
    );
    return rows.length > 0 && rows[0].content ? rows[0].content : "";
  } catch (err) {
    console.error("Failed to fetch email footer:", err.message);
    return ""; // Fails safely so emails still send even if the setting is missing!
  }
};

/* ── Helper: Fetch the dynamically configured website logo ── */
const getGlobalEmailLogo = async () => {
  try {
    const [rows] = await db.query(
      "SELECT content FROM website_content WHERE content_type = 'setting' AND content_key = 'site_logo' LIMIT 1",
    );

    const logoUrl = String(rows[0]?.content || "").trim();

    if (!logoUrl) {
      return "";
    }

    // Production site logos are already stored as absolute HTTPS URLs
    // (Cloudinary). Email clients require an absolute public URL.
    if (/^https?:\/\//i.test(logoUrl)) {
      return logoUrl;
    }

    // Local/self-hosted fallback for relative /uploads/... paths.
    const publicBackendUrl = String(
      process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "",
    )
      .trim()
      .replace(/\/+$/, "");

    if (!publicBackendUrl) {
      console.warn(
        "[Email Logo] site_logo is relative, but no PUBLIC_BACKEND_URL or BACKEND_URL is configured.",
      );
      return "";
    }

    return `${publicBackendUrl}/${logoUrl.replace(/^\/+/, "")}`;
  } catch (err) {
    console.error("Failed to fetch website logo:", err.message);
    return "";
  }
};

/* ── Formatter: Creates the HTML block for the footer ── */
const buildFooterHtml = (footerText) => {
  if (!footerText) return "";

  return `
    <tr>
      <td
        style="
          background:#ffffff;
          padding:20px 40px;
          text-align:center;
          border-top:2px dashed #222222;
        "
      >
        <p
          style="
            font-size:13px;
            color:#222222;
            margin:0;
            line-height:1.6;
            font-weight:600;
          "
        >
          ${footerText.replace(/\n/g, "<br/>")}
        </p>
      </td>
    </tr>
  `;
};

/* ── Formatter: Monochrome footer for Password Reset emails only ── */
const buildResetFooterHtml = (footerText) => {
  if (!footerText) return "";

  return `
    <tr>
      <td
        style="
          background:#e9e9e9;
          padding:22px 40px;
          text-align:center;
          border-top:2px dashed #222222;
        "
      >
        <p
          style="
            font-size:13px;
            color:#222222;
            margin:0;
            line-height:1.7;
            font-weight:600;
          "
        >
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
                        <img
  src="https://raw.githubusercontent.com/xtrpate/spiralwood/1dc5784752c1cf140a2241dd5dc1d1dd79d551cd/admin/frontend/src/assets/logo1.png"
  alt="Spiral Wood Services"
  width="56"
  height="56"
  style="width:56px;height:56px;object-fit:contain;display:inline-block;"
/>
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
/* ── Brevo API Setup for Password Reset OTP ── */
const sendResetOtpEmail = async (email, otp, name) => {
  try {
    const footerText = await getGlobalEmailFooter();
    const dynamicFooterHtml = buildResetFooterHtml(footerText);
    const logoUrl = await getGlobalEmailLogo();

    const logoHtml = logoUrl
      ? `
        <img
          src="${logoUrl}"
          alt="Spiral Wood Services"
          width="82"
          style="
            display:block;
            width:82px;
            max-width:82px;
            height:auto;
            margin:0 auto 18px;
            border:0;
            outline:none;
            text-decoration:none;
          "
        />
      `
      : "";

    const payload = {
      sender: {
        name: "Spiral Wood Services",
        email: process.env.MAIL_USER,
      },

      to: [
        {
          email: email,
          name: name,
        },
      ],

      subject: "Your Spiral Wood Password Reset Code",

      htmlContent: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0"
            />
            <title>Password Reset</title>
          </head>

          <body
            style="
              margin:0;
              padding:0;
              background:#f3f3f3;
              font-family:'Segoe UI',Arial,sans-serif;
            "
          >

            <table
              width="100%"
              cellpadding="0"
              cellspacing="0"
              border="0"
              style="
                width:100%;
                background:#f3f3f3;
                padding:28px 12px;
              "
            >
              <tr>
                <td align="center">

                  <!-- MAIN EMAIL CONTAINER -->
                  <table
                    width="520"
                    cellpadding="0"
                    cellspacing="0"
                    border="0"
                    style="
                      width:100%;
                      max-width:520px;
                      background:#ffffff;
                      border-radius:14px;
                      overflow:hidden;
                    "
                  >

                    <!-- HEADER -->
                    <tr>
                      <td
                        align="center"
                        style="
                          background:#111111;
                          padding:34px 30px 30px;
                          text-align:center;
                        "
                      >

                        ${logoHtml}

                        <h1
                          style="
                            color:#ffffff;
                            font-size:21px;
                            line-height:1.3;
                            font-weight:800;
                            margin:0 0 6px;
                            letter-spacing:2px;
                          "
                        >
                          SPIRAL WOOD SERVICES
                        </h1>

                        <p
                          style="
                            color:#cccccc;
                            font-size:13px;
                            line-height:1.4;
                            margin:0;
                          "
                        >
                          Password Reset
                        </p>

                      </td>
                    </tr>

                    <!-- BODY -->
                    <tr>
                      <td
                        style="
                          padding:38px 40px 34px;
                          background:#ffffff;
                        "
                      >

                        <!-- GREETING -->
                        <p
                          style="
                            font-size:16px;
                            line-height:1.5;
                            color:#111111;
                            margin:0 0 8px;
                          "
                        >
                          Hi <strong>${name}</strong>,
                        </p>

                        <p
                          style="
                            font-size:14px;
                            line-height:1.7;
                            color:#555555;
                            margin:0 0 28px;
                          "
                        >
                          We received a request to reset your password.
                          Use the code below to continue.
                        </p>

                        <!-- OTP PANEL -->
                        <table
                          width="100%"
                          cellpadding="0"
                          cellspacing="0"
                          border="0"
                          style="
                            width:100%;
                            background:#f2f2f2;
                            border:2px dashed #222222;
                            border-radius:12px;
                            margin:0 0 28px;
                          "
                        >
                          <tr>
                            <td
                              align="center"
                              style="
                                padding:26px 20px 24px;
                                text-align:center;
                              "
                            >

                              <p
                                style="
                                  font-size:12px;
                                  line-height:1.4;
                                  color:#222222;
                                  font-weight:700;
                                  letter-spacing:2px;
                                  margin:0 0 12px;
                                  text-transform:uppercase;
                                "
                              >
                                Password Reset Code
                              </p>

                              <p
                                style="
                                  font-size:40px;
                                  line-height:1.2;
                                  font-weight:900;
                                  color:#111111;
                                  letter-spacing:10px;
                                  font-family:'Courier New',Courier,monospace;
                                  margin:0;
                                "
                              >
                                ${otp}
                              </p>

                              <p
                                style="
                                  font-size:12px;
                                  line-height:1.5;
                                  color:#666666;
                                  margin:14px 0 0;
                                "
                              >
                                Expires in
                                <strong style="color:#333333;">
                                  ${RESET_OTP_EXPIRY_MINUTES} minutes
                                </strong>
                              </p>

                            </td>
                          </tr>
                        </table>

                        <!-- INSTRUCTIONS -->
                        <p
                          style="
                            font-size:13px;
                            line-height:1.7;
                            color:#666666;
                            margin:0;
                          "
                        >
                          Enter this code on the password reset page and
                          create a new password. If you did not request a
                          reset, please ignore this email.
                        </p>

                      </td>
                    </tr>

                    <!-- DYNAMIC WEBSITE SETTINGS FOOTER -->
                    ${dynamicFooterHtml}

                    <!-- COPYRIGHT -->
                    <tr>
                      <td
                        align="center"
                        style="
                          background:#dcdcdc;
                          padding:18px 30px;
                          text-align:center;
                          border-top:1px solid #c8c8c8;
                        "
                      >
                        <p
                          style="
                            font-size:12px;
                            line-height:1.6;
                            color:#555555;
                            margin:0;
                          "
                        >
                          © ${new Date().getFullYear()}
                          Spiral Wood Services.
                          All rights reserved.
                          <br />
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

exports.checkAvailability = async (req, res) => {
  const { email, phone } = req.body;

  if (!email || !phone) {
    return res.status(400).json({ message: "Email and phone are required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    // Normalize phone identically to your register function
    let normalizedPhone;
    try {
      normalizedPhone = normalizePhilippinePhone(phone);
    } catch {
      return res
        .status(400)
        .json({ message: "Invalid Philippine mobile number." });
    }

    // Check Email
    const [existingEmail] = await db.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail],
    );

    if (existingEmail.length > 0) {
      return res.status(409).json({
        message: "An account with this email already exists. Please sign in.",
      });
    }

    // Check Phone
    const [existingPhone] = await db.query(
      "SELECT id FROM users WHERE phone = ? LIMIT 1",
      [normalizedPhone],
    );

    if (existingPhone.length > 0) {
      return res.status(409).json({
        message:
          "An account with this phone number already exists. Please sign in.",
      });
    }

    // If both are clear, return success
    return res.json({ available: true });
  } catch (err) {
    console.error("[check-availability]", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

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

  const normalizedFirstName = String(first_name).trim();
  const normalizedLastName = String(last_name).trim();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedAddress = String(address).trim();
  const normalizedPassword = String(password);

  const nameRegex = /^[\p{L}]+(?:[ '\-][\p{L}]+)*$/u;

  if (!nameRegex.test(normalizedFirstName)) {
    return res.status(400).json({
      message:
        "First Name may contain letters, spaces, hyphens, and apostrophes only.",
    });
  }

  if (!nameRegex.test(normalizedLastName)) {
    return res.status(400).json({
      message:
        "Last Name may contain letters, spaces, hyphens, and apostrophes only.",
    });
  }

  if (normalizedFirstName.length > 50) {
    return res.status(400).json({
      message: "First name must not exceed 50 characters.",
    });
  }

  if (normalizedLastName.length > 50) {
    return res.status(400).json({
      message: "Last name must not exceed 50 characters.",
    });
  }

  if (normalizedEmail.length > 254) {
    return res.status(400).json({
      message: "Email address must not exceed 254 characters.",
    });
  }

  if (normalizedAddress.length > 500) {
    return res.status(400).json({
      message: "Delivery address must not exceed 500 characters.",
    });
  }

  if (normalizedPassword.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters." });
  }

  if (normalizedPassword.length > 72) {
    return res.status(400).json({
      message: "Password must not exceed 72 characters.",
    });
  }

  if (!/[A-Z]/.test(normalizedPassword)) {
    return res.status(400).json({
      message: "Password must contain at least one uppercase letter.",
    });
  }

  if (!/[a-z]/.test(normalizedPassword)) {
    return res.status(400).json({
      message: "Password must contain at least one lowercase letter.",
    });
  }

  if (!/[0-9]/.test(normalizedPassword)) {
    return res.status(400).json({
      message: "Password must contain at least one number.",
    });
  }

  if (!/[^A-Za-z0-9]/.test(normalizedPassword)) {
    return res.status(400).json({
      message: "Password must contain at least one special character.",
    });
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
    const fullName = `${normalizedFirstName} ${normalizedLastName}`;

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

    const hashed = await bcrypt.hash(normalizedPassword, 12);

    // Email OTP
    const emailOtp = generateOtp();
    const emailOtpExpiry = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    // Phone OTP
    const emailOtpHash = await hashOtp(emailOtp);
    const phoneOtp = generateOtp();
    const phoneOtpHash = await hashOtp(phoneOtp);
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
        normalizedAddress,
        parsedLat,
        parsedLng,
        emailOtpHash,
        emailOtpExpiry,
        phoneOtpHash,
        phoneOtpExpires,
      ],
    );

    try {
      const firstName = String(first_name).trim();

      // 1. Send email OTP ONLY
      await sendOtpEmail(normalizedEmail, emailOtp, firstName);

      await writeAuditLogSafe({
        userId: result.insertId,
        action: "register_customer",
        tableName: "users",
        recordId: result.insertId,
        oldValues: null,
        newValues: {
          email: normalizedEmail,
          role: "customer",
          is_verified: false,
          phone_verified: false,
          verification_stage: "email_pending",
        },
        ipAddress: req.ip || null,
        actorType: "anonymous",
        responseStatus: 201,
      });

      return res.status(201).json({
        message:
          "Registration successful. A verification code was sent to your email.",
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
    const emailOtpHash = await hashOtp(emailOtp);

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
      [normalizedNewEmail, emailOtpHash, emailOtpExpiry, user.id],
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
      SELECT id, phone, otp_code, otp_purpose, otp_expires, is_verified
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

    const otpMatches = await verifyOtpValue(user.otp_code, normalizedOtp);
    if (!otpMatches) {
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

    // Generate a fresh Phone OTP now that email is verified
    const phoneOtp = generateOtp();
    const phoneOtpHash = await bcrypt.hash(phoneOtp, 10);
    const phoneOtpExpires = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    await db.query(
      `
      UPDATE users
      SET
        is_verified = TRUE,
        otp_code = NULL,
        otp_purpose = NULL,
        otp_expires = NULL,
        phone_otp_hash = ?,
        phone_otp_expires = ?
      WHERE id = ?
      `,
      [phoneOtpHash, phoneOtpExpires, user.id],
    );

    // Now send the SMS!
    console.log("[OTP] Sending registration phone verification SMS.", {
      userId: user.id,
    });

    await sendSms({
      phone: user.phone,
      message: `Your Spiral Wood Services phone verification code is ${phoneOtp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    });

    await writeAuditLogSafe({
      userId: user.id,
      action: "verify_registration_email",
      tableName: "users",
      recordId: user.id,
      oldValues: {
        is_verified: false,
      },
      newValues: {
        is_verified: true,
        email: normalizedEmail,
        phone_verified: false,
        verification_stage: "phone_pending",
      },
      ipAddress: req.ip || null,
      actorType: "anonymous",
      responseStatus: 200,
    });

    return res.json({
      message:
        "Email verified successfully. Please verify your phone number to complete registration.",
      next: "phone_verification",
    });
  } catch (err) {
    console.error("[verify-otp]", err);
    return res.status(500).json({
      message: "Server error. Please try again.",
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

    console.log(
      "[OTP] Sending replacement registration phone verification SMS.",
      {
        userId: user.id,
      },
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

    await writeAuditLogSafe({
      userId: user.id,
      action: "verify_registration_phone",
      tableName: "users",
      recordId: user.id,
      oldValues: {
        phone_verified: false,
      },
      newValues: {
        phone_verified: true,
        is_active: true,
        approval_status: "approved",
        verification_stage: "completed",
      },
      ipAddress: req.ip || null,
      actorType: "anonymous",
      responseStatus: 200,
    });

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
  const { identifier, otp } = req.body;

  if (!identifier || !otp) {
    return res.status(400).json({
      message: "Email or mobile number and reset code are required.",
    });
  }

  try {
    const user = await findCustomerForPasswordRecovery(identifier);

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired reset code.",
      });
    }

    if (!user.is_verified || !user.is_active) {
      return res.status(400).json({
        message: "Invalid or expired reset code.",
      });
    }

    const isPhoneRecovery = !String(identifier).includes("@");

    if (isPhoneRecovery && !user.phone_verified) {
      return res.status(400).json({
        message: "Invalid or expired reset code.",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        id,
        email,
        otp_code,
        otp_purpose,
        otp_expires
      FROM users
      WHERE id = ?
        AND role = 'customer'
      LIMIT 1
      `,
      [user.id],
    );

    if (!rows.length) {
      return res.status(400).json({
        message: "Invalid or expired reset code.",
      });
    }

    const resetUser = rows[0];

    if (resetUser.otp_purpose !== "forgot_password") {
      return res.status(400).json({
        message: "Invalid or expired reset code.",
      });
    }

    const resetOtpMatches = await verifyOtpValue(
      resetUser.otp_code,
      String(otp).trim(),
    );

    if (!resetOtpMatches) {
      return res.status(400).json({
        message: "Invalid or expired reset code.",
      });
    }

    if (
      !resetUser.otp_expires ||
      new Date() > new Date(resetUser.otp_expires)
    ) {
      return res.status(400).json({
        message: "Invalid or expired reset code.",
      });
    }

    const resetJti = crypto.randomBytes(32).toString("hex");
    const resetJtiHash = await hashOtp(resetJti);

    const resetTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      `
      UPDATE users
      SET
        otp_code = ?,
        otp_purpose = 'password_reset',
        otp_expires = ?
      WHERE id = ?
      `,
      [resetJtiHash, resetTokenExpiresAt, resetUser.id],
    );

    const resetToken = jwt.sign(
      {
        id: resetUser.id,
        email: String(resetUser.email).trim().toLowerCase(),
        purpose: "password_reset",
        jti: resetJti,
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
    console.error("[verify-reset-otp]", err);

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
    const otpHash = await hashOtp(otp);
    const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await db.query(
      `
      UPDATE users
      SET otp_code = ?, otp_purpose = 'verify_email', otp_expires = ?
      WHERE id = ?
      `,
      [otpHash, expiry, rows[0].id],
    );

    const firstName = rows[0].name.split(" ")[0];
    await sendOtpEmail(normalizedEmail, otp, firstName);

    await writeAuditLogSafe({
      userId: rows[0].id,
      action: "resend_registration_email_otp",
      tableName: "users",
      recordId: rows[0].id,
      oldValues: {
        verification_stage: "email_pending",
      },
      newValues: {
        verification_stage: "email_pending",
        otp_resent: true,
      },
      ipAddress: req.ip || null,
      actorType: "anonymous",
      responseStatus: 200,
    });

    return res.json({
      message: "A new verification code has been sent to your email.",
    });
  } catch (err) {
    console.error("[resend-otp]", err);
    return res.status(500).json({
      message: "Server error. Please try again.",
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

    console.log("[OTP] Sending registration phone verification SMS.", {
      userId: user.id,
    });

    await sendSms({
      phone: user.phone,
      message: `Your Spiral Wood Services phone verification code is ${phoneOtp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    });

    await writeAuditLogSafe({
      userId: user.id,
      action: "resend_registration_phone_otp",
      tableName: "users",
      recordId: user.id,
      oldValues: {
        verification_stage: "phone_pending",
      },
      newValues: {
        verification_stage: "phone_pending",
        otp_resent: true,
      },
      ipAddress: req.ip || null,
      actorType: "anonymous",
      responseStatus: 200,
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
  const { identifier, recaptcha_token } = req.body;

  if (!identifier) {
    return res.status(400).json({
      message: "Email or mobile number is required.",
    });
  }

  const isHuman = await verifyRecaptcha(recaptcha_token);

  if (!isHuman) {
    return res.status(400).json({
      message: "Please complete the CAPTCHA verification.",
    });
  }

  // Keep the response generic so attackers cannot determine
  // whether an email address or phone number belongs to an account.
  const GENERIC_MESSAGE =
    "If an active account matches that information, we've sent a 6-digit reset code.";

  try {
    const user = await findCustomerForPasswordRecovery(identifier);

    // No account, unverified, or inactive:
    // always return the same generic response.
    if (!user || !user.is_verified || !user.is_active) {
      return res.json({
        message: GENERIC_MESSAGE,
      });
    }

    // If the user is using phone recovery, the phone number
    // must have been verified previously.
    const isPhoneRecovery = !String(identifier).includes("@");

    if (isPhoneRecovery && !user.phone_verified) {
      return res.json({
        message: GENERIC_MESSAGE,
      });
    }

    const resetOtp = generateOtp();
    const resetOtpHash = await hashOtp(resetOtp);

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
      [resetOtpHash, resetExpiry, user.id],
    );

    const firstName = user.name ? String(user.name).split(" ")[0] : "Customer";

    if (isPhoneRecovery) {
      console.log("[forgot-password] Sending password reset SMS.", {
        userId: user.id,
      });

      await sendSms({
        phone: user.phone,
        message: `Your Spiral Wood Services password reset code is ${resetOtp}. It expires in ${RESET_OTP_EXPIRY_MINUTES} minutes.`,
      });
    } else {
      await sendResetOtpEmail(
        String(user.email).trim().toLowerCase(),
        resetOtp,
        firstName,
      );
    }

    return res.json({
      message: GENERIC_MESSAGE,
    });
  } catch (err) {
    console.error("[forgot-password]", err);

    return res.status(500).json({
      message: "Server error. Please try again.",
    });
  }
};

exports.resendResetOtp = async (req, res) => {
  const { identifier } = req.body || {};

  const GENERIC_MESSAGE =
    "If an active account matches that information, we've sent a 6-digit reset code.";

  if (!identifier) {
    return res.status(400).json({
      message: "Email or mobile number is required.",
    });
  }

  try {
    const user = await findCustomerForPasswordRecovery(identifier);

    if (!user || !user.is_verified || !user.is_active) {
      return res.json({
        message: GENERIC_MESSAGE,
      });
    }

    const isPhoneRecovery = !String(identifier).includes("@");

    if (isPhoneRecovery && !user.phone_verified) {
      return res.json({
        message: GENERIC_MESSAGE,
      });
    }

    const resetOtp = generateOtp();
    const resetOtpHash = await hashOtp(resetOtp);

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
      [resetOtpHash, resetExpiry, user.id],
    );

    const firstName = user.name ? String(user.name).split(" ")[0] : "Customer";

    if (isPhoneRecovery) {
      console.log("[resend-reset-otp] Sending password reset SMS.", {
        userId: user.id,
      });

      await sendSms({
        phone: user.phone,
        message: `Your Spiral Wood Services password reset code is ${resetOtp}. It expires in ${RESET_OTP_EXPIRY_MINUTES} minutes.`,
      });
    } else {
      await sendResetOtpEmail(
        String(user.email).trim().toLowerCase(),
        resetOtp,
        firstName,
      );
    }

    return res.json({
      message: GENERIC_MESSAGE,
    });
  } catch (err) {
    console.error("[resend-reset-otp]", err);

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

  const normalizedNewPassword = String(new_password);

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

  const hasLetters = /[A-Za-z]/.test(normalizedNewPassword);
  const hasNumbers = /[0-9]/.test(normalizedNewPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(normalizedNewPassword);

  if (!hasLetters || !hasNumbers || !hasSpecial) {
    return res.status(400).json({
      message:
        "New password must contain a mix of letters, numbers, and special characters.",
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

  if (
    !payload ||
    payload.purpose !== "password_reset" ||
    typeof payload.jti !== "string" ||
    !payload.jti.trim()
  ) {
    return res.status(401).json({
      message: "Invalid reset session. Please request a new reset code.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT
        id,
        email,
        password,
        role,
        is_verified,
        is_active,
        otp_code,
        otp_purpose,
        otp_expires
      FROM users
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [payload.id],
    );

    if (!rows.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Account not found.",
      });
    }

    const user = rows[0];

    if (String(user.role).trim() !== "customer") {
      await connection.rollback();

      return res.status(401).json({
        message: "Invalid reset session. Please request a new reset code.",
      });
    }

    if (!user.is_verified) {
      await connection.rollback();

      return res.status(403).json({
        message: "Please verify your email before resetting your password.",
      });
    }

    if (!user.is_active) {
      await connection.rollback();

      return res.status(403).json({
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    if (user.otp_purpose !== "password_reset") {
      await connection.rollback();

      return res.status(401).json({
        message: "Invalid reset session. Please request a new reset code.",
      });
    }

    if (!user.otp_expires || new Date() > new Date(user.otp_expires)) {
      await connection.rollback();

      return res.status(401).json({
        message:
          "Your reset session has expired. Please request a new reset code.",
      });
    }

    const resetSessionMatches = await verifyOtpValue(
      user.otp_code,
      payload.jti,
    );

    if (!resetSessionMatches) {
      await connection.rollback();

      return res.status(401).json({
        message: "Invalid reset session. Please request a new reset code.",
      });
    }

    // ------------------------------------------------------------
    // PASSWORD REUSE CHECK
    // ------------------------------------------------------------

    const sameAsCurrent = await bcrypt.compare(
      normalizedNewPassword,
      user.password || "",
    );

    if (sameAsCurrent) {
      await connection.rollback();

      return res.status(400).json({
        message: "You cannot reuse your current password.",
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
      [user.id, PASSWORD_HISTORY_LIMIT],
    );

    for (const history of historyRows) {
      const sameAsPrevious = await bcrypt.compare(
        normalizedNewPassword,
        history.password_hash,
      );

      if (sameAsPrevious) {
        await connection.rollback();

        return res.status(400).json({
          message:
            "You cannot reuse your current password or any of your previous passwords.",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(normalizedNewPassword, 12);

    const [updateResult] = await connection.query(
      `
      UPDATE users
      SET
        password = ?,
        otp_code = NULL,
        otp_purpose = NULL,
        otp_expires = NULL
      WHERE id = ?
        AND role = 'customer'
        AND otp_purpose = 'password_reset'
        AND otp_expires IS NOT NULL
        AND otp_expires > NOW()
      `,
      [hashedPassword, user.id],
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();

      return res.status(401).json({
        message:
          "Your reset session has expired. Please request a new reset code.",
      });
    }

    // Save the old password as the newest previous password.
    await connection.query(
      `
      INSERT INTO user_password_history (user_id, password_hash)
      VALUES (?, ?)
      `,
      [user.id, user.password],
    );

    // Keep only the 3 most recent previous passwords.
    const [historyToKeep] = await connection.query(
      `
      SELECT id
      FROM user_password_history
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      `,
      [user.id],
    );

    const oldHistoryIds = historyToKeep
      .slice(PASSWORD_HISTORY_LIMIT)
      .map((row) => row.id);

    if (oldHistoryIds.length > 0) {
      const placeholders = oldHistoryIds.map(() => "?").join(",");

      await connection.query(
        `
        DELETE FROM user_password_history
        WHERE user_id = ?
          AND id IN (${placeholders})
        `,
        [user.id, ...oldHistoryIds],
      );
    }

    await connection.commit();

    await writeAuditLogSafe({
      userId: user.id,
      action: "password_reset_completed",
      tableName: "users",
      recordId: user.id,
      newValues: {
        password_reset: true,
        method: "email_otp",
        password_history_checked: true,
      },
      ipAddress: req.ip || null,
    });

    return res.json({
      message: "Password reset successful. You can now log in.",
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("[reset-password rollback]", rollbackError);
      }
    }

    console.error("[reset-password]", err);

    return res.status(500).json({
      message: "Server error. Please try again.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  const attemptedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const auditLogin = async ({ action, user = null, reason, responseStatus }) =>
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
      actorType: action === "login_success" ? "user" : "anonymous",
      responseStatus,
    });

  if (!email || !password) {
    await auditLogin({
      action: "login_failed",
      reason: "missing_credentials",
      responseStatus: 400,
    });

    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }

  try {
    const normalizedEmail = attemptedEmail;

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        email,
        password,
        role,
        authority_level,
        staff_type,
        phone,
        address,
        address_lat,
        address_lng,
        profile_photo,
        is_verified,
        phone_verified,
        is_active,
        must_change_password,
        token_version
      FROM users
      WHERE email = ? 
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      await auditLogin({
        action: "login_failed",
        reason: "invalid_credentials",
        responseStatus: 401,
      });

      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = rows[0];

    const match = await bcrypt.compare(password, user.password || "");
    if (!match) {
      await auditLogin({
        action: "login_failed",
        user,
        reason: "invalid_credentials",
        responseStatus: 401,
      });

      return res.status(401).json({ message: "Invalid email or password." });
    }

    // 2. ROLE-SPECIFIC CHECKS

    // Bulletproof database boolean conversions
    const isEmailVerified =
      user.is_verified === 1 ||
      user.is_verified === true ||
      user.is_verified === "1" ||
      (Buffer.isBuffer(user.is_verified) && user.is_verified[0] === 1);

    const isPhoneVerified =
      user.phone_verified === 1 ||
      user.phone_verified === true ||
      user.phone_verified === "1" ||
      (Buffer.isBuffer(user.phone_verified) && user.phone_verified[0] === 1);

    // A. Customer Recovery Flow - Email (Added .trim() just in case!)
    if (String(user.role).trim() === "customer" && !isEmailVerified) {
      const newOtp = generateOtp();
      const newOtpHash = await hashOtp(newOtp);
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
        [newOtpHash, expiry, user.id],
      );

      const firstName = user.name.split(" ")[0];
      await sendOtpEmail(user.email, newOtp, firstName);

      await auditLogin({
        action: "login_failed",
        user,
        reason: "email_not_verified",
        responseStatus: 403,
      });

      return res.status(403).json({
        message: "Email not verified. A new verification code has been sent.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
      });
    }

    // A2. Customer Recovery Flow - Phone (Added .trim() just in case!)
    if (
      String(user.role).trim() === "customer" &&
      isEmailVerified &&
      !isPhoneVerified
    ) {
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

      console.log("[OTP] Sending login phone verification SMS.", {
        userId: user.id,
      });

      await sendSms({
        phone: user.phone,
        message: `Your Spiral Wood Services phone verification code is ${phoneOtp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      });

      await auditLogin({
        action: "login_failed",
        user,
        reason: "phone_not_verified",
        responseStatus: 403,
      });

      return res.status(403).json({
        message: "Phone not verified. A new verification code has been sent.",
        code: "PHONE_NOT_VERIFIED",
        email: user.email,
      });
    }

    // B. Staff Configuration Check
    if (String(user.role).trim() === "staff" && !user.staff_type) {
      await auditLogin({
        action: "login_failed",
        user,
        reason: "staff_type_not_configured",
        responseStatus: 403,
      });

      return res.status(403).json({
        message: "Staff account type is not configured yet. Contact admin.",
      });
    }

    // 3. GLOBAL ACTIVE CHECK
    if (!user.is_active) {
      await auditLogin({
        action: "login_failed",
        user,
        reason: "account_inactive",
        responseStatus: 403,
      });

      return res.status(403).json({
        message: "Your account has been deactivated. Please contact support.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    const permissions = await getEffectivePermissionsForUser(user);

    // 4. ISSUE UNIFIED JWT
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        authority_level: user.authority_level || "user",
        staff_type: user.staff_type || null,
        must_change_password: Number(user.must_change_password) === 1 ? 1 : 0,
        token_version: Number(user.token_version) || 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );

    await db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [
      user.id,
    ]);

    await auditLogin({
      action: "login_success",
      user,
      reason: "authenticated",
      responseStatus: 200,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        authority_level: user.authority_level || "user",
        staff_type: user.staff_type || null,
        permissions,
        phone: user.phone,
        address: user.address,
        address_lat: user.address_lat,
        address_lng: user.address_lng,
        profile_photo: user.profile_photo,
        must_change_password: Number(user.must_change_password) === 1 ? 1 : 0,
      },
    });
  } catch (err) {
    console.error("[login]", err);

    await auditLogin({
      action: "login_failed",
      reason: "server_error",
      responseStatus: 500,
    });

    return res.status(500).json({
      message: "Server error. Please try again.",
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
    return res.status(500).json({ message: "Server error. Please try again." });
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
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};
