const axios = require("axios");

const sendSMS = async ({ recipient, message }) => {
  try {
    const response = await axios.post(
      "https://api.semaphore.co/api/v4/messages",
      {
        apikey: process.env.SEMAPHORE_API_KEY,
        number: recipient,
        message,
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      "Semaphore SMS error:",
      error.response?.data || error.message,
    );

    throw new Error("Failed to send SMS");
  }
};

module.exports = {
  sendSMS,
};
