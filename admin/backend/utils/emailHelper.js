require("dotenv").config(); // 👉 ADDED: Guarantee API keys are loaded

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

const getGlobalEmailFooter = async (conn) => {
  const footerText = await getWebsiteSetting(conn, "email_footer");
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

const sendBrevoEmail = async ({ toEmail, toName, subject, htmlContent }) => {
  try {
    if (!process.env.BREVO_API_KEY || !process.env.MAIL_USER) {
      console.warn("[Email] Brevo API key or MAIL_USER not configured.");
      return false;
    }

    const payload = {
      sender: { name: "Spiral Wood Services", email: process.env.MAIL_USER },
      to: [{ email: toEmail, name: toName || "Valued Customer" }],
      subject: subject,
      htmlContent: htmlContent,
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
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Email Error]", err.message);
    return false;
  }
};

module.exports = {
  getWebsiteSetting,
  isSettingEnabled,
  getGlobalEmailFooter,
  sendBrevoEmail,
};
