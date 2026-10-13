const express = require("express");
const router = express.Router();

const sitemapController = require("../controllers/admin/sitemapController");

router.get("/sitemap.xml", sitemapController.getSitemap);

module.exports = router;
