// utils/phone.js — shared Philippine mobile normalization for WISDOM
const stripPhoneFormatting = (value) =>
  String(value || "")
    .trim()
    .replace(/[^0-9+]/g, "")
    .replace(/^\+/, "");

const normalizePhilippinePhone = (phone) => {
  const digits = stripPhoneFormatting(phone);

  if (/^09\d{9}$/.test(digits)) {
    return `63${digits.slice(1)}`;
  }

  if (/^639\d{9}$/.test(digits)) {
    return digits;
  }

  if (/^9\d{9}$/.test(digits)) {
    return `63${digits}`;
  }

  const error = new Error("Invalid Philippine mobile number.");
  error.code = "INVALID_PH_PHONE";
  throw error;
};

const getPhoneLookupVariants = (canonicalPhone) => {
  const canonical = normalizePhilippinePhone(canonicalPhone);
  return [canonical, `0${canonical.slice(2)}`, canonical.slice(2)];
};

// Normalizes common legacy DB formatting (+63, spaces, dashes, parentheses,
// dots) to digits before comparing against canonical/local variants.
const phoneDigitsSql = (column = "phone") =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')`;

module.exports = {
  normalizePhilippinePhone,
  getPhoneLookupVariants,
  phoneDigitsSql,
};
