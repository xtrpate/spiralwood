const axios = require("axios");

const PAYMONGO_URL = "https://api.paymongo.com/v1/checkout_sessions";

const getAuthorizationHeader = () => {
  if (!process.env.PAYMONGO_SECRET_KEY) {
    throw new Error("PAYMONGO_SECRET_KEY is not configured.");
  }

  return `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY).toString(
    "base64",
  )}`;
};

exports.createCheckoutSession = async ({
  customer,
  amount,
  amountCents,
  description,
  successUrl,
  cancelUrl,
  metadata = {},
}) => {
  // Additive, backward-compatible: when a caller has already computed an
  // exact integer-centavo amount (e.g. via utils/paymentAmounts.js — see
  // pos.qrPayments.js), pass it directly as amountCents to avoid any
  // floating-point multiplication at this layer. Existing callers
  // (customer.orders.js, customer.customorders.js) never pass amountCents,
  // so Number.isSafeInteger(undefined) is false and they fall through to
  // the exact same Math.round(Number(amount) * 100) conversion as before —
  // their behavior is completely unchanged.
  const resolvedLineItemAmount =
    Number.isSafeInteger(amountCents) && amountCents > 0
      ? amountCents
      : Math.round(Number(amount) * 100);

  const payload = {
    data: {
      attributes: {
        billing: {
          name: customer?.name || "",
          email: customer?.email || "",
          phone: customer?.phone || "",
        },

        send_email_receipt: false,
        show_description: true,
        show_line_items: true,

        description,

        payment_method_types: ["card", "gcash", "paymaya"],

        line_items: [
          {
            currency: "PHP",
            amount: resolvedLineItemAmount,
            name: description,
            quantity: 1,
          },
        ],

        metadata,

        success_url: successUrl,
        cancel_url: cancelUrl,
      },
    },
  };

  const response = await axios.post(PAYMONGO_URL, payload, {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: getAuthorizationHeader(),
    },
  });

  return {
    sessionId: response.data.data.id,
    checkoutUrl: response.data.data.attributes.checkout_url,
    raw: response.data.data,
  };
};

exports.retrieveCheckoutSession = async (sessionId) => {
  const response = await axios.get(`${PAYMONGO_URL}/${sessionId}`, {
    headers: {
      accept: "application/json",
      authorization: getAuthorizationHeader(),
    },
  });

  return response.data.data;
};

exports.getAuthorizationHeader = getAuthorizationHeader;
