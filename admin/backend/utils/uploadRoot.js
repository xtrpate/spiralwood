"use strict";

const path = require("path");

const backendRoot = path.join(__dirname, "..");

const getUploadsRoot = () => {
  const configured = String(process.env.UPLOAD_DIR || "").trim();

  if (!configured) {
    return path.join(backendRoot, "uploads");
  }

  return path.isAbsolute(configured)
    ? configured
    : path.join(backendRoot, configured);
};

module.exports = { getUploadsRoot };
