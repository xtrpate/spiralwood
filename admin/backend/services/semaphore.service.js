// SMS delivery through the configured httpSMS gateway.

exports.sendSms = async ({ phone, message }) => {
  try {
    const apiKey = process.env.HTTPSMS_API_KEY;
    const fromPhone = process.env.HTTPSMS_PHONE;

    if (!apiKey || !fromPhone) {
      return false;
    }

    const formattedToPhone = phone.startsWith("+") ? phone : `+${phone}`;

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
      throw new Error(`HTTPSMS_REJECTED: ${response.status}`);
    }

    return true;
  } catch {
    throw new Error("SMS_FAILED");
  }
};
