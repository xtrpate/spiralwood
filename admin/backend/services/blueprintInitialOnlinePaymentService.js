// services/blueprintInitialOnlinePaymentService.js
//
// Pure, side-effect-free helpers for the CUSTOMER initial PayMongo payment.
// Business rule:
//   - 30% is the MINIMUM initial payment.
//   - Customer may pay any exact amount from the 30% minimum up to 100%.
//   - All money comparisons use integer centavos.
//   - Request-body amounts must be strings; omitted amount remains backward
//     compatible and defaults to the 30% minimum.
//   - Provider session amount and successful paid amount must agree exactly.

const {
  calcDownPaymentAmount,
  parseDecimalToCentsStrict,
  parseStrictMoneyToCents,
  centsToDecimalString,
  centsToAmount,
} = require("../utils/paymentAmounts");

const INITIAL_PAYMENT_REASON = Object.freeze({
  INVALID_TOTAL: "INVALID_TOTAL",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  BELOW_MINIMUM: "BELOW_MINIMUM",
  ABOVE_TOTAL: "ABOVE_TOTAL",
});

const parseStrictPositiveInteger = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const getInitialPaymentBounds = (orderTotalRaw) => {
  const totalCents = parseDecimalToCentsStrict(orderTotalRaw);
  if (totalCents === null || totalCents <= 0) {
    return {
      ok: false,
      reason: INITIAL_PAYMENT_REASON.INVALID_TOTAL,
    };
  }

  const minimumAmount = calcDownPaymentAmount(centsToDecimalString(totalCents));
  const minimumCents = parseDecimalToCentsStrict(
    Number(minimumAmount).toFixed(2),
  );

  if (
    minimumCents === null ||
    minimumCents <= 0 ||
    minimumCents > totalCents
  ) {
    return {
      ok: false,
      reason: INITIAL_PAYMENT_REASON.INVALID_TOTAL,
    };
  }

  return {
    ok: true,
    totalCents,
    minimumCents,
  };
};

const resolveInitialOnlinePaymentAmount = ({
  orderTotalRaw,
  amountRaw,
}) => {
  const bounds = getInitialPaymentBounds(orderTotalRaw);
  if (!bounds.ok) return bounds;

  const omitted =
    amountRaw === undefined ||
    amountRaw === null ||
    (typeof amountRaw === "string" && amountRaw.trim() === "");

  let amountCents = bounds.minimumCents;

  if (!omitted) {
    const parsed = parseStrictMoneyToCents(amountRaw);
    if (!parsed) {
      return {
        ...bounds,
        ok: false,
        reason: INITIAL_PAYMENT_REASON.INVALID_AMOUNT,
      };
    }
    amountCents = parsed.amountCents;
  }

  if (amountCents < bounds.minimumCents) {
    return {
      ...bounds,
      ok: false,
      reason: INITIAL_PAYMENT_REASON.BELOW_MINIMUM,
      amountCents,
    };
  }

  if (amountCents > bounds.totalCents) {
    return {
      ...bounds,
      ok: false,
      reason: INITIAL_PAYMENT_REASON.ABOVE_TOTAL,
      amountCents,
    };
  }

  return {
    ok: true,
    ...bounds,
    amountCents,
    amountDecimal: centsToDecimalString(amountCents),
    amount: centsToAmount(amountCents),
    minimumAmount: centsToAmount(bounds.minimumCents),
    totalAmount: centsToAmount(bounds.totalCents),
    usedDefaultMinimum: omitted,
  };
};

const readLineItemsTotalCents = (lineItems) => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null;

  let total = 0;

  for (const item of lineItems) {
    const amount = parseStrictPositiveInteger(item?.amount);
    const quantity = parseStrictPositiveInteger(item?.quantity ?? 1);

    if (amount === null || quantity === null) return NaN;

    const lineTotal = amount * quantity;
    const nextTotal = total + lineTotal;

    if (
      !Number.isSafeInteger(lineTotal) ||
      !Number.isSafeInteger(nextTotal) ||
      lineTotal <= 0
    ) {
      return NaN;
    }

    total = nextTotal;
  }

  return total > 0 ? total : NaN;
};

