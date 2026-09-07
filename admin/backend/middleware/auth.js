const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { writeAuditLogSafe } = require("./auditLog");
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
         is_verified,
         must_change_password
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

    const internalMustChange =
      (user.role === "admin" || user.role === "staff") &&
      Number(decoded.must_change_password) === 1 &&
      Number(user.must_change_password) === 1;
    const requestPath = String(req.originalUrl || req.path || "").split("?")[0];
    const passwordChangeAllowed =
      requestPath.endsWith("/auth/me") ||
      requestPath.endsWith("/auth/change-password");

    if (internalMustChange && !passwordChangeAllowed) {
      return res.status(403).json({
        message: "Change your temporary password before continuing.",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
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
  return async (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      await writeAuditLogSafe({
        userId: req.user?.id || null,
        action: "access_denied",
        tableName: "security",
        recordId: req.user?.id || null,
        newValues: {
          request_method: req.method,
          request_path: String(req.originalUrl || req.path || "").split("?")[0],
          user_role: req.user?.role || null,
          staff_type: req.user?.staff_type || null,
          required_roles: allowedRoles,
          reason: "role_not_allowed",
        },
        ipAddress: req.ip || null,
      });

      return res
        .status(403)
        .json({ message: "Forbidden. You lack the required permissions." });
    }
    next();
  };
}

function authorizeStaffType(...allowedTypes) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (req.user.role === "admin") {
      return next();
    }

    if (req.user.role !== "staff" || !allowedTypes.includes(req.user.staff_type)) {
      await writeAuditLogSafe({
        userId: req.user.id,
        action: "access_denied",
        tableName: "security",
        recordId: req.user.id,
        newValues: {
          request_method: req.method,
          request_path: String(req.originalUrl || req.path || "").split("?")[0],
          user_role: req.user.role,
          staff_type: req.user.staff_type || null,
          required_staff_types: allowedTypes,
          reason:
            req.user.role !== "staff"
              ? "staff_access_required"
              : "staff_assignment_not_allowed",
        },
        ipAddress: req.ip || null,
      });

      if (req.user.role !== "staff") {
        return res.status(403).json({ message: "Staff access required." });
      }

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
