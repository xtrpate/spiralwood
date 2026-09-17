// routes/customer.paymongo.js

const express = require("express");
const router = express.Router();

const {
  handlePaymongoWebhook,
} = require("../controllers/customer/customer.paymongo");

router.post("/webhook", handlePaymongoWebhook);

module.exports = router;