const readSuccessfulPaidAmountCents = (attributes) => {
  const payments = Array.isArray(attributes?.payments)
    ? attributes.payments
    : [];

  const paidPayments = payments.filter(
    (payment) =>
      String(payment?.attributes?.status || "")
        .trim()
        .toLowerCase() === "paid",
  );

  if (paidPayments.length > 1) {
    return {
      ok: false,
      reason: "AMBIGUOUS_SUCCESSFUL_PAYMENTS",
      hasSuccessfulPayment: true,
      paidCents: null,
    };
  }

  const successfulPayment = paidPayments[0] || null;
  const paymentIntent = attributes?.payment_intent || null;
  const intentSucceeded =
    String(paymentIntent?.attributes?.status || "")
      .trim()
      .toLowerCase() === "succeeded";

  const paymentAmount = successfulPayment
    ? parseStrictPositiveInteger(successfulPayment?.attributes?.amount)
    : null;

  const rawIntentAmount = paymentIntent?.attributes?.amount;
  const intentAmount =
    intentSucceeded &&
    rawIntentAmount !== undefined &&
    rawIntentAmount !== null &&
    String(rawIntentAmount).trim() !== ""
      ? parseStrictPositiveInteger(rawIntentAmount)
      : null;

  if (successfulPayment && paymentAmount === null) {
    return {
      ok: false,
      reason: "INVALID_PROVIDER_PAID_AMOUNT",
      hasSuccessfulPayment: true,
      paidCents: null,
    };
  }

  if (intentSucceeded && !successfulPayment && intentAmount === null) {
    return {
      ok: false,
      reason: "INVALID_PROVIDER_PAID_AMOUNT",
      hasSuccessfulPayment: true,
      paidCents: null,
    };
  }

  if (
    intentSucceeded &&
    rawIntentAmount !== undefined &&
    rawIntentAmount !== null &&
    String(rawIntentAmount).trim() !== "" &&
    intentAmount === null
  ) {
    return {
      ok: false,
      reason: "INVALID_PROVIDER_PAID_AMOUNT",
      hasSuccessfulPayment: true,
      paidCents: null,
    };
  }

  if (
    paymentAmount !== null &&
    intentAmount !== null &&
    paymentAmount !== intentAmount
  ) {
    return {
      ok: false,
      reason: "PROVIDER_PAID_AMOUNT_MISMATCH",
      hasSuccessfulPayment: true,
      paidCents: null,
    };
  }

  const paidCents = paymentAmount ?? intentAmount ?? null;

  return {
    ok: true,
    reason: null,
    hasSuccessfulPayment:
      Boolean(successfulPayment) || Boolean(intentSucceeded),
    paidCents,
  };
};

const validateInitialPayMongoSessionContext = (
  session,
  { orderId } = {},
) => {
  const expectedOrderId = String(orderId ?? "").trim();

  if (!/^[1-9]\d*$/.test(expectedOrderId)) {
    return {
      ok: false,
      reason: "INVALID_EXPECTED_ORDER_CONTEXT",
      legacy: false,
    };
  }

  const metadata =
    session?.attributes?.metadata &&
    typeof session.attributes.metadata === "object" &&
    !Array.isArray(session.attributes.metadata)
      ? session.attributes.metadata
      : {};

  const hasValue = (value) =>
    value !== undefined &&
    value !== null &&
    String(value).trim() !== "";

  const metadataOrderId = hasValue(metadata.order_id)
    ? String(metadata.order_id).trim()
    : null;
  const metadataOrderType = hasValue(metadata.order_type)
    ? String(metadata.order_type).trim().toLowerCase()
    : null;
  const metadataPurpose = hasValue(metadata.payment_purpose)
    ? String(metadata.payment_purpose).trim().toLowerCase()
    : null;
  const hasInitialAmountMetadata = hasValue(
    metadata.initial_payment_amount_cents,
  );

  // R1-created sessions always carry amount + purpose + order context.
  // Old fixed-30% sessions may carry only order_id/order_type, so they are
  // accepted as legacy only when any metadata that IS present does not
  // conflict with the authenticated order.
  const isR1Session = hasInitialAmountMetadata || metadataPurpose !== null;

  if (metadataOrderId !== null && metadataOrderId !== expectedOrderId) {
    return {
      ok: false,
      reason: "SESSION_ORDER_ID_MISMATCH",
      legacy: !isR1Session,
    };
  }

  if (metadataOrderType !== null && metadataOrderType !== "blueprint") {
    return {
      ok: false,
      reason: "SESSION_ORDER_TYPE_MISMATCH",
      legacy: !isR1Session,
    };
  }

  if (
    metadataPurpose !== null &&
    metadataPurpose !== "initial_payment"
  ) {
    return {
      ok: false,
      reason: "SESSION_PAYMENT_PURPOSE_MISMATCH",
      legacy: false,
    };
  }

  if (
    isR1Session &&
    (metadataOrderId !== expectedOrderId ||
      metadataOrderType !== "blueprint" ||
      metadataPurpose !== "initial_payment")
  ) {
    return {
      ok: false,
      reason: "INCOMPLETE_INITIAL_PAYMENT_SESSION_CONTEXT",
      legacy: false,
    };
  }

  return {
    ok: true,
    reason: null,
    legacy: !isR1Session,
  };
};

