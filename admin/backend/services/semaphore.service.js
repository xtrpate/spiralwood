// services/semaphore.service.js (Using your own Android phone via httpSMS!)

exports.sendSms = async ({ phone, message }) => {
  try {
    const apiKey = process.env.HTTPSMS_API_KEY;
    const fromPhone = process.env.HTTPSMS_PHONE;

    if (!apiKey || !fromPhone) {
      console.warn("httpSMS credentials missing. SMS aborted.");
      return false;
    }

    // Ensure the recipient number is formatted with the + sign
    const formattedToPhone = phone.startsWith("+") ? phone : `+${phone}`;

    // Send the request to the httpSMS API
    const response = await fetch("https://api.httpsms.com/v1/messages/send", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromPhone,
        to: formattedToPhone,
        content: message,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[httpSMS API Error]", errorData);
      throw new Error(`HTTPSMS_REJECTED: ${response.status}`);
    }

    console.log(
      "✅ Custom Gateway Success: Your Android phone is sending the OTP!",
    );
    return true;
  } catch (err) {
    console.error(
      "CRITICAL: Failed to send SMS via personal gateway.",
      err.message,
    );
    throw new Error("SMS_FAILED");
  }
};
