// utils/paymentAmounts.js - shared money-rounding and down-payment
// calculation, used identically by the customer PayMongo/down-payment
// flow and the admin Cash-at-Store recording flow. Do not duplicate this
// formula elsewhere - import from here.
const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calcDownPaymentAmount = (total) => roundMoney(roundMoney(total) * 0.3);

module.exports = { roundMoney, calcDownPaymentAmount };