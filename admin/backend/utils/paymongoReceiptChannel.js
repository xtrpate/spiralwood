// utils/paymongoReceiptChannel.js
//
// Receipt-facing PayMongo payment channel handling.
//
// IMPORTANT:
// - payment_transactions.payment_method remains "paymongo".
// - orders.payment_method remains "paymongo".
// - Only the immutable receipt-facing snapshot may use the exact provider
//   channel (card/gcash/paymaya/qrph).
// - Missing/unknown provider channel data must NEVER invalidate a legitimate
//   payment. It safely falls back to "paymongo" for display purposes.

const PAYMONGO_RECEIPT_CHANNELS = new Set([
  "card",
  "gcash",
  "paymaya",
  "qrph",
]);

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const extractPaymongoReceiptChannel = (payment) => {
  const type = normalize(payment?.attributes?.source?.type);
  return PAYMONGO_RECEIPT_CHANNELS.has(type) ? type : null;
};

const resolvePaymongoReceiptMethod = (payment) =>
  extractPaymongoReceiptChannel(payment) || "paymongo";

const resolvePaymongoReceiptMethodFromSession = (session) => {
  const payments = Array.isArray(session?.attributes?.payments)
    ? session.attributes.payments
    : [];

  const paidPayments = payments.filter(
    (payment) =>
      normalize(payment?.attributes?.status) === "paid",
  );

  if (paidPayments.length !== 1) return "paymongo";

  return resolvePaymongoReceiptMethod(paidPayments[0]);
};

const normalizePaymongoReceiptMethodSnapshot = (value) => {
  const normalized = normalize(value);
  if (normalized === "paymongo") return "paymongo";
  return PAYMONGO_RECEIPT_CHANNELS.has(normalized)
    ? normalized
    : "paymongo";
};

const isPaymongoReceiptEvidence = ({
  paymentMethodSnapshot,
  providerReference,
}) => {
  const method = normalize(paymentMethodSnapshot);
  const hasProviderReference =
    providerReference !== undefined &&
    providerReference !== null &&
    String(providerReference).trim() !== "";

  return method === "paymongo" || hasProviderReference;
};

module.exports = {
  PAYMONGO_RECEIPT_CHANNELS,
  extractPaymongoReceiptChannel,
  resolvePaymongoReceiptMethod,
  resolvePaymongoReceiptMethodFromSession,
  normalizePaymongoReceiptMethodSnapshot,
  isPaymongoReceiptEvidence,
};
