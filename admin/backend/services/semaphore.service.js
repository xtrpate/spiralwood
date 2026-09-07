// services/semaphore.service.js (Using your own Android phone via httpSMS!)

exports.sendSms = async ({ phone, message }) => {
  try {
    console.log("========== SMS SEND START ==========");
    console.log("Time:", new Date().toISOString());
    console.log("From:", process.env.HTTPSMS_PHONE);
    console.log("To:", phone);
    console.log("Message:", message);
    console.log("====================================");

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

    // Read the API response ONCE so we can inspect the actual send result
    const responseData = await response.json();

    console.log("========== httpSMS API RESPONSE ==========");
    console.log("HTTP Status:", response.status);
    console.log("Response:", JSON.stringify(responseData, null, 2));
    console.log("==========================================");

    if (!response.ok) {
      console.error("[httpSMS API Error]", responseData);
      throw new Error(`HTTPSMS_REJECTED: ${response.status}`);
    }

    // Log the important httpSMS identifiers/status information
    console.log("========== httpSMS SEND DETAILS ==========");
    const smsData = responseData.data;

    console.log("Message ID:", smsData?.id);
    console.log("Request ID:", smsData?.request_id);
    console.log("Status:", smsData?.status);
    console.log("SIM:", smsData?.sim);
    console.log("Send Attempt Count:", smsData?.send_attempt_count);
    console.log("Created At:", smsData?.created_at);
    console.log("Sent At:", smsData?.sent_at);
    console.log("Delivered At:", smsData?.delivered_at);
    console.log("Last Attempted At:", smsData?.last_attempted_at);
    console.log("Failure Reason:", smsData?.failure_reason);
    console.log("==========================================");

    console.log(
      "✅ httpSMS accepted the SMS request. Check the response above for the actual message status.",
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
