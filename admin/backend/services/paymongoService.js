const axios = require("axios");

const PAYMONGO_URL = "https://api.paymongo.com/v1/checkout_sessions";

const formatPhilippinePhoneForPayMongo = (phone) => {
  const value = String(phone || "").replace(/\D/g, "");

  if (value.startsWith("639") && value.length === 12) {
    return `0${value.slice(2)}`;
  }

  if (value.startsWith("09") && value.length === 11) {
    return value;
  }

  if (value.startsWith("9") && value.length === 10) {
    return `0${value}`;
  }

  return String(phone || "");
};
const MIN_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 30000;

const getAuthorizationHeader = () => {
  if (!process.env.PAYMONGO_SECRET_KEY) {
    throw new Error("PAYMONGO_SECRET_KEY is not configured.");
  }

  return `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY).toString(
    "base64",
  )}`;
};

const resolveTimeoutMs = (value) => {
  if (!Number.isInteger(value)) return null;
  return Math.min(Math.max(value, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
};

const withOptionalTimeout = (timeoutMs) => {
  const resolved = resolveTimeoutMs(timeoutMs);
  return resolved === null ? {} : { timeout: resolved };
};

const buildHeaders = ({ includeContentType = false, idempotencyKey } = {}) => {
  const headers = {
    accept: "application/json",
    authorization: getAuthorizationHeader(),
  };
  if (includeContentType) headers["content-type"] = "application/json";
  if (typeof idempotencyKey === "string" && idempotencyKey.trim()) {
    headers["Idempotency-Key"] = idempotencyKey.trim();
  }
  return headers;
};

exports.createCheckoutSession = async ({
  customer,
  amount,
  amountCents,
  description,
  successUrl,
  cancelUrl,
  metadata = {},
  idempotencyKey,
  timeoutMs,
}) => {
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
          phone: formatPhilippinePhoneForPayMongo(customer?.phone),
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
    headers: buildHeaders({ includeContentType: true, idempotencyKey }),
    ...withOptionalTimeout(timeoutMs),
  });

  return {
    sessionId: response.data.data.id,
    checkoutUrl: response.data.data.attributes.checkout_url,
    raw: response.data.data,
  };
};

exports.retrieveCheckoutSession = async (sessionId, { timeoutMs } = {}) => {
  const response = await axios.get(`${PAYMONGO_URL}/${sessionId}`, {
    headers: buildHeaders(),
    ...withOptionalTimeout(timeoutMs),
  });

  return response.data.data;
};

exports.expireCheckoutSession = async (sessionId, { timeoutMs } = {}) => {
  const response = await axios.post(
    `${PAYMONGO_URL}/${sessionId}/expire`,
    {},
    {
      headers: buildHeaders({ includeContentType: true }),
      ...withOptionalTimeout(timeoutMs),
    },
  );

  return response.data.data;
};

exports.getAuthorizationHeader = getAuthorizationHeader;
exports.resolveTimeoutMs = resolveTimeoutMs;
