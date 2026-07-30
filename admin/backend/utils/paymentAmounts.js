// utils/paymentAmounts.js - shared money-rounding and down-payment
// calculation, used identically by the customer PayMongo/down-payment
// flow and the admin/cashier Cash at Store recording flow. Do not
// duplicate any of these formulas elsewhere - import from here.
const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

// DECIMAL(12,2) ceiling, expressed in integer cents.
const MAX_DECIMAL_12_2_CENTS = 999999999999;

// Strictly parses a TRUSTED value (a database DECIMAL column -- which
// mysql2 may return as either a string or a number depending on driver
// configuration -- or a value already produced by
// roundMoney/calcDownPaymentAmount and stringified via .toFixed(2))
// into integer cents, using only string splitting and integer
// construction - never floating-point multiplication. Accepts zero.
// Rejects anything malformed, negative, over-precise, unsafe, or above
// the DECIMAL(12,2) column ceiling.
// Examples: "38626.25" -> 3862625, "11587.88" -> 1158788,
// "0.00" -> 0.
const parseDecimalToCentsStrict = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;

  const str = String(value).trim();
  if (str === "") return null;

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(str);
  if (!match) return null;

  const wholePart = match[1];
  const fractionPart = (match[2] || "").padEnd(2, "0");
  const centsStr = `${wholePart}${fractionPart}`;
  if (!/^\d+$/.test(centsStr)) return null;

  const cents = Number(centsStr);
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  if (cents > MAX_DECIMAL_12_2_CENTS) return null;

  return cents;
};

// Strict parsing for a SUBMITTED payment amount from a request body.
// UNLIKE parseDecimalToCentsStrict above, this REQUIRES a string input
// -- a raw JSON number (e.g. {"amount": 19313.13}) is rejected outright,
// specifically so a value can never be silently reshaped by JSON
// parsing (e.g. scientific-notation collapse) before this function ever
// sees it. Also requires strictly positive -- a payment of exactly zero
// is never valid, unlike a persisted balance/total which may
// legitimately be zero.
const parseStrictMoneyToCents = (value) => {
  if (typeof value !== "string") return null;
  const cents = parseDecimalToCentsStrict(value);
  if (cents === null || cents <= 0) return null;
  return { amountCents: cents, normalizedAmount: cents / 100 };
};

// Integer-cents back to a clean, exact two-decimal string - the only
// place division is used, and only for display/DB-parameter purposes
// on an already-integer value (never for a comparison). This is the
// value that must be used as the payment_transactions.amount DB
// parameter -- never a floating-point normalizedAmount.
const centsToDecimalString = (cents) => {
  const safeCents = Math.trunc(Number(cents) || 0);
  const negative = safeCents < 0;
  const abs = Math.abs(safeCents);
  const wholePart = Math.trunc(abs / 100);
  const fracPart = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${wholePart}.${fracPart}`;
};

const centsToAmount = (cents) => Number(centsToDecimalString(cents));

// Exact 30% down payment, computed entirely in integer cents -- never
// via floating-point multiplication (total * 0.3), which can land
// exactly on a .5-cent boundary (e.g. 31682.25 * 0.3 = 9504.675) and
// then round the wrong way depending on binary floating-point
// representation. total is strictly converted to cents first (via
// parseDecimalToCentsStrict, reusing the exact same strict parsing
// used everywhere else in this file -- accepts both a string and a
// number, since this function is called with both from different
// call sites), then 30% is computed as (totalCents * 30) / 100,
// rounded half-up to the nearest whole cent using pure integer
// arithmetic. totalCents is always a safe integer bounded by
// MAX_DECIMAL_12_2_CENTS, so totalCents * 30 (at most ~3x10^13)
// cannot lose precision as a JS number. Returns 0 for any invalid or
// non-positive total, matching the previous implementation's safe
// fallback behavior.
const calcDownPaymentAmount = (total) => {
  const totalCents = parseDecimalToCentsStrict(total);
  if (totalCents === null || totalCents <= 0) return 0;

  const requiredCents = Math.floor((totalCents * 30 + 50) / 100);

  return centsToAmount(requiredCents);
};

module.exports = {
  roundMoney,
  calcDownPaymentAmount,
  parseDecimalToCentsStrict,
  parseStrictMoneyToCents,
  centsToDecimalString,
  centsToAmount,
};