const analyzeInitialPayMongoSession = (
  session,
  { fallbackExpectedCents = null } = {},
) => {
  const attributes = session?.attributes || {};
  const metadata = attributes?.metadata || {};

  const metadataRaw = metadata?.initial_payment_amount_cents;
  const hasMetadataAmount =
    metadataRaw !== undefined &&
    metadataRaw !== null &&
    String(metadataRaw).trim() !== "";

  const metadataCents = hasMetadataAmount
    ? parseStrictPositiveInteger(metadataRaw)
    : null;

  if (hasMetadataAmount && metadataCents === null) {
    return {
      ok: false,
      reason: "INVALID_SESSION_METADATA_AMOUNT",
    };
  }

  const lineItemsCents = readLineItemsTotalCents(attributes?.line_items);
  if (Number.isNaN(lineItemsCents)) {
    return {
      ok: false,
      reason: "INVALID_SESSION_LINE_ITEMS",
    };
  }

  if (
    metadataCents !== null &&
    lineItemsCents !== null &&
    metadataCents !== lineItemsCents
  ) {
    return {
      ok: false,
      reason: "SESSION_EXPECTED_AMOUNT_MISMATCH",
    };
  }

  const fallbackCents =
    fallbackExpectedCents === null
      ? null
      : parseStrictPositiveInteger(fallbackExpectedCents);

  if (fallbackExpectedCents !== null && fallbackCents === null) {
    return {
      ok: false,
      reason: "INVALID_FALLBACK_EXPECTED_AMOUNT",
    };
  }

  const expectedCents =
    metadataCents ?? lineItemsCents ?? fallbackCents ?? null;

  const paid = readSuccessfulPaidAmountCents(attributes);
  if (!paid.ok) return paid;

  if (
    paid.hasSuccessfulPayment &&
    expectedCents !== null &&
    paid.paidCents !== expectedCents
  ) {
    return {
      ok: false,
      reason: "PAID_AMOUNT_DOES_NOT_MATCH_SESSION_AMOUNT",
      hasSuccessfulPayment: true,
      paidCents: paid.paidCents,
      expectedCents,
    };
  }

  const sessionStatus = String(attributes?.status || "")
    .trim()
    .toLowerCase();

  return {
    ok: true,
    reason: null,
    expectedCents,
    paidCents: paid.paidCents,
    hasSuccessfulPayment: paid.hasSuccessfulPayment,
    sessionStatus,
    sessionActive: sessionStatus === "active",
  };
};

const summarizeVerifiedPaymentRows = (rows) => {
  let verifiedTotalCents = 0;
  let hasPendingPayment = false;
  let hasInvalidAmount = false;

  for (const row of Array.isArray(rows) ? rows : []) {
    const cents = parseDecimalToCentsStrict(row?.amount);
    if (cents === null) {
      hasInvalidAmount = true;
      continue;
    }

    const status = String(row?.status || "")
      .trim()
      .toLowerCase();

    if (status === "verified") {
      const next = verifiedTotalCents + cents;
      if (!Number.isSafeInteger(next)) {
        hasInvalidAmount = true;
        continue;
      }
      verifiedTotalCents = next;
    } else if (status === "pending") {
      hasPendingPayment = true;
    }
  }

  return {
    verifiedTotalCents,
    hasPendingPayment,
    hasInvalidAmount,
  };
};

module.exports = {
  INITIAL_PAYMENT_REASON,
  getInitialPaymentBounds,
  resolveInitialOnlinePaymentAmount,
  validateInitialPayMongoSessionContext,
  analyzeInitialPayMongoSession,
  summarizeVerifiedPaymentRows,
};
