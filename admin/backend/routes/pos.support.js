const express = require("express");

const router = express.Router();

const authenticate = require("../middleware/authenticate");

const supportController = require("../controllers/staff/pos.support");

router.get("/", authenticate, supportController.getAssignedTickets);

module.exports = router;
