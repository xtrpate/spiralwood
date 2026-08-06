const express = require("express");
const {
  authenticate,
  requireCustomer,
} = require("../middleware/auth");
const appendCustomerOversizedDeliveryQuote = require(
  "../middleware/appendCustomerOversizedDeliveryQuote",
);

const router = express.Router();

router.get(
  "/:id",
  authenticate,
  requireCustomer,
  appendCustomerOversizedDeliveryQuote,
  (req, res, next) => next(),
);

module.exports = router;
