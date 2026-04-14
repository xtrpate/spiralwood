const express = require("express");
const router = express.Router();
const productController = require("../controllers/customer/customer.products");

// public catalog + public product detail
router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProductById);

module.exports = router;