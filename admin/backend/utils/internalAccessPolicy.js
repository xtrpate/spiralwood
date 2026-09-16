"use strict";

const INTERNAL_ROLES = new Set(["admin", "staff"]);
const INTERNAL_STAFF_TYPES = new Set(["cashier", "indoor", "delivery_rider"]);
const ADMIN_AUTHORITIES = new Set(["manager", "admin"]);

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeInternalAccess = ({
  role,
  staffType,
  authorityLevel,
  defaultAuthority = null,
} = {}) => {
  const normalizedRole = normalize(role);
  const normalizedStaffType = normalize(staffType);
  const hasAuthorityInput =
    authorityLevel !== undefined &&
    authorityLevel !== null &&
    String(authorityLevel).trim() !== "";
  const requestedAuthority = normalize(authorityLevel);
  const fallbackAuthority = normalize(defaultAuthority);

  if (!INTERNAL_ROLES.has(normalizedRole)) {
    return {
      error: "Account type must be Manager or Staff.",
    };
  }

  if (normalizedRole === "staff") {
    if (!INTERNAL_STAFF_TYPES.has(normalizedStaffType)) {
      return {
        error: "Choose a valid staff role.",
      };
    }

    if (hasAuthorityInput && requestedAuthority !== "user") {
      return {
        error: "Staff accounts must use Standard access.",
      };
    }

    return {
      value: {
        role: "staff",
        authority_level: "user",
        staff_type: normalizedStaffType,
      },
    };
  }

  const authority = hasAuthorityInput
    ? requestedAuthority
    : ADMIN_AUTHORITIES.has(fallbackAuthority)
      ? fallbackAuthority
      : "manager";

  if (!ADMIN_AUTHORITIES.has(authority)) {
    return {
      error: "Management accounts must use Manager or Super Admin access.",
    };
  }

  return {
    value: {
      role: "admin",
      authority_level: authority,
      staff_type: null,
    },
  };
};

const isSuperAdminAccount = (account) =>
  normalize(account?.role) === "admin" &&
  normalize(account?.authority_level) === "admin";

const isManagerAccount = (account) =>
  normalize(account?.role) === "admin" &&
  normalize(account?.authority_level) === "manager";

const isStandardStaffAccount = (account) =>
  normalize(account?.role) === "staff" &&
  normalize(account?.authority_level || "user") === "user" &&
  INTERNAL_STAFF_TYPES.has(normalize(account?.staff_type));

const isInternalAccount = (account) =>
  normalize(account?.role) === "admin" || normalize(account?.role) === "staff";

const canManageInternalAccount = (actor, target) => {
  if (!isInternalAccount(target)) return false;
  if (isSuperAdminAccount(actor)) return true;
  return isManagerAccount(actor) && isStandardStaffAccount(target);
};

const canCreateInternalAccount = (actor, requestedAccount) => {
  if (isSuperAdminAccount(actor)) return isInternalAccount(requestedAccount);
  return isManagerAccount(actor) && isStandardStaffAccount(requestedAccount);
};

module.exports = {
  INTERNAL_STAFF_TYPES,
  normalizeInternalAccess,
  isSuperAdminAccount,
  isManagerAccount,
  isStandardStaffAccount,
  isInternalAccount,
  canManageInternalAccount,
  canCreateInternalAccount,
};
