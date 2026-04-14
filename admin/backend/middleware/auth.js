const jwt = require("jsonwebtoken");
const pool = require("../config/db");
require("dotenv").config();

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res
        .status(401)
        .json({ message: "Authentication required. No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [[user]] = await pool.query(
      `SELECT
         id,
         name,
         email,
         role,
         staff_type,
         is_active,
         is_verified
       FROM users
       WHERE id = ?`,
      [decoded.id],
    );

    if (!user) {
      return res.status(401).json({ message: "Account not found." });
    }

    if (!user.is_active) {
      return res
        .status(403)
        .json({ message: "Account deactivated. Contact support." });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Session expired. Please log in again." });
    }

    return res.status(401).json({ message: "Invalid token." });
  }
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Forbidden. You lack the required permissions." });
    }
    next();
  };
}

function authorizeStaffType(...allowedTypes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (req.user.role === "admin") {
      return next();
    }

    if (req.user.role !== "staff") {
      return res.status(403).json({ message: "Staff access required." });
    }

    if (!allowedTypes.includes(req.user.staff_type)) {
      return res.status(403).json({
        message: "Forbidden. You do not have the correct staff assignment.",
      });
    }

    next();
  };
}

const requireStaffOrAdmin = authorize("admin", "staff");
const requireCustomer = authorize("customer");

const requireCashierOrAdmin = authorizeStaffType("cashier");
const requireIndoorStaffOrAdmin = authorizeStaffType("indoor");
const requireDeliveryRiderOrAdmin = authorizeStaffType("delivery_rider");

module.exports = {
  authenticate,
  authorize,
  authorizeStaffType,
  requireStaffOrAdmin,
  requireCustomer,
  requireCashierOrAdmin,
  requireIndoorStaffOrAdmin,
  requireDeliveryRiderOrAdmin,
};