// utils/readyMadeVat.js
// Cashier ready-made sales use VAT-inclusive selling prices.
// This helper extracts the 12% VAT component without changing the payable total.
// All inputs/outputs are integer centavos.
const { MAX_DECIMAL_12_2_CENTS } = require("./paymentAmounts");

const READY_MADE_VAT_RATE = 12;
const READY_MADE_VAT_DENOMINATOR = 100 + READY_MADE_VAT_RATE;

const isValidCents = (value) =>
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= MAX_DECIMAL_12_2_CENTS;

const computeReadyMadeVatInclusiveBreakdown = ({
  subtotalCents,
  discountCents,
  deliveryFeeCents,
}) => {
  if (
    !isValidCents(subtotalCents) ||
    !isValidCents(discountCents) ||
    !isValidCents(deliveryFeeCents) ||
    discountCents > subtotalCents
  ) {
    return null;
  }

  const totalCents = subtotalCents - discountCents + deliveryFeeCents;
  if (!isValidCents(totalCents)) return null;

  // Half-up rounding using integer arithmetic:
  // VAT = total * 12 / 112 for VAT-inclusive pricing.
  const numerator = totalCents * READY_MADE_VAT_RATE;
  if (!Number.isSafeInteger(numerator)) return null;

  const taxCents = Math.floor(
    (numerator + READY_MADE_VAT_DENOMINATOR / 2) /
      READY_MADE_VAT_DENOMINATOR,
  );
  const vatableSalesCents = totalCents - taxCents;

  if (!isValidCents(taxCents) || !isValidCents(vatableSalesCents)) {
    return null;
  }

  return {
    vatRate: READY_MADE_VAT_RATE,
    subtotalCents,
    discountCents,
    deliveryFeeCents,
    vatableSalesCents,
    taxCents,
    totalCents,
  };
};

module.exports = {
  READY_MADE_VAT_RATE,
  computeReadyMadeVatInclusiveBreakdown,
};
