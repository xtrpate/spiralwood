require("dotenv").config();

/* ══════════════════════════════════════════════════════════════
   WEBSITE SETTINGS
══════════════════════════════════════════════════════════════ */

const getWebsiteSetting = async (conn, key) => {
  try {
    const [rows] = await conn.query(
      "SELECT content FROM website_content WHERE content_key = ? LIMIT 1",
      [key],
    );

    return rows.length > 0 ? rows[0].content : null;
  } catch (err) {
    console.error(`[EmailHelper] Error fetching ${key}:`, err.message);
    return null;
  }
};

const isSettingEnabled = async (conn, key) => {
  const val = await getWebsiteSetting(conn, key);

  return val === "true" || val === true || val === 1 || val === "1";
};

/* ══════════════════════════════════════════════════════════════
   EMAIL FOOTER
══════════════════════════════════════════════════════════════ */

const getGlobalEmailFooter = async (conn) => {
  const footerText = await getWebsiteSetting(conn, "email_footer");

  if (!footerText) {
    return "";
  }

  return String(footerText);
};

/* ══════════════════════════════════════════════════════════════
   EMAIL LOGO
══════════════════════════════════════════════════════════════ */

const getGlobalEmailLogo = async (conn) => {
  try {
    const logoValue = await getWebsiteSetting(conn, "site_logo");

    const logoUrl = String(logoValue || "").trim();

    if (!logoUrl) {
      return "";
    }

    /*
     * Production site logos are normally stored as absolute
     * Cloudinary HTTPS URLs.
     */
    if (/^https?:\/\//i.test(logoUrl)) {
      return logoUrl;
    }

    /*
     * Fallback for relative /uploads/... paths.
     *
     * Email clients require an absolute publicly accessible URL.
     */
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
    console.error("[Email Logo] Failed to fetch website logo:", err.message);
    return "";
  }
};

/* ══════════════════════════════════════════════════════════════
   HTML SAFETY
══════════════════════════════════════════════════════════════ */

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/* ══════════════════════════════════════════════════════════════
   OTP EMAIL TEMPLATE
══════════════════════════════════════════════════════════════ */

/**
 * Builds the standardized Spiral Wood Services OTP email.
 *
 * This is intentionally based on the approved Password Reset
 * email design so all OTP-based email notifications share
 * exactly the same visual language.
 *
 * @param {Object} options
 * @param {Object} options.conn - MySQL connection / db object
 * @param {string} options.name - Recipient name
 * @param {string} options.otp - OTP code
 * @param {string} options.purpose - Header subtitle
 * @param {string} options.codeLabel - Label above OTP
 * @param {string} options.introText - Main explanation
 * @param {string} options.instructionText - Text below OTP
 * @param {number} options.expiryMinutes - OTP expiration
 */
const buildOtpEmailHtml = async ({
  conn,
  name,
  otp,
  purpose = "Email Verification",
  codeLabel = "Verification Code",
  introText = "Use the code below to continue.",
  instructionText = "Enter this code on the verification page to continue. If you did not request this, please ignore this email.",
  expiryMinutes = 15,
}) => {
  const [footerText, logoUrl] = await Promise.all([
    getGlobalEmailFooter(conn),
    getGlobalEmailLogo(conn),
  ]);

  const safeName = escapeHtml(name || "Valued Customer");
  const safeOtp = escapeHtml(otp);
  const safePurpose = escapeHtml(purpose);
  const safeCodeLabel = escapeHtml(codeLabel);
  const safeIntroText = escapeHtml(introText);
  const safeInstructionText = escapeHtml(instructionText);
  const safeExpiryMinutes = escapeHtml(expiryMinutes);

  const logoHtml = logoUrl
    ? `
        <img
          src="${escapeHtml(logoUrl)}"
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

  const footerHtml = footerText
    ? `
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
              ${escapeHtml(footerText).replace(/\n/g, "<br/>")}
            </p>
          </td>
        </tr>
      `
    : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>${safePurpose}</title>
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
                      ${safePurpose}
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
                      Hi <strong>${safeName}</strong>,
                    </p>

                    <p
                      style="
                        font-size:14px;
                        line-height:1.7;
                        color:#555555;
                        margin:0 0 28px;
                      "
                    >
                      ${safeIntroText}
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
                            ${safeCodeLabel}
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
                            ${safeOtp}
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
                              ${safeExpiryMinutes} minutes
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
                      ${safeInstructionText}
                    </p>

                  </td>
                </tr>

                <!-- DYNAMIC WEBSITE SETTINGS FOOTER -->
                ${footerHtml}

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
  `;
};

/* ══════════════════════════════════════════════════════════════
   BREVO
══════════════════════════════════════════════════════════════ */

const sendBrevoEmail = async ({ toEmail, toName, subject, htmlContent }) => {
  try {
    if (!process.env.BREVO_API_KEY || !process.env.MAIL_USER) {
      console.warn("[Email] Brevo API key or MAIL_USER not configured.");

      return false;
    }

    const payload = {
      sender: {
        name: "Spiral Wood Services",
        email: process.env.MAIL_USER,
      },

      to: [
        {
          email: toEmail,
          name: toName || "Valued Customer",
        },
      ],

      subject,
      htmlContent,
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
      let errorData;

      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }

      console.error("[Brevo API Error]", errorData);

      return false;
    }

    return true;
  } catch (err) {
    console.error("[Email Error]", err.message);

    return false;
  }
};

/* ══════════════════════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════════════════════ */

module.exports = {
  getWebsiteSetting,
  isSettingEnabled,
  getGlobalEmailFooter,
  getGlobalEmailLogo,
  buildOtpEmailHtml,
  sendBrevoEmail,
};